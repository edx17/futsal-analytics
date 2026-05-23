import React from 'react';
import './MatchReport.css';

const CL = '#00e676';
const CV = '#ff1744';
const CA = '#ffd600';

const ORIGEN_COLORS = [
  '#3b82f6','#f59e0b','#10b981',
  '#ef4444','#a855f7','#06b6d4','#f472b6','#ffffff'
];

const pct  = (a, b) => { const t = (a||0)+(b||0); return t > 0 ? [(a/t)*100,(b/t)*100] : [50,50]; };
const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '0.00');
const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');
const fmtN = (v) => (typeof v === 'number' ? v : (v ?? 0));

const RiverRow = ({ label, vL = 0, vV = 0, isFloat }) => {
  const [pL, pV] = pct(vL, vV);
  return (
    <div className="mr-river-row">
      <div className="mr-rr-val left">{isFloat ? fmt2(vL) : fmtN(vL)}</div>
      <div className="mr-rr-bar-wrap">
        <div className="mr-rr-bar-l" style={{ width: `${pL}%` }} />
        <div className="mr-rr-bar-r" style={{ width: `${pV}%` }} />
        <div className="mr-rr-label">{label}</div>
      </div>
      <div className="mr-rr-val right">{isFloat ? fmt2(vV) : fmtN(vV)}</div>
    </div>
  );
};

const OrigenSection = ({ label, goles, totalColor }) => {
  const total = goles.reduce((s, g) => s + (g.value || 0), 0);
  return (
    <div className="mr-origin-section">
      <div className="mr-origin-header" style={{ color: totalColor }}>
        {label} · {total}
      </div>
      {goles.slice(0, 3).map((g, i) => {
        const color = ORIGEN_COLORS[i % ORIGEN_COLORS.length];
        const pctFill = total > 0 ? (g.value / total) * 100 : 0;
        return (
          <div key={i} className="mr-origin-row">
            <div className="mr-origin-dot" style={{ background: color }} />
            <div className="mr-origin-track">
              <div className="mr-origin-fill" style={{ width: `${pctFill}%`, background: color }} />
            </div>
            <span className="mr-origin-count" style={{ color }}>{g.value}</span>
            <span className="mr-origin-label">{g.name}</span>
          </div>
        );
      })}
    </div>
  );
};

