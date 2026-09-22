/* LA VERSIÓN DE ANTES, TAL CUAL ESTABA
 *
 * Copia literal del useMemo que vivía dentro de Resumenplantel.jsx, sacada de
 * git y envuelta como función. Existe sólo para que la prueba pueda correr las
 * dos versiones con los mismos datos y comparar número por número.
 *
 * NO SE EDITA. Si algún día el cálculo cambia a propósito, se borra este
 * archivo junto con la prueba de equivalencia. */

import { calcularMinutosPorJugador, calcularParticipacion } from '../engine';
import { calcularRatingJugador } from '../rating';
import { calcularXGEvento } from '../xg';
import { ruedaDePartido } from '../../utils/ruedas';

const DUR_PARTIDO = 40; // minutos de un partido de futsal

/* ---------- helpers puros ---------- */
const mismoId = (a, b) => String(a) === String(b);

const esArquero = (pos) => (pos || '').toLowerCase().includes('arquero') || (pos || '').toLowerCase().includes('portero');

const parseQuinteto = (qa) => {
  if (!qa) return [];
  if (Array.isArray(qa)) return qa.map(String);
  if (typeof qa === 'string') { try { return JSON.parse(qa).map(String); } catch { return qa.split(',').map(s => s.trim()); } }
  return [];
};

const plantillaIds = (p) => {
  try {
    const pl = typeof p?.plantilla === 'string' ? JSON.parse(p.plantilla) : p?.plantilla;
    return Array.isArray(pl) ? pl.map(x => x.id_jugador).filter(v => v != null).map(String) : [];
  } catch { return []; }
};

const ordenEv = (a, b) => {
  const pa = a.periodo === 'ST' ? 1 : 0, pb = b.periodo === 'ST' ? 1 : 0;
  if (pa !== pb) return pa - pb;
  if ((a.minuto || 0) !== (b.minuto || 0)) return (a.minuto || 0) - (b.minuto || 0);
  if ((a.segundos || 0) !== (b.segundos || 0)) return (a.segundos || 0) - (b.segundos || 0);
  return (a.id || 0) - (b.id || 0);
};

const edadDe = (fechanac) => {
  if (!fechanac) return null;
  const f = new Date(fechanac); if (isNaN(f.getTime())) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - f.getFullYear();
  const m = hoy.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) e--;
  return e;
};

/* Estructura base de acumulación por jugador */
const nuevoAcc = (j) => ({
  id: j.id, dorsal: j.dorsal, nombre: j.nombre, apellido: j.apellido, posicion: j.posicion,
  categoria: j.categoria, foto: j.foto, edad: edadDe(j.fechanac), pierna: j.pierna,
  estadoFicha: j.estado_ficha || 'Activo',
  aptoVencido: j.vencimiento_apto ? new Date(j.vencimiento_apto) < new Date() : false,
  citados: 0, jugados: 0, titularidades: 0, minutos: 0, partPctAcum: 0,
  goles: 0, asistencias: 0, remates: 0, rematesArco: 0, ocasionesFalladas: 0, pasesClave: 0, xg: 0,
  rec: 0, perd: 0,
  duelOfeGan: 0, duelOfeTot: 0, duelDefGan: 0, duelDefTot: 0,
  duelOfeIndGan: 0, duelOfeIndTot: 0, duelDefIndGan: 0, duelDefIndTot: 0,
  faltasCom: 0, faltasRec: 0, amarillas: 0, rojas: 0,
  // arquero
  golesRecibidos: 0, atajadas: 0, xgRecibido: 0,
  // impacto
  ratings: [], pmAcum: 0, pmPartidos: 0,
});

