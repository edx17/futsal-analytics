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
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@virtualstats.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET"); // obligatorio, ver abajo

/* WhatsApp (opcional). Son los mismos secretos que ya usa whatsapp-webhook.
   Un mensaje que el club manda primero (no una respuesta) tiene que ser una
   PLANTILLA aprobada por Meta: cada aviso usa la suya, y si su nombre no
   está cargado ese aviso simplemente no sale por WhatsApp (el push sí). */
const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const WA_IDIOMA = Deno.env.get("WHATSAPP_IDIOMA") || "es_AR";
const WA_PLANTILLA = {
  wellness: Deno.env.get("WHATSAPP_PLANTILLA_WELLNESS"),   // {{1}} = nombre
  cumple:   Deno.env.get("WHATSAPP_PLANTILLA_CUMPLE"),     // {{1}} = nombre
  citacion: Deno.env.get("WHATSAPP_PLANTILLA_CITACION"),
  cuota:    Deno.env.get("WHATSAPP_PLANTILLA_CUOTA"),       // {{1}} nombre, {{2}} concepto, {{3}} monto, {{4}} vencimiento   // {{1}} nombre, {{2}} rival, {{3}} fecha, {{4}} hora de citación
};

/* Cada cuántas horas, como mínimo, se le vuelve a recordar el wellness a un
   jugador que no lo cargó. El que dispara es el cron: con las corridas de
   08, 13 y 18 y el default de 4, son hasta tres recordatorios por día. Por
   WhatsApp va uno solo por día, desde el mediodía (cada plantilla se paga). */
const RECORDATORIO_WELLNESS_HORAS = Math.max(1, Number(Deno.env.get("RECORDATORIO_WELLNESS_HORAS")) || 4);
const RECORDATORIO_DESDE_HORA = 8;
const RECORDATORIO_HASTA_HORA = 21;
const WA_WELLNESS_DESDE_HORA = 12;

/* Si falta un secreto, setVapidDetails tira una excepción. Estando en el
   cuerpo del módulo, esa excepción rompe la función ENTERA antes de atender
   el primer pedido: cada invocación devuelve un 500 opaco, para siempre, y
   desde afuera no hay manera de saber que el problema es un secreto que
   nunca se cargó. El cron, además, sigue marcando sus corridas como
   'succeeded', porque net.http_post encoló bien.

   Guardado acá, el error se convierte en una respuesta que dice qué falta. */
const faltantes: string[] = [];
if (!VAPID_PUBLIC_KEY) faltantes.push("VAPID_PUBLIC_KEY");
if (!VAPID_PRIVATE_KEY) faltantes.push("VAPID_PRIVATE_KEY");
if (!SUPABASE_URL) faltantes.push("SUPABASE_URL");
if (!SERVICE_ROLE_KEY) faltantes.push("SUPABASE_SERVICE_ROLE_KEY");

let errorDeArranque: string | null =
  faltantes.length > 0
    ? `Faltan secretos del Edge Function: ${faltantes.join(", ")}. Se cargan con: supabase secrets set NOMBRE=valor`
    : null;

if (!errorDeArranque) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  } catch (err: any) {
    /* El caso típico: la pública y la privada no son del mismo par, o están
       pegadas con espacios o saltos de línea de más. */
    errorDeArranque = `Las claves VAPID no son válidas: ${err?.message || err}. ` +
      `Tienen que ser del mismo par (npx web-push generate-vapid-keys) y la pública ` +
      `tiene que coincidir con la VITE_VAPID_PUBLIC_KEY del frontend.`;
  }
}

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

/* La hora de Argentina (UTC-3, sin horario de verano). El Edge Function
   corre en UTC, y el wellness se guarda con la fecha local del jugador. */
function ahoraArgentina() {
  const d = new Date(Date.now() - 3 * 3_600_000);
  return { fecha: d.toISOString().slice(0, 10), hora: d.getUTCHours(), anio: d.getUTCFullYear() };
}

/* Mismo criterio que analytics/fichaKiosco.js: el del 29/2 lo festeja el
   28/2 en los años no bisiestos. */
