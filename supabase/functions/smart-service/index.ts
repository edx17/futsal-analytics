// supabase/functions/tablon-push/index.ts
//
// Corre server-side (sin sesión de usuario, con service role) el mismo tipo de
// alertas que ves en la Campanita + en el módulo "Requiere tu atención" de
// Inicio.jsx, y les manda un push a los dispositivos suscriptos.
//
// Se invoca 2-3 veces al día vía Supabase Cron (ver instrucciones al final).
// Idempotente: cada tipo de aviso se marca en `tablon_notificado` para no
// mandarlo dos veces (el cron corre varias veces por día).
//
// Simplificación consciente: el digest se arma UNA vez por club (categoria=
// "todas"), no personalizado por CT. Si tenés varios CT por categoría en el
// mismo club, todos reciben el mismo resumen completo. Si eso te molesta,
// avisame y lo hacemos por perfil (más queries, pero es viable).

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@virtualstats.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET"); // opcional pero recomendado

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ===== Mismas constantes que Inicio.jsx (no las inventé, están portadas) =====
const UMBRAL_AMARILLAS = 5; // 5, 10, 15... => 1 fecha de suspensión
const WELL = { suenoRojo: 2, fatigaRoja: 4, estresRojo: 4, dolorRojo: 4 };
const enRojoWell = (w: any) =>
  Number(w.fatiga ?? 3) >= WELL.fatigaRoja ||
  Number(w.dolor_muscular ?? 3) >= WELL.dolorRojo ||
  Number(w.estres ?? 3) >= WELL.estresRojo ||
  Number(w.sueno ?? 3) <= WELL.suenoRojo;

// ===== Ventanas =====
const VENTANA_CUMPLEANOS_DIAS = 3;
const VENTANA_PRESTAMO_VENCE_DIAS = 7;
const VENTANA_PROXIMO_PARTIDO_DIAS = 5;
const VENTANA_SESIONES_DIAS = 3;
const VENTANA_PREVIA_PARTIDO_HORAS = 4; // avisa cuando falten <= 4hs para el horario

// ===== Helpers de fecha (mismos criterios que useTablon.js) =====
function hoyISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function sumarDias(fechaISO: string, n: number) {
  const d = new Date(fechaISO);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function diasHasta(fechaISO: string | null) {
  if (!fechaISO) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaISO); f.setHours(0, 0, 0, 0);
  if (isNaN(f.getTime())) return null;
  return Math.ceil((f.getTime() - hoy.getTime()) / 86400000);
}
// Parseo defensivo de `partidos.horario` (texto libre). Si no matchea "HH:MM",
// devuelve null y simplemente no se manda la "previa" para ese partido — no
// rompe nada, solo no alcanza a avisar con horas de anticipación.
function horasHasta(fechaISO: string, horarioTexto: string | null) {
  if (!horarioTexto) return null;
  const m = String(horarioTexto).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, hh, mm] = m;
  const objetivo = new Date(fechaISO);
  objetivo.setHours(Number(hh), Number(mm), 0, 0);
  return (objetivo.getTime() - Date.now()) / 3_600_000;
}

const nombreJug = (j: any) => {
  if (!j) return "Jugador";
  const ap = (j.apellido || "").trim();
  const no = (j.nombre || "").trim();
  if (ap && no) return `${ap}, ${no}`;
  return ap || no || "Sin nombre";
};

// ============================================================================
// GENERADORES (mismo shape que useTablon.js: { id, categoria, prioridad, titulo, ruta })
// ============================================================================

