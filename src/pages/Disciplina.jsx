import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { TablaResponsive } from '../components/TablaResponsive';

// ============================================================
// CONFIG
// ============================================================
// Umbral de amarillas que gatilla 1 fecha de suspensión en el torneo.
// (Reglamento típico AFA/ligas: cada 5 amarillas = 1 fecha → 5, 10, 15...)
const UMBRAL_AMARILLAS_DEFAULT = 5;

const ACC = {
  AMARILLA: 'Tarjeta Amarilla',
  ROJA: 'Tarjeta Roja',
  FALTA: 'Falta cometida',
  FALTA_VENTAJA: 'Falta cometida (Ventaja)',
  PENAL_CONTRA: 'Penal en contra',
};

const ACCIONES_DISCIPLINA = [
  ACC.AMARILLA, ACC.ROJA, ACC.FALTA, ACC.FALTA_VENTAJA, ACC.PENAL_CONTRA,
];

// ============================================================
// HELPERS
// ============================================================
// Muestra "Apellido, Nombre" (prioriza apellido)
const nombreJug = (j) => {
  if (!j) return 'Desconocido';
  const ap = (j.apellido || '').trim();
  const no = (j.nombre || '').trim();
  if (ap && no) return `${ap}, ${no}`;
  return ap || no || 'Sin nombre';
};
// Clave para ordenar alfabéticamente por apellido
const claveApellido = (j) => ((j?.apellido || j?.nombre || 'zzz')).toLowerCase();

// Temporada = año de la fecha. partido.fecha es texto ('2026-06-21' o '21/06/2026'),
// así que tomamos el primer grupo de 4 dígitos como año.
const temporadaDe = (fecha) => {
  if (!fecha) return null;
  const m = String(fecha).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
};
// Año de una sanción: por fecha_sancion, con created_at como respaldo (registros viejos sin fecha).
const sancAnio = (s) => temporadaDe(s?.fecha_sancion) || (s?.created_at ? new Date(s.created_at).getFullYear() : null);

// ============================================================
// COMPONENTE
// ============================================================
const GRUPOS_DISC = { gen: 'var(--text-dim)', dis: '#facc15' };
const GRUPOS_DISC_LABEL = { gen: 'GENERAL', dis: 'DISCIPLINA' };
const COLS_DISC = [
  { k: 'categoria', t: 'Cat.', g: 'gen', r: f => f.categoria },
  { k: 'amarillas', t: '🟨 Amar.', g: 'dis', r: f => f.amarillas },
  { k: 'rojas', t: '🟥 Rojas', g: 'dis', r: f => f.rojas },
  { k: 'faltas', t: 'Faltas', g: 'dis', r: f => f.faltas },
  { k: 'pj', t: 'PJ', g: 'gen', r: f => f.pj },
  { k: 'fpj', t: 'F/PJ', g: 'gen', r: f => f.faltasPorPartido.toFixed(1) },
  { k: 'fechas', t: 'Susp. 🟨', g: 'dis', r: f => `${f.suspPendientes}${f.suspCumplidas > 0 ? ' /' + f.suspGanadas : ''}` },
];

