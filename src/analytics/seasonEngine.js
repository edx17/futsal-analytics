import { calcularRatingJugador } from './rating';
import { calcularXGPartido, calcularXGEvento } from './xg';
import { generarPosesiones, calcularCadenasValor } from './posesiones';
import { detectarTransiciones } from './transiciones';
import { analizarPartido } from './engine';

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
    golesFavorPT: 0, golesFavorST: 0, golesContraPT: 0, golesContraST: 0, 
    victorias: 0, empates: 0, derrotas: 0,
    xgTotal: calcularXGPartido(evFiltrados.filter(e => e.equipo === 'Propio')),
    xgRival: calcularXGPartido(evFiltrados.filter(e => e.equipo === 'Rival')),
    remates: 0, recuperaciones: 0, perdidas: 0,
    recuperacionesAltas: 0, perdidasPeligrosas: 0, 
    duelosDefGanados: 0, duelosDefTotales: 0
  };

  const statsJugadores = {};
  jugadores.forEach(j => {
    statsJugadores[j.id] = { 
      ...j, eventos: [], goles: 0, asistencias: 0, rec: 0, perdidas: 0, 
      duelosDefGan: 0, duelosDefTot: 0, xgChain: 0, xgBuildup: 0, xgIndividual: 0,
      minutosJugados: 0 // NUEVO
    };
  });

  const quintetosGlobales = {};

  const historialPartidos = partidosFiltrados.map(p => {
    const evPartido = evFiltrados.filter(e => e.id_partido === p.id);
    const golesPropio = evPartido.filter(e => (e.accion === 'Remate - Gol' || e.accion === 'Gol') && e.equipo === 'Propio').length;
    const golesRival = evPartido.filter(e => (e.accion === 'Remate - Gol' || e.accion === 'Gol') && e.equipo === 'Rival').length;
    const xg = calcularXGPartido(evPartido.filter(e => e.equipo === 'Propio'));
    
    const evPropio = evPartido.filter(e => e.equipo === 'Propio');
    const posesionesPartido = generarPosesiones(evPropio);
    
    try {
      const datosPartido = analizarPartido(evPartido, 'Propio');
      
      // Acumular Quintetos
      if (datosPartido && datosPartido.quintetos) {
        datosPartido.quintetos.forEach(q => {
          const hash = q.ids.slice().sort().join('-');
          if (!quintetosGlobales[hash]) {
            quintetosGlobales[hash] = { ids: q.ids, golesFavor: 0, golesContra: 0 };
          }
          quintetosGlobales[hash].golesFavor += q.golesFavor;
          quintetosGlobales[hash].golesContra += q.golesContra;
        });
      }

      // Acumular Minutos Reales
      if (datosPartido && datosPartido.minutosJugados) {
        Object.entries(datosPartido.minutosJugados).forEach(([id, mins]) => {
          if (statsJugadores[id]) statsJugadores[id].minutosJugados += mins;
        });
      }

    } catch (error) {
      console.warn("No se pudo analizar completamente el partido", p.id);
    }
    
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

    const fechaCorta = p.fecha ? p.fecha.substring(0, 5) : 'S/F';
    return { ...p, rival: p.rival || 'Desconocido', fechaCorta, fecha: p.fecha || 'Sin fecha', golesPropio, golesRival, resultado, xg };
  });

  const topQuintetos = Object.values(quintetosGlobales)
    .filter(q => q.ids && q.ids.length > 0)
    .sort((a, b) => (b.golesFavor - b.golesContra) - (a.golesFavor - a.golesContra))
    .slice(0, 5);

  const evPropiosGlobales = evFiltrados.filter(e => e.equipo === 'Propio');
  const transicionesGlobales = detectarTransiciones(evPropiosGlobales);
  const transicionesLetales = transicionesGlobales.filter(t => t.remate.accion === 'Remate - Gol' || t.remate.accion === 'Gol');

  evFiltrados.forEach(ev => {
    const p = ev.equipo === 'Propio';
    const esAtaque = ev.zona_x > 66;
    const esDefensa = ev.zona_x < 33;
    const esGol = ev.accion === 'Remate - Gol' || ev.accion === 'Gol';
    
    if (esGol) {
      if (p) {
        if (ev.periodo === 'PT') statsEquipo.golesFavorPT++;
        if (ev.periodo === 'ST') statsEquipo.golesFavorST++;
      } else {
        if (ev.periodo === 'PT') statsEquipo.golesContraPT++;
        if (ev.periodo === 'ST') statsEquipo.golesContraST++;
      }
    }

    if (p) {
      if (ev.accion?.includes('Remate')) {
        statsEquipo.remates++;
        if (ev.id_jugador && statsJugadores[ev.id_jugador]) {
          // Acá conectamos el motor xG real que creaste
          statsJugadores[ev.id_jugador].xgIndividual += calcularXGEvento(ev);
        }
      }
      if (ev.accion === 'Recuperación') {
        statsEquipo.recuperaciones++;
        if (esAtaque) statsEquipo.recuperacionesAltas++;
      }
      if (ev.accion === 'Pérdida') {
        statsEquipo.perdidas++;
        if (esDefensa) statsEquipo.perdidasPeligrosas++;
      }
      if (ev.accion === 'Duelo DEF Ganado') { statsEquipo.duelosDefGanados++; statsEquipo.duelosDefTotales++; }
      if (ev.accion === 'Duelo DEF Perdido') { statsEquipo.duelosDefTotales++; }
      
      if (esGol && ev.id_asistencia) {
        statsEquipo.asistenciasTotales++;
      }

      if (ev.id_jugador && statsJugadores[ev.id_jugador]) {
        statsJugadores[ev.id_jugador].eventos.push(ev);
        if (esGol) statsJugadores[ev.id_jugador].goles++;
        if (ev.accion === 'Recuperación') statsJugadores[ev.id_jugador].rec++;
        if (ev.accion === 'Pérdida') statsJugadores[ev.id_jugador].perdidas++;
        if (ev.accion === 'Duelo DEF Ganado') { statsJugadores[ev.id_jugador].duelosDefGan++; statsJugadores[ev.id_jugador].duelosDefTot++; }
        if (ev.accion === 'Duelo DEF Perdido') { statsJugadores[ev.id_jugador].duelosDefTot++; }
      }

      if (ev.id_asistencia && statsJugadores[ev.id_asistencia]) {
        if (esGol) {
          statsJugadores[ev.id_asistencia].asistencias++;
          statsJugadores[ev.id_asistencia].eventos.push({ ...ev, tipoVirtual: 'Asistencia' }); 
        }
      }
    }
  });

  const jugadoresActivos = Object.values(statsJugadores).filter(j => j.eventos.length > 0 || j.xgChain > 0);
  
  // NUEVO: ESTANDARIZACIÓN P40 (Proyección a 40 minutos)
  jugadoresActivos.forEach(j => {
    // Evitar divisiones por cero. Si tiene eventos pero 0 minutos (error de taggeo), asumimos 1 minuto.
    const minsReales = Math.max(1, j.minutosJugados); 
    
    j.golesP40 = (j.goles / minsReales) * 40;
    j.asistenciasP40 = (j.asistencias / minsReales) * 40;
    j.recP40 = (j.rec / minsReales) * 40;
    j.xgBuildupP40 = (j.xgBuildup / minsReales) * 40;

    const pmGlobal = (j.goles + j.asistencias) - (j.perdidas * 0.5); 
    j.impactoGlobal = calcularRatingJugador(j, j.eventos.filter(e => !e.tipoVirtual), pmGlobal);
    j.eficaciaDefensiva = j.duelosDefTot > 0 ? (j.duelosDefGan / j.duelosDefTot) * 100 : 0;
  });

  const matrizTalento = jugadoresActivos.map(j => ({
    nombre: j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase(),
    creacion: Number((j.xgBuildupP40 + j.asistenciasP40).toFixed(2)), // Usamos P40 para que sea justo
    finalizacion: Number((j.golesP40 + (j.xgIndividual / Math.max(1, j.minutosJugados)) * 40).toFixed(2)),
    impacto: j.impactoGlobal 
  })).filter(j => j.creacion > 0 || j.finalizacion > 0);

  const topGoleadores = [...jugadoresActivos].sort((a, b) => b.goles - a.goles).slice(0, 5);
  const topAsistidores = [...jugadoresActivos].sort((a, b) => b.asistencias - a.asistencias).slice(0, 5);
  const topMVP = [...jugadoresActivos].sort((a, b) => b.impactoGlobal - a.impactoGlobal).slice(0, 5);
  const topMuros = [...jugadoresActivos].filter(j => j.duelosDefTot >= 5).sort((a, b) => b.eficaciaDefensiva - a.eficaciaDefensiva).slice(0, 5);
  const topCreadores = [...jugadoresActivos].filter(j => j.xgBuildup > 0).sort((a, b) => b.xgBuildup - a.xgBuildup).slice(0, 5);

  return { statsEquipo, historialPartidos, topGoleadores, topAsistidores, topMVP, topMuros, topCreadores, evFiltrados, transicionesLetales, matrizTalento, topQuintetos, jugadoresStatsGlobal: jugadoresActivos };
}