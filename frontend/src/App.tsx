import React, { useEffect, useState } from 'react';
import { fetchMeta, type MetaResponse } from './api';
import { ForecastView } from './components/ForecastView';
import { AccuracyView } from './components/AccuracyView';
import { Wind } from 'lucide-react';

type TabId = 'forecast' | 'accuracy';

export const App: React.FC = () => {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabId>('forecast');
  const [selectedDate, setSelectedDate] = useState<string>('2026-01-15');
  const [cutoffHour, setCutoffHour] = useState<number>(9);

  useEffect(() => {
    fetchMeta()
      .then((m) => {
        setMeta(m);
        setCutoffHour(m.default_cutoff_hour);
        const initial = m.delivery_days.includes('2026-01-15')
          ? '2026-01-15'
          : m.delivery_days[0];
        setSelectedDate(initial);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load metadata', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="state-box" style={{ minHeight: '60vh' }}>
          <div className="spinner" />
          <p>Loading Elexon BMRS data…</p>
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="app-shell">
        <div className="state-box" style={{ minHeight: '60vh' }}>
          <p>Failed to connect to API. Make sure the backend is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* ── Top Bar ──────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo">
            <Wind size={20} />
          </div>
          <div>
            <div className="topbar-title">getset</div>
            <div className="topbar-subtitle">UK Wind · Day-Ahead Monitor</div>
          </div>
        </div>

        <nav className="topbar-nav">
          <button
            type="button"
            className={`topbar-nav-btn ${activeTab === 'forecast' ? 'active' : ''}`}
            onClick={() => setActiveTab('forecast')}
          >
            Forecast Replay
          </button>
          <button
            type="button"
            className={`topbar-nav-btn ${activeTab === 'accuracy' ? 'active' : ''}`}
            onClick={() => setActiveTab('accuracy')}
          >
            Accuracy Analysis
          </button>
        </nav>

        <div className="topbar-controls">
          {activeTab === 'forecast' && (
            <div className="topbar-control-group">
              <span>Delivery:</span>
              <select
                className="topbar-select"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                {meta.delivery_days.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
          <div className="cutoff-badge">
            {String(cutoffHour).padStart(2, '0')}:00 UTC cutoff
          </div>
        </div>
      </header>

      {/* ── Tab Content ──────────────────────────────── */}
      {activeTab === 'forecast' ? (
        <ForecastView
          deliveryDays={meta.delivery_days}
          defaultDate={selectedDate}
          defaultCutoffHour={cutoffHour}
        />
      ) : (
        <AccuracyView
          deliveryDays={meta.delivery_days}
          defaultStartDate={meta.delivery_days[0]}
          defaultEndDate={meta.delivery_days[meta.delivery_days.length - 1]}
          defaultCutoffHour={cutoffHour}
        />
      )}

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="app-footer">
        <div>
          Source: Elexon BMRS · FUELHH (actuals) & WINDFOR (forecasts) · UTC (= UK time in Jan) · MW
        </div>
        <div style={{ fontFamily: 'var(--font-mono)' }}>
          {meta.n_forecast_rows.toLocaleString()} forecasts · {meta.n_actual_rows.toLocaleString()} actuals
        </div>
      </footer>
    </div>
  );
};

export default App;
