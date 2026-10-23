"""
test_analysis.py — Unit tests for core analysis logic.

Tests cover:
  - Latest-at-cutoff selection (picks latest publish ≤ cutoff, ignores after)
  - Cutoff boundary: forecast published exactly at cutoff IS included
  - Horizon calculation
  - Metrics on a hand-computed example (ME sign convention, MAE, RMSE)
  - Missing slots stay null (no fill)
  - Actuals hourly aggregation
"""

import numpy as np
import pandas as pd
import pytest
from datetime import timezone

# We import from the module directly (not via data_loader to avoid needing data files)
import sys
from pathlib import Path

# Add backend to path so we can import app.analysis
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.analysis import (
    aggregate_actuals_to_hourly,
    build_accuracy_frame,
    by_horizon,
    by_hour,
    compute_metrics,
    daily,
    error_histogram,
    get_delivery_dates,
    latest_forecast_at_cutoff,
)


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def sample_forecasts():
    """Create a small forecast DataFrame for testing.

    Delivery date: 2026-01-05
    Cutoff: 2026-01-04 09:00 UTC

    Three forecasts for the 10:00 target hour:
      - Published 2026-01-04 07:30 (before cutoff, horizon=26.5h)
      - Published 2026-01-04 09:00 (exactly at cutoff, horizon=25h) ← should be picked
      - Published 2026-01-04 09:30 (after cutoff, horizon=24.5h) ← should be excluded
    """
    rows = [
        # Target 10:00, three competing forecasts
        {"start_time": "2026-01-05T10:00:00Z", "publish_time": "2026-01-04T07:30:00Z", "forecast_mw": 5000, "horizon_h": 26.5},
        {"start_time": "2026-01-05T10:00:00Z", "publish_time": "2026-01-04T09:00:00Z", "forecast_mw": 5500, "horizon_h": 25.0},
        {"start_time": "2026-01-05T10:00:00Z", "publish_time": "2026-01-04T09:30:00Z", "forecast_mw": 5800, "horizon_h": 24.5},
        # Target 11:00, only one before cutoff
        {"start_time": "2026-01-05T11:00:00Z", "publish_time": "2026-01-04T04:30:00Z", "forecast_mw": 6000, "horizon_h": 30.5},
        # Target 14:00, no forecast before cutoff (only after)
        {"start_time": "2026-01-05T14:00:00Z", "publish_time": "2026-01-04T10:00:00Z", "forecast_mw": 7000, "horizon_h": 28.0},
    ]
    df = pd.DataFrame(rows)
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    return df


@pytest.fixture
def sample_actuals():
    """Half-hourly actuals for 2026-01-05 10:00 and 10:30, 11:00 and 11:30."""
    rows = [
        {"start_time": "2026-01-05T10:00:00Z", "actual_mw": 4800},
        {"start_time": "2026-01-05T10:30:00Z", "actual_mw": 5200},
        {"start_time": "2026-01-05T11:00:00Z", "actual_mw": 5900},
        {"start_time": "2026-01-05T11:30:00Z", "actual_mw": 6100},
    ]
    df = pd.DataFrame(rows)
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    return df


# ── Tests ─────────────────────────────────────────────────────────────


