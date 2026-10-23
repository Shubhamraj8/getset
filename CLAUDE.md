# getset — Agent Execution Plan

<!-- FILE NAME: save as CLAUDE.md (Claude Code) or AGENTS.md (Antigravity). Content is identical. -->

> **Project name:** `getset` (local folder AND GitHub repo name)
> **Audience:** an AI coding agent (Antigravity / Claude Code) working inside the `getset/` folder, supervised by a human (Shubham).
> **Rule zero:** read this whole file before writing any code. Work **phase by phase**. At the end of every phase, **STOP**, send the Phase Report (template in §11), and **wait for the human to say "continue"**.

---

## 0. Bootstrap & auto-start (do this yourself — the human will give you no other instructions)

This file is your **only** briefing. The human will open the `getset/` folder and start a session; whatever their first message is (even just "hi" or "start"), treat it as **"begin"** and proceed as below. Do not ask the human to do setup you can do yourself.

1. **Persist this plan for future sessions:** make sure this exact content exists at the repo root as both `CLAUDE.md` (auto-loaded by Claude Code) and `AGENTS.md` (auto-loaded by Antigravity and other agents). If you were loaded from a differently named file, copy it to the missing names. Keep them identical; never edit the plan's content unless the human asks.
2. **Resume logic:** check for `PROGRESS.md` at the root.
   - Missing → you are starting fresh: create it (one line per phase: `Phase n — not started | in progress | complete (awaiting approval) | approved`), then start **Phase 1**.
   - Present → continue from the first phase that isn't `approved`. Update `PROGRESS.md` at the end of every phase and when the human approves.
3. **Environment check (run the commands yourself):** `git --version`, `python --version` (need 3.12+; 3.11 acceptable if 3.12 is unavailable — tell the human), `node --version` (18+), `npm --version`, `docker --version`. If something is missing, report it plainly with the install link and wait; otherwise proceed silently.
4. **Repo setup:** if `.git` doesn't exist run `git init`. Work inside the current folder (it is already named `getset`); don't create a nested `getset/getset`. Do **not** add remotes, push, or deploy — the human handles GitHub and Vercel.
5. **Python env:** create `backend/.venv` and install from `requirements.txt`; **Node:** `npm install` in `frontend/`. Do all installs and runs yourself.
6. Then follow §12 phase by phase. The first thing the human should see from you is a 3–4 line summary of how you will proceed, followed immediately by Phase 1 work (no waiting for permission to start Phase 1).

---

## 1. Problem statement (source of truth)

We are a product developer building and delivering a customized software product for a client.

**Client:** a UK energy utility that buys electricity on the wholesale market to serve its consumers.
**Team we serve:** the team that buys power on the **UK day-ahead market**. They must work out how much power must be procured *in addition to* weather-dependent renewable (wind) generation. Day-ahead purchase decisions are made **one day before** the delivery day, so they rely on **wind generation forecasts**.

**The web app must let them:**

1. Clearly understand the **latest wind generation forecasts available at the time they must make a day-ahead decision**.
2. **Quantitatively evaluate forecast accuracy**, so decisions can account for the quantified error.

**Scope limits:**

- National-level **wind** only. Data **only** from Elexon BMRS. No other data.
- Only data relevant to purchase decisions made in **January 2026**.
- Stack: **React** (frontend) + **Python** (backend) + **Docker**.
- Deployment target: **Vercel** (the human does this manually — the agent must NOT deploy, only make the repo ready).
- README must **explicitly state that AI tools were used**.

**Implicit deliverables from the brief** (keep light, no over-engineering):

- A client-pitch-ready app (clear, readable UI).
- A README that lets an internal technical lead understand design + implementation.

---

## 2. Domain primer (understand before coding)

- **Day-ahead market:** electricity for delivery day `D` is bought on day `D-1`, before a gate-closure time (roughly mid-morning UK time; exact time depends on the venue). The buyer only knows forecasts **published before that cutoff**.
- **Wind is weather-dependent**, so the buyer needs: (a) the best forecast known at decision time, (b) how wrong such forecasts typically are.
- **Sign convention (use everywhere):** `error = forecast − actual` (MW).
  - Positive → over-forecast → buyer would under-buy thermal/other power.
  - Negative → under-forecast → buyer would over-buy.
