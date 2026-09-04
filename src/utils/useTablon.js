import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { soloActivos } from '../utils/plantelActivo';

// ===== Ventanas configurables (en días) =====
const VENTANA_CUMPLEANOS_DIAS = 3;
const VENTANA_PRESTAMO_VENCE_DIAS = 7;
const VENTANA_PROXIMO_PARTIDO_DIAS = 5;
const VENTANA_SESIONES_DIAS = 3; // cuántos días hacia adelante mirar sesiones sin tareas

const PRIORIDAD = {
  BLOQUEANTE: 'bloqueante', // rojo
  IMPORTANTE: 'importante', // amarillo
  INFO: 'info',             // azul
};

function hoyISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// CORRECCIÓN: Armar la fecha desde enteros locales para evitar desfasajes UTC-3
function sumarDias(fechaISO, n) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split('T')[0].split('-');
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// CORRECCIÓN: Se fuerza a horario local (00:00hs) extrayendo el año, mes y día manualmente
function diasHasta(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split('T')[0].split('-');
  const f = new Date(y, m - 1, d); 
  const hoy = new Date(); 
  hoy.setHours(0, 0, 0, 0);
  
  if (isNaN(f.getTime())) return null;
  return Math.ceil((f - hoy) / 86400000);
}

const nombreJug = (j) => {
  if (!j) return 'Jugador';
  const ap = (j.apellido || '').trim();
  const no = (j.nombre || '').trim();
  if (ap && no) return `${ap}, ${no}`;
  return ap || no || 'Sin nombre';
};

/**
 * Cada generador recibe (clubId, jugadoresMap, misCategorias) y devuelve un array de alertas.
 * jugadoresMap ya viene armado una sola vez en useTablon (join en JS, como en el resto de la app).
 * misCategorias: array de categorías asignadas al CT (perfil.categorias_asignadas). Si viene
 * vacío, no se filtra por categoría (ve todo, como los superuser/admin).
 * Shape de una alerta: { id, categoria, prioridad, titulo, detalle?, ruta? }
 */

// ------------------------------------------------------------
// CALENDARIO: próximo partido + sesiones sin tareas + wellness
// ------------------------------------------------------------
async function alertasCalendario(clubId, jugadoresMap, misCategorias) {
  const alertas = [];
  const hoy = hoyISO();

  // miClubGlobal: mismo dato que usa Torneos.jsx para el filtro esMiPartido
  // (nombre_propio === miClubGlobal || rival === miClubGlobal), necesario porque
  // `partidos` también guarda cruces entre rivales ajenos para la tabla de posiciones.
  let miClubGlobal = localStorage.getItem('mi_club') || null;
  if (!miClubGlobal) {
    const { data: club } = await supabase.from('clubes').select('nombre').eq('id', clubId).maybeSingle();
    miClubGlobal = club?.nombre || null;
  }

  // --- Próximo partido ---
  let queryPartidos = supabase
    .from('partidos')
    .select('id, fecha, rival, condicion, estado, nombre_propio, categoria')
    .eq('club_id', clubId)
    .eq('estado', 'Pendiente')
    .order('fecha', { ascending: true })
    .limit(50);
  if (misCategorias?.length > 0) queryPartidos = queryPartidos.in('categoria', misCategorias);

  const { data: pendientes } = await queryPartidos;
  const esMiPartido = (p) => (!p.nombre_propio || p.nombre_propio === miClubGlobal) || (p.rival === miClubGlobal);
  const proximo = (pendientes || []).find(esMiPartido);

  if (proximo) {
    const dias = diasHasta(proximo.fecha);
    if (dias !== null && dias <= VENTANA_PROXIMO_PARTIDO_DIAS) {
      alertas.push({
        id: `partido-${proximo.id}`,
        categoria: 'calendario',
        prioridad: dias <= 1 ? PRIORIDAD.BLOQUEANTE : PRIORIDAD.IMPORTANTE,
        titulo: `Partido vs ${proximo.rival || 'rival'} en ${dias <= 0 ? 'el día de hoy' : `${dias} día${dias === 1 ? '' : 's'}`}`,
        detalle: proximo.condicion,
        ruta: `/torneos?partido=${proximo.id}`,
      });
    }
  }

  // --- Sesiones próximas sin tareas asignadas ---
  // `sesiones.tareas_ids` es el jsonb con las tareas del banco asignadas a esa fecha.
  let querySesiones = supabase
    .from('sesiones')
    .select('id, fecha, tareas_ids, categoria_equipo')
    .eq('club_id', clubId)
    .gte('fecha', hoy)
    .lte('fecha', sumarDias(hoy, VENTANA_SESIONES_DIAS))
    .order('fecha', { ascending: true });
  if (misCategorias?.length > 0) querySesiones = querySesiones.in('categoria_equipo', misCategorias);

  const { data: sesiones } = await querySesiones;
  (sesiones || []).forEach((s) => {
    const sinTareas = !s.tareas_ids || (Array.isArray(s.tareas_ids) && s.tareas_ids.length === 0);
    if (!sinTareas) return;
    const dias = diasHasta(s.fecha);
    alertas.push({
      id: `sesion-sin-tareas-${s.id}`,
      categoria: 'calendario',
      prioridad: dias <= 1 ? PRIORIDAD.BLOQUEANTE : PRIORIDAD.IMPORTANTE,
      titulo: `Falta cargar tareas para la sesión del ${s.fecha}${s.categoria_equipo ? ` (${s.categoria_equipo})` : ''}`,
      ruta: `/creador-tareas?sesion=${s.id}`,
    });
  });

  // --- Wellness sin completar hoy ---
  const { data: wellnessHoy } = await supabase
    .from('wellness')
    .select('jugador_id')
    .eq('club_id', clubId)
    .eq('fecha', hoy);

  const respondieron = new Set((wellnessHoy || []).map((w) => w.jugador_id));
  const universo = misCategorias?.length > 0
    ? [...jugadoresMap.values()].filter((j) => misCategorias.includes(j.categoria))
    : [...jugadoresMap.values()];
  const faltantes = universo.filter((j) => !respondieron.has(j.id));

  if (faltantes.length > 0 && universo.length > 0) {
    alertas.push({
      id: `wellness-${hoy}`,
      categoria: 'calendario',
      prioridad: PRIORIDAD.IMPORTANTE,
      titulo: `${faltantes.length} de ${universo.length} jugadores sin completar el wellness de hoy`,
      detalle: faltantes.map((j) => nombreJug(j)).join(', '),
      ruta: '/wellness',
    });
  }

  return alertas;
}