async function alertasCalendario(clubId: string, jugadoresMap: Map<any, any>) {
  const alertas: any[] = [];
  const hoy = hoyISO();

  const { data: clubRow } = await supabase.from("clubes").select("nombre").eq("id", clubId).maybeSingle();
  const miClubGlobal = clubRow?.nombre || null;

  const { data: pendientes } = await supabase
    .from("partidos")
    .select("id, fecha, rival, condicion, estado, nombre_propio, horario")
    .eq("club_id", clubId)
    .eq("estado", "Pendiente")
    .order("fecha", { ascending: true })
    .limit(50);

  const esMiPartido = (p: any) => (!p.nombre_propio || p.nombre_propio === miClubGlobal) || (p.rival === miClubGlobal);
  const proximo = (pendientes || []).find(esMiPartido);

  if (proximo) {
    const dias = diasHasta(proximo.fecha);
    if (dias !== null && dias <= VENTANA_PROXIMO_PARTIDO_DIAS) {
      alertas.push({
        id: `partido-${proximo.id}`,
        categoria: "calendario",
        prioridad: dias <= 1 ? "bloqueante" : "importante",
        titulo: `Partido vs ${proximo.rival || "rival"} en ${dias <= 0 ? "el día de hoy" : `${dias} día${dias === 1 ? "" : "s"}`}`,
      });
    }
  }

  const { data: sesiones } = await supabase
    .from("sesiones")
    .select("id, fecha, tareas_ids, categoria_equipo")
    .eq("club_id", clubId)
    .gte("fecha", hoy)
    .lte("fecha", sumarDias(hoy, VENTANA_SESIONES_DIAS))
    .order("fecha", { ascending: true });

  (sesiones || []).forEach((s: any) => {
    const sinTareas = !s.tareas_ids || (Array.isArray(s.tareas_ids) && s.tareas_ids.length === 0);
    if (!sinTareas) return;
    const dias = diasHasta(s.fecha);
    alertas.push({
      id: `sesion-sin-tareas-${s.id}`,
      categoria: "calendario",
      prioridad: dias !== null && dias <= 1 ? "bloqueante" : "importante",
      titulo: `Falta cargar tareas para la sesión del ${s.fecha}`,
    });
  });

  const { data: wellnessHoy } = await supabase.from("wellness").select("jugador_id").eq("club_id", clubId).eq("fecha", hoy);
  const respondieron = new Set((wellnessHoy || []).map((w: any) => w.jugador_id));
  const universo = [...jugadoresMap.values()];
  const faltantes = universo.filter((j) => !respondieron.has(j.id));

  if (faltantes.length > 0 && universo.length > 0) {
    alertas.push({
      id: `wellness-${hoy}`,
      categoria: "calendario",
      prioridad: "importante",
      titulo: `${faltantes.length} de ${universo.length} jugadores sin completar el wellness de hoy`,
    });
  }

  return alertas;
}

