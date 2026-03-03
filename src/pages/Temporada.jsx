import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';

// IMPORTAMOS EL MOTOR ANALÍTICO EXTERNO
import { calcularRatingJugador } from '../analytics/rating';
import { calcularXGPartido } from '../analytics/xg';

function Temporada() {
  const [partidos, setPartidos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [eventos, setEventos] = useState([]);
  
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroCompeticion, setFiltroCompeticion] = useState('Todas'); 
  const [filtroAccionMapa, setFiltroAccionMapa] = useState(''); 

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

  // 🧠 MOTOR ANALÍTICO GLOBAL DE TEMPORADA
  const analiticaGlobal = useMemo(() => {
    if (!partidos || partidos.length === 0) return null;

    const listaEventos = eventos || [];

    const partidosFiltrados = partidos.filter(p => {
      const pasaCategoria = filtroCategoria === 'Todas' || (p.categoria && p.categoria === filtroCategoria);
      const pasaCompeticion = filtroCompeticion === 'Todas' || (p.competicion && p.competicion === filtroCompeticion);
      return pasaCategoria && pasaCompeticion;
    });

    const idsPartidos = partidosFiltrados.map(p => p.id);
    const evFiltrados = listaEventos.filter(ev => idsPartidos.includes(ev.id_partido));

    const statsEquipo = {
      partidosJugados: partidosFiltrados.length,
      golesFavor: 0, golesContra: 0, asistenciasTotales: 0,
      victorias: 0, empates: 0, derrotas: 0,
      xgTotal: calcularXGPartido(evFiltrados.filter(e => e.equipo === 'Propio')),
      remates: 0, recuperaciones: 0, perdidas: 0,
      duelosDefGanados: 0, duelosDefTotales: 0
    };

    const historialPartidos = partidosFiltrados.map(p => {
      const evPartido = evFiltrados.filter(e => e.id_partido === p.id);
      const golesPropio = evPartido.filter(e => (e.accion === 'Remate - Gol' || e.accion === 'Gol') && e.equipo === 'Propio').length;
      const golesRival = evPartido.filter(e => (e.accion === 'Remate - Gol' || e.accion === 'Gol') && e.equipo === 'Rival').length;
      const xg = calcularXGPartido(evPartido.filter(e => e.equipo === 'Propio'));
      
      let resultado = 'E';
      if (golesPropio > golesRival) { resultado = 'V'; statsEquipo.victorias++; }
      else if (golesPropio < golesRival) { resultado = 'D'; statsEquipo.derrotas++; }
      else { statsEquipo.empates++; }

      statsEquipo.golesFavor += golesPropio;
      statsEquipo.golesContra += golesRival;

      return { ...p, rival: p.rival || 'Desconocido', fecha: p.fecha || 'Sin fecha', golesPropio, golesRival, resultado, xg };
    });

    evFiltrados.forEach(ev => {
      const p = ev.equipo === 'Propio';
      if (p && ev.accion?.includes('Remate')) statsEquipo.remates++;
      if (p && ev.accion === 'Recuperación') statsEquipo.recuperaciones++;
      if (p && ev.accion === 'Pérdida') statsEquipo.perdidas++;
      if (p && ev.accion === 'Duelo DEF Ganado') { statsEquipo.duelosDefGanados++; statsEquipo.duelosDefTotales++; }
      if (p && ev.accion === 'Duelo DEF Perdido') { statsEquipo.duelosDefTotales++; }
      
      // Contabiliza la asistencia a nivel equipo
      if (p && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') && ev.id_asistencia) {
        statsEquipo.asistenciasTotales++;
      }
    });

    const statsJugadores = {};
    jugadores.forEach(j => {
      statsJugadores[j.id] = { ...j, eventos: [], goles: 0, asistencias: 0, rec: 0, perdidas: 0, duelosDefGan: 0, duelosDefTot: 0 };
    });

    evFiltrados.forEach(ev => {
      if (ev.equipo === 'Propio') {
        // Acciones del ejecutor
        if (ev.id_jugador && statsJugadores[ev.id_jugador]) {
          statsJugadores[ev.id_jugador].eventos.push(ev);
          if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') statsJugadores[ev.id_jugador].goles++;
          if (ev.accion === 'Recuperación') statsJugadores[ev.id_jugador].rec++;
          if (ev.accion === 'Pérdida') statsJugadores[ev.id_jugador].perdidas++;
          if (ev.accion === 'Duelo DEF Ganado') { statsJugadores[ev.id_jugador].duelosDefGan++; statsJugadores[ev.id_jugador].duelosDefTot++; }
          if (ev.accion === 'Duelo DEF Perdido') { statsJugadores[ev.id_jugador].duelosDefTot++; }
        }

        // Asistencias del jugador
        if (ev.id_asistencia && statsJugadores[ev.id_asistencia]) {
          if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') {
            statsJugadores[ev.id_asistencia].asistencias++;
            // Le agregamos el evento al array de eventos del asistente para que no quede como 'inactivo' si solo tiene asistencias
            statsJugadores[ev.id_asistencia].eventos.push({ ...ev, tipoVirtual: 'Asistencia' }); 
          }
        }
      }
    });

    const jugadoresActivos = Object.values(statsJugadores).filter(j => j.eventos.length > 0);
    jugadoresActivos.forEach(j => {
      j.impactoGlobal = calcularRatingJugador(j.eventos.filter(e => !e.tipoVirtual)); // Pasamos solo los eventos reales al rating
      j.eficaciaDefensiva = j.duelosDefTot > 0 ? (j.duelosDefGan / j.duelosDefTot) * 100 : 0;
    });

    const topGoleadores = [...jugadoresActivos].sort((a, b) => b.goles - a.goles).slice(0, 5);
    const topAsistidores = [...jugadoresActivos].sort((a, b) => b.asistencias - a.asistencias).slice(0, 5); // TOP ASISTENCIAS
    const topMVP = [...jugadoresActivos].sort((a, b) => b.impactoGlobal - a.impactoGlobal).slice(0, 5);
    const topMuros = [...jugadoresActivos]
      .filter(j => j.duelosDefTot >= 5)
      .sort((a, b) => b.eficaciaDefensiva - a.eficaciaDefensiva).slice(0, 5);

    return { statsEquipo, historialPartidos, topGoleadores, topAsistidores, topMVP, topMuros, evFiltrados };
  }, [partidos, eventos, jugadores, filtroCategoria, filtroCompeticion]); 

  const evMapa = analiticaGlobal?.evFiltrados.filter(ev => ev.equipo === 'Propio' && (!filtroAccionMapa || ev.accion?.includes(filtroAccionMapa))) || [];

  useEffect(() => {
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
  }, [evMapa]);

  const categoriasUnicas = [...new Set(partidos.map(p => p.categoria))].filter(Boolean);
  const competicionesUnicas = [...new Set(partidos.map(p => p.competicion))].filter(Boolean); 

  if (!partidos || partidos.length === 0) return <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>AÚN NO HAY PARTIDOS CREADOS.</div>;
  if (!analiticaGlobal) return <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>CARGANDO ANALÍTICA GLOBAL...</div>;

  const eficaciaGlobalDefensiva = analiticaGlobal.statsEquipo.duelosDefTotales > 0 
    ? ((analiticaGlobal.statsEquipo.duelosDefGanados / analiticaGlobal.statsEquipo.duelosDefTotales) * 100).toFixed(1) 
    : 0;

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="stat-label">DASHBOARD DE TEMPORADA</div>
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
        
        {/* ROW 1: KPIs GLOBALES */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px', background: 'linear-gradient(180deg, #111 0%, #000 100%)', borderTop: '2px solid var(--accent)' }}>
                <div className="stat-label">PARTIDOS JUGADOS</div>
                <div className="stat-value" style={{ color: '#fff' }}>{analiticaGlobal.statsEquipo.partidosJugados}</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">EXPECTATIVA DE GOL (xG)</div>
                <div className="stat-value" style={{ color: '#fff' }}>{analiticaGlobal.statsEquipo.xgTotal.toFixed(1)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Peligro generado acumulado</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">TOTAL ASISTENCIAS</div>
                <div className="stat-value" style={{ color: '#00ff88' }}>{analiticaGlobal.statsEquipo.asistenciasTotales}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Pases de gol del equipo</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">EFICACIA DEFENSIVA (DUELOS)</div>
                <div className="stat-value" style={{ color: eficaciaGlobalDefensiva > 50 ? '#10b981' : '#ef4444' }}>{eficaciaGlobalDefensiva}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Basado en {analiticaGlobal.statsEquipo.duelosDefTotales} micro-conflictos</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">RECORD (V-E-D)</div>
                <div className="stat-value" style={{ color: 'var(--text)' }}>
                  <span style={{color: 'var(--accent)'}}>{analiticaGlobal.statsEquipo.victorias}</span>-
                  <span style={{color: '#888'}}>{analiticaGlobal.statsEquipo.empates}</span>-
                  <span style={{color: '#ef4444'}}>{analiticaGlobal.statsEquipo.derrotas}</span>
                </div>
            </div>
        </div>

        {/* ROW 2: LEADERBOARDS (TOP 5) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>🔥 TOP GOLEADORES</div>
            {analiticaGlobal.topGoleadores.map((j, i) => (
              <div key={j.id} style={rankingRow}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <strong style={{ fontSize: '1.2rem', color: '#fff' }}>{j.goles}</strong>
              </div>
            ))}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#00ff88' }}>🎯 TOP ASISTIDORES</div>
            {analiticaGlobal.topAsistidores.map((j, i) => (
              <div key={j.id} style={rankingRow}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <strong style={{ fontSize: '1.2rem', color: '#00ff88' }}>{j.asistencias}</strong>
              </div>
            ))}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#10b981' }}>🛡️ TOP MUROS DEF. (DUELOS)</div>
            {analiticaGlobal.topMuros.map((j, i) => (
              <div key={j.id} style={rankingRow}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{j.eficaciaDefensiva.toFixed(0)}%</strong>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{j.duelosDefGan}/{j.duelosDefTot} Gan.</div>
                </div>
              </div>
            ))}
            {analiticaGlobal.topMuros.length === 0 && <div style={{color:'var(--text-dim)', fontSize:'0.8rem', marginTop:'10px'}}>No hay jugadores con mínimo 5 duelos.</div>}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#00aaff' }}>⭐ TOP IMPACTO (RATING)</div>
            {analiticaGlobal.topMVP.map((j, i) => (
              <div key={j.id} style={rankingRow}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <strong style={{ fontSize: '1.2rem', color: j.impactoGlobal > 0 ? 'var(--accent)' : '#ef4444' }}>{j.impactoGlobal > 0 ? '+' : ''}{j.impactoGlobal.toFixed(1)}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* ROW 3: HISTORIAL DE FORMA Y MAPA GLOBAL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          <div className="bento-card">
             <div className="stat-label" style={{ marginBottom: '20px' }}>HISTORIAL DE RESULTADOS (FORMA)</div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div className="stat-label">HUELLA ESPACIAL HISTÓRICA</div>
              <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} style={{ padding: '5px', fontSize: '0.8rem', width: 'auto', background: 'transparent', border: '1px solid var(--border)' }}>
                  <option value="">MAPA DE CALOR TOTAL</option>
                  <option value="Remate">ZONAS DE REMATE</option>
                  <option value="Recuperación">ZONAS DE RECUPERACIÓN</option>
                  <option value="Duelo">ZONAS DE FRICCIÓN (DUELOS)</option>
                </select>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100% - 90px)' }}>
              <div className="pitch-container" style={{ width: '100%', maxWidth: '100%', aspectRatio: '2/1', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid var(--border)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none', zIndex: 0 }}></div>
                <canvas ref={heatmapRef} width={800} height={400} style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', opacity: 0.85 }} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const rankingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #222' };

export default Temporada;