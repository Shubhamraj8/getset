"""
config.py — Application constants and defaults.

Design decisions locked in Phase 1:
  D1 = A: Delivery days Jan 2 – Feb 1 (decisions made Jan 1–31)
  D2 = A: Default cutoff hour = 9 (09:00 UTC on D-1)
  D6 = A: Compare on hourly resolution (aggregate actuals to hourly mean)
"""

from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"
ACTUALS_PATH = DATA_DIR / "actuals_wind.csv.gz"
FORECASTS_PATH = DATA_DIR / "forecasts_wind.csv.gz"
META_PATH = DATA_DIR / "snapshot_meta.json"

# ── Decision window (D1 = A) ──────────────────────────────────────────
# Decisions made Jan 1–31 → delivery days Jan 2 – Feb 1
DELIVERY_START = "2026-01-02"
DELIVERY_END = "2026-02-01"

# ── Cutoff (D2 = A) ──────────────────────────────────────────────────
DEFAULT_CUTOFF_HOUR = 9  # 09:00 UTC on D-1

# ── Horizon bins (for accuracy breakdown) ─────────────────────────────
HORIZON_BIN_SIZE_H = 6  # 0–6, 6–12, 12–18, …

# ── Error histogram ──────────────────────────────────────────────────
ERROR_HIST_BIN_WIDTH_MW = 500  # MW per bin