// ------------------------------------------------------------
// TRANSFERENCIAS: préstamos por vencer + opciones de compra por vencer
// ------------------------------------------------------------
async function alertasTransferencias(clubId, jugadoresMap, misCategorias) {
  const alertas = [];

  let query = supabase
    .from('transferencias')
    .select('id, jugador_nombre, categoria, direccion, fecha_retorno, opcion_compra, opcion_compra_vence')
    .eq('club_id', clubId)
    .eq('tipo_movimiento', 'Prestamo')
    .eq('estado', 'Activo');
  if (misCategorias?.length > 0) query = query.in('categoria', misCategorias);

  const { data: prestamos } = await query;

  (prestamos || []).forEach((t) => {
    // Préstamo cedido (Saliente) o recibido (Entrante) que vence pronto
    if (t.fecha_retorno) {
      const dias = diasHasta(t.fecha_retorno);
      if (dias !== null && dias <= VENTANA_PRESTAMO_VENCE_DIAS) {
        const verbo = t.direccion === 'Saliente' ? 'vuelve al club' : 'termina el préstamo';
        alertas.push({
          id: `prestamo-retorno-${t.id}`,
          categoria: 'transferencias',
          prioridad: dias <= 2 ? PRIORIDAD.BLOQUEANTE : PRIORIDAD.IMPORTANTE,
          titulo: `${t.jugador_nombre || 'Jugador'} ${verbo} en ${dias <= 0 ? 'el día de hoy' : `${dias} día${dias === 1 ? '' : 's'}`}`,
          ruta: `/transferencias?id=${t.id}`,
        });
      }
    }

    // Opción de compra por vencer (solo tiene sentido en préstamos Entrantes)
    if (t.opcion_compra && t.opcion_compra_vence) {
      const dias = diasHasta(t.opcion_compra_vence);
      if (dias !== null && dias <= VENTANA_PRESTAMO_VENCE_DIAS) {
        alertas.push({
          id: `opcion-compra-${t.id}`,
          categoria: 'transferencias',
          prioridad: PRIORIDAD.IMPORTANTE,
          titulo: `Opción de compra de ${t.jugador_nombre || 'jugador'} vence en ${dias <= 0 ? 'el día de hoy' : `${dias} día${dias === 1 ? '' : 's'}`}`,
          ruta: `/transferencias?id=${t.id}`,
        });
      }
    }
  });

  return alertas;
}