export default function Disciplina() {
  const { perfil } = useAuth();
  // Resolución de club igual que Inicio.jsx: el superuser no tiene club_id propio,
  // lo toma del localStorage ('club_id'); el modo kiosco usa el suyo.
  const esSuperUser = (perfil?.rol || '').toLowerCase() === 'superuser';
  const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
  const clubId = isKioscoMode
    ? localStorage.getItem('kiosco_club_id')
    : (esSuperUser ? localStorage.getItem('club_id') : perfil?.club_id) || '';

  const [cargando, setCargando] = useState(true);
  const [eventos, setEventos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [torneos, setTorneos] = useState([]);
  const [sanciones, setSanciones] = useState([]);

  // Filtros
  const [fCategoria, setFCategoria] = useState('');
  const [fTorneo, setFTorneo] = useState('');
  const [fTemporada, setFTemporada] = useState(String(new Date().getFullYear())); // '' = Histórico (todas)
  const [umbral, setUmbral] = useState(UMBRAL_AMARILLAS_DEFAULT);

  const fTemporadaNum = fTemporada === '' ? null : Number(fTemporada);

  // Ordenamiento de la tabla (por defecto: más sancionados primero)
  const [orden, setOrden] = useState({ key: 'sancion', dir: 'desc' });
  const cambiarOrden = (key) => {
    setOrden(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'apellido' ? 'asc' : 'desc' });
  };

  // UI
  const [jugadorDetalle, setJugadorDetalle] = useState(null);
  const [modalRoja, setModalRoja] = useState(null); // { evento, jugador, partido, sancion? }
  const [modalCarga, setModalCarga] = useState(false); // carga manual de tarjeta

  // ----------------------------------------------------------
  // CARGA
  // ----------------------------------------------------------
  const cargarTodo = useCallback(async () => {
    if (!clubId) { setCargando(false); return; }
    setCargando(true);

    // Lectura paginada de eventos disciplinarios (esquiva el tope de 1000 filas de Supabase)
    const cargarEventosDisciplina = async () => {
      const PAGE = 1000;
      let desde = 0, acumulado = [];
      while (true) {
        const { data, error } = await supabase.from('eventos')
          .select('id, id_jugador, accion, equipo, periodo, minuto, segundos, id_partido, etiqueta_tactica')
          .eq('club_id', clubId)
          .eq('equipo', 'Propio')
          .in('accion', ACCIONES_DISCIPLINA)
          .range(desde, desde + PAGE - 1);
        if (error || !data) break;
        acumulado = acumulado.concat(data);
        if (data.length < PAGE) break;
        desde += PAGE;
      }
      return acumulado;
    };

    const [evtData, jugRes, parRes, torRes, sanRes] = await Promise.all([
      cargarEventosDisciplina(),
      supabase.from('jugadores')
        .select('id, nombre, apellido, dorsal, foto, posicion, categoria')
        .eq('club_id', clubId),
      supabase.from('partidos')
        .select('id, rival, fecha, jornada, categoria, torneo_id, condicion, estado, plantilla')
        .eq('club_id', clubId),
      supabase.from('torneos')
        .select('id, nombre, categoria')
        .eq('club_id', clubId),
      supabase.from('disciplina_sanciones')
        .select('*')
        .eq('club_id', clubId),
    ]);

    setEventos(evtData || []);
    setJugadores(jugRes.data || []);
    setPartidos(parRes.data || []);
    setTorneos(torRes.data || []);
    setSanciones(sanRes.data || []);
    setCargando(false);
  }, [clubId]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  // ----------------------------------------------------------
  // MAPAS DE APOYO
  // ----------------------------------------------------------
  const mapJug = useMemo(() => {
    const m = new Map();
    jugadores.forEach(j => m.set(j.id, j));
    return m;
  }, [jugadores]);

  const mapPar = useMemo(() => {
    const m = new Map();
    partidos.forEach(p => m.set(p.id, p));
    return m;
  }, [partidos]);

  // Parseo robusto de la plantilla (puede venir como string JSON o ya como array)
  const plantillaIds = (p) => {
    try {
      const plantel = typeof p.plantilla === 'string' ? JSON.parse(p.plantilla) : p.plantilla;
      if (!Array.isArray(plantel)) return [];
      return plantel.map(x => x.id_jugador).filter(v => v != null);
    } catch { return []; }
  };

  // Temporadas disponibles (años presentes en los partidos), de la más reciente a la más vieja
  const temporadasDisponibles = useMemo(() => {
    const set = new Set(partidos.map(p => temporadaDe(p.fecha)).filter(Boolean));
    return [...set].sort((a, b) => b - a);
  }, [partidos]);

  // Si la temporada por defecto (año actual) no tiene datos, caemos a la más reciente disponible.
  // No tocamos la elección del usuario (incluido "Histórico" = '').
  useEffect(() => {
    if (temporadasDisponibles.length === 0) return;
    if (fTemporada !== '' && !temporadasDisponibles.includes(Number(fTemporada))) {
      setFTemporada(String(temporadasDisponibles[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temporadasDisponibles]);

  // Partidos que entran en el filtro actual (categoría / torneo / temporada)
  const partidosDelFiltro = useMemo(() => {
    return partidos.filter(p => {
      if (fCategoria && p.categoria !== fCategoria) return false;
      if (fTorneo && p.torneo_id !== fTorneo) return false;
      if (fTemporadaNum && temporadaDe(p.fecha) !== fTemporadaNum) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidos, fCategoria, fTorneo, fTemporada]);

  // PJ real por jugador+categoría: en cuántos partidos de cada categoría figura en la plantilla
  const pjPorJugadorCat = useMemo(() => {
    const m = new Map();
    partidosDelFiltro.forEach(p => {
      const cat = p.categoria || 'Sin categoría';
      plantillaIds(p).forEach(id => {
        const key = `${id}|${cat}`;
        m.set(key, (m.get(key) || 0) + 1);
      });
    });
    return m;
  }, [partidosDelFiltro]);

  // Categorías disponibles (de los partidos)
  const categorias = useMemo(() => {
    const set = new Set(partidos.map(p => p.categoria).filter(Boolean));
    return [...set].sort();
  }, [partidos]);

  // Torneos filtrados por categoría
  const torneosFiltrados = useMemo(() => {
    if (!fCategoria) return torneos;
    return torneos.filter(t => !t.categoria || t.categoria === fCategoria);
  }, [torneos, fCategoria]);

  // ----------------------------------------------------------
  // EVENTOS FILTRADOS (por categoría / torneo / temporada, vía partido)
  // ----------------------------------------------------------
  const eventosFiltrados = useMemo(() => {
    return eventos.filter(ev => {
      const par = mapPar.get(ev.id_partido);
      if (!par) return false;
      if (fCategoria && par.categoria !== fCategoria) return false;
      if (fTorneo && par.torneo_id !== fTorneo) return false;
      if (fTemporadaNum && temporadaDe(par.fecha) !== fTemporadaNum) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos, mapPar, fCategoria, fTorneo, fTemporada]);

  // ----------------------------------------------------------
  // AGREGADO POR JUGADOR + CATEGORÍA
  // (las amarillas se acumulan por categoría DENTRO de la temporada; la roja es transversal)
  // ----------------------------------------------------------
  const filas = useMemo(() => {
    const acc = new Map();

    const getRow = (id, cat) => {
      const key = `${id}|${cat}`;
      if (!acc.has(key)) {
        acc.set(key, {
          rowKey: key,
          jugadorId: id,
          categoria: cat,
          amarillas: 0, rojas: 0, faltas: 0,
          partidosSet: new Set(),
          eventosAmarilla: [], eventosRoja: [],
        });
      }
      return acc.get(key);
    };

    eventosFiltrados.forEach(ev => {
      if (!ev.id_jugador) return; // faltas de ventaja / equipo no cuentan a individual
      const par = mapPar.get(ev.id_partido);
      const cat = (par?.categoria) || 'Sin categoría';
      const r = getRow(ev.id_jugador, cat);
      r.partidosSet.add(ev.id_partido);
      if (ev.accion === ACC.AMARILLA) { r.amarillas++; r.eventosAmarilla.push(ev); }
      else if (ev.accion === ACC.ROJA) { r.rojas++; r.eventosRoja.push(ev); }
      else if (ev.accion === ACC.FALTA || ev.accion === ACC.PENAL_CONTRA) { r.faltas++; }
    });

    // Fechas de roja por jugador, TRANSVERSAL (solo sanciones de roja, NO las de acumulación).
    // La roja NO resetea por temporada: arrastra hasta cumplirse.
    const fechasRojaPorJugador = new Map();
    // Suspensiones de acumulación ya dadas de baja, por jugador+categoría, DENTRO de la temporada.
    const bajasAcumPorJugCat = new Map();
    sanciones.forEach(s => {
      if (s.tipo === 'acumulacion') {
        // Las bajas de acumulación se cuentan dentro de su temporada (deriva de fecha_sancion / created_at)
        if (fTemporadaNum && sancAnio(s) !== fTemporadaNum) return;
        const key = `${s.jugador_id}|${s.categoria || 'Sin categoría'}`;
        bajasAcumPorJugCat.set(key, (bajasAcumPorJugCat.get(key) || 0) + 1);
        return;
      }
      const total = (s.fechas_tribunal || 0) + (s.fechas_internas || 0);
      const rest = Math.max(0, total - (s.fechas_cumplidas || 0));
      fechasRojaPorJugador.set(s.jugador_id, (fechasRojaPorJugador.get(s.jugador_id) || 0) + rest);
    });

    return [...acc.values()].map(r => {
      const j = mapJug.get(r.jugadorId);
      const pj = pjPorJugadorCat.get(`${r.jugadorId}|${r.categoria}`) || 0; // PJ en esa categoría
      const partidosConEvento = r.partidosSet.size;
      // Acumulación de amarillas POR CATEGORÍA (dentro de la temporada filtrada)
      const suspGanadas = Math.floor(r.amarillas / umbral);       // fechas que otorgó la acumulación
      const suspCumplidas = bajasAcumPorJugCat.get(`${r.jugadorId}|${r.categoria}`) || 0; // dadas de baja
      const suspPendientes = Math.max(0, suspGanadas - suspCumplidas);
      const restanProxima = r.amarillas === 0 ? umbral : umbral - (r.amarillas % umbral || umbral);
      const suspendidoActivo = suspPendientes > 0;
      const alBorde = r.amarillas > 0 && (r.amarillas % umbral) === umbral - 1;
      // Roja: suspensión transversal del jugador (inhabilita en TODAS las categorías)
      const fechasRojaJugador = fechasRojaPorJugador.get(r.jugadorId) || 0;
      const tieneRojaActiva = fechasRojaJugador > 0;
      return {
        ...r,
        jugador: j,
        nombre: nombreJug(j),
        apellidoKey: claveApellido(j),
        dorsal: j?.dorsal ?? '-',
        pj,
        partidosConEvento,
        faltasPorPartido: pj ? (r.faltas / pj) : 0,
        suspGanadas,
        suspCumplidas,
        suspPendientes,
        suspendidoActivo,
        fechasRojaJugador,
        tieneRojaActiva,
        restanProxima,
        alBorde,
      };
    }).sort((a, b) => {
      const { key, dir } = orden;
      const mult = dir === 'asc' ? 1 : -1;
      if (key === 'apellido') return (a.apellidoKey.localeCompare(b.apellidoKey) || a.categoria.localeCompare(b.categoria)) * mult;
      if (key === 'categoria') return (a.categoria.localeCompare(b.categoria) || a.apellidoKey.localeCompare(b.apellidoKey)) * mult;
      if (key === 'dorsal') return ((Number(a.dorsal) || 999) - (Number(b.dorsal) || 999)) * mult;
      if (key === 'amarillas') return (a.amarillas - b.amarillas) * mult;
      if (key === 'rojas') return (a.rojas - b.rojas) * mult;
      if (key === 'faltas') return (a.faltas - b.faltas) * mult;
      if (key === 'pj') return (a.pj - b.pj) * mult;
      if (key === 'fpj') return (a.faltasPorPartido - b.faltasPorPartido) * mult;
      if (key === 'fechas') return (a.suspPendientes - b.suspPendientes) * mult;
      // 'sancion' (default): más sancionados primero, desempates encadenados
      if (b.rojas !== a.rojas) return b.rojas - a.rojas;
      if (b.amarillas !== a.amarillas) return b.amarillas - a.amarillas;
      return b.faltas - a.faltas;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventosFiltrados, mapJug, mapPar, umbral, sanciones, orden, pjPorJugadorCat, fTemporada]);

  // ----------------------------------------------------------
  // ALERTAS DE SUSPENSIÓN
  // ----------------------------------------------------------
  const alertas = useMemo(() => {
    const suspendidos = filas.filter(f => f.suspendidoActivo);
    const alBorde = filas.filter(f => f.alBorde && !f.suspendidoActivo);
    return { suspendidos, alBorde };
  }, [filas]);

  // KPIs
  const kpis = useMemo(() => {
    const totAmar = filas.reduce((a, f) => a + f.amarillas, 0);
    const totRoja = filas.reduce((a, f) => a + f.rojas, 0);
    const totFaltas = filas.reduce((a, f) => a + f.faltas, 0);
    // Independiente del orden elegido en la tabla: el de más rojas, luego amarillas, luego faltas
    const masSancionado = [...filas].sort((a, b) => {
      if (b.rojas !== a.rojas) return b.rojas - a.rojas;
      if (b.amarillas !== a.amarillas) return b.amarillas - a.amarillas;
      return b.faltas - a.faltas;
    })[0];
    return { totAmar, totRoja, totFaltas, masSancionado };
  }, [filas]);

  // ----------------------------------------------------------
  // ROJAS PENDIENTES DE CARGAR (eventos roja sin sanción asociada)
  // ----------------------------------------------------------
  const rojasDetectadas = useMemo(() => {
    const lista = [];
    eventosFiltrados.forEach(ev => {
      if (ev.accion !== ACC.ROJA || !ev.id_jugador) return;
      const sancion = sanciones.find(s => s.evento_id === ev.id);
      lista.push({
        evento: ev,
        jugador: mapJug.get(ev.id_jugador),
        partido: mapPar.get(ev.id_partido),
        sancion,
      });
    });
    return lista;
  }, [eventosFiltrados, sanciones, mapJug, mapPar]);

  // ----------------------------------------------------------
  // HISTORIAL INTERANUAL (todas las temporadas, todas las categorías)
  // Se calcula sobre el universo completo de eventos del club, sin importar el filtro.
  // ----------------------------------------------------------
  const historialInteranual = (jugadorId) => {
    const porAnio = {}; // anio => { anio, amarillas, rojas, faltas, catAmar:{cat:n} }
    eventos.forEach(ev => {
      if (String(ev.id_jugador) !== String(jugadorId)) return;
      const par = mapPar.get(ev.id_partido);
      const anio = temporadaDe(par?.fecha);
      if (!anio) return;
      if (!porAnio[anio]) porAnio[anio] = { anio, amarillas: 0, rojas: 0, faltas: 0, catAmar: {} };
      const r = porAnio[anio];
      const cat = par?.categoria || 'Sin categoría';
      if (ev.accion === ACC.AMARILLA) { r.amarillas++; r.catAmar[cat] = (r.catAmar[cat] || 0) + 1; }
      else if (ev.accion === ACC.ROJA) r.rojas++;
      else if (ev.accion === ACC.FALTA || ev.accion === ACC.PENAL_CONTRA) r.faltas++;
    });
    return Object.values(porAnio)
      .map(r => ({
        ...r,
        // Suspensiones por acumulación que generó ese año (por categoría, con el umbral actual)
        suspAcum: Object.values(r.catAmar).reduce((a, n) => a + Math.floor(n / umbral), 0),
      }))
      .sort((a, b) => b.anio - a.anio);
  };

  // ----------------------------------------------------------
  // GUARDAR SANCIÓN DE ROJA
  // ----------------------------------------------------------
  const guardarSancion = async (form) => {
    const { evento, jugador, partido, fechas_tribunal, fechas_internas, motivo, notas, sancionId } = form;
    const payload = {
      club_id: clubId,
      jugador_id: jugador?.id ?? null,
      evento_id: evento?.id ?? null,
      partido_id: partido?.id ?? null,
      torneo_id: partido?.torneo_id ?? null,
      tipo: 'roja_directa',
      fechas_tribunal: parseInt(fechas_tribunal, 10) || 0,
      fechas_internas: parseInt(fechas_internas, 10) || 0,
      motivo: motivo || null,
      notas: notas || null,
    };

    let res;
    if (sancionId) {
      res = await supabase.from('disciplina_sanciones').update(payload).eq('id', sancionId).select();
    } else {
      res = await supabase.from('disciplina_sanciones').insert([payload]).select();
    }
    if (!res.error) {
      setModalRoja(null);
      cargarTodo();
    }
  };

  // Marca la sanción de roja como cumplida por completo (restantes 0)
  const saldarSancion = async (sancion) => {
    const total = (sancion.fechas_tribunal || 0) + (sancion.fechas_internas || 0);
    const { error } = await supabase.from('disciplina_sanciones')
      .update({ fechas_cumplidas: total, estado: 'cumplida' })
      .eq('id', sancion.id);
    if (!error) cargarTodo();
  };

  // Suma o resta una fecha cumplida a una sanción de roja (clamp 0..total)
  const ajustarCumplidasRoja = async (sancion, delta) => {
    const total = (sancion.fechas_tribunal || 0) + (sancion.fechas_internas || 0);
    const nuevas = Math.max(0, Math.min(total, (sancion.fechas_cumplidas || 0) + delta));
    const estado = nuevas === 0 ? 'pendiente' : (nuevas >= total ? 'cumplida' : 'cumpliendo');
    const { error } = await supabase.from('disciplina_sanciones')
      .update({ fechas_cumplidas: nuevas, estado })
      .eq('id', sancion.id);
    if (!error) cargarTodo();
  };

  // Borra el registro de sanción por completo
  const eliminarSancion = async (sancion) => {
    const { error } = await supabase.from('disciplina_sanciones').delete().eq('id', sancion.id);
    if (!error) cargarTodo();
  };

  // Da de baja UNA fecha de suspensión por acumulación de amarillas (la materializa como cumplida)
  const darDeBajaAmarillas = async (fila) => {
    const nivel = (fila.suspCumplidas + 1) * umbral; // corte: 5, 10, 15...
    // La baja se atribuye a la temporada que estás viendo (para que el reset anual sea correcto).
    const anioBaja = fTemporadaNum || new Date().getFullYear();
    const payload = {
      club_id: clubId,
      jugador_id: fila.jugadorId,
      tipo: 'acumulacion',
      categoria: fila.categoria,
      nivel,
      torneo_id: fTorneo || null,
      fecha_sancion: `${anioBaja}-12-31`,
      fechas_tribunal: 1,
      fechas_internas: 0,
      fechas_cumplidas: 1,
      estado: 'cumplida',
      motivo: `Acumulación ${nivel} amarillas · ${fila.categoria} · ${anioBaja}`,
    };
    const { error } = await supabase.from('disciplina_sanciones').insert([payload]);
    if (!error) cargarTodo();
  };

  // Revierte la última baja de acumulación de amarillas de ese jugador+categoría (en la temporada vista)
  const revertirBajaAmarillas = async (fila) => {
    const candidatas = sanciones
      .filter(s => s.tipo === 'acumulacion'
        && s.jugador_id === fila.jugadorId
        && (s.categoria || 'Sin categoría') === fila.categoria
        && (!fTemporadaNum || sancAnio(s) === fTemporadaNum))
      .sort((a, b) => (b.nivel || 0) - (a.nivel || 0));
    if (candidatas.length === 0) return;
    const { error } = await supabase.from('disciplina_sanciones').delete().eq('id', candidatas[0].id);
    if (!error) cargarTodo();
  };

  // Inserta una tarjeta que no se registró en vivo (mismo formato que TomaDatos)
  const cargarTarjetaManual = async (form) => {
    const { jugadorId, tipo, partidoId, periodo, minuto } = form;
    if (!jugadorId || !partidoId) return;
    const payload = {
      club_id: clubId,
      id_partido: partidoId,
      id_jugador: parseInt(jugadorId, 10),
      accion: tipo, // 'Tarjeta Amarilla' | 'Tarjeta Roja'
      equipo: 'Propio',
      periodo: periodo || null,
      minuto: minuto !== '' && minuto != null ? parseInt(minuto, 10) : null,
      etiqueta_tactica: 'carga_manual', // marca para distinguir cargas hechas desde Disciplina
    };
    const { error } = await supabase.from('eventos').insert([payload]);
    if (!error) {
      setModalCarga(false);
      cargarTodo();
    }
  };

  // Borra una tarjeta puntual (para corregir un conteo equivocado)
  const borrarTarjeta = async (eventoId) => {
    if (!window.confirm('¿Borrar esta tarjeta? Esta acción no se puede deshacer.')) return;
    const { error } = await supabase.from('eventos').delete().eq('id', eventoId);
    if (!error) { setJugadorDetalle(null); cargarTodo(); }
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (cargando) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Cargando disciplina…</div>;
  }

  if (!clubId) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>No hay un club activo seleccionado.</div>;
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto', animation: 'fadeIn 0.3s', paddingBottom: 100 }}>
      {/* HEADER */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: 'var(--text)', fontSize: '1.6rem', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🟨🟥</span> DISCIPLINA
          </h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0', fontSize: '0.85rem' }}>
            Tarjetas, faltas y suspensiones del plantel
          </p>
        </div>
        <button onClick={() => setModalCarga(true)} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Cargar tarjeta
        </button>
      </div>

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <select value={fTemporada} onChange={e => setFTemporada(e.target.value)} style={{ ...selectStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}>
          <option value="">📅 Histórico (todas)</option>
          {temporadasDisponibles.map(a => <option key={a} value={String(a)}>Temporada {a}</option>)}
        </select>
        <select value={fCategoria} onChange={e => { setFCategoria(e.target.value); setFTorneo(''); }} style={selectStyle}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fTorneo} onChange={e => setFTorneo(e.target.value)} style={selectStyle}>
          <option value="">Todos los torneos</option>
          {torneosFiltrados.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Amarillas / fecha</span>
          <input type="number" min={1} value={umbral} onChange={e => setUmbral(Math.max(1, parseInt(e.target.value, 10) || 1))}
            style={{ width: 44, background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem' }} />
        </div>
      </div>

      {/* AVISO TEMPORADA */}
      <div style={{ marginBottom: 16, fontSize: '0.72rem', color: '#777' }}>
        {fTemporadaNum
          ? <>Mostrando la <b style={{ color: 'var(--accent)' }}>temporada {fTemporadaNum}</b>. Las amarillas se acumulan dentro del año; las rojas del tribunal arrastran hasta cumplirse. Abrí un jugador para ver su evolución interanual.</>
          : <>Mostrando el <b style={{ color: 'var(--accent)' }}>histórico completo</b> (todas las temporadas sumadas). Elegí una temporada para ver la acumulación que corre de verdad.</>}
      </div>

      {/* ALERTAS DE SUSPENSIÓN */}
      {(alertas.suspendidos.length > 0 || alertas.alBorde.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {alertas.suspendidos.map(f => (
            <div key={`s-${f.rowKey}`} style={alertaStyle('#991b1b', '#ef4444')}>
              <span style={{ fontSize: '1.3rem' }}>🚫</span>
              <div>
                <strong style={{ color: 'var(--text)' }}>{f.nombre}</strong> ({f.categoria}) alcanzó <b style={{ color: '#fca5a5' }}>{f.amarillas} amarillas</b> → SUSPENDIDO 1 fecha en {f.categoria}.
              </div>
            </div>
          ))}
          {alertas.alBorde.map(f => (
            <div key={`b-${f.rowKey}`} style={alertaStyle('#78350f', '#f59e0b')}>
              <span style={{ fontSize: '1.3rem' }}>⚠️</span>
              <div>
                <strong style={{ color: 'var(--text)' }}>{f.nombre}</strong> ({f.categoria}) tiene <b style={{ color: '#fcd34d' }}>{f.amarillas} amarillas</b> en {f.categoria} — a <b>1 de la suspensión</b> (próximo corte en {Math.ceil((f.amarillas + 1) / umbral) * umbral}).
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 22 }}>
        <KPI label="Amarillas" valor={kpis.totAmar} color="#facc15" />
        <KPI label="Rojas" valor={kpis.totRoja} color="#ef4444" />
        <KPI label="Faltas cometidas" valor={kpis.totFaltas} color="#ec4899" />
        <KPI label="Más sancionado" valor={kpis.masSancionado ? (kpis.masSancionado.jugador?.apellido || kpis.masSancionado.nombre) : '-'} color="var(--accent)" small />
      </div>

      {/* TABLA RANKING */}
      <div style={cardStyle}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 900, letterSpacing: 1, marginBottom: 12 }}>
          RANKING DISCIPLINARIO
        </div>
        {filas.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 30, fontSize: '0.9rem' }}>
            Sin registros disciplinarios para este filtro.
          </div>
        ) : (
          <TablaResponsive
            filas={filas}
            columnas={COLS_DISC}
            colsClave={['amarillas', 'rojas', 'faltas', 'fechas']}
            grupos={GRUPOS_DISC}
            gruposLabel={GRUPOS_DISC_LABEL}
            getId={(f) => f.rowKey}
            getTitulo={(f) => f.nombre}
            getSubtitulo={(f) => `${f.dorsal ?? '-'} · ${f.categoria}`}
            onRowClick={(f) => setJugadorDetalle(f)}
            sortKey={orden.key}
            sortDir={orden.dir}
            onSort={cambiarOrden}
            renderBadges={(f) => (<>
              {f.suspendidoActivo ? <Badge color="#ef4444" texto="SUSPENDIDO" /> : (f.alBorde ? <Badge color="#f59e0b" texto="AL BORDE" /> : null)}
              {f.tieneRojaActiva && <Badge color="#ef4444" texto={`🟥 INHAB. ${f.fechasRojaJugador}f`} />}
            </>)}
            colorCelda={(f, col) => {
              if (col.k === 'amarillas') return f.amarillas ? '#facc15' : '#444';
              if (col.k === 'rojas') return f.rojas ? '#ef4444' : '#444';
              if (col.k === 'faltas') return '#ec4899';
              if (col.k === 'fechas') return f.suspPendientes ? '#fff' : '#444';
              return 'var(--text-dim)';
            }}
          >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-dim)', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  <Th label="#" k="dorsal" orden={orden} onSort={cambiarOrden} />
                  <Th label="Jugador" k="apellido" orden={orden} onSort={cambiarOrden} />
                  <Th label="Cat." k="categoria" orden={orden} onSort={cambiarOrden} />
                  <Th label="🟨" k="amarillas" orden={orden} onSort={cambiarOrden} center />
                  <Th label="🟥" k="rojas" orden={orden} onSort={cambiarOrden} center />
                  <Th label="Faltas" k="faltas" orden={orden} onSort={cambiarOrden} center />
                  <Th label="PJ" k="pj" orden={orden} onSort={cambiarOrden} center />
                  <Th label="F/PJ" k="fpj" orden={orden} onSort={cambiarOrden} center />
                  <Th label="Susp. 🟨" k="fechas" orden={orden} onSort={cambiarOrden} center />
                  <th style={thCenter}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.rowKey}
                    onClick={() => setJugadorDetalle(f)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: f.suspendidoActivo ? 'rgba(239,68,68,0.06)' : f.alBorde ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                    <td style={{ ...tdStyle, color: '#555', fontFamily: 'JetBrains Mono, monospace' }}>{f.dorsal}</td>
                    <td style={{ ...tdStyle, color: 'var(--text)', fontWeight: 700 }}>{f.nombre}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{f.categoria}</td>
                    <td style={{ ...tdNum, color: f.amarillas ? '#facc15' : '#444' }}>{f.amarillas}</td>
                    <td style={{ ...tdNum, color: f.rojas ? '#ef4444' : '#444' }}>{f.rojas}</td>
                    <td style={{ ...tdNum, color: '#ec4899' }}>{f.faltas}</td>
                    <td style={{ ...tdNum, color: 'var(--text-dim)' }}>{f.pj}</td>
                    <td style={{ ...tdNum, color: 'var(--text-dim)' }}>{f.faltasPorPartido.toFixed(1)}</td>
                    <td style={{ ...tdNum, color: f.suspPendientes ? '#fff' : '#444', fontWeight: 900 }}>
                      {f.suspPendientes}{f.suspCumplidas > 0 ? <span style={{ color: '#555', fontWeight: 400, fontSize: '0.7rem' }}> /{f.suspGanadas}</span> : ''}
                    </td>
                    <td style={tdCenter}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        {f.suspendidoActivo
                          ? <Badge color="#ef4444" texto="SUSPENDIDO" />
                          : f.alBorde
                            ? <Badge color="#f59e0b" texto="AL BORDE" />
                            : (!f.tieneRojaActiva && <span style={{ color: '#444', fontSize: '0.7rem' }}>—</span>)}
                        {f.tieneRojaActiva && <Badge color="#ef4444" texto={`🟥 INHAB. ${f.fechasRojaJugador}f`} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </TablaResponsive>
        )}
      </div>

      {/* ROJAS / TRIBUNAL */}
      <div style={{ ...cardStyle, marginTop: 18 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 900, letterSpacing: 1, marginBottom: 4 }}>
          ROJAS Y TRIBUNAL DE DISCIPLINA
        </div>
        <div style={{ fontSize: '0.72rem', color: '#777', marginBottom: 12 }}>
          La suspensión por roja inhabilita al jugador en <b>todas las categorías</b>, sin importar dónde recibió la tarjeta.
        </div>
        {rojasDetectadas.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 24, fontSize: '0.85rem' }}>
            No hay expulsiones registradas en este filtro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rojasDetectadas.map((r, i) => {
              const total = (r.sancion?.fechas_tribunal || 0) + (r.sancion?.fechas_internas || 0);
              const cumplidas = r.sancion?.fechas_cumplidas || 0;
              const restantes = Math.max(0, total - cumplidas);
              const saldada = r.sancion && restantes === 0;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#0d0d0d', border: `1px solid ${saldada ? '#1f3a1f' : 'var(--border)'}`, borderRadius: 8, padding: '12px 14px', opacity: saldada ? 0.7 : 1 }}>
                  <div>
                    <div style={{ color: 'var(--text)', fontWeight: 700 }}>🟥 {nombreJug(r.jugador)}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                      vs {r.partido?.rival || '—'} · {r.partido?.fecha || ''} {r.evento?.minuto != null ? `· min ${r.evento.minuto}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {r.sancion ? (
                      <div style={{ textAlign: 'right' }}>
                        {saldada ? (
                          <div style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '0.8rem' }}>✓ CUMPLIDA</div>
                        ) : (
                          <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: '0.8rem' }}>
                            Sanción: {total} · Cumplido: {cumplidas} · <span style={{ color: '#fca5a5' }}>restan {restantes}</span>
                          </div>
                        )}
                        <div style={{ color: '#666', fontSize: '0.65rem' }}>
                          Trib. {r.sancion.fechas_tribunal} + Int. {r.sancion.fechas_internas}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#f59e0b', fontSize: '0.7rem', fontWeight: 700 }}>SIN CARGAR</span>
                    )}

                    {/* Descuento fecha a fecha */}
                    {r.sancion && total > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => ajustarCumplidasRoja(r.sancion, -1)} disabled={cumplidas <= 0}
                          style={{ ...btnMini, padding: '6px 10px', opacity: cumplidas <= 0 ? 0.4 : 1 }} title="Quitar una fecha cumplida">−</button>
                        <button onClick={() => ajustarCumplidasRoja(r.sancion, +1)} disabled={restantes <= 0}
                          style={{ ...btnMini, padding: '6px 10px', borderColor: 'var(--accent)', color: 'var(--accent)', opacity: restantes <= 0 ? 0.4 : 1 }} title="Marcar una fecha como cumplida">+ fecha</button>
                      </div>
                    )}

                    <button onClick={() => setModalRoja(r)} style={btnMini}>
                      {r.sancion ? 'Editar' : 'Cargar fechas'}
                    </button>
                    {r.sancion && !saldada && total > 0 && (
                      <button onClick={() => saldarSancion(r.sancion)} style={{ ...btnMini, borderColor: 'var(--accent)', color: 'var(--accent)' }} title="Marcar toda la sanción como cumplida">
                        ✓ Saldar todo
                      </button>
                    )}
                    {r.sancion && (
                      <button onClick={() => eliminarSancion(r.sancion)} style={{ ...btnMini, borderColor: '#5a1a1a', color: '#ef4444' }} title="Borrar registro de sanción">
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DETALLE JUGADOR */}
      {jugadorDetalle && (
        <Overlay onClose={() => setJugadorDetalle(null)}>
          <h2 style={{ color: 'var(--text)', margin: '0 0 4px' }}>{jugadorDetalle.nombre} <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', fontWeight: 400 }}>· {jugadorDetalle.categoria}</span></h2>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 16 }}>
            {fTemporadaNum ? `Temporada ${fTemporadaNum}: ` : 'Histórico: '}
            {jugadorDetalle.amarillas} 🟨 · {jugadorDetalle.rojas} 🟥 · {jugadorDetalle.faltas} faltas en {jugadorDetalle.pj} PJ
          </div>
          {(jugadorDetalle.suspGanadas > 0 || jugadorDetalle.tieneRojaActiva) && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid #991b1b', borderRadius: 8, padding: 12, marginBottom: 16, color: '#fca5a5', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jugadorDetalle.suspGanadas > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    Por amarillas en <b>{jugadorDetalle.categoria}</b>: Sanción {jugadorDetalle.suspGanadas} · Cumplido {jugadorDetalle.suspCumplidas} · <b style={{ color: jugadorDetalle.suspPendientes ? '#fca5a5' : 'var(--accent)' }}>restan {jugadorDetalle.suspPendientes}</b>
                    <div style={{ color: '#977', fontSize: '0.7rem' }}>Solo afecta a esta categoría{fTemporadaNum ? ` · temporada ${fTemporadaNum}` : ''}.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {jugadorDetalle.suspCumplidas > 0 && (
                      <button onClick={() => revertirBajaAmarillas(jugadorDetalle)} style={{ ...btnMini, padding: '6px 10px' }} title="Revertir la última baja">↶</button>
                    )}
                    {jugadorDetalle.suspPendientes > 0 && (
                      <button onClick={() => darDeBajaAmarillas(jugadorDetalle)} style={{ ...btnMini, borderColor: 'var(--accent)', color: 'var(--accent)' }} title="Cumplió una fecha de la acumulación">✓ Dar de baja 1 fecha</button>
                    )}
                  </div>
                </div>
              )}
              {jugadorDetalle.tieneRojaActiva && (
                <div style={{ borderTop: jugadorDetalle.suspGanadas > 0 ? '1px solid #5a1a1a' : 'none', paddingTop: jugadorDetalle.suspGanadas > 0 ? 8 : 0 }}>
                  Por roja: <b>{jugadorDetalle.fechasRojaJugador} fecha(s)</b> pendientes — inhabilita en <b>todas las categorías</b>. <span style={{ color: '#977' }}>(Se descuenta desde el panel de Rojas.)</span>
                </div>
              )}
            </div>
          )}

          {/* EVOLUCIÓN INTERANUAL */}
          {(() => {
            const hist = historialInteranual(jugadorDetalle.jugadorId);
            if (hist.length === 0) return null;
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 900, marginBottom: 8 }}>EVOLUCIÓN INTERANUAL</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hist.map(h => {
                    const esActual = fTemporadaNum && h.anio === fTemporadaNum;
                    return (
                      <div key={h.anio} style={{ display: 'flex', alignItems: 'center', gap: 12, background: esActual ? 'rgba(0,230,118,0.06)' : '#0d0d0d', border: `1px solid ${esActual ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '8px 12px' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 900, color: esActual ? 'var(--accent)' : '#fff', width: 46, flexShrink: 0 }}>{h.anio}</span>
                        <span style={{ color: h.amarillas ? '#facc15' : '#444', fontWeight: 700, fontSize: '0.85rem' }}>{h.amarillas} 🟨</span>
                        <span style={{ color: h.rojas ? '#ef4444' : '#444', fontWeight: 700, fontSize: '0.85rem' }}>{h.rojas} 🟥</span>
                        <span style={{ color: '#ec4899', fontWeight: 700, fontSize: '0.85rem' }}>{h.faltas} faltas</span>
                        {h.suspAcum > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid #5a1a1a', borderRadius: 4, padding: '2px 6px', fontWeight: 800, whiteSpace: 'nowrap' }}>{h.suspAcum} susp. 🟨</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#666', marginTop: 6 }}>Acumulado por temporada, todas las categorías. La fila resaltada es la temporada que estás viendo.</div>
              </div>
            );
          })()}

          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 900, marginBottom: 8 }}>
            HISTORIAL DE TARJETAS · {jugadorDetalle.categoria}{fTemporadaNum ? ` · ${fTemporadaNum}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...jugadorDetalle.eventosAmarilla, ...jugadorDetalle.eventosRoja]
              .sort((a, b) => (a.minuto || 0) - (b.minuto || 0))
              .map((ev, i) => {
                const par = mapPar.get(ev.id_partido);
                const esRoja = ev.accion === ACC.ROJA;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: '#ccc' }}>
                    <span>{esRoja ? '🟥' : '🟨'}</span>
                    <span style={{ color: 'var(--text)' }}>vs {par?.rival || '—'}</span>
                    <span style={{ color: '#666', flex: 1 }}>{par?.fecha || ''} · {ev.periodo || ''} {ev.minuto != null ? `min ${ev.minuto}` : ''}{ev.etiqueta_tactica === 'carga_manual' ? ' · manual' : ''}</span>
                    <button onClick={() => borrarTarjeta(ev.id)} title="Borrar esta tarjeta" style={{ background: 'transparent', border: '1px solid #5a1a1a', color: '#ef4444', borderRadius: 4, padding: '2px 7px', fontSize: '0.7rem', cursor: 'pointer' }}>🗑</button>
                  </div>
                );
              })}
            {jugadorDetalle.eventosAmarilla.length === 0 && jugadorDetalle.eventosRoja.length === 0 && (
              <span style={{ color: '#555', fontSize: '0.8rem' }}>Sin tarjetas en este filtro.</span>
            )}
          </div>
        </Overlay>
      )}

      {/* MODAL CARGA ROJA */}
      {modalRoja && (
        <ModalRoja
          data={modalRoja}
          onClose={() => setModalRoja(null)}
          onSave={guardarSancion}
        />
      )}

      {/* MODAL CARGA MANUAL DE TARJETA */}
      {modalCarga && (
        <ModalCargaTarjeta
          jugadores={jugadores}
          partidos={partidos}
          torneos={torneos}
          categorias={categorias}
          onClose={() => setModalCarga(false)}
          onSave={cargarTarjetaManual}
        />
      )}
    </div>
  );
}

// ============================================================
// SUBCOMPONENTES
// ============================================================
function KPI({ label, valor, color, small }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: small ? '1.1rem' : '1.8rem', fontWeight: 900, color, fontFamily: 'JetBrains Mono, monospace' }}>{valor}</div>
    </div>
  );
}

function Badge({ color, texto }) {
  return (
    <span style={{ background: `${color}22`, color, border: `1px solid ${color}`, borderRadius: 4, padding: '2px 8px', fontSize: '0.6rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
      {texto}
    </span>
  );
}

function Th({ label, k, orden, onSort, center }) {
  const activo = orden.key === k;
  const flecha = activo ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      onClick={() => onSort(k)}
      style={{
        padding: '6px 8px', fontWeight: 900, cursor: 'pointer', userSelect: 'none',
        textAlign: center ? 'center' : 'left',
        color: activo ? 'var(--accent)' : 'inherit', whiteSpace: 'nowrap',
      }}
      title="Ordenar"
    >
      {label}{flecha}
    </th>
  );
}

function Overlay({ children, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 1500, animation: 'fadeIn 0.2s' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, zIndex: 1501, animation: 'fadeIn 0.2s' }}>
        {children}
      </div>
    </>
  );
}

function ModalRoja({ data, onClose, onSave }) {
  const [tribunal, setTribunal] = useState(data.sancion?.fechas_tribunal ?? 1);
  const [internas, setInternas] = useState(data.sancion?.fechas_internas ?? 0);
  const [motivo, setMotivo] = useState(data.sancion?.motivo ?? '');
  const [notas, setNotas] = useState(data.sancion?.notas ?? '');

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ color: 'var(--text)', margin: '0 0 4px' }}>🟥 {data.jugador ? `${data.jugador.nombre} ${data.jugador.apellido || ''}`.trim() : 'Jugador'}</h2>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 18 }}>
        Expulsión vs {data.partido?.rival || '—'} · {data.partido?.fecha || ''}
      </div>

      <label style={labelStyle}>Fechas dictadas por el Tribunal</label>
      <input type="number" min={0} value={tribunal} onChange={e => setTribunal(e.target.value)} style={inputStyle} />

      <label style={labelStyle}>Fechas extra (regla interna del club)</label>
      <input type="number" min={0} value={internas} onChange={e => setInternas(e.target.value)} style={inputStyle} />

      <div style={{ background: '#0d0d0d', border: '1px solid var(--border)', borderRadius: 8, padding: 12, margin: '6px 0 14px', textAlign: 'center' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>TOTAL A CUMPLIR </span>
        <b style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem' }}>
          {(parseInt(tribunal, 10) || 0) + (parseInt(internas, 10) || 0)} fechas
        </b>
      </div>

      <label style={labelStyle}>Motivo</label>
      <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Conducta violenta, doble amarilla…" style={inputStyle} />

      <label style={labelStyle}>Notas internas</label>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onClose} style={{ ...btnMini, flex: 1, background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>Cancelar</button>
        <button
          onClick={() => onSave({
            evento: data.evento, jugador: data.jugador, partido: data.partido,
            fechas_tribunal: tribunal, fechas_internas: internas, motivo, notas,
            sancionId: data.sancion?.id,
          })}
          style={{ ...btnMini, flex: 1, background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 900 }}>
          Guardar sanción
        </button>
      </div>
    </Overlay>
  );
}

function ModalCargaTarjeta({ jugadores, partidos, torneos, categorias, onClose, onSave }) {
  const [jugadorId, setJugadorId] = useState('');
  const [tipo, setTipo] = useState('Tarjeta Amarilla');
  const [fCat, setFCat] = useState('');
  const [fTor, setFTor] = useState('');
  const [partidoId, setPartidoId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [minuto, setMinuto] = useState('');

  const jugadoresOrden = useMemo(
    () => [...jugadores].sort((a, b) => claveApellido(a).localeCompare(claveApellido(b))),
    [jugadores]
  );

  const torneosFiltrados = useMemo(
    () => (fCat ? torneos.filter(t => !t.categoria || t.categoria === fCat) : torneos),
    [torneos, fCat]
  );

  const partidosFiltrados = useMemo(() => {
    return partidos.filter(p => {
      if (fCat && p.categoria !== fCat) return false;
      if (fTor && p.torneo_id !== fTor) return false;
      return true;
    });
  }, [partidos, fCat, fTor]);

  const valido = jugadorId && partidoId;

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ color: 'var(--text)', margin: '0 0 4px' }}>Cargar tarjeta manual</h2>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 18 }}>
        Para tarjetas que no quedaron registradas en vivo. El torneo y la categoría salen del partido.
      </div>

      <label style={labelStyle}>Jugador</label>
      <select value={jugadorId} onChange={e => setJugadorId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="">Elegí un jugador…</option>
        {jugadoresOrden.map(j => (
          <option key={j.id} value={j.id}>
            {(j.apellido || '').trim()}{j.apellido && j.nombre ? ', ' : ''}{(j.nombre || '').trim()}{j.dorsal != null ? ` (#${j.dorsal})` : ''}
          </option>
        ))}
      </select>

      <label style={labelStyle}>Tipo de tarjeta</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <button onClick={() => setTipo('Tarjeta Amarilla')} style={{ ...btnMini, flex: 1, background: tipo === 'Tarjeta Amarilla' ? 'rgba(250,204,21,0.15)' : 'transparent', borderColor: tipo === 'Tarjeta Amarilla' ? '#facc15' : '#333', color: tipo === 'Tarjeta Amarilla' ? '#facc15' : '#888' }}>🟨 Amarilla</button>
        <button onClick={() => setTipo('Tarjeta Roja')} style={{ ...btnMini, flex: 1, background: tipo === 'Tarjeta Roja' ? 'rgba(239,68,68,0.15)' : 'transparent', borderColor: tipo === 'Tarjeta Roja' ? '#ef4444' : '#333', color: tipo === 'Tarjeta Roja' ? '#ef4444' : '#888' }}>🟥 Roja</button>
      </div>

      {/* Filtros para encontrar el partido */}
      <label style={labelStyle}>Partido</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={fCat} onChange={e => { setFCat(e.target.value); setFTor(''); setPartidoId(''); }} style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
          <option value="">Categoría</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fTor} onChange={e => { setFTor(e.target.value); setPartidoId(''); }} style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
          <option value="">Torneo</option>
          {torneosFiltrados.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>
      <select value={partidoId} onChange={e => setPartidoId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="">Elegí el partido…</option>
        {partidosFiltrados.map(p => (
          <option key={p.id} value={p.id}>
            vs {p.rival || '—'} · {p.fecha || ''}{p.jornada ? ` · ${p.jornada}` : ''}
          </option>
        ))}
      </select>

      {/* Opcionales */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Periodo (opc.)</label>
          <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">—</option>
            <option value="PT">PT</option>
            <option value="ST">ST</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Minuto (opc.)</label>
          <input type="number" min={0} value={minuto} onChange={e => setMinuto(e.target.value)} placeholder="—" style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={{ ...btnMini, flex: 1, background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>Cancelar</button>
        <button
          disabled={!valido}
          onClick={() => onSave({ jugadorId, tipo, partidoId, periodo, minuto })}
          style={{ ...btnMini, flex: 1, background: valido ? 'var(--accent)' : '#222', color: valido ? '#000' : '#555', border: 'none', fontWeight: 900, cursor: valido ? 'pointer' : 'not-allowed' }}>
          Cargar tarjeta
        </button>
      </div>
    </Overlay>
  );
}

// ============================================================
// ESTILOS
// ============================================================
const cardStyle = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
const selectStyle = { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', cursor: 'pointer' };
const thStyle = { padding: '6px 8px', fontWeight: 900 };
const thCenter = { ...thStyle, textAlign: 'center' };
const tdStyle = { padding: '10px 8px' };
const tdNum = { ...tdStyle, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const labelStyle = { display: 'block', color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 700, margin: '10px 0 5px', textTransform: 'uppercase', letterSpacing: 0.5 };
const inputStyle = { width: '100%', background: '#0d0d0d', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: '0.9rem', boxSizing: 'border-box' };
const btnMini = { background: '#1a1a1a', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' };

const alertaStyle = (bg, border) => ({
  display: 'flex', alignItems: 'center', gap: 12,
  background: `${bg}33`, border: `1px solid ${border}`, borderRadius: 10,
  padding: '12px 16px', fontSize: '0.85rem', color: '#eee',
});