class TestLatestForecastAtCutoff:
    """Tests for latest_forecast_at_cutoff."""

    def test_picks_latest_before_cutoff(self, sample_forecasts):
        """Should pick the 09:00 forecast (latest ≤ cutoff), not the 07:30 one."""
        result = latest_forecast_at_cutoff(sample_forecasts, "2026-01-05", cutoff_hour=9)
        row_10 = result[result["start_time"] == pd.Timestamp("2026-01-05T10:00:00Z")]
        assert len(row_10) == 1
        assert float(row_10["forecast_mw"].iloc[0]) == 5500  # the 09:00 forecast

    def test_excludes_forecast_after_cutoff(self, sample_forecasts):
        """The 09:30 forecast (after cutoff) should NOT be selected."""
        result = latest_forecast_at_cutoff(sample_forecasts, "2026-01-05", cutoff_hour=9)
        row_10 = result[result["start_time"] == pd.Timestamp("2026-01-05T10:00:00Z")]
        assert float(row_10["forecast_mw"].iloc[0]) != 5800  # the 09:30 forecast

    def test_cutoff_boundary_inclusive(self, sample_forecasts):
        """Forecast published exactly at cutoff time IS included (≤ not <)."""
        result = latest_forecast_at_cutoff(sample_forecasts, "2026-01-05", cutoff_hour=9)
        row_10 = result[result["start_time"] == pd.Timestamp("2026-01-05T10:00:00Z")]
        # Publish time should be exactly 09:00
        assert row_10["publish_time"].iloc[0] == pd.Timestamp("2026-01-04T09:00:00Z")

    def test_missing_slot_not_filled(self, sample_forecasts):
        """Target hour 14:00 has no forecast before cutoff → should not appear."""
        result = latest_forecast_at_cutoff(sample_forecasts, "2026-01-05", cutoff_hour=9)
        row_14 = result[result["start_time"] == pd.Timestamp("2026-01-05T14:00:00Z")]
        assert len(row_14) == 0  # gap, not filled

    def test_single_forecast_before_cutoff(self, sample_forecasts):
        """Target hour 11:00 has only one forecast before cutoff → should be selected."""
        result = latest_forecast_at_cutoff(sample_forecasts, "2026-01-05", cutoff_hour=9)
        row_11 = result[result["start_time"] == pd.Timestamp("2026-01-05T11:00:00Z")]
        assert len(row_11) == 1
        assert float(row_11["forecast_mw"].iloc[0]) == 6000


class TestHorizonCalculation:
    """Tests for horizon values."""

    def test_horizon_values(self, sample_forecasts):
        """Verify horizon_h = (start_time - publish_time) in hours."""
        row = sample_forecasts.iloc[0]
        expected_h = (row["start_time"] - row["publish_time"]).total_seconds() / 3600
        assert row["horizon_h"] == expected_h

    def test_horizon_at_cutoff(self, sample_forecasts):
        """Forecast at cutoff: horizon = 10:00 - 09:00 = 25h (next day)."""
        result = latest_forecast_at_cutoff(sample_forecasts, "2026-01-05", cutoff_hour=9)
        row_10 = result[result["start_time"] == pd.Timestamp("2026-01-05T10:00:00Z")]
        assert float(row_10["horizon_h"].iloc[0]) == 25.0


class TestAggregateActuals:
    """Tests for aggregate_actuals_to_hourly."""

    def test_aggregates_two_halfhours(self, sample_actuals):
        """10:00 and 10:30 → hourly mean at 10:00."""
        hourly = aggregate_actuals_to_hourly(sample_actuals)
        row_10 = hourly[hourly["start_time"] == pd.Timestamp("2026-01-05T10:00:00Z")]
        assert len(row_10) == 1
        # Mean of 4800 and 5200 = 5000
        assert float(row_10["actual_mw"].iloc[0]) == 5000.0

    def test_aggregates_to_correct_count(self, sample_actuals):
        """4 half-hourly records → 2 hourly records."""
        hourly = aggregate_actuals_to_hourly(sample_actuals)
        assert len(hourly) == 2