// ------------------------------------------------------------
// PERSONAL: cumpleaños
// ------------------------------------------------------------
async function alertasPersonal(clubId, jugadoresMap, misCategorias) {
  const alertas = [];
  const hoy = new Date();

  const universo = misCategorias?.length > 0
    ? [...jugadoresMap.values()].filter((j) => misCategorias.includes(j.categoria))
    : [...jugadoresMap.values()];

  universo.forEach((j) => {
    if (!j.fechanac) return;
    
    // CORRECCIÓN: Evitar parseos erráticos con new Date().
    // Agarramos directamente el texto puro (ej: "1988-11-20") de Supabase.
    const partes = j.fechanac.split('T')[0].split('-');
    if (partes.length < 3) return;
    const [, mes, dia] = partes; 

    // Armamos la fecha del cumple para el año actual manteniendo el formato string limpio.
    const cumpleEsteAnoISO = `${hoy.getFullYear()}-${mes}-${dia}`;
    const dias = diasHasta(cumpleEsteAnoISO);

    if (dias !== null && dias >= 0 && dias <= VENTANA_CUMPLEANOS_DIAS) {
      alertas.push({
        id: `cumple-${j.id}-${hoy.getFullYear()}`,
        categoria: 'personal',
        prioridad: PRIORIDAD.INFO,
        titulo: dias === 0
          ? `Hoy es el cumpleaños de ${nombreJug(j)}`
          : `${nombreJug(j)} cumple años en ${dias} día${dias === 1 ? '' : 's'}`,
        ruta: `/plantel?jugador=${j.id}`,
      });
    }
  });

  return alertas;
}

// ------------------------------------------------------------
// TESORERÍA: deudas vencidas 
// ------------------------------------------------------------
async function alertasTesoreria(clubId, jugadoresMap) {
  const alertas = [];
  const hoy = hoyISO();

  const { data: deudas } = await supabase
    .from('tesoreria_deudas')
    .select('id, jugador_id, concepto, monto_original, monto_pagado, fecha_vencimiento')
    .eq('club_id', clubId)
    .lte('fecha_vencimiento', hoy);

  (deudas || []).forEach((d) => {
    const pendiente = (Number(d.monto_original) || 0) - (Number(d.monto_pagado) || 0);
    if (pendiente <= 0) return;
    const j = jugadoresMap.get(d.jugador_id);
    alertas.push({
      id: `deuda-${d.id}`,
      categoria: 'tesoreria',
      prioridad: PRIORIDAD.IMPORTANTE,
      titulo: `${nombreJug(j)} tiene una deuda vencida (${d.concepto || 'sin concepto'})`,
      ruta: '/tesoreria',
    });
  });

  return alertas;
}

// ------------------------------------------------------------
// PLANTEL: necesidad de refuerzos 
// ------------------------------------------------------------
async function alertasPlantel(_clubId, _jugadoresMap) {
  return [];
}

const GENERADORES = [
  alertasCalendario,
  alertasTransferencias,
  alertasPersonal,
  alertasTesoreria,
  alertasPlantel,
];

const ORDEN_PRIORIDAD = { bloqueante: 0, importante: 1, info: 2 };

export function useTablon(clubId, misCategorias = []) {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!clubId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      /* `activo` se pide aparte del resto porque puede no existir todavía: si
         la migración de bajas no se corrió, PostgREST rechaza la consulta
         entera y la campanita se queda sin NINGUNA alerta, no sólo sin esta.
         Por eso, si falla, se reintenta con las columnas de siempre. */
      const COLS_BASE = 'id, nombre, apellido, categoria, fechanac';
      const pedirJugadores = async (columnas) => {
        let q = supabase.from('jugadores').select(columnas).eq('club_id', clubId);
        if (misCategorias?.length > 0) q = q.in('categoria', misCategorias);
        return q;
      };
      let { data: jugadoresData, error: errJug } = await pedirJugadores(`${COLS_BASE}, activo`);
      if (errJug) ({ data: jugadoresData } = await pedirJugadores(COLS_BASE));

      /* Los dados de baja salen del tablón: si no, el aviso de wellness diría
         "56 de 56 sin completar" para siempre, contando gente que ya no viene,
         y un aviso que nunca se puede apagar deja de leerse. */
      const jugadoresMap = new Map(soloActivos(jugadoresData).map((j) => [j.id, j]));

      const resultados = await Promise.allSettled(
        GENERADORES.map((fn) => fn(clubId, jugadoresMap, misCategorias))
      );

      const todas = resultados.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
      const fallidas = resultados.filter((r) => r.status === 'rejected');
      if (fallidas.length > 0) {
        console.warn('Algunos generadores del tablón fallaron:', fallidas.map((f) => f.reason));
      }

      const { data: descartadas } = await supabase
        .from('tablon_dismissed')
        .select('alerta_id')
        .eq('club_id', clubId);

      const idsDescartados = new Set((descartadas || []).map((d) => d.alerta_id));
      const visibles = todas.filter((a) => !idsDescartados.has(a.id));
      visibles.sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);

      setAlertas(visibles);
    } catch (err) {
      console.error('Error cargando el tablón:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [clubId, JSON.stringify(misCategorias)]);

  useEffect(() => { cargar(); }, [cargar]);

  const descartar = useCallback(async (alertaId) => {
    setAlertas((prev) => prev.filter((a) => a.id !== alertaId)); // optimista
    await supabase.from('tablon_dismissed').insert({ club_id: clubId, alerta_id: alertaId });
  }, [clubId]);

  return { alertas, loading, error, recargar: cargar, descartar };
}