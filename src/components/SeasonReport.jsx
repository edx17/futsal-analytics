import React from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';

const FONT = "'JetBrains Mono', monospace";
const CG = '#00e676';
const CR = '#ff1744';
const CA = '#ffd600';
const CB = '#3b82f6';
const ORIGEN_COLORS = ['#3b82f6','#f59e0b','#10b981','#ef4444','#a855f7','#06b6d4','#f472b6','#ffffff','#4b5563'];

const fmt1 = (v) => typeof v === 'number' ? v.toFixed(1) : '—';
const fmt2 = (v) => typeof v === 'number' ? v.toFixed(2) : '—';
const n = (v, fb = 0) => { const x = Number(v); return Number.isFinite(x) ? x : fb; };

/* ── Líneas de cancha SVG ── */
const PitchLinesSVG = () => (
  <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"
    style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:0, pointerEvents:'none' }}>
    <rect x="0" y="0" width="100" height="50" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="0.5" />
    <line x1="50" y1="0" x2="50" y2="50" stroke="rgba(255,255,255,.15)" strokeWidth="0.5" />
    <circle cx="50" cy="25" r="7.5" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="0.5" />
    <circle cx="50" cy="25" r="0.6" fill="rgba(255,255,255,.15)" />
    <path d="M 0 6.25 A 15 15 0 0 1 15 21.25 L 15 28.75 A 15 15 0 0 1 0 43.75" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="0.5" />
    <rect x="-2.5" y="21.25" width="2.5" height="7.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
    <path d="M 100 6.25 A 15 15 0 0 0 85 21.25 L 85 28.75 A 15 15 0 0 0 100 43.75" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="0.5" />
    <rect x="100" y="21.25" width="2.5" height="7.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.35" strokeDasharray="1.5 1.5" />
    <path d="M 2.5 0 A 2.5 2.5 0 0 1 0 2.5" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="0.35" />
    <path d="M 0 47.5 A 2.5 2.5 0 0 1 2.5 50" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="0.35" />
    <path d="M 97.5 50 A 2.5 2.5 0 0 1 100 47.5" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="0.35" />
    <path d="M 100 2.5 A 2.5 2.5 0 0 1 97.5 0" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="0.35" />
  </svg>
);

/* ── Cancha de zonas de goles ── */
const CanchaGolesZonas = ({ golesZonas = {} }) => {
  const zX = ['Z1','Z2','Z3','Z4'];
  const zY = ['I','C','D'];
  const maxVal = Math.max(...Object.values(golesZonas), 1);
  const total  = Object.values(golesZonas).reduce((s, v) => s + v, 0);
  return (
    <div style={{ position:'relative', width:'100%', aspectRatio:'2/1', borderRadius:6, overflow:'hidden', background:'#080808', border:'1px solid rgba(255,255,255,.08)' }}>
      <PitchLinesSVG />
      <svg viewBox="0 0 100 50" style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1, pointerEvents:'none' }}>
        {zX.map((xVal, colIdx) =>
          zY.map((yVal, rowIdx) => {
            const key   = `${xVal}-${yVal}`;
            const count = golesZonas[key] || 0;
            const opacity = count > 0 ? Math.min(0.8, (count / maxVal) * 0.65 + 0.12) : 0;
            return (
              <g key={key}>
                {count > 0 && (
                  <rect x={colIdx*25} y={rowIdx*16.66} width="25" height="16.66"
                    fill={CG} fillOpacity={opacity} />
                )}
                <rect x={colIdx*25} y={rowIdx*16.66} width="25" height="16.66"
                  fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="0.15" />
                <text x={colIdx*25+1.2} y={rowIdx*16.66+3.2} fill="rgba(255,255,255,.18)"
                  fontSize="2" fontWeight="bold">{key}</text>
                {count > 0 && (
                  <text x={colIdx*25+12.5} y={rowIdx*16.66+11} fill="#fff"
                    fontSize="7" textAnchor="middle" fontWeight="900"
                    style={{ filter:'drop-shadow(0px 0px 2px rgba(0,0,0,1))' }}>
                    {count}
                  </text>
                )}
              </g>
            );
          })
        )}
      </svg>
      {total === 0 && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.2)', fontSize:'.7rem', fontFamily:FONT, zIndex:2 }}>
          Sin goles registrados
        </div>
      )}
    </div>
  );
};

