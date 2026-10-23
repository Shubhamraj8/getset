import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchAccuracy, type AccuracyResponse } from '../api';
import { AccuracyControls } from './Controls';
import { MetricCard } from './MetricCard';

interface AccuracyViewProps {
  deliveryDays: string[];
  defaultStartDate: string;
  defaultEndDate: string;
  defaultCutoffHour: number;
}

export const AccuracyView: React.FC<AccuracyViewProps> = ({
  deliveryDays,
  defaultStartDate,
  defaultEndDate,
  defaultCutoffHour,
}) => {
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);
  const [cutoffHour, setCutoffHour] = useState<number>(defaultCutoffHour);

  const [data, setData] = useState<AccuracyResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAccuracy(startDate, endDate, cutoffHour)
      .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load accuracy'); setLoading(false); } });

    return () => { cancelled = true; };
  }, [startDate, endDate, cutoffHour]);

  const overall = data?.overall;

  /* ── Data transforms ──────────────────────────────── */

  const dailyData = (data?.daily || []).map((d) => ({
    date: d.date.slice(5),
    fullDate: d.date,
    mae: d.MAE,
    me: d.ME,
    n: d.n,
  }));

  const hourData = (data?.by_hour || []).map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    mae: h.MAE,
    me: h.ME,
    n: h.n,
  }));

  const horizonData = (data?.by_horizon || []).map((h) => ({
    bin: `${h.bin}h`,
    mae: h.MAE,
    me: h.ME,
    rmse: h.RMSE,
    n: h.n,
  }));

  const histData = (data?.error_histogram || []).map((b) => ({
    bin: `${b.bin_start >= 0 ? '+' : ''}${b.bin_start}`,
    mid: (b.bin_start + b.bin_end) / 2,
    count: b.count,
  }));

  return (
    <div>
      {/* Controls */}
      <AccuracyControls
        deliveryDays={deliveryDays}
        startDate={startDate}
        endDate={endDate}
        onSelectStartDate={setStartDate}
        onSelectEndDate={setEndDate}
        cutoffHour={cutoffHour}
        onChangeCutoffHour={setCutoffHour}
      />

      {/* Sign convention banner */}
      <div className="convention-banner">
        <span className="convention-formula">error = forecast − actual (MW)</span>
        <span className="convention-note">
          <span className="pos">Positive → over-forecast</span> (under-bought day-ahead) ·{' '}
          <span className="neg">Negative → under-forecast</span> (over-bought day-ahead)
        </span>
      </div>

      {error && (
        <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', color: '#fca5a5', marginBottom: '1rem', fontSize: '0.82rem' }}>
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="state-box">
          <div className="spinner" />
          <p>Computing accuracy metrics…</p>
        </div>
      ) : !data || !overall || overall.n === 0 ? (
        <div className="state-box">
          <p>No paired forecast-actual observations for this range.</p>
        </div>
      ) : (
        <>
          {/* Headline metrics */}
          <div className="stats-row">
            <MetricCard
              label="Mean Absolute Error"
              value={overall.MAE?.toLocaleString()}
              unit=" MW"
              accent="cyan"
              footer="Average magnitude of forecast miss"
              trend={{ direction: 'neutral', text: `${overall.nMAE_pct}% nMAE` }}
            />
            <MetricCard
              label="Systematic Bias (ME)"
              value={overall.ME != null ? (overall.ME > 0 ? `+${overall.ME.toLocaleString()}` : overall.ME.toLocaleString()) : '—'}
              unit=" MW"
              accent="amber"
              footer="Net over-prediction across January"
              trend={{ direction: overall.ME != null && overall.ME > 0 ? 'up' : 'down', text: overall.ME != null && overall.ME > 0 ? 'Over' : 'Under' }}
            />
            <MetricCard
              label="RMSE"
              value={overall.RMSE?.toLocaleString()}
              unit=" MW"
              accent="purple"
              footer="Penalises large misses more heavily"
              trend={{ direction: 'neutral', text: 'RMS' }}
            />
            <MetricCard
              label="P95 Tail Risk"
              value={overall.P95_abs_error?.toLocaleString()}
              unit=" MW"
              accent="rose"
              footer="95% of errors within this envelope"
              trend={{ direction: 'down', text: '95th' }}
            />
            <MetricCard
              label="Sample Size"
              value={overall.n.toLocaleString()}
              unit=" hrs"
              accent="emerald"
              footer="Complete paired observations"
              trend={{ direction: 'up', text: '100%' }}
            />
          </div>

          {/* Chart row: Horizon + Risk summary */}
          <div className="grid-2-wide-left">
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <div className="chart-card-title">Error vs Forecast Lead Horizon</div>
                  <div className="chart-card-desc">
                    All published forecasts grouped into 6h lead bins. MAE grows with horizon.
                  </div>
                </div>
              </div>
              <div className="chart-area-md">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={horizonData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="bin" stroke="#334155" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                    <YAxis stroke="#334155" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }} unit=" MW" />
                    <Tooltip content={<GenericTooltip />} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '10px', fontSize: '0.72rem' }} />
                    <Bar dataKey="mae" name="MAE" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="me" name="Bias (ME)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Risk summary card */}
            <div className="risk-summary-card">
              <div className="risk-summary-title">Risk Summary</div>

              <div className="risk-row">
                <span className="risk-label">Max Over-Forecast</span>
                <span className="risk-value" style={{ color: 'var(--accent-rose)' }}>
                  +{overall.max_over_forecast?.toLocaleString()} MW
                </span>
              </div>
              <div className="risk-row">
                <span className="risk-label">Max Under-Forecast</span>
                <span className="risk-value" style={{ color: 'var(--accent-emerald)' }}>
                  {overall.max_under_forecast?.toLocaleString()} MW
                </span>
              </div>
              <div className="risk-row">
                <span className="risk-label">P90 Abs Error</span>
                <span className="risk-value">{overall.P90_abs_error?.toLocaleString()} MW</span>
              </div>
              <div className="risk-row">
                <span className="risk-label">P95 Abs Error</span>
                <span className="risk-value">{overall.P95_abs_error?.toLocaleString()} MW</span>
              </div>
              <div className="risk-row">
                <span className="risk-label">Normalized MAE</span>
                <span className="risk-value">{overall.nMAE_pct}%</span>
              </div>

              {/* Insight card */}
              <div className="insight-card" style={{ marginTop: '0.5rem' }}>
                <div className="insight-title">Hedging Implication</div>
                <div className="insight-text">
                  Persistent over-forecast bias ({overall.ME != null && overall.ME > 0 ? `+${overall.ME.toLocaleString()}` : overall.ME?.toLocaleString()} MW) means actual wind frequently under-delivers. Consider a thermal buffer on day-ahead auction.
                </div>
                <div className="insight-metrics">
                  <div className="insight-metric-row">
                    <span>Suggested Buffer</span>
                    <span className="insight-metric-badge">
                      +{overall.MAE ? Math.round(overall.MAE * 0.5) : '—'}
                    </span>
                  </div>
                  <div className="insight-metric-row">
                    <span>Tail Risk Envelope</span>
                    <span className="insight-metric-badge">P95</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts row: Daily + Hourly */}
          <div className="charts-grid-2">
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <div className="chart-card-title">Daily Accuracy Trend</div>
                  <div className="chart-card-desc">Decision-time MAE and bias per delivery day.</div>
                </div>
              </div>
              <div className="chart-area-md">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="date" stroke="#334155" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                    <YAxis stroke="#334155" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }} unit=" MW" />
                    <Tooltip content={<DailyTooltip />} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '10px', fontSize: '0.72rem' }} />
                    <ReferenceLine y={0} stroke="#334155" />
                    <Line type="monotone" dataKey="mae" name="Daily MAE" stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 2.5 }} />
                    <Line type="monotone" dataKey="me" name="Daily Bias" stroke="#ec4899" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <div className="chart-card-title">Error by Hour of Day</div>
                  <div className="chart-card-desc">Intraday variation across 24 settlement hours (UTC).</div>
                </div>
              </div>
              <div className="chart-area-md">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="hour" stroke="#334155" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'var(--font-mono)' }} interval={2} />
                    <YAxis stroke="#334155" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }} unit=" MW" />
                    <Tooltip content={<GenericTooltip />} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '10px', fontSize: '0.72rem' }} />
                    <Bar dataKey="mae" name="MAE by Hour" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Error distribution histogram */}
          <div className="chart-card">
            <div className="chart-card-header">
              <div>
                <div className="chart-card-title">Error Distribution Histogram</div>
                <div className="chart-card-desc">
                  Frequency distribution of forecast error (positive = over-forecast). 500 MW bins.
                </div>
              </div>
              <div className="chart-tags">
                <span className="chart-tag">500 MW bins</span>
                <span className="chart-tag">Decision-time basis</span>
              </div>
            </div>
            <div className="chart-area-md">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histData} margin={{ top: 10, right: 20, left: 0, bottom: 35 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="bin"
                    stroke="#334155"
                    tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                    angle={-25}
                    textAnchor="end"
                    height={45}
                    label={{ value: 'Error (MW)', position: 'insideBottom', offset: -10, fill: '#475569', fontSize: 11 }}
                  />
                  <YAxis stroke="#334155" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }} unit=" hrs" />
                  <Tooltip content={<HistTooltip />} />
                  <Bar dataKey="count" name="Hours in Bin" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ── Tooltips ──────────────────────────────────────────────────────── */

const GenericTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-header">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="chart-tooltip-row">
          <span className="chart-tooltip-label">{p.name}:</span>
          <span className="chart-tooltip-value" style={{ color: p.color }}>{p.value?.toLocaleString()} MW</span>
        </div>
      ))}
      {payload[0]?.payload?.n != null && (
        <>
          <div className="chart-tooltip-divider" />
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-label">Sample:</span>
            <span className="chart-tooltip-value">{payload[0].payload.n} hrs</span>
          </div>
        </>
      )}
    </div>
  );
};

const DailyTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-header">{p.fullDate}</div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-label">Daily MAE:</span>
        <span className="chart-tooltip-value" style={{ color: '#22d3ee' }}>{p.mae?.toLocaleString()} MW</span>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-label">Daily Bias:</span>
        <span className="chart-tooltip-value" style={{ color: p.me > 0 ? '#ec4899' : '#10b981' }}>
          {p.me > 0 ? `+${p.me?.toLocaleString()}` : p.me?.toLocaleString()} MW
        </span>
      </div>
      <div className="chart-tooltip-divider" />
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-label">Hours:</span>
        <span className="chart-tooltip-value">{p.n}</span>
      </div>
    </div>
  );
};

const HistTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-header">Error: {label} MW</div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-label">Count:</span>
        <span className="chart-tooltip-value" style={{ color: '#22d3ee' }}>{payload[0]?.value?.toLocaleString()} hrs</span>
      </div>
    </div>
  );
};
