// Edge Function: whatsapp-webhook  [VERSIÓN CON LOGS DE DIAGNÓSTICO]
//
// CAMBIOS respecto a la versión anterior que te pasé:
//   1. Log del body completo apenas entra el POST
//   2. enviarWhatsApp() ahora lee la respuesta de Meta y la loguea (antes fallaba en silencio)
//   3. Los errores de Supabase se loguean en vez de ignorarse
//   4. req.json() movido adentro del try
// La lógica del flujo (identificación + wizard) es exactamente la misma.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;

const PREGUNTAS_WELLNESS = [
  { paso: "sueno", texto: "😴 ¿Cómo dormiste anoche? Respondé un número del 1 (mal) al 5 (excelente)." },
  { paso: "estres", texto: "💆‍♂️ ¿Nivel de estrés hoy? 1 (nada) al 5 (mucho)." },
  { paso: "fatiga", texto: "🥱 ¿Fatiga general? 1 (fresco) al 5 (muy cansado)." },
  { paso: "dolor_muscular", texto: "🦵 ¿Dolor muscular? 1 (nada) al 5 (mucho)." },
  { paso: "animo", texto: "🎭 ¿Estado de ánimo? 1 (apagado) al 5 (excelente)." },
  { paso: "motivacion", texto: "🔥 ¿Motivación para entrenar/jugar? 1 al 5." },
  { paso: "ansiedad", texto: "🌬️ ¿Nivel de ansiedad? 1 (relajado) al 5 (nervioso)." },
  { paso: "confianza", texto: "🎯 ¿Confianza y foco? 1 al 5." },
];

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    console.log("[GET] verificación de webhook. mode:", mode);

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    // >>> CAMBIO 1: esto es lo más importante. Si esto no aparece en los logs,
    //     Meta directamente no le está pegando a tu función.
    console.log("[POST] body recibido:", JSON.stringify(body));

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const mensaje = change?.value?.messages?.[0];

    if (!mensaje) {
      console.log("[POST] sin mensaje (probablemente un status de entrega). Ignorado.");
      return new Response("ok", { status: 200 });
    }

    const telefono = mensaje.from as string;
    const textoRecibido: string = mensaje.text?.body?.trim() ?? "";
    console.log(`[POST] mensaje de ${telefono}: "${textoRecibido}"`);

    await manejarMensaje(telefono, textoRecibido);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[ERROR] procesando webhook:", err);
    return new Response("ok", { status: 200 });
  }
});

async function manejarMensaje(telefono: string, texto: string) {
  const { data: jugadorVinculado, error } = await supabase
    .from("jugadores")
    .select("id, nombre, apellido, club_id")
    .eq("contacto", telefono)
    .maybeSingle();

  if (error) console.error("[DB] error buscando jugador por contacto:", error.message);
  console.log("[FLUJO] jugador vinculado:", jugadorVinculado?.id ?? "ninguno");

  if (jugadorVinculado) {
    await manejarFlujoConocido(telefono, texto, jugadorVinculado);
    return;
  }
  await manejarIdentificacion(telefono, texto);
}

