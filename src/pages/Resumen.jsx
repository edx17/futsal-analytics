import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';

// IMPORTAMOS EL MOTOR ANALÍTICO EXTERNO
import { analizarPartido } from '../analytics/engine';
import { calcularRatingJugador } from '../analytics/rating';

function Resumen() {
  const [partidos, setPartidos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [partidoSeleccionado, setPartidoSeleccionado] = useState(null);
  const [eventosPartido, setEventosPartido] = useState([]);
  
  // Filtros interactivos
  const [filtroPeriodo, setFiltroPeriodo] = useState('Todos');
  const [tipoMapa, setTipoMapa] = useState('calor');
  const [filtroAccionMapa, setFiltroAccionMapa] = useState('Todas');
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);

  const heatmapRef = useRef(null);

  useEffect(() => {
    async function obtenerDatos() {
      const { data: p } = await supabase.from('partidos').select('*').order('id', { ascending: false });
      setPartidos(p || []);
      const { data: j } = await supabase.from('jugadores').select('*');
      setJugadores(j || []);
    }
    obtenerDatos();
  }, []);

  const cargarPartido = async (id) => {
    const partido = partidos.find(p => p.id == id);
    setPartidoSeleccionado(partido);
    setFiltroPeriodo('Todos');
    setEventoSeleccionado(null);
    const { data } = await supabase.from('eventos').select('*').eq('id_partido', id).order('minuto', { ascending: true });
    setEventosPartido(data || []);
  };

  const getNombreJugador = (id) => {
    if (!id) return 'SIN ASIGNAR / RIVAL';
    const j = jugadores.find(jug => jug.id == id);
    return j ? `${j.dorsal} - ${j.nombre.toUpperCase()}` : 'DESCONOCIDO';
  };

  const getColorAccion = (acc) => {
    const colores = {
      'Remate - Gol': '#00ff88', 'Remate - Atajado': '#3b82f6', 'Remate - Desviado': '#888888', 'Remate - Rebatido': '#a855f7',
      'Recuperación': '#eab308', 'Pérdida': '#ef4444', 
      'Duelo DEF Ganado': '#10b981', 'Duelo DEF Perdido': '#dc2626', 
      'Duelo OFE Ganado': '#0ea5e9', 'Duelo OFE Perdido': '#f97316',
      'Lateral': '#06b6d4', 'Córner': '#f97316', 'Falta cometida': '#ec4899', 'Tarjeta Amarilla': '#facc15', 'Tarjeta Roja': '#991b1b'
    };
    return colores[acc] || '#ffffff';
  };

  // 🚀 MOTOR ANALÍTICO INTEGRADO
  const analitica = useMemo(() => {
    if (!eventosPartido.length) return null;

    const evFiltrados = filtroPeriodo === 'Todos' 
      ? eventosPartido 
      : eventosPartido.filter(ev => ev.periodo === filtroPeriodo);

    const datosProcesados = analizarPartido(evFiltrados, 'Propio');

    const stats = { 
      propio: { goles: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, perdidas: 0, rec: 0, faltas: 0 }, 
      rival: { goles: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, faltas: 0 } 
    };

    evFiltrados.forEach(ev => {
      const p = ev.equipo === 'Propio';
      if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') { p ? stats.propio.goles++ : stats.rival.goles++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (ev.accion === 'Remate - Atajado') { p ? stats.propio.atajados++ : stats.rival.atajados++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (ev.accion === 'Remate - Desviado') { p ? stats.propio.desviados++ : stats.rival.desviados++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (ev.accion === 'Remate - Rebatido') { p ? stats.propio.rebatidos++ : stats.rival.rebatidos++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (p && ev.accion === 'Pérdida') { stats.propio.perdidas++; }
      else if (p && ev.accion === 'Recuperación') { stats.propio.rec++; }
      else if (ev.accion === 'Falta cometida') { p ? stats.propio.faltas++ : stats.rival.faltas++; }
    });

    const statsJugadores = {};
    jugadores.forEach(j => {
      statsJugadores[j.id] = { 
        id: j.id, nombre: j.nombre, dorsal: j.dorsal, eventos: [], 
        remates: 0, goles: 0, perdidas: 0, rec: 0,
        duelosDefGan: 0, duelosDefTot: 0, duelosOfeGan: 0, duelosOfeTot: 0
      };
    });

    evFiltrados.forEach(ev => {
      if (ev.equipo === 'Propio' && ev.id_jugador && statsJugadores[ev.id_jugador]) {
        statsJugadores[ev.id_jugador].eventos.push(ev);
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') statsJugadores[ev.id_jugador].goles++;
        if (ev.accion?.includes('Remate')) statsJugadores[ev.id_jugador].remates++;
        if (ev.accion === 'Pérdida') statsJugadores[ev.id_jugador].perdidas++;
        if (ev.accion === 'Recuperación') statsJugadores[ev.id_jugador].rec++;
        
        // CÁLCULO DE DUELOS INDIVIDUALES
        if (ev.accion === 'Duelo DEF Ganado') { statsJugadores[ev.id_jugador].duelosDefGan++; statsJugadores[ev.id_jugador].duelosDefTot++; }
        if (ev.accion === 'Duelo DEF Perdido') { statsJugadores[ev.id_jugador].duelosDefTot++; }
        if (ev.accion === 'Duelo OFE Ganado') { statsJugadores[ev.id_jugador].duelosOfeGan++; statsJugadores[ev.id_jugador].duelosOfeTot++; }
        if (ev.accion === 'Duelo OFE Perdido') { statsJugadores[ev.id_jugador].duelosOfeTot++; }
      }
    });

    const ranking = Object.values(statsJugadores)
      .filter(j => j.eventos.length > 0)
      .map(j => ({ ...j, impacto: calcularRatingJugador(j.eventos) }))
      .sort((a, b) => b.impacto - a.impacto);

    const eficaciaTiro = stats.propio.remates > 0 ? ((stats.propio.goles / stats.propio.remates) * 100).toFixed(0) : 0;
    const totalPosesion = stats.propio.rec + stats.propio.perdidas;
    const balancePosesion = totalPosesion > 0 ? ((stats.propio.rec / totalPosesion) * 100).toFixed(0) : 0;

    return { 
      evFiltrados, stats, ranking, eficaciaTiro, balancePosesion,
      xg: datosProcesados.xg, insights: datosProcesados.insights, 
      posesiones: datosProcesados.posesiones, transiciones: datosProcesados.transiciones,
      duelos: datosProcesados.duelos // <-- IMPORTAMOS DUELOS DEL ENGINE
    };
  }, [eventosPartido, filtroPeriodo, jugadores]);

  const evMapa = analitica?.evFiltrados.filter(ev => filtroAccionMapa === 'Todas' ? true : ev.accion?.includes(filtroAccionMapa)) || [];

  useEffect(() => {
    if (tipoMapa !== 'calor') return;
    if (!heatmapRef.current) return;

    const canvas = heatmapRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!evMapa.length) return;

    const dataPoints = evMapa
      .filter(ev => ev.zona_x != null && ev.zona_y != null)
      .map(ev => [
        (ev.zona_x / 100) * canvas.width,
        (ev.zona_y / 100) * canvas.height,
        1 
      ]);

    const heat = simpleheat(canvas);
    heat.data(dataPoints);
    heat.radius(45, 30); 
    heat.gradient({ 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' });
    heat.max(4); 
    heat.draw();

  }, [evMapa, tipoMapa]);

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      {/* CABECERA Y FILTROS GENERALES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="stat-label">PARTIDO</div>
            <select onChange={(e) => cargarPartido(e.target.value)} style={{ marginTop: '5px', width: '250px' }}>
              <option value="">-- SELECCIONAR --</option>
              {partidos.map(p => <option key={p.id} value={p.id}>{p.rival.toUpperCase()} // {p.fecha}</option>)}
            </select>
          </div>
          
          {partidoSeleccionado && (
            <div>
              <div className="stat-label">PERIODO DE TIEMPO</div>
              <select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)} style={{ marginTop: '5px', width: '180px', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                <option value="Todos">PARTIDO COMPLETO</option>
                <option value="PT">PRIMER TIEMPO (PT)</option>
                <option value="ST">SEGUNDO TIEMPO (ST)</option>
              </select>
            </div>
          )}
        </div>
        {partidoSeleccionado && <button onClick={() => window.print()} className="btn-action">EXPORTAR PDF</button>}
      </div>

      {partidoSeleccionado && analitica && (
        <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 1. SCORE Y CONTEXTO */}
          <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', textAlign: 'center' }}>
            <div>
              {partidoSeleccionado.escudo_propio && <img src={partidoSeleccionado.escudo_propio} alt="club" style={escudoStyle} />}
              <div className="stat-label">{partidoSeleccionado.nombre_propio || 'MI EQUIPO'}</div>
            </div>
            <div style={{ padding: '0 40px' }}>
              <div style={{ fontSize: '3.5rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: '#fff' }}>{analitica.stats.propio.goles} - {analitica.stats.rival.goles}</div>
              <div className="stat-label" style={{ color: 'var(--accent)' }}>{filtroPeriodo === 'Todos' ? 'RESULTADO FINAL' : `RESULTADO ${filtroPeriodo}`}</div>
            </div>
            <div>
              {partidoSeleccionado.escudo_rival && <img src={partidoSeleccionado.escudo_rival} alt="rival" style={escudoStyle} />}
              <div className="stat-label">{partidoSeleccionado.rival.toUpperCase()}</div>
            </div>
          </div>

          {/* 2. PRODUCCIÓN OFENSIVA Y EFICACIA */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">EXPECTATIVA DE GOL (xG)</div>
                <div className="stat-value" style={{ color: '#fff' }}>{analitica.xg.toFixed(2)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Calidad de oportunidades creadas</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">EFICACIA DE TIRO</div>
                <div className="stat-value" style={{ color: analitica.eficaciaTiro > 15 ? 'var(--accent)' : 'var(--text)' }}>{analitica.eficaciaTiro}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Goles / Remates Totales</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">TRANSICIONES RÁPIDAS</div>
                <div className="stat-value" style={{ color: analitica.transiciones.length > 3 ? 'var(--accent)' : 'var(--text-dim)' }}>{analitica.transiciones.length}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Recuperaciones seguidas de Remate</div>
             </div>
          </div>

          {/* 3. ANÁLISIS TÁCTICO: OFENSIVA VS DEFENSIVA + DUELOS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>PRODUCCIÓN OFENSIVA</div>
              <div style={kpiFila}><span>REMATES TOTALES</span><strong>{analitica.stats.propio.remates}</strong></div>
              <div style={kpiFila}><span>RECUPERACIONES</span><strong style={{color: 'var(--accent)'}}>{analitica.stats.propio.rec}</strong></div>
              <div style={kpiFila}><span>POSESIONES (M. Analytics)</span><strong style={{color: 'var(--text)'}}>{analitica.posesiones.length}</strong></div>
            </div>
            
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: '#ef4444' }}>RIESGO Y DISCIPLINA</div>
              <div style={kpiFila}><span>PERDIDAS DE BALÓN</span><strong style={{color: '#ef4444'}}>{analitica.stats.propio.perdidas}</strong></div>
              <div style={kpiFila}><span>BALANCE (Rec - Pérdidas)</span><strong style={{color: analitica.balancePosesion > 50 ? 'var(--accent)' : '#ef4444'}}>{analitica.balancePosesion}%</strong></div>
              <div style={kpiFila}><span>FALTAS COMETIDAS</span><strong>{analitica.stats.propio.faltas}</strong></div>
            </div>

            {/* NUEVO BLOQUE DE MICRO-CONFLICTOS */}
            <div className="bento-card" style={{ borderTop: '3px solid #0ea5e9' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#0ea5e9' }}>⚔️ FRICCIÓN Y DUELOS</div>
              <div style={kpiFila}>
                <span>DUELOS DEF. GANADOS</span>
                <strong style={{color: analitica.duelos.defensivos.eficacia > 50 ? 'var(--accent)' : '#ef4444'}}>
                  {analitica.duelos.defensivos.ganados}/{analitica.duelos.defensivos.total} ({analitica.duelos.defensivos.eficacia.toFixed(0)}%)
                </strong>
              </div>
              <div style={kpiFila}>
                <span>DUELOS OFE. GANADOS</span>
                <strong style={{color: analitica.duelos.ofensivos.eficacia > 50 ? '#0ea5e9' : '#ef4444'}}>
                  {analitica.duelos.ofensivos.ganados}/{analitica.duelos.ofensivos.total} ({analitica.duelos.ofensivos.eficacia.toFixed(0)}%)
                </strong>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '10px', lineHeight: 1.4 }}>
                Unidades mínimas de conflicto. Un % defensivo bajo indica debilidad estructural en el 1v1.
              </div>
            </div>
          </div>

          {/* 4. ANÁLISIS ESPACIAL */}
          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div className="stat-label">ANÁLISIS ESPACIAL (MAPA DE CALOR / PUNTOS)</div>
              
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} style={{ padding: '5px', fontSize: '0.8rem', width: 'auto' }}>
                  <option value="Todas">TODAS LAS ACCIONES</option>
                  <option value="Remate">SOLO REMATES</option>
                  <option value="Recuperación">SOLO RECUPERACIONES</option>
                  <option value="Pérdida">SOLO PÉRDIDAS</option>
                  <option value="Duelo">SOLO DUELOS (FRICCIÓN)</option> {/* <-- NUEVO FILTRO */}
                </select>

                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>PUNTOS</button>
                  <button onClick={() => setTipoMapa('calor')} style={{ ...btnTab, background: tipoMapa === 'calor' ? '#333' : 'transparent', color: tipoMapa === 'calor' ? 'var(--accent)' : 'var(--text-dim)' }}>HEATMAP PRO</button>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="pitch-container" style={{ width: '100%', maxWidth: '800px', aspectRatio: '2/1', overflow: 'hidden', position: 'relative' }}>
                
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
                    onMouseEnter={() => setEventoSeleccionado(ev)}
                    onMouseLeave={() => setEventoSeleccionado(null)}
                    title={`${ev.minuto}' - ${ev.accion} (${getNombreJugador(ev.id_jugador)})`}
                    style={{ 
                      position: 'absolute', left: `${ev.zona_x}%`, top: `${ev.zona_y}%`, width: '12px', height: '12px', 
                      backgroundColor: getColorAccion(ev.accion), border: ev.equipo === 'Rival' ? '1px solid #fff' : '1px solid #000', 
                      borderRadius: '2px', transform: 'translate(-50%, -50%)', opacity: 0.9, cursor: 'pointer', zIndex: 2
                    }} 
                  />
                ))}

                {eventoSeleccionado && tipoMapa === 'puntos' && (
                  <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', background: '#111', border: `1px solid ${getColorAccion(eventoSeleccionado.accion)}`, padding: '10px 20px', borderRadius: '6px', zIndex: 10, textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.8)', minWidth: '200px', pointerEvents: 'none' }}>
                    <div style={{ color: getColorAccion(eventoSeleccionado.accion), fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>{eventoSeleccionado.accion}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, margin: '5px 0', color: '#fff' }}>{getNombreJugador(eventoSeleccionado.id_jugador)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. TOP PERFORMERS (CON DUELOS) */}
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px' }}>RENDIMIENTO INDIVIDUAL (TOP PERFORMERS)</div>
            <div className="table-wrapper" style={{ maxHeight: '300px' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1 }}>
                  <tr>
                    <th>#</th>
                    <th style={{ textAlign: 'left' }}>JUGADOR</th>
                    <th>RATING</th>
                    <th>REMATES (G)</th>
                    <th style={{ color: '#10b981' }}>DUELOS DEF %</th>
                    <th style={{ color: '#0ea5e9' }}>DUELOS OFE %</th>
                    <th>REC</th>
                    <th>PERD</th>
                  </tr>
                </thead>
                <tbody>
                  {analitica.ranking.map(j => {
                    const defRatio = j.duelosDefTot > 0 ? ((j.duelosDefGan / j.duelosDefTot) * 100).toFixed(0) : '-';
                    const ofeRatio = j.duelosOfeTot > 0 ? ((j.duelosOfeGan / j.duelosOfeTot) * 100).toFixed(0) : '-';
                    return (
                      <tr key={j.id} style={{ textAlign: 'center' }}>
                        <td className="mono-accent">{j.dorsal}</td>
                        <td style={{ textAlign: 'left', fontWeight: 700 }}>{j.nombre.toUpperCase()}</td>
                        <td>
                          <div style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: j.impacto > 0 ? 'rgba(0,255,136,0.1)' : j.impacto < 0 ? 'rgba(239,68,68,0.1)' : 'transparent', color: j.impacto > 0 ? 'var(--accent)' : j.impacto < 0 ? '#ef4444' : '#fff', fontWeight: 700 }}>
                            {j.impacto > 0 ? '+' : ''}{j.impacto.toFixed(1)}
                          </div>
                        </td>
                        <td>{j.remates} <span style={{ color: 'var(--accent)' }}>({j.goles})</span></td>
                        <td style={{ fontWeight: 800, color: defRatio > 50 ? '#10b981' : (defRatio !== '-' ? '#ef4444' : '#555') }}>{defRatio}{defRatio !== '-' && '%'}</td>
                        <td style={{ fontWeight: 800, color: ofeRatio > 50 ? '#0ea5e9' : (ofeRatio !== '-' ? '#ef4444' : '#555') }}>{ofeRatio}{ofeRatio !== '-' && '%'}</td>
                        <td style={{ color: 'var(--accent)' }}>{j.rec}</td>
                        <td style={{ color: '#ef4444' }}>{j.perdidas}</td>
                      </tr>
                    )
                  })}
                  {analitica.ranking.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>No hay registros en este periodo.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

const escudoStyle = { height: '60px', marginBottom: '10px', filter: 'grayscale(1) brightness(2)' };
const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontFamily: 'JetBrains Mono', fontSize: '0.9rem' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default Resumen;