- **Forecast horizon** = `startTime − publishTime` (hours). Same target time gets many forecasts published at different times; horizon tells how far ahead each was made.
- **Timezone:** January has no BST, so UTC == UK local time for the whole scope. Store/compute in **UTC**, display in UTC and say so in the UI footer. Still keep all timestamps tz-aware.
- Units: **MW** (megawatts). Resolution: **30 minutes** (verify for WINDFOR — see §3).

---

## 3. Data access (Elexon BMRS)

### 3.1 Datasets

| Purpose | Dataset | Docs page (given) | Filter | Fields we use |
|---|---|---|---|---|
| Actuals | `FUELHH` | https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream | `fuelType == "WIND"` | `startTime`, `generation` (also `settlementDate`, `settlementPeriod`, `fuelType` if present) |
| Forecasts | `WINDFOR` | https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream | none | `startTime`, `publishTime`, `generation` |

### 3.2 How to call the API (verify — do not trust blindly)

- The BMRS API is public; **no API key is required** for these endpoints (verify on the docs page).
- Likely base URL: `https://data.elexon.co.uk/bmrs/api/v1`
- Likely stream endpoints:
  - `GET /datasets/FUELHH/stream`
  - `GET /datasets/WINDFOR/stream`
- Likely query parameters (**confirm exact names on the docs page / Swagger / OpenAPI JSON before use**):
  - FUELHH: `settlementDateFrom`, `settlementDateTo`, `fuelType` (repeatable)
  - WINDFOR: `publishDateTimeFrom`, `publishDateTimeTo` (and possibly start-time filters)
- Always request JSON (`Accept: application/json` / `format=json` if supported).
- **Chunk requests** (e.g. 1–7 days per call; the stream endpoints may cap the date range). Add a short sleep between calls, retry with backoff on 429/5xx, set a timeout.
- Fetch window (default, subject to decision D1 in §10):
  - Actuals: `2026-01-01` → `2026-02-02`
  - Forecasts: `publishTime` from `2025-12-31` → `2026-02-01`
  - Rationale: decisions made on Jan 1–31 are for delivery days Jan 2–Feb 1.

### 3.3 Things to verify on first contact (Phase 1)