/* ── Barra dual horizontal ── */
const DualBar = ({ label, vL = 0, vV = 0, isFloat }) => {
  const total = (vL || 0) + (vV || 0);
  const pL = total > 0 ? (vL / total) * 100 : 50;
  const pV = total > 0 ? (vV / total) * 100 : 50;
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
        <span style={{ fontFamily:FONT, fontSize:'.9rem', fontWeight:800, color:CG }}>{isFloat ? fmt2(vL) : vL}</span>
        <span style={{ fontSize:'.55rem', fontWeight:800, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:1 }}>{label}</span>
        <span style={{ fontFamily:FONT, fontSize:'.9rem', fontWeight:800, color:CR }}>{isFloat ? fmt2(vV) : vV}</span>
      </div>
      <div style={{ display:'flex', height:4, borderRadius:2, overflow:'hidden', background:'#1a1a1a', gap:1 }}>
        <div style={{ width:`${pL}%`, background:CG }} />
        <div style={{ width:`${pV}%`, background:CR }} />
      </div>
    </div>
  );
};

/* ── Fila de ranking ── */
const RankRow = ({ pos, nombre, val, sub, color = CG, last }) => (
  <div style={{ display:'flex', alignItems:'center', padding:'7px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.04)', gap:8 }}>
    <span style={{ fontFamily:FONT, fontSize:'.7rem', fontWeight:800, color:'#333', width:16, textAlign:'center', flexShrink:0 }}>{pos}</span>
    <span style={{ flex:1, fontSize:'.8rem', fontWeight:800, textTransform:'uppercase', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#eee' }}>{nombre}</span>
    {sub !== undefined && <span style={{ fontSize:'.6rem', fontWeight:700, color:'#555', marginRight:4, fontFamily:FONT }}>{sub}</span>}
    <span style={{ fontFamily:FONT, fontSize:'.78rem', fontWeight:800, padding:'2px 8px', borderRadius:4, background:'rgba(255,255,255,.04)', color, flexShrink:0, minWidth:32, textAlign:'center' }}>{val}</span>
  </div>
);

/* ── Card ── */
const Card = ({ title, titleColor = '#fff', children, style = {} }) => (
  <div style={{ background:'#111', borderRadius:8, border:'1px solid rgba(255,255,255,.07)', padding:'12px 14px', display:'flex', flexDirection:'column', overflow:'hidden', ...style }}>
    {title && (
      <div style={{ fontFamily:FONT, fontSize:'.6rem', fontWeight:700, color:titleColor, textTransform:'uppercase', letterSpacing:1.5, marginBottom:10, paddingBottom:6, borderBottom:'1px solid rgba(255,255,255,.06)', flexShrink:0 }}>
        {title}
      </div>
    )}
    {children}
  </div>
);

/* ── Origen de goles compacto ── */
const OrigenCompacto = ({ items, color }) => {
  if (!items?.length) return <span style={{ color:'#333', fontSize:'.7rem' }}>Sin datos</span>;
  const total = items.reduce((s, x) => s + (x.value || 0), 0);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      {items.map((g, i) => {
        const pct = total > 0 ? Math.round((g.value / total) * 100) : 0;
        const col = ORIGEN_COLORS[i % ORIGEN_COLORS.length];
        return (
          <div key={i}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden' }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:col, flexShrink:0 }} />
                <span style={{ fontSize:'.58rem', fontWeight:700, color:'#888', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.name}</span>
              </div>
              <span style={{ fontFamily:FONT, fontSize:'.65rem', fontWeight:800, color:col, marginLeft:4, flexShrink:0 }}>{g.value}</span>
            </div>
            <div style={{ height:3, background:'rgba(255,255,255,.06)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
const SeasonReport = ({ data }) => {
  if (!data) return null;

  const { equipos, resultado, info, stats, golesOrigen, radarData = [],
          statsAdicionales = {}, abp = {}, desgloseRemates = {}, desgasteData = [],
          perfilRemate = {}, golesZonas = {} } = data;

  const loc = stats?.local     || {};
  const vis = stats?.visitante || {};

  /* Balance */
  const balance = info?.balanceTemporada || '0V - 0E - 0D';
  const [vic, emp, der] = balance.split(' - ').map(s => parseInt(s) || 0);
  const totalPJ = vic + emp + der;
  const pctVic  = totalPJ > 0 ? Math.round((vic / totalPJ) * 100) : 0;

  /* Goles */
  const parts  = (resultado?.final || '0 - 0').split(' - ').map(s => parseInt(s) || 0);
  const [golesF, golesC] = [parts[0] || 0, parts[1] || 0];
  const xgDiff = n(loc.xg) - n(vis.xg);

  /* Top listas — CORREGIDO: usar los campos correctos */
  const topGoleadores   = (stats?.topJugadores    || []).slice(0, 5);
  const topAsistidores  = (stats?.topJugadoresExt || []).slice(0, 5);

  /* Duelos */
  const sa = statsAdicionales;
  const pctDueloDef = n(sa.duelosDefTotales) > 0 ? Math.round((n(sa.duelosDefGanados) / n(sa.duelosDefTotales)) * 100) : 0;
  const pctDueloOfe = n(sa.duelosOfeTotales) > 0 ? Math.round((n(sa.duelosOfeGanados) / n(sa.duelosOfeTotales)) * 100) : 0;

  /* Eficacia de tiro */
  const totalRemates = n(loc.remates) || (n(desgloseRemates.propio?.goles) + n(desgloseRemates.propio?.atajados) + n(desgloseRemates.propio?.desviados) + n(desgloseRemates.propio?.rebatidos));
  const eficaciaTiro = totalRemates > 0 ? Math.round((golesF / totalRemates) * 100) : 0;

  /* Desglose remates — barras horizontales */
  const dp = desgloseRemates.propio || {};
  const dr = desgloseRemates.rival  || {};
  const desgloseBars = [
    { label:'Goles',    vL: n(dp.goles),    vV: n(dr.goles),    color: CG },
    { label:'Atajados', vL: n(dp.atajados), vV: n(dr.atajados), color: CB },
    { label:'Desviados',vL: n(dp.desviados),vV: n(dr.desviados),color:'#6b7280' },
    { label:'Rebatidos',vL: n(dp.rebatidos),vV: n(dr.rebatidos),color:'#a855f7' },
  ];

  /* Escudo */
  const escudoLocal = equipos?.local?.escudo;
  const nombreLocal = equipos?.local?.nombre || 'MI EQUIPO';

  return (
    <div id="season-report-exportable" style={{
      width:1080, height:1080, background:'#050505', color:'#fff',
      fontFamily:"'Inter',system-ui,sans-serif",
      display:'grid', gridTemplateRows:'100px 46px 1fr 32px',
      boxSizing:'border-box', position:'relative', overflow:'hidden'
    }}>

      {/* grain */}
      <div style={{ position:'absolute', inset:0, zIndex:100, pointerEvents:'none', opacity:.25,
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`
      }} />

      {/* ══ HEADER ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', padding:'0 28px', background:'linear-gradient(180deg,#161616 0%,#0c0c0c 100%)', borderBottom:'1px solid rgba(255,255,255,.07)', position:'relative' }}>
        <div style={{ position:'absolute', bottom:-1, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${CG} 30%,#1a1a1a 50%,${CA} 70%,transparent)` }} />

        {/* Equipo */}
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {escudoLocal
            ? <img src={escudoLocal} style={{ width:64, height:64, objectFit:'contain', filter:'drop-shadow(0 0 8px rgba(255,255,255,.1))' }} alt="" />
            : <div style={{ width:64, height:64, borderRadius:'50%', background:'#1a1a1a', border:`2px solid ${CG}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FONT, fontWeight:800, fontSize:'1.2rem', color:CG }}>{nombreLocal.substring(0,2).toUpperCase()}</div>
          }
          <div>
            <div style={{ fontSize:'1.4rem', fontWeight:900, textTransform:'uppercase', letterSpacing:'-0.5px', lineHeight:1, color:CG }}>{nombreLocal}</div>
            <div style={{ fontFamily:FONT, fontSize:'.62rem', fontWeight:600, color:'#444', marginTop:3 }}>REPORTE DE TEMPORADA</div>
            <div style={{ fontFamily:FONT, fontSize:'.6rem', color:'#333', marginTop:2 }}>
              {info?.torneo && info.torneo !== 'Todas las Competencias' ? info.torneo : ''}{info?.categoria && info.categoria !== 'Todas las Categorías' ? ` · ${info.categoria}` : ''}
            </div>
          </div>
        </div>

        {/* Marcador */}
        <div style={{ textAlign:'center', padding:'0 16px', flexShrink:0 }}>
          <div style={{ fontFamily:FONT, fontSize:'.58rem', fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:1, marginBottom:3 }}>GOLES TEMPORADA</div>
          <div style={{ fontFamily:FONT, fontSize:'3rem', fontWeight:900, lineHeight:1, display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
            <span style={{ color:CG }}>{golesF}</span>
            <span style={{ color:'#222' }}>–</span>
            <span style={{ color:CR }}>{golesC}</span>
          </div>
          <div style={{ fontFamily:FONT, fontSize:'.68rem', fontWeight:700, color: xgDiff >= 0 ? CG : CR, marginTop:3 }}>
            Dif. xG: {xgDiff >= 0 ? '+' : ''}{fmt2(xgDiff)}
          </div>
        </div>

        {/* Balance */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:20 }}>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            {[{val:vic,label:'V',color:CG},{val:emp,label:'E',color:CA},{val:der,label:'D',color:CR}].map((b,i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:FONT, fontSize:'1.8rem', fontWeight:900, color:b.color, lineHeight:1 }}>{b.val}</div>
                <div style={{ fontSize:'.58rem', fontWeight:800, color:'#444', marginTop:2 }}>{b.label}</div>
              </div>
            ))}
          </div>
          <div style={{ width:58, height:58, flexShrink:0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{v:vic||.01},{v:emp||.01},{v:der||.01}]} dataKey="v" cx="50%" cy="50%" innerRadius={16} outerRadius={27} paddingAngle={2} stroke="none">
                  {[CG,CA,CR].map((c,i) => <Cell key={i} fill={c} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ══ KPI STRIP ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', background:'#080808', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
        {[
          { val:totalPJ,            label:'Partidos',      color:'#fff' },
          { val:`${pctVic}%`,       label:'% Victorias',   color:CG },
          { val:fmt2(n(loc.xg)),    label:'xG Propio',     color:CG },
          { val:fmt2(n(vis.xg)),    label:'xG Recibido',   color:CR },
          { val:`${eficaciaTiro}%`, label:'Efic. Tiro',    color:CA },
          { val:`${pctDueloDef}%`,  label:'Duelos Def.',   color:CB },
          { val:n(sa.recuperaciones)||n(loc.recuperaciones)||0, label:'Recuperaciones', color:CB },
          { val:`${n(sa.recuperacionesAltas)||0}`, label:'Rec. Altas', color:CA },
        ].map((k,i,arr) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'6px 4px', borderRight: i<arr.length-1 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
            <span style={{ fontFamily:FONT, fontSize:'1.15rem', fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</span>
            <span style={{ fontSize:'.5rem', fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:.5, marginTop:2, textAlign:'center', lineHeight:1.2 }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* ══ BODY ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'300px 1px 1fr 1px 270px', padding:'10px', gap:'10px', overflow:'hidden' }}>

        {/* ── COL IZQUIERDA ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, overflow:'hidden' }}>

          {/* Radar — protagonista */}
          <Card title="Perfil de Juego" style={{ flex:'0 0 auto' }}>
            <div style={{ height:200 }}>
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top:10, right:36, left:36, bottom:10 }}>
                    <PolarGrid stroke="#1e1e1e" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill:'#666', fontSize:9, fontWeight:700, fontFamily:FONT }} />
                    <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />
                    <Radar dataKey="A" stroke={CG} fill={CG} fillOpacity={0.18} strokeWidth={2} dot={{ fill:CG, r:2 }} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#333', fontSize:'.8rem' }}>Sin datos de radar</div>
              )}
            </div>
          </Card>

          {/* Comparativa propio vs rival */}
          <Card title="Propio vs Rival">
            <div style={{ marginBottom:4, display:'flex', justifyContent:'space-between', fontSize:'.55rem', fontWeight:800, color:'#333', textTransform:'uppercase', fontFamily:FONT }}>
              <span style={{ color:CG }}>PROPIO</span>
              <span style={{ color:CR }}>RIVAL</span>
            </div>
            <DualBar label="xG Generado"    vL={n(loc.xg)}           vV={n(vis.xg)}           isFloat />
            <DualBar label="Remates"         vL={totalRemates}         vV={n(loc.rematesAlArco) + n(dr.atajados) + n(dr.desviados) + n(dr.rebatidos)} />
            <DualBar label="Tiros al Arco"  vL={n(loc.rematesAlArco)} vV={n(vis.rematesAlArco)} />
            <DualBar label="Recuperaciones" vL={n(sa.recuperaciones)||n(loc.recuperaciones)||0} vV={0} />
            <DualBar label="Pérd. Peligrosas" vL={n(sa.perdidasPeligrosas)||n(loc.perdidas)||0} vV={0} />
          </Card>

          {/* Goles por período */}
          {desgasteData.length > 0 && (
            <Card title="Goles por Período" style={{ flex:'0 0 auto' }}>
              <div style={{ height:80 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={desgasteData} margin={{ top:0, right:0, left:-25, bottom:0 }} barSize={22}>
                    <XAxis dataKey="name" tick={{ fontSize:8, fill:'#555', fontFamily:FONT }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:8, fill:'#555' }} axisLine={false} tickLine={false} />
                    <Bar dataKey="Anotados"  fill={CG} radius={[2,2,0,0]} />
                    <Bar dataKey="Recibidos" fill={CR} radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:'flex', gap:14, justifyContent:'center', marginTop:4 }}>
                {[{c:CG,l:'Anotados'},{c:CR,l:'Recibidos'}].map((x,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:'.52rem', fontWeight:800, color:'#555' }}>
                    <div style={{ width:7, height:7, borderRadius:2, background:x.c }} />{x.l}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Cancha de goles por zona */}
          <Card title="Goles por Zona" style={{ flex:'0 0 auto' }}>
            <CanchaGolesZonas golesZonas={golesZonas} />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:'.52rem', fontWeight:700, color:'rgba(255,255,255,.3)', fontFamily:FONT, textTransform:'uppercase', letterSpacing:1 }}>
              
            </div>
          </Card>

        </div>

        {/* separador */}
        <div style={{ background:'rgba(255,255,255,.05)', margin:'4px 0' }} />

        {/* ── COL CENTRAL ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, overflow:'hidden' }}>

          {/* Origen goles — a favor y en contra en una sola card */}
          <Card title="Origen de Goles" style={{ flex:'0 0 auto' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1px 1fr', gap:12 }}>
              <div>
                <div style={{ fontFamily:FONT, fontSize:'.55rem', fontWeight:800, color:CG, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
                  A Favor · {golesF}
                </div>
                <OrigenCompacto items={golesOrigen?.local} color={CG} />
              </div>
              <div style={{ background:'rgba(255,255,255,.05)' }} />
              <div>
                <div style={{ fontFamily:FONT, fontSize:'.55rem', fontWeight:800, color:CR, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
                  En Contra · {golesC}
                </div>
                <OrigenCompacto items={golesOrigen?.rival} color={CR} />
              </div>
            </div>
          </Card>

          {/* Desglose de remates — barras horizontales limpias */}
          <Card title="Desglose de Remates — Propio vs Rival" style={{ flex:'0 0 auto' }}>
            <div style={{ marginBottom:4, display:'flex', justifyContent:'space-between', fontSize:'.55rem', fontWeight:800, color:'#333', textTransform:'uppercase', fontFamily:FONT }}>
              <span style={{ color:CG }}>PROPIO</span>
              <span style={{ color:CR }}>RIVAL</span>
            </div>
            {desgloseBars.map((b,i) => (
              <div key={i} style={{ marginBottom:7 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                  <span style={{ fontFamily:FONT, fontSize:'.88rem', fontWeight:800, color:b.color, minWidth:28 }}>{b.vL}</span>
                  <span style={{ fontSize:'.52rem', fontWeight:800, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:1 }}>{b.label}</span>
                  <span style={{ fontFamily:FONT, fontSize:'.88rem', fontWeight:800, color:'rgba(255,68,68,.7)', minWidth:28, textAlign:'right' }}>{b.vV}</span>
                </div>
                <div style={{ display:'flex', height:4, borderRadius:2, overflow:'hidden', background:'#1a1a1a', gap:1 }}>
                  <div style={{ width:`${(b.vL/(b.vL+b.vV+.001))*100}%`, background:b.color }} />
                  <div style={{ width:`${(b.vV/(b.vL+b.vV+.001))*100}%`, background:'rgba(255,68,68,.5)' }} />
                </div>
              </div>
            ))}
            {/* Perfil de remate */}
            {(perfilRemate.centro !== undefined) && (
              <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(255,255,255,.05)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[
                  { label:'Centro',  val:n(perfilRemate.centro),  color:CG },
                  { label:'Banda',   val:n(perfilRemate.banda),   color:'#6b7280' },
                  { label:'Cercano', val:n(perfilRemate.cerca),   color:CA },
                  { label:'Lejano',  val:n(perfilRemate.lejos),   color:CR },
                ].map((r,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,.02)', borderRadius:4, padding:'4px 8px' }}>
                    <span style={{ fontSize:'.52rem', fontWeight:800, color:'#555', textTransform:'uppercase' }}>{r.label}</span>
                    <span style={{ fontFamily:FONT, fontSize:'.8rem', fontWeight:800, color:r.color }}>{r.val}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Duelos, ABP y situaciones */}
          <Card title="Duelos, ABP & Situaciones" style={{ flex:1 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, flex:1 }}>
              {[
                { val:`${pctDueloOfe}%`,              label:'Duelos Ofe.',     color:CG,      sub:`${n(sa.duelosOfeGanados)}/${n(sa.duelosOfeTotales)}` },
                { val:`${pctDueloDef}%`,              label:'Duelos Def.',     color:CB,      sub:`${n(sa.duelosDefGanados)}/${n(sa.duelosDefTotales)}` },
                { val:n(sa.recuperacionesAltas)||0,   label:'Rec. Altas',      color:CA,      sub:'presión alta' },
                { val:n(sa.perdidasPeligrosas)||0,    label:'Pérd. Peligrosas',color:CR,      sub:'generaron remate' },
                { val:n(abp?.corners?.favor)||0,      label:'Córners A Favor', color:'#a855f7',sub:`${n(abp?.corners?.rematesGenerados)||0} rem. gen.` },
                { val:n(abp?.corners?.contra)||0,     label:'Córners En Contra',color:'#555', sub:null },
              ].map((k,i) => (
                <div key={i} style={{ background:'rgba(255,255,255,.025)', borderRadius:6, border:'1px solid rgba(255,255,255,.05)', padding:'10px 8px', textAlign:'center', display:'flex', flexDirection:'column', gap:3, justifyContent:'center' }}>
                  <div style={{ fontFamily:FONT, fontSize:'1.3rem', fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
                  <div style={{ fontSize:'.5rem', fontWeight:800, color:'#444', textTransform:'uppercase', lineHeight:1.3 }}>{k.label}</div>
                  {k.sub && <div style={{ fontSize:'.5rem', color:'#333', fontFamily:FONT }}>{k.sub}</div>}
                </div>
              ))}
            </div>
          </Card>

        </div>

        {/* separador */}
        <div style={{ background:'rgba(255,255,255,.05)', margin:'4px 0' }} />

        {/* ── COL DERECHA ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, overflow:'hidden' }}>

          {/* Top goleadores — CORREGIDO: j.rating = j.goles en Temporada.jsx */}
          <Card title="Top Goleadores" titleColor={CG} style={{ flex:1 }}>
            {topGoleadores.length === 0
              ? <span style={{ color:'#333', fontSize:'.75rem' }}>Sin datos</span>
              : topGoleadores.map((j,i) => (
                <RankRow key={i} pos={i+1} nombre={j.nombre}
                  val={`${j.rating ?? j.goles ?? 0}G`}
                  color={CG} last={i === topGoleadores.length-1} />
              ))
            }
          </Card>

          {/* Top asistidores — CORREGIDO: j.goles = j.asistencias en Temporada.jsx */}
          <Card title="Top Asistidores" titleColor={CA} style={{ flex:1 }}>
            {topAsistidores.length === 0
              ? <span style={{ color:'#333', fontSize:'.75rem' }}>Sin datos</span>
              : topAsistidores.map((j,i) => (
                <RankRow key={i} pos={i+1} nombre={j.nombre}
                  val={`${j.goles ?? j.asistencias ?? 0}A`}
                  color={CA} last={i === topAsistidores.length-1} />
              ))
            }
          </Card>

          {/* KPIs ofensivos únicos */}
          <Card title="Eficiencia Ofensiva" style={{ flex:'0 0 auto' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                { label:'Eficacia de tiro',       val:`${eficaciaTiro}%`,                                        color:CG },
                { label:'xG por remate',           val: totalRemates > 0 ? fmt2(n(loc.xg)/totalRemates) : '—',   color:CA },
                { label:'Goles vs xG esperado',    val: `${(golesF - n(loc.xg)) >= 0 ? '+' : ''}${(golesF - n(loc.xg)).toFixed(2)}`, color: (golesF - n(loc.xg)) >= 0 ? CG : CR },
                { label:'% Campo rival',           val: data.territoryPct ? `${data.territoryPct}%` : '—',        color:CB },
              ].map((r,i,arr) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom: i<arr.length-1 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                  <span style={{ fontSize:'.65rem', color:'#555', fontWeight:700 }}>{r.label}</span>
                  <span style={{ fontFamily:FONT, fontSize:'.8rem', fontWeight:800, color:r.color }}>{r.val}</span>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>

      {/* ══ FOOTER ══ */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 24px', background:'#080808', borderTop:'1px solid rgba(255,255,255,.06)', fontFamily:FONT, fontSize:'.58rem', fontWeight:600, color:'#333', textTransform:'uppercase', letterSpacing:1 }}>
        <span>Reporte de Temporada · {info?.fecha || 'Temporada Actual'}</span>
        <span>VIRTUAL.CLUB © 2026 — Propiedad de <span style={{ color:'#fd7d05' }}>VirtualFutsal</span></span>
      </div>

    </div>
  );
};

export default SeasonReport;