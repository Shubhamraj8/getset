import React from 'react';

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
}) => {
  return (
    <div className="controls-card">
      <div className="controls-group">
        <div className="control-item">
          <label className="control-label" htmlFor="delivery-date-select">Delivery Date</label>
          <select
            id="delivery-date-select"
            className="control-select"
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
          >
            {deliveryDays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="control-item">
          <label className="control-label" htmlFor="cutoff-slider">Decision Cutoff (D-1)</label>
          <div className="slider-container">
            <input
              id="cutoff-slider"
              type="range"
              min={0}
              max={23}
              step={1}
              value={cutoffHour}
              onChange={(e) => onChangeCutoffHour(Number(e.target.value))}
              className="cutoff-slider"
            />
            <span className="slider-value">
              {String(cutoffHour).padStart(2, '0')}:00 UTC
            </span>
          </div>
        </div>
      </div>

      <div className="toggle-group">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showActual}
            onChange={(e) => onToggleActual(e.target.checked)}
          />
          <span>Show actual (hindsight)</span>
        </label>

        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showErrorBand}
            onChange={(e) => onToggleErrorBand(e.target.checked)}
          />
          <span>Historical error band (P10–P90)</span>
        </label>
      </div>
    </div>
  );
};

interface AccuracyControlsProps {
  deliveryDays: string[];
  startDate: string;
  endDate: string;
  onSelectStartDate: (date: string) => void;
  onSelectEndDate: (date: string) => void;
  cutoffHour: number;
  onChangeCutoffHour: (hour: number) => void;
}

export const AccuracyControls: React.FC<AccuracyControlsProps> = ({
  deliveryDays,
  startDate,
  endDate,
  onSelectStartDate,
  onSelectEndDate,
  cutoffHour,
  onChangeCutoffHour,
}) => {
  return (
    <div className="controls-card">
      <div className="controls-group">
        <div className="control-item">
          <label className="control-label" htmlFor="start-date-select">From Delivery Date</label>
          <select
            id="start-date-select"
            className="control-select"
            value={startDate}
            onChange={(e) => onSelectStartDate(e.target.value)}
          >
            {deliveryDays.map((d) => (
              <option key={d} value={d} disabled={d > endDate}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="control-item">
          <label className="control-label" htmlFor="end-date-select">To Delivery Date</label>
          <select
            id="end-date-select"
            className="control-select"
            value={endDate}
            onChange={(e) => onSelectEndDate(e.target.value)}
          >
            {deliveryDays.map((d) => (
              <option key={d} value={d} disabled={d < startDate}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="control-item">
          <label className="control-label" htmlFor="acc-cutoff-slider">Decision Cutoff (D-1)</label>
          <div className="slider-container">
            <input
              id="acc-cutoff-slider"
              type="range"
              min={0}
              max={23}
              step={1}
              value={cutoffHour}
              onChange={(e) => onChangeCutoffHour(Number(e.target.value))}
              className="cutoff-slider"
            />
            <span className="slider-value">
              {String(cutoffHour).padStart(2, '0')}:00 UTC
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
