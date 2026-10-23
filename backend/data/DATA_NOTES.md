# Elexon BMRS Wind Data Findings & Notes

## 1. Datasets & API Endpoints

### Actuals: `FUELHH` (Half-hourly Generation by Fuel Type)
- **Endpoint**: `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream`
- **Key Parameters**:
  - `settlementDateFrom`: `YYYY-MM-DD`
  - `settlementDateTo`: `YYYY-MM-DD`
  - `fuelType`: `WIND` (server-side filtering supported and verified)
- **Granularity**: 30 minutes (Settlement Periods 1 to 48 per day; timestamps on `:00` and `:30`).
- **Fields Used**:
  - `startTime`: ISO-8601 UTC string (e.g., `2026-01-01T00:00:00Z`)
  - `generation`: Average MW over the half-hour (e.g., `15538`)
  - `settlementDate`, `settlementPeriod`, `fuelType`

### Forecasts: `WINDFOR` (Wind Generation Forecast)
- **Endpoint**: `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream`
- **Key Parameters**:
  - `publishDateTimeFrom`: `YYYY-MM-DDTHH:MM:SSZ`
  - `publishDateTimeTo`: `YYYY-MM-DDTHH:MM:SSZ`
- **Granularity**: **Hourly** (all forecast `startTime` timestamps end strictly at `:00:00Z`, 24 points per delivery day).
- **Publication Frequency**: ~8 times per day, published at half-hours (typical times: `02:30`, `04:30`, `07:30`, `09:30`, `11:30`, `15:30`, `18:30`, `22:30` UTC).
- **Horizon Range**: `0.5h` to `66.5h`.
- **Fields Used**:
  - `startTime`: Target hour ISO-8601 UTC string (e.g., `2026-01-02T10:00:00Z`)
  - `publishTime`: Publication time ISO-8601 UTC string (e.g., `2026-01-01T07:30:00Z`)
  - `generation`: Forecasted MW (e.g., `12450`)

---

## 2. Ingestion & Quality Checks (Window: 2025-12-31 to 2026-02-02)

| Metric | Actuals (`FUELHH`) | Forecasts (`WINDFOR`) |
|---|---|---|
| Raw Records Fetched | 1,584 | 19,272 |
| Filtered / Kept Rows | 1,584 | 15,311 (dropped 3,961 hindcasts with horizon < 0) |
| Missing Periods / Gaps | **0** (100% complete: 1584/1584 expected 30m slots) | None for delivery days in scope |
| Negative Generation | 0 | 0 |
| Generation Min | 1,695.0 MW | 2,292.0 MW |
| Generation Max | 17,805.0 MW | 21,353.0 MW |
| Generation Mean | 11,437.59 MW | 13,111.17 MW |

---

## 3. Key Findings & Design Impacts

1. **Strictly Hourly WINDFOR (Triggers Decision D6)**:
   - WINDFOR is provided at 1-hour resolution, while FUELHH is at 30-minute resolution.
   - Recommended resolution: Compare on hourly resolution by aggregating the two 30-minute actuals (e.g. `:00` and `:30`) to their hourly mean MW. This preserves physical meaning without inventing forecast data.
2. **Negative Horizon Hindcasts**:
   - Each WINDFOR publication includes past hours preceding the publish time. These have negative forecast horizons (`startTime < publishTime`) and are filtered out per specification.
3. **High Data Completeness**:
   - The entire January window plus adjacent margin days (Dec 31, 2025 to Feb 2, 2026) has complete records with zero missing half-hours in outturns and consistent forecast updates.
