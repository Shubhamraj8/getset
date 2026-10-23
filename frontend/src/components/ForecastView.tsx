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
  const [showActual, setShowActual] = useState<boolean>(false);
  const [showErrorBand, setShowErrorBand] = useState<boolean>(true);

  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    fetchForecast(selectedDate, cutoffHour)
      .then((res) => {
        if (!isCancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err.message || 'Failed to load forecast data');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedDate, cutoffHour]);

  // Format chart series data
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
      // For Recharts range area
      band_range:
        item.band_lower_mw != null && item.band_upper_mw != null
          ? [item.band_lower_mw, item.band_upper_mw]
          : null,
      error_mw:
        item.actual_mw != null ? Math.round((item.forecast_mw - item.actual_mw) * 10) / 10 : null,
    };
  });

  // Calculate summary stats
  const horizons = chartData.map((d) => d.horizon_h).filter((h) => h != null);
  const minHorizon = horizons.length ? Math.min(...horizons).toFixed(1) : '—';
  const maxHorizon = horizons.length ? Math.max(...horizons).toFixed(1) : '—';

  return (
    <div>
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

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
        </div>
      )}

      {loading ? (
        <div className="state-box">
          <div className="spinner" />
          <p>Loading latest day-ahead forecast for {selectedDate}...</p>
        </div>
      ) : !data || chartData.length === 0 ? (
        <div className="state-box">
          <span className="state-icon">📡</span>
          <p>No forecast data available for {selectedDate} published prior to cutoff.</p>
        </div>
      ) : (
        <>
          {/* Summary Strip */}
          <div className="summary-strip">
            <div className="summary-tile">
              <span className="summary-tile-label">Decision Cutoff</span>
              <span className="summary-tile-value">
                {data.cutoff_time.replace('T', ' ').replace('Z', ' UTC')}
              </span>
              <span className="summary-tile-sub">Gate closure on D-1</span>
            </div>

            <div className="summary-tile">
              <span className="summary-tile-label">Latest Forecast Used</span>
              <span className="summary-tile-value">
                {data.latest_publish_time
                  ? data.latest_publish_time.replace('T', ' ').replace('Z', ' UTC')
                  : 'None'}
              </span>
              <span className="summary-tile-sub">Most recent publish ≤ cutoff</span>
            </div>

            <div className="summary-tile">
              <span className="summary-tile-label">Slot Coverage</span>
              <span className="summary-tile-value">
                {data.coverage.forecast_slots} / {data.coverage.expected_slots} slots
              </span>
              <span className="summary-tile-sub">
                {data.coverage.forecast_slots === data.coverage.expected_slots
                  ? 'Complete day-ahead coverage'
                  : `${data.coverage.expected_slots - data.coverage.forecast_slots} slots missing`}
              </span>
            </div>

            <div className="summary-tile">
              <span className="summary-tile-label">Forecast Horizon</span>
              <span className="summary-tile-value">
                {minHorizon}h – {maxHorizon}h
              </span>
              <span className="summary-tile-sub">Lead time from decision</span>
            </div>
          </div>

          {/* Missing slot callout if coverage is partial */}
          {data.coverage.forecast_slots < data.coverage.expected_slots && (
            <div className="callout-box" style={{ borderLeftColor: 'var(--accent-amber)' }}>
              <div className="callout-title" style={{ color: 'var(--accent-amber)' }}>
                ⚠️ Partial Day-Ahead Coverage
              </div>
              <p>
                Only {data.coverage.forecast_slots} of {data.coverage.expected_slots} target hours
                had forecasts published before the {String(cutoffHour).padStart(2, '0')}:00 UTC cutoff.
                Uncovered hours are left blank (never forward-filled).
              </p>
            </div>
          )}

          {/* Forecast Chart */}
          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h2 className="chart-title">
                  National Wind Generation Forecast — Delivery Day: {selectedDate}
                </h2>
                <p className="chart-subtitle">
                  Latest forecast known at {String(cutoffHour).padStart(2, '0')}:00 UTC on D-1.
                  {showErrorBand && ' Shaded band reflects historical P10–P90 error for each horizon (not a statistical guarantee).'}
                </p>
              </div>
            </div>

            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                >
                  <defs>
                    <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2d4a" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickLine={{ stroke: '#1f2d4a' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickLine={{ stroke: '#1f2d4a' }}
                    unit=" MW"
                  />
                  <Tooltip content={<CustomForecastTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '12px' }}
                  />

                  {showErrorBand && (
                    <Area
                      type="monotone"
                      dataKey="band_range"
                      name="P10–P90 Historical Error Band"
                      stroke="#0891b2"
                      strokeDasharray="2 2"
                      strokeOpacity={0.4}
                      fill="url(#bandGradient)"
                    />
                  )}

                  <Line
                    type="monotone"
                    dataKey="forecast_mw"
                    name="Forecast at Cutoff"
                    stroke="#06b6d4"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#06b6d4', strokeWidth: 0 }}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                  />

                  {showActual && (
                    <Line
                      type="monotone"
                      dataKey="actual_mw"
                      name="Actual Generation (Hindsight)"
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
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

// Custom Tooltip for Forecast Chart
const CustomForecastTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0]?.payload;
  if (!dataPoint) return null;

  return (
    <div className="custom-recharts-tooltip">
      <div className="tooltip-time">Target: {label} UTC ({dataPoint.start_time?.slice(0, 10)})</div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">Forecast:</span>
        <span className="tooltip-row-value" style={{ color: '#06b6d4' }}>
          {dataPoint.forecast_mw?.toLocaleString()} MW
        </span>
      </div>

      {dataPoint.band_lower != null && dataPoint.band_upper != null && (
        <div className="tooltip-row">
          <span className="tooltip-row-label">Hist. P10–P90 Band:</span>
          <span className="tooltip-row-value" style={{ color: '#38bdf8' }}>
            {dataPoint.band_lower?.toLocaleString()} – {dataPoint.band_upper?.toLocaleString()} MW
          </span>
        </div>
      )}

      {dataPoint.actual_mw != null && (
        <div className="tooltip-row">
          <span className="tooltip-row-label">Actual (Hindsight):</span>
          <span className="tooltip-row-value" style={{ color: '#10b981' }}>
            {dataPoint.actual_mw?.toLocaleString()} MW
          </span>
        </div>
      )}

      {dataPoint.error_mw != null && (
        <div className="tooltip-row">
          <span className="tooltip-row-label">Error (fc − act):</span>
          <span
            className="tooltip-row-value"
            style={{ color: dataPoint.error_mw > 0 ? '#f43f5e' : '#10b981' }}
          >
            {dataPoint.error_mw > 0 ? `+${dataPoint.error_mw.toLocaleString()}` : dataPoint.error_mw.toLocaleString()} MW
          </span>
        </div>
      )}

      <div style={{ marginTop: '0.4rem', borderTop: '1px solid #1f2d4a', paddingTop: '0.35rem' }}>
        <div className="tooltip-row">
          <span className="tooltip-row-label">Published:</span>
          <span className="tooltip-row-value" style={{ fontSize: '0.72rem' }}>
            {dataPoint.publish_time?.replace('T', ' ').replace('Z', ' UTC')}
          </span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-row-label">Lead Horizon:</span>
          <span className="tooltip-row-value">{dataPoint.horizon_h} hours</span>
        </div>
      </div>
    </div>
  );
};