// Portado 1:1 de la sección DISCIPLINA + WELLNESS HOY de Inicio.jsx.
async function alertasDisciplinaYWellness(clubId: string, jugadoresMap: Map<any, any>) {
  const alertas: any[] = [];
  const anio = new Date().getFullYear().toString();
  const hoyStr = new Date().toISOString().split("T")[0]; // mismo criterio que Inicio.jsx (UTC)

  const { data: rMapPar } = await supabase
    .from("partidos")
    .select("id, categoria, fecha")
    .eq("club_id", clubId)
    .gte("fecha", `${anio}-01-01`)
    .lte("fecha", `${anio}-12-31`);
  const catDePartido: Record<string, string> = {};
  (rMapPar || []).forEach((p: any) => { catDePartido[p.id] = p.categoria || "Sin categoría"; });
  const idsPartidosTemporada = (rMapPar || []).map((p: any) => p.id);

  const { data: tarjetas } = idsPartidosTemporada.length > 0
    ? await supabase
        .from("eventos")
        .select("id_jugador, accion, id_partido")
        .eq("club_id", clubId)
        .eq("equipo", "Propio")
        .in("accion", ["Tarjeta Amarilla", "Tarjeta Roja"])
        .in("id_partido", idsPartidosTemporada)
    : { data: [] as any[] };

  const amarillasCat: Record<string, number> = {};
  (tarjetas || []).forEach((t: any) => {
    if (!t.id_jugador || t.accion !== "Tarjeta Amarilla") return;
    const cat = catDePartido[t.id_partido] || "Sin categoría";
    const key = `${t.id_jugador}|${cat}`;
    amarillasCat[key] = (amarillasCat[key] || 0) + 1;
  });

  const { data: sanc } = await supabase
    .from("disciplina_sanciones")
    .select("jugador_id, categoria, tipo, fechas_tribunal, fechas_internas, fechas_cumplidas")
    .eq("club_id", clubId);
  const bajasAcum: Record<string, number> = {};
  const fechasRoja: Record<string, number> = {};
  (sanc || []).forEach((s: any) => {
    if (s.tipo === "acumulacion") {
      const key = `${s.jugador_id}|${s.categoria || "Sin categoría"}`;
      bajasAcum[key] = (bajasAcum[key] || 0) + 1;
      return;
    }
    const tot = (s.fechas_tribunal || 0) + (s.fechas_internas || 0);
    fechasRoja[s.jugador_id] = (fechasRoja[s.jugador_id] || 0) + Math.max(0, tot - (s.fechas_cumplidas || 0));
  });

  Object.entries(amarillasCat).forEach(([key, n]) => {
    const [jid, cat] = key.split("|");
    const j = jugadoresMap.get(Number(jid)) || jugadoresMap.get(jid);
    const ganadas = Math.floor(n / UMBRAL_AMARILLAS);
    const cumplidas = bajasAcum[key] || 0;
    const pendientes = Math.max(0, ganadas - cumplidas);
    if (pendientes > 0) {
      alertas.push({
        id: `disciplina-amarillas-${jid}-${cat}`,
        categoria: "disciplina",
        prioridad: "bloqueante",
        titulo: `${nombreJug(j)} suspendido por amarillas (${n} en ${cat})`,
      });
    } else if (n % UMBRAL_AMARILLAS === UMBRAL_AMARILLAS - 1) {
      alertas.push({
        id: `disciplina-alborde-${jid}-${cat}`,
        categoria: "disciplina",
        prioridad: "importante",
        titulo: `${nombreJug(j)}, a una amarilla de la suspensión (${cat})`,
      });
    }
  });

  Object.entries(fechasRoja).forEach(([jid, f]) => {
    if (f <= 0) return;
    const j = jugadoresMap.get(Number(jid)) || jugadoresMap.get(jid);
    alertas.push({
      id: `disciplina-roja-${jid}`,
      categoria: "disciplina",
      prioridad: "bloqueante",
      titulo: `${nombreJug(j)} suspendido — le quedan ${f} fecha${f === 1 ? "" : "s"}`,
    });
  });

  const { data: wHoy } = await supabase
    .from("wellness")
    .select("jugador_id, fatiga, dolor_muscular, estres, sueno")
    .eq("club_id", clubId)
    .eq("fecha", hoyStr);
  const enRojo = (wHoy || []).filter(enRojoWell);
  if (enRojo.length > 0) {
    alertas.push({
      id: `wellness-rojo-${hoyStr}`,
      categoria: "disciplina", // misma pestaña que en Inicio.jsx (triage), no "calendario"
      prioridad: "importante",
      titulo: `${enRojo.length} ${enRojo.length === 1 ? "jugador" : "jugadores"} en rojo hoy (fatiga/dolor/sueño)`,
    });
  }

  return alertas;
}

