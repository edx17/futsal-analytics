import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';

// IMPORTACIONES DEL MOTOR ANALÍTICO
import { analizarPartido } from '../analytics/engine';
import { calcularRatingJugador } from '../analytics/rating';
import { calcularCadenasValor } from '../analytics/posesiones';

const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0">
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
    <div className="tooltip-text">
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
  const [filtroCompeticionGrid, setFiltroCompeticionGrid] = useState('Todas');

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

  const categoriasUnicas = useMemo(() => [...new Set(partidos.map(p => p.categoria).filter(Boolean))], [partidos]);
  const competicionesUnicas = useMemo(() => [...new Set(partidos.map(p => p.competicion).filter(Boolean))], [partidos]);

  const partidosGrid = useMemo(() => {
    return partidos.filter(p => {
      const pasaCat = filtroCategoriaGrid === 'Todas' || p.categoria === filtroCategoriaGrid;
      const pasaComp = filtroCompeticionGrid === 'Todas' || p.competicion === filtroCompeticionGrid;
      return pasaCat && pasaComp;
    });
  }, [partidos, filtroCategoriaGrid, filtroCompeticionGrid]);

  const analitica = useMemo(() => {
    if (!eventosPartido.length) return null;

    const evFiltrados = filtroPeriodo === 'Todos' 
      ? eventosPartido 
      : eventosPartido.filter(ev => ev.periodo === filtroPeriodo);

    const datosProcesados = analizarPartido(evFiltrados, 'Propio', false);

    const stats = { 
      propio: { goles: 0, asistencias: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, perdidas: 0, perdidasPeligrosas: 0, rec: 0, recAltas: 0, recMedias: 0, recBajas: 0, faltas: 0, accionesCampoRival: 0, totalAcciones: 0 }, 
      rival: { goles: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, faltas: 0, totalAcciones: 0 } 
    };

    const abp = { corners: { favor: 0, contra: 0, rematesGenerados: 0 }, laterales: { favor: 0, contra: 0, rematesGenerados: 0 }, zonasLatFavor: { z1: 0, z2: 0, z3: 0, z4: 0 } };
    
    const perfilRemate = { centro: 0, banda: 0, cerca: 0, lejos: 0 };

    const origenGoles = {
      'Ataque Posicional': 0, 'Contraataque': 0, 'Recuperación Alta': 0, 'Error No Forzado': 0,
      'Córner': 0, 'Lateral': 0, 'Tiro Libre': 0, 'Penal / Sexta Falta': 0, 'No Especificado': 0
    };

    evFiltrados.forEach((ev, i) => {
      const p = ev.equipo === 'Propio';
      
      const xNorm = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const yNorm = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;

      if (p) {
        stats.propio.totalAcciones++;
        if (xNorm > 50) stats.propio.accionesCampoRival++; 
      } else {
        stats.rival.totalAcciones++;
      }

      if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') { 
        if (p) {
          stats.propio.goles++;
          stats.propio.remates++;
          if (ev.id_asistencia) stats.propio.asistencias++;
          const origen = ev.origen_gol || 'No Especificado';
          if (origenGoles[origen] !== undefined) {
            origenGoles[origen]++;
          } else {
            origenGoles['No Especificado']++;
          }
        } else {
          stats.rival.goles++;
          stats.rival.remates++;
        }
      }
      else if (ev.accion === 'Remate - Atajado') { p ? stats.propio.atajados++ : stats.rival.atajados++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (ev.accion === 'Remate - Desviado') { p ? stats.propio.desviados++ : stats.rival.desviados++; p ? stats.propio.remates++ : stats.rival.remates++; }
      else if (ev.accion === 'Remate - Rebatido') { p ? stats.propio.rebatidos++ : stats.rival.rebatidos++; p ? stats.propio.remates++ : stats.rival.remates++; }
      
      if (p && ev.accion?.includes('Remate')) {
        if (yNorm > 35 && yNorm < 65) perfilRemate.centro++;
        else perfilRemate.banda++;

        const dx = (100 - xNorm) * 0.4;
        const dy = Math.abs(50 - yNorm) * 0.2;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 8) perfilRemate.cerca++;
        else perfilRemate.lejos++;
      }

      else if (p && ev.accion === 'Pérdida') { 
        stats.propio.perdidas++; 
        for(let j=1; j<=3 && i+j < evFiltrados.length; j++) {
            if (evFiltrados[i+j].equipo === 'Rival' && evFiltrados[i+j].accion?.includes('Remate')) {
                stats.propio.perdidasPeligrosas++;
                break;
            }
        }
      }
      else if (p && ev.accion === 'Recuperación') { 
        stats.propio.rec++; 
        if (xNorm > 66) stats.propio.recAltas++;
        else if (xNorm > 33) stats.propio.recMedias++;
        else stats.propio.recBajas++;
      }
      else if (ev.accion === 'Falta cometida') { p ? stats.propio.faltas++ : stats.rival.faltas++; }

      if (ev.accion === 'Córner') {
        if (p) {
          abp.corners.favor++;
          for(let j=1; j<=2 && i+j < evFiltrados.length; j++) {
              if (evFiltrados[i+j].equipo === 'Propio' && evFiltrados[i+j].accion?.includes('Remate')) {
                  abp.corners.rematesGenerados++; break;
              }
          }
        } else { abp.corners.contra++; }
      }
      if (ev.accion === 'Lateral') {
        if (p) {
          abp.laterales.favor++;
          if (xNorm < 25) abp.zonasLatFavor.z1++;
          else if (xNorm < 50) abp.zonasLatFavor.z2++;
          else if (xNorm < 75) abp.zonasLatFavor.z3++;
          else abp.zonasLatFavor.z4++;

          for(let j=1; j<=2 && i+j < evFiltrados.length; j++) {
            if (evFiltrados[i+j].equipo === 'Propio' && evFiltrados[i+j].accion?.includes('Remate')) {
                abp.laterales.rematesGenerados++; break;
            }
          }
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
      if (ev.equipo === 'Propio' && ev.id_jugador && statsJugadores[ev.id_jugador]) {
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
      if (ev.equipo === 'Propio' && ev.id_asistencia && statsJugadores[ev.id_asistencia]) {
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') statsJugadores[ev.id_asistencia].asistencias++;
      }
    });

    const ranking = Object.values(statsJugadores)
      .filter(j => j.eventos.length > 0 || j.xgChain > 0 || (datosProcesados.plusMinusJugador && datosProcesados.plusMinusJugador[j.id]))
      .map(j => {
        const pm = datosProcesados.plusMinusJugador ? (datosProcesados.plusMinusJugador[j.id] || 0) : 0;
        const mins = datosProcesados.minutosJugados ? (datosProcesados.minutosJugados[j.id] || 0) : 0;
        
        let rol = 'MIXTO';
        const ratioFinalizacion = j.remates / (j.xgBuildup || 1);
        if (ratioFinalizacion >= 2.5) rol = 'FINALIZADOR';
        else if (j.xgBuildup >= 0.5 && ratioFinalizacion < 1.5) rol = 'GENERADOR';

        return { ...j, plusMinus: pm, minutos: mins, impacto: calcularRatingJugador(j, j.eventos, pm), rol }
      })
      .sort((a, b) => b.impacto - a.impacto);

    const posesionesTotales = datosProcesados.posesiones.length;
    const posesionesConRemate = datosProcesados.posesiones.filter(p => p.eventos.some(e => e.accion?.includes('Remate'))).length;
    const posesionesGol = datosProcesados.posesiones.filter(p => p.eventos.some(e => e.accion === 'Gol' || e.accion === 'Remate - Gol')).length;

    const shotRate = posesionesTotales > 0 ? ((posesionesConRemate / posesionesTotales) * 100).toFixed(0) : 0;
    const goalRate = posesionesTotales > 0 ? ((posesionesGol / posesionesTotales) * 100).toFixed(1) : 0;
    const lossDanger = posesionesTotales > 0 ? ((stats.propio.perdidasPeligrosas / posesionesTotales) * 100).toFixed(1) : 0;

    const xgPorRemate = stats.propio.remates > 0 ? (datosProcesados.xgPropio / stats.propio.remates).toFixed(2) : 0;
    const golesVsXg = (stats.propio.goles - datosProcesados.xgPropio).toFixed(2);
    const rematesPorPosesion = posesionesTotales > 0 ? (stats.propio.remates / posesionesTotales).toFixed(2) : 0;
    const eficaciaTiro = stats.propio.remates > 0 ? ((stats.propio.goles / stats.propio.remates) * 100).toFixed(0) : 0;
    
    const territoryPct = stats.propio.totalAcciones > 0 ? ((stats.propio.accionesCampoRival / stats.propio.totalAcciones) * 100).toFixed(0) : 50;
    const totalDuelosPartido = (datosProcesados.duelos.defensivos.total + datosProcesados.duelos.ofensivos.total);
    const chaosIndex = posesionesTotales > 0 ? ((stats.propio.perdidas + stats.rival.perdidas + totalDuelosPartido + datosProcesados.transiciones.length) / posesionesTotales).toFixed(1) : 0;

    const xgDiff = (datosProcesados.xgPropio + datosProcesados.xgRival) > 0 ? (datosProcesados.xgPropio / (datosProcesados.xgPropio + datosProcesados.xgRival)) * 100 : 50;
    const duelosPct = totalDuelosPartido > 0 ? ((datosProcesados.duelos.defensivos.ganados + datosProcesados.duelos.ofensivos.ganados) / totalDuelosPartido) * 100 : 50;
    const matchControl = ((xgDiff * 0.4) + (territoryPct * 0.3) + (duelosPct * 0.3)).toFixed(0);

    const dataOrigenGol = Object.entries(origenGoles)
      .filter(([_, valor]) => valor > 0)
      .map(([nombre, valor]) => ({ name: nombre, value: valor }));

    return { 
      evFiltrados, stats, abp, ranking, eficaciaTiro, shotRate, goalRate, lossDanger, chaosIndex, matchControl, territoryPct,
      xgPorRemate, golesVsXg, rematesPorPosesion, perfilRemate, dataOrigenGol,
      xgPropio: datosProcesados.xgPropio, xgRival: datosProcesados.xgRival, 
      insights: datosProcesados.insights, posesiones: datosProcesados.posesiones, transiciones: datosProcesados.transiciones,
      duelos: datosProcesados.duelos, quintetos: datosProcesados.quintetos, plusMinusJugador: datosProcesados.plusMinusJugador
    };
  }, [eventosPartido, filtroPeriodo, jugadores]);

  const rematesDetalle = useMemo(() => {
    if (!analitica) return [];
    return analitica.evFiltrados
      .filter(ev => ev.accion?.includes('Remate') || ev.accion === 'Gol')
      .map(ev => {
        const j = jugadores.find(jug => jug.id == ev.id_jugador);
        const nombre = j ? (j.apellido || j.nombre) : 'Desconocido';
        
        const xNorm = ev.zona_x_norm !== undefined ? ev.zona_x_norm : (ev.zona_x || 0);
        const yNorm = ev.zona_y_norm !== undefined ? ev.zona_y_norm : (ev.zona_y || 50);

        const distToGoalX = Math.min(xNorm, 100 - xNorm);
        const dx = distToGoalX * 0.4;
        const dy = Math.abs(50 - yNorm) * 0.2;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        let xgBase = 0;
        if (dist < 4) xgBase = 0.45;
        else if (dist < 8) xgBase = 0.20;
        else if (dist < 12) xgBase = 0.08;
        else if (dist < 20) xgBase = 0.02;
        else xgBase = 0.005;
        
        const anguloRadianes = Math.atan2(dx, dy);
        let xgVal = xgBase * Math.pow(Math.sin(anguloRadianes), 2);
        
        return {
          ...ev, jugadorNombre: nombre, distanciaMetros: dist.toFixed(1), xgCalculado: Math.min(0.99, xgVal).toFixed(2)
        };
      }).sort((a,b) => a.minuto - b.minuto);
  }, [analitica, jugadores]);

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
      .filter(ev => (ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x) != null)
      .map(ev => {
        const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
        const y = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
        return [ (x / 100) * canvas.width, (y / 100) * canvas.height, 1 ];
      });
      
    const heat = simpleheat(canvas);
    heat.data(dataPoints);
    heat.radius(45, 30); 
    heat.gradient({ 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' });
    heat.max(4); 
    heat.draw();
  }, [evMapa, tipoMapa]);

  if (!partidoSeleccionado) {
    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>MATCH CENTER</div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>Seleccioná un partido para acceder al reporte analítico.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {partidosGrid.map(p => (
            <div key={p.id} className="bento-card match-card" onClick={() => cargarPartido(p.id)} style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.fecha}</span>
                <span style={{ background: '#222', color: 'var(--accent)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>{p.categoria || 'S/C'} | {p.competicion || 'Amistoso'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '40%' }}>
                  {p.escudo_propio ? <img src={p.escudo_propio} alt="Local" style={{ height: '50px', objectFit: 'contain', filter: 'grayscale(1) brightness(2)' }} /> : <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: '1.2rem' }}>MI</div>}
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{p.nombre_propio || 'MI EQUIPO'}</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#333', fontStyle: 'italic', width: '20%', textAlign: 'center' }}>VS</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '40%' }}>
                  {p.escudo_rival ? <img src={p.escudo_rival} alt="Rival" style={{ height: '50px', objectFit: 'contain', filter: 'grayscale(1) brightness(2)' }} /> : <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>{p.rival?.substring(0, 2).toUpperCase() || 'R'}</div>}
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.2 }}>{p.rival?.toUpperCase() || 'RIVAL DESCONOCIDO'}</span>
                </div>
              </div>
            </div>
          ))}
          {partidosGrid.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>No hay partidos registrados con esos filtros.</div>}
        </div>
        <style>{`.match-card:hover { transform: translateY(-5px); border-color: var(--accent); }`}</style>
      </div>
    );
  }

  const COLORS_ORIGEN = {
    'Ataque Posicional': '#3b82f6', 
    'Contraataque': '#f59e0b', 
    'Recuperación Alta': '#10b981', 
    'Error No Forzado': '#ef4444', 
    'Córner': '#a855f7', 
    'Lateral': '#06b6d4', 
    'Tiro Libre': '#f472b6', 
    'Penal / Sexta Falta': '#ffffff', 
    'No Especificado': '#4b5563' 
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <style>{`
        .tooltip-container { position: relative; display: inline-flex; cursor: help; z-index: 10; align-items: center; margin-left: 6px; }
        .tooltip-container:hover { z-index: 9999; }
        .tooltip-text { 
          visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; 
          position: absolute; top: 150%; left: 50%; transform: translateX(-50%); 
          background: #111; color: #fff; padding: 10px; border-radius: 6px; 
          font-size: 0.75rem; width: 220px; text-align: center; border: 1px solid #444; 
          pointer-events: none; box-shadow: 0 8px 20px rgba(0,0,0,0.9); 
          font-weight: normal; line-height: 1.4; text-transform: none; letter-spacing: normal; 
          z-index: 99999;
        }
        .tooltip-text::after {
          content: ""; position: absolute; bottom: 100%; left: 50%; margin-left: -5px;
          border-width: 5px; border-style: solid; border-color: transparent transparent #444 transparent;
        }
        .tooltip-container:hover .tooltip-text, .tooltip-container:focus .tooltip-text { visibility: visible; opacity: 1; }
        .mci-bar { height: 6px; border-radius: 3px; background: #333; overflow: hidden; margin-top: 8px; display: flex; }
        .bento-card { overflow: visible !important; }
        .table-wrapper { overflow-x: auto; overflow-y: visible; padding-bottom: 40px; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={cerrarPartido} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>⬅ VOLVER</button>
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
          
          <div className="bento-card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', textAlign: 'center', marginBottom: '20px' }}>
              <div>
                {partidoSeleccionado.escudo_propio ? <img src={partidoSeleccionado.escudo_propio} alt="club" style={escudoStyle} /> : <div style={escudoFallback}>MI</div>}
                <div className="stat-label">{partidoSeleccionado.nombre_propio || 'MI EQUIPO'}</div>
              </div>
              <div style={{ padding: '0 40px' }}>
                <div style={{ fontSize: '3.5rem', fontWeight: 800, color: '#fff' }}>{analitica.stats.propio.goles} - {analitica.stats.rival.goles}</div>
                <div className="stat-label" style={{ color: 'var(--accent)' }}>{filtroPeriodo === 'Todos' ? 'RESULTADO FINAL' : `RESULTADO ${filtroPeriodo}`}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '5px' }}>{partidoSeleccionado.categoria} | {partidoSeleccionado.fecha}</div>
              </div>
              <div>
                {partidoSeleccionado.escudo_rival ? <img src={partidoSeleccionado.escudo_rival} alt="rival" style={escudoStyle} /> : <div style={{...escudoFallback, borderColor: '#555', color: '#fff'}}>{partidoSeleccionado.rival?.substring(0,2).toUpperCase() || 'R'}</div>}
                <div className="stat-label">{partidoSeleccionado.rival?.toUpperCase() || 'RIVAL DESCONOCIDO'}</div>
              </div>
            </div>

            <div style={{ background: '#000', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label" style={{ color: 'var(--accent)' }}>INDICE DE CONTROL DE PARTIDO <InfoBox texto="Fórmula: 40% Dominio xG + 30% Dominio Territorial + 30% Duelos Ganados." /></span>
                <span style={{ fontWeight: 900, color: '#fff' }}>{analitica.matchControl}% NOSOTROS</span>
              </div>
              <div className="mci-bar">
                <div style={{ width: `${analitica.matchControl}%`, background: 'var(--accent)', transition: '1s' }}></div>
                <div style={{ width: `${100 - analitica.matchControl}%`, background: '#ef4444', transition: '1s' }}></div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">CALIDAD DE POSESIÓN <InfoBox texto="Mide la eficacia de los ataques." /></div>
                <div className="stat-value" style={{ color: analitica.goalRate > 5 ? '#00ff88' : 'var(--text)' }}>
                  {analitica.goalRate}% <span style={{ fontSize: '1rem', color: 'var(--accent)' }}>| {analitica.shotRate}%</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Goles / Pos | Tiros / Pos</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">DOMINIO TERRITORIAL <InfoBox texto="Porcentaje de las acciones en campo rival." /></div>
                <div className="stat-value" style={{ color: analitica.territoryPct > 50 ? '#0ea5e9' : 'var(--text-dim)' }}>{analitica.territoryPct}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Acciones en campo rival</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">INDICE DE CAOS <InfoBox texto="Mide qué tan roto estuvo el partido." /></div>
                <div className="stat-value" style={{ color: analitica.chaosIndex > 1.5 ? '#f97316' : '#10b981' }}>{analitica.chaosIndex}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Índice de descontrol táctico</div>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px' }}>
            <div className="bento-card" style={{ borderTop: '3px solid #f59e0b', display: 'flex', flexDirection: 'column' }}>
              <div className="stat-label" style={{ marginBottom: '5px', color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                ADN DE NUESTROS GOLES <InfoBox texto="El contexto táctico desde el cual marcamos." />
              </div>
              <div style={{ flex: 1, minHeight: '220px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                {analitica.dataOrigenGol && analitica.dataOrigenGol.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={analitica.dataOrigenGol} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                          {analitica.dataOrigenGol.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS_ORIGEN[entry.name] || '#8884d8'} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.7rem' }} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', marginTop: '-15px' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{analitica.stats.propio.goles}</span><br/>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>TOTAL</span>
                    </div>
                  </>
                ) : <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No hay goles registrados.</div>}
              </div>
            </div>

            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>CARA A CARA OFENSIVO</div>
              <div style={kpiFila}><span>REMATES TOTALES</span><strong><span style={{color: 'var(--accent)'}}>{analitica.stats.propio.remates}</span> - <span style={{color: '#ef4444'}}>{analitica.stats.rival.remates}</span></strong></div>
              <div style={kpiFila}><span>REMATES AL ARCO</span><strong><span style={{color: 'var(--accent)'}}>{analitica.stats.propio.goles + analitica.stats.propio.atajados}</span> - <span style={{color: '#ef4444'}}>{analitica.stats.rival.goles + analitica.stats.rival.atajados}</span></strong></div>
              <div style={kpiFila}><span>xG TOTAL</span><strong><span style={{color: '#c084fc'}}>{analitica.xgPropio.toFixed(2)}</span> - <span style={{color: '#ef4444'}}>{analitica.xgRival.toFixed(2)}</span></strong></div>
            </div>

            <div className="bento-card" style={{ borderTop: '3px solid #3b82f6' }}>
              <div className="stat-label" style={{ marginBottom: '5px', color: '#3b82f6' }}>DESGLOSE DE REMATES</div>
              <div style={kpiFila}><span>GOLES</span><strong><span style={{color: '#00ff88'}}>{analitica.stats.propio.goles}</span> - <span style={{color: '#ef4444'}}>{analitica.stats.rival.goles}</span></strong></div>
              <div style={kpiFila}><span>ATAJADOS</span><strong><span style={{color: '#3b82f6'}}>{analitica.stats.propio.atajados}</span> - <span style={{color: '#ef4444'}}>{analitica.stats.rival.atajados}</span></strong></div>
              <div style={kpiFila}><span>DESVIADOS</span><strong><span style={{color: '#888'}}>{analitica.stats.propio.desviados}</span> - <span style={{color: '#ef4444'}}>{analitica.stats.rival.desviados}</span></strong></div>
            </div>

            <div className="bento-card" style={{ borderTop: '3px solid #00ff88' }}>
              <div className="stat-label" style={{ marginBottom: '5px', color: '#00ff88' }}>EFICIENCIA OFENSIVA</div>
              <div style={kpiFila}><span>xG / REMATE</span><strong style={{color: analitica.xgPorRemate > 0.15 ? '#00ff88' : '#fff'}}>{analitica.xgPorRemate}</strong></div>
              <div style={kpiFila}><span>GOLES vs xG</span><strong style={{color: analitica.golesVsXg > 0 ? '#00ff88' : '#ef4444'}}>{analitica.golesVsXg > 0 ? '+' : ''}{analitica.golesVsXg}</strong></div>
              <div style={kpiFila}><span>EFICACIA TIRO</span><strong>{analitica.eficaciaTiro}%</strong></div>
            </div>
            
            <div className="bento-card" style={{ borderTop: '3px solid #c084fc' }}>
              <div className="stat-label" style={{ marginBottom: '5px', color: '#c084fc' }}>PERFIL DE REMATE</div>
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between', textAlign: 'center', marginBottom: '15px' }}>
                 <div style={{...zonePill, background: 'rgba(192, 132, 252, 0.1)'}}>CENTRO<br/><strong style={{color:'#c084fc', fontSize:'1rem'}}>{analitica.perfilRemate.centro}</strong></div>
                 <div style={{...zonePill, background: 'rgba(255,255,255,0.05)'}}>BANDA<br/><strong style={{color:'#fff', fontSize:'1rem'}}>{analitica.perfilRemate.banda}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between', textAlign: 'center' }}>
                 <div style={{...zonePill, background: 'rgba(0, 255, 136, 0.1)'}}>CERCANOS<br/><strong style={{color:'#00ff88', fontSize:'1rem'}}>{analitica.perfilRemate.cerca}</strong></div>
                 <div style={{...zonePill, background: 'rgba(239, 68, 68, 0.1)'}}>LEJANOS<br/><strong style={{color:'#ef4444', fontSize:'1rem'}}>{analitica.perfilRemate.lejos}</strong></div>
              </div>
            </div>
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div className="stat-label">MAPEO TÁCTICO</div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} style={{ padding: '5px', fontSize: '0.8rem' }}>
                  <option value="Todas">ACCIONES</option>
                  <option value="Remate">REMATES</option>
                </select>
                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>PUNTOS</button>
                  <button onClick={() => setTipoMapa('calor')} style={{ ...btnTab, background: tipoMapa === 'calor' ? '#333' : 'transparent', color: tipoMapa === 'calor' ? 'var(--accent)' : 'var(--text-dim)' }}>CALOR</button>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="pitch-container" style={{ width: '100%', maxWidth: '800px', aspectRatio: '2/1', position: 'relative' }}>
                {tipoMapa === 'calor' && <canvas ref={heatmapRef} width={800} height={400} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.85 }} />}
              </div>
            </div>
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px' }}>RENDIMIENTO INDIVIDUAL</div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th style={{ textAlign: 'left' }}>JUGADOR</th>
                    <th>MIN</th>
                    <th>RATING</th>
                    <th>+/-</th>
                    <th>REMATES (G)</th>
                    <th style={{ color: '#c084fc' }}>xG BUILDUP</th>
                    <th style={{ color: '#10b981' }}>REC</th>
                  </tr>
                </thead>
                <tbody>
                  {analitica.ranking.map(j => (
                    <tr key={j.id} style={{ textAlign: 'center' }}>
                      <td className="mono-accent">{j.dorsal}</td>
                      <td style={{ textAlign: 'left', fontWeight: 700 }}>{j.nombre.toUpperCase()}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{j.minutos}'</td>
                      <td>{j.impacto.toFixed(1)}</td>
                      <td style={{ fontWeight: 800 }}>{j.plusMinus}</td>
                      <td>{j.remates} ({j.goles})</td>
                      <td style={{ fontWeight: 800, color: '#c084fc' }}>{j.xgBuildup.toFixed(2)}</td>
                      <td style={{ color: 'var(--accent)' }}>{j.rec}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', color: 'var(--accent)' }}>RENDIMIENTO POR QUINTETOS</div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>QUINTETO</th>
                    <th>GF</th>
                    <th>GC</th>
                    <th>BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {analitica.quintetos.map((q, idx) => (
                    <tr key={idx} style={{ textAlign: 'center' }}>
                      <td style={{ textAlign: 'left', fontWeight: 800, color: '#fff', fontSize: '0.75rem' }}>
                        [{q.ids.map(id => {
                          const jug = jugadores.find(j => j.id === id);
                          return jug ? (jug.apellido || jug.nombre).toUpperCase() : '?';
                        }).join(' - ')}]
                      </td>
                      <td style={{ color: '#00ff88' }}>{q.golesFavor}</td>
                      <td style={{ color: '#ef4444' }}>{q.golesContra}</td>
                      <td>{q.golesFavor - q.golesContra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', color: 'var(--accent)' }}>DETALLE DE REMATES</div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>MIN</th>
                    <th>EQUIPO</th>
                    <th style={{ textAlign: 'left' }}>JUGADOR</th>
                    <th>RESULTADO</th>
                    <th>DISTANCIA</th>
                    <th>xG</th>
                  </tr>
                </thead>
                <tbody>
                  {rematesDetalle.map(r => (
                    <tr key={r.id} style={{ textAlign: 'center' }}>
                      <td style={{ fontWeight: 800 }}>{r.minuto}'</td>
                      <td>{r.equipo}</td>
                      <td style={{ textAlign: 'left' }}>{r.equipo === 'Propio' ? r.jugadorNombre.toUpperCase() : 'RIVAL'}</td>
                      <td style={{ fontWeight: 800 }}>{r.accion.toUpperCase()}</td>
                      <td>{r.distanciaMetros}m</td>
                      <td style={{ fontWeight: 900 }}>{r.xgCalculado}</td>
                    </tr>
                  ))}
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
const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontSize: '0.9rem', alignItems: 'center' };
const zonePill = { flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '10px 5px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-dim)' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default Resumen;