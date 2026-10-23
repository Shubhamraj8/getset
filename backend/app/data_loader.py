"""
data_loader.py — Load processed CSV snapshots once at import time.

Provides module-level DataFrames: ACTUALS_DF, FORECASTS_DF, SNAPSHOT_META.
Raises FileNotFoundError with a clear message if data files are missing
(tells the user to run fetch_data.py first).
"""

import json
from datetime import timezone
from typing import Any, Dict

import pandas as pd

from .config import ACTUALS_PATH, FORECASTS_PATH, META_PATH


def _load_actuals() -> pd.DataFrame:
    if not ACTUALS_PATH.exists():
        raise FileNotFoundError(
            f"Actuals data file not found at {ACTUALS_PATH}. "
            "Run `python backend/scripts/fetch_data.py` first."
        )
    df = pd.read_csv(ACTUALS_PATH, compression="gzip")
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    return df


def _load_forecasts() -> pd.DataFrame:
    if not FORECASTS_PATH.exists():
        raise FileNotFoundError(
            f"Forecasts data file not found at {FORECASTS_PATH}. "
            "Run `python backend/scripts/fetch_data.py` first."
        )
    df = pd.read_csv(FORECASTS_PATH, compression="gzip")
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    return df


def _load_meta() -> Dict[str, Any]:
    if not META_PATH.exists():
        return {}
    with open(META_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Eagerly loaded at startup ─────────────────────────────────────────
ACTUALS_DF: pd.DataFrame = _load_actuals()
FORECASTS_DF: pd.DataFrame = _load_forecasts()
SNAPSHOT_META: Dict[str, Any] = _load_meta()