1. Exact field names, casing and types in real responses (print 3 sample rows of each).
2. Whether `startTime`/`publishTime` are ISO-8601 UTC strings (`...Z`).
3. WINDFOR granularity: **30-min or hourly?** If hourly, DO NOT silently interpolate — raise a design question (§10 D6).
4. Max forecast horizon present in the data (expected up to ~48h) and typical publish frequency.
5. Duplicates / missing half-hours in actuals; missing forecast coverage for any delivery day.
6. Whether `FUELHH` returns all fuel types (filter to `WIND` client-side if the API filter doesn't work).
7. Sanity checks: no negative generation, values plausible for GB wind (single-digit to ~20,000+ MW).

### 3.4 If the agent cannot access the data — **stuck protocol**

You may be blocked by network sandboxing, rate limits, an API change, or being unable to browse the docs. **Do not invent or synthesize data. Do not continue with fake data silently.**

Instead, stop and send this message:

```
🛑 BLOCKED — need your help
What I was trying to do: <e.g., call WINDFOR stream for 2026-01-01..07>
What happened: <exact error / status code / empty response>
What I need from you (pick one):
  A) Open this URL in your browser and paste the JSON/CSV here: <exact URL>
  B) Download the file and drop it at: getset/backend/data/raw/<name>
  C) Paste the API's parameter list / sample response from the docs page
  D) Allow network access for domain: <domain>
After you provide it I will: <next step>
```

Fallback the human can use: download the data from the BMRS website/API manually and place CSV/JSON files under `backend/data/raw/`. The fetch script must therefore **also accept local raw files** (`--from-local` flag) and normalize them identically.

---

## 4. Core logic definitions (implement exactly)

1. **Normalize**
   - Actuals → columns: `start_time` (UTC), `actual_mw`.
   - Forecasts → columns: `start_time` (UTC), `publish_time` (UTC), `forecast_mw`, plus derived `horizon_h = (start_time − publish_time)/1h`.
   - Drop rows with `horizon_h < 0`. De-duplicate on key (`start_time`, `publish_time`).
2. **Decision cutoff** for delivery day `D`: `cutoff = (D − 1 day) at cutoff_hour:00 UTC`.
   - `cutoff_hour` is a parameter (default decided in D2, §10).
3. **Latest forecast at decision time** for each `start_time` in delivery day `D` (00:00–23:30 UTC):
   - among forecasts with `publish_time ≤ cutoff`, take the one with the **max `publish_time`**.
   - If none exists for a slot → leave it empty (null) and report the gap. **Never forward-fill or interpolate.**
4. **Accuracy dataset (decision-time basis):** join the latest-at-cutoff forecast for each slot with the actual; keep rows where both exist.
5. **Metrics** (all in MW unless noted; computed on joined, non-null pairs; always return `n`):
   - `ME` (bias) = mean(error)
   - `MAE` = mean(|error|)
   - `RMSE`
   - `nMAE_pct` = MAE / mean(actual) × 100  *(do NOT use MAPE — wind near 0 MW makes it explode; mention this in README)*
   - `P90_abs_error`, `P95_abs_error`
   - `max_over_forecast`, `max_under_forecast`
6. **Breakdowns:**
   - **Overall** (decision-time basis) for the selected date range.
   - **By horizon:** use *all* forecasts (not just decision-time ones) joined to actuals, grouped into horizon bins (default 6h bins: 0–6, 6–12, … up to max horizon). Show how error grows with horizon.
   - **By hour of day** (decision-time basis).
   - **Daily** MAE/bias (decision-time basis) for a trend line.
   - **Error distribution** (histogram bins of error, decision-time basis).
7. **Optional uncertainty band (only if user approves in D3):** for the forecast view, show `forecast + P10/P90 of historical error at the same horizon` as a band. Computed from the January data, clearly labelled "historical error band, not a statistical guarantee".

---

## 5. Scope guardrails — "no over-engineering"

**IN scope:** fetch + clean data, two views (Forecast, Accuracy), simple REST API, Docker, README, minimal tests for core logic, Vercel-ready layout.

**OUT of scope (do not build, do not suggest unless asked):**
- Auth, users, roles, databases (Postgres/Redis/etc.), caching layers, message queues.
- Live scheduled ingestion, background jobs, websockets.
- Any data source other than Elexon FUELHH/WINDFOR (no demand data, no prices, no weather).
- ML models / own forecasting.
- State-management libraries, routers, UI kits, CSS frameworks, i18n, dark mode.
- Terraform, Kubernetes, CI pipelines.
- Procurement/volume calculators (we have no demand data).

If you think something outside this list is *necessary*, ask via §10 decision protocol instead of building it.

---

## 6. Tech decisions already made (don't re-ask)

| Area | Choice | Why |
|---|---|---|
| Backend | Python 3.12, **FastAPI**, **pandas**, `httpx` (fetch script), `uvicorn` | Simple, typed, Vercel-compatible |
| Data storage | **Static snapshot files** (gzip CSV) committed in `backend/data/processed/`, loaded once at startup | No DB; no live API dependency at runtime; works on Vercel serverless; reproducible |
| Fetch | `backend/scripts/fetch_data.py` (run manually, not at runtime) | Separates ingestion from serving |
| Frontend | **React + Vite + TypeScript**, **Recharts**, plain CSS, native `fetch`; tabs via component state (no router) | Minimal |
| Tests | `pytest` for backend core logic only | Enough for review |
| Containers | `backend/Dockerfile`, `frontend/Dockerfile` (multi-stage → nginx), root `docker-compose.yml` | Brief requires Docker |
| Parquet | **Not used** (pyarrow is heavy for serverless) | Use gzip CSV |

---

## 7. Target repo structure

```
getset/
├── CLAUDE.md / AGENTS.md      # this plan (identical copies, auto-loaded by the agent)
├── PROGRESS.md                # one line per phase: status
├── README.md                  # design, run instructions, assumptions, AI-usage disclosure
├── docker-compose.yml
├── vercel.json                # (Phase 4, per decision D4)
├── api/
│   └── index.py               # Vercel entrypoint -> imports backend app (Phase 4, per D4)
├── docs/
│   └── PITCH.md              # 1-page client pitch outline (Phase 4)
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, routes, CORS
│   │   ├── config.py          # constants: paths, default cutoff_hour, horizon bin size
│   │   ├── data_loader.py     # load processed CSVs once -> DataFrames
│   │   ├── analysis.py        # pure functions: latest-at-cutoff, join, metrics, breakdowns
│   │   └── schemas.py         # Pydantic response models
│   ├── scripts/
│   │   └── fetch_data.py      # fetch from Elexon (or --from-local), normalize, write processed CSVs
│   ├── data/
│   │   ├── raw/               # optional manual drops (gitignored if large)
│   │   └── processed/         # actuals_wind.csv.gz, forecasts_wind.csv.gz
│   ├── tests/
│   │   └── test_analysis.py
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx            # header, tabs, footer (timezone/units note)
    │   ├── api.ts             # typed fetch helpers
    │   ├── components/
    │   │   ├── ForecastView.tsx
    │   │   ├── AccuracyView.tsx
    │   │   ├── Controls.tsx
    │   │   └── MetricCard.tsx
    │   └── styles.css
    ├── index.html
    ├── package.json
    ├── vite.config.ts         # dev proxy /api -> http://localhost:8000
    ├── nginx.conf             # proxies /api to backend in docker
    └── Dockerfile
```

---

## 8. API contract (backend)

All timestamps are ISO-8601 UTC. Numbers in MW. Nulls for missing values.

| Endpoint | Params | Returns |
|---|---|---|
| `GET /api/health` | – | `{status:"ok"}` |
| `GET /api/meta` | – | `{data_start, data_end, delivery_days:[...], default_cutoff_hour, horizon_max_h, n_actual_rows, n_forecast_rows, snapshot_created_at}` |
| `GET /api/forecast` | `delivery_date` (YYYY-MM-DD), `cutoff_hour` (0–23, default from config) | `{delivery_date, cutoff_time, series:[{start_time, forecast_mw, publish_time, horizon_h, actual_mw}], coverage:{expected_slots, forecast_slots}, latest_publish_time}` — `actual_mw` included for hindsight overlay (UI toggle, off by default) |
| `GET /api/accuracy` | `start_date`, `end_date` (delivery days), `cutoff_hour` | `{params, overall:{n,ME,MAE,RMSE,nMAE_pct,P90_abs_error,P95_abs_error,max_over_forecast,max_under_forecast}, by_horizon:[{bin, n, ME, MAE, RMSE}], by_hour:[{hour, n, ME, MAE}], daily:[{date, n, ME, MAE}], error_histogram:[{bin_start, bin_end, count}]}` |

Validation: 422 for bad dates; 404/400 if the date is outside the January-decision window; clear error messages.

---

## 9. Frontend spec (keep it clean, client-pitch ready)

**Layout:** header ("getset — UK Wind Forecast Monitor"), two tabs, footer ("Source: Elexon BMRS · FUELHH & WINDFOR · times in UTC (= UK time in January) · MW").

**Tab 1 — Forecast (Req. 1):**
- Controls: delivery date picker (limited to valid days), decision cutoff hour (default per D2), toggle "Show actual (hindsight)".
- Summary strip: decision cutoff time, latest forecast publish time used, slot coverage (e.g. 48/48).
- Chart: line of the forecast available at cutoff across the 48 half-hours of the delivery day; optional actual overlay (dashed); optional error band if D3 = yes.
- Tooltip shows `start_time`, forecast, publish time, horizon.
- Clear empty/gap state if forecasts missing for slots.

**Tab 2 — Accuracy (Req. 2):**
- Controls: date range (delivery days), cutoff hour.
- Metric cards: MAE, RMSE, Bias (ME), nMAE %, P95 abs error, sample size `n` — each with a one-line plain-English tooltip (e.g. "On average the forecast is off by X MW").
- Charts: (a) error vs horizon (bar/line of MAE & bias per horizon bin), (b) MAE by hour of day, (c) daily MAE/bias trend, (d) error histogram.
- A short "How to read this" note explaining sign convention (positive = over-forecast).

**General UX:** loading + error states, responsive down to laptop width, readable fonts, consistent colours, axis labels with units. No animations needed.

---

## 10. Design decisions — ask the human (with options)

### 10.1 Decision protocol (use whenever a real design choice appears)

Never silently pick for a decision that changes behaviour or scope. Ask using this format and **wait**:

```
🤔 DESIGN DECISION NEEDED — <ID>: <title>
Context: <2–3 lines on why this matters for the client/product>
Options:
  A) <option> — pros / cons
  B) <option> — pros / cons
  C) <option> — pros / cons
My recommendation: <letter> because <reason>
Default if you just say "go with your recommendation": <letter>
```

Don't ask about trivia (variable names, folder styling, minor CSS). Batch related questions into one message.

### 10.2 Known decisions (pre-filled; ask at the indicated time)

**D1 — "January 2026" window** *(ask at end of Phase 1, before Phase 2)*
- A) Delivery days **Jan 2 – Feb 1** (decisions are *made* in January, delivery is the following day). **← recommended**, literal reading of "decisions made in January"
- B) Delivery days **Jan 1 – Jan 31** (targets inside January; decisions Dec 31 – Jan 30)
- C) Only forecasts *published* in January for any target time (loosest)

