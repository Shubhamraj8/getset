"""
analysis.py — Pure analytical functions for wind forecast evaluation.

All functions take DataFrames and scalars as inputs, return DataFrames or dicts.
No side effects, no global state — designed for testability.

Key conventions:
  - error = forecast_mw − actual_mw  (positive = over-forecast)
  - horizon_h = (start_time − publish_time) in hours
  - Actuals are aggregated to hourly mean before comparison (D6 = A)
  - cutoff comparison: publish_time <= cutoff  (inclusive boundary)
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .config import DEFAULT_CUTOFF_HOUR, ERROR_HIST_BIN_WIDTH_MW, HORIZON_BIN_SIZE_H


# ─── Actuals aggregation (D6 = A: hourly mean) ───────────────────────


def aggregate_actuals_to_hourly(actuals: pd.DataFrame) -> pd.DataFrame:
    """Aggregate half-hourly actuals to hourly mean MW.

    Groups by the floor-hour of start_time and averages the two half-hour
    values.  Returns columns: start_time (hour, UTC), actual_mw.
    """
    df = actuals.copy()
    df["hour"] = df["start_time"].dt.floor("h")
    hourly = (
        df.groupby("hour")["actual_mw"]
        .mean()
        .reset_index()
        .rename(columns={"hour": "start_time"})
    )
    return hourly


# ─── Latest forecast at decision time ────────────────────────────────


def latest_forecast_at_cutoff(
    forecasts: pd.DataFrame,
    delivery_date: str,
    cutoff_hour: int = DEFAULT_CUTOFF_HOUR,
) -> pd.DataFrame:
    """Select the latest forecast published ≤ cutoff for each hour of delivery_date.

    Args:
        forecasts: Full forecasts DataFrame (start_time, publish_time, forecast_mw, horizon_h).
        delivery_date: 'YYYY-MM-DD' delivery day.
        cutoff_hour: Hour on D-1 when the decision is made.

    Returns:
        DataFrame with one row per target hour on delivery_date, columns:
        start_time, publish_time, forecast_mw, horizon_h.
        Hours with no available forecast have no row (gaps).
    """
    d = pd.Timestamp(delivery_date, tz=timezone.utc)
    cutoff = d - timedelta(days=1) + timedelta(hours=cutoff_hour)

    # Target hours: 00:00 to 23:00 UTC on delivery day (24 slots for hourly)
    day_start = d
    day_end = d + timedelta(hours=23)

    mask = (
        (forecasts["start_time"] >= day_start)
        & (forecasts["start_time"] <= day_end)
        & (forecasts["publish_time"] <= cutoff)
    )
    eligible = forecasts.loc[mask].copy()

    if eligible.empty:
        return pd.DataFrame(columns=["start_time", "publish_time", "forecast_mw", "horizon_h"])

    # For each target hour, pick the forecast with the latest publish_time
    idx = eligible.groupby("start_time")["publish_time"].idxmax()
    result = eligible.loc[idx].sort_values("start_time").reset_index(drop=True)

    return result[["start_time", "publish_time", "forecast_mw", "horizon_h"]]


# ─── Accuracy dataset (decision-time basis) ──────────────────────────


def build_accuracy_frame(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    delivery_dates: List[str],
    cutoff_hour: int = DEFAULT_CUTOFF_HOUR,
) -> pd.DataFrame:
    """Build joined accuracy frame for a list of delivery dates.

    For each delivery date, selects the latest-at-cutoff forecast per hour,
    joins with hourly actuals, computes error = forecast − actual.

    Returns DataFrame with columns:
        start_time, publish_time, forecast_mw, horizon_h, actual_mw, error_mw
    Rows where either forecast or actual is missing are excluded.
    """
    hourly_actuals = aggregate_actuals_to_hourly(actuals)

    frames = []
    for dd in delivery_dates:
        fc = latest_forecast_at_cutoff(forecasts, dd, cutoff_hour)
        if fc.empty:
            continue
        merged = fc.merge(hourly_actuals, on="start_time", how="inner")
        frames.append(merged)

    if not frames:
        return pd.DataFrame(
            columns=["start_time", "publish_time", "forecast_mw", "horizon_h", "actual_mw", "error_mw"]
        )

    result = pd.concat(frames, ignore_index=True)
    result["error_mw"] = result["forecast_mw"] - result["actual_mw"]
    return result


# ─── Metrics computation ─────────────────────────────────────────────


def compute_metrics(df: pd.DataFrame) -> Dict[str, Any]:
    """Compute accuracy metrics from an accuracy frame.

    Args:
        df: DataFrame with columns error_mw, actual_mw (non-null pairs only).

    Returns dict with: n, ME, MAE, RMSE, nMAE_pct, P90_abs_error,
        P95_abs_error, max_over_forecast, max_under_forecast.
    """
    if df.empty or "error_mw" not in df.columns:
        return {
            "n": 0, "ME": None, "MAE": None, "RMSE": None, "nMAE_pct": None,
            "P90_abs_error": None, "P95_abs_error": None,
            "max_over_forecast": None, "max_under_forecast": None,
        }

    errors = df["error_mw"].dropna()
    actuals = df["actual_mw"].dropna()
    n = len(errors)

    if n == 0:
        return {
            "n": 0, "ME": None, "MAE": None, "RMSE": None, "nMAE_pct": None,
            "P90_abs_error": None, "P95_abs_error": None,
            "max_over_forecast": None, "max_under_forecast": None,
        }

    abs_errors = errors.abs()
    me = float(errors.mean())
    mae = float(abs_errors.mean())
    rmse = float(np.sqrt((errors ** 2).mean()))
    mean_actual = float(actuals.mean())
    nmae_pct = (mae / mean_actual * 100) if mean_actual != 0 else None

    return {
        "n": int(n),
        "ME": round(me, 2),
        "MAE": round(mae, 2),
        "RMSE": round(rmse, 2),
        "nMAE_pct": round(nmae_pct, 2) if nmae_pct is not None else None,
        "P90_abs_error": round(float(abs_errors.quantile(0.90)), 2),
        "P95_abs_error": round(float(abs_errors.quantile(0.95)), 2),
        "max_over_forecast": round(float(errors.max()), 2),
        "max_under_forecast": round(float(errors.min()), 2),
    }


# ─── Breakdowns ──────────────────────────────────────────────────────


def by_horizon(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    bin_size_h: int = HORIZON_BIN_SIZE_H,
) -> List[Dict[str, Any]]:
    """Accuracy by forecast horizon bin, using ALL forecasts (not just decision-time).

    Groups forecasts into horizon bins (0-6h, 6-12h, etc.), joins each with
    hourly actuals, computes ME, MAE, RMSE per bin.
    """
    hourly_actuals = aggregate_actuals_to_hourly(actuals)

    merged = forecasts.merge(hourly_actuals, on="start_time", how="inner")
    if merged.empty:
        return []

    merged["error_mw"] = merged["forecast_mw"] - merged["actual_mw"]

    max_h = merged["horizon_h"].max()
    bins = list(range(0, int(max_h) + bin_size_h + 1, bin_size_h))
    labels = [f"{bins[i]}-{bins[i+1]}" for i in range(len(bins) - 1)]

    merged["horizon_bin"] = pd.cut(merged["horizon_h"], bins=bins, labels=labels, right=False)

    results = []
    for label in labels:
        group = merged[merged["horizon_bin"] == label]
        if group.empty:
            continue
        errors = group["error_mw"]
        results.append({
            "bin": label,
            "n": int(len(errors)),
            "ME": round(float(errors.mean()), 2),
            "MAE": round(float(errors.abs().mean()), 2),
            "RMSE": round(float(np.sqrt((errors ** 2).mean())), 2),
        })
    return results


def by_hour(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Accuracy by hour of day (0–23) from an accuracy frame (decision-time basis)."""
    if df.empty:
        return []

    df = df.copy()
    df["hour"] = df["start_time"].dt.hour

    results = []
    for h in range(24):
        group = df[df["hour"] == h]
        if group.empty:
            continue
        errors = group["error_mw"]
        results.append({
            "hour": int(h),
            "n": int(len(errors)),
            "ME": round(float(errors.mean()), 2),
            "MAE": round(float(errors.abs().mean()), 2),
        })
    return results


