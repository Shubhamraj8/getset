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
import { type AccuracyResponse, fetchAccuracy } from '../api';
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
    let isCancelled = false;
    setLoading(true);
    setError(null);

    fetchAccuracy(startDate, endDate, cutoffHour)
      .then((res) => {
        if (!isCancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err.message || 'Failed to load accuracy evaluation');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [startDate, endDate, cutoffHour]);

  const overall = data?.overall;

  // Sign convention badge for bias
  const biasBadge =
    overall?.ME != null
      ? overall.ME > 50
        ? { text: 'Over-forecast bias', type: 'over' as const }
        : overall.ME < -50
        ? { text: 'Under-forecast bias', type: 'under' as const }
        : { text: 'Near neutral', type: 'neutral' as const }
      : undefined;

  // Format daily trend data
  const dailyData = (data?.daily || []).map((d) => ({
    date: d.date.slice(5), // MM-DD for clean x-axis
    fullDate: d.date,
    mae: d.MAE,
    me: d.ME,
    n: d.n,
  }));

  // Format hour of day data
  const hourData = (data?.by_hour || []).map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    mae: h.MAE,
    me: h.ME,
    n: h.n,
  }));

  // Format horizon bin data
  const horizonData = (data?.by_horizon || []).map((h) => ({
    bin: `${h.bin}h`,
    mae: h.MAE,
    me: h.ME,
    rmse: h.RMSE,
    n: h.n,
  }));

  // Format histogram data
  const histData = (data?.error_histogram || []).map((b) => ({
    bin: `${b.bin_start >= 0 ? '+' : ''}${b.bin_start} to ${b.bin_end >= 0 ? '+' : ''}${b.bin_end}`,
    mid: (b.bin_start + b.bin_end) / 2,
    count: b.count,
  }));

  return (
    <div>
      <AccuracyControls
        deliveryDays={deliveryDays}
        startDate={startDate}
        endDate={endDate}
        onSelectStartDate={setStartDate}
        onSelectEndDate={setEndDate}
        cutoffHour={cutoffHour}
        onChangeCutoffHour={setCutoffHour}
      />

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Domain Primer: Sign Convention Explainer */}
      <div className="callout-box">
        <div className="callout-title">
          <span>📐 Sign Convention & Decision Context</span>
        </div>
        <p>
          Forecast error is defined as{' '}
          <span className="callout-formula">error = forecast − actual (MW)</span>:
        </p>
        <ul style={{ paddingLeft: '1.25rem', marginTop: '0.35rem' }}>
          <li>
            <strong style={{ color: 'var(--accent-rose)' }}>Positive Error (&gt; 0)</strong>: Over-forecast. Wind generation turned out lower than anticipated, meaning the procurement desk would have under-bought alternative/thermal power on the day-ahead market.
          </li>
          <li>
            <strong style={{ color: 'var(--accent-emerald)' }}>Negative Error (&lt; 0)</strong>: Under-forecast. Actual wind generation exceeded expectations, meaning excess alternative power may have been procured.
          </li>
        </ul>
      </div>

      {loading ? (
        <div className="state-box">
          <div className="spinner" />
          <p>Evaluating forecast accuracy for {startDate} to {endDate}...</p>
        </div>
      ) : !data || !overall || overall.n === 0 ? (
        <div className="state-box">
          <span className="state-icon">📊</span>
          <p>No paired forecast-actual observations found for the selected range.</p>
        </div>
      ) : (
        <>
          {/* Top Metric Cards */}
          <div className="metrics-grid">
            <MetricCard
              title="MAE (Mean Absolute Error)"
              value={overall.MAE?.toLocaleString()}
              unit="MW"
              tooltipNote="Average magnitude of forecast error across all evaluated hours."
            />

            <MetricCard
              title="RMSE (Root Mean Square)"
              value={overall.RMSE?.toLocaleString()}
              unit="MW"
              tooltipNote="Root mean squared error; places higher penalty on large forecasting misses."
            />

            <MetricCard
              title="Bias (Mean Error)"
              value={overall.ME != null ? (overall.ME > 0 ? `+${overall.ME}` : overall.ME) : '—'}
              unit="MW"
              tooltipNote="Systematic bias. Positive indicates net tendency to over-predict."
              badge={biasBadge}
            />

            <MetricCard
              title="Normalized MAE"
              value={overall.nMAE_pct != null ? `${overall.nMAE_pct}%` : '—'}
              tooltipNote="MAE relative to average actual wind output (preferred over MAPE near zero)."
            />

            <MetricCard
              title="P95 Absolute Error"
              value={overall.P95_abs_error?.toLocaleString()}
              unit="MW"
              tooltipNote="95% of hourly forecast errors were smaller than this absolute magnitude."
            />

            <MetricCard
              title="Sample Size (n)"
              value={overall.n.toLocaleString()}
              unit="hours"
              tooltipNote="Total paired hourly decision-time forecast vs actual comparisons."
            />
          </div>

          {/* Row 1: Error vs Horizon & Daily Trend */}
          <div className="charts-grid-2col">
            {/* Chart 1: Error vs Horizon */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">Error vs Forecast Horizon (Lead Time)</h3>
                  <p className="chart-subtitle">
                    Evaluation of all published forecasts grouped into 6-hour horizon bins.
                  </p>
                </div>
              </div>
              <div className="chart-wrapper-compact">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={horizonData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2d4a" vertical={false} />
                    <XAxis
                      dataKey="bin"
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      unit=" MW"
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '8px' }} />
                    <Bar
                      dataKey="mae"
                      name="MAE (Magnitude)"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="me"
                      name="Bias (ME)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Daily Trend */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">Daily Forecast Accuracy Trend</h3>
                  <p className="chart-subtitle">
                    Daily decision-time MAE and Bias across January 2026 delivery days.
                  </p>
                </div>
              </div>
              <div className="chart-wrapper-compact">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={dailyData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2d4a" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      unit=" MW"
                    />
                    <Tooltip content={<CustomDailyTooltip />} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '8px' }} />
                    <ReferenceLine y={0} stroke="#334155" />
                    <Line
                      type="monotone"
                      dataKey="mae"
                      name="Daily MAE"
                      stroke="#06b6d4"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="me"
                      name="Daily Bias (ME)"
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={{ r: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: By Hour of Day & Error Distribution */}
          <div className="charts-grid-2col">
            {/* Chart 3: By Hour of Day */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">Accuracy by Hour of Delivery Day</h3>
                  <p className="chart-subtitle">
                    Intraday variation in forecast performance (00:00 to 23:00 UTC).
                  </p>
                </div>
              </div>
              <div className="chart-wrapper-compact">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hourData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2d4a" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      interval={2}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      unit=" MW"
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '8px' }} />
                    <Bar
                      dataKey="mae"
                      name="MAE (MW)"
                      fill="#8b5cf6"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: Error Distribution Histogram */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">Error Distribution (500 MW Bins)</h3>
                  <p className="chart-subtitle">
                    Frequency histogram of decision-time error (positive = over-forecast).
                  </p>
                </div>
              </div>
              <div className="chart-wrapper-compact">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={histData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2d4a" vertical={false} />
                    <XAxis
                      dataKey="bin"
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 9 }}
                      angle={-30}
                      textAnchor="end"
                      height={45}
                    />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      unit=" hrs"
                    />
                    <Tooltip content={<CustomHistTooltip />} />
                    <ReferenceLine x="0 to 500" stroke="#f59e0b" strokeDasharray="2 2" />
                    <Bar
                      dataKey="count"
                      name="Observation Count"
                      fill="#06b6d4"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Tooltip helpers