**D2 — Decision cutoff time (default `cutoff_hour`)** *(ask at end of Phase 1)*
- A) **09:00 UTC on D-1** — slightly conservative vs. typical gate closure, simple. **← recommended**
- B) 10:00 UTC on D-1
- C) 12:00 UTC on D-1 (noon)
- In all cases the UI exposes cutoff as an adjustable control.

**D3 — Show a historical error band on the forecast chart?** *(ask at end of Phase 2)*
- A) Yes: P10–P90 of historical error at the same horizon as a shaded band — directly supports "decide considering quantified error". **← recommended**
- B) No: keep error only in the Accuracy tab (strictest reading of scope)

**D4 — Vercel layout (to make the repo deployable)** *(ask at start of Phase 4)*
- A) **Single Vercel project**: frontend built from `frontend/`, FastAPI as a Python serverless function via `api/index.py` at repo root, same-origin `/api`. **← recommended** (simplest, no CORS)
- B) Two Vercel projects (frontend + backend separately) with CORS and an env-var API URL

**D5 — Charting library** *(already decided: Recharts; only ask if it can't render something needed)*

**D6 — If WINDFOR turns out to be hourly (not 30-min)** *(ask immediately if it happens)*
- A) Compare on hourly resolution (aggregate actuals to hourly mean) — no fabricated data. **← recommended**
- B) Repeat each hourly forecast value for both half-hours (step) — transparent, but assumption-laden
- C) Linear interpolation — smoother but invents values

