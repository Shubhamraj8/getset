import React from 'react';

/* ── Forecast Controls ─────────────────────────────────────────────── */

interface ForecastControlsProps {
  deliveryDays: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  cutoffHour: number;
  onChangeCutoffHour: (hour: number) => void;
  showActual: boolean;
  onToggleActual: (val: boolean) => void;
  showErrorBand: boolean;
  onToggleErrorBand: (val: boolean) => void;
}

const forecastPresets = [
  { label: 'High Wind (Jan 10)', date: '2026-01-10' },
  { label: 'Storm Peak (Jan 24)', date: '2026-01-24' },
  { label: 'Low Wind (Jan 19)', date: '2026-01-19' },
  { label: 'Latest (Feb 01)', date: '2026-02-01' },
];

export const ForecastControls: React.FC<ForecastControlsProps> = ({
  deliveryDays,
  selectedDate,
  onSelectDate,
  cutoffHour,
  onChangeCutoffHour,
  showActual,
  onToggleActual,
  showErrorBand,
  onToggleErrorBand,
}) => (
  <div className="controls-panel">
    <div className="controls-group">
      <div className="control-field">
        <span className="controls-label">Delivery Date</span>
        <select
          className="field-select"
          value={selectedDate}
          onChange={(e) => onSelectDate(e.target.value)}
        >
          {deliveryDays.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="control-field">
        <span className="controls-label">Gate Closure (D-1)</span>
        <div className="slider-wrap">
          <input
            type="range"
            min={0}
            max={23}
            value={cutoffHour}
            onChange={(e) => onChangeCutoffHour(Number(e.target.value))}
            className="range-slider"
          />
          <span className="slider-value">
            {String(cutoffHour).padStart(2, '0')}:00 UTC
          </span>
        </div>
      </div>

      <div className="control-field">
        <span className="controls-label">Overlays</span>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <label className="toggle-label">
            <input type="checkbox" checked={showActual} onChange={(e) => onToggleActual(e.target.checked)} />
            Actual (hindsight)
          </label>
          <label className="toggle-label">
            <input type="checkbox" checked={showErrorBand} onChange={(e) => onToggleErrorBand(e.target.checked)} />
            P10–P90 band
          </label>
        </div>
      </div>
    </div>

    <div className="preset-chips">
      {forecastPresets.map((p) => (
        <button
          key={p.date}
          type="button"
          className={`preset-chip ${selectedDate === p.date ? 'active' : ''}`}
          onClick={() => onSelectDate(p.date)}
        >
          {p.label}
        </button>
      ))}
    </div>
  </div>
);

/* ── Accuracy Controls ─────────────────────────────────────────────── */

interface AccuracyControlsProps {
  deliveryDays: string[];
  startDate: string;
  endDate: string;
  onSelectStartDate: (date: string) => void;
  onSelectEndDate: (date: string) => void;
  cutoffHour: number;
  onChangeCutoffHour: (hour: number) => void;
}

const rangePresets = [
  { label: 'Full January', start: '2026-01-02', end: '2026-02-01' },
  { label: 'First Half (Jan 2–16)', start: '2026-01-02', end: '2026-01-16' },
  { label: 'Second Half (Jan 17–Feb 1)', start: '2026-01-17', end: '2026-02-01' },
];

export const AccuracyControls: React.FC<AccuracyControlsProps> = ({
  deliveryDays,
  startDate,
  endDate,
  onSelectStartDate,
  onSelectEndDate,
  cutoffHour,
  onChangeCutoffHour,
}) => (
  <div className="controls-panel">
    <div className="controls-group">
      <div className="control-field">
        <span className="controls-label">From</span>
        <select
          className="field-select"
          value={startDate}
          onChange={(e) => onSelectStartDate(e.target.value)}
        >
          {deliveryDays.map((d) => (
            <option key={d} value={d} disabled={d > endDate}>{d}</option>
          ))}
        </select>
      </div>

      <div className="control-field">
        <span className="controls-label">To</span>
        <select
          className="field-select"
          value={endDate}
          onChange={(e) => onSelectEndDate(e.target.value)}
        >
          {deliveryDays.map((d) => (
            <option key={d} value={d} disabled={d < startDate}>{d}</option>
          ))}
        </select>
      </div>

      <div className="control-field">
        <span className="controls-label">Gate Closure (D-1)</span>
        <div className="slider-wrap">
          <input
            type="range"
            min={0}
            max={23}
            value={cutoffHour}
            onChange={(e) => onChangeCutoffHour(Number(e.target.value))}
            className="range-slider"
          />
          <span className="slider-value">
            {String(cutoffHour).padStart(2, '0')}:00 UTC
          </span>
        </div>
      </div>
    </div>

    <div className="preset-chips">
      {rangePresets.map((p) => (
        <button
          key={p.label}
          type="button"
          className={`preset-chip ${startDate === p.start && endDate === p.end ? 'active' : ''}`}
          onClick={() => { onSelectStartDate(p.start); onSelectEndDate(p.end); }}
        >
          {p.label}
        </button>
      ))}
    </div>
  </div>
);
