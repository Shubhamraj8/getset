"""
fetch_data.py - Fetch, validate, and normalize Elexon BMRS WIND data.

Datasets:
  - FUELHH (actual wind outturn, half-hourly)
  - WINDFOR (wind generation forecast, hourly)

Outputs:
  - backend/data/processed/actuals_wind.csv.gz
  - backend/data/processed/forecasts_wind.csv.gz
  - backend/data/processed/snapshot_meta.json
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import pandas as pd

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
FUELHH_ENDPOINT = f"{BASE_URL}/datasets/FUELHH/stream"
WINDFOR_ENDPOINT = f"{BASE_URL}/datasets/WINDFOR/stream"

DEFAULT_START_DATE = "2026-01-01"
DEFAULT_END_DATE = "2026-02-02"
DEFAULT_FORECAST_START = "2025-12-31"
DEFAULT_FORECAST_END = "2026-02-01"


def get_with_retry(
    client: httpx.Client,
    url: str,
    params: Dict[str, Any],
    max_retries: int = 3,
    backoff_factor: float = 1.5,
) -> List[Dict[str, Any]]:
    """Fetch JSON stream from Elexon API with retry and exponential backoff."""
    delay = 1.0
    for attempt in range(1, max_retries + 1):
        try:
            response = client.get(url, params=params, timeout=45.0)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "data" in data:
                    return data["data"]
                return []
            elif response.status_code in (429, 500, 502, 503, 504):
                print(
                    f"  [Attempt {attempt}/{max_retries}] HTTP {response.status_code}. Backing off {delay:.1f}s..."
                )
                time.sleep(delay)
                delay *= backoff_factor
            else:
                response.raise_for_status()
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            if attempt == max_retries:
                raise RuntimeError(f"Failed to fetch {url} after {max_retries} attempts: {e}") from e
            print(f"  [Attempt {attempt}/{max_retries}] Error: {e}. Backing off {delay:.1f}s...")
            time.sleep(delay)
            delay *= backoff_factor
    return []


def fetch_fuelhh_range(
    client: httpx.Client,
    start_date: str,
    end_date: str,
    chunk_days: int = 7,
    raw_dir: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Fetch actuals from FUELHH in chunks."""
    all_records: List[Dict[str, Any]] = []
    current_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    print(f"Fetching FUELHH actuals from {start_date} to {end_date} in {chunk_days}-day chunks...")
    while current_dt <= end_dt:
        chunk_end = min(current_dt + timedelta(days=chunk_days - 1), end_dt)
        params = {
            "settlementDateFrom": current_dt.strftime("%Y-%m-%d"),
            "settlementDateTo": chunk_end.strftime("%Y-%m-%d"),
            "fuelType": "WIND",
        }
        print(f"  Fetching FUELHH: {params['settlementDateFrom']} to {params['settlementDateTo']}...")
        records = get_with_retry(client, FUELHH_ENDPOINT, params)
        all_records.extend(records)
        print(f"    Received {len(records)} records (total: {len(all_records)})")

        time.sleep(0.5)
        current_dt = chunk_end + timedelta(days=1)

    if raw_dir:
        raw_path = raw_dir / f"fuelhh_raw_{start_date}_{end_date}.json"
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(all_records, f)
        print(f"  Saved raw FUELHH dump to {raw_path}")

    return all_records