---

## 11. Agent operating rules

1. **Phase gating:** finish a phase → run its checks → send Phase Report → **wait for "continue"**.
2. **Stuck protocol:** §3.4 whenever you cannot access external info.
3. **Decision protocol:** §10.1 for real design choices.
4. **No fabricated data**, ever. No hard-coded demo numbers in the app.
5. **Self-review before every report:** re-read your own diff critically — look for bugs, wrong timezone handling, sign errors, off-by-one on cutoff comparisons (`≤` vs `<`), unhandled nulls, scope creep. Fix, then report what you found.
6. Keep code small, typed, commented only where logic is non-obvious. Pure functions in `analysis.py` so they're testable.
7. Commit at the end of each phase with a clear message (`phase-1: data layer`, etc.). Do **not** push or deploy unless asked.
8. Never run destructive commands (rm -rf outside the project, force pushes).
9. If a library version or API behaviour is uncertain, check docs/run a quick test instead of guessing.

### Phase Report template (send at the end of every phase)

```
✅ PHASE <n> COMPLETE — <name>
Included in this phase:
  - <what was built, concise bullets>
How I verified it: <commands run / checks / sample outputs>
Self-review findings (and fixes): <bullets>
Assumptions I made: <bullets>
Open questions / decisions for you: <use §10.1 format if any>
Not done yet (next phase): <1–2 lines>
Reply "continue" to start Phase <n+1>.
```

