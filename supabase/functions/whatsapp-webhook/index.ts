// Edge Function: whatsapp-webhook
// Recibe mensajes de WhatsApp Cloud API, identifica club + jugador,
// y corre el wizard de carga de Wellness.
//
// Secrets necesarios (supabase secrets set ...):
//   WHATSAPP_VERIFY_TOKEN   -> el que vos elijas, se lo pasás a Meta al configurar el webhook
//   WHATSAPP_ACCESS_TOKEN   -> token permanente de la app de Meta for Developers
//   WHATSAPP_PHONE_NUMBER_ID-> el "Phone number ID" que te da Meta (no es el número en sí)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> ya vienen inyectados por Supabase en Edge Functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WHATSAPP_TOKEN = Deno.env.get("EAAd0ZAbMCIygBSG8N6nOEhJmGFQIXBXa8rjjmFmlnUDPUwqgZAZBNxrbwjGUU9LO7ZAwOLm0yIrvz88veYQ8nhPFmilRefuAP3lSSkr0ulbxiakrACI4dZCbex0YEaToFyAFhACZA96UuhvuQmVehcfBfCpBEFdvxdHbDxC5rFZBO97F3QXpYVULL0duEk05sg9sqkYDnXOPF1oeMYZCTHoSZBm1UJVboZANzKGNtmGxxZB1YPju1BBdpfyP9ZARouWFefCyxBU3fzwEaWkZCHOlMorEZD")!;
const PHONE_NUMBER_ID = Deno.env.get("1340486405803611")!;
const VERIFY_TOKEN = Deno.env.get("virtualclub2026secreto")!;

const PREGUNTAS_WELLNESS = [
  { paso: "sueno", texto: "😴 ¿Cómo dormiste anoche? Respondé un número del 1 (mal) al 5 (excelente).", bloque: "readiness" },
  { paso: "estres", texto: "💆‍♂️ ¿Nivel de estrés hoy? 1 (nada) al 5 (mucho).", bloque: "readiness" },
  { paso: "fatiga", texto: "🥱 ¿Fatiga general? 1 (fresco) al 5 (muy cansado).", bloque: "readiness" },
  { paso: "dolor_muscular", texto: "🦵 ¿Dolor muscular? 1 (nada) al 5 (mucho).", bloque: "readiness" },
  { paso: "animo", texto: "🎭 ¿Estado de ánimo? 1 (apagado) al 5 (excelente).", bloque: "mental" },
  { paso: "motivacion", texto: "🔥 ¿Motivación para entrenar/jugar? 1 al 5.", bloque: "mental" },
  { paso: "ansiedad", texto: "🌬️ ¿Nivel de ansiedad? 1 (relajado) al 5 (nervioso).", bloque: "mental" },
  { paso: "confianza", texto: "🎯 ¿Confianza y foco? 1 al 5.", bloque: "mental" },
];

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Verificación del webhook (Meta la pide una sola vez al configurarlo) ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();

  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const mensaje = change?.value?.messages?.[0];

    if (!mensaje) {
      // Puede ser un evento de "status" (entregado/leído), no un mensaje nuevo. Lo ignoramos.
      return new Response("ok", { status: 200 });
    }

    const telefono = mensaje.from as string; // viene en formato internacional sin "+"
    const textoRecibido: string = mensaje.text?.body?.trim() ?? "";

    await manejarMensaje(telefono, textoRecibido);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Error procesando webhook:", err);
    // Igual devolvemos 200: si le devolvés error, Meta reintenta el mismo mensaje varias veces.
    return new Response("ok", { status: 200 });
  }
});

async function manejarMensaje(telefono: string, texto: string) {
  // 1. ¿Este teléfono ya está vinculado a un jugador?
  const { data: jugadorVinculado } = await supabase
    .from("jugadores")
    .select("id, nombre, apellido, club_id")
    .eq("contacto", telefono)
    .maybeSingle();

  if (jugadorVinculado) {
    await manejarFlujoConocido(telefono, texto, jugadorVinculado);
    return;
  }

  // 2. No está vinculado -> flujo de identificación
  await manejarIdentificacion(telefono, texto);
}

