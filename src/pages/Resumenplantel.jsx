import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { calcularMinutosPorJugador } from '../analytics/engine';
import { calcularRatingJugador } from '../analytics/rating';
import { calcularXGEvento } from '../analytics/xg';
import { TablaResponsive } from '../components/TablaResponsive';

const MONO = 'JetBrains Mono, monospace';
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
  citados: 0, jugados: 0, titularidades: 0, minutos: 0,
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

export default function ResumenPlantel() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const clubId = localStorage.getItem('club_id') || perfil?.club_id;
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);

  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState({ partidos: [], jugadores: [], eventos: [], sanciones: [] });

  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroTorneo, setFiltroTorneo] = useState('Todos');
  const [busqueda, setBusqueda] = useState('');
  const [soloConMinutos, setSoloConMinutos] = useState(false);
  const [mostrarGlosario, setMostrarGlosario] = useState(false);
  const [sortKey, setSortKey] = useState('min');
  const [sortDir, setSortDir] = useState('desc');

  /* ---------- carga (una sola vez, paginando eventos) ---------- */
  useEffect(() => {
    if (!clubId) { setLoading(false); return; }
    let cancelado = false;

    (async () => {
      setLoading(true);
      try {
        // Partidos del club, SIN los cruces ajenos (Neutral)
        const { data: partidos } = await supabase
          .from('partidos').select('*')
          .eq('club_id', clubId)
          .or('condicion.is.null,condicion.neq.Neutral');

        const { data: jugadores } = await supabase
          .from('jugadores')
          .select('id, nombre, apellido, posicion, dorsal, categoria, foto, fechanac, pierna, estado_ficha, vencimiento_apto')
          .eq('club_id', clubId);

        const { data: sanciones } = await supabase
          .from('disciplina_sanciones').select('*').eq('club_id', clubId);

        const idsPartidos = (partidos || []).map(p => p.id);
        let eventos = [];
        if (idsPartidos.length > 0) {
          const size = 1000; let page = 0;
          while (true) {
            const { data, error } = await supabase
              .from('eventos').select('*')
              .eq('club_id', clubId)
              .in('id_partido', idsPartidos)
              .order('id', { ascending: true })
              .range(page * size, page * size + size - 1);
            if (error || !data || data.length === 0) break;
            eventos = eventos.concat(data);
            if (data.length < size) break;
            page++;
            if (page > 50) break; // tope de seguridad
          }
        }

        if (!cancelado) setRaw({ partidos: partidos || [], jugadores: jugadores || [], eventos, sanciones: sanciones || [] });
      } catch (err) {
        console.error('Error cargando resumen de plantel:', err);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => { cancelado = true; };
  }, [clubId]);

  /* ---------- categorías disponibles ---------- */
  const categoriasDisponibles = useMemo(() => {
    const base = misCategorias.length > 0 ? misCategorias : ['Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava'];
    const desdeJug = raw.jugadores.map(j => j.categoria).filter(Boolean);
    const set = Array.from(new Set([...base, ...desdeJug]));
    return misCategorias.length > 0 ? set.filter(c => misCategorias.includes(c)) : set;
  }, [misCategorias, raw.jugadores]);

  /* ---------- partidos con scope de categoría (base para el filtro de torneo) ---------- */
  const partidosScopeCat = useMemo(() => {
    let p = raw.partidos;
    if (misCategorias.length > 0) p = p.filter(x => !x.categoria || misCategorias.includes(x.categoria));
    if (filtroCategoria !== 'Todas') p = p.filter(x => x.categoria === filtroCategoria);
    return p;
  }, [raw.partidos, misCategorias, filtroCategoria]);

  /* Torneos disponibles según la categoría elegida */
  const torneosDisponibles = useMemo(() => {
    const m = new Map();
    partidosScopeCat.forEach(p => { if (p.torneo_id) m.set(p.torneo_id, p.competicion || 'Torneo'); });
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [partidosScopeCat]);

  /* Si el torneo elegido ya no aplica a la categoría, lo reseteamos */
  useEffect(() => {
    if (filtroTorneo !== 'Todos' && !torneosDisponibles.some(t => t.id === filtroTorneo)) setFiltroTorneo('Todos');
  }, [torneosDisponibles, filtroTorneo]);

  /* ---------- cómputo pesado: agrega todo por jugador ---------- */
  const { jugadoresProc, arquerosProc } = useMemo(() => {
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

    partidos.forEach(p => {
      const evMatch = (evPorPartido.get(p.id) || []).slice().sort(ordenEv);
      const evPropio = evMatch.filter(e => e.equipo === 'Propio');
      const evRival = evMatch.filter(e => e.equipo === 'Rival');

      const minsMap = evMatch.length ? calcularMinutosPorJugador(evMatch) : {};

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

      // rival shots del partido (para arqueros)
      const rivalGoles = evRival.filter(e => e.accion === 'Remate - Gol').length;
      const rivalAtajados = evRival.filter(e => e.accion === 'Remate - Atajado').length;
      const xgRivalPartido = evRival.filter(e => (e.accion || '').includes('Remate')).reduce((s, e) => s + (calcularXGEvento(e) || 0), 0);

      jugadores.forEach(j => {
        const a = acc[String(j.id)];
        const sid = String(j.id);
        const mins = minsMap[sid] || 0;
        const citado = citadosSet.has(sid);
        const jugo = mins > 0;

        if (citado) a.citados++;
        if (!jugo) return; // no jugó este partido: no suma jugados/min/stats

        a.jugados++;
        a.minutos += mins;
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

        // arquero: acumula lo recibido en los partidos que jugó
        if (esArquero(j.posicion)) {
          a.golesRecibidos += rivalGoles;
          a.atajadas += rivalAtajados;
          a.xgRecibido += xgRivalPartido;
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
  }, [raw, partidosScopeCat, filtroTorneo, filtroCategoria, misCategorias]);

  /* ---------- columnas de la tabla de campo ---------- */
  const GRUPOS = { id: 'var(--text-dim)', part: '#3b82f6', of: '#00ff88', lu: '#0ea5e9', dis: '#fbbf24', imp: '#a855f7', arq: '#a855f7' };
  const GRUPO_LABEL = { id: 'IDENTIDAD', part: 'PARTICIPACIÓN', of: 'OFENSIVA', lu: 'DUELOS', dis: 'DISCIPLINA', imp: 'IMPACTO', arq: 'ARQUEROS' };
  const COLS = [
    { k: 'dorsal', t: '#', g: 'id', num: p => p.dorsal ?? 999, r: p => p.dorsal ?? '-' },
    { k: 'pos', t: 'POS', g: 'id', num: p => p.posicion || '', r: p => (p.posicion || '-').slice(0, 4) },
    { k: 'cat', t: 'CAT', g: 'id', num: p => p.categoria || '', r: p => p.categoria || '-' },
    { k: 'cit', t: 'CIT', g: 'part', num: p => p.citados, r: p => p.citados },
    { k: 'pj', t: 'PJ', g: 'part', num: p => p.jugados, r: p => p.jugados },
    { k: 'tit', t: 'TIT', g: 'part', num: p => p.titularidades, r: p => p.titularidades },
    { k: 'ing', t: 'ING', g: 'part', num: p => p.ingresos, r: p => p.ingresos },
    { k: 'min', t: 'MIN', g: 'part', num: p => p.minutos, r: p => p.minutos },
    { k: 'pmin', t: '%MIN', g: 'part', num: p => p.pctMin, r: p => p.citados ? p.pctMin.toFixed(0) + '%' : '-' },
    { k: 'g', t: 'G', g: 'of', num: p => p.goles, r: p => p.goles },
    { k: 'gpj', t: 'G/PJ', g: 'of', num: p => p.gPorPJ, r: p => p.jugados ? p.gPorPJ.toFixed(2) : '-' },
    { k: 'xg', t: 'xG', g: 'of', num: p => p.xg, r: p => p.xg.toFixed(1) },
    { k: 'gxg', t: 'G-xG', g: 'of', num: p => p.goles - p.xg, r: p => { const d = p.goles - p.xg; return (d > 0 ? '+' : '') + d.toFixed(1); } },
    { k: 'rem', t: 'REM', g: 'of', num: p => p.remates, r: p => p.remates },
    { k: 'arco', t: '%ARCO', g: 'of', num: p => p.pctArco, r: p => p.remates ? p.pctArco.toFixed(0) + '%' : '-' },
    { k: 'ocf', t: 'OC.F', g: 'of', num: p => p.ocasionesFalladas, r: p => p.ocasionesFalladas },
    { k: 'a', t: 'A', g: 'of', num: p => p.asistencias, r: p => p.asistencias },
    { k: 'apj', t: 'A/PJ', g: 'of', num: p => p.aPorPJ, r: p => p.jugados ? p.aPorPJ.toFixed(2) : '-' },
    { k: 'pc', t: 'PC', g: 'of', num: p => p.pasesClave, r: p => p.pasesClave },
    { k: 'rec', t: 'REC', g: 'lu', num: p => p.rec, r: p => p.rec },
    { k: 'perd', t: 'PERD', g: 'lu', num: p => p.perd, r: p => p.perd },
    { k: 'ofe', t: 'OFE%', g: 'lu', num: p => p.ofePct, r: p => p.duelOfeTot ? p.ofePct.toFixed(0) + '%' : '-' },
    { k: 'def', t: 'DEF%', g: 'lu', num: p => p.defPct, r: p => p.duelDefTot ? p.defPct.toFixed(0) + '%' : '-' },
    { k: 'ofei', t: 'OFE-i%', g: 'lu', num: p => p.ofeIndPct, r: p => p.duelOfeIndTot ? p.ofeIndPct.toFixed(0) + '%' : '-' },
    { k: 'defi', t: 'DEF-i%', g: 'lu', num: p => p.defIndPct, r: p => p.duelDefIndTot ? p.defIndPct.toFixed(0) + '%' : '-' },
    { k: 'fc', t: 'FC', g: 'dis', num: p => p.faltasCom, r: p => p.faltasCom },
    { k: 'fr', t: 'FR', g: 'dis', num: p => p.faltasRec, r: p => p.faltasRec },
    { k: 'am', t: '🟨', g: 'dis', num: p => p.amarillas, r: p => p.amarillas },
    { k: 'ro', t: '🟥', g: 'dis', num: p => p.rojas, r: p => p.rojas },
    { k: 'sanc', t: 'SANC', g: 'dis', num: p => p.sancPend, r: p => p.sancPend || '-' },
    { k: 'rat', t: 'RATING', g: 'imp', num: p => p.ratingProm, r: p => p.ratingCount ? p.ratingProm.toFixed(1) : '-' },
    { k: 'pm', t: '+/-', g: 'imp', num: p => p.pmProm, r: p => { const v = p.pmProm; return (v > 0 ? '+' : '') + v.toFixed(1); } },
  ];

  const COLS_ARQ = [
    { k: 'cit', t: 'CIT', g: 'part', r: p => p.citados },
    { k: 'pj', t: 'PJ', g: 'part', r: p => p.jugados },
    { k: 'min', t: 'MIN', g: 'part', r: p => p.minutos },
    { k: 'grec', t: 'G.REC', g: 'arq', r: p => p.golesRecibidos },
    { k: 'ataj', t: 'ATAJ', g: 'arq', r: p => p.atajadas },
    { k: 'pataj', t: '%ATAJ', g: 'arq', r: p => (p.atajadas + p.golesRecibidos) > 0 ? p.pctAtajadas.toFixed(0) + '%' : '-' },
    { k: 'xgrec', t: 'xG REC', g: 'arq', r: p => p.xgRecibido.toFixed(1) },
    { k: 'gevit', t: 'G.EVIT', g: 'arq', r: p => (p.golesEvitables > 0 ? '+' : '') + p.golesEvitables.toFixed(1) },
    { k: 'rat', t: 'RATING', g: 'imp', r: p => p.ratingCount ? p.ratingProm.toFixed(1) : '-' },
  ];

  // Corridas de grupos consecutivos -> colSpan de la fila de encabezado superior
  const grupoRuns = [];
  COLS.forEach(c => {
    const last = grupoRuns[grupoRuns.length - 1];
    if (last && last.g === c.g) last.span++;
    else grupoRuns.push({ g: c.g, span: 1 });
  });

  const ordenar = (lista) => {
    const col = COLS.find(c => c.k === sortKey);
    const fn = col ? col.num : (p => p.minutos);
    const arr = [...lista].sort((a, b) => {
      const va = fn(a), vb = fn(b);
      if (typeof va === 'string' || typeof vb === 'string') return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  };

  const aplicarFiltrosVista = (lista) => {
    let l = lista;
    if (soloConMinutos) l = l.filter(p => p.minutos > 0);
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      l = l.filter(p => `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase().includes(q));
    }
    return ordenar(l);
  };

  const filasCampo = useMemo(() => aplicarFiltrosVista(jugadoresProc), [jugadoresProc, sortKey, sortDir, soloConMinutos, busqueda]);
  const filasArqueros = useMemo(() => {
    let l = arquerosProc;
    if (soloConMinutos) l = l.filter(p => p.minutos > 0);
    if (busqueda.trim()) { const q = busqueda.trim().toLowerCase(); l = l.filter(p => `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase().includes(q)); }
    return [...l].sort((a, b) => b.minutos - a.minutos);
  }, [arquerosProc, soloConMinutos, busqueda]);

  /* ---------- destacados ---------- */
  const destacados = useMemo(() => {
    const conMin = jugadoresProc.filter(p => p.jugados > 0);
    if (conMin.length === 0) return [];
    const pick = (arr, fn) => [...arr].sort((a, b) => fn(b) - fn(a))[0];
    const d = [];
    const goleador = pick(conMin, p => p.goles);
    if (goleador && goleador.goles > 0) d.push({ ico: '⚽', t: 'GOLEADOR', n: goleador, v: `${goleador.goles} goles` });
    const minutos = pick(conMin, p => p.minutos);
    if (minutos) d.push({ ico: '⏱️', t: 'MÁS MINUTOS', n: minutos, v: `${minutos.minutos}'` });
    const asist = pick(conMin, p => p.asistencias);
    if (asist && asist.asistencias > 0) d.push({ ico: '🅰️', t: 'MÁS ASISTENCIAS', n: asist, v: `${asist.asistencias} asist.` });
    const muro = pick(conMin.filter(p => p.duelDefTot >= 5), p => p.defPct);
    if (muro) d.push({ ico: '🛡️', t: 'MURO DEFENSIVO', n: muro, v: `${muro.defPct.toFixed(0)}% duelos` });
    const fig = pick(conMin.filter(p => p.ratingCount >= 2), p => p.ratingProm);
    if (fig) d.push({ ico: '⭐', t: 'MEJOR RATING', n: fig, v: fig.ratingProm.toFixed(1) });
    return d.slice(0, 5);
  }, [jugadoresProc]);

  const setSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const nombreCompleto = (p) => `${p.apellido ? p.apellido.toUpperCase() : ''} ${p.nombre || ''}`.trim();
  const colorRating = (v) => v >= 7 ? '#00ff88' : v >= 6 ? 'var(--accent)' : v > 0 ? '#ef4444' : 'var(--text-dim)';

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Elegí un club para ver el resumen del plantel.</div>;

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1300px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '2.5rem' }}>📋</div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>RESUMEN DE PLANTEL</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Scouting interno · todo lo que captura el vivo, jugador por jugador.</div>
        </div>
      </div>

      {/* CONTROLES */}
      <div className="bento-card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>CATEGORÍA</div>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectStyle}>
            {!(misCategorias.length > 0 && misCategorias.length === 1) && <option value="Todas">TODAS LAS CATEGORÍAS</option>}
            {categoriasDisponibles.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>TORNEO</div>
          <select value={filtroTorneo} onChange={e => setFiltroTorneo(e.target.value)} style={selectStyle}>
            <option value="Todos">TODOS LOS TORNEOS</option>
            {torneosDisponibles.map(t => <option key={t.id} value={t.id}>{(t.nombre || 'TORNEO').toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <div className="stat-label" style={{ marginBottom: '8px' }}>BUSCAR JUGADOR</div>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Apellido o nombre..." style={inputIndustrial} />
        </div>
        <button onClick={() => setSoloConMinutos(v => !v)} className="btn-secondary" style={{ padding: '12px 16px', fontWeight: 800, fontSize: '0.8rem', borderColor: 'var(--border)', color: soloConMinutos ? 'var(--accent)' : 'var(--text-dim)' }}>
          {soloConMinutos ? '✓ ' : ''}SOLO CON MINUTOS
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>Procesando datos del plantel...</div>
      ) : (
        <>
          {/* DESTACADOS */}
          {destacados.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '25px' }}>
              {destacados.map((d, i) => (
                <div key={i} className="bento-card" style={{ padding: '14px', borderLeft: '3px solid var(--accent)' }}>
                  <div className="stat-label" style={{ fontSize: '0.6rem' }}>{d.ico} {d.t}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreCompleto(d.n)}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 800, fontFamily: MONO }}>{d.v}</div>
                </div>
              ))}
            </div>
          )}

          {/* TABLA DE CAMPO */}
          <TablaResponsive
            filas={filasCampo}
            columnas={COLS}
            colsClave={['rat', 'g', 'a', 'min']}
            grupos={GRUPOS}
            gruposLabel={GRUPO_LABEL}
            titulo="JUGADORES DE CAMPO"
            getId={(p) => p.id}
            getTitulo={(p) => nombreCompleto(p)}
            getSubtitulo={(p) => `${p.dorsal ?? '-'} · ${(p.posicion || 'S/P')} · ${p.categoria || ''}`}
            onRowClick={(p) => navigate('/jugador', { state: { jugadorId: p.id } })}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={setSort}
            renderBadges={(p) => (<>
              {filtroCategoria !== 'Todas' && p.categoria !== filtroCategoria && <span title={`Invitado desde ${p.categoria || '-'}`} style={{ fontSize: '0.55rem', background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>INV</span>}
              {p.aptoVencido && <span title="Apto vencido">⚠️</span>}
              {p.sancPend > 0 && <span title="Sancionado">⛔</span>}
            </>)}
            colorCelda={(p, col) => {
              if (col.k === 'rat') return colorRating(p.ratingProm);
              if (col.k === 'pm') return p.pmProm > 0 ? '#00ff88' : (p.pmProm < 0 ? '#ef4444' : 'var(--text)');
              if (col.k === 'gxg') return (p.goles - p.xg) >= 0 ? '#00ff88' : '#ef4444';
              if (['cit', 'pos', 'cat', 'perd'].includes(col.k)) return 'var(--text-dim)';
              if (col.g === 'imp' || col.g === 'of') return GRUPOS[col.g];
              return 'var(--text)';
            }}
          >
          <div className="bento-card" style={{ overflowX: 'auto', padding: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 6px 14px', flexWrap: 'wrap', gap: '10px' }}>
              <span className="stat-label" style={{ color: 'var(--accent)' }}>JUGADORES DE CAMPO ({filasCampo.length})</span>
              <button onClick={() => setMostrarGlosario(v => !v)} title="Qué significa cada columna"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: mostrarGlosario ? 'var(--accent)' : 'transparent', color: mostrarGlosario ? 'var(--bg)' : 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '5px 12px', cursor: 'pointer', fontWeight: 800, fontSize: '0.7rem' }}>
                <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: `1px solid ${mostrarGlosario ? 'var(--bg)' : 'var(--accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900 }}>!</span>
                {mostrarGlosario ? 'OCULTAR REFERENCIAS' : 'QUÉ SIGNIFICA CADA COLUMNA'}
              </button>
            </div>

            {mostrarGlosario && (
              <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
                {GLOSARIO.map(sec => (
                  <div key={sec.g}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 900, color: GRUPOS[sec.g] || '#a855f7', marginBottom: '7px', letterSpacing: '0.5px' }}>{GRUPO_LABEL[sec.g]}</div>
                    {sec.items.map(([a, d]) => (
                      <div key={a} style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', marginBottom: '4px' }}>
                        <span style={{ fontFamily: MONO, color: 'var(--text)', fontWeight: 800, minWidth: '54px', flexShrink: 0 }}>{a}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{d}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '1100px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th rowSpan={2} style={{ ...thSticky, textAlign: 'left', verticalAlign: 'bottom' }}>JUGADOR</th>
                  {grupoRuns.map((r, i) => (
                    <th key={i} colSpan={r.span} style={{ textAlign: 'center', padding: '7px 6px', fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.5px', color: GRUPOS[r.g], borderLeft: i > 0 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)' }}>
                      {GRUPO_LABEL[r.g]}
                    </th>
                  ))}
                </tr>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                  {COLS.map((c, i) => (
                    <th key={c.k} onClick={() => setSort(c.k)} title="Ordenar"
                      style={{ ...thBase, color: GRUPOS[c.g], background: sortKey === c.k ? 'var(--panel)' : 'var(--bg)', borderLeft: (i > 0 && COLS[i - 1].g !== c.g) ? '1px solid var(--border)' : 'none' }}>
                      {c.t}{sortKey === c.k ? (sortDir === 'desc' ? ' ▾' : ' ▴') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasCampo.length === 0 ? (
                  <tr><td colSpan={COLS.length + 1} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>No hay jugadores con esos filtros.</td></tr>
                ) : filasCampo.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdSticky }}>
                      <span onClick={() => navigate('/jugador', { state: { jugadorId: p.id } })}
                        style={{ cursor: 'pointer', color: '#3b82f6', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'var(--text-dim)', fontFamily: MONO, fontSize: '0.7rem' }}>{p.dorsal ?? '-'}</span>
                        {nombreCompleto(p)}
                        {filtroCategoria !== 'Todas' && p.categoria !== filtroCategoria && <span title={`Invitado desde ${p.categoria || '-'}`} style={{ fontSize: '0.55rem', background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>INV</span>}
                        {p.aptoVencido && <span title="Apto vencido">⚠️</span>}
                        {p.sancPend > 0 && <span title="Sancionado">⛔</span>}
                      </span>
                    </td>
                    {COLS.map(c => {
                      let color = 'var(--text)';
                      if (c.k === 'rat') color = colorRating(p.ratingProm);
                      else if (c.k === 'pm') color = p.pmProm > 0 ? '#00ff88' : (p.pmProm < 0 ? '#ef4444' : 'var(--text)');
                      else if (c.k === 'gxg') color = (p.goles - p.xg) >= 0 ? '#00ff88' : '#ef4444';
                      else if (['cit', 'pos', 'cat', 'perd'].includes(c.k)) color = 'var(--text-dim)';
                      else if (c.g === 'imp' || c.g === 'of') color = GRUPOS[c.g];
                      return <td key={c.k} style={{ ...tdBase, color, fontFamily: MONO }}>{c.r(p)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </TablaResponsive>

          {/* TABLA DE ARQUEROS */}
          {filasArqueros.length > 0 && (
            <TablaResponsive
              filas={filasArqueros}
              columnas={COLS_ARQ}
              colsClave={['rat', 'pataj', 'grec', 'ataj']}
              grupos={GRUPOS}
              gruposLabel={GRUPO_LABEL}
              titulo="🧤 ARQUEROS"
              getId={(p) => p.id}
              getTitulo={(p) => nombreCompleto(p)}
              getSubtitulo={(p) => `${p.dorsal ?? '-'} · ${(p.posicion || 'Arquero')}`}
              onRowClick={(p) => navigate('/jugador', { state: { jugadorId: p.id } })}
              colorCelda={(p, col) => {
                if (col.k === 'rat') return colorRating(p.ratingProm);
                if (col.k === 'grec') return '#ef4444';
                if (col.k === 'ataj') return '#00ff88';
                if (col.k === 'pataj') return '#0ea5e9';
                if (col.k === 'xgrec') return '#c084fc';
                if (col.k === 'gevit') return p.golesEvitables >= 0 ? '#00ff88' : '#ef4444';
                return 'var(--text)';
              }}
            >
            <div className="bento-card" style={{ overflowX: 'auto', padding: '10px', marginTop: '25px' }}>
              <div className="stat-label" style={{ padding: '8px 6px 14px', color: '#a855f7' }}>🧤 ARQUEROS ({filasArqueros.length})</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--text-dim)' }}>
                    <th style={{ ...thBase, textAlign: 'left' }}>ARQUERO</th>
                    <th style={thBase}>CIT</th><th style={thBase}>PJ</th><th style={thBase}>MIN</th>
                    <th style={{ ...thBase, color: '#ef4444' }}>G.REC</th>
                    <th style={{ ...thBase, color: '#00ff88' }}>ATAJ</th>
                    <th style={{ ...thBase, color: '#0ea5e9' }}>%ATAJ</th>
                    <th style={{ ...thBase, color: '#c084fc' }}>xG REC</th>
                    <th style={{ ...thBase, color: '#fbbf24' }}>G.EVIT</th>
                    <th style={{ ...thBase, color: '#a855f7' }}>RATING</th>
                  </tr>
                </thead>
                <tbody>
                  {filasArqueros.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdBase, textAlign: 'left' }}>
                        <span onClick={() => navigate('/jugador', { state: { jugadorId: p.id } })} style={{ cursor: 'pointer', color: '#3b82f6', fontWeight: 800 }}>
                          <span style={{ color: 'var(--text-dim)', fontFamily: MONO, fontSize: '0.7rem', marginRight: '6px' }}>{p.dorsal ?? '-'}</span>{nombreCompleto(p)}
                        </span>
                      </td>
                      <td style={{ ...tdBase, color: 'var(--text-dim)', fontFamily: MONO }}>{p.citados}</td>
                      <td style={{ ...tdBase, fontFamily: MONO }}>{p.jugados}</td>
                      <td style={{ ...tdBase, fontFamily: MONO }}>{p.minutos}</td>
                      <td style={{ ...tdBase, color: '#ef4444', fontFamily: MONO }}>{p.golesRecibidos}</td>
                      <td style={{ ...tdBase, color: '#00ff88', fontFamily: MONO }}>{p.atajadas}</td>
                      <td style={{ ...tdBase, color: '#0ea5e9', fontFamily: MONO }}>{(p.atajadas + p.golesRecibidos) > 0 ? p.pctAtajadas.toFixed(0) + '%' : '-'}</td>
                      <td style={{ ...tdBase, color: '#c084fc', fontFamily: MONO }}>{p.xgRecibido.toFixed(1)}</td>
                      <td style={{ ...tdBase, color: p.golesEvitables >= 0 ? '#00ff88' : '#ef4444', fontFamily: MONO }}>{(p.golesEvitables > 0 ? '+' : '') + p.golesEvitables.toFixed(1)}</td>
                      <td style={{ ...tdBase, color: colorRating(p.ratingProm), fontFamily: MONO, fontWeight: 900 }}>{p.ratingCount ? p.ratingProm.toFixed(1) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </TablaResponsive>
          )}

          <div style={{ marginTop: '15px', fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Tocá cualquier columna para ordenar · el botón <strong style={{ color: 'var(--accent)' }}>!</strong> de arriba explica qué significa cada una.
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- glosario de columnas (para el botón !) ---------- */
const GLOSARIO = [
  { g: 'id', items: [['#', 'Dorsal'], ['POS', 'Posición'], ['CAT', 'Categoría a la que pertenece']] },
  { g: 'part', items: [['CIT', 'Partidos en los que fue citado (está en la planilla)'], ['PJ', 'Partidos jugados (tuvo minutos)'], ['TIT', 'Veces que arrancó de titular'], ['ING', 'Veces que ingresó de cambio'], ['MIN', 'Minutos totales jugados'], ['%MIN', '% de minutos sobre los partidos disponibles (citados × 40′)']] },
  { g: 'of', items: [['G', 'Goles'], ['G/PJ', 'Goles por partido jugado'], ['xG', 'Goles esperados: la calidad de sus remates'], ['G-xG', 'Goles menos xG (+ define de más, − de menos)'], ['REM', 'Remates totales'], ['%ARCO', '% de remates que fueron al arco'], ['OC.F', 'Ocasiones falladas'], ['A', 'Asistencias'], ['A/PJ', 'Asistencias por partido jugado'], ['PC', 'Pases clave']] },
  { g: 'lu', items: [['REC', 'Recuperaciones'], ['PERD', 'Pérdidas'], ['OFE%', '% de duelos ofensivos ganados (con pelota)'], ['DEF%', '% de duelos defensivos ganados (con pelota)'], ['OFE-i%', '% de duelos ofensivos indirectos ganados (sin pelota)'], ['DEF-i%', '% de duelos defensivos indirectos ganados (sin pelota)']] },
  { g: 'dis', items: [['FC', 'Faltas cometidas'], ['FR', 'Faltas recibidas'], ['🟨', 'Tarjetas amarillas'], ['🟥', 'Tarjetas rojas'], ['SANC', 'Fechas de sanción pendientes']] },
  { g: 'imp', items: [['RATING', 'Rating promedio (motor de puntuación por partido)'], ['+/-', 'Diferencia de gol promedio con el jugador en cancha']] },
  { g: 'arq', items: [['G.REC', 'Goles recibidos'], ['ATAJ', 'Atajadas'], ['%ATAJ', '% de atajadas sobre remates al arco'], ['xG REC', 'xG recibido (peligro enfrentado)'], ['G.EVIT', 'Goles evitados: xG recibido − goles recibidos']] },
];

/* ---------- estilos ---------- */
const selectStyle = { padding: '10px 15px', fontSize: '1rem', background: 'var(--panel)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px', outline: 'none', fontWeight: 800, cursor: 'pointer', minWidth: '200px' };
const inputIndustrial = { width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' };
const thBase = { padding: '10px 8px', textAlign: 'center', fontSize: '0.66rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' };
const tdBase = { padding: '9px 8px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap' };
const thSticky = { padding: '10px 12px', fontSize: '0.66rem', fontWeight: 800, position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 2, minWidth: '170px', color: 'var(--text-dim)' };
const tdSticky = { padding: '9px 12px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--panel)', zIndex: 1, minWidth: '170px' };