---

## 12. Phases

### PHASE 1 — Project setup + data layer *(foundation)*

**Goal:** trustworthy, cleaned January data snapshot on disk, and a clear understanding of the real API behaviour.

Tasks:
1. Create `getset/` structure (§7), `git init` (if not already), `.gitignore` (node_modules, `__pycache__`, `.venv`, `dist`, `backend/data/raw/` if large).
2. Backend skeleton: `requirements.txt` (fastapi, uvicorn, pandas, httpx, pytest), venv instructions.
3. **Explore the API** (§3.2–3.3): confirm params and field names; print sample rows; check WINDFOR granularity & max horizon. Follow the stuck protocol if blocked.
4. Write `scripts/fetch_data.py`:
   - CLI: `--start`, `--end`, `--from-local <dir>`; chunked requests, retries, timeouts, polite delay.
   - Filter FUELHH to `WIND`; normalize columns per §4.1; de-dup; UTC-aware timestamps.
   - Write `backend/data/processed/actuals_wind.csv.gz` and `forecasts_wind.csv.gz` + a small `snapshot_meta.json` (fetch time, row counts, date ranges).
5. Data-quality report printed by the script: row counts, missing half-hours in actuals, forecast coverage per delivery day, horizon min/max, publish-frequency summary, any anomalies.
6. Write `docs`-style notes in a temporary `backend/data/DATA_NOTES.md` (findings that will feed README).

Acceptance:
- Both processed files exist, reproducible via one command.
- Actuals cover the chosen window with ≤ documented gaps; forecasts cover each delivery day.
- Findings reported accurately, including surprises.

**Report must include:** discovered API params, row counts, granularity/horizon findings, data gaps, and **ask D1 and D2** (plus D6 if triggered).

---

### PHASE 2 — Backend API + core analytics *(logic)*

**Goal:** correct, tested computation of "latest forecast at decision time" and accuracy metrics, exposed via API.

Tasks:
1. `config.py` (defaults from D1/D2), `data_loader.py` (load once at startup, validate files exist with a clear error).
2. `analysis.py` — pure functions per §4:
   - `latest_forecast_at_cutoff(forecasts, delivery_date, cutoff_hour)`
   - `build_accuracy_frame(...)`, `compute_metrics(df)`
   - `by_horizon(...)`, `by_hour(...)`, `daily(...)`, `error_histogram(...)`
3. `schemas.py` + `main.py` endpoints per §8, input validation, CORS for `http://localhost:5173`.
4. `tests/test_analysis.py` — at minimum:
   - picks the latest publish ≤ cutoff, **ignores** a forecast published after cutoff;
   - cutoff boundary: forecast published exactly at cutoff **is** included;
   - horizon calculation;
   - metrics on a tiny hand-computed example (ME sign convention, MAE, RMSE);
   - missing slots stay null (no fill).
5. Manual sanity run: call each endpoint, eyeball results (e.g. MAE should be a plausible fraction of mean wind output; error should generally grow with horizon).

Acceptance:
- `pytest` passes; `uvicorn app.main:app --reload` serves all endpoints; payloads match §8.

**Report must include:** sample payloads (trimmed), headline metrics for January, test results, any surprising results, and **ask D3**.

---

### PHASE 3 — Frontend *(the product)*

**Goal:** a clean, pitch-ready React UI for both requirements.

Tasks:
1. Vite + React + TS scaffold in `frontend/`, Recharts, dev proxy to `:8000`.
2. `api.ts` typed helpers; `App.tsx` with header, tabs, footer note.
3. **ForecastView** (§9 Tab 1) with controls, summary strip, chart, tooltip, gap/empty/loading/error states, optional band if D3 = yes.
4. **AccuracyView** (§9 Tab 2) with metric cards (+ plain-English tooltips), four charts, sign-convention note.
5. Polish: consistent palette, units on axes, readable at laptop widths, no console errors.
6. Run `npm run build` and a manual click-through of both tabs with real data.