async function alertasTransferencias(clubId: string) {
  const alertas: any[] = [];
  const { data: prestamos } = await supabase
    .from("transferencias")
    .select("id, jugador_nombre, direccion, fecha_retorno, opcion_compra, opcion_compra_vence")
    .eq("club_id", clubId)
    .eq("tipo_movimiento", "Prestamo")
    .eq("estado", "Activo");

  (prestamos || []).forEach((t: any) => {
    if (t.fecha_retorno) {
      const dias = diasHasta(t.fecha_retorno);
      if (dias !== null && dias <= VENTANA_PRESTAMO_VENCE_DIAS) {
        const verbo = t.direccion === "Saliente" ? "vuelve al club" : "termina el préstamo";
        alertas.push({
          id: `prestamo-retorno-${t.id}`,
          categoria: "transferencias",
          prioridad: dias <= 2 ? "bloqueante" : "importante",
          titulo: `${t.jugador_nombre || "Jugador"} ${verbo} en ${dias <= 0 ? "el día de hoy" : `${dias} día${dias === 1 ? "" : "s"}`}`,
        });
      }
    }
    if (t.opcion_compra && t.opcion_compra_vence) {
      const dias = diasHasta(t.opcion_compra_vence);
      if (dias !== null && dias <= VENTANA_PRESTAMO_VENCE_DIAS) {
        alertas.push({
          id: `opcion-compra-${t.id}`,
          categoria: "transferencias",
          prioridad: "importante",
          titulo: `Opción de compra de ${t.jugador_nombre || "jugador"} vence en ${dias <= 0 ? "el día de hoy" : `${dias} día${dias === 1 ? "" : "s"}`}`,
        });
      }
    }
  });

  return alertas;
}

async function alertasPersonal(jugadoresMap: Map<any, any>) {
  const alertas: any[] = [];
  const hoy = new Date();
  [...jugadoresMap.values()].forEach((j: any) => {
    if (!j.fechanac) return;
    const nacimiento = new Date(j.fechanac);
    if (isNaN(nacimiento.getTime())) return;
    const cumpleEsteAno = new Date(hoy.getFullYear(), nacimiento.getMonth(), nacimiento.getDate());
    const dias = diasHasta(cumpleEsteAno.toISOString().slice(0, 10));
    if (dias !== null && dias >= 0 && dias <= VENTANA_CUMPLEANOS_DIAS) {
      alertas.push({
        id: `cumple-${j.id}-${hoy.getFullYear()}`,
        categoria: "personal",
        prioridad: "info",
        titulo: dias === 0 ? `Hoy es el cumpleaños de ${nombreJug(j)}` : `${nombreJug(j)} cumple años en ${dias} día${dias === 1 ? "" : "s"}`,
      });
    }
  });
  return alertas;
}

async function alertasTesoreria(clubId: string, jugadoresMap: Map<any, any>) {
  const alertas: any[] = [];
  const hoy = hoyISO();
  const { data: deudas } = await supabase
    .from("tesoreria_deudas")
    .select("id, jugador_id, concepto, monto_original, monto_pagado, fecha_vencimiento")
    .eq("club_id", clubId)
    .lte("fecha_vencimiento", hoy);

  (deudas || []).forEach((d: any) => {
    const pendiente = (Number(d.monto_original) || 0) - (Number(d.monto_pagado) || 0);
    if (pendiente <= 0) return;
    const j = jugadoresMap.get(d.jugador_id);
    alertas.push({
      id: `deuda-${d.id}`,
      categoria: "tesoreria",
      prioridad: "importante",
      titulo: `${nombreJug(j)} tiene una deuda vencida (${d.concepto || "sin concepto"})`,
    });
  });

  return alertas;
}

async function calcularAlertasDelClub(clubId: string) {
  const { data: jugadoresData } = await supabase.from("jugadores").select("id, nombre, apellido, categoria, fechanac").eq("club_id", clubId);
  const jugadoresMap = new Map((jugadoresData || []).map((j: any) => [j.id, j]));

  const resultados = await Promise.allSettled([
    alertasCalendario(clubId, jugadoresMap),
    alertasDisciplinaYWellness(clubId, jugadoresMap),
    alertasTransferencias(clubId),
    alertasPersonal(jugadoresMap),
    alertasTesoreria(clubId, jugadoresMap),
  ]);

  const todas = resultados.filter((r) => r.status === "fulfilled").flatMap((r: any) => r.value);

  const { data: descartadas } = await supabase.from("tablon_dismissed").select("alerta_id").eq("club_id", clubId);
  const idsDescartados = new Set((descartadas || []).map((d: any) => d.alerta_id));

  const ORDEN = { bloqueante: 0, importante: 1, info: 2 } as Record<string, number>;
  return todas.filter((a) => !idsDescartados.has(a.id)).sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad]);
}

