import React from 'react';
import {
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip
} from 'recharts';

/* ── Paleta ─────────────────────────────────────────────────── */
const CG = '#00e676';   // verde propio
const CR = '#ff1744';   // rojo rival
const CA = '#ffd600';   // amarillo accent
const CB = '#3b82f6';   // azul stats

const ORIGEN_COLORS = [
  '#3b82f6','#f59e0b','#10b981',
  '#ef4444','#a855f7','#06b6d4','#f472b6','#ffffff','#4b5563'
];

/* ── Helpers ─────────────────────────────────────────────────── */
const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');
const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');
const pct  = (a, b) => { const t = (a||0)+(b||0); return t > 0 ? [(a/t)*100,(b/t)*100]:[50,50]; };

/* ── StatBar dual ────────────────────────────────────────────── */
const StatBar = ({ label, vL = 0, vV = 0, isFloat }) => {
  const [pL, pV] = pct(vL, vV);
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 4 }}>
        <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.92rem', fontWeight:800, color: CG, minWidth:38 }}>
          {isFloat ? fmt2(vL) : vL}
        </span>
        <span style={{ fontSize:'0.6rem', fontWeight:800, color:'#666', textTransform:'uppercase', textAlign:'center', flex:1, padding:'0 4px' }}>
          {label}
        </span>
        <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.92rem', fontWeight:800, color: CR, minWidth:38, textAlign:'right' }}>
          {isFloat ? fmt2(vV) : vV}
        </span>
      </div>
      <div style={{ display:'flex', height:5, borderRadius:2, overflow:'hidden', background:'#1a1a1a', gap:1 }}>
        <div style={{ width:`${pL}%`, background: CG, borderRadius:'2px 0 0 2px' }} />
        <div style={{ width:`${pV}%`, background: CR, borderRadius:'0 2px 2px 0' }} />
      </div>
    </div>
  );
};

/* ── RankRow ─────────────────────────────────────────────────── */
const RankRow = ({ pos, nombre, val, sub, color = CG }) => (
  <div style={{ display:'flex', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.05)', gap:8 }}>
    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.75rem', fontWeight:800, color:'#333', width:16, textAlign:'center', flexShrink:0 }}>
      {pos}
    </span>
    <span style={{ flex:1, fontSize:'0.82rem', fontWeight:800, textTransform:'uppercase', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#eee' }}>
      {nombre}
    </span>
    {sub !== undefined && (
      <span style={{ fontSize:'0.65rem', fontWeight:700, color:'#555', marginRight:4 }}>{sub}</span>
    )}
    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.8rem', fontWeight:800, padding:'2px 8px', borderRadius:4, background:'#1e1e1e', color, flexShrink:0, minWidth:36, textAlign:'center' }}>
      {val}
    </span>
  </div>
);

/* ── KpiCell ─────────────────────────────────────────────────── */
const KpiCell = ({ val, label, color = '#fff', sub }) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'10px 4px' }}>
    <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'1.4rem', fontWeight:800, color, lineHeight:1 }}>{val}</span>
    {sub && <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.7rem', fontWeight:700, color:'#888', marginTop:2 }}>{sub}</span>}
    <span style={{ fontSize:'0.58rem', fontWeight:800, color:'#555', textTransform:'uppercase', letterSpacing:'0.5px', marginTop:3 }}>{label}</span>
  </div>
);

/* ── Card wrapper ────────────────────────────────────────────── */
const Card = ({ title, titleColor = '#fff', children, style = {} }) => (
  <div style={{
    background:'#161616', borderRadius:6, border:'1px solid rgba(255,255,255,0.07)',
    padding:'12px', display:'flex', flexDirection:'column', overflow:'hidden', ...style
  }}>
    {title && (
      <div style={{
        fontFamily:'JetBrains Mono,monospace', fontSize:'0.72rem', fontWeight:700,
        color: titleColor, textTransform:'uppercase', letterSpacing:'1px',
        marginBottom:10, paddingBottom:6, borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0
      }}>
        {title}
      </div>
    )}
    {children}
  </div>
);

