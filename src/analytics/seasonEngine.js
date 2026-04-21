import { calcularRatingJugador } from './rating';
import { calcularXGPartido, calcularXGEvento } from './xg';
// import { generarPosesiones, calcularCadenasValor } from './posesiones';
// import { detectarTransiciones } from './transiciones';
// import { analizarPartido } from './engine';

export function analizarTemporadaGlobal(partidos, eventos, jugadores, filtros) {
  if (!partidos || partidos.length === 0) return null;

  const { categoria, competicion } = filtros;

  // 1. FILTRADO DE PARTIDOS
  const partidosFiltrados = partidos.filter(p => {
    const pasaCategoria = categoria === 'Todas' || p.categoria === categoria;
    const pasaCompeticion = competicion === 'Todas' || p.competicion === competicion;
    return pasaCategoria && pasaCompeticion;
  });

  const idsPartidos = new Set(partidosFiltrados.map(p => p.id));
  const evFiltrados = eventos.filter(ev => idsPartidos.has(ev.id_partido));

  // 2. STATS GLOBALES DEL EQUIPO
  const statsEquipo = {
    partidosJugados: partidosFiltrados.length,
    victorias: 0, empates: 0, derrotas: 0,
    golesFavor: 0, golesContra: 0,
    golesFavorPT: 0, golesFavorST: 0, golesContraPT: 0, golesContraST: 0,
    asistenciasTotales: 0,
    xgTotal: calcularXGPartido(evFiltrados.filter(e => e.equipo === 'Propio')),
    xgRival: calcularXGPartido(evFiltrados.filter(e => e.equipo === 'Rival')),
    duelosDefTotales: 0, duelosDefGanados: 0,
    recuperacionesAltas: 0
  };

  // 3. HISTORIAL DE PARTIDOS (RACHA)
  const historialPartidos = partidosFiltrados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).map(p => {
    let golesPropio = 0; let golesRival = 0;
    evFiltrados.filter(e => e.id_partido === p.id && (e.accion === 'Gol' || e.accion === 'Remate - Gol')).forEach(e => {
        if (e.equipo === 'Propio') golesPropio++; else golesRival++;
    });
    
    let resultado = 'E';
    if (golesPropio > golesRival) { resultado = 'V'; statsEquipo.victorias++; }
    else if (golesRival > golesPropio) { resultado = 'D'; statsEquipo.derrotas++; }
    else { statsEquipo.empates++; }

    return {
        id: p.id, rival: p.rival || 'Rival', fechaCorta: p.fecha?.substring(0,10) || '',
        categoria: p.categoria, competicion: p.competicion, jornada: p.jornada,
        golesPropio, golesRival, resultado, plantilla: p.plantilla,
        xg: calcularXGPartido(evFiltrados.filter(e => e.id_partido === p.id && e.equipo === 'Propio'))
    };
  });

  // 4. DICCIONARIOS DE ACUMULACIÓN
  const jugadoresGlobales = {};
  const quintetosGlobales = {};

  jugadores.forEach(j => {
     jugadoresGlobales[j.id] = {
         ...j, eventos: [], minutosJugados: 0, goles: 0, asistencias: 0,
         remates: 0, recuperaciones: 0, perdidas: 0, duelosDefTot: 0, duelosDefGan: 0,
         xgIndividual: 0, xgBuildup: 0
     };
  });

  // 5. PROCESAMIENTO MÁSIVO DE EVENTOS
  evFiltrados.forEach(ev => {
      const p = ev.equipo === 'Propio';
      
      // ACUMULACIÓN DE EQUIPO Y JUGADORES
      if (p) {
          if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
              statsEquipo.golesFavor++;
              if (ev.periodo === 'PT') statsEquipo.golesFavorPT++; else statsEquipo.golesFavorST++;
          }
          if (ev.accion === 'Duelo DEF Ganado') { statsEquipo.duelosDefGanados++; statsEquipo.duelosDefTotales++; }
          if (ev.accion === 'Duelo DEF Perdido') statsEquipo.duelosDefTotales++;
          if (ev.accion === 'Recuperación') {
              const xNorm = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
              if (xNorm > 66) statsEquipo.recuperacionesAltas++;
          }
          if (ev.accion === 'Pase Clave' || ev.accion === 'Asistencia') statsEquipo.asistenciasTotales++;

          if (ev.id_jugador && jugadoresGlobales[ev.id_jugador]) {
              const j = jugadoresGlobales[ev.id_jugador];
              j.eventos.push(ev);
              if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') j.goles++;
              if (ev.accion === 'Asistencia') j.asistencias++;
              if (ev.accion?.includes('Remate')) j.remates++;
              if (ev.accion === 'Recuperación') j.recuperaciones++;
              if (ev.accion === 'Pérdida') j.perdidas++;
              if (ev.accion === 'Duelo DEF Ganado') { j.duelosDefGan++; j.duelosDefTot++; }
              if (ev.accion === 'Duelo DEF Perdido') j.duelosDefTot++;
              if (ev.accion?.includes('Remate')) j.xgIndividual += calcularXGEvento(ev);
              if (ev.accion === 'Pase Exitoso' || ev.accion === 'Recuperación') j.xgBuildup += (calcularXGEvento(ev) || 0.02);
          }
      } else {
          if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
              statsEquipo.golesContra++;
              if (ev.periodo === 'PT') statsEquipo.golesContraPT++; else statsEquipo.golesContraST++;
          }
      }

      // ACUMULACIÓN DE QUINTETOS
      let qIds = [];
      try {
          if (ev.quinteto_activo) qIds = typeof ev.quinteto_activo === 'string' ? JSON.parse(ev.quinteto_activo) : ev.quinteto_activo;
      } catch(e) {}

      if (qIds && qIds.length === 5) {
          const key = [...qIds].sort().join('-');
          if (!quintetosGlobales[key]) {
              quintetosGlobales[key] = { 
                  ids: qIds, golesFavor: 0, golesContra: 0, rematesFavor: 0, rematesContra: 0, 
                  recuperaciones: 0, perdidas: 0, faltasRecibidas: 0, faltasCometidas: 0, amarillas: 0, rojas: 0 
              };
          }
          const q = quintetosGlobales[key];

          if (p) {
              if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') q.golesFavor++;
              if (ev.accion?.includes('Remate')) q.rematesFavor++;
              if (ev.accion === 'Recuperación') q.recuperaciones++;
              if (ev.accion === 'Pérdida') q.perdidas++;
              if (ev.accion === 'Falta recibida') q.faltasRecibidas++;
              if (ev.accion === 'Falta cometida') q.faltasCometidas++;
              if (ev.accion === 'Tarjeta Amarilla') q.amarillas++;
              if (ev.accion === 'Tarjeta Roja') q.rojas++;
          } else {
              if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') q.golesContra++;
              if (ev.accion?.includes('Remate')) q.rematesContra++;
          }
      }
  });

  // =========================================================================
  // 🚀 MOTOR DE RATING ANUAL OPTIMIZADO PARA QUINTETOS (P40 + BAYESIANO)
  // =========================================================================
  const calcularRatingQuintetoAnual = (q) => {
    const gf = q.golesFavor || 0;
    const gc = q.golesContra || 0;
    const rf = q.rematesFavor || 0;
    const rc = q.rematesContra || 0;
    const rec = q.recuperaciones || 0;
    const per = q.perdidas || 0;

    // Estimación de volumen de juego. En futsal, 1 acción suele equivaler a ~0.8 mins de cancha en promedio.
    // Usamos esto como "minutos jugados estimados" en la temporada para ese quinteto.
    const volumenAcciones = gf + gc + rf + rc + rec + per + (q.faltasCometidas || 0) + (q.faltasRecibidas || 0);
    const mins = q.minutos !== undefined && q.minutos > 0 ? q.minutos : Math.max(1, volumenAcciones * 0.8);

    // FILTRO BASURA: Si jugaron menos de 3 mins estimados o no tocaron la pelota, no se evalúan.
    if (mins < 3 && volumenAcciones < 5) return -1;

    // 1. NORMALIZACIÓN POR 40 MINUTOS (P40)
    // Esto pone a todos bajo la misma lupa, sin importar si jugaron 5 o 500 minutos.
    const gfP40 = (gf / mins) * 40;
    const gcP40 = (gc / mins) * 40;
    const rfP40 = (rf / mins) * 40;
    const rcP40 = (rc / mins) * 40;
    const recP40 = (rec / mins) * 40;
    const perP40 = (per / mins) * 40;

    // 2. CÁLCULO DE IMPACTO NETO ESTRUCTURAL
    let scoreNeto = 0;
    scoreNeto += (gfP40 - gcP40) * 3.0;  // La diferencia de gol es la ley suprema
    scoreNeto += (rfP40 - rcP40) * 0.5;  // Refleja quién domina realmente la cancha
    scoreNeto += (recP40 - perP40) * 0.2;  // Orden táctico básico

    // 3. EL FACTOR DE CONFIABILIDAD (La Solución)
    // Un cuarteto que hizo 3 goles en 5 mins va a tener un P40 irreal (ej: 24 goles por partido).
    // Si jugaste pocos minutos, este factor te aplasta hacia la nota base (6.0).
    // Si jugaste más de 30 minutos en el año, demostraste ser consistente y el factor se vuelve 1 (nota real).
    const minThreshold = 30; // Minutos necesarios para confiar plenamente en las métricas
    const factorConfiabilidad = Math.min(1, Math.pow(mins / minThreshold, 0.6));
    
    const scoreAjustado = scoreNeto * factorConfiabilidad;

    // 4. CURVA ASINTÓTICA A BASE 6.0
    // Evita que las notas rompan la escala hacia 14.0 o bajen a números negativos.
    let ratingFinal = 6.0;
    if (scoreAjustado > 0) {
      ratingFinal += 4.0 * (scoreAjustado / (scoreAjustado + 15)); // Tope máximo 10.0
    } else if (scoreAjustado < 0) {
      ratingFinal += 6.0 * (scoreAjustado / (Math.abs(scoreAjustado) + 15)); // Tope mínimo 0.0
    }

    return Math.max(0, Math.min(10, ratingFinal));
  };

  const quintetosEvaluados = Object.values(quintetosGlobales)
    .map(q => ({ ...q, balanceRating: calcularRatingQuintetoAnual(q) }))
    .filter(q => q.balanceRating >= 0);

  const topQuintetos = [...quintetosEvaluados].sort((a, b) => b.balanceRating - a.balanceRating).slice(0, 5);
  const peoresQuintetos = [...quintetosEvaluados].sort((a, b) => a.balanceRating - b.balanceRating).slice(0, 5);


  // 6. PROCESAMIENTO FINAL JUGADORES INDIVIDUALES
  const jugadoresActivos = Object.values(jugadoresGlobales).filter(j => j.eventos.length > 0);

  jugadoresActivos.forEach(j => {
     // Si no tenemos minutos exactos de la DB, estimamos con los eventos de todo el torneo
     const mins = Math.max(1, j.eventos.length * 0.5); 
     j.minutosJugados = mins;
     j.golesP40 = (j.goles / mins) * 40;
     j.asistenciasP40 = (j.asistencias / mins) * 40;
     j.xgBuildupP40 = (j.xgBuildup / mins) * 40;

     // Usamos la misma función rating.js pero con impacto de goles en la temporada
     const pmGlobal = (j.goles + j.asistencias) - (j.perdidas * 0.5);
     j.impactoGlobal = calcularRatingJugador(j, j.eventos.filter(e => !e.tipoVirtual), pmGlobal);
     j.eficaciaDefensiva = j.duelosDefTot > 0 ? (j.duelosDefGan / j.duelosDefTot) * 100 : 0;
  });

  const matrizTalento = jugadoresActivos.map(j => ({
    id: j.id,
    dorsal: j.dorsal,
    nombre: j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase(),
    creacion: Number((j.xgBuildupP40 + j.asistenciasP40).toFixed(2)),
    finalizacion: Number((j.golesP40 + (j.xgIndividual / Math.max(1, j.minutosJugados)) * 40).toFixed(2)),
    impacto: j.impactoGlobal
  })).filter(j => j.creacion > 0 || j.finalizacion > 0);

  const topGoleadores = [...jugadoresActivos].sort((a, b) => b.goles - a.goles).slice(0, 5);
  const topAsistidores = [...jugadoresActivos].sort((a, b) => b.asistencias - a.asistencias).slice(0, 5);
  const topCreadores = [...jugadoresActivos].sort((a, b) => b.xgBuildup - a.xgBuildup).slice(0, 5);
  const topMuros = [...jugadoresActivos].filter(j => j.duelosDefTot >= 5).sort((a, b) => b.eficaciaDefensiva - a.eficaciaDefensiva).slice(0, 5);

  return {
    statsEquipo,
    historialPartidos,
    topQuintetos,
    peoresQuintetos,
    matrizTalento,
    topGoleadores,
    topAsistidores,
    topCreadores,
    topMuros,
    evFiltrados,
    transicionesLetales: [] // Placeholder en caso de que quieras agregarlas a futuro globalmente
  };
}