async function manejarIdentificacion(telefono: string, texto: string) {
  const { data: sesion, error: errSesion } = await supabase
    .from("bot_sesiones")
    .select("*")
    .eq("telefono", telefono)
    .maybeSingle();

  if (errSesion) console.error("[DB] error leyendo bot_sesiones:", errSesion.message);

  if (!sesion || !sesion.club_id) {
    const match = texto.match(/CLUB-([0-9a-fA-F-]{36})/);
    console.log("[IDENT] match de UUID de club:", match?.[1] ?? "no matcheó");

    if (!match) {
      await enviarWhatsApp(telefono, "Hola! 👋 Para empezar necesito el link o código que te compartió tu club (algo como CLUB-xxxxxxxx). Pedíselo a tu técnico si no lo tenés.");
      return;
    }

    const clubId = match[1];
    const { data: club, error: errClub } = await supabase
      .from("clubes").select("id, nombre").eq("id", clubId).maybeSingle();

    if (errClub) console.error("[DB] error buscando club:", errClub.message);
    console.log("[IDENT] club encontrado:", club?.nombre ?? "ninguno");

    if (!club) {
      await enviarWhatsApp(telefono, "No encontré ese club 🤔 Revisá el código con tu técnico.");
      return;
    }

    const { error: errUpsert } = await supabase.from("bot_sesiones").upsert({
      telefono,
      club_id: club.id,
      flujo_activo: "identificacion_jugador",
    }, { onConflict: "telefono" });

    if (errUpsert) console.error("[DB] error creando sesión:", errUpsert.message);

    await enviarWhatsApp(telefono, `Buenísimo, ${club.nombre} 🙌 Ahora decime tu *apellido* y tu *PIN de 4 dígitos* (el mismo que usás en el Kiosco), separados por un espacio. Ej: "Fernandez 4821"`);
    return;
  }

  const partes = texto.trim().split(/\s+/);
  const pin = partes.pop();
  const apellido = partes.join(" ");

  if (!apellido || !pin || !/^\d{4}$/.test(pin)) {
    await enviarWhatsApp(telefono, 'Formato inválido. Mandame tu apellido y tu PIN de 4 dígitos así: "Fernandez 4821"');
    return;
  }

  const { data: jugador, error: errJug } = await supabase
    .from("jugadores")
    .select("id, nombre, apellido")
    .eq("club_id", sesion.club_id)
    .eq("pin_kiosco", pin)
    .ilike("apellido", apellido)
    .maybeSingle();

  if (errJug) console.error("[DB] error buscando jugador por PIN:", errJug.message);
  console.log("[IDENT] jugador matcheado:", jugador?.id ?? "ninguno");

  if (!jugador) {
    await enviarWhatsApp(telefono, "No encontré a nadie con ese apellido y PIN en tu club. Probá de nuevo o pedile ayuda a tu técnico.");
    return;
  }

  await supabase.from("jugadores").update({ contacto: telefono }).eq("id", jugador.id);
  await supabase.from("bot_sesiones").delete().eq("telefono", telefono);

  await enviarWhatsApp(telefono, `Listo, ${jugador.nombre} 🎉 Tu WhatsApp ya quedó vinculado a tu ficha. Escribime "Wellness" cuando quieras cargar tus datos del día.`);
}

async function manejarFlujoConocido(telefono: string, texto: string, jugador: { id: number; nombre: string; club_id: string }) {
  const { data: sesion } = await supabase
    .from("bot_sesiones").select("*").eq("telefono", telefono).maybeSingle();

  if (!sesion) {
    if (/wellness/i.test(texto)) {
      const { error } = await supabase.from("bot_sesiones").upsert({
        telefono,
        club_id: jugador.club_id,
        jugador_id: jugador.id,
        flujo_activo: "wellness",
        paso_actual: PREGUNTAS_WELLNESS[0].paso,
        respuestas_parciales: {},
      }, { onConflict: "telefono" });
      if (error) console.error("[DB] error iniciando wellness:", error.message);

      await enviarWhatsApp(telefono, `Dale ${jugador.nombre} 💪 Arrancamos con el Wellness de hoy.\n\n${PREGUNTAS_WELLNESS[0].texto}`);
      return;
    }
    await enviarWhatsApp(telefono, `Hola ${jugador.nombre}! Escribime "Wellness" para cargar tus datos del día.`);
    return;
  }

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

  const { data: sesionCompleta } = await supabase
    .from("bot_sesiones").select("club_id, jugador_id").eq("telefono", telefono).single();

  const { error: errWellness } = await supabase.from("wellness").upsert({
    club_id: sesionCompleta!.club_id,
    jugador_id: sesionCompleta!.jugador_id,
    fecha: new Date().toISOString().slice(0, 10),
    ...respuestas,
  }, { onConflict: "jugador_id,fecha" });

  if (errWellness) console.error("[DB] error guardando wellness:", errWellness.message);

  await supabase.from("bot_sesiones").delete().eq("telefono", telefono);
  await enviarWhatsApp(telefono, `Guardado ✅ Gracias ${nombreJugador}, que tengas buen día.`);
}

// >>> CAMBIO 2: antes esta función ignoraba la respuesta de Meta.
// Ahora la lee y la loguea, así vemos si el token expiró (401) u otro error.
async function enviarWhatsApp(telefono: string, texto: string) {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
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

    const respuesta = await res.text();
    if (!res.ok) {
      console.error(`[META] error ${res.status} al enviar:`, respuesta);
    } else {
      console.log("[META] enviado ok:", respuesta);
    }
  } catch (err) {
    console.error("[META] excepción al enviar:", err);
  }
}