Acceptance:
- Both views work end-to-end against the local backend; build passes with no TS errors.
- A non-technical person can tell: "what's the latest forecast I'd have at 09:00 for tomorrow?" and "how wrong are these forecasts typically, and does it get worse further ahead?"

**Report must include:** list of components, what each chart shows, screenshots if your tooling allows (otherwise a description), known limitations.

---

### PHASE 4 — Docker, docs, Vercel-readiness *(delivery)*

**Goal:** one-command local run, reviewer-friendly docs, and a repo the human can deploy to Vercel manually.

Tasks:
1. **Ask D4** first.
2. Docker: `backend/Dockerfile` (python slim, non-root, uvicorn), `frontend/Dockerfile` (node build → nginx), `nginx.conf` proxying `/api`, root `docker-compose.yml`. Verify `docker compose up --build` serves the app at `http://localhost:3000` (or chosen port) with working data.
3. Vercel-readiness (per D4): `vercel.json`, `api/index.py` entrypoint, ensure `backend/data/processed/*` is included in the function bundle, requirements trimmed to what runtime needs, frontend uses same-origin `/api`. **Do not deploy.** Run a local sanity check if possible (`vercel dev` only if the human has the CLI; otherwise skip and say so).
4. **README.md** must contain:
   - What the app does (2–3 lines) + screenshot(s) or description.
   - **AI usage disclosure** (explicit: "This project was built with the assistance of AI coding tools (<tool names>)…").
   - Architecture overview + data flow (fetch script → snapshot → API → UI).
   - **Key definitions**: decision cutoff, latest-forecast selection, horizon, sign convention, each metric (and why nMAE instead of MAPE).
   - Assumptions & decisions (D1–D4 outcomes), data findings, known limitations.
   - How to run: local (venv + npm), Docker, how to refresh the snapshot, how to run tests.
   - Short "Design notes for reviewers": why static snapshot, why FastAPI+pandas, trade-offs.
5. `docs/PITCH.md` — one-page client pitch outline: the problem in the client's words, what the app shows (2 screens), how it supports a day-ahead decision, what the accuracy numbers say, limitations and next steps (framed as future work, not built).
6. Remove temporary files, ensure `.gitignore` is right, final commit.
7. Final **full self-review pass** (checklist in §14).

Acceptance:
- Fresh clone → `docker compose up --build` works.
- README complete and honest. Repo ready for the human's Vercel import.

**Report must include:** exact run commands, what to set in Vercel (framework/root dir/build/output settings) — see §13.

---

## 13. Manual Vercel steps (for the human, not the agent)

*(Exact settings are finalized in the Phase 4 report according to D4; this is the expected shape for option A.)*

1. Push the repo to GitHub as `getset`.
2. Vercel → *Add New Project* → import `getset`.
3. Root directory: repo root. Framework/build: as given in the Phase 4 report (frontend `npm run build` → `frontend/dist`; Python function from `api/index.py`).
4. Deploy, then open the URL and test both tabs. If `/api/*` 404s or the function reports a missing data file, send the error to the agent.
5. Add the live URL + repo link to the README header.

---

## 14. Final self-review checklist (Definition of Done)

- [ ] Only Elexon FUELHH (WIND) and WINDFOR used; no other data.
- [ ] Only January-2026-decision window included, per D1.
- [ ] Forecast chosen = latest `publish_time ≤ cutoff`; boundary tested.
- [ ] `error = forecast − actual` everywhere; UI explains it.
- [ ] Timestamps UTC-aware; UI states UTC (= UK time in January).
- [ ] No filling/interpolation of missing data; gaps are visible in UI.
- [ ] Metrics reported with `n`; no MAPE.
- [ ] Both user requirements are demonstrably met in the UI.
- [ ] `pytest` green; `npm run build` green; `docker compose up --build` works.
- [ ] README includes AI-usage disclosure, definitions, assumptions, run instructions.
- [ ] No out-of-scope features (§5) were built.
- [ ] Repo/folder name is `getset`.