function esCumpleHoy(fechanac: string | null, hoy: string) {
  const n = String(fechanac || "").slice(0, 10).split("-");
  const h = hoy.split("-");
  if (n.length < 3) return false;
  let [, mn, dn] = n;
  const a = Number(h[0]);
  const bisiesto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  if (mn === "02" && dn === "29" && !bisiesto) dn = "28";
  return mn === h[1] && dn === h[2];
}

function convocadosDe(p: any): string[] {
  let pl = p?.plantilla;
  if (typeof pl === "string") {
    try { pl = JSON.parse(pl); } catch { pl = []; }
  }
  if (!Array.isArray(pl)) return [];
  return pl.map((x: any) => String(x?.id_jugador ?? x?.id ?? x)).filter(Boolean);
}

/* El contacto se carga a mano en el plantel ("11 5555-5555", "011 15
   5555-5555") o lo guarda el bot ya en formato internacional
   ("5491155555555"). WhatsApp quiere sólo dígitos con 54 9 adelante.
   Mismo criterio que src/utils/telefono.js (probado allá). */
function telefonoWhatsApp(contacto: string | null) {
  let d = String(contacto ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("549") && d.length === 13) return d;
  if (d.startsWith("54") && d.length === 12) return `549${d.slice(2)}`;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54") && d.length >= 12) return d.startsWith("549") ? d : `549${d.slice(2)}`;
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    for (const pos of [2, 3, 4]) {
      if (d.slice(pos, pos + 2) === "15") { d = d.slice(0, pos) + d.slice(pos + 2); break; }
    }
  }
  if (d.length === 10) return `549${d}`;
  return d.length >= 11 ? d : null;
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

/* Lesiones que pasaron su fecha de alta estimada sin que nadie confirme el
   alta. O el jugador ya volvió y no se cargó, o se complicó: en los dos casos
   el CT tiene que enterarse, porque de eso dependen la citación y el plan de
   la semana. */
async function alertasLesiones(clubId: string, jugadoresMap: Map<any, any>) {
  const alertas: any[] = [];
  const hoy = hoyISO();

  const { data: lesiones, error } = await supabase
    .from("lesiones")
    .select("id, jugador_id, zona, estado, fecha_alta_estimada")
    .eq("club_id", clubId)
    .neq("estado", "alta");

  if (error) {
    // Típico: la migración de lesiones todavía no se corrió en este proyecto.
    console.error("Alertas de lesiones:", error.message);
    return alertas;
  }

  (lesiones || []).forEach((l: any) => {
    if (!l.fecha_alta_estimada) return;
    if (String(l.fecha_alta_estimada).slice(0, 10) >= hoy) return;
    const jugador = jugadoresMap.get(l.jugador_id) || jugadoresMap.get(String(l.jugador_id));
    alertas.push({
      id: `lesion-vencida-${l.id}`,
      categoria: "lesiones",
      prioridad: "importante",
      titulo: `${jugador ? nombreJug(jugador) : "Un jugador"}: venció el alta estimada`,
      sub: `${l.zona || "Lesión"} · confirmá el alta o corré la fecha`,
      ruta: "/enfermeria",
    });
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
    alertasLesiones(clubId, jugadoresMap),
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

/* Devuelve qué pasó con cada envío en vez de tragárselo en un console.error.
   Antes la función podía contestar 200 con digestsEnviados: 1 aunque los
   push hubieran rebotado todos, y desde el SQL no había forma de notarlo. */
async function enviarATodos(subs: any[], payload: object) {
  const parte = { intentados: subs.length, entregados: 0, vencidos: 0, fallados: 0,
                  errores: [] as string[] };

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        parte.entregados++;
      } catch (err: any) {
        const corto = String(s.endpoint).slice(-12);
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          // Suscripción muerta (usuario desinstaló / revocó el permiso) -> la limpiamos
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          parte.vencidos++;
          parte.errores.push(`…${corto}: vencida (${err.statusCode}), borrada`);
        } else {
          parte.fallados++;
          /* El 403 acá casi siempre es lo mismo: la suscripción se creó con
             una clave VAPID distinta de la que firma ahora. */
          const pista = err?.statusCode === 403
            ? " — suele ser que la suscripción se creó con otra clave VAPID; hay que volver a activar en el dispositivo"
            : "";
          parte.errores.push(`…${corto}: ${err?.statusCode || "?"} ${err?.message || err}${pista}`);
          console.error(`Error enviando push a ${s.endpoint}:`, err?.message || err);
        }
      }
    })
  );
  return parte;
}

