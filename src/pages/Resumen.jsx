import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';

// IMPORTACIONES DEL MOTOR ANALÍTICO
import { analizarPartido } from '../analytics/engine';
import { calcularRatingJugador } from '../analytics/rating';
import { calcularCadenasValor } from '../analytics/posesiones';

// --- COMPONENTE TOOLTIP UX ---
const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'help', verticalAlign: 'middle', outline: 'none' }}>
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter' }}>!</div>
    <div className="tooltip-text" style={{ position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', width: '220px', textAlign: 'center', border: '1px solid #333', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', fontFamily: 'Inter', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', lineHeight: '1.4' }}>
      {texto}
    </div>
  </div>
);

function Resumen() {
  const [partidos, setPartidos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [partidoSeleccionado, setPartidoSeleccionado] = useState(null);
  const [eventosPartido, setEventosPartido] = useState([]);
  
  const [filtroPeriodo, setFiltroPeriodo] = useState('Todos');
  const [tipoMapa, setTipoMapa] = useState('calor');
  const [filtroAccionMapa, setFiltroAccionMapa] = useState('Todas');
  const [filtroEquipoMapa, setFiltroEquipoMapa] = useState('Propio');
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);

  const [filtroCategoriaGrid, setFiltroCategoriaGrid] = useState('Todas');

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

  const cerrarPartido = () => {
    setPartidoSeleccionado(null);
    setEventosPartido([]);
  };

  const getNombreJugador = (id) => {
    if (!id) return 'SIN ASIGNAR / RIVAL';
    const j = jugadores.find(jug => jug.id == id);
    return j ? `${j.dorsal} - ${j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}` : 'DESCONOCIDO';
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

  const categoriasUnicas = useMemo(() => {
    const cats = partidos.map(p => p.categoria).filter(Boolean);
    return [...new Set(cats)];
  }, [partidos]);

  const partidosGrid = useMemo(() => {
    if (filtroCategoriaGrid === 'Todas') return partidos;
    return partidos.filter(p => p.categoria === filtroCategoriaGrid);
  }, [partidos, filtroCategoriaGrid]);

  const analitica = useMemo(() => {
    if (!eventosPartido.length) return null;

    const evFiltrados = filtroPeriodo === 'Todos' 
      ? eventosPartido 
      : eventosPartido.filter(ev => ev.periodo === filtroPeriodo);

    const datosProcesados = analizarPartido(evFiltrados, 'Propio');

    const stats = { 
      propio: { goles: 0, asistencias: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, perdidas: 0, rec: 0, faltas: 0 }, 
      rival: { goles: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, faltas: 0 } 
    };

    // --- NUEVAS MÉTRICAS ABP ---
    const abp = {
      corners: { favor: 0, contra: 0 },
      laterales: { favor: 0, contra: 0 },
      zonasLatFavor: { z1: 0, z2: 0, z3: 0, z4: 0 }
    };

    evFiltrados.forEach(ev => {
      const p = ev.equipo === 'Propio';
      if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') { 
        p ? stats.propio.goles++ : stats.rival.goles++; 
        p ? stats.propio.remates++ : stats.rival.remates++; 
        if (p && ev.id_asistencia) stats.propio.asistencias++;
      }
      else if (ev.accion === 'Remate - Atajado') { p ? stats.propio.atajados++ : stats.rival.atajados++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (ev.accion === 'Remate - Desviado') { p ? stats.propio.desviados++ : stats.rival.desviados++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (ev.accion === 'Remate - Rebatido') { p ? stats.propio.rebatidos++ : stats.rival.rebatidos++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (p && ev.accion === 'Pérdida') { stats.propio.perdidas++; }
      else if (p && ev.accion === 'Recuperación') { stats.propio.rec++; }
      else if (ev.accion === 'Falta cometida') { p ? stats.propio.faltas++ : stats.rival.faltas++; }

      // CONTEO ABP
      if (ev.accion === 'Córner') {
        p ? abp.corners.favor++ : abp.corners.contra++;
      }
      if (ev.accion === 'Lateral') {
        if (p) {
          abp.laterales.favor++;
          if (ev.zona_x < 25) abp.zonasLatFavor.z1++;
          else if (ev.zona_x < 50) abp.zonasLatFavor.z2++;
          else if (ev.zona_x < 75) abp.zonasLatFavor.z3++;
          else abp.zonasLatFavor.z4++;
        } else {
          abp.laterales.contra++;
        }
      }
    });

    const statsJugadores = {};
    jugadores.forEach(j => {
      const { xgChain, xgBuildup } = calcularCadenasValor(datosProcesados.posesiones, j.id);
      
      statsJugadores[j.id] = { 
        id: j.id, nombre: j.apellido || j.nombre, dorsal: j.dorsal, eventos: [], 
        remates: 0, goles: 0, asistencias: 0, perdidas: 0, rec: 0, faltas: 0,
        duelosDefGan: 0, duelosDefTot: 0, duelosOfeGan: 0, duelosOfeTot: 0,
        xgChain, xgBuildup
      };
    });

    evFiltrados.forEach(ev => {
      if (ev.equipo === 'Propio') {
        if (ev.id_jugador && statsJugadores[ev.id_jugador]) {
          statsJugadores[ev.id_jugador].eventos.push(ev);
          if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') statsJugadores[ev.id_jugador].goles++;
          if (ev.accion?.includes('Remate')) statsJugadores[ev.id_jugador].remates++;
          if (ev.accion === 'Pérdida') statsJugadores[ev.id_jugador].perdidas++;
          if (ev.accion === 'Recuperación') statsJugadores[ev.id_jugador].rec++;
          if (ev.accion === 'Falta cometida') statsJugadores[ev.id_jugador].faltas++;
          
          if (ev.accion === 'Duelo DEF Ganado') { statsJugadores[ev.id_jugador].duelosDefGan++; statsJugadores[ev.id_jugador].duelosDefTot++; }
          if (ev.accion === 'Duelo DEF Perdido') { statsJugadores[ev.id_jugador].duelosDefTot++; }
          if (ev.accion === 'Duelo OFE Ganado') { statsJugadores[ev.id_jugador].duelosOfeGan++; statsJugadores[ev.id_jugador].duelosOfeTot++; }
          if (ev.accion === 'Duelo OFE Perdido') { statsJugadores[ev.id_jugador].duelosOfeTot++; }
        }

        if (ev.id_asistencia && statsJugadores[ev.id_asistencia]) {
          if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') {
            statsJugadores[ev.id_asistencia].asistencias++;
          }
        }
      }
    });

    const ranking = Object.values(statsJugadores)
      .filter(j => j.eventos.length > 0 || j.xgChain > 0 || (datosProcesados.plusMinusJugador && datosProcesados.plusMinusJugador[j.id]))
      .map(j => {
        const pm = datosProcesados.plusMinusJugador ? (datosProcesados.plusMinusJugador[j.id] || 0) : 0;
        const mins = datosProcesados.minutosJugados ? (datosProcesados.minutosJugados[j.id] || 0) : 0;
        return { 
          ...j, 
          plusMinus: pm,
          minutos: mins,
          impacto: calcularRatingJugador(j, j.eventos, pm)
        }
      })
      .sort((a, b) => b.impacto - a.impacto);

    const eficaciaTiro = stats.propio.remates > 0 ? ((stats.propio.goles / stats.propio.remates) * 100).toFixed(0) : 0;
    const totalPosesion = stats.propio.rec + stats.propio.perdidas;
    const balancePosesion = totalPosesion > 0 ? ((stats.propio.rec / totalPosesion) * 100).toFixed(0) : 0;

    return { 
      evFiltrados, stats, abp, ranking, eficaciaTiro, balancePosesion,
      xgPropio: datosProcesados.xgPropio, xgRival: datosProcesados.xgRival, 
      insights: datosProcesados.insights, 
      posesiones: datosProcesados.posesiones, transiciones: datosProcesados.transiciones,
      duelos: datosProcesados.duelos,
      quintetos: datosProcesados.quintetos,
      plusMinusJugador: datosProcesados.plusMinusJugador
    };
  }, [eventosPartido, filtroPeriodo, jugadores]);

  const evMapa = analitica?.evFiltrados.filter(ev => {
    const pasaAccion = filtroAccionMapa === 'Todas' ? true : ev.accion?.includes(filtroAccionMapa);
    const pasaEquipo = filtroEquipoMapa === 'Ambos' ? true : ev.equipo === filtroEquipoMapa;
    return pasaAccion && pasaEquipo;
  }) || [];

  const transicionesMapa = analitica?.transiciones.filter(t => 
    filtroEquipoMapa === 'Ambos' ? true : t.recuperacion.equipo === filtroEquipoMapa
  ) || [];

  useEffect(() => {
    if (tipoMapa !== 'calor' || !heatmapRef.current) return;

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
    heat.max(4); 
    heat.draw();

  }, [evMapa, tipoMapa]);


  // --- VISTA 1: GRILLA DE PARTIDOS (MATCH CENTER) ---
  if (!partidoSeleccionado) {
    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>MATCH CENTER</div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>Seleccioná un partido para acceder al reporte analítico.</div>
          </div>
          
          <div>
            <div className="stat-label">FILTRAR POR CATEGORÍA</div>
            <select value={filtroCategoriaGrid} onChange={(e) => setFiltroCategoriaGrid(e.target.value)} style={{ marginTop: '5px', width: '200px' }}>
              <option value="Todas">TODAS LAS CATEGORÍAS</option>
              {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {partidosGrid.map(p => (
            <div 
              key={p.id} 
              className="bento-card match-card" 
              onClick={() => cargarPartido(p.id)}
              style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', padding: '20px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono' }}>{p.fecha}</span>
                <span style={{ background: '#222', color: 'var(--accent)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>
                  {p.categoria || 'S/C'} | {p.competicion || 'Amistoso'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '40%' }}>
                  {p.escudo_propio ? (
                    <img src={p.escudo_propio} alt="Local" style={{ height: '50px', objectFit: 'contain', filter: 'grayscale(1) brightness(2)' }} />
                  ) : (
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: '1.2rem' }}>MI</div>
                  )}
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{p.nombre_propio || 'MI EQUIPO'}</span>
                </div>

                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#333', fontStyle: 'italic', width: '20%', textAlign: 'center' }}>VS</div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '40%' }}>
                  {p.escudo_rival ? (
                    <img src={p.escudo_rival} alt="Rival" style={{ height: '50px', objectFit: 'contain', filter: 'grayscale(1) brightness(2)' }} />
                  ) : (
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>{p.rival.substring(0, 2).toUpperCase()}</div>
                  )}
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{p.rival.toUpperCase()}</span>
                </div>
                
              </div>
            </div>
          ))}
          {partidosGrid.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
              No hay partidos registrados en esta categoría.
            </div>
          )}
        </div>
        
        <style>{`
          .match-card:hover { transform: translateY(-5px); border-color: var(--accent); }
        `}</style>
      </div>
    );
  }

  // --- VISTA 2: DASHBOARD DEL PARTIDO ---
  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <style>{`
        .tooltip-text { visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; }
        .tooltip-container:hover .tooltip-text, .tooltip-container:focus .tooltip-text { visibility: visible; opacity: 1; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <button 
            onClick={cerrarPartido} 
            style={{ padding: '8px 15px', background: 'transparent', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            ⬅ VOLVER A MATCH CENTER
          </button>
          
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
        {partidoSeleccionado && <button onClick={() => window.print()} className="btn-action">EXPORTAR REPORTE</button>}
      </div>

      {partidoSeleccionado && analitica && (
        <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', textAlign: 'center' }}>
            <div>
              {partidoSeleccionado.escudo_propio ? <img src={partidoSeleccionado.escudo_propio} alt="club" style={escudoStyle} /> : <div style={escudoFallback}>MI</div>}
              <div className="stat-label">{partidoSeleccionado.nombre_propio || 'MI EQUIPO'}</div>
            </div>
            <div style={{ padding: '0 40px' }}>
              <div style={{ fontSize: '3.5rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: '#fff' }}>{analitica.stats.propio.goles} - {analitica.stats.rival.goles}</div>
              <div className="stat-label" style={{ color: 'var(--accent)' }}>{filtroPeriodo === 'Todos' ? 'RESULTADO FINAL' : `RESULTADO ${filtroPeriodo}`}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '5px' }}>{partidoSeleccionado.categoria} | {partidoSeleccionado.fecha}</div>
            </div>
            <div>
              {partidoSeleccionado.escudo_rival ? <img src={partidoSeleccionado.escudo_rival} alt="rival" style={escudoStyle} /> : <div style={{...escudoFallback, borderColor: '#555', color: '#fff'}}>{partidoSeleccionado.rival.substring(0,2).toUpperCase()}</div>}
              <div className="stat-label">{partidoSeleccionado.rival.toUpperCase()}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">EXPECTATIVA DE GOL (xG) <InfoBox texto="Cantidad de goles que el equipo mereció hacer según la calidad geométrica (distancia y ángulo) de sus tiros." /></div>
                <div className="stat-value" style={{ color: 'var(--accent)' }}>
                  {analitica.xgPropio.toFixed(2)} <span style={{ fontSize: '1rem', color: '#ef4444' }}>| {analitica.xgRival.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Propio | Rival</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">EFICACIA DE REMATE <InfoBox texto="Porcentaje de tiros propios que terminan en gol. Compara esto con el xG para evaluar si hubo falta de definición o mala suerte." /></div>
                <div className="stat-value" style={{ color: analitica.eficaciaTiro > 15 ? 'var(--accent)' : 'var(--text)' }}>{analitica.eficaciaTiro}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Goles / Remates Propios</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">TRANSICIONES RÁPIDAS <InfoBox texto="Ataques estructurados en pocos segundos luego de robar el balón en campo rival o medio campo." /></div>
                <div className="stat-value" style={{ color: analitica.transiciones.length > 3 ? 'var(--accent)' : 'var(--text-dim)' }}>{analitica.transiciones.length}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Ataques directos post-robo</div>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px' }}>
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>PRODUCCIÓN OFENSIVA</div>
              <div style={kpiFila}><span>REMATES TOTALES</span><strong>{analitica.stats.propio.remates}</strong></div>
              <div style={kpiFila}><span>ASISTENCIAS TOTALES</span><strong style={{color: '#00ff88'}}>{analitica.stats.propio.asistencias}</strong></div>
              <div style={kpiFila}><span>RECUPERACIONES</span><strong style={{color: 'var(--accent)'}}>{analitica.stats.propio.rec}</strong></div>
              <div style={kpiFila}>
                <span style={{ display: 'flex', alignItems: 'center' }}>POSESIONES LOGRADAS <InfoBox texto="Cantidad de secuencias donde el equipo logró mantener el control continuo del balón." /></span>
                <strong style={{color: 'var(--text)'}}>{analitica.posesiones.length}</strong>
              </div>
            </div>
            
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: '#ef4444' }}>RIESGO Y DISCIPLINA</div>
              <div style={kpiFila}><span>PERDIDAS DE BALÓN</span><strong style={{color: '#ef4444'}}>{analitica.stats.propio.perdidas}</strong></div>
              <div style={kpiFila}>
                <span style={{ display: 'flex', alignItems: 'center' }}>RECUPERACIONES / PERDIDAS <InfoBox texto="Porcentaje de acciones de disputa que terminan a favor. Mide el dominio general de la tenencia." /></span>
                <strong style={{color: analitica.balancePosesion > 50 ? 'var(--accent)' : '#ef4444'}}>{analitica.balancePosesion}%</strong>
              </div>
              <div style={kpiFila}><span>FALTAS COMETIDAS</span><strong>{analitica.stats.propio.faltas}</strong></div>
            </div>

            <div className="bento-card" style={{ borderTop: '3px solid #0ea5e9' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#0ea5e9', display: 'flex', alignItems: 'center' }}>
                DUELOS <InfoBox texto="El futsal se basa en el 1v1. Perder más del 50% de los duelos defensivos suele desarmar la estructura táctica del equipo." />
              </div>
              <div style={kpiFila}>
                <span>DEFENSIVOS GANADOS</span>
                <strong style={{color: analitica.duelos.defensivos.eficacia > 50 ? 'var(--accent)' : '#ef4444'}}>
                  {analitica.duelos.defensivos.ganados}/{analitica.duelos.defensivos.total} ({analitica.duelos.defensivos.eficacia.toFixed(0)}%)
                </strong>
              </div>
              <div style={kpiFila}>
                <span>OFENSIVOS GANADOS</span>
                <strong style={{color: analitica.duelos.ofensivos.eficacia > 50 ? '#0ea5e9' : '#ef4444'}}>
                  {analitica.duelos.ofensivos.ganados}/{analitica.duelos.ofensivos.total} ({analitica.duelos.ofensivos.eficacia.toFixed(0)}%)
                </strong>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '10px', lineHeight: 1.4 }}>
                Un % defensivo bajo indica debilidad estructural en el 1v1.
              </div>
            </div>

            <div className="bento-card" style={{ borderTop: '3px solid #f97316' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#f97316', display: 'flex', alignItems: 'center' }}>
                PELOTA PARADA (ABP) <InfoBox texto="Resumen de acciones de reanudación. Las zonas de los laterales propios van de la Z1 (Defensa) a la Z4 (Ataque)." />
              </div>
              <div style={kpiFila}>
                <span>CÓRNERS (Fav / Contra)</span>
                <strong><span style={{color:'#f97316'}}>{analitica.abp.corners.favor}</span> - <span style={{color:'#ef4444'}}>{analitica.abp.corners.contra}</span></strong>
              </div>
              <div style={kpiFila}>
                <span>LATERALES (Fav / Contra)</span>
                <strong><span style={{color:'#06b6d4'}}>{analitica.abp.laterales.favor}</span> - <span style={{color:'#ef4444'}}>{analitica.abp.laterales.contra}</span></strong>
              </div>
              
              <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px dashed #333' }}>
                <div className="stat-label" style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '8px' }}>MIS LATERALES POR ZONAS</div>
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between' }}>
                   <div style={zonePill}>Z1 (0-10) <br/><strong style={{color:'#fff', fontSize:'1rem'}}>{analitica.abp.zonasLatFavor.z1}</strong></div>
                   <div style={zonePill}>Z2 (10-20)<br/><strong style={{color:'#fff', fontSize:'1rem'}}>{analitica.abp.zonasLatFavor.z2}</strong></div>
                   <div style={zonePill}>Z3 (20-30)<br/><strong style={{color:'#fff', fontSize:'1rem'}}>{analitica.abp.zonasLatFavor.z3}</strong></div>
                   <div style={zonePill}>Z4 (30-40)<br/><strong style={{color:'#00ff88', fontSize:'1rem'}}>{analitica.abp.zonasLatFavor.z4}</strong></div>
                </div>
              </div>
            </div>

          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center' }}>
                MAPEO TÁCTICO <InfoBox texto="Puntos: Ver lugar exacto de la acción. Heatmap: Ver zonas de mayor concentración. Transiciones: Rutas desde el robo al remate." />
              </div>
              
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <button onClick={() => setFiltroEquipoMapa('Propio')} style={{ ...btnTab, background: filtroEquipoMapa === 'Propio' ? '#333' : 'transparent', color: filtroEquipoMapa === 'Propio' ? 'var(--accent)' : 'var(--text-dim)' }}>MI EQUIPO</button>
                  <button onClick={() => setFiltroEquipoMapa('Rival')} style={{ ...btnTab, background: filtroEquipoMapa === 'Rival' ? '#333' : 'transparent', color: filtroEquipoMapa === 'Rival' ? '#fff' : 'var(--text-dim)' }}>RIVAL</button>
                  <button onClick={() => setFiltroEquipoMapa('Ambos')} style={{ ...btnTab, background: filtroEquipoMapa === 'Ambos' ? '#333' : 'transparent', color: filtroEquipoMapa === 'Ambos' ? '#aaa' : 'var(--text-dim)' }}>AMBOS</button>
                </div>

                <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} style={{ padding: '5px', fontSize: '0.8rem', width: 'auto' }}>
                  <option value="Todas">TODAS LAS ACCIONES</option>
                  <option value="Remate">SOLO REMATES</option>
                  <option value="Recuperación">SOLO RECUPERACIONES</option>
                  <option value="Pérdida">SOLO PÉRDIDAS</option>
                  <option value="Duelo">SOLO DUELOS</option>
                </select>

                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>PUNTOS</button>
                  <button onClick={() => setTipoMapa('calor')} style={{ ...btnTab, background: tipoMapa === 'calor' ? '#333' : 'transparent', color: tipoMapa === 'calor' ? 'var(--accent)' : 'var(--text-dim)' }}>HEATMAP</button>
                  <button onClick={() => setTipoMapa('transiciones')} style={{ ...btnTab, background: tipoMapa === 'transiciones' ? 'var(--accent)' : 'transparent', color: tipoMapa === 'transiciones' ? '#000' : 'var(--text-dim)' }}>TRANSICIONES</button>
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

                {tipoMapa === 'transiciones' && (
                  <svg style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }}>
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" />
                      </marker>
                      <marker id="arrowhead-rival" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                      </marker>
                    </defs>
                    {transicionesMapa.map((t, i) => {
                      if (!t.recuperacion || !t.remate || t.recuperacion.zona_x == null || t.remate.zona_x == null) return null;
                      const esPropio = t.recuperacion.equipo === 'Propio';
                      const colorFlecha = esPropio ? 'var(--accent)' : '#ef4444';
                      const arrowMarker = esPropio ? 'url(#arrowhead)' : 'url(#arrowhead-rival)';
                      return (
                        <g key={i}>
                          <circle cx={`${t.recuperacion.zona_x}%`} cy={`${t.recuperacion.zona_y}%`} r="4" fill={colorFlecha} />
                          <line 
                            x1={`${t.recuperacion.zona_x}%`} y1={`${t.recuperacion.zona_y}%`} 
                            x2={`${t.remate.zona_x}%`} y2={`${t.remate.zona_y}%`} 
                            stroke={colorFlecha} strokeWidth="2" strokeDasharray="4 4"
                            markerEnd={arrowMarker} opacity="0.8"
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}

                {eventoSeleccionado && tipoMapa === 'puntos' && (
                  <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', background: '#111', border: `1px solid ${getColorAccion(eventoSeleccionado.accion)}`, padding: '10px 20px', borderRadius: '6px', zIndex: 10, textAlign: 'center', boxShadow: '0 5px 15px rgba(0,0,0,0.8)', minWidth: '200px', pointerEvents: 'none' }}>
                    <div style={{ color: getColorAccion(eventoSeleccionado.accion), fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>{eventoSeleccionado.accion}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, margin: '5px 0', color: '#fff' }}>{getNombreJugador(eventoSeleccionado.id_jugador)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px' }}>RENDIMIENTO INDIVIDUAL</div>
            <div className="table-wrapper" style={{ maxHeight: '300px' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1 }}>
                  <tr>
                    <th>#</th>
                    <th style={{ textAlign: 'left' }}>JUGADOR</th>
                    <th>MIN <InfoBox texto="Minutos reales jugados calculados según el cronómetro de cambios." /></th>
                    <th>RATING <InfoBox texto="Puntaje de impacto del jugador (-10 a +10) en la cancha." /></th>
                    <th>+/- <InfoBox texto="Goles a favor menos goles en contra mientras el jugador estuvo jugando." /></th>
                    <th>REMATES (G)</th>
                    <th style={{ color: '#00ff88' }}>ASISTENCIAS</th>
                    <th style={{ color: '#c084fc' }}>xG BUILDUP <InfoBox texto="Valor ofensivo aportado al participar en pases previos al remate final." /></th>
                    <th style={{ color: '#10b981' }}>DUELOS DEF %</th>
                    <th style={{ color: '#0ea5e9' }}>DUELOS OFE %</th>
                    <th>REC</th>
                    <th style={{ color: '#ef4444' }}>FALTAS</th>
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
                        <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{j.minutos}'</td>
                        <td>
                          <div style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: j.impacto > 0 ? 'rgba(0,255,136,0.1)' : j.impacto < 0 ? 'rgba(239,68,68,0.1)' : 'transparent', color: j.impacto > 0 ? 'var(--accent)' : j.impacto < 0 ? '#ef4444' : '#fff', fontWeight: 700 }}>
                            {j.impacto > 0 ? '+' : ''}{j.impacto.toFixed(1)}
                          </div>
                        </td>
                        <td style={{ fontWeight: 800, color: j.plusMinus > 0 ? 'var(--accent)' : j.plusMinus < 0 ? '#ef4444' : 'var(--text-dim)' }}>
                          {j.plusMinus > 0 ? '+' : ''}{j.plusMinus}
                        </td>
                        <td>{j.remates} <span style={{ color: 'var(--accent)' }}>({j.goles})</span></td>
                        <td style={{ fontWeight: 800, color: j.asistencias > 0 ? '#00ff88' : 'var(--text-dim)' }}>{j.asistencias}</td>
                        <td style={{ fontWeight: 800, color: j.xgBuildup > 0 ? '#c084fc' : 'var(--text-dim)' }}>{j.xgBuildup.toFixed(2)}</td>
                        <td style={{ fontWeight: 800, color: defRatio > 50 ? '#10b981' : (defRatio !== '-' ? '#ef4444' : '#555') }}>{defRatio}{defRatio !== '-' && '%'}</td>
                        <td style={{ fontWeight: 800, color: ofeRatio > 50 ? '#0ea5e9' : (ofeRatio !== '-' ? '#ef4444' : '#555') }}>{ofeRatio}{ofeRatio !== '-' && '%'}</td>
                        <td style={{ color: 'var(--accent)' }}>{j.rec}</td>
                        <td style={{ color: j.faltas > 2 ? '#ef4444' : 'var(--text-dim)' }}>{j.faltas}</td>
                      </tr>
                    )
                  })}
                  {analitica.ranking.length === 0 && <tr><td colSpan="12" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>No hay registros en este periodo.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
              RENDIMIENTO POR QUINTETOS <InfoBox texto="Evalúa cómo le fue al equipo mientras esos 5 jugadores específicos compartieron la cancha." />
            </div>
            <div className="table-wrapper" style={{ maxHeight: '300px' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1 }}>
                  <tr>
                    <th style={{ textAlign: 'left' }}>QUINTETO</th>
                    <th style={{ color: '#00ff88' }}>GF</th>
                    <th style={{ color: '#ef4444' }}>GC</th>
                    <th>BALANCE</th>
                    <th>DUELOS (Gan/Perd)</th>
                  </tr>
                </thead>
                <tbody>
                  {analitica.quintetos.sort((a, b) => (b.golesFavor - b.golesContra) - (a.golesFavor - a.golesContra)).map((q, idx) => {
                    const diff = q.golesFavor - q.golesContra;
                    
                    const nombresQuinteto = q.ids.map(id => {
                      const jug = jugadores.find(j => j.id === id);
                      if (!jug) return '?';
                      if (jug.apellido) return jug.apellido.toUpperCase();
                      const partesNombre = jug.nombre.trim().split(' ');
                      return partesNombre[0].toUpperCase();
                    }).join(' - ');

                    return (
                      <tr key={idx} style={{ textAlign: 'center' }}>
                        <td style={{ textAlign: 'left', fontWeight: 800, fontFamily: 'JetBrains Mono', color: '#fff', fontSize: '0.75rem', lineHeight: '1.4' }}>
                          [{nombresQuinteto}]
                        </td>
                        <td style={{ fontWeight: 800, color: q.golesFavor > 0 ? '#00ff88' : '#555' }}>{q.golesFavor}</td>
                        <td style={{ fontWeight: 800, color: q.golesContra > 0 ? '#ef4444' : '#555' }}>{q.golesContra}</td>
                        <td>
                          <div style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', background: diff > 0 ? 'rgba(0,255,136,0.1)' : diff < 0 ? 'rgba(239,68,68,0.1)' : 'transparent', color: diff > 0 ? 'var(--accent)' : diff < 0 ? '#ef4444' : '#fff', fontWeight: 800 }}>
                            {diff > 0 ? '+' : ''}{diff}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                          <span style={{ color: '#10b981' }}>{q.duelosGanados}</span> / <span style={{ color: '#ef4444' }}>{q.duelosPerdidos}</span>
                        </td>
                      </tr>
                    )
                  })}
                  {analitica.quintetos.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>No hay datos suficientes de quintetos en este partido.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

const escudoStyle = { height: '60px', marginBottom: '10px', filter: 'grayscale(1) brightness(2)', objectFit: 'contain' };
const escudoFallback = { width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: '1.5rem', marginBottom: '10px', margin: '0 auto' };
const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontFamily: 'JetBrains Mono', fontSize: '0.9rem', alignItems: 'center' };
const zonePill = { flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '10px 5px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-dim)' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default Resumen;