// --- FLUJO DE IDENTIFICACIÓN (club + apellido + PIN) ---
async function manejarIdentificacion(telefono: string, texto: string) {
  const { data: sesion } = await supabase
    .from("bot_sesiones")
    .select("*")
    .eq("telefono", telefono)
    .maybeSingle();

  // 2a. Primer contacto: esperamos el link con "CLUB-<uuid>" o que nos escriban el código a mano.
  if (!sesion || !sesion.club_id) {
    const match = texto.match(/CLUB-([0-9a-fA-F-]{36})/);
    if (!match) {
      await enviarWhatsApp(telefono, "Hola! 👋 Para empezar necesito el link o código que te compartió tu club (algo como CLUB-xxxxxxxx). Pedíselo a tu técnico si no lo tenés.");
      return;
    }

    const clubId = match[1];
    const { data: club } = await supabase.from("clubes").select("id, nombre").eq("id", clubId).maybeSingle();
    if (!club) {
      await enviarWhatsApp(telefono, "No encontré ese club 🤔 Revisá el código con tu técnico.");
      return;
    }

    await supabase.from("bot_sesiones").upsert({
      telefono,
      club_id: club.id,
      flujo_activo: "identificacion_jugador",
    }, { onConflict: "telefono" });

    await enviarWhatsApp(telefono, `Buenísimo, ${club.nombre} 🙌 Ahora decime tu *apellido* y tu *PIN de 4 dígitos* (el mismo que usás en el Kiosco), separados por un espacio. Ej: "Fernandez 4821"`);
    return;
  }

  // 2b. Ya tenemos club, falta identificar al jugador con apellido + PIN
  const partes = texto.trim().split(/\s+/);
  const pin = partes.pop();
  const apellido = partes.join(" ");

  if (!apellido || !pin || !/^\d{4}$/.test(pin)) {
    await enviarWhatsApp(telefono, 'Formato inválido. Mandame tu apellido y tu PIN de 4 dígitos así: "Fernandez 4821"');
    return;
  }

  const { data: jugador } = await supabase
    .from("jugadores")
    .select("id, nombre, apellido")
    .eq("club_id", sesion.club_id)
    .eq("pin_kiosco", pin)
    .ilike("apellido", apellido)
    .maybeSingle();

  if (!jugador) {
    await enviarWhatsApp(telefono, "No encontré a nadie con ese apellido y PIN en tu club. Probá de nuevo o pedile ayuda a tu técnico.");
    return;
  }

  // Vinculamos el teléfono al jugador y cerramos el flujo de identificación
  await supabase.from("jugadores").update({ contacto: telefono }).eq("id", jugador.id);
  await supabase.from("bot_sesiones").delete().eq("telefono", telefono);

  await enviarWhatsApp(telefono, `Listo, ${jugador.nombre} 🎉 Tu WhatsApp ya quedó vinculado a tu ficha. Escribime "Wellness" cuando quieras cargar tus datos del día.`);
}

// --- FLUJO CONOCIDO: jugador ya identificado ---
async function manejarFlujoConocido(telefono: string, texto: string, jugador: { id: number; nombre: string; club_id: string }) {
  const { data: sesion } = await supabase
    .from("bot_sesiones")
    .select("*")
    .eq("telefono", telefono)
    .maybeSingle();

  // Sin sesión activa: interpretamos el mensaje como un disparador de flujo
  if (!sesion) {
    if (/wellness/i.test(texto)) {
      await supabase.from("bot_sesiones").upsert({
        telefono,
        club_id: jugador.club_id,
        jugador_id: jugador.id,
        flujo_activo: "wellness",
        paso_actual: PREGUNTAS_WELLNESS[0].paso,
        respuestas_parciales: {},
      }, { onConflict: "telefono" });

      await enviarWhatsApp(telefono, `Dale ${jugador.nombre} 💪 Arrancamos con el Wellness de hoy.\n\n${PREGUNTAS_WELLNESS[0].texto}`);
      return;
    }

    await enviarWhatsApp(telefono, `Hola ${jugador.nombre}! Escribime "Wellness" para cargar tus datos del día.`);
    return;
  }

  // Con sesión activa en flujo "wellness": procesamos la respuesta del paso actual
  if (sesion.flujo_activo === "wellness") {
    await procesarPasoWellness(telefono, texto, sesion, jugador.nombre);
  }
}

async function procesarPasoWellness(
  telefono: string,
  texto: string,
  sesion: { paso_actual: string; respuestas_parciales: Record<string, number> },
  nombreJugador: string,
) {
  const valor = parseInt(texto, 10);
  if (isNaN(valor) || valor < 1 || valor > 5) {
    await enviarWhatsApp(telefono, "Respondé con un número del 1 al 5, porfa 🙏");
    return;
  }

  const respuestas = { ...sesion.respuestas_parciales, [sesion.paso_actual]: valor };
  const indiceActual = PREGUNTAS_WELLNESS.findIndex((p) => p.paso === sesion.paso_actual);
  const siguiente = PREGUNTAS_WELLNESS[indiceActual + 1];

  if (siguiente) {
    await supabase.from("bot_sesiones").update({
      paso_actual: siguiente.paso,
      respuestas_parciales: respuestas,
    }).eq("telefono", telefono);

    await enviarWhatsApp(telefono, siguiente.texto);
    return;
  }

  // Era la última pregunta: guardamos en la tabla wellness real y cerramos la sesión
  const { data: sesionCompleta } = await supabase
    .from("bot_sesiones")
    .select("club_id, jugador_id")
    .eq("telefono", telefono)
    .single();

  await supabase.from("wellness").upsert({
    club_id: sesionCompleta!.club_id,
    jugador_id: sesionCompleta!.jugador_id,
    fecha: new Date().toISOString().slice(0, 10),
    ...respuestas,
  }, { onConflict: "jugador_id,fecha" });

  await supabase.from("bot_sesiones").delete().eq("telefono", telefono);

  await enviarWhatsApp(telefono, `Guardado ✅ Gracias ${nombreJugador}, que tengas buen día.`);
}

// --- Envío de mensajes vía WhatsApp Cloud API ---
async function enviarWhatsApp(telefono: string, texto: string) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono,
      type: "text",
      text: { body: texto },
    }),
  });
}