class TestMetrics:
    """Tests for compute_metrics with hand-computed values."""

    def test_hand_computed_metrics(self):
        """
        Hand-computed example:
          forecast: [5500, 6000]
          actual:   [5000, 6000]
          error:    [500,  0]   (positive = over-forecast)

          ME   = (500 + 0) / 2 = 250
          MAE  = (500 + 0) / 2 = 250
          RMSE = sqrt((500^2 + 0^2) / 2) = sqrt(125000) ≈ 353.55
        """
        df = pd.DataFrame({
            "forecast_mw": [5500, 6000],
            "actual_mw": [5000, 6000],
            "error_mw": [500, 0],
        })
        m = compute_metrics(df)

        assert m["n"] == 2
        assert m["ME"] == 250.0  # positive bias = over-forecast
        assert m["MAE"] == 250.0
        assert m["RMSE"] == pytest.approx(353.55, abs=0.01)

    def test_sign_convention_under_forecast(self):
        """Negative ME → under-forecast (actual > forecast)."""
        df = pd.DataFrame({
            "forecast_mw": [4000],
            "actual_mw": [5000],
            "error_mw": [-1000],
        })
        m = compute_metrics(df)
        assert m["ME"] == -1000.0
        assert m["max_under_forecast"] == -1000.0

    def test_sign_convention_over_forecast(self):
        """Positive ME → over-forecast (forecast > actual)."""
        df = pd.DataFrame({
            "forecast_mw": [6000],
            "actual_mw": [5000],
            "error_mw": [1000],
        })
        m = compute_metrics(df)
        assert m["ME"] == 1000.0
        assert m["max_over_forecast"] == 1000.0

    def test_empty_dataframe(self):
        """Empty frame returns n=0, all None."""
        m = compute_metrics(pd.DataFrame())
        assert m["n"] == 0
        assert m["MAE"] is None

    def test_nmae_pct(self):
        """nMAE_pct = MAE / mean(actual) * 100."""
        df = pd.DataFrame({
            "forecast_mw": [5500, 6000],
            "actual_mw": [5000, 5000],
            "error_mw": [500, 1000],
        })
        m = compute_metrics(df)
        # MAE = 750, mean(actual) = 5000, nMAE = 750/5000*100 = 15.0%
        assert m["nMAE_pct"] == 15.0


class TestBuildAccuracyFrame:
    """Tests for build_accuracy_frame."""

    def test_joins_correctly(self, sample_forecasts, sample_actuals):
        """Should join forecasts with hourly actuals, compute error."""
        acc = build_accuracy_frame(
            sample_forecasts, sample_actuals,
            delivery_dates=["2026-01-05"],
            cutoff_hour=9,
        )
        # Should have rows for 10:00 and 11:00 (14:00 had no forecast before cutoff)
        assert len(acc) == 2
        assert "error_mw" in acc.columns

        # Check error for 10:00: forecast 5500, actual mean(4800,5200)=5000 → error=500
        row_10 = acc[acc["start_time"] == pd.Timestamp("2026-01-05T10:00:00Z")]
        assert float(row_10["error_mw"].iloc[0]) == 500.0


class TestBreakdowns:
    """Tests for breakdown functions."""

    def test_by_hour_returns_hours(self, sample_forecasts, sample_actuals):
        """by_hour should return entries for hours 10 and 11."""
        acc = build_accuracy_frame(
            sample_forecasts, sample_actuals,
            delivery_dates=["2026-01-05"],
            cutoff_hour=9,
        )
        result = by_hour(acc)
        hours = [r["hour"] for r in result]
        assert 10 in hours
        assert 11 in hours

    def test_daily_returns_date(self, sample_forecasts, sample_actuals):
        """daily should return an entry for 2026-01-05."""
        acc = build_accuracy_frame(
            sample_forecasts, sample_actuals,
            delivery_dates=["2026-01-05"],
            cutoff_hour=9,
        )
        result = daily(acc)
        assert len(result) == 1
        assert result[0]["date"] == "2026-01-05"

    def test_error_histogram_non_empty(self, sample_forecasts, sample_actuals):
        """error_histogram should return at least one bin."""
        acc = build_accuracy_frame(
            sample_forecasts, sample_actuals,
            delivery_dates=["2026-01-05"],
            cutoff_hour=9,
        )
        result = error_histogram(acc, bin_width=500)
        assert len(result) > 0


class TestGetDeliveryDates:
    """Tests for get_delivery_dates helper."""

    def test_inclusive_range(self):
        dates = get_delivery_dates("2026-01-02", "2026-01-05")
        assert dates == ["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"]

    def test_single_day(self):
        dates = get_delivery_dates("2026-01-10", "2026-01-10")
        assert dates == ["2026-01-10"]
