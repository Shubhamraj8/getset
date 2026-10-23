import React, { useEffect, useState } from 'react';
import { fetchMeta, type MetaResponse } from './api';
import { AccuracyView } from './components/AccuracyView';
import { ForecastView } from './components/ForecastView';

export const App: React.FC = () => {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'forecast' | 'accuracy'>('forecast');

  useEffect(() => {
    fetchMeta()
      .then((data) => {
        setMeta(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Could not connect to backend API');
        setLoading(false);
      });
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">⚡</div>
          <div className="brand-title">
            <h1>
              getset <span className="badge-tag">GB Day-Ahead</span>
            </h1>
            <p className="brand-subtitle">
              UK National Wind Forecast Monitor & Quantitative Accuracy Evaluation
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <nav className="tab-navigation" aria-label="Main Navigation">
          <button
            className={`tab-button ${activeTab === 'forecast' ? 'active' : ''}`}
            onClick={() => setActiveTab('forecast')}
          >
            <span>📈 Forecast Monitor</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'accuracy' ? 'active' : ''}`}
            onClick={() => setActiveTab('accuracy')}
          >
            <span>🎯 Accuracy & Bias</span>
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main>
        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
          </div>
        )}

        {loading ? (
          <div className="state-box" style={{ minHeight: '400px' }}>
            <div className="spinner" />
            <p>Initializing getset data snapshot from Elexon BMRS...</p>
          </div>
        ) : meta ? (
          <>
            {activeTab === 'forecast' && (
              <ForecastView
                deliveryDays={meta.delivery_days}
                defaultDate={meta.delivery_days[meta.delivery_days.length - 1] || '2026-02-01'}
                defaultCutoffHour={meta.default_cutoff_hour}
              />
            )}

            {activeTab === 'accuracy' && (
              <AccuracyView
                deliveryDays={meta.delivery_days}
                defaultStartDate={meta.delivery_days[0] || '2026-01-02'}
                defaultEndDate={meta.delivery_days[meta.delivery_days.length - 1] || '2026-02-01'}
                defaultCutoffHour={meta.default_cutoff_hour}
              />
            )}
          </>
        ) : null}
      </main>

      {/* Footer per §9: Source, timezone, units */}
      <footer className="app-footer">
        <div className="footer-attribution">
          <div className="footer-note">
            Source: Elexon BMRS · FUELHH &amp; WINDFOR · times in UTC (= UK time in January) · MW
          </div>
          <div>
            Built for UK Day-Ahead Power Procurement Desks · Scope: January 2026 Decisions
          </div>
        </div>
        {meta && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Dataset: {meta.n_forecast_rows.toLocaleString()} forecast rows ·{' '}
            {meta.n_actual_rows.toLocaleString()} actual rows
          </div>
        )}
      </footer>
    </div>
  );
};

export default App;
