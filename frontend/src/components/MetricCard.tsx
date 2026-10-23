import React from 'react';

export interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  footer?: string;
  accent?: 'cyan' | 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'pink';
  trend?: { direction: 'up' | 'down' | 'neutral'; text: string };
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  footer,
  accent = 'cyan',
  trend,
}) => {
  const displayVal = value !== null && value !== undefined ? value : '—';

  return (
    <div className={`stat-card ${accent}`}>
      <span className="stat-card-label">{label}</span>
      <div className="stat-card-value">
        {displayVal}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="stat-card-footer">
        {trend && (
          <span className={`stat-card-trend ${trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'neutral'}`}>
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '●'} {trend.text}
          </span>
        )}
        {footer && <span style={{ marginLeft: trend ? '0.5rem' : 0 }}>{footer}</span>}
      </div>
    </div>
  );
};
