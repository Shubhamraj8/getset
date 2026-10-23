import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number | null | undefined;
  unit?: string;
  tooltipNote: string;
  badge?: {
    text: string;
    type: 'over' | 'under' | 'neutral';
  };
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  tooltipNote,
  badge,
}) => {
  const displayVal = value !== null && value !== undefined ? value : '—';

  return (
    <div className="metric-card" title={tooltipNote}>
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        {badge && <span className={`metric-badge ${badge.type}`}>{badge.text}</span>}
      </div>
      <div className="metric-value-row">
        <span className="metric-value">{displayVal}</span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      <p className="metric-tooltip-note">{tooltipNote}</p>
    </div>
  );
};