/* Una plantilla de WhatsApp. Devuelve true si Meta la aceptó. */
async function enviarPlantillaWhatsApp(telefono: string, plantilla: string, parametros: string[]) {
  if (!WA_TOKEN || !WA_PHONE_ID) return { ok: false, error: "faltan WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID" };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: plantilla,
          language: { code: WA_IDIOMA },
          components: parametros.length
            ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: t })) }]
            : [],
        },
      }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ============================================================================
// Avisos personales a cada JUGADOR
//
// Van a las suscripciones con jugador_id (las da de alta el jugador desde su
// menú del kiosco) y, si hay plantilla cargada, a su WhatsApp (jugadores.
// contacto). Nunca al staff, y el staff nunca recibe estos.
// ============================================================================

type Resumen = { push: number; whatsapp: number; errores: string[] };

async function avisosAJugadores(clubId: string, subsJugadores: any[], sumar: (p: any) => void): Promise<Record<string, Resumen>> {
  const { fecha: hoy, hora, anio } = ahoraArgentina();
  const res: Record<string, Resumen> = {
    cumple: { push: 0, whatsapp: 0, errores: [] },
    wellness: { push: 0, whatsapp: 0, errores: [] },
    citacion: { push: 0, whatsapp: 0, errores: [] },
    cuota: { push: 0, whatsapp: 0, errores: [] },
  };

  /* --- 💵 CUOTA DEL MES (antes que nada: se genera aunque nadie tenga push) ---
     generar_cuotas_mes() no duplica, así que se llama en cada corrida: si el
     cron no corrió el día 1, las genera en la siguiente. Devuelve sólo las
     que creó ahora, que son las que se avisan. */
  let cuotasNuevas: any[] = [];
  const { data: cfg, error: errCfg } = await supabase.from("tesoreria_config")
    .select("cuota_automatica").eq("club_id", clubId).maybeSingle();
  if (errCfg && !/does not exist|Could not find/i.test(errCfg.message)) res.cuota.errores.push(`config: ${errCfg.message}`);
  if (cfg?.cuota_automatica) {
    const { data, error } = await supabase.rpc("generar_cuotas_mes", { p_club_id: clubId, p_periodo: hoy.slice(0, 7) });
    if (error) res.cuota.errores.push(`generar: ${error.message}`);
    else cuotasNuevas = data || [];
  }

  const hayWhatsApp = !!(WA_TOKEN && WA_PHONE_ID && (WA_PLANTILLA.wellness || WA_PLANTILLA.cumple || WA_PLANTILLA.citacion || WA_PLANTILLA.cuota));
  if (subsJugadores.length === 0 && !hayWhatsApp) return res;

  // select("*") a propósito: `activo` y `contacto` pueden no existir en un
  // proyecto viejo, y pedirlas por nombre rompería la consulta entera.
  const { data: jugadoresData } = await supabase.from("jugadores").select("*").eq("club_id", clubId);
  const jugadores = (jugadoresData || []).filter((j: any) => j.activo !== false);

  const subsDe = new Map<string, any[]>();
  subsJugadores.forEach((s: any) => {
    const k = String(s.jugador_id);
    if (!subsDe.has(k)) subsDe.set(k, []);
    subsDe.get(k)!.push(s);
  });

  /* Manda un aviso por push y/o WhatsApp, una sola vez por run_key. */
  const avisar = async (
    tipo: keyof typeof res, j: any, runKey: string,
    push: { title: string; body: string; tag: string },
    wa: { plantilla?: string | null; parametros: string[]; runKey?: string } | null,
  ) => {
    const subs = subsDe.get(String(j.id)) || [];
    if (subs.length > 0 && !(await yaNotificado(clubId, runKey))) {
      const parte = await enviarATodos(subs, { ...push, data: { url: "/kiosco" } });
      sumar(parte);
      res[tipo].push += parte.entregados;
      await marcarNotificado(clubId, runKey);
    }

    const tel = telefonoWhatsApp(j.contacto);
    const keyWa = wa?.runKey || `${runKey}-wa`;
    if (wa?.plantilla && tel && WA_TOKEN && WA_PHONE_ID && !(await yaNotificado(clubId, keyWa))) {
      const r = await enviarPlantillaWhatsApp(tel, wa.plantilla, wa.parametros);
      if (r.ok) res[tipo].whatsapp++;
      else res[tipo].errores.push(`${nombreJug(j)}: ${r.error}`);
      // Se marca aunque falle: un número mal cargado no puede reintentarse
      // en cada corrida del cron, todo el día.
      await marcarNotificado(clubId, keyWa);
    }
  };

  // --- 🎂 CUMPLEAÑOS ---
  for (const j of jugadores) {
    if (!esCumpleHoy(j.fechanac, hoy)) continue;
    await avisar("cumple", j, `cumple-jug-${j.id}-${anio}`, {
      title: `🎂 ¡Feliz cumple, ${j.nombre || "crack"}!`,
      body: "Que tengas un gran día. Un abrazo de todo el club 💚",
      tag: `cumple-${j.id}`,
    }, { plantilla: WA_PLANTILLA.cumple, parametros: [j.nombre || ""] });
  }

  // --- ⚖️ RECORDATORIO DE WELLNESS ---
  if (hora >= RECORDATORIO_DESDE_HORA && hora < RECORDATORIO_HASTA_HORA) {
    const { data: wHoy } = await supabase.from("wellness").select("jugador_id, sueno, estres, fatiga, dolor_muscular")
      .eq("club_id", clubId).eq("fecha", hoy);
    // Cuenta como cargado si respondió el "cómo llego"; sólo el RPE no.
    const cargaron = new Set((wHoy || [])
      .filter((w: any) => ["sueno", "estres", "fatiga", "dolor_muscular"].some((c) => w[c] !== null && w[c] !== undefined))
      .map((w: any) => String(w.jugador_id)));

    const franja = Math.floor(hora / RECORDATORIO_WELLNESS_HORAS);
    for (const j of jugadores) {
      if (cargaron.has(String(j.id))) continue;
      await avisar("wellness", j, `wellness-jug-${hoy}-f${franja}-${j.id}`, {
        title: "⚖️ Te falta el wellness de hoy",
        body: `${j.nombre ? `${j.nombre}, c` : "C"}argalo en un minuto: sueño, fatiga, dolor y cómo venís.`,
        tag: `wellness-${hoy}`,
      }, hora >= WA_WELLNESS_DESDE_HORA
        ? { plantilla: WA_PLANTILLA.wellness, parametros: [j.nombre || ""], runKey: `wellness-jug-wa-${hoy}-${j.id}` }
        : null);
    }
  }

  // --- 📣 CITACIÓN: a cada convocado, cuando se publica ---
  const { data: conCitacion, error: errCit } = await supabase
    .from("partidos")
    .select("id, fecha, rival, condicion, hora_citacion, plantilla")
    .eq("club_id", clubId)
    .eq("estado", "Pendiente")
    .gte("fecha", hoy)
    .not("citacion->>publicada_at", "is", null);

  if (errCit) {
    res.citacion.errores.push(`lectura: ${errCit.message}`);
  } else {
    const porId = new Map(jugadores.map((j: any) => [String(j.id), j]));
    for (const p of conCitacion || []) {
      const partes = String(p.fecha || "").slice(0, 10).split("-");
      const cuando = partes.length === 3 ? `${partes[2]}/${partes[1]}` : String(p.fecha || "");
      for (const id of convocadosDe(p)) {
        const j = porId.get(id);
        if (!j) continue;
        await avisar("citacion", j, `citacion-jug-${p.id}-${id}`, {
          title: `📣 Estás citado vs ${p.rival || "rival"}`,
          body: [cuando, p.hora_citacion ? `presentarse ${p.hora_citacion}` : null, p.condicion].filter(Boolean).join(" · "),
          tag: `citacion-${p.id}`,
        }, { plantilla: WA_PLANTILLA.citacion, parametros: [j.nombre || "", p.rival || "rival", cuando, p.hora_citacion || "a confirmar"] });
      }
    }
  }

  // --- 💵 AVISO DE LA CUOTA NUEVA ---
  if (cuotasNuevas.length > 0) {
    const porId = new Map<string, any>(jugadores.map((j: any) => [String(j.id), j]));
    for (const c of cuotasNuevas) {
      const j = porId.get(String(c.jugador_id));
      if (!j) continue;
      const monto = `$${Number(c.monto).toLocaleString("es-AR")}`;
      const [a, m, d] = String(c.fecha_vencimiento || "").split("-");
      const vence = d ? `${d}/${m}` : "";
      await avisar("cuota", j, `cuota-${c.deuda_id}`, {
        title: `💵 ${c.concepto}`,
        body: `${monto}${vence ? ` · vence el ${vence}` : ""}. Mirá cómo pagar en tu menú.`,
        tag: `cuota-${String(c.concepto).replace(/\s+/g, "-")}`,
      }, { plantilla: WA_PLANTILLA.cuota, parametros: [j.nombre || "", c.concepto, monto, vence || String(a || "")] });
    }
  }

  return res;
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

  /* Antes que nada: si faltan secretos, decirlo. Es un 500, pero uno que se
     puede leer desde `select content from net._http_response`. */
  if (errorDeArranque) {
    return new Response(JSON.stringify({ ok: false, error: errorDeArranque }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  /* Esta función se despliega con verify_jwt = false, porque la invoca
     pg_cron y no una persona: pedirle un JWT del proyecto no aporta nada y
     era justamente lo que la dejaba afuera con 401. Su autenticación es el
     x-cron-secret, así que acá se falla cerrado: si el secreto no está
     configurado no se atiende a nadie. Antes era opcional, y esa
     combinación (sin JWT y sin secreto) dejaría la función abierta. */
  if (!CRON_SECRET) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Falta el secreto CRON_SECRET del Edge Function. Se carga con: " +
             "supabase secrets set CRON_SECRET=<un valor largo al azar>, y tiene que " +
             "ser el mismo que el cron manda en el header x-cron-secret.",
    }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({
      ok: false,
      error: "El header x-cron-secret no coincide con el secreto CRON_SECRET.",
    }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const hoy = hoyISO();
  const { data: clubes } = await supabase.from("clubes").select("id").eq("suscripcion_activa", true);

  let clubesConPush = 0;
  let digestsEnviados = 0;
  let previasEnviadas = 0;
  let citacionesEnviadas = 0;
  const entregas = { intentados: 0, entregados: 0, vencidos: 0, fallados: 0, errores: [] as string[] };
  const sumar = (p: Awaited<ReturnType<typeof enviarATodos>>) => {
    entregas.intentados += p.intentados;
    entregas.entregados += p.entregados;
    entregas.vencidos   += p.vencidos;
    entregas.fallados   += p.fallados;
    entregas.errores.push(...p.errores);
  };

  const avisosJugadores = {
    cumple:   { push: 0, whatsapp: 0, errores: [] as string[] },
    wellness: { push: 0, whatsapp: 0, errores: [] as string[] },
    citacion: { push: 0, whatsapp: 0, errores: [] as string[] },
    cuota:    { push: 0, whatsapp: 0, errores: [] as string[] },
  };

  for (const club of clubes || []) {
    const clubId = club.id;

    /* select("*") y el reparto en JS, a propósito: si la migración que agrega
       `jugador_id` no se corrió, filtrar por esa columna rompería la consulta
       y el staff se quedaría sin ningún push. Sin la columna, todas son del
       staff, como siempre. */
    const { data: todas } = await supabase.from("push_subscriptions").select("*").eq("club_id", clubId);
    const subs = (todas || []).filter((s: any) => s.jugador_id == null);
    const subsJugadores = (todas || []).filter((s: any) => s.jugador_id != null);

    /* Los avisos personales de los jugadores van primero y aparte: un club
       sin staff suscripto igual les tiene que avisar a sus jugadores. */
    try {
      const r = await avisosAJugadores(clubId, subsJugadores, sumar);
      (Object.keys(r) as (keyof typeof avisosJugadores)[]).forEach((k) => {
        avisosJugadores[k].push += r[k].push;
        avisosJugadores[k].whatsapp += r[k].whatsapp;
        avisosJugadores[k].errores.push(...r[k].errores);
      });
    } catch (err: any) {
      avisosJugadores.wellness.errores.push(`club ${clubId}: ${err?.message || err}`);
    }

    if (subs.length === 0) continue;
    clubesConPush++;

    // --- DIGEST: una vez por día, con TODO (bloqueante + importante + info) ---
    const runKeyDigest = `digest-${hoy}`;
    if (!(await yaNotificado(clubId, runKeyDigest))) {
      const alertas = await calcularAlertasDelClub(clubId);
      if (alertas.length > 0) {
        const top = alertas.slice(0, 3).map((a) => a.titulo).join(" · ");
        const resto = alertas.length > 3 ? ` y ${alertas.length - 3} más` : "";
        sumar(await enviarATodos(subs, {
          title: `Virtual.Club — ${alertas.length} pendiente${alertas.length === 1 ? "" : "s"}`,
          body: top + resto,
          tag: "tablon-digest",
          data: { url: "/inicio" },
        }));
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
        sumar(await enviarATodos(subs, {
          title: `⚽ Partido vs ${partidoHoy.rival || "rival"} en ${Math.max(1, Math.round(horas))}hs`,
          body: `${partidoHoy.condicion || ""}${partidoHoy.horario ? ` · ${partidoHoy.horario}` : ""}`,
          tag: `previa-${partidoHoy.id}`,
          data: { url: `/torneos?partido=${partidoHoy.id}` },
        }));
        await marcarNotificado(clubId, runKeyPrevia);
        previasEnviadas++;
      }
    }

    /* --- CITACIÓN PUBLICADA: un push por partido ---------------------------
       La pantalla de CITACIÓN marca `partidos.citacion.publicada_at` cuando el
       técnico publica la convocatoria en el Tablón. Acá se avisa una sola vez
       por partido (dedupe por run_key), en la próxima corrida del cron.

       Si la migración de la citación todavía no se corrió, la columna no
       existe: el select falla, se loguea y se sigue con el resto. */
    const { data: conCitacion, error: errorCitacion } = await supabase
      .from("partidos")
      .select("id, fecha, rival, condicion, hora_citacion")
      .eq("club_id", clubId)
      .eq("estado", "Pendiente")
      .gte("fecha", hoy)
      .not("citacion->>publicada_at", "is", null);

    if (errorCitacion) {
      console.error("Citación push (¿falta correr la migración 20260911120000?):", errorCitacion.message);
    } else {
      for (const p of conCitacion || []) {
        const runKeyCitacion = `citacion-${p.id}`;
        if (await yaNotificado(clubId, runKeyCitacion)) continue;

        const partes = String(p.fecha || "").split("-");
        const cuando = partes.length === 3 ? `${partes[2]}/${partes[1]}` : String(p.fecha || "");
        const detalle = [cuando, p.hora_citacion ? `citados ${p.hora_citacion}` : null, p.condicion]
          .filter(Boolean).join(" · ");

        sumar(await enviarATodos(subs, {
          title: `📣 Citación vs ${p.rival || "rival"}`,
          body: detalle || "Mirá la convocatoria en el Tablón",
          tag: runKeyCitacion,
          data: { url: "/inicio" },
        }));
        await marcarNotificado(clubId, runKeyCitacion);
        citacionesEnviadas++;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, clubesConPush, digestsEnviados, previasEnviadas, citacionesEnviadas, avisosJugadores, entregas }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});