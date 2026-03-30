import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts';
import './MatchReport.css';

/* ── Paleta ──────────────────────────────────────────────── */
const CL = '#00e676';   // local  (verde)
const CV = '#ff1744';   // visita (rojo)
const CA = '#ffd600';   // accent (amarillo)

const ORIGEN_COLORS = [
  '#3b82f6','#f59e0b','#10b981',
  '#ef4444','#a855f7','#06b6d4','#f472b6','#ffffff'
];

/* ── Helpers ─────────────────────────────────────────────── */
const pct = (a, b) => {
  const t = (a || 0) + (b || 0);
  return t > 0 ? [(a / t) * 100, (b / t) * 100] : [50, 50];
};
const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '0.00');
const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');

/* ── StatBar ─────────────────────────────────────────────── */
const StatBar = ({ label, vL = 0, vV = 0, isFloat }) => {
  const [pL, pV] = pct(vL, vV);
  return (
    <div className="stat-row">
      <div className="stat-labels">
        <span className="stat-val local">{isFloat ? fmt2(vL) : vL}</span>
        <span className="stat-name">{label}</span>
        <span className="stat-val visita">{isFloat ? fmt2(vV) : vV}</span>
      </div>
      <div className="bars-wrap">
        <div className="bar-l" style={{ width: `${pL}%` }} />
        <div className="bar-v" style={{ width: `${pV}%` }} />
      </div>
    </div>
  );
};

/* ── KpiChip ─────────────────────────────────────────────── */
const KpiChip = ({ label, vL = 0, vV = 0, isFloat }) => (
  <div className="kpi-chip">
    <div className="kpi-vals">
      <span style={{ color: CL }}>{isFloat ? fmt2(vL) : vL}</span>
      <span className="kpi-sep">·</span>
      <span style={{ color: CV }}>{isFloat ? fmt2(vV) : vV}</span>
    </div>
    <div className="kpi-label">{label}</div>
  </div>
);

/* ── Top5Row ─────────────────────────────────────────────── */
const Top5Row = ({ pos, nombre, val, color = CL }) => (
  <div className="top5-row">
    <span className="top5-pos">{pos}</span>
    <span className="top5-name">{nombre}</span>
    <span className="top5-val" style={{ color }}>{val}</span>
  </div>
);

/* ── XG Tooltip ──────────────────────────────────────────── */
const XgTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#111', border: '1px solid #2a2a2a',
      padding: '5px 8px', borderRadius: '4px',
      fontSize: '0.65rem', fontWeight: 700,
    }}>
      <div style={{ color: '#555', marginBottom: 2 }}>MIN {label}</div>
      <div style={{ color: CL }}>Local: {payload[0]?.value?.toFixed(2)}</div>
      <div style={{ color: CV }}>Visita: {payload[1]?.value?.toFixed(2)}</div>
    </div>
  );
};

/* ── Pitch SVG lines ─────────────────────────────────────── */
const PitchLines = () => (
  <svg
    viewBox="0 0 200 100"
    xmlns="http://www.w3.org/2000/svg"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
  >
    {/* línea central */}
    <line x1="100" y1="0" x2="100" y2="100" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
    {/* círculo central */}
    <circle cx="100" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
    <circle cx="100" cy="50" r="1" fill="rgba(255,255,255,0.3)" />
    {/* área izquierda */}
    <path d="M0,22 Q24,22 24,50 Q24,78 0,78" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
    {/* área derecha */}
    <path d="M200,22 Q176,22 176,50 Q176,78 200,78" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
    {/* portería izquierda */}
    <rect x="0" y="38" width="3" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
    {/* portería derecha */}
    <rect x="197" y="38" width="3" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
  </svg>
);

