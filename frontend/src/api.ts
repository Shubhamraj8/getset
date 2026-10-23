/**
 * api.ts — Typed API client for the getset backend.
 */

export interface MetaResponse {
  data_start: string;
  data_end: string;
  delivery_days: string[];
  default_cutoff_hour: number;
  horizon_max_h: number;
  n_actual_rows: number;
  n_forecast_rows: number;
  snapshot_created_at?: string;
}

export interface ForecastSeriesItem {
  start_time: string;
  forecast_mw: number;
  publish_time: string;
  horizon_h: number;
  actual_mw?: number | null;
  band_lower_mw?: number | null;
  band_upper_mw?: number | null;
}

export interface ForecastCoverage {
  expected_slots: number;
  forecast_slots: number;
}

export interface ForecastResponse {
  delivery_date: string;
  cutoff_time: string;
  series: ForecastSeriesItem[];
  coverage: ForecastCoverage;
  latest_publish_time?: string | null;
}

export interface OverallMetrics {
  n: number;
  ME?: number | null;
  MAE?: number | null;
  RMSE?: number | null;
  nMAE_pct?: number | null;
  P90_abs_error?: number | null;
  P95_abs_error?: number | null;
  max_over_forecast?: number | null;
  max_under_forecast?: number | null;
}

export interface HorizonBin {
  bin: string;
  n: number;
  ME: number;
  MAE: number;
  RMSE: number;
}

export interface HourBin {
  hour: number;
  n: number;
  ME: number;
  MAE: number;
}

export interface DailyBin {
  date: string;
  n: number;
  ME: number;
  MAE: number;
}

export interface ErrorHistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface AccuracyResponse {
  params: {
    start_date: string;
    end_date: string;
    cutoff_hour: number;
  };
  overall: OverallMetrics;
  by_horizon: HorizonBin[];
  by_hour: HourBin[];
  daily: DailyBin[];
  error_histogram: ErrorHistogramBin[];
}

const API_BASE = '/api';

export async function fetchMeta(): Promise<MetaResponse> {
  const res = await fetch(`${API_BASE}/meta`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch metadata (${res.status})`);
  }
  return res.json();
}

export async function fetchForecast(deliveryDate: string, cutoffHour: number): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    delivery_date: deliveryDate,
    cutoff_hour: cutoffHour.toString(),
  });
  const res = await fetch(`${API_BASE}/forecast?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch forecast (${res.status})`);
  }
  return res.json();
}

export async function fetchAccuracy(
  startDate: string,
  endDate: string,
  cutoffHour: number
): Promise<AccuracyResponse> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    cutoff_hour: cutoffHour.toString(),
  });
  const res = await fetch(`${API_BASE}/accuracy?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch accuracy (${res.status})`);
  }
  return res.json();
}
