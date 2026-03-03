// src/analytics/seasonEngine.js
import { calcularRatingJugador } from './rating';
import { calcularXGPartido } from './xg';
import { generarPosesiones, calcularCadenasValor } from './posesiones';

export function analizarTemporadaGlobal(partidos, eventos, jugadores, filtros) {
  if (!partidos || partidos.length === 0) return null;

  const { categoria, competicion } = filtros;

  const partidosFiltrados = partidos.filter(p => {
    const pasaCategoria = categoria === 'Todas' || p.categoria === categoria;
    const pasaCompeticion = competicion === 'Todas' || p.competicion === competicion;
    return pasaCategoria && pasaCompeticion;
  });

  const idsPartidos = new Set(partidosFiltrados.map(p => p.id));
  const evFiltrados = eventos.filter(ev => idsPartidos.has(ev.id_partido));

  const statsEquipo = {
    partidosJugados: partidosFiltrados.length,
    golesFavor: 0, golesContra: 0, asistenciasTotales: 0,
    victorias: 0, empates: 0, derrotas: 0,
    xgTotal: calcularXGPartido(evFiltrados.filter(e => e.equipo === 'Propio')),
    remates: 0, recuperaciones: 0, perdidas: 0,
    duelosDefGanados: 0, duelosDefTotales: 0
  };

  const statsJugadores = {};
  jugadores.forEach(j => {
    statsJugadores[j.id] = { ...j, eventos: [], goles: 0, asistencias: 0, rec: 0, perdidas: 0, duelosDefGan: 0, duelosDefTot: 0, xgChain: 0, xgBuildup: 0 };
  });

  const historialPartidos = partidosFiltrados.map(p => {
    const evPartido = evFiltrados.filter(e => e.id_partido === p.id);
    const golesPropio = evPartido.filter(e => (e.accion === 'Remate - Gol' || e.accion === 'Gol') && e.equipo === 'Propio').length;
    const golesRival = evPartido.filter(e => (e.accion === 'Remate - Gol' || e.accion === 'Gol') && e.equipo === 'Rival').length;
    const xg = calcularXGPartido(evPartido.filter(e => e.equipo === 'Propio'));
    
    // --- INTEGRACIÓN DE CADENAS DE VALOR ---
    const evPropio = evPartido.filter(e => e.equipo === 'Propio');
    const posesionesPartido = generarPosesiones(evPropio);
    
    jugadores.forEach(j => {
      const { xgChain, xgBuildup } = calcularCadenasValor(posesionesPartido, j.id);
      statsJugadores[j.id].xgChain += xgChain;
      statsJugadores[j.id].xgBuildup += xgBuildup;
    });

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
    
    if (p) {
      if (ev.accion?.includes('Remate')) statsEquipo.remates++;
      if (ev.accion === 'Recuperación') statsEquipo.recuperaciones++;
      if (ev.accion === 'Pérdida') statsEquipo.perdidas++;
      if (ev.accion === 'Duelo DEF Ganado') { statsEquipo.duelosDefGanados++; statsEquipo.duelosDefTotales++; }
      if (ev.accion === 'Duelo DEF Perdido') { statsEquipo.duelosDefTotales++; }
      
      if ((ev.accion === 'Remate - Gol' || ev.accion === 'Gol') && ev.id_asistencia) {
        statsEquipo.asistenciasTotales++;
      }

      if (ev.id_jugador && statsJugadores[ev.id_jugador]) {
        statsJugadores[ev.id_jugador].eventos.push(ev);
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') statsJugadores[ev.id_jugador].goles++;
        if (ev.accion === 'Recuperación') statsJugadores[ev.id_jugador].rec++;
        if (ev.accion === 'Pérdida') statsJugadores[ev.id_jugador].perdidas++;
        if (ev.accion === 'Duelo DEF Ganado') { statsJugadores[ev.id_jugador].duelosDefGan++; statsJugadores[ev.id_jugador].duelosDefTot++; }
        if (ev.accion === 'Duelo DEF Perdido') { statsJugadores[ev.id_jugador].duelosDefTot++; }
      }

      if (ev.id_asistencia && statsJugadores[ev.id_asistencia]) {
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') {
          statsJugadores[ev.id_asistencia].asistencias++;
          statsJugadores[ev.id_asistencia].eventos.push({ ...ev, tipoVirtual: 'Asistencia' }); 
        }
      }
    }
  });

  const jugadoresActivos = Object.values(statsJugadores).filter(j => j.eventos.length > 0 || j.xgChain > 0);
  
jugadoresActivos.forEach(j => {
    // Calculamos un PM global aproximado usando los goles del jugador como base si no hay sub-ins exactos
    const pmGlobal = (j.goles + j.asistencias) - (j.perdidas * 0.5); 
    j.impactoGlobal = calcularRatingJugador(j, j.eventos.filter(e => !e.tipoVirtual), pmGlobal);
    j.eficaciaDefensiva = j.duelosDefTot > 0 ? (j.duelosDefGan / j.duelosDefTot) * 100 : 0;
  });

  const topGoleadores = [...jugadoresActivos].sort((a, b) => b.goles - a.goles).slice(0, 5);
  const topAsistidores = [...jugadoresActivos].sort((a, b) => b.asistencias - a.asistencias).slice(0, 5);
  const topMVP = [...jugadoresActivos].sort((a, b) => b.impactoGlobal - a.impactoGlobal).slice(0, 5);
  const topMuros = [...jugadoresActivos]
    .filter(j => j.duelosDefTot >= 5)
    .sort((a, b) => b.eficaciaDefensiva - a.eficaciaDefensiva).slice(0, 5);
  const topCreadores = [...jugadoresActivos]
    .filter(j => j.xgBuildup > 0)
    .sort((a, b) => b.xgBuildup - a.xgBuildup).slice(0, 5);

  return { statsEquipo, historialPartidos, topGoleadores, topAsistidores, topMVP, topMuros, topCreadores, evFiltrados };
}