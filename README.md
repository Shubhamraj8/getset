# getset — UK Wind Forecast Monitor & Risk Evaluation

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite%20%2B%20TS-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Docker](https://img.shields.io/badge/Container-Docker%20Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![GitHub](https://img.shields.io/badge/GitHub-Shubhamraj8%2Fgetset-181717?logo=github&logoColor=white)](https://github.com/Shubhamraj8/getset)

**GitHub Repository:** [https://github.com/Shubhamraj8/getset](https://github.com/Shubhamraj8/getset)  
A dedicated operational intelligence and forecast evaluation application built for the **day-ahead electricity procurement desk** at a UK energy utility.

---

> ### 🤖 AI Tools Disclosure
> In compliance with project guidelines, **AI tools (Google DeepMind Antigravity / Claude Code) were used in the engineering, analytical modelling, testing, and documentation** of this codebase, under direct human supervision.

---

## 1. Problem Statement & Commercial Context

### The Challenge
A UK energy utility buys electricity on the wholesale market to meet consumer demand. The **day-ahead market** operates on a strict timing schedule:
- Power for delivery day **$D$** must be procured on day **$D-1$** prior to market gate closure (typically mid-morning).
- To balance the portfolio cost-effectively, procurement traders must purchase thermal, hydro, and interconnector power to cover the gap between consumer demand and weather-dependent renewable generation (principally national **wind**).
- Therefore, buying decisions are critically dependent on **wind generation forecasts published before the day-ahead gate closure**.

### What This App Delivers
1. **Req. 1 — Point-in-Time Decision Replay:** Visualizes the latest national wind generation forecast available *at the moment the procurement decision was made*, completely eliminating hindsight bias.
2. **Req. 2 — Quantitative Accuracy & Bias Evaluation:** Statistically evaluates the performance of day-ahead forecasts across January 2026, allowing traders to price quantified error and volume risk directly into their bidding strategy.

---

## 2. Domain Primer & Conventions

### Sign Convention
Forecast error is consistently defined throughout the backend and UI as:
$$\text{Error} = \text{Forecast} - \text{Actual} \quad (\text{MW})$$

- **Positive Error ($> 0$ MW):** **Over-forecast**. Actual wind was lower than expected. The utility would have under-procured day-ahead power and been forced to purchase expensive replacement power in the intraday Balancing Mechanism.
- **Negative Error ($< 0$ MW):** **Under-forecast**. Actual wind was higher than expected. The utility would have over-procured day-ahead thermal power.

### Horizon
$$\text{Horizon (hours)} = \text{Target Start Time} - \text{Forecast Publish Time}$$
Shows how far in advance each forecast was issued. For day-ahead decisions made at 09:00 UTC on $D-1$, horizons for delivery day $D$ range from **15 hours** (for 00:00 UTC) to **38 hours** (for 23:00 UTC).

### Timezone & Units
- **Timezone:** **UTC** throughout (in January, UTC is identical to UK local time as BST is not active). All timestamps are stored and transmitted as ISO-8601 strings (`...Z`).
- **Units:** Megawatts (**MW**).
- **Resolution:** Native hourly forecast resolution with hourly-aggregated actuals (see Decision D6).

---

## 3. Data Architecture & Ingestion

### Data Source: Elexon BMRS
Data is sourced exclusively from the official Elexon Balancing Mechanism Reporting Service (BMRS):
- **Actual Generation:** [`FUELHH`](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) stream endpoint, filtered to `fuelType == "WIND"`.
- **Forecast Generation:** [`WINDFOR`](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) stream endpoint.

### Offline Snapshot Strategy
To ensure auditability, zero runtime external API failures, and instant cold-starts on serverless platforms (Vercel), data is fetched via an offline CLI script and stored as compressed snapshots committed in the repository:
```
backend/data/processed/
├── actuals_wind.csv.gz     # 1,584 half-hourly actuals (Jan 1 – Feb 2, 2026)
├── forecasts_wind.csv.gz   # 16,334 hourly national wind forecasts
└── snapshot_meta.json      # Ingestion metadata & provenance
```

To re-fetch or update from live Elexon BMRS:
```bash
python backend/scripts/fetch_data.py --start 2026-01-01 --end 2026-02-02
```
Or ingest from local raw files:
```bash
python backend/scripts/fetch_data.py --from-local /path/to/raw
```

---

## 4. Architectural & Design Decisions

| ID | Decision Area | Selected Choice | Rationale |
|---|---|---|---|
| **D1** | Evaluation Window | **Delivery days Jan 2 – Feb 1, 2026** | Literal adherence to "purchase decisions made in January 2026". Decisions made Jan 1–31 deliver on Jan 2–Feb 1. |
| **D2** | Default Decision Cutoff | **09:00 UTC on D-1** | Conservative proxy for standard UK wholesale day-ahead gate closures. Fully adjustable in UI (00:00–23:00 UTC). |
| **D3** | Historical Error Band | **P10–P90 Lead-Time Band** | Directly empowers traders to evaluate volume risk visually alongside the forecast curve. Clearly labeled as historical error, not a guarantee. |
| **D4** | Deployment Layout | **Unified Single Vercel Project** | Root `vercel.json` and `api/index.py` serve FastAPI serverless functions under `/api` with zero CORS hurdles. |
| **D6** | Granularity Resolution | **Hourly Comparison (Mean Actuals)** | WINDFOR forecasts are published natively on hourly targets (24 slots/day). Actuals (30-min) are averaged to hourly blocks without synthetic interpolation. |

---

## 5. Quantitative Summary (January 2026 Performance)

Evaluated at the default decision cutoff of **09:00 UTC on D-1** across all 31 delivery days (744 evaluated hours):

| Metric | Value | Practical Interpretation for Traders |
|---|---|---|
| **Sample Size ($n$)** | **744 hours** | 100% complete hourly coverage across January 2026 delivery days. |
| **Mean Absolute Error (MAE)** | **1,720.5 MW** | The forecast deviated by ~1,720 MW on average in either direction. |
| **Root Mean Squared Error (RMSE)** | **2,228.4 MW** | Penalizes severe weather forecast misses. |
| **Bias / Mean Error (ME)** | **+773.2 MW** | **Persistent over-forecast bias.** Forecasters systematically over-estimated wind, creating unhedged shortfall risk. |
| **Normalized MAE (nMAE %)** | **17.8%** | MAE relative to average actual output (avoids MAPE divide-by-zero near 0 MW). |
| **$P_{95}$ Absolute Error** | **3,892.4 MW** | 95% of hourly forecast errors were within 3.89 GW. |
| **Max Over-Forecast** | **+7,412.0 MW** | Worst-case generation shortfall compared to expectation. |
| **Max Under-Forecast** | **-5,115.0 MW** | Largest unexpected wind surge. |

### Key Insight: Horizon Decay
Forecast error compounds significantly with lead time:
- **0–6h Horizon (Intraday):** MAE $\approx 1,215 \text{ MW}$ (Bias $+340 \text{ MW}$)
- **24–30h Horizon (Day-Ahead):** MAE $\approx 1,745 \text{ MW}$ (Bias $+780 \text{ MW}$)
- **42–48h Horizon (Two-Day Ahead):** MAE $\approx 2,120 \text{ MW}$ (Bias $+1,150 \text{ MW}$)

---

## 6. Project Structure

```
getset/
├── api/
│   └── index.py               # Vercel serverless entrypoint
├── backend/
│   ├── app/
│   │   ├── analysis.py        # Core pure functions (latest-at-cutoff, metrics, breakdowns)
│   │   ├── config.py          # Decision constants & paths
│   │   ├── data_loader.py     # Startup in-memory CSV loader
│   │   ├── main.py            # FastAPI REST routes & CORS
│   │   └── schemas.py         # Pydantic response models
│   ├── data/
│   │   └── processed/         # Gzipped CSV snapshots (actuals, forecasts)
│   ├── scripts/
│   │   └── fetch_data.py      # Elexon BMRS ingestion script
│   ├── tests/
│   │   └── test_analysis.py   # Pytest suite (20 unit tests)
│   ├── Dockerfile             # Production Python 3.12-slim container
│   └── requirements.txt       # Backend dependencies
├── docs/
│   └── PITCH.md               # 1-page commercial pitch for procurement desks
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AccuracyView.tsx  # Tab 2: Metric cards & 4 analytical charts
│   │   │   ├── Controls.tsx      # Date pickers & cutoff sliders
│   │   │   ├── ForecastView.tsx  # Tab 1: Recharts forecast, error band & actuals
│   │   │   └── MetricCard.tsx    # Stat display with plain-English tooltips
│   │   ├── api.ts             # Typed fetch helpers
│   │   ├── App.tsx            # Main layout & tab management
│   │   ├── main.tsx           # React DOM root
│   │   └── styles.css         # Trading desk styling system
│   ├── Dockerfile             # Multi-stage Node builder -> Nginx container
│   ├── nginx.conf             # Nginx reverse proxy (/api -> backend:8000)
│   ├── package.json
│   └── vite.config.ts         # Dev proxy config
├── docker-compose.yml         # Local full-stack container orchestration
├── vercel.json                # Vercel deployment specification
├── PROGRESS.md                # Phase completion tracking
└── README.md                  # System documentation
```

---

## 7. Quick Start & Execution

### Option A: Running with Docker Compose (Recommended)
Make sure Docker Desktop is running, then execute:
```bash
docker compose up --build
```
- **Web Application:** Open [http://localhost:3000](http://localhost:3000)
- **API Documentation (Swagger):** Open [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check:** Open [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

### Option B: Local Development

#### 1. Backend Setup
```bash
# Navigate to backend
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run analytical test suite
pytest tests/ -v

# Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend Setup
In a new terminal:
```bash
# Navigate to frontend
cd frontend

# Install npm dependencies
npm install

# Start Vite dev server (automatically proxies /api to localhost:8000)
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

---

## 8. REST API Reference

All timestamps are ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`). All generation and error values are in Megawatts (**MW**).

| Endpoint | Method | Parameters | Description |
|---|---|---|---|
| `/api/health` | `GET` | — | Service health check (`{"status": "ok"}`). |
| `/api/meta` | `GET` | — | Returns dataset date limits, valid delivery days, row counts, and snapshot timestamp. |
| `/api/forecast` | `GET` | `delivery_date` (YYYY-MM-DD)<br>`cutoff_hour` (0–23, opt) | Returns latest forecast series known at cutoff, lead horizons, P10–P90 error band, actuals (hindsight), and slot coverage. |
| `/api/accuracy` | `GET` | `start_date` (YYYY-MM-DD)<br>`end_date` (YYYY-MM-DD)<br>`cutoff_hour` (0–23, opt) | Returns overall metrics (MAE, RMSE, ME, nMAE, P95), error vs horizon bins, error by hour of day, daily trend, and error histogram. |

---

## 9. Testing & Quality Assurance

The analytical engine is backed by a 20-test automated suite in `backend/tests/test_analysis.py`:
- **Cutoff selection:** Verifies that forecasts published strictly after cutoff are ignored, while forecasts published at the exact cutoff boundary are included.
- **Null handling:** Guarantees missing target slots remain `null` and are never forward-filled or interpolated.
- **Metric correctness:** Validates ME sign conventions, MAE, RMSE, and quantiles against hand-computed benchmark matrices.
- **Horizon derivation:** Tests lead-time calculations across changing timestamps.

Run tests:
```bash
pytest backend/tests/ -v
```
Output:
```
============================= 20 passed in 0.81s ==============================
```

---

## 10. Vercel Deployment Guide

The repository is pre-configured for automated single-project deployment to [Vercel](https://vercel.com):
1. Connect the GitHub repository `getset` to Vercel.
2. Vercel will automatically detect `vercel.json`:
   - Frontend is built from `frontend/` using Vite into `frontend/dist`.
   - Backend API is deployed as a Python Serverless Function via `api/index.py`.
3. Click **Deploy**. No additional environment variables or external databases are required.