const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="custom-recharts-tooltip">
      <div className="tooltip-time">{label}</div>
      {payload.map((p: any, idx: number) => (
        <div key={idx} className="tooltip-row">
          <span className="tooltip-row-label">{p.name}:</span>
          <span className="tooltip-row-value" style={{ color: p.color || '#fff' }}>
            {p.value?.toLocaleString()} MW
          </span>
        </div>
      ))}
      {payload[0]?.payload?.n != null && (
        <div className="tooltip-row" style={{ marginTop: '0.25rem', borderTop: '1px solid #1f2d4a', paddingTop: '0.25rem' }}>
          <span className="tooltip-row-label">Sample (n):</span>
          <span className="tooltip-row-value">{payload[0].payload.n} hours</span>
        </div>
      )}
    </div>
  );
};

const CustomDailyTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="custom-recharts-tooltip">
      <div className="tooltip-time">{p.fullDate}</div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">Daily MAE:</span>
        <span className="tooltip-row-value" style={{ color: '#06b6d4' }}>
          {p.mae?.toLocaleString()} MW
        </span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">Daily Bias (ME):</span>
        <span className="tooltip-row-value" style={{ color: p.me > 0 ? '#f43f5e' : '#10b981' }}>
          {p.me > 0 ? `+${p.me?.toLocaleString()}` : p.me?.toLocaleString()} MW
        </span>
      </div>
      <div className="tooltip-row" style={{ marginTop: '0.25rem', borderTop: '1px solid #1f2d4a', paddingTop: '0.25rem' }}>
        <span className="tooltip-row-label">Evaluated slots:</span>
        <span className="tooltip-row-value">{p.n} hours</span>
      </div>
    </div>
  );
};

const CustomHistTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="custom-recharts-tooltip">
      <div className="tooltip-time">Error Range: {label} MW</div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">Frequency:</span>
        <span className="tooltip-row-value" style={{ color: '#06b6d4' }}>
          {p.count?.toLocaleString()} hours
        </span>
      </div>
    </div>
  );
};