const MatchReport = ({ data }) => {
  if (!data) return null;

  const { equipos, resultado, info, stats, golesOrigen } = data;
  const loc = stats?.local     || {};
  const vis = stats?.visitante || {};

  const parts = (resultado?.final || '0 - 0').split('-').map(s => parseInt(s.trim(), 10));
  const gL = isNaN(parts[0]) ? 0 : parts[0];
  const gV = isNaN(parts[1]) ? 0 : parts[1];

  const topJugadores    = stats?.topJugadores    || [];
  const topJugadoresExt = stats?.topJugadoresExt || [];
  const mvp    = topJugadores[0] || null;
  const mvpExt = mvp ? topJugadoresExt.find(j => j.nombre === mvp.nombre) : null;

  /* Top 3 finalizadores */
  const topRemates = [...topJugadoresExt]
    .sort((a, b) => (b.remates || 0) - (a.remates || 0))
    .slice(0, 3);

  const xgMax  = Math.max(loc.xg || 0, vis.xg || 0, 0.01);
  const xgPctL = ((loc.xg || 0) / xgMax) * 100;
  const xgPctV = ((vis.xg || 0) / xgMax) * 100;
  const convL  = (loc.remates || 0) > 0 ? Math.round((gL / loc.remates) * 100) : 0;
  const convV  = (vis.remates || 0) > 0 ? Math.round((gV / vis.remates) * 100) : 0;

  const escudoLocal  = equipos?.local?.escudo;
  const escudoVisita = equipos?.visitante?.escudo;
  const nombreLocal  = equipos?.local?.nombre    || 'Local';
  const nombreVisita = equipos?.visitante?.nombre || 'Visita';
  const inicialesL   = nombreLocal.substring(0,2).toUpperCase();
  const inicialesV   = nombreVisita.substring(0,2).toUpperCase();

  return (
    <div className="report-container" id="match-report-exportable">

      <div className="mr-bg-grid" />
      <div className="mr-wm">{gL}–{gV}</div>
      <div className="mr-blob-l" />
      <div className="mr-blob-r" />
      <div className="mr-corner tl" />
      <div className="mr-corner tr" />
      <div className="mr-corner bl" />
      <div className="mr-corner br" />

      {/* HERO */}
      <div className="mr-hero">
        <div className="mr-match-date">
          {info?.fecha}{info?.torneo ? ` · ${info.torneo}` : ''}
        </div>
        <div className="mr-versus">
          <div className="mr-team-side">
            <div className="mr-badge" style={{ background:'rgba(0,230,118,.08)', border:'2px solid rgba(0,230,118,.25)', color: CL }}>
              {escudoLocal ? <img src={escudoLocal} alt={nombreLocal} /> : inicialesL}
            </div>
            <div className="mr-team-name" style={{ color: CL }}>{nombreLocal}</div>
          </div>
          <div className="mr-score-block">
            <div className="mr-score-huge">
              <span style={{ color: gL >= gV ? CL : 'rgba(255,255,255,.35)' }}>{gL}</span>
              <span className="mr-score-sep">–</span>
              <span style={{ color: gV >= gL ? CV : 'rgba(255,255,255,.35)' }}>{gV}</span>
            </div>
            {resultado?.primerTiempo && (
              <div className="mr-halftime">ET: {resultado.primerTiempo}</div>
            )}
          </div>
          <div className="mr-team-side">
            <div className="mr-badge" style={{ background:'rgba(255,23,68,.08)', border:'2px solid rgba(255,23,68,.25)', color: CV }}>
              {escudoVisita ? <img src={escudoVisita} alt={nombreVisita} /> : inicialesV}
            </div>
            <div className="mr-team-name" style={{ color: CV }}>{nombreVisita}</div>
          </div>
        </div>
        <div className="mr-torneo-tag">
          <span className="mr-torneo-dot" />
          {info?.categoria || 'Futsal'}
          {info?.estadio && info.estadio !== '-' ? ` · ${info.estadio}` : ''}
        </div>
      </div>

      {/* DIVIDER */}
      <div className="mr-divider" />

      {/* STAT RIVER */}
      <div className="mr-river">
        <RiverRow label="xG Generado"   vL={loc.xg}             vV={vis.xg}             isFloat />
        <RiverRow label="Remates"        vL={loc.remates}         vV={vis.remates}        />
        <RiverRow label="Tiros al arco"  vL={loc.rematesAlArco}   vV={vis.rematesAlArco}  />
        <RiverRow label="Recuperaciones" vL={loc.recuperaciones}  vV={vis.recuperaciones} />
        <RiverRow label="Pérdidas"       vL={loc.perdidas}        vV={vis.perdidas}       />
        <RiverRow label="Faltas"         vL={loc.faltas}          vV={vis.faltas}         />
        <RiverRow
          label="Duelos ganados"
          vL={loc.duelosGanados ?? 0}
          vV={(loc.duelosTotales ?? 0) - (loc.duelosGanados ?? 0)}
        />
      </div>

      {/* BOTTOM 3 COLS — align-items start para que no estiren */}
      <div className="mr-bottom" style={{ alignItems:'start' }}>

        {/* COL 1 — MVP */}
        <div className="mr-b-col" style={{ justifyContent:'flex-start', padding:'16px 20px', gap:0 }}>

          {/* Label blanco */}
          <div style={{ fontSize:'.58rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(255,255,255,.9)', fontFamily:'var(--font-display)', marginBottom:10, alignSelf:'flex-start' }}>
            MVP DEL PARTIDO
          </div>

          {mvp ? (<>
            {/* Dorsal + rol */}
            <div style={{ fontSize:'.58rem', fontWeight:700, letterSpacing:2, color:'rgba(255,255,255,.4)', fontFamily:'var(--font-display)', alignSelf:'flex-start', marginBottom:6 }}>
              {mvpExt?.dorsal ? `#${mvpExt.dorsal}` : ''}{mvpExt?.rol ? ` · ${mvpExt.rol}` : ''}
            </div>

            {/* Nombre + Rating en la misma fila */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', width:'100%', marginBottom:16 }}>
              <div style={{ fontSize:'2rem', fontWeight:900, textTransform:'uppercase', letterSpacing:'-1px', lineHeight:1, color:'#fff' }}>
                {mvp.nombre}
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'3.6rem', fontWeight:900, fontFamily:'var(--font-display)', lineHeight:1, letterSpacing:'-3px', color: Number(mvp.rating) >= 7 ? CL : Number(mvp.rating) >= 6 ? CA : CV }}>
                  {fmt1(Number(mvp.rating))}
                </div>
                <div style={{ fontSize:'.5rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:'rgba(255,255,255,.3)', fontFamily:'var(--font-display)' }}>RATING</div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height:1, background:'rgba(255,255,255,.08)', width:'100%', marginBottom:14 }} />

            {/* Stats — número grande + label blanco */}
            <div style={{ display:'flex', width:'100%', justifyContent:'space-between' }}>
              {[
                { val: mvpExt?.goles ?? 0,   label:'GOL',  color: CL },
                { val: mvpExt?.remates ?? 0, label:'REM.', color:'#fff' },
                { val: mvpExt?.rec ?? 0,     label:'REC.', color:'#3b82f6' },
                { val: (mvpExt?.plusMinus ?? 0) > 0 ? `+${mvpExt.plusMinus}` : (mvpExt?.plusMinus ?? 0), label:'+/-', color:(mvpExt?.plusMinus ?? 0) >= 0 ? CL : CV },
              ].map((s, i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1, borderRight: i < 3 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                  <div style={{ fontSize:'1.8rem', fontWeight:900, fontFamily:'var(--font-display)', lineHeight:1, color:s.color, marginBottom:5 }}>{s.val}</div>
                  <div style={{ fontSize:'.56rem', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:'rgba(255,255,255,.75)', fontFamily:'var(--font-display)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </>) : (
            <div style={{ color:'rgba(255,255,255,.15)', fontSize:'.8rem', fontWeight:700 }}>Sin datos</div>
          )}

        </div>

        <div className="mr-b-sep" />

        {/* COL 2 — xG + Top 3 finalizadores */}
        <div className="mr-b-col" style={{ justifyContent:'flex-start', paddingTop:'20px', gap:'10px' }}>
          <div style={{ fontSize:'.58rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(255,255,255,.9)', fontFamily:'var(--font-display)', alignSelf:'flex-start' }}>CALIDAD DE OCASIONES</div>
          <div className="mr-xgc">
            <div className="mr-xgc-row">
              <div className="mr-xgc-head">
                <span className="mr-xgc-name" style={{ color: CL }}>{nombreLocal}</span>
                <span className="mr-xgc-val"  style={{ color: CL }}>{fmt2(loc.xg || 0)} xG</span>
              </div>
              <div className="mr-xgc-track">
                <div className="mr-xgc-fill" style={{ width:`${xgPctL}%`, background: CL }} />
              </div>
              <div className="mr-xgc-sub">{gL} GOLES · {convL}% CONVERSIÓN</div>
            </div>
            <div className="mr-h-sep" style={{ margin:'8px 0' }} />
            <div className="mr-xgc-row">
              <div className="mr-xgc-head">
                <span className="mr-xgc-name" style={{ color: CV }}>{nombreVisita}</span>
                <span className="mr-xgc-val"  style={{ color: CV }}>{fmt2(vis.xg || 0)} xG</span>
              </div>
              <div className="mr-xgc-track">
                <div className="mr-xgc-fill" style={{ width:`${xgPctV}%`, background: CV }} />
              </div>
              <div className="mr-xgc-sub">{gV} GOLES · {convV}% CONVERSIÓN</div>
            </div>
          </div>
          <div className="mr-h-sep" style={{ margin:'6px 0' }} />
          <div style={{ fontSize:'.58rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(255,255,255,.9)', fontFamily:'var(--font-display)', alignSelf:'flex-start' }}>TOP FINALIZADORES</div>
          <div className="mr-top-list">
            {topRemates.length === 0
              ? <div style={{ color:'rgba(255,255,255,.15)', fontSize:'.75rem' }}>Sin datos</div>
              : topRemates.map((j, i) => (
                <div key={i} className="mr-top-item">
                  <span className="mr-top-name">{j.nombre}</span>
                  <span className="mr-top-val" style={{ color:(j.goles||0)>0 ? CL : 'rgba(255,255,255,.3)' }}>
                    {j.goles||0}G · {j.remates||0}R
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        <div className="mr-b-sep" />

        {/* COL 3 — Origen goles + brand */}
        <div className="mr-b-col" style={{ justifyContent:'flex-start', paddingTop:'20px', gap:'10px' }}>
          <div style={{ fontSize:'.58rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(255,255,255,.9)', fontFamily:'var(--font-display)', alignSelf:'flex-start' }}>ORIGEN DE GOLES</div>
          {(golesOrigen?.local?.length ?? 0) > 0 && (
            <OrigenSection label="A favor" goles={golesOrigen.local} totalColor={CL} />
          )}
          <div className="mr-h-sep" />
          {(golesOrigen?.rival?.length ?? 0) > 0 && (
            <OrigenSection label="En contra" goles={golesOrigen.rival} totalColor={CV} />
          )}


        </div>

      </div>
      {/* ── FOOTER PIE DE IMAGEN ── */}
      <div style={{
        position:'relative', zIndex:5,
        height:36, flexShrink:0,
        borderTop:'1px solid rgba(255,255,255,.05)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 32px',
        background:'rgba(0,0,0,.25)'
      }}>
        <span style={{ fontFamily:'var(--font-display)', fontSize:'.7rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(255,255,255,.45)' }}>
          VIRTUAL.CLUB
        </span>
        <span style={{ fontFamily:'var(--font-display)', fontSize:'.7rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(253,125,5,.55)' }}>
          Virtual.Futsal
        </span>
      </div>

    </div>
  );
};

export default MatchReport;