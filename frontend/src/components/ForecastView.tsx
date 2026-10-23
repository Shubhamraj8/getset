import React, { useEffect, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchForecast, type ForecastResponse } from '../api';
import { ForecastControls } from './Controls';
import { MetricCard } from './MetricCard';

interface ForecastViewProps {
  deliveryDays: string[];
  defaultDate: string;
  defaultCutoffHour: number;
}

export const ForecastView: React.FC<ForecastViewProps> = ({
  deliveryDays,
  defaultDate,
  defaultCutoffHour,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(defaultDate);
  const [cutoffHour, setCutoffHour] = useState<number>(defaultCutoffHour);
  const [showActual, setShowActual] = useState<boolean>(true);
  const [showErrorBand, setShowErrorBand] = useState<boolean>(true);

  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchForecast(selectedDate, cutoffHour)
      .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load forecast'); setLoading(false); } });

    return () => { cancelled = true; };
  }, [selectedDate, cutoffHour]);

  /* ── Chart data transform ─────────────────────────── */

  const chartData = (data?.series || []).map((item) => {
    const d = new Date(item.start_time);
    const hourLabel = `${String(d.getUTCHours()).padStart(2, '0')}:00`;
    return {
      time: hourLabel,
      start_time: item.start_time,
      forecast_mw: item.forecast_mw,
      actual_mw: item.actual_mw,
      publish_time: item.publish_time,
      horizon_h: item.horizon_h,
      band_lower: item.band_lower_mw,
      band_upper: item.band_upper_mw,
      band_range:
        item.band_lower_mw != null && item.band_upper_mw != null
          ? [item.band_lower_mw, item.band_upper_mw]
          : null,
      error_mw:
        item.actual_mw != null ? Math.round((item.forecast_mw - item.actual_mw) * 10) / 10 : null,
    };
  });

  /* ── Day-level summary stats ──────────────────────── */

  const forecasts = chartData.map((d) => d.forecast_mw);
  const peakMw = forecasts.length ? Math.round(Math.max(...forecasts)) : null;
  const troughMw = forecasts.length ? Math.round(Math.min(...forecasts)) : null;
  const meanMw = forecasts.length
    ? Math.round(forecasts.reduce((a, b) => a + b, 0) / forecasts.length)
    : null;

  const horizons = chartData.map((d) => d.horizon_h).filter((h): h is number => h != null);
  const minHorizon = horizons.length ? Math.min(...horizons).toFixed(0) : '—';
  const maxHorizon = horizons.length ? Math.max(...horizons).toFixed(0) : '—';

  const spreads = chartData
    .filter((d) => d.band_upper != null && d.band_lower != null)
    .map((d) => (d.band_upper as number) - (d.band_lower as number));
  const avgSpread = spreads.length
    ? Math.round(spreads.reduce((a, b) => a + b, 0) / spreads.length)
    : null;

  return (
    <div>
      {/* Controls */}
      <ForecastControls
        deliveryDays={deliveryDays}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        cutoffHour={cutoffHour}
        onChangeCutoffHour={setCutoffHour}
        showActual={showActual}
        onToggleActual={setShowActual}
        showErrorBand={showErrorBand}
        onToggleErrorBand={setShowErrorBand}
      />

      {/* Coverage bar */}
      {data && (
        <div className="coverage-bar">
          <div className="coverage-item">
            <span className="coverage-dot cyan" />
            <span className="coverage-text">
              Cutoff: <span className="coverage-value">{String(cutoffHour).padStart(2, '0')}:00 UTC (D-1)</span>
            </span>
          </div>
          <div className="coverage-item">
            <span className="coverage-dot green" />
            <span className="coverage-text">
              Coverage: <span className="coverage-value">{data.coverage.forecast_slots}/{data.coverage.expected_slots} slots</span>
            </span>
          </div>
          <div className="coverage-item">
            <span className="coverage-dot blue" />
            <span className="coverage-text">
              Horizons: <span className="coverage-value">{minHorizon}h – {maxHorizon}h</span>
            </span>
          </div>
          <div className="coverage-item">
            <span className="coverage-dot amber" />
            <span className="coverage-text">
              Last publish: <span className="coverage-value">
                {data.latest_publish_time ? data.latest_publish_time.slice(11, 16) + ' UTC' : '—'}
              </span>
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', color: '#fca5a5', marginBottom: '1rem', fontSize: '0.82rem' }}>
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="state-box">
          <div className="spinner" />
          <p>Reconstructing wind forecast at {String(cutoffHour).padStart(2, '0')}:00 UTC cutoff…</p>
        </div>
      ) : !data || chartData.length === 0 ? (
        <div className="state-box">
          <p>No forecast data available for {selectedDate} prior to cutoff.</p>
        </div>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="stats-row">
            <MetricCard
              label="Peak Forecast"
              value={peakMw?.toLocaleString()}
              unit=" MW"
              accent="cyan"
              footer="Maximum anticipated wind output"
              trend={{ direction: 'up', text: 'Peak' }}
            />
            <MetricCard
              label="Daily Mean"
              value={meanMw?.toLocaleString()}
              unit=" MW"
              accent="blue"
              footer="Average across 24 settlement hours"
              trend={{ direction: 'neutral', text: 'Avg' }}
            />
            <MetricCard
              label="Minimum Trough"
              value={troughMw?.toLocaleString()}
              unit=" MW"
              accent="rose"
              footer="Lowest wind — thermal cover needed"
              trend={{ direction: 'down', text: 'Low' }}
            />
            <MetricCard
              label="P10–P90 Spread"
              value={avgSpread ? `±${Math.round(avgSpread / 2).toLocaleString()}` : '—'}
              unit=" MW"
              accent="emerald"
              footer="Historical error uncertainty band"
              trend={{ direction: 'neutral', text: '80%' }}
            />
          </div>

          {/* Main forecast chart */}
          <div className="chart-card">
            <div className="chart-card-header">
              <div>
                <div className="chart-card-title">
                  Wind Generation Forecast — {selectedDate}
                </div>
                <div className="chart-card-desc">
                  Latest forecast known at {String(cutoffHour).padStart(2, '0')}:00 UTC on D-1.
                  {showErrorBand && ' Shaded band shows historical P10–P90 error at each lead horizon.'}
                </div>
              </div>
              <div className="chart-tags">
                <span className="chart-tag">GB National</span>
                <span className="chart-tag">Hourly</span>
                <span className="chart-tag">UTC</span>
              </div>
            </div>

            <div className="chart-area-lg">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 5, bottom: 15 }}>
                  <defs>
                    <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#334155"
                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  />
                  <YAxis
                    stroke="#334155"
                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    tickLine={false}
                    axisLine={false}
                    unit=" MW"
                  />
                  <Tooltip content={<ForecastTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '0.72rem' }}
                  />

                  {showErrorBand && (
                    <Area
                      type="monotone"
                      dataKey="band_range"
                      name="P10–P90 Error Envelope"
                      stroke="#0891b2"
                      strokeDasharray="2 2"
                      strokeOpacity={0.4}
                      fill="url(#bandFill)"
                    />
                  )}

                  <Line
                    type="monotone"
                    dataKey="forecast_mw"
                    name="Forecast at Cutoff"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: '#22d3ee', strokeWidth: 0 }}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                  />

                  {showActual && (
                    <Line
                      type="monotone"
                      dataKey="actual_mw"
                      name="Actual Generation"
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 2.5, fill: '#10b981', strokeWidth: 0 }}
                      activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ── Tooltip ───────────────────────────────────────────────────────── */

const ForecastTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-header">
        <span>Target: {p.time} UTC</span>
        <span>{p.start_time?.slice(0, 10)}</span>
      </div>

      <div className="chart-tooltip-row">
        <span className="chart-tooltip-label">Forecast:</span>
        <span className="chart-tooltip-value" style={{ color: '#22d3ee' }}>
          {p.forecast_mw?.toLocaleString()} MW
        </span>
      </div>

      {p.band_lower != null && p.band_upper != null && (
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-label">P10–P90:</span>
          <span className="chart-tooltip-value" style={{ color: '#38bdf8' }}>
            {p.band_lower.toLocaleString()} – {p.band_upper.toLocaleString()} MW
          </span>
        </div>
      )}

      {p.actual_mw != null && (
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-label">Actual:</span>
          <span className="chart-tooltip-value" style={{ color: '#10b981' }}>
            {p.actual_mw.toLocaleString()} MW
          </span>
        </div>
      )}

      {p.error_mw != null && (
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-label">Error:</span>
          <span className="chart-tooltip-value" style={{ color: p.error_mw > 0 ? '#f43f5e' : '#10b981' }}>
            {p.error_mw > 0 ? `+${p.error_mw.toLocaleString()}` : p.error_mw.toLocaleString()} MW
          </span>
        </div>
      )}

      <div className="chart-tooltip-divider" />

      <div className="chart-tooltip-row">
        <span className="chart-tooltip-label">Published:</span>
        <span className="chart-tooltip-value" style={{ fontSize: '0.72rem' }}>
          {p.publish_time?.slice(11, 16)} UTC
        </span>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-label">Horizon:</span>
        <span className="chart-tooltip-value">{p.horizon_h}h</span>
      </div>
    </div>
  );
};
