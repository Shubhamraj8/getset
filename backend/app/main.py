"""
main.py — FastAPI application with /api endpoints for wind forecast monitoring.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import analysis
from .config import DEFAULT_CUTOFF_HOUR, DELIVERY_END, DELIVERY_START
from .data_loader import ACTUALS_DF, FORECASTS_DF, SNAPSHOT_META
from .schemas import (
    AccuracyParams,
    AccuracyResponse,
    ForecastCoverage,
    ForecastResponse,
    ForecastSeriesItem,
    HealthResponse,
    MetaResponse,
    OverallMetrics,
)

app = FastAPI(
    title="getset — UK Wind Forecast Monitor",
    description="API for evaluating Elexon BMRS wind generation forecasts (January 2026)",
    version="1.0.0",
)

# CORS for local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pre-compute delivery days list and historical error quantiles (for D3 = A error band)
ALL_DELIVERY_DAYS = analysis.get_delivery_dates(DELIVERY_START, DELIVERY_END)
HORIZON_ERROR_QUANTILES = analysis.compute_horizon_error_quantiles(FORECASTS_DF, ACTUALS_DF)


def _validate_delivery_date(delivery_date: str) -> None:
    """Raise 400 if delivery_date is outside the valid window."""
    if delivery_date not in ALL_DELIVERY_DAYS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"delivery_date '{delivery_date}' is outside the valid window "
                f"({DELIVERY_START} to {DELIVERY_END}). "
                f"Only delivery days for decisions made in January 2026 are available."
            ),
        )


def _validate_cutoff_hour(cutoff_hour: int) -> None:
    """Raise 422 if cutoff_hour is out of range."""
    if not (0 <= cutoff_hour <= 23):
        raise HTTPException(
            status_code=422,
            detail=f"cutoff_hour must be between 0 and 23, got {cutoff_hour}.",
        )


def _validate_date_range(start_date: str, end_date: str) -> None:
    """Raise 400 if date range is invalid or outside the window."""
    try:
        s = datetime.strptime(start_date, "%Y-%m-%d")
        e = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Dates must be in YYYY-MM-DD format.",
        )
    if s > e:
        raise HTTPException(status_code=400, detail="start_date must be ≤ end_date.")
    if start_date < DELIVERY_START or end_date > DELIVERY_END:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Date range must be within {DELIVERY_START} to {DELIVERY_END}."
            ),
        )


# ── Endpoints ─────────────────────────────────────────────────────────


@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok")


@app.get("/api/meta", response_model=MetaResponse)
def meta():
    horizon_max = float(FORECASTS_DF["horizon_h"].max()) if not FORECASTS_DF.empty else 0.0
    return MetaResponse(
        data_start=DELIVERY_START,
        data_end=DELIVERY_END,
        delivery_days=ALL_DELIVERY_DAYS,
        default_cutoff_hour=DEFAULT_CUTOFF_HOUR,
        horizon_max_h=horizon_max,
        n_actual_rows=len(ACTUALS_DF),
        n_forecast_rows=len(FORECASTS_DF),
        snapshot_created_at=SNAPSHOT_META.get("created_at"),
    )


@app.get("/api/forecast", response_model=ForecastResponse)
def forecast(
    delivery_date: str = Query(..., description="Delivery day (YYYY-MM-DD)"),
    cutoff_hour: int = Query(DEFAULT_CUTOFF_HOUR, ge=0, le=23, description="Decision cutoff hour on D-1 (0–23 UTC)"),
):
    _validate_delivery_date(delivery_date)
    _validate_cutoff_hour(cutoff_hour)

    d = datetime.strptime(delivery_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    cutoff_time = d - timedelta(days=1) + timedelta(hours=cutoff_hour)

    fc = analysis.latest_forecast_at_cutoff(FORECASTS_DF, delivery_date, cutoff_hour)

    # Also fetch hourly actuals for hindsight overlay
    hourly_actuals = analysis.aggregate_actuals_to_hourly(ACTUALS_DF)

    series = []
    for _, row in fc.iterrows():
        actual_match = hourly_actuals[hourly_actuals["start_time"] == row["start_time"]]
        actual_mw = float(actual_match["actual_mw"].iloc[0]) if not actual_match.empty else None

        # Historical error band (D3 = A)
        h_bin = analysis.get_horizon_bin_label(float(row["horizon_h"]))
        quantiles = HORIZON_ERROR_QUANTILES.get(h_bin)
        band_lower = None
        band_upper = None
        if quantiles is not None:
            p10, p90 = quantiles
            b1 = max(0.0, round(float(row["forecast_mw"]) + p10, 1))
            b2 = max(0.0, round(float(row["forecast_mw"]) + p90, 1))
            band_lower = min(b1, b2)
            band_upper = max(b1, b2)

        series.append(
            ForecastSeriesItem(
                start_time=row["start_time"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                forecast_mw=float(row["forecast_mw"]),
                publish_time=row["publish_time"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                horizon_h=round(float(row["horizon_h"]), 2),
                actual_mw=actual_mw,
                band_lower_mw=band_lower,
                band_upper_mw=band_upper,
            )
        )

    latest_pub = fc["publish_time"].max() if not fc.empty else None

    return ForecastResponse(
        delivery_date=delivery_date,
        cutoff_time=cutoff_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        series=series,
        coverage=ForecastCoverage(
            expected_slots=24,  # hourly, 24 hours
            forecast_slots=len(series),
        ),
        latest_publish_time=latest_pub.strftime("%Y-%m-%dT%H:%M:%SZ") if latest_pub is not None else None,
    )


@app.get("/api/accuracy", response_model=AccuracyResponse)
def accuracy(
    start_date: str = Query(DELIVERY_START, description="Start delivery date (YYYY-MM-DD)"),
    end_date: str = Query(DELIVERY_END, description="End delivery date (YYYY-MM-DD)"),
    cutoff_hour: int = Query(DEFAULT_CUTOFF_HOUR, ge=0, le=23, description="Decision cutoff hour (0–23 UTC)"),
):
    _validate_date_range(start_date, end_date)
    _validate_cutoff_hour(cutoff_hour)

    delivery_dates = analysis.get_delivery_dates(start_date, end_date)
    acc_df = analysis.build_accuracy_frame(FORECASTS_DF, ACTUALS_DF, delivery_dates, cutoff_hour)

    overall = analysis.compute_metrics(acc_df)
    horizon_data = analysis.by_horizon(FORECASTS_DF, ACTUALS_DF)
    hour_data = analysis.by_hour(acc_df)
    daily_data = analysis.daily(acc_df)
    hist_data = analysis.error_histogram(acc_df)

    return AccuracyResponse(
        params=AccuracyParams(
            start_date=start_date,
            end_date=end_date,
            cutoff_hour=cutoff_hour,
        ),
        overall=OverallMetrics(**overall),
        by_horizon=horizon_data,
        by_hour=hour_data,
        daily=daily_data,
        error_histogram=hist_data,
    )
