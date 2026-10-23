"""
schemas.py — Pydantic response models for the API.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


# ── /api/health ───────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str


# ── /api/meta ─────────────────────────────────────────────────────────

class MetaResponse(BaseModel):
    data_start: str
    data_end: str
    delivery_days: List[str]
    default_cutoff_hour: int
    horizon_max_h: float
    n_actual_rows: int
    n_forecast_rows: int
    snapshot_created_at: Optional[str] = None


# ── /api/forecast ─────────────────────────────────────────────────────

class ForecastSeriesItem(BaseModel):
    start_time: str
    forecast_mw: float
    publish_time: str
    horizon_h: float
    actual_mw: Optional[float] = None
    band_lower_mw: Optional[float] = None
    band_upper_mw: Optional[float] = None


class ForecastCoverage(BaseModel):
    expected_slots: int
    forecast_slots: int


class ForecastResponse(BaseModel):
    delivery_date: str
    cutoff_time: str
    series: List[ForecastSeriesItem]
    coverage: ForecastCoverage
    latest_publish_time: Optional[str] = None


# ── /api/accuracy ─────────────────────────────────────────────────────

class OverallMetrics(BaseModel):
    n: int
    ME: Optional[float] = None
    MAE: Optional[float] = None
    RMSE: Optional[float] = None
    nMAE_pct: Optional[float] = None
    P90_abs_error: Optional[float] = None
    P95_abs_error: Optional[float] = None
    max_over_forecast: Optional[float] = None
    max_under_forecast: Optional[float] = None


class HorizonBin(BaseModel):
    bin: str
    n: int
    ME: float
    MAE: float
    RMSE: float


class HourBin(BaseModel):
    hour: int
    n: int
    ME: float
    MAE: float


class DailyBin(BaseModel):
    date: str
    n: int
    ME: float
    MAE: float


class ErrorHistogramBin(BaseModel):
    bin_start: int
    bin_end: int
    count: int


class AccuracyParams(BaseModel):
    start_date: str
    end_date: str
    cutoff_hour: int


class AccuracyResponse(BaseModel):
    params: AccuracyParams
    overall: OverallMetrics
    by_horizon: List[HorizonBin]
    by_hour: List[HourBin]
    daily: List[DailyBin]
    error_histogram: List[ErrorHistogramBin]
