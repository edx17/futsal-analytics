import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

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

function sumarDias(fechaISO, n) {
  const d = new Date(fechaISO);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mismo criterio que en Torneos.jsx / Transferencias.jsx: Math.ceil sobre medianoche local
function diasHasta(fechaISO) {
  if (!fechaISO) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaISO); f.setHours(0, 0, 0, 0);
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
// DISCIPLINA: NO se calcula acá a propósito.
// Inicio.jsx (bloque que alimenta el módulo `m_triage` / "REQUIERE TU ATENCIÓN")
// ya recorre `eventos` + `disciplina_sanciones` y cubre tanto suspendidos
// (roja transversal + acumulación de amarillas) como "a una del corte".
// Duplicarlo acá implicaría 2 queries pesadas más y mostrarle al DT la misma
// alerta en dos lugares distintos. Si en algún momento querés que la campanita
// también la incluya, lo prolijo es extraer ese bloque de Inicio.jsx a un util
// compartido (ej. `calcularAlertasDisciplina(clubId, categoria)`) y llamarlo
// desde los dos lados en vez de reescribirlo acá.
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
    const nacimiento = new Date(j.fechanac);
    if (isNaN(nacimiento.getTime())) return;
    const cumpleEsteAno = new Date(hoy.getFullYear(), nacimiento.getMonth(), nacimiento.getDate());
    const dias = diasHasta(cumpleEsteAno.toISOString().slice(0, 10));

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

  // TODO: conversaciones agendadas con un jugador. No existe todavía una tabla para esto.
  // Si la querés, la más simple sería:
  // seguimientos_jugador (id, club_id, jugador_id, fecha_recordatorio, motivo, resuelto)

  return alertas;
}

// ------------------------------------------------------------
// TESORERÍA: deudas vencidas (usa montos, no el string de `estado`, para no
// depender de un valor exacto que no pude confirmar en los archivos que me pasaste)
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
// PLANTEL: necesidad de refuerzos (TODO — necesita Plantel.jsx/Resumenplantel.jsx
// para saber cómo definís "mínimo de jugadores por puesto")
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
      // Roster una sola vez, compartido entre todos los generadores (join en JS vía Map,
      // igual que en Transferencias.jsx / Disciplina.jsx).
      let queryJug = supabase.from('jugadores').select('id, nombre, apellido, categoria, fechanac').eq('club_id', clubId);
      if (misCategorias?.length > 0) queryJug = queryJug.in('categoria', misCategorias);
      const { data: jugadoresData } = await queryJug;
      const jugadoresMap = new Map((jugadoresData || []).map((j) => [j.id, j]));

      const resultados = await Promise.allSettled(
        GENERADORES.map((fn) => fn(clubId, jugadoresMap, misCategorias))
      );

      const todas = resultados.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
      const fallidas = resultados.filter((r) => r.status === 'rejected');
      if (fallidas.length > 0) {
        console.warn('Algunos generadores del tablón fallaron:', fallidas.map((f) => f.reason));
      }

      // Filtrar descartadas (tabla tablon_dismissed, ver tablon_dismissed.sql adjunto)
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