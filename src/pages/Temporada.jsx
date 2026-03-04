import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Legend, ScatterChart, Scatter, ZAxis, Label
} from 'recharts';

import { analizarTemporadaGlobal } from '../analytics/seasonEngine';

// --- COMPONENTE TOOLTIP UX ---
const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'help', verticalAlign: 'middle', outline: 'none' }}>
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter' }}>!</div>
    <div className="tooltip-text" style={{ position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', width: '220px', textAlign: 'center', border: '1px solid #333', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', fontFamily: 'Inter', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', lineHeight: '1.4' }}>
      {texto}
    </div>
  </div>
);

function Temporada() {
  const [partidos, setPartidos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [eventos, setEventos] = useState([]);
  
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroCompeticion, setFiltroCompeticion] = useState('Todas'); 
  const [filtroAccionMapa, setFiltroAccionMapa] = useState(''); 
  const [tipoMapa, setTipoMapa] = useState('calor'); 

  const heatmapRef = useRef(null);

  useEffect(() => {
    async function obtenerDatosGlobales() {
      const { data: p } = await supabase.from('partidos').select('*').order('fecha', { ascending: false });
      const { data: j } = await supabase.from('jugadores').select('*');
      const { data: e } = await supabase.from('eventos').select('*');
      
      setPartidos(p || []);
      setJugadores(j || []);
      setEventos(e || []);
    }
    obtenerDatosGlobales();
  }, []);

  const analiticaGlobal = useMemo(() => {
    return analizarTemporadaGlobal(partidos, eventos, jugadores, {
      categoria: filtroCategoria,
      competicion: filtroCompeticion
    });
  }, [partidos, eventos, jugadores, filtroCategoria, filtroCompeticion]);

  const evMapa = analiticaGlobal?.evFiltrados.filter(ev => ev.equipo === 'Propio' && (!filtroAccionMapa || ev.accion?.includes(filtroAccionMapa))) || [];

  useEffect(() => {
    if (tipoMapa !== 'calor') return;
    if (!heatmapRef.current) return;
    
    const canvas = heatmapRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!evMapa.length) return;

    const dataPoints = evMapa
      .filter(ev => ev.zona_x != null && ev.zona_y != null)
      .map(ev => [ (ev.zona_x / 100) * canvas.width, (ev.zona_y / 100) * canvas.height, 1 ]);

    const heat = simpleheat(canvas);
    heat.data(dataPoints);
    heat.radius(45, 30);
    heat.gradient({ 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' });
    const dynamicMax = Math.max(5, Math.floor(dataPoints.length / 15));
    heat.max(dynamicMax);
    heat.draw();
  }, [evMapa, tipoMapa]);

  // --- DATOS GRÁFICOS ---
  const dataLineas = useMemo(() => {
    if (!analiticaGlobal) return [];
    return [...analiticaGlobal.historialPartidos].reverse().map(p => ({
      name: p.rival.substring(0, 10),
      xG: Number(p.xg.toFixed(2)),
      Goles: p.golesPropio
    }));
  }, [analiticaGlobal]);

  const dataRadar = useMemo(() => {
    if (!analiticaGlobal || analiticaGlobal.statsEquipo.partidosJugados === 0) return [];
    const stats = analiticaGlobal.statsEquipo;
    const pj = stats.partidosJugados;

    const ofensiva = Math.min(100, (stats.xgTotal / pj) * 25); 
    const solidez = 100 - Math.min(100, (stats.xgRival / pj) * 25); 
    const presion = Math.min(100, (stats.recuperacionesAltas / pj) * 20); 
    const friccion = stats.duelosDefTotales > 0 ? (stats.duelosDefGanados / stats.duelosDefTotales) * 100 : 0;
    const construccion = Math.min(100, (stats.asistenciasTotales / pj) * 30); 

    return [
      { subject: 'Ataque (xG)', A: ofensiva },
      { subject: 'Presión Alta', A: presion },
      { subject: 'Fricción (Duelos)', A: friccion },
      { subject: 'Construcción', A: construccion },
      { subject: 'Solidez Def.', A: solidez }
    ];
  }, [analiticaGlobal]);

  const dataDesgaste = useMemo(() => {
    if (!analiticaGlobal) return [];
    const s = analiticaGlobal.statsEquipo;
    return [
      { name: 'PRIMER TIEMPO', Anotados: s.golesFavorPT, Recibidos: s.golesContraPT },
      { name: 'SEGUNDO TIEMPO', Anotados: s.golesFavorST, Recibidos: s.golesContraST },
    ];
  }, [analiticaGlobal]);

  const getColorAccion = (acc) => {
    if (acc?.includes('Remate')) return '#00aaff';
    if (acc === 'Recuperación') return '#eab308';
    if (acc?.includes('Pérdida')) return '#ef4444';
    if (acc?.includes('Duelo')) return '#10b981';
    return '#ffffff';
  };

  if (!partidos || partidos.length === 0) return <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>AÚN NO HAY PARTIDOS CREADOS.</div>;
  if (!analiticaGlobal) return <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>CARGANDO RESUMEN DE TEMPORADA...</div>;

  const stats = analiticaGlobal.statsEquipo;
  const eficaciaGlobalDefensiva = stats.duelosDefTotales > 0 ? ((stats.duelosDefGanados / stats.duelosDefTotales) * 100).toFixed(1) : 0;
  const eficaciaTiro = stats.remates > 0 ? ((stats.golesFavor / stats.remates) * 100).toFixed(1) : 0;
  const xgDiff = (stats.xgTotal - stats.xgRival).toFixed(2);
  const categoriasUnicas = [...new Set(partidos.map(p => p.categoria))].filter(Boolean);
  const competicionesUnicas = [...new Set(partidos.map(p => p.competicion))].filter(Boolean); 

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      {/* MAGIA UX: TOOLTIPS CSS */}
      <style>{`
        .tooltip-text { visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; }
        .tooltip-container:hover .tooltip-text, .tooltip-container:focus .tooltip-text { visibility: visible; opacity: 1; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="stat-label">RESUMEN DE TEMPORADA</div>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ marginTop: '5px', width: '200px', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
              <option value="Todas">TODAS LAS CATEGORÍAS</option>
              {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <div className="stat-label">COMPETICIÓN</div>
            <select value={filtroCompeticion} onChange={(e) => setFiltroCompeticion(e.target.value)} style={{ marginTop: '5px', width: '200px', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
              <option value="Todas">TODAS LAS COMPETENCIAS</option>
              {competicionesUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <button onClick={() => window.print()} className="btn-action">EXPORTAR REPORTE</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* ROW 1: KPIs ESTRATÉGICOS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px', background: 'linear-gradient(180deg, #111 0%, #000 100%)', borderTop: '2px solid var(--accent)' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>PARTIDOS (V-E-D) <InfoBox texto="Victorias, Empates y Derrotas en la temporada actual." /></div>
                <div className="stat-value" style={{ color: 'var(--text)' }}>
                  <span style={{color: 'var(--accent)'}}>{stats.victorias}</span>-
                  <span style={{color: '#888'}}>{stats.empates}</span>-
                  <span style={{color: '#ef4444'}}>{stats.derrotas}</span>
                </div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>xG DIF (Dominio) <InfoBox texto="Diferencia neta de goles esperados (+ a favor, - en contra). Refleja el dominio táctico real más allá de los goles marcados." /></div>
                <div className="stat-value" style={{ color: xgDiff > 0 ? 'var(--accent)' : '#ef4444' }}>{xgDiff > 0 ? '+' : ''}{xgDiff}</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>EFICACIA EN REMATES <InfoBox texto="Porcentaje general de remates que terminaron en gol." /></div>
                <div className="stat-value" style={{ color: eficaciaTiro >= 15 ? 'var(--accent)' : '#fff' }}>{eficaciaTiro}%</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>BALANCE DE PRESIÓN <InfoBox texto="Recuperaciones Altas (en ataque) versus Pérdidas Peligrosas (en defensa). Mide qué tanto rinde asumir riesgos." /></div>
                <div className="stat-value" style={{ color: stats.recuperacionesAltas >= stats.perdidasPeligrosas ? '#00aaff' : '#ef4444' }}>
                  {stats.recuperacionesAltas} / {stats.perdidasPeligrosas}
                </div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>DUELOS DEFENSIVOS <InfoBox texto="Eficacia general del equipo al disputar la pelota 1v1." /></div>
                <div className="stat-value" style={{ color: eficaciaGlobalDefensiva > 50 ? '#10b981' : '#ef4444' }}>{eficaciaGlobalDefensiva}%</div>
            </div>
        </div>

        {/* ROW 1.5: GRÁFICOS ANALÍTICOS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>CREACIÓN VS FINALIZACIÓN <InfoBox texto="Gráfico de dispersión. Creadores de juego a la derecha, finalizadores arriba. Jugadores en la esquina superior derecha dominan ambas facetas." /></div>
            <ResponsiveContainer width="100%" height={250}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis type="number" dataKey="creacion" name="Creación" stroke="#555" tick={{ fill: '#888', fontSize: 11 }}>
                  <Label value="Armadores ➔" offset={-10} position="insideBottomRight" fill="#888" fontSize={10} />
                </XAxis>
                <YAxis type="number" dataKey="finalizacion" name="Finalización" stroke="#555" tick={{ fill: '#888', fontSize: 11 }}>
                  <Label value="Pívots ➔" offset={10} position="insideTopLeft" angle={-90} fill="#888" fontSize={10} />
                </YAxis>
                <ZAxis type="number" dataKey="impacto" range={[40, 400]} name="Impacto" />
                <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                <Scatter name="Jugadores" data={analiticaGlobal.matrizTalento} fill="var(--accent)" fillOpacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>GOLES PT VS ST <InfoBox texto="Compara desgaste físico y táctico. Si recibís muchos más goles en el ST, puede haber un déficit de resistencia aeróbica en el plantel." /></div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dataDesgaste} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 11, fontWeight: 700 }} />
                <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#888' }} />
                <Bar dataKey="Anotados" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={40} />
                <Bar dataKey="Recibidos" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '10px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>ADN DEL EQUIPO <InfoBox texto="Perfil táctico general del equipo normalizado de 0 a 100. Ayuda a entender cuál es tu modelo de juego predominante real." /></div>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={dataRadar}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Equipo" dataKey="A" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ROW 2: LEADERBOARDS (TOP 5) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>TOP GOLEADORES <InfoBox texto="Máximos anotadores del equipo." /></div>
            {analiticaGlobal.topGoleadores.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <strong style={{ fontSize: '1.2rem', color: '#fff', zIndex: 1 }}>{j.goles}</strong>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: 'var(--accent)', opacity: 0.1, width: `${(j.goles / Math.max(1, analiticaGlobal.topGoleadores[0]?.goles)) * 100}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#00ff88', display: 'flex', alignItems: 'center' }}>TOP ASISTIDORES <InfoBox texto="Máximos repartidores de asistencias que terminaron en gol." /></div>
            {analiticaGlobal.topAsistidores.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <strong style={{ fontSize: '1.2rem', color: '#00ff88', zIndex: 1 }}>{j.asistencias}</strong>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: '#00ff88', opacity: 0.1, width: `${(j.asistencias / Math.max(1, analiticaGlobal.topAsistidores[0]?.asistencias)) * 100}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#c084fc', display: 'flex', alignItems: 'center' }}>TOP CREADORES (xG) <InfoBox texto="xG Buildup: Valor que aportan los jugadores en la construcción de jugadas que terminan en tiro (excluyendo el tiro final y la asistencia)." /></div>
            {analiticaGlobal.topCreadores.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <div style={{ textAlign: 'right', zIndex: 1 }}>
                  <strong style={{ fontSize: '1.2rem', color: '#c084fc' }}>{j.xgBuildup.toFixed(1)}</strong>
                </div>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: '#c084fc', opacity: 0.1, width: `${(j.xgBuildup / Math.max(0.1, analiticaGlobal.topCreadores[0]?.xgBuildup)) * 100}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#10b981', display: 'flex', alignItems: 'center' }}>TOP DUELOS <InfoBox texto="Jugadores con el mejor porcentaje de éxito al disputar la pelota (mínimo 5 duelos totales en la temporada)." /></div>
            {analiticaGlobal.topMuros.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <div style={{ textAlign: 'right', zIndex: 1 }}>
                  <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{j.eficaciaDefensiva.toFixed(0)}%</strong>
                </div>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: '#10b981', opacity: 0.1, width: `${j.eficaciaDefensiva}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>

        </div>

        {/* --- NUEVA ROW: EL QUINTETO DE ORO --- */}
        <div className="bento-card" style={{ marginBottom: '10px' }}>
          <div className="stat-label" style={{ marginBottom: '20px', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>MEJORES QUINTETOS <InfoBox texto="Rendimiento del equipo (Plus/Minus) al jugar con estas combinaciones específicas de 5 jugadores." /></div>
          <div className="table-wrapper">
            <table style={{ width: '100%', textAlign: 'center', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>QUINTETOS</th>
                  <th style={{ color: '#00ff88' }}>GF</th>
                  <th style={{ color: '#ef4444' }}>GC</th>
                  <th>BALANCE</th>
                </tr>
              </thead>
              <tbody>
                {analiticaGlobal.topQuintetos && analiticaGlobal.topQuintetos.map((q, idx) => {
                  const diff = q.golesFavor - q.golesContra;
                  const nombresQuinteto = q.ids.map(id => {
                    const jug = jugadores.find(j => j.id === id);
                    if (!jug) return '?';
                    return jug.apellido ? jug.apellido.toUpperCase() : jug.nombre.toUpperCase();
                  }).join(' - ');

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ textAlign: 'left', padding: '12px 10px', fontWeight: 800, fontFamily: 'JetBrains Mono', color: '#fff', fontSize: '0.8rem' }}>
                        [{nombresQuinteto}]
                      </td>
                      <td style={{ color: '#00ff88', fontWeight: 700 }}>{q.golesFavor}</td>
                      <td style={{ color: '#ef4444', fontWeight: 700 }}>{q.golesContra}</td>
                      <td>
                        <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '4px', background: diff > 0 ? 'rgba(0,255,136,0.1)' : diff < 0 ? 'rgba(239,68,68,0.1)' : 'transparent', color: diff > 0 ? 'var(--accent)' : diff < 0 ? '#ef4444' : '#fff', fontWeight: 800 }}>
                          {diff > 0 ? '+' : ''}{diff}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {(!analiticaGlobal.topQuintetos || analiticaGlobal.topQuintetos.length === 0) && (
                  <tr><td colSpan="4" style={{ padding: '20px', color: 'var(--text-dim)' }}>No hay suficientes datos de rotaciones.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ROW 3: HISTORIAL Y MAPA ESPACIAL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          <div className="bento-card">
             <div className="stat-label" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>HISTORIAL DE PARTIDOS <InfoBox texto="Registro de los últimos encuentros filtrados, mostrando resultado real y Expectativa de Gol (xG)." /></div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '5px' }}>
                {analiticaGlobal.historialPartidos.map(p => {
                  let badgeColor = '#888'; let text = 'E';
                  if (p.resultado === 'V') { badgeColor = 'var(--accent)'; text = 'V'; }
                  if (p.resultado === 'D') { badgeColor = '#ef4444'; text = 'D'; }

                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', padding: '12px', border: '1px solid var(--border)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: badgeColor, color: '#000', fontWeight: 800, width: '25px', height: '25px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '0.8rem' }}>{text}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>vs {p.rival.toUpperCase()}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }}>{p.fecha} // xG: {p.xg.toFixed(2)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'JetBrains Mono' }}>{p.golesPropio} - {p.golesRival}</div>
                    </div>
                  )
                })}
             </div>
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center' }}>MAPEO ACUMULADO <InfoBox texto="Visualización espacial de todas las acciones ofensivas del equipo a lo largo de la temporada. Útil para detectar zonas preferenciales de ataque." /></div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} disabled={tipoMapa === 'transiciones'} style={{ padding: '5px', fontSize: '0.8rem', width: 'auto', background: 'transparent', border: '1px solid var(--border)', opacity: tipoMapa === 'transiciones' ? 0.3 : 1 }}>
                  <option value="">TODAS LAS ACCIONES</option>
                  <option value="Remate">SOLO REMATES</option>
                  <option value="Recuperación">SOLO RECUPERACIONES</option>
                  <option value="Duelo">SOLO DUELOS</option>
                </select>

                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>PUNTOS</button>
                  <button onClick={() => setTipoMapa('calor')} style={{ ...btnTab, background: tipoMapa === 'calor' ? '#333' : 'transparent', color: tipoMapa === 'calor' ? 'var(--accent)' : 'var(--text-dim)' }}>CALOR</button>
                  <button onClick={() => setTipoMapa('transiciones')} style={{ ...btnTab, background: tipoMapa === 'transiciones' ? 'var(--accent)' : 'transparent', color: tipoMapa === 'transiciones' ? '#000' : 'var(--text-dim)' }}>TRANSICIONES</button>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100% - 90px)' }}>
              <div className="pitch-container" style={{ width: '100%', maxWidth: '100%', aspectRatio: '2/1', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid var(--border)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none', zIndex: 0 }}></div>
                
                {tipoMapa === 'calor' && (
                  <canvas ref={heatmapRef} width={800} height={400} style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', opacity: 0.85 }} />
                )}

                {tipoMapa === 'puntos' && evMapa.map(ev => ev.zona_x != null && (
                  <div 
                    key={ev.id} 
                    title={`${ev.accion}`}
                    style={{ 
                      position: 'absolute', left: `${ev.zona_x}%`, top: `${ev.zona_y}%`, width: '10px', height: '10px', 
                      backgroundColor: getColorAccion(ev.accion), 
                      border: '1px solid #000', borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.8, zIndex: 2
                    }} 
                  />
                ))}

                {tipoMapa === 'transiciones' && (
                  <svg style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }}>
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" />
                      </marker>
                    </defs>
                    {analiticaGlobal.transicionesLetales && analiticaGlobal.transicionesLetales.map((t, i) => {
                      if (!t.recuperacion || !t.remate || t.recuperacion.zona_x == null || t.remate.zona_x == null) return null;
                      return (
                        <g key={i}>
                          <circle cx={`${t.recuperacion.zona_x}%`} cy={`${t.recuperacion.zona_y}%`} r="4" fill="var(--accent)" />
                          <line 
                            x1={`${t.recuperacion.zona_x}%`} y1={`${t.recuperacion.zona_y}%`} 
                            x2={`${t.remate.zona_x}%`} y2={`${t.remate.zona_y}%`} 
                            stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="5 5"
                            markerEnd="url(#arrowhead)" opacity="0.85"
                          />
                          <circle cx={`${t.remate.zona_x}%`} cy={`${t.remate.zona_y}%`} r="5" fill="#fff" stroke="#000" strokeWidth="2" />
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const rankingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px', borderBottom: '1px solid #222' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default Temporada;