export function procesarPlantelAntes({
  raw, partidosScopeCat, filtroTorneo, filtroCategoria,
  misCategorias, hayRuedas, filtroRueda, torneoElegido, jornadasOrdenadas,
}) {
    if (raw.jugadores.length === 0) return { jugadoresProc: [], arquerosProc: [] };

    // Jugadores: SOLO scope del CT (no por categoría), para que un invitado de otra
    // categoría que jugó (ej: un Tercera que jugó en Primera) igual acumule y aparezca.
    let jugadores = raw.jugadores;
    if (misCategorias.length > 0) {
      jugadores = jugadores.filter(j => !j.categoria || misCategorias.includes(j.categoria));
    }
    // Partidos: la categoría ya se aplicó en partidosScopeCat; acá sumamos el filtro de torneo.
    let partidos = partidosScopeCat;
    if (filtroTorneo !== 'Todos') {
      partidos = partidos.filter(p => p.torneo_id === filtroTorneo);
      if (hayRuedas && filtroRueda !== 'Todas') {
        partidos = partidos.filter(p => ruedaDePartido(p, torneoElegido, jornadasOrdenadas) === filtroRueda);
      }
    }

    const idsPartidos = new Set(partidos.map(p => p.id));

    // eventos agrupados por partido (solo los de los partidos en scope)
    const evPorPartido = new Map();
    raw.eventos.forEach(ev => {
      if (!idsPartidos.has(ev.id_partido)) return;
      if (!evPorPartido.has(ev.id_partido)) evPorPartido.set(ev.id_partido, []);
      evPorPartido.get(ev.id_partido).push(ev);
    });

    // sanciones pendientes por jugador
    const sancPend = {};
    raw.sanciones.forEach(s => {
      const tot = (s.fechas_tribunal || 0) + (s.fechas_internas || 0);
      const pend = Math.max(0, tot - (s.fechas_cumplidas || 0));
      if (pend > 0 && s.tipo !== 'acumulacion') sancPend[String(s.jugador_id)] = (sancPend[String(s.jugador_id)] || 0) + pend;
    });

    const acc = {};
    jugadores.forEach(j => { acc[String(j.id)] = nuevoAcc(j); });

    // Arqueros del plantel (para atribuir goles recibidos SOLO a quien estaba en cancha)
    const setArqueros = new Set(jugadores.filter(j => esArquero(j.posicion)).map(j => String(j.id)));

    partidos.forEach(p => {
      const evMatch = (evPorPartido.get(p.id) || []).slice().sort(ordenEv);
      const evPropio = evMatch.filter(e => e.equipo === 'Propio');
      const evRival = evMatch.filter(e => e.equipo === 'Rival');

      const minsMap = evMatch.length ? calcularMinutosPorJugador(evMatch) : {};

      /* Participación relativa: % de eventos del partido con el jugador en
         cancha. Es el criterio de "jugó", porque no depende del cronómetro
         (que en vivo no se pausa bien) sino del quinteto_activo registrado. */
      const { participacion: partMap } = evMatch.length ? calcularParticipacion(evMatch) : { participacion: {} };

      // plus/minus del partido
      const pmMap = {};
      evMatch.forEach(ev => {
        if ((ev.accion === 'Gol' || ev.accion === 'Remate - Gol') && ev.quinteto_activo) {
          const ids = parseQuinteto(ev.quinteto_activo);
          const signo = ev.equipo === 'Propio' ? 1 : -1;
          ids.forEach(id => { pmMap[id] = (pmMap[id] || 0) + signo; });
        }
      });

      // titulares = quinteto del primer evento con quinteto
      const primerQ = evMatch.find(e => e.quinteto_activo);
      const titulares = new Set(primerQ ? parseQuinteto(primerQ.quinteto_activo) : []);

      const citadosSet = new Set(plantillaIds(p));

      /* ── ARQUEROS: atribución remate a remate según quién estaba EN CANCHA ──
         Antes se sumaba todo lo recibido del partido a cada arquero que hubiera
         pisado la cancha, por eso el total entre arqueros superaba el real. */
      const arqPartido = {}; // sid -> { goles, atajadas, xg }
      const bumpArq = (sid, campo, val) => {
        if (!sid) return;
        if (!arqPartido[sid]) arqPartido[sid] = { goles: 0, atajadas: 0, xg: 0 };
        arqPartido[sid][campo] += val;
      };

      // arquero de referencia: el de más minutos del partido (si un remate rival no trae quinteto)
      const arqFallback = [...setArqueros]
        .filter(sid => (minsMap[sid] || 0) > 0)
        .sort((x, y) => (minsMap[y] || 0) - (minsMap[x] || 0))[0] || null;

      // Reconstruimos el quinteto propio a lo largo del partido.
      let enCancha = new Set(titulares);
      evMatch.forEach(ev => {
        if (ev.quinteto_activo) {
          const q = parseQuinteto(ev.quinteto_activo);
          if (q.length) enCancha = new Set(q);
        } else if (ev.accion === 'Cambio Entra' && ev.id_jugador != null) {
          enCancha.add(String(ev.id_jugador));
        } else if (ev.accion === 'Cambio Sale' && ev.id_jugador != null) {
          enCancha.delete(String(ev.id_jugador));
        }

        if (ev.equipo !== 'Rival') return;
        const acRival = ev.accion || '';
        if (!acRival.includes('Remate')) return;

        const candidatos = [...enCancha].filter(sid => setArqueros.has(sid));
        let destino = null;
        if (candidatos.length === 1) destino = candidatos[0];
        else if (candidatos.length > 1) destino = candidatos.sort((x, y) => (minsMap[y] || 0) - (minsMap[x] || 0))[0];
        else destino = arqFallback; // portero-jugador / evento sin quinteto
        if (!destino) return;

        if (acRival === 'Remate - Gol') bumpArq(destino, 'goles', 1);
        if (acRival === 'Remate - Atajado') bumpArq(destino, 'atajadas', 1);
        bumpArq(destino, 'xg', calcularXGEvento(ev) || 0);
      });

      jugadores.forEach(j => {
        const a = acc[String(j.id)];
        const sid = String(j.id);
        const part = partMap[sid];
        const citado = citadosSet.has(sid);
        const jugo = !!part?.presente;
        // Si el reloj falló pero el jugador estuvo en cancha, usamos el
        // equivalente en minutos derivado de su participación.
        const mins = (minsMap[sid] || 0) > 0 ? minsMap[sid] : (jugo ? (part?.minutosEquivalentes || 0) : 0);

        if (citado) a.citados++;
        if (!jugo) return; // no jugó este partido: no suma jugados/min/stats

        a.jugados++;
        a.minutos += mins;
        a.partPctAcum += (part?.pct || 0);
        if (titulares.has(sid)) a.titularidades++;
        a.pmAcum += (pmMap[sid] || 0);
        a.pmPartidos++;

        const evJug = evPropio.filter(e => mismoId(e.id_jugador, j.id));
        evJug.forEach(e => {
          const ac = e.accion || '';
          if (ac === 'Gol' || ac === 'Remate - Gol') a.goles++;
          if (ac.includes('Remate')) { a.remates++; a.xg += (calcularXGEvento(e) || 0); }
          if (ac === 'Remate - Gol' || ac === 'Remate - Atajado') a.rematesArco++;
          if (ac === 'Ocasión Fallada') a.ocasionesFalladas++;
          if (ac === 'Pase Clave') a.pasesClave++;
          if (ac === 'Recuperación') a.rec++;
          if (ac === 'Pérdida') a.perd++;
          if (ac === 'Falta cometida') a.faltasCom++;
          if (ac === 'Falta recibida') a.faltasRec++;
          if (ac === 'Tarjeta Amarilla') a.amarillas++;
          if (ac === 'Tarjeta Roja') a.rojas++;
          if (ac === 'Duelo OFE Ganado') { a.duelOfeGan++; a.duelOfeTot++; }
          if (ac === 'Duelo OFE Perdido') { a.duelOfeTot++; }
          if (ac === 'Duelo DEF Ganado') { a.duelDefGan++; a.duelDefTot++; }
          if (ac === 'Duelo DEF Perdido') { a.duelDefTot++; }
          if (ac === 'Duelo OFE Indirecto Ganado') { a.duelOfeIndGan++; a.duelOfeIndTot++; }
          if (ac === 'Duelo OFE Indirecto Perdido') { a.duelOfeIndTot++; }
          if (ac === 'Duelo DEF Indirecto Ganado') { a.duelDefIndGan++; a.duelDefIndTot++; }
          if (ac === 'Duelo DEF Indirecto Perdido') { a.duelDefIndTot++; }
        });

        // asistencias = fue el asistidor de un gol
        a.asistencias += evPropio.filter(e => mismoId(e.id_asistencia, j.id) && (e.accion === 'Gol' || e.accion === 'Remate - Gol')).length;

        // arquero: acumula SOLO lo recibido mientras estuvo dentro de la cancha
        if (esArquero(j.posicion)) {
          const b = arqPartido[sid];
          if (b) {
            a.golesRecibidos += b.goles;
            a.atajadas += b.atajadas;
            a.xgRecibido += b.xg;
          }
        }

        // rating del partido (con asistencias virtuales)
        const paraRating = [...evJug];
        evPropio.forEach(e => {
          if (mismoId(e.id_asistencia, j.id) && (e.accion === 'Gol' || e.accion === 'Remate - Gol')) {
            paraRating.push({ ...e, id_jugador: j.id, tipoVirtual: 'Asistencia' });
          }
        });
        const rat = calcularRatingJugador(j, paraRating, evRival, pmMap[sid] || 0, mins);
        if (rat && !Number.isNaN(Number(rat))) a.ratings.push(Number(rat));
      });
    });

    // post-proceso: derivados
    const finalizar = (a) => {
      const baseMin = Math.max(a.citados, a.jugados) * DUR_PARTIDO;
      a.pctMin = baseMin > 0 ? (a.minutos / baseMin) * 100 : 0;
      a.ingresos = Math.max(0, a.jugados - a.titularidades);
      // Participación promedio: % de eventos del partido con él en cancha.
      // Independiente del cronómetro.
      a.partPct = a.jugados > 0 ? a.partPctAcum / a.jugados : 0;
      a.gPorPJ = a.jugados > 0 ? a.goles / a.jugados : 0;
      a.aPorPJ = a.jugados > 0 ? a.asistencias / a.jugados : 0;
      a.pctArco = a.remates > 0 ? (a.rematesArco / a.remates) * 100 : 0;
      a.ofePct = a.duelOfeTot > 0 ? (a.duelOfeGan / a.duelOfeTot) * 100 : 0;
      a.defPct = a.duelDefTot > 0 ? (a.duelDefGan / a.duelDefTot) * 100 : 0;
      a.ofeIndPct = a.duelOfeIndTot > 0 ? (a.duelOfeIndGan / a.duelOfeIndTot) * 100 : 0;
      a.defIndPct = a.duelDefIndTot > 0 ? (a.duelDefIndGan / a.duelDefIndTot) * 100 : 0;
      a.ratingCount = a.ratings.length;
      a.ratingProm = a.ratings.length > 0 ? a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length : 0;
      a.pmProm = a.pmPartidos > 0 ? a.pmAcum / a.pmPartidos : 0;
      a.pctAtajadas = (a.atajadas + a.golesRecibidos) > 0 ? (a.atajadas / (a.atajadas + a.golesRecibidos)) * 100 : 0;
      a.golesEvitables = a.xgRecibido - a.golesRecibidos;
      a.sancPend = sancPend[String(a.id)] || 0;
      return a;
    };

    // Quiénes se muestran:
    //  - siempre los que participaron (citados o jugados) -> incluye invitados de otra categoría
    //  - además, en vista general/categoría (sin torneo), el plantel propio de esa categoría aunque no haya jugado
    const catScope = (cat) => filtroCategoria === 'Todas'
      ? (misCategorias.length > 0 ? misCategorias.includes(cat) : true)
      : cat === filtroCategoria;
    const mostrar = (a) => {
      const participo = a.citados > 0 || a.jugados > 0;
      if (filtroTorneo !== 'Todos') return participo;
      return participo || catScope(a.categoria);
    };

    const todos = Object.values(acc).map(finalizar).filter(mostrar);
    return {
      jugadoresProc: todos.filter(j => !esArquero(j.posicion)),
      arquerosProc: todos.filter(j => esArquero(j.posicion)),
    };
}