/* ═══════════════════════════════════════════════════════════════ */
/*  SEASON REPORT — 1080 × 1080                                   */
/* ═══════════════════════════════════════════════════════════════ */
const SeasonReport = ({ data }) => {
  if (!data) return null;

  const { equipos, resultado, info, stats, golesOrigen } = data;

  /* ── Radar data (reconstruimos desde lo que viene) ── */
  const radarData = data.radarData || [];

  /* ── Balance record ── */
  const balance = info?.balanceTemporada || '0V - 0E - 0D';
  const [vic, emp, der] = balance.split(' - ').map(s => parseInt(s) || 0);
  const totalPJ = vic + emp + der;
  const pctVic = totalPJ > 0 ? Math.round((vic / totalPJ) * 100) : 0;
  const balancePie = [
    { name: 'V', value: vic || 0.01 },
    { name: 'E', value: emp || 0.01 },
    { name: 'D', value: der || 0.01 },
  ];
  const PIE_COLORS_VED = [CG, CA, CR];

  /* ── Goles a favor / en contra ── */
  const golesParts = (resultado?.final || '0 - 0').split(' - ').map(s => parseInt(s)||0);
  const [golesF, golesC] = [golesParts[0] || 0, golesParts[1] || 0];
  const difGol = golesF - golesC;

  /* ── Origen goles local ── */
  const origenLocal = golesOrigen?.local || [];
  const origenRival = golesOrigen?.rival || [];

  /* ── Top listas ── */
  const topGoleadores = (stats?.topJugadores || []).slice(0, 5);
  const topAsistidores = (stats?.topJugadoresExt || []).slice(0, 5);

  /* ── Stats duales ── */
  const loc = stats?.local || {};
  const vis = stats?.visitante || {};

  /* ── xG diff color ── */
  const xgDiff = (loc.xg || 0) - (vis.xg || 0);
  const xgDiffColor = xgDiff > 0 ? CG : xgDiff < 0 ? CR : '#aaa';

  /* ── Desglose remates ── */
  const desgloseData = data.desgloseRemates ? [
    { name: 'Goles',    Propio: data.desgloseRemates.propio?.goles || 0,    Rival: data.desgloseRemates.rival?.goles || 0 },
    { name: 'Atajados', Propio: data.desgloseRemates.propio?.atajados || 0, Rival: data.desgloseRemates.rival?.atajados || 0 },
    { name: 'Desviados',Propio: data.desgloseRemates.propio?.desviados || 0,Rival: data.desgloseRemates.rival?.desviados || 0 },
    { name: 'Rebatidos',Propio: data.desgloseRemates.propio?.rebatidos || 0,Rival: data.desgloseRemates.rival?.rebatidos || 0 },
  ] : [];

  return (
    <div id="season-report-exportable" style={{
      width: 1080, height: 1080,
      background: '#0d0d0d',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'grid',
      gridTemplateRows: '110px 52px 1fr 36px',
      boxSizing: 'border-box',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* grain overlay */}
      <div style={{
        position:'absolute', inset:0, zIndex:100, pointerEvents:'none', opacity:0.35,
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
      }} />

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <div style={{
        display:'grid', gridTemplateColumns:'1fr auto 1fr',
        alignItems:'center', padding:'0 32px',
        background:'linear-gradient(180deg, #1c1c1c 0%, #111 100%)',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
        position:'relative'
      }}>
        {/* color line */}
        <div style={{
          position:'absolute', bottom:-1, left:0, right:0, height:2,
          background:`linear-gradient(90deg, transparent 0%, ${CG} 30%, #1a1a1a 50%, ${CA} 70%, transparent 100%)`
        }} />

        {/* equipo */}
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {equipos?.local?.escudo
            ? <img src={equipos.local.escudo} style={{ width:70, height:70, objectFit:'contain', filter:'drop-shadow(0 0 10px rgba(255,255,255,0.1))' }} alt="" />
            : <div style={{
                width:70, height:70, borderRadius:'50%', background:'#1a1a1a',
                border:`2px solid ${CG}`, display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'JetBrains Mono,monospace', fontWeight:800, fontSize:'1.4rem', color: CG, flexShrink:0
              }}>
                {(equipos?.local?.nombre || 'E').substring(0,2).toUpperCase()}
              </div>
          }
          <div>
            <div style={{ fontSize:'1.5rem', fontWeight:900, textTransform:'uppercase', letterSpacing:'-0.5px', lineHeight:1, color: CG }}>
              {equipos?.local?.nombre || 'MI EQUIPO'}
            </div>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.7rem', fontWeight:600, color:'#555', marginTop:3 }}>
              RESUMEN DE TEMPORADA
            </div>
          </div>
        </div>

        {/* marcador central */}
        <div style={{ textAlign:'center', padding:'0 20px', flexShrink:0 }}>
          <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.65rem', fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>
            GOLES TOTALES
          </div>
          <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'3.2rem', fontWeight:800, lineHeight:1, display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
            <span style={{ color: CG }}>{golesF}</span>
            <span style={{ color:'#222' }}>–</span>
            <span style={{ color: CR }}>{golesC}</span>
          </div>
          <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.75rem', fontWeight:700, color: xgDiffColor, marginTop:4 }}>
            Dif. xG: {xgDiff >= 0 ? '+' : ''}{fmt2(xgDiff)}
          </div>
        </div>

        {/* balance */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:20 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.6rem', fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>
              BALANCE
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'1.6rem', fontWeight:800, color: CG, lineHeight:1 }}>{vic}</div>
                <div style={{ fontSize:'0.6rem', fontWeight:800, color:'#444' }}>V</div>
              </div>
              <div style={{ color:'#222', fontSize:'1.2rem' }}>·</div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'1.6rem', fontWeight:800, color: CA, lineHeight:1 }}>{emp}</div>
                <div style={{ fontSize:'0.6rem', fontWeight:800, color:'#444' }}>E</div>
              </div>
              <div style={{ color:'#222', fontSize:'1.2rem' }}>·</div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'1.6rem', fontWeight:800, color: CR, lineHeight:1 }}>{der}</div>
                <div style={{ fontSize:'0.6rem', fontWeight:800, color:'#444' }}>D</div>
              </div>
            </div>
          </div>
          {/* mini donut V/E/D */}
          <div style={{ width:60, height:60, flexShrink:0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={balancePie} cx="50%" cy="50%" innerRadius={18} outerRadius={28} paddingAngle={2} dataKey="value" stroke="none">
                  {balancePie.map((_, i) => <Cell key={i} fill={PIE_COLORS_VED[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ══ KPI STRIP ════════════════════════════════════════════ */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(6, 1fr)',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
        background:'#101010',
      }}>
        {[
          { val: totalPJ,            label: 'Partidos', color:'#fff' },
          { val: `${pctVic}%`,       label: '% Victorias', color: CG },
          { val: fmt2(loc.xg),       label: 'xG Propio', color: CG },
          { val: fmt2(vis.xg),       label: 'xG Recibido', color: CR },
          { val: loc.remates || 0,   label: 'Remates Total', color:'#fff' },
          { val: loc.recuperaciones || 0, label: 'Recuperaciones', color: CB },
        ].map((k, i) => (
          <div key={i} style={{
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            padding:'8px 4px',
            borderRight: i < 5 ? '1px solid rgba(255,255,255,0.05)' : 'none'
          }}>
            <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'1.2rem', fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</span>
            <span style={{ fontSize:'0.57rem', fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:'0.5px', marginTop:3 }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* ══ BODY 3 COLS ══════════════════════════════════════════ */}
      <div style={{
        display:'grid', gridTemplateColumns:'270px 1px 1fr 1px 270px',
        overflow:'hidden', padding:'10px', gap:'10px'
      }}>

        {/* ── COL IZQUIERDA ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, overflow:'hidden' }}>

          {/* Métricas base */}
          <Card title="Métricas Acumuladas" titleColor={CG}>
            <StatBar label="xG Generado" vL={loc.xg || 0} vV={vis.xg || 0} isFloat />
            <StatBar label="Remates Totales" vL={loc.remates || 0} vV={vis.remates || 0} />
            <StatBar label="Tiros al Arco" vL={loc.rematesAlArco || 0} vV={vis.rematesAlArco || 0} />
            <StatBar label="Recuperaciones" vL={loc.recuperaciones || 0} vV={vis.recuperaciones || 0} />
            <StatBar label="Pérdidas Peligrosas" vL={loc.perdidas || 0} vV={vis.perdidas || 0} />
          </Card>

          {/* Desglose remates */}
          {desgloseData.length > 0 ? (
            <Card title="Desglose de Remates" style={{ flex: '0 0 auto' }}>
              <div style={{ height: 100 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={desgloseData} margin={{ top:0, right:0, left:-25, bottom:0 }} barSize={9}>
                    <XAxis dataKey="name" tick={{ fontSize:9, fill:'#555', fontFamily:'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:9, fill:'#555' }} axisLine={false} tickLine={false} />
                    <Bar dataKey="Propio" fill={CG} radius={[2,2,0,0]} />
                    <Bar dataKey="Rival"  fill={CR} radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.58rem', fontWeight:800, color:'#555' }}>
                  <div style={{ width:8, height:8, borderRadius:2, background: CG }} /> PROPIO
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.58rem', fontWeight:800, color:'#555' }}>
                  <div style={{ width:8, height:8, borderRadius:2, background: CR }} /> RIVAL
                </div>
              </div>
            </Card>
          ) : null}

          {/* Origen de Goles A Favor */}
          <Card title="Origen — Goles A Favor" titleColor={CG} style={{ flex: 1, minHeight:0 }}>
            {origenLocal.length > 0 ? (
              <div style={{ display:'flex', alignItems:'center', flex:1, minHeight:0 }}>
                <div style={{ flex:'0 0 80px', height:80 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={origenLocal} cx="50%" cy="50%" innerRadius={20} outerRadius={36} paddingAngle={3} dataKey="value" stroke="none">
                        {origenLocal.map((_, i) => <Cell key={i} fill={ORIGEN_COLORS[i % ORIGEN_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                  {origenLocal.map((g, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.6rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden' }}>
                        <div style={{ background: ORIGEN_COLORS[i % ORIGEN_COLORS.length], width:6, height:6, borderRadius:'50%', flexShrink:0 }} />
                        <span style={{ color:'#777', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.name}</span>
                      </div>
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontWeight:800, color: ORIGEN_COLORS[i % ORIGEN_COLORS.length], marginLeft:4 }}>{g.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span style={{ color:'#333', fontSize:'0.75rem' }}>Sin datos de goles</span>
            )}
          </Card>

        </div>

        {/* separador */}
        <div style={{ background:'rgba(255,255,255,0.05)', margin:'6px 0' }} />

        {/* ── COL CENTRAL ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, overflow:'hidden' }}>

          {/* Radar perfil de juego */}
          {radarData.length > 0 ? (
            <Card title="Perfil de Juego — Radar" style={{ flex:'0 0 auto' }}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top:10, right:30, left:30, bottom:10 }}>
                    <PolarGrid stroke="#1e1e1e" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill:'#666', fontSize:10, fontWeight:700, fontFamily:'JetBrains Mono,monospace' }} />
                    <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />
                    <Radar dataKey="A" stroke={CG} fill={CG} fillOpacity={0.18} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : (
            /* fallback: KPI grid visual si no hay radar */
            <Card title="Eficiencia del Equipo">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { val: `${pctVic}%`, label:'% Victorias', color: CG },
                  { val: fmt2(xgDiff >= 0 ? xgDiff : Math.abs(xgDiff)), label: xgDiff >= 0 ? 'Ventaja xG' : 'Déficit xG', color: xgDiffColor },
                  { val: loc.remates > 0 ? (golesF / loc.remates * 100).toFixed(1) + '%' : '—', label:'Eficacia Tiro', color: CA },
                  { val: loc.recuperaciones || 0, label:'Recuperaciones', color: CB },
                ].map((k, i) => (
                  <div key={i} style={{
                    background:'#0f0f0f', borderRadius:4, border:'1px solid rgba(255,255,255,0.06)',
                    padding:'12px 8px', textAlign:'center'
                  }}>
                    <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'1.6rem', fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
                    <div style={{ fontSize:'0.58rem', fontWeight:800, color:'#444', textTransform:'uppercase', marginTop:4 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Origen goles en contra */}
          <Card title="Origen — Goles En Contra" titleColor={CR} style={{ flex:'0 0 auto' }}>
            {origenRival.length > 0 ? (
              <div style={{ display:'flex', alignItems:'center' }}>
                <div style={{ flex:'0 0 80px', height:80 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={origenRival} cx="50%" cy="50%" innerRadius={20} outerRadius={36} paddingAngle={3} dataKey="value" stroke="none">
                        {origenRival.map((_, i) => <Cell key={i} fill={ORIGEN_COLORS[i % ORIGEN_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                  {origenRival.map((g, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.6rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5, overflow:'hidden' }}>
                        <div style={{ background: ORIGEN_COLORS[i % ORIGEN_COLORS.length], width:6, height:6, borderRadius:'50%', flexShrink:0 }} />
                        <span style={{ color:'#777', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.name}</span>
                      </div>
                      <span style={{ fontFamily:'JetBrains Mono,monospace', fontWeight:800, color: ORIGEN_COLORS[i % ORIGEN_COLORS.length], marginLeft:4 }}>{g.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span style={{ color:'#333', fontSize:'0.75rem' }}>Sin goles en contra</span>
            )}
          </Card>

          {/* Stats adicionales grid */}
          <Card title="Duelos & Transiciones" style={{ flex:1 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, flex:1 }}>
              {[
                {
                  val: data.statsAdicionales?.duelosOfeTotales > 0
                    ? `${((data.statsAdicionales.duelosOfeGanados / data.statsAdicionales.duelosOfeTotales)*100).toFixed(0)}%`
                    : '—',
                  label:'Duelos Ofe.', color: CG
                },
                {
                  val: data.statsAdicionales?.duelosDefTotales > 0
                    ? `${((data.statsAdicionales?.duelosDefGanados / data.statsAdicionales?.duelosDefTotales)*100).toFixed(0)}%`
                    : '—',
                  label:'Duelos Def.', color: CB
                },
                {
                  val: data.statsAdicionales?.recuperacionesAltas || 0,
                  label:'Rec. Altas', color: CA
                },
                {
                  val: data.statsAdicionales?.perdidasPeligrosas || 0,
                  label:'Pérd. Peligrosas', color: CR
                },
                {
                  val: data.abp?.corners?.favor || 0,
                  label:'Córners A Favor', color:'#a855f7'
                },
                {
                  val: data.abp?.corners?.contra || 0,
                  label:'Córners En Contra', color:'#555'
                },
              ].map((k, i) => (
                <div key={i} style={{
                  background:'#0f0f0f', borderRadius:4, border:'1px solid rgba(255,255,255,0.05)',
                  padding:'10px 6px', textAlign:'center'
                }}>
                  <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'1.3rem', fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
                  <div style={{ fontSize:'0.55rem', fontWeight:800, color:'#444', textTransform:'uppercase', marginTop:3, lineHeight:1.3 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </Card>

        </div>

        {/* separador */}
        <div style={{ background:'rgba(255,255,255,0.05)', margin:'6px 0' }} />

        {/* ── COL DERECHA ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, overflow:'hidden' }}>

          {/* Top goleadores */}
          <Card title="Top Goleadores" titleColor={CG} style={{ flex:1 }}>
            {topGoleadores.length === 0
              ? <span style={{ color:'#333', fontSize:'0.75rem' }}>Sin datos</span>
              : topGoleadores.map((j, i) => (
                  <RankRow
                    key={i} pos={i+1}
                    nombre={j.nombre}
                    val={`${j.rating || 0}G`}
                    color={CG}
                  />
                ))
            }
          </Card>

          {/* Top asistidores */}
          <Card title="Top Asistidores" titleColor={CA} style={{ flex:1 }}>
            {topAsistidores.length === 0
              ? <span style={{ color:'#333', fontSize:'0.75rem' }}>Sin datos</span>
              : topAsistidores.map((j, i) => (
                  <RankRow
                    key={i} pos={i+1}
                    nombre={j.nombre}
                    val={`${j.goles || 0}A`}
                    color={CA}
                  />
                ))
            }
          </Card>

          {/* Info categoría / torneo */}
          <Card title="Info. General" style={{ flex:'0 0 auto' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[
                { label:'COMPETICIÓN', val: info?.torneo || '—' },
                { label:'CATEGORÍA', val: info?.categoria || '—' },
                { label:'BALANCE', val: info?.balanceTemporada || '—' },
              ].map((row, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize:'0.6rem', fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:'0.5px' }}>{row.label}</span>
                  <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:'0.78rem', fontWeight:700, color:'#ccc', textAlign:'right', maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.val}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Partidos 1T vs 2T */}
          {data.desgasteData ? (
            <Card title="Goles por Período" style={{ flex:'0 0 auto' }}>
              <div style={{ height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.desgasteData} margin={{ top:0, right:0, left:-25, bottom:0 }} barSize={20}>
                    <XAxis dataKey="name" tick={{ fontSize:9, fill:'#555', fontFamily:'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:9, fill:'#555' }} axisLine={false} tickLine={false} />
                    <Bar dataKey="Anotados" fill={CG} radius={[2,2,0,0]} />
                    <Bar dataKey="Recibidos" fill={CR}  radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.58rem', fontWeight:800, color:'#555' }}>
                  <div style={{ width:8, height:8, borderRadius:2, background: CG }} /> ANOTADOS
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.58rem', fontWeight:800, color:'#555' }}>
                  <div style={{ width:8, height:8, borderRadius:2, background: CR }} /> RECIBIDOS
                </div>
              </div>
            </Card>
          ) : null}

        </div>

      </div>

      {/* ══ FOOTER ══════════════════════════════════════════════ */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'0 24px', background:'#080808',
        borderTop:'1px solid rgba(255,255,255,0.07)',
        fontFamily:'JetBrains Mono,monospace', fontSize:'0.62rem', fontWeight:600,
        color:'#333', textTransform:'uppercase'
      }}>
        <span>Reporte de Temporada · {info?.fecha || 'Temporada Actual'}</span>
        <span>
          <strong style={{ color:'#555' }}>VIRTUAL.CLUB © 2026</strong>
          {' '}— Propiedad de <span style={{ color:'#fd7d05' }}>VirtualFutsal</span>
        </span>
      </div>

    </div>
  );
};

export default SeasonReport;