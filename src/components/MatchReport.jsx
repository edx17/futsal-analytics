import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  PieChart, Pie, Cell
} from 'recharts';
import './MatchReport.css';
import { PitchLinesOptimized } from '../pages/Resumen'; // Importamos el diseño optimizado

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
const StatBar = ({ label, vL = 0, vV = 0, isFloat, isPct }) => {
  const [pL, pV] = pct(vL, vV);
  const displayL = isFloat ? fmt2(vL) : vL;
  const displayV = isFloat ? fmt2(vV) : vV;
  return (
    <div className="stat-row">
      <div className="stat-labels">
        <span className="stat-val local">{displayL}{isPct ? '%' : ''}</span>
        <span className="stat-name">{label}</span>
        <span className="stat-val visita">{displayV}{isPct ? '%' : ''}</span>
      </div>
      <div className="bars-wrap">
        <div className="bar-l" style={{ width: `${pL}%` }} />
        <div className="bar-v" style={{ width: `${pV}%` }} />
      </div>
    </div>
  );
};

/* ── KpiChip ─────────────────────────────────────────────── */
const KpiChip = ({ label, vL, vV, isFloat, singleVal, suffix = '' }) => (
  <div className="kpi-chip">
    <div className="kpi-vals">
      {singleVal !== undefined ? (
        <span style={{ color: '#fff' }}>{singleVal}{suffix}</span>
      ) : (
        <>
          <span style={{ color: CL }}>{isFloat ? fmt2(vL) : vL}{suffix}</span>
          <span className="kpi-sep">·</span>
          <span style={{ color: CV }}>{isFloat ? fmt2(vV) : vV}{suffix}</span>
        </>
      )}
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
      fontSize: '0.65rem', fontWeight: 700, fontFamily: 'JetBrains Mono'
    }}>
      <div style={{ color: '#888', marginBottom: 2 }}>MIN {label}</div>
      <div style={{ color: CL }}>Local: {payload[0]?.value?.toFixed(2)}</div>
      <div style={{ color: CV }}>Visita: {payload[1]?.value?.toFixed(2)}</div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════ */
