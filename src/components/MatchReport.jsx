import React from 'react';
import './MatchReport.css';

const CL = '#00e676';
const CV = '#ff1744';
const CA = '#ffd600';

const ORIGEN_COLORS = [
  '#3b82f6','#f59e0b','#10b981',
  '#ef4444','#a855f7','#06b6d4','#f472b6','#ffffff'
];

const pct = (a, b) => {
  const t = (a || 0) + (b || 0);
  return t > 0 ? [(a / t) * 100, (b / t) * 100] : [50, 50];
};

const fmt2 = (v) =>
  typeof v === 'number' ? v.toFixed(2) : '0.00';

const fmt1 = (v) =>
  typeof v === 'number' ? v.toFixed(1) : '—';

const fmtN = (v) =>
  typeof v === 'number' ? v : (v ?? 0);

const RiverRow = ({ label, vL = 0, vV = 0, isFloat }) => {
  const [pL, pV] = pct(vL, vV);

  return (
    <div className="mr-river-row">
      <div className="mr-rr-val left">
        {isFloat ? fmt2(vL) : fmtN(vL)}
      </div>

      <div className="mr-rr-bar-wrap">
        <div
          className="mr-rr-bar-l"
          style={{ width: `${pL}%` }}
        />

        <div
          className="mr-rr-bar-r"
          style={{ width: `${pV}%` }}
        />

        <div className="mr-rr-label">{label}</div>
      </div>

      <div className="mr-rr-val right">
        {isFloat ? fmt2(vV) : fmtN(vV)}
      </div>
    </div>
  );
};

const OrigenSection = ({ label, goles, totalColor }) => {
  const total = goles.reduce((s, g) => s + (g.value || 0), 0);

  return (
    <div className="mr-origin-section">
      <div
        className="mr-origin-header"
        style={{ color: totalColor }}
      >
        {label} · {total}
      </div>

      {goles.slice(0, 3).map((g, i) => {
        const color =
          ORIGEN_COLORS[i % ORIGEN_COLORS.length];

        const pctFill =
          total > 0 ? (g.value / total) * 100 : 0;

        return (
          <div key={i} className="mr-origin-row">
            <div
              className="mr-origin-dot"
              style={{ background: color }}
            />

            <div className="mr-origin-track">
              <div
                className="mr-origin-fill"
                style={{
                  width: `${pctFill}%`,
                  background: color
                }}
              />
            </div>

            <span
              className="mr-origin-count"
              style={{ color }}
            >
              {g.value}
            </span>

            <span className="mr-origin-label">
              {g.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const MatchReport = ({ data }) => {
  if (!data) return null;

  const { equipos, resultado, info, stats, golesOrigen } =
    data;

  const loc = stats?.local || {};
  const vis = stats?.visitante || {};

  const parts = (resultado?.final || '0 - 0')
    .split('-')
    .map((s) => parseInt(s.trim(), 10));

  const gL = isNaN(parts[0]) ? 0 : parts[0];
  const gV = isNaN(parts[1]) ? 0 : parts[1];

  const topJugadores =
    stats?.topJugadores || [];

  const topJugadoresExt =
    stats?.topJugadoresExt || [];

  const mvp = topJugadores[0] || null;

  const mvpExt = mvp
    ? topJugadoresExt.find(
        (j) => j.nombre === mvp.nombre
      )
    : null;

  const topRemates = [...topJugadoresExt]
    .sort((a, b) => (b.remates || 0) - (a.remates || 0))
    .slice(0, 3);

  const xgMax = Math.max(
    loc.xg || 0,
    vis.xg || 0,
    0.01
  );

  const xgPctL =
    ((loc.xg || 0) / xgMax) * 100;

  const xgPctV =
    ((vis.xg || 0) / xgMax) * 100;

  const convL =
    (loc.remates || 0) > 0
      ? Math.round((gL / loc.remates) * 100)
      : 0;

  const convV =
    (vis.remates || 0) > 0
      ? Math.round((gV / vis.remates) * 100)
      : 0;

  const escudoLocal =
    equipos?.local?.escudo;

  const escudoVisita =
    equipos?.visitante?.escudo;

  const nombreLocal =
    equipos?.local?.nombre || 'Local';

  const nombreVisita =
    equipos?.visitante?.nombre || 'Visita';

  const inicialesL =
    nombreLocal.substring(0, 2).toUpperCase();

  const inicialesV =
    nombreVisita.substring(0, 2).toUpperCase();

  return (
    <div
      className="report-container"
      id="match-report-exportable"
    >
      {/* GRILLA SIMPLE COMPATIBLE ANDROID */}
      <div className="mr-grid" />

      <div className="mr-wm">
        {gL}–{gV}
      </div>

      <div className="mr-blob-l" />
      <div className="mr-blob-r" />

      <div className="mr-corner tl" />
      <div className="mr-corner tr" />
      <div className="mr-corner bl" />
      <div className="mr-corner br" />

      {/* HERO */}
      <div className="mr-hero">
        <div className="mr-match-date">
          {info?.fecha}
          {info?.torneo
            ? ` · ${info.torneo}`
            : ''}
        </div>

        <div className="mr-versus">
          <div className="mr-team-side">
            <div
              className="mr-badge"
              style={{
                background:
                  'rgba(0,230,118,.08)',
                border:
                  '2px solid rgba(0,230,118,.25)',
                color: CL
              }}
            >
              {escudoLocal ? (
                <img
                  src={escudoLocal}
                  alt={nombreLocal}
                />
              ) : (
                inicialesL
              )}
            </div>

            <div
              className="mr-team-name"
              style={{ color: CL }}
            >
              {nombreLocal}
            </div>
          </div>

          <div className="mr-score-block">
            <div className="mr-score-huge">
              <span
                style={{
                  color:
                    gL >= gV
                      ? CL
                      : 'rgba(255,255,255,.35)'
                }}
              >
                {gL}
              </span>

              <span className="mr-score-sep">
                –
              </span>

              <span
                style={{
                  color:
                    gV >= gL
                      ? CV
                      : 'rgba(255,255,255,.35)'
                }}
              >
                {gV}
              </span>
            </div>

            {resultado?.primerTiempo && (
              <div className="mr-halftime">
                ET: {resultado.primerTiempo}
              </div>
            )}
          </div>

          <div className="mr-team-side">
            <div
              className="mr-badge"
              style={{
                background:
                  'rgba(255,23,68,.08)',
                border:
                  '2px solid rgba(255,23,68,.25)',
                color: CV
              }}
            >
              {escudoVisita ? (
                <img
                  src={escudoVisita}
                  alt={nombreVisita}
                />
              ) : (
                inicialesV
              )}
            </div>

            <div
              className="mr-team-name"
              style={{ color: CV }}
            >
              {nombreVisita}
            </div>
          </div>
        </div>
      </div>

      {/* resto igual */}
    </div>
  );
};

export default MatchReport;