def daily(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Daily MAE and bias (ME) from an accuracy frame (decision-time basis)."""
    if df.empty:
        return []

    df = df.copy()
    df["date"] = df["start_time"].dt.strftime("%Y-%m-%d")

    results = []
    for date_str, group in sorted(df.groupby("date")):
        errors = group["error_mw"]
        results.append({
            "date": str(date_str),
            "n": int(len(errors)),
            "ME": round(float(errors.mean()), 2),
            "MAE": round(float(errors.abs().mean()), 2),
        })
    return results


def error_histogram(
    df: pd.DataFrame,
    bin_width: int = ERROR_HIST_BIN_WIDTH_MW,
) -> List[Dict[str, Any]]:
    """Histogram of forecast errors (decision-time basis)."""
    if df.empty or "error_mw" not in df.columns:
        return []

    errors = df["error_mw"].dropna()
    if errors.empty:
        return []

    min_e = int(np.floor(errors.min() / bin_width) * bin_width)
    max_e = int(np.ceil(errors.max() / bin_width) * bin_width)

    bins = list(range(min_e, max_e + bin_width + 1, bin_width))
    counts, edges = np.histogram(errors, bins=bins)

    results = []
    for i in range(len(counts)):
        results.append({
            "bin_start": int(edges[i]),
            "bin_end": int(edges[i + 1]),
            "count": int(counts[i]),
        })
    return results


# ─── Helpers for API layer ───────────────────────────────────────────


def get_delivery_dates(start: str, end: str) -> List[str]:
    """Generate list of delivery date strings between start and end inclusive."""
    s = pd.Timestamp(start)
    e = pd.Timestamp(end)
    return [d.strftime("%Y-%m-%d") for d in pd.date_range(s, e, freq="D")]