/* ══════════════════════════════════════════════════════════ */
const MatchReport = ({ data }) => {
  if (!data) return null;

  const { equipos, resultado, info, stats, tiros, xgFlow, golesOrigen, clubNombre, recYPer } = data;
  const loc = stats.local    || {};
  const vis = stats.visitante || {};

  /* score colors */
  const parts = (resultado.final || '0 - 0').split('-').map(s => parseInt(s.trim(), 10));
  const gL = isNaN(parts[0]) ? 0 : parts[0];
  const gV = isNaN(parts[1]) ? 0 : parts[1];
  const scoreColorL = gL > gV ? CL : gL < gV ? '#888' : '#fff';
  const scoreColorV = gV > gL ? CL : gV < gL ? '#888' : '#fff';

  /* TOP listas */
  const top5Rating  = (stats.topJugadores    || []).slice(0, 5);
  const top5Rec     = [...(stats.topJugadoresExt || [])]
    .sort((a, b) => (b.rec     || 0) - (a.rec     || 0)).slice(0, 5);
  const top5Remates = [...(stats.topJugadoresExt || [])]
    .sort((a, b) => (b.remates || 0) - (a.remates || 0)).slice(0, 5);

  /* origen goles */
  const origenList = ((golesOrigen?.local) || []).filter(
    g => !(g.name === 'Sin Goles' && g.value === 1)
  );

  return (
    <div className="report-container" id="match-report-exportable">

      {/* ══ HEADER ══════════════════════════════════════════ */}
      <div className="report-header">

        {/* equipo local */}
        <div className="header-team local">
          {equipos.local.escudo
            ? <img src={equipos.local.escudo} className="team-logo" alt="" />
            : (
              <div className="team-logo-fallback" style={{ borderColor: CL, color: CL }}>
                {(equipos.local.nombre || 'L').substring(0, 2).toUpperCase()}
              </div>
            )
          }
          <div className="team-info">
            <div className="team-name" style={{ color: CL }}>
              {equipos.local.nombre}
            </div>
            {clubNombre && <div className="team-sub">{clubNombre}</div>}
          </div>
        </div>

        {/* marcador */}
        <div className="header-score-board">
          <div className="score-main">
            <span style={{ color: scoreColorL }}>{gL}</span>
            <span className="score-dash">–</span>
            <span style={{ color: scoreColorV }}>{gV}</span>
          </div>
          <div className="score-ht">
            ET: <em>{resultado.primerTiempo || '—'}</em>
          </div>
          <div className="match-meta">
            {info.fecha} · {info.torneo}<br />
            {info.categoria}{info.estadio && info.estadio !== '-' ? ` · ${info.estadio}` : ''}
          </div>
        </div>

        {/* equipo visitante */}
        <div className="header-team visitante">
          {equipos.visitante.escudo
            ? <img src={equipos.visitante.escudo} className="team-logo" alt="" />
            : (
              <div className="team-logo-fallback" style={{ borderColor: CV, color: CV }}>
                {(equipos.visitante.nombre || 'V').substring(0, 2).toUpperCase()}
              </div>
            )
          }
          <div className="team-info" style={{ alignItems: 'flex-end' }}>
            <div className="team-name" style={{ color: CV }}>
              {equipos.visitante.nombre}
            </div>
          </div>
        </div>
      </div>

{/* ══ KPI STRIP ═══════════════════════════════════════ */}
      <div className="kpi-strip">
        <KpiChip label="xG"           vL={loc.xg}             vV={vis.xg}             isFloat />
        <KpiChip label="Remates"      vL={loc.remates}        vV={vis.remates} />
        <KpiChip label="Al Arco"      vL={loc.rematesAlArco}  vV={vis.rematesAlArco} />
        
        {/* Acá hacemos el cambio clave: propias REC vs propias PERD */}
        <KpiChip label="Recuperaciones vs Pérdidas"  vL={loc.recuperaciones} vV={loc.perdidas} />
      </div>

      {/* ══ BODY 3 COLUMNAS ═════════════════════════════════ */}
      <div className="report-body">

        {/* ── COL IZQUIERDA ─────────────────────────────── */}
        <div className="col">

          {/* Métricas con barras */}
          <div className="rcard" style={{ flex: '0 0 auto' }}>
            <div className="rcard-title">Métricas del partido</div>
            <StatBar label="xG"          vL={loc.xg}             vV={vis.xg}             isFloat />
            <StatBar label="Remates"     vL={loc.remates}        vV={vis.remates} />
            <StatBar label="Al Arco"     vL={loc.rematesAlArco}  vV={vis.rematesAlArco} />
            <StatBar label="Recuperaciones"  vL={loc.recuperaciones} vV={vis.recuperaciones} />
            <StatBar label="Pérdidas"    vL={loc.perdidas}       vV={vis.perdidas} />
            <StatBar label="Faltas"      vL={loc.faltas}         vV={vis.faltas} />
          </div>

          {/* TOP 5 Rating */}
          <div className="rcard" style={{ flex: 1 }}>
            <div className="rcard-title">⭐ Top 5 Rating</div>
            {top5Rating.length === 0
              ? <span style={{ color: '#333', fontSize: '0.7rem' }}>Sin datos</span>
              : top5Rating.map((j, i) => {
                  const r = typeof j.rating === 'number' ? j.rating : parseFloat(j.rating) || 0;
                  return (
                    <Top5Row
                      key={i} pos={i + 1}
                      nombre={j.nombre}
                      val={fmt1(r)}
                      color={r >= 7 ? CL : r >= 6 ? CA : CV}
                    />
                  );
                })
            }
          </div>

        </div>

        {/* separador */}
        <div className="col-sep" />

        {/* ── COL CENTRAL ──────────────────────────────── */}
        <div className="col">

          {/* Mapa de remates */}
          <div className="rcard" style={{ flex: '0 0 auto' }}>
            <div className="rcard-title">Mapa de Remates</div>
            <div className="pitch-wrap">
              <PitchLines />
              {(tiros || []).map((t, i) => {
                const color = t.equipo === 'local' ? CL : CV;
                const size  = t.esGol ? 14 : Math.max(6, (t.xg || 0.05) * 30);
                return (
                  <div
                    key={i}
                    className="shot-dot"
                    style={{
                      left:   `${t.x}%`,
                      top:    `${t.y}%`,
                      width:  `${size}px`,
                      height: `${size}px`,
                      background:  t.esGol ? color : 'transparent',
                      border:      `2px solid ${color}`,
                      boxShadow:   t.esGol ? `0 0 7px ${color}` : 'none',
                      zIndex:      t.esGol ? 10 : 1,
                      opacity:     t.esGol ? 1 : 0.75,
                    }}
                  />
                );
              })}
            </div>
            <div className="pitch-legend">
              {[
                { color: CL, solid: true,  label: 'Gol local' },
                { color: CL, solid: false, label: 'Fallo local' },
                { color: CV, solid: true,  label: 'Gol visita' },
                { color: CV, solid: false, label: 'Fallo visita' },
              ].map((it, i) => (
                <div key={i} className="pitch-legend-item">
                  <div
                    className="legend-dot"
                    style={{
                      background:  it.solid ? it.color : 'transparent',
                      border:      it.solid ? 'none' : `2px solid ${it.color}`,
                    }}
                  />
                  {it.label}
                </div>
              ))}
            </div>
          </div>

{/* Mapa de Recuperaciones vs Pérdidas */}
          <div className="rcard" style={{ flex: '0 0 auto' }}>
            <div className="rcard-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Mapa de Recuperaciones vs Pérdidas</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 900 }}>
                <span style={{ color: '#33af14' }}>{loc.recuperaciones} REC</span>
                <span style={{ margin: '0 4px', color: '#555' }}>|</span>
                <span style={{ color: '#ff5e00' }}>{loc.perdidas} PER</span>
              </span>
            </div>
            <div className="pitch-wrap">
              <PitchLines />
              {(recYPer || []).map((ev, i) => {
                const isRec = ev.tipo === 'Recuperación';
                const color = isRec ? '#33af14' : '#ff5e00'; // Azul para REC, Naranja para PER
                return (
                  <div
                    key={i}
                    className="shot-dot"
                    style={{
                      left: `${ev.x}%`,
                      top: `${ev.y}%`,
                      width: '6px',
                      height: '6px',
                      background: color,
                      opacity: 0.85,
                      boxShadow: `0 0 4px ${color}`,
                      zIndex: isRec ? 2 : 1, // Prioridad visual
                    }}
                  />
                );
              })}
            </div>
            <div className="pitch-legend">
              <div className="pitch-legend-item">
                <div className="legend-dot" style={{ background: '#3b82f6' }} /> Recuperaciones
              </div>
              <div className="pitch-legend-item">
                <div className="legend-dot" style={{ background: '#f59e0b' }} /> Pérdidas
              </div>
            </div>
          </div>

          {/* xG Flow */}
          <div className="rcard" style={{ flex: 1, minHeight: 0 }}>
            <div className="rcard-title">xG Flow — Flujo de Ataque</div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={xgFlow || []} margin={{ top: 4, right: 6, left: -26, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis
                    dataKey="minuto"
                    stroke="#2a2a2a"
                    tick={{ fontSize: 9, fill: '#444' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#2a2a2a"
                    tick={{ fontSize: 9, fill: '#444' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<XgTooltip />} />
                  <ReferenceLine
                    x={20}
                    stroke="#2a2a2a"
                    strokeDasharray="4 3"
                    label={{ value: 'ET', position: 'insideTopRight', fontSize: 8, fill: '#444' }}
                  />
                  <Line type="stepAfter" dataKey="xgLocal"     stroke={CL} strokeWidth={2.5} dot={false} activeDot={{ r: 3 }} />
                  <Line type="stepAfter" dataKey="xgVisitante" stroke={CV} strokeWidth={2.5} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* separador */}
        <div className="col-sep" />

        {/* ── COL DERECHA ──────────────────────────────── */}
        <div className="col">

          {/* TOP 5 Recuperaciones */}
          <div className="rcard">
            <div className="rcard-title">🛡️ Top 5 Recuperadores</div>
            {top5Rec.length === 0
              ? <span style={{ color: '#333', fontSize: '0.7rem' }}>Sin datos</span>
              : top5Rec.map((j, i) => (
                  <Top5Row
                    key={i} pos={i + 1}
                    nombre={j.nombre}
                    val={j.rec || 0}
                    color="#3b82f6"
                  />
                ))
            }
          </div>

          {/* TOP 5 Remates */}
          <div className="rcard">
            <div className="rcard-title">🎯 Top 5 Finalizadores</div>
            {top5Remates.length === 0
              ? <span style={{ color: '#333', fontSize: '0.7rem' }}>Sin datos</span>
              : top5Remates.map((j, i) => (
                  <Top5Row
                    key={i} pos={i + 1}
                    nombre={j.nombre}
                    val={`${j.goles || 0}G · ${j.remates || 0}R`}
                    color={(j.goles || 0) > 0 ? CL : '#777'}
                  />
                ))
            }
          </div>

          {/* Origen de goles */}
          <div className="rcard" style={{ flex: 1 }}>
            <div className="rcard-title">Origen de Goles</div>
            {origenList.length === 0
              ? <span style={{ color: '#333', fontSize: '0.7rem' }}>Sin goles registrados</span>
              : origenList.map((g, i) => {
                  const c = ORIGEN_COLORS[i % ORIGEN_COLORS.length];
                  return (
                    <div key={i} className="origen-row">
                      <div className="origen-label">
                        <div className="origen-dot" style={{ background: c }} />
                        <span>{g.name}</span>
                      </div>
                      <span className="origen-val" style={{ color: c }}>{g.value}</span>
                    </div>
                  );
                })
            }
          </div>

        </div>
      </div>

      {/* ══ FOOTER ══════════════════════════════════════════ */}
      <div className="report-footer">
        <span>Reporte generado automáticamente · {info.fecha}</span>
      <strong>VIRTUAL.CLUB © 2026 - Propiedad de{" "} <span style={{ color: "#fd7d05" }}>VirtualFutsal</span> {" "} - Todos los derechos reservados.
</strong>
      </div>

    </div>
  );
};

export default MatchReport;