const MatchReport = ({ data }) => {
  if (!data) return null;

  const { equipos, resultado, info, stats, tiros, xgFlow, golesOrigen } = data;
  const loc = stats.local || {};
  const vis = stats.visitante || {};

  /* score colors */
  const parts = (resultado.final || '0 - 0').split('-').map(s => parseInt(s.trim(), 10));
  const gL = isNaN(parts[0]) ? 0 : parts[0];
  const gV = isNaN(parts[1]) ? 0 : parts[1];
  const scoreColorL = gL > gV ? CL : gL < gV ? '#888' : '#fff';
  const scoreColorV = gV > gL ? CL : gV < gL ? '#888' : '#fff';

  /* TOP listas */
  const top5Rating  = (stats.topJugadores || []).slice(0, 5);
  const top5Rec     = [...(stats.topJugadoresExt || [])].sort((a, b) => (b.rec || 0) - (a.rec || 0)).slice(0, 5);
  const top5Remates = [...(stats.topJugadoresExt || [])].sort((a, b) => (b.remates || 0) - (a.remates || 0)).slice(0, 5);

  return (
    <div className="report-container" id="match-report-exportable">

      {/* ══ HEADER ══════════════════════════════════════════ */}
      <div className="report-header">
        {/* equipo local */}
        <div className="header-team local">
          {equipos.local.escudo
            ? <img src={equipos.local.escudo} className="team-logo" alt="" />
            : <div className="team-logo-fallback" style={{ borderColor: CL, color: CL }}>{(equipos.local.nombre || 'L').substring(0, 2).toUpperCase()}</div>
          }
          <div className="team-info">
            <div className="team-name" style={{ color: CL }}>{equipos.local.nombre}</div>
          </div>
        </div>

        {/* marcador */}
        <div className="header-score-board">
          <div className="score-main">
            <span style={{ color: scoreColorL }}>{gL}</span>
            <span className="score-dash">–</span>
            <span style={{ color: scoreColorV }}>{gV}</span>
          </div>
          <div className="score-ht">ET: <em>{resultado.primerTiempo || '—'}</em></div>
          <div className="match-meta">
            {info.fecha} · {info.torneo}<br />
            {info.categoria}{info.estadio && info.estadio !== '-' ? ` · ${info.estadio}` : ''}
          </div>
        </div>

        {/* equipo visitante */}
        <div className="header-team visitante">
          {equipos.visitante.escudo
            ? <img src={equipos.visitante.escudo} className="team-logo" alt="" />
            : <div className="team-logo-fallback" style={{ borderColor: CV, color: CV }}>{(equipos.visitante.nombre || 'V').substring(0, 2).toUpperCase()}</div>
          }
          <div className="team-info" style={{ alignItems: 'flex-end' }}>
            <div className="team-name" style={{ color: CV }}>{equipos.visitante.nombre}</div>
          </div>
        </div>
      </div>

      {/* ══ KPI STRIP ═══════════════════════════════════════ */}
      <div className="kpi-strip">
        <KpiChip label="Calidad de Ocasiones (xG)" vL={loc.xg} vV={vis.xg} isFloat />
        <KpiChip label="Tiros al Arco" vL={loc.rematesAlArco} vV={vis.rematesAlArco} />
        <KpiChip label="Índice de Control" singleVal={loc.matchControl || 0} suffix="%" />
        <KpiChip label="Índice de Caos" singleVal={loc.chaosIndex || 0} />
      </div>

      {/* ══ BODY 3 COLUMNAS ═════════════════════════════════ */}
      <div className="report-body">

        {/* ── COL IZQUIERDA: MÉTRICAS Y PIE CHARTS ── */}
        <div className="col">
          <div className="rcard" style={{ flex: '0 0 auto' }}>
            <div className="rcard-title">Métricas Base del Partido</div>
            <StatBar label="xG Generado" vL={loc.xg} vV={vis.xg} isFloat />
            <StatBar label="Tiros Totales" vL={loc.remates} vV={vis.remates} />
            <StatBar label="Tiros al Arco" vL={loc.rematesAlArco} vV={vis.rematesAlArco} />
            <StatBar label="Recuperaciones" vL={loc.recuperaciones} vV={vis.recuperaciones} />
            <StatBar label="Pérdidas" vL={loc.perdidas} vV={vis.perdidas} />
            <StatBar label="Faltas Cometidas" vL={loc.faltas} vV={vis.faltas} />
            <StatBar label="Duelos Ganados" vL={loc.duelosGanados || 0} vV={(loc.duelosTotales || 0) - (loc.duelosGanados || 0)} />
          </div>

          <div className="rcard" style={{ flex: 1, minHeight: 0, paddingBottom: '4px' }}>
            <div className="rcard-title" style={{ color: CL, marginBottom: '4px' }}>Goles A Favor</div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'center' }}>
              <div style={{ flex: '0 0 45%', height: '100%', minHeight: '80px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={golesOrigen.local} cx="50%" cy="50%" innerRadius={22} outerRadius={36} paddingAngle={3} dataKey="value" stroke="none">
                      {golesOrigen.local.map((entry, index) => <Cell key={`cell-${index}`} fill={ORIGEN_COLORS[index % ORIGEN_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                  {golesOrigen.local.map((g, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                        <div style={{ background: ORIGEN_COLORS[i % ORIGEN_COLORS.length], width: 6, height: 6, borderRadius: '50%', flexShrink: 0 }} />
                        <span style={{ color: '#888', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: ORIGEN_COLORS[i % ORIGEN_COLORS.length] }}>{g.value}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="rcard" style={{ flex: 1, minHeight: 0, paddingBottom: '4px' }}>
            <div className="rcard-title" style={{ color: CV, marginBottom: '4px' }}>Goles En Contra</div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'center' }}>
              <div style={{ flex: '0 0 45%', height: '100%', minHeight: '80px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={golesOrigen.rival} cx="50%" cy="50%" innerRadius={22} outerRadius={36} paddingAngle={3} dataKey="value" stroke="none">
                      {golesOrigen.rival.map((entry, index) => <Cell key={`cell-${index}`} fill={ORIGEN_COLORS[index % ORIGEN_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                  {golesOrigen.rival.map((g, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                        <div style={{ background: ORIGEN_COLORS[i % ORIGEN_COLORS.length], width: 6, height: 6, borderRadius: '50%', flexShrink: 0 }} />
                        <span style={{ color: '#888', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: ORIGEN_COLORS[i % ORIGEN_COLORS.length] }}>{g.value}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-sep" />

        {/* ── COL CENTRAL: MAPAS Y XG FLOW ──────────────── */}
        <div className="col">
          <div className="rcard" style={{ flex: '0 0 auto', paddingBottom: '8px' }}>
            <div className="rcard-title" style={{ marginBottom: '8px' }}>Mapeo Espacial de Remates</div>
            <div className="pitch-wrap" style={{ aspectRatio: '2.1/1', marginBottom: '6px' }}>
              {/* 🌟 USAMOS EL DISEÑO OPTIMIZADO 🌟 */}
              <PitchLinesOptimized strokeWidth={0.4} />
              {(tiros || []).map((t, i) => {
                const color = t.equipo === 'local' ? CL : CV;
                const size  = t.esGol ? 14 : Math.max(6, (t.xg || 0.05) * 30);
                return (
                  <div key={i} className="shot-dot"
                    style={{
                      left: `${t.x}%`, top: `${t.y}%`, width: `${size}px`, height: `${size}px`,
                      background: t.esGol ? color : 'transparent', border: `2px solid ${color}`,
                      boxShadow: t.esGol ? `0 0 7px ${color}` : 'none', zIndex: t.esGol ? 10 : 1, opacity: t.esGol ? 1 : 0.75,
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
                  <div className="legend-dot" style={{ background: it.solid ? it.color : 'transparent', border: it.solid ? 'none' : `2px solid ${it.color}` }} />
                  {it.label}
                </div>
              ))}
            </div>
          </div>

          <div className="rcard" style={{ flex: '0 0 auto', paddingBottom: '8px' }}>
            <div className="rcard-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span>Recuperaciones vs Pérdidas</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 800 }}>
                <span style={{ color: '#326ece' }}>{loc.recuperaciones} REC</span>
                <span style={{ margin: '0 4px', color: '#555' }}>|</span>
                <span style={{ color: '#ff3c00' }}>{loc.perdidas} PER</span>
              </span>
            </div>
            <div className="pitch-wrap" style={{ aspectRatio: '2.1/1', marginBottom: '6px' }}>
              {/* 🌟 USAMOS EL DISEÑO OPTIMIZADO 🌟 */}
              <PitchLinesOptimized strokeWidth={0.4} />
              {(data.recYPer || []).map((ev, i) => {
                const isRec = ev.tipo === 'Recuperación';
                const color = isRec ? '#326ece' : '#ff3c00';
                return (
                  <div key={i} className="shot-dot"
                    style={{
                      left: `${ev.x}%`, top: `${ev.y}%`, width: '7px', height: '7px',
                      background: color, opacity: 0.85, boxShadow: `0 0 5px ${color}`, zIndex: isRec ? 2 : 1
                    }}
                  />
                );
              })}
            </div>
            <div className="pitch-legend">
              <div className="pitch-legend-item">
                <div className="legend-dot" style={{ background: '#326ece' }} /> Recuperaciones
              </div>
              <div className="pitch-legend-item">
                <div className="legend-dot" style={{ background: '#ff3c00' }} /> Pérdidas
              </div>
            </div>
          </div>

          <div className="rcard" style={{ flex: 1, minHeight: 0 }}>
            <div className="rcard-title" style={{ marginBottom: '8px' }}>xG Flow — Impulso de Ataque</div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={xgFlow || []} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="minuto" stroke="#333" tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
                  <YAxis stroke="#333" tick={{ fontSize: 10, fill: '#666', fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<XgTooltip />} />
                  <ReferenceLine x={20} stroke="#333" strokeDasharray="4 3" label={{ value: 'ET', position: 'insideTopRight', fontSize: 10, fill: '#666' }} />
                  <Line type="stepAfter" dataKey="xgLocal" stroke={CL} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="stepAfter" dataKey="xgVisitante" stroke={CV} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="col-sep" />

        {/* ── COL DERECHA: RENDIMIENTO INDIVIDUAL ───────── */}
        <div className="col">
          <div className="rcard" style={{ flex: 1 }}>
            <div className="rcard-title" style={{ color: CA }}>Top 5 Rating Integral</div>
            {top5Rating.length === 0
              ? <span style={{ color: '#555', fontSize: '0.8rem', textAlign: 'center' }}>Sin datos</span>
              : top5Rating.map((j, i) => {
                  const r = typeof j.rating === 'number' ? j.rating : parseFloat(j.rating) || 0;
                  return <Top5Row key={i} pos={i + 1} nombre={j.nombre} val={fmt1(r)} color={r >= 7 ? CL : r >= 6 ? CA : CV} />;
                })
            }
          </div>

          <div className="rcard" style={{ flex: 1 }}>
            <div className="rcard-title" style={{ color: '#3b82f6' }}>Top 5 Recuperadores</div>
            {top5Rec.length === 0
              ? <span style={{ color: '#555', fontSize: '0.8rem', textAlign: 'center' }}>Sin datos</span>
              : top5Rec.map((j, i) => <Top5Row key={i} pos={i + 1} nombre={j.nombre} val={j.rec || 0} color="#3b82f6" />)
            }
          </div>

          <div className="rcard" style={{ flex: 1 }}>
            <div className="rcard-title" style={{ color: CL }}>Top 5 Finalizadores</div>
            {top5Remates.length === 0
              ? <span style={{ color: '#555', fontSize: '0.8rem', textAlign: 'center' }}>Sin datos</span>
              : top5Remates.map((j, i) => <Top5Row key={i} pos={i + 1} nombre={j.nombre} val={`${j.goles || 0}G - ${j.remates || 0}R`} color={(j.goles || 0) > 0 ? CL : '#888'} />)
            }
          </div>
        </div>

      </div>

      {/* ══ FOOTER ══════════════════════════════════════════ */}
      <div className="report-footer">
        <span>Reporte generado automáticamente · {info.fecha}</span>
        <span><strong>VIRTUAL.CLUB © 2026</strong> - Propiedad de <span style={{ color: "#fd7d05" }}>VirtualFutsal</span></span>
      </div>

    </div>
  );
};

export default MatchReport;