// ============================================================================
// Envío de push + dedupe
// ============================================================================

async function yaNotificado(clubId: string, runKey: string) {
  const { data } = await supabase.from("tablon_notificado").select("id").eq("club_id", clubId).eq("run_key", runKey).maybeSingle();
  return !!data;
}
async function marcarNotificado(clubId: string, runKey: string) {
  await supabase.from("tablon_notificado").insert({ club_id: clubId, run_key: runKey });
}

async function enviarATodos(subs: any[], payload: object) {
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          // Suscripción muerta (usuario desinstaló / revocó el permiso) -> la limpiamos
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error(`Error enviando push a ${s.endpoint}:`, err?.message || err);
        }
      }
    })
  );
}

// ============================================================================
// Handler
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Preflight del navegador (esto es lo que faltaba: sin esto, cualquier
  // fetch() desde una pestaña de navegador falla por CORS antes de llegar acá).
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (CRON_SECRET) {
    const header = req.headers.get("x-cron-secret");
    if (header !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  const hoy = hoyISO();
  const { data: clubes } = await supabase.from("clubes").select("id").eq("suscripcion_activa", true);

  let clubesConPush = 0;
  let digestsEnviados = 0;
  let previasEnviadas = 0;

  for (const club of clubes || []) {
    const clubId = club.id;

    const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("club_id", clubId);
    if (!subs || subs.length === 0) continue;
    clubesConPush++;

    // --- DIGEST: una vez por día, con TODO (bloqueante + importante + info) ---
    const runKeyDigest = `digest-${hoy}`;
    if (!(await yaNotificado(clubId, runKeyDigest))) {
      const alertas = await calcularAlertasDelClub(clubId);
      if (alertas.length > 0) {
        const top = alertas.slice(0, 3).map((a) => a.titulo).join(" · ");
        const resto = alertas.length > 3 ? ` y ${alertas.length - 3} más` : "";
        await enviarATodos(subs, {
          title: `Virtual.Club — ${alertas.length} pendiente${alertas.length === 1 ? "" : "s"}`,
          body: top + resto,
          tag: "tablon-digest",
          data: { url: "/inicio" },
        });
        digestsEnviados++;
      }
      await marcarNotificado(clubId, runKeyDigest);
    }

    // --- PREVIA DE PARTIDO: cuando faltan <= 4hs, una vez por partido ---
    const { data: clubRow } = await supabase.from("clubes").select("nombre").eq("id", clubId).maybeSingle();
    const miClubGlobal = clubRow?.nombre || null;
    const { data: pendientesHoy } = await supabase
      .from("partidos")
      .select("id, fecha, rival, condicion, horario, nombre_propio")
      .eq("club_id", clubId)
      .eq("estado", "Pendiente")
      .eq("fecha", hoy);

    const partidoHoy = (pendientesHoy || []).find((p: any) => (!p.nombre_propio || p.nombre_propio === miClubGlobal) || (p.rival === miClubGlobal));

    if (partidoHoy) {
      const runKeyPrevia = `previa-partido-${partidoHoy.id}`;
      const horas = horasHasta(partidoHoy.fecha, partidoHoy.horario);
      if (horas !== null && horas >= 0 && horas <= VENTANA_PREVIA_PARTIDO_HORAS && !(await yaNotificado(clubId, runKeyPrevia))) {
        await enviarATodos(subs, {
          title: `⚽ Partido vs ${partidoHoy.rival || "rival"} en ${Math.max(1, Math.round(horas))}hs`,
          body: `${partidoHoy.condicion || ""}${partidoHoy.horario ? ` · ${partidoHoy.horario}` : ""}`,
          tag: `previa-${partidoHoy.id}`,
          data: { url: `/torneos?partido=${partidoHoy.id}` },
        });
        await marcarNotificado(clubId, runKeyPrevia);
        previasEnviadas++;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, clubesConPush, digestsEnviados, previasEnviadas }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});