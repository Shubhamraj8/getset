# Client Pitch: getset — UK Wind Forecast Monitor & Risk Evaluation

**Target Client:** UK Energy Utility Wholesale Power Procurement Desk  
**Focus:** Day-Ahead Electricity Market Procurement & Imbalance Risk Management  
**Scope Evaluated:** GB National Wind Generation Decisions (January 2026)

---

## 1. Executive Summary & Problem Context

In the UK wholesale electricity market, day-ahead purchase decisions for delivery day **$D$** must be finalized on **$D-1$** prior to market gate closure (typically mid-morning). Energy utilities must procure sufficient power to meet consumer demand *net of renewable generation*.

Because wind generation is weather-dependent and highly variable, procurement desks face two critical questions every morning:
1. **What was the latest, authentic wind forecast available at the moment we had to commit to our trade?**
2. **How wrong is that forecast historically, and what is our exposure to imbalance settlement?**

Relying on post-hoc forecasts creates artificial confidence. Trading without quantifying forecast error exposes the utility to severe cash-out imbalance penalties when actual wind under-delivers.

---

## 2. Product Capabilities

**getset** is a bespoke operational intelligence tool designed specifically for the day-ahead procurement desk:

### A. Point-in-Time Decision Replay (Req. 1)
- **Strict Anti-Hindsight Filtering:** Automatically filters out all forecasts published after the decision gate (default 09:00 UTC on $D-1$) to present the exact information state available to the trader.
- **Coverage & Provenance Tracking:** Displays publication timestamps, lead horizons, and alerts if any half-hourly settlement periods had gaps before gate closure.
- **Actionable Risk Bands:** Visualizes historical P10–P90 error bands tailored to the specific lead horizon directly on the forecast chart, allowing traders to size reserve margins quantitatively.

### B. Quantitative Accuracy & Bias Evaluation (Req. 2)
- **Statistically Grounded Metrics:** Tracks Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), Normalized MAE (nMAE%), and 95th-percentile tail risk ($P_{95}$).
- **Explicit Sign Convention:** Standardized to $\text{Error} = \text{Forecast} - \text{Actual}$. A positive error directly flags over-forecast bias (risk of under-procuring alternative power).
- **Multi-Dimensional Diagnostics:**
  - *Error vs. Horizon:* Shows error growth from intraday (0–6h) out to day-ahead (24–48h).
  - *Intraday Diurnal Patterns:* Breaks down error by hour of day (00:00–23:00 UTC).
  - *Daily Volatility Tracking:* Highlights days with severe frontal weather misses.
  - *Error Histogram:* Quantifies fat tails and operational asymmetry.

---

## 3. Commercial Insights from January 2026

Applying **getset** to Elexon BMRS data across January 2026 reveals actionable commercial realities:
- **Systematic Over-Forecast Bias:** At the 09:00 UTC cutoff, wind forecasts exhibited an average bias of **+773 MW** (Mean Error). Unadjusted trading would systematically under-buy alternative generation, forcing costly intraday balancing mechanism purchases.
- **High Outlier Risk:** While overall MAE hovered around **1,720 MW**, the $P_{95}$ absolute error reached **3,890 MW**, highlighting instances of severe volume shortfall during storm transitions.
- **Horizon Value Decay:** Forecast MAE nearly doubles from **~1,200 MW** at 6-hour horizons to **>2,400 MW** at 48-hour horizons. Quantifying this gradient justifies dynamic, multi-stage procurement rather than all-or-nothing day-ahead hedging.

---

## 4. Why getset Wins
- **Audit-Grade Reliability:** Powered directly by official Elexon BMRS data (`FUELHH` and `WINDFOR`), fully reproducible, with zero black-box synthetic numbers.
- **Trader-First UX:** Minimalist, fast, responsive web interface built for high-stakes trading desks with instant toggles for hindsight verification and risk bands.
- **Zero-Footprint Deployment:** Lightweight architecture packaged with Docker Compose and Vercel-ready serverless execution.

---

## 5. Next Evolution Roadmap
1. **Zonal & Transmission Boundary Splits:** Decomposing national wind into Scottish export zones vs. southern demand centers to manage BSUoS and local constraint charges.
2. **Imbalance Price Co-Optimization:** Marrying volume error distributions with System Buy Price (SBP) spikes to optimize financial hedging value.