def fetch_windfor_range(
    client: httpx.Client,
    start_date: str,
    end_date: str,
    chunk_days: int = 5,
    raw_dir: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Fetch forecasts from WINDFOR in chunks."""
    all_records: List[Dict[str, Any]] = []
    current_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    print(f"Fetching WINDFOR forecasts from {start_date} to {end_date} in {chunk_days}-day chunks...")
    while current_dt <= end_dt:
        chunk_end = min(current_dt + timedelta(days=chunk_days - 1), end_dt)
        from_str = f"{current_dt.strftime('%Y-%m-%d')}T00:00:00Z"
        to_str = f"{chunk_end.strftime('%Y-%m-%d')}T23:59:59Z"
        params = {
            "publishDateTimeFrom": from_str,
            "publishDateTimeTo": to_str,
        }
        print(f"  Fetching WINDFOR: {from_str} to {to_str}...")
        records = get_with_retry(client, WINDFOR_ENDPOINT, params)
        all_records.extend(records)
        print(f"    Received {len(records)} records (total: {len(all_records)})")

        time.sleep(0.5)
        current_dt = chunk_end + timedelta(days=1)

    if raw_dir:
        raw_path = raw_dir / f"windfor_raw_{start_date}_{end_date}.json"
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(all_records, f)
        print(f"  Saved raw WINDFOR dump to {raw_path}")

    return all_records


def normalize_actuals(records: List[Dict[str, Any]]) -> pd.DataFrame:
    """Filter to WIND, format timestamps, de-duplicate, and sort."""
    df = pd.DataFrame(records)
    if df.empty:
        return pd.DataFrame(columns=["start_time", "actual_mw"])

    # Client-side filter to WIND if fuelType column exists
    if "fuelType" in df.columns:
        df = df[df["fuelType"] == "WIND"].copy()

    # Normalize column names and types
    df = df.rename(columns={"startTime": "start_time", "generation": "actual_mw"})

    # Parse ISO UTC datetime and ensure standard string format YYYY-MM-DDTHH:MM:SSZ
    df["dt"] = pd.to_datetime(df["start_time"], utc=True)
    df["start_time"] = df["dt"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df["actual_mw"] = pd.to_numeric(df["actual_mw"], errors="coerce")

    # De-duplicate on start_time
    df = df.drop_duplicates(subset=["start_time"]).sort_values("dt").reset_index(drop=True)
    df = df[["start_time", "actual_mw"]]
    return df


def normalize_forecasts(records: List[Dict[str, Any]]) -> pd.DataFrame:
    """Normalize forecasts, calculate horizon, filter horizon_h >= 0, de-duplicate."""
    df = pd.DataFrame(records)
    if df.empty:
        return pd.DataFrame(columns=["start_time", "publish_time", "forecast_mw", "horizon_h"])

    df = df.rename(
        columns={
            "startTime": "start_time",
            "publishTime": "publish_time",
            "generation": "forecast_mw",
        }
    )

    df["dt_start"] = pd.to_datetime(df["start_time"], utc=True)
    df["dt_pub"] = pd.to_datetime(df["publish_time"], utc=True)

    df["start_time"] = df["dt_start"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df["publish_time"] = df["dt_pub"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df["forecast_mw"] = pd.to_numeric(df["forecast_mw"], errors="coerce")

    # Horizon in hours = (start_time - publish_time) / 1 hour
    df["horizon_h"] = (df["dt_start"] - df["dt_pub"]).dt.total_seconds() / 3600.0

    # Drop rows with horizon_h < 0 per §4.1
    initial_len = len(df)
    df = df[df["horizon_h"] >= 0].copy()
    dropped_hindcasts = initial_len - len(df)
    print(f"  Dropped {dropped_hindcasts} hindcast rows with horizon_h < 0 (kept {len(df)})")

    # De-duplicate on (start_time, publish_time)
    df = df.drop_duplicates(subset=["start_time", "publish_time"]).reset_index(drop=True)
    df = df.sort_values(["publish_time", "start_time"]).reset_index(drop=True)

    df = df[["start_time", "publish_time", "forecast_mw", "horizon_h"]]
    return df


def generate_quality_report(actuals_df: pd.DataFrame, forecasts_df: pd.DataFrame) -> Dict[str, Any]:
    """Generate quality report checking completeness, gaps, anomalies, horizons."""
    report: Dict[str, Any] = {}

    # Actuals analysis
    report["actuals_count"] = len(actuals_df)
    if not actuals_df.empty:
        start_min = actuals_df["start_time"].min()
        start_max = actuals_df["start_time"].max()
        report["actuals_min_time"] = start_min
        report["actuals_max_time"] = start_max

        # Check for missing half-hours in the range
        dt_series = pd.to_datetime(actuals_df["start_time"], utc=True)
        expected_range = pd.date_range(
            start=dt_series.min(), end=dt_series.max(), freq="30min", tz=timezone.utc
        )
        missing_dt = expected_range.difference(dt_series)
        report["actuals_expected_slots"] = len(expected_range)
        report["actuals_missing_slots"] = len(missing_dt)
        report["actuals_missing_list"] = [
            d.strftime("%Y-%m-%dT%H:%M:%SZ") for d in missing_dt[:10]
        ]

        # Value checks
        report["actuals_negative_count"] = int((actuals_df["actual_mw"] < 0).sum())
        report["actuals_null_count"] = int(actuals_df["actual_mw"].isna().sum())
        report["actuals_min_mw"] = float(actuals_df["actual_mw"].min())
        report["actuals_max_mw"] = float(actuals_df["actual_mw"].max())
        report["actuals_mean_mw"] = round(float(actuals_df["actual_mw"].mean()), 2)

    # Forecasts analysis
    report["forecasts_count"] = len(forecasts_df)
    if not forecasts_df.empty:
        pub_min = forecasts_df["publish_time"].min()
        pub_max = forecasts_df["publish_time"].max()
        report["forecasts_min_publish"] = pub_min
        report["forecasts_max_publish"] = pub_max
        report["forecasts_unique_publishes"] = int(forecasts_df["publish_time"].nunique())

        # Horizons
        report["horizon_min_h"] = float(forecasts_df["horizon_h"].min())
        report["horizon_max_h"] = float(forecasts_df["horizon_h"].max())

        # Granularity check (minutes of start_time)
        dt_start = pd.to_datetime(forecasts_df["start_time"], utc=True)
        start_mins = set(int(m) for m in dt_start.dt.minute.unique())
        report["forecast_start_minutes"] = sorted(list(start_mins))
        report["is_hourly"] = bool(start_mins == {0})

        # Values
        report["forecasts_negative_count"] = int((forecasts_df["forecast_mw"] < 0).sum())
        report["forecasts_null_count"] = int(forecasts_df["forecast_mw"].isna().sum())
        report["forecasts_min_mw"] = float(forecasts_df["forecast_mw"].min())
        report["forecasts_max_mw"] = float(forecasts_df["forecast_mw"].max())
        report["forecasts_mean_mw"] = round(float(forecasts_df["forecast_mw"].mean()), 2)

        # Coverage by delivery day (target date)
        forecasts_df_copy = forecasts_df.copy()
        forecasts_df_copy["delivery_date"] = dt_start.dt.strftime("%Y-%m-%d")
        daily_cov = {
            str(k): int(v)
            for k, v in forecasts_df_copy.groupby("delivery_date")["start_time"]
            .nunique()
            .to_dict()
            .items()
        }
        report["coverage_unique_target_hours_per_day"] = daily_cov

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch and normalize Elexon BMRS WIND data.")
    parser.add_argument("--start", default=DEFAULT_START_DATE, help="Start date for actuals (YYYY-MM-DD)")
    parser.add_argument("--end", default=DEFAULT_END_DATE, help="End date for actuals (YYYY-MM-DD)")
    parser.add_argument(
        "--forecast-start",
        default=DEFAULT_FORECAST_START,
        help="Publish start date for forecasts (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--forecast-end",
        default=DEFAULT_FORECAST_END,
        help="Publish end date for forecasts (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--from-local",
        help="Load raw JSON files from local directory instead of calling API",
    )
    parser.add_argument(
        "--output-dir",
        default="backend/data/processed",
        help="Directory to save processed datasets",
    )
    parser.add_argument(
        "--raw-dir",
        default="backend/data/raw",
        help="Directory to save raw API dumps",
    )

    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = Path(args.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)

    if args.from_local:
        local_dir = Path(args.from_local)
        print(f"Loading raw data from local directory: {local_dir}")
        fuel_files = list(local_dir.glob("fuelhh*.json"))
        wind_files = list(local_dir.glob("windfor*.json"))
        if not fuel_files or not wind_files:
            print(f"Error: Could not find fuelhh*.json and windfor*.json in {local_dir}")
            sys.exit(1)
        with open(fuel_files[0], "r", encoding="utf-8") as f:
            raw_fuelhh = json.load(f)
        with open(wind_files[0], "r", encoding="utf-8") as f:
            raw_windfor = json.load(f)
    else:
        with httpx.Client(headers={"Accept": "application/json"}) as client:
            raw_fuelhh = fetch_fuelhh_range(client, args.start, args.end, raw_dir=raw_dir)
            raw_windfor = fetch_windfor_range(
                client, args.forecast_start, args.forecast_end, raw_dir=raw_dir
            )

    print("\nNormalizing actuals...")
    actuals_df = normalize_actuals(raw_fuelhh)
    print(f"  Processed {len(actuals_df)} actual wind rows.")

    print("\nNormalizing forecasts...")
    forecasts_df = normalize_forecasts(raw_windfor)
    print(f"  Processed {len(forecasts_df)} forecast wind rows.")

    # Save to gzip CSV
    actuals_path = out_dir / "actuals_wind.csv.gz"
    forecasts_path = out_dir / "forecasts_wind.csv.gz"
    meta_path = out_dir / "snapshot_meta.json"

    print(f"\nWriting {actuals_path}...")
    actuals_df.to_csv(actuals_path, index=False, compression="gzip")

    print(f"Writing {forecasts_path}...")
    forecasts_df.to_csv(forecasts_path, index=False, compression="gzip")

    quality_report = generate_quality_report(actuals_df, forecasts_df)
    meta = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "actuals_window": {"start": args.start, "end": args.end},
        "forecasts_publish_window": {"start": args.forecast_start, "end": args.forecast_end},
        "quality_report": quality_report,
    }

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"Writing {meta_path}...")

    # Print summary report to stdout
    print("\n" + "=" * 60)
    print("DATA QUALITY REPORT")
    print("=" * 60)
    print(f"Actuals (FUELHH):")
    print(f"  Row count: {quality_report.get('actuals_count')}")
    print(f"  Time range: {quality_report.get('actuals_min_time')} to {quality_report.get('actuals_max_time')}")
    print(f"  Expected 30m slots: {quality_report.get('actuals_expected_slots')}")
    print(f"  Missing slots: {quality_report.get('actuals_missing_slots')}")
    print(f"  Negative values: {quality_report.get('actuals_negative_count')}")
    print(f"  Range: {quality_report.get('actuals_min_mw')} MW to {quality_report.get('actuals_max_mw')} MW (Mean: {quality_report.get('actuals_mean_mw')} MW)")
    print("-" * 60)
    print(f"Forecasts (WINDFOR):")
    print(f"  Row count: {quality_report.get('forecasts_count')}")
    print(f"  Publish range: {quality_report.get('forecasts_min_publish')} to {quality_report.get('forecasts_max_publish')}")
    print(f"  Unique publishes: {quality_report.get('forecasts_unique_publishes')}")
    print(f"  Horizon range: {quality_report.get('horizon_min_h')}h to {quality_report.get('horizon_max_h')}h")
    print(f"  Granularity: {'Hourly (:00)' if quality_report.get('is_hourly') else 'Half-hourly'}")
    print(f"  Negative values: {quality_report.get('forecasts_negative_count')}")
    print(f"  Range: {quality_report.get('forecasts_min_mw')} MW to {quality_report.get('forecasts_max_mw')} MW (Mean: {quality_report.get('forecasts_mean_mw')} MW)")
    print("=" * 60)


if __name__ == "__main__":
    main()
