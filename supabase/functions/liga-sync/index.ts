// supabase/functions/liga-sync/index.ts
//
// AFA Stats / Otras competencias: baja los partidos de segundopalo.com (las
// mismas consultas que 1ra-scraper.js e inf-scraper.js) y los guarda en
// liga_partidos. No depende de ningún club: la liga es una sola para todos.
//
// Pedido (POST, con la sesión del usuario):
//   { modo: 'previa' | 'aplicar', competencias?: string[] }
//   - previa:  consulta segundopalo y devuelve qué cambiaría, sin guardar.
//   - aplicar: lo mismo, y guarda. Volver a correrlo no duplica nada: cada
//              partido se identifica por su id en segundopalo.
//   Sin `competencias`, van todas las activas.
//
// Quién puede: cualquier perfil que no sea jugador ni kiosco. Leer los datos
// lo puede todo el mundo (ver la migración liga_afa).

import { createClient } from "npm:@supabase/supabase-js@2";
import { consultaDe, planificar } from "./logica.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* La clave pública (anon) de la API de segundopalo, la misma que usa su web y
   los scrapers. Si algún día la cambian, se pisa con el secreto. */
const SEGUNDOPALO_URL = "https://api.segundopalo.com/rest/v1/rpc/";
const SEGUNDOPALO_KEY = Deno.env.get("SEGUNDOPALO_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyaWtxdmt2YW1rd3puY29qenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg1MzE4NTIsImV4cCI6MjA0NDEwNzg1Mn0.N51Fk5my1gPmPfSuL92yQhWEQZCdrjwTCj_dTCn6xdo";

/* Una consulta atrás de la otra con una pausa corta: son 28 pedidos y no
   queremos que segundopalo nos vea como un ataque. */
const PAUSA_MS = 150;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function consultarSegundopalo(competencia: Record<string, unknown>) {
  const { rpc, cuerpo, normalizar } = consultaDe(competencia);
  const res = await fetch(SEGUNDOPALO_URL + rpc, {
    method: "POST",
    headers: {
      apikey: SEGUNDOPALO_KEY,
      Authorization: `Bearer ${SEGUNDOPALO_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`la fuente de AFA Futsal respondió ${res.status}`);
  const datos = await res.json();
  if (!Array.isArray(datos)) throw new Error("la fuente de AFA Futsal no devolvió una lista");
  return datos.map(normalizar);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Usá POST" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Quién pide ──────────────────────────────────────────────────────────
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: usuario } = token ? await admin.auth.getUser(token) : { data: null };
  if (!usuario?.user) return responder({ error: "Tenés que iniciar sesión" }, 401);
  const { data: perfil } = await admin.from("perfiles").select("rol").eq("id", usuario.user.id).maybeSingle();
  if (!perfil || ["jugador", "kiosco"].includes(String(perfil.rol))) {
    return responder({ error: "Tu usuario no puede actualizar los datos de la liga" }, 403);
  }

  let pedido: { modo?: string; competencias?: string[] } = {};
  try { pedido = await req.json(); } catch { /* cuerpo vacío: previa de todo */ }
  const aplicar = pedido.modo === "aplicar";

  // ── Qué se baja ─────────────────────────────────────────────────────────
  let consulta = admin.from("liga_competencias").select("*").eq("activa", true).order("orden");
  if (Array.isArray(pedido.competencias) && pedido.competencias.length) {
    consulta = consulta.in("id", pedido.competencias);
  }
  const { data: competencias, error: errComp } = await consulta;
  if (errComp) return responder({ error: errComp.message }, 500);

  const resultado = [];
  for (const [i, comp] of (competencias || []).entries()) {
    if (i > 0) await dormir(PAUSA_MS);
    const fila: Record<string, unknown> = { id: comp.id, nombre: comp.nombre };
    try {
      const recibidos = await consultarSegundopalo(comp);
      const { data: existentes, error: errEx } = await admin
        .from("liga_partidos").select("*").eq("competencia_id", comp.id);
      if (errEx) throw new Error(errEx.message);

      const { guardar, resumen } = planificar(existentes || [], recibidos);
      Object.assign(fila, resumen, { recibidos: recibidos.length });

      /* Para la vista previa: los resultados nuevos, que es lo que más
         interesa ver antes de confirmar. */
      const previos = new Map((existentes || []).map((e) => [Number(e.id_externo), e]));
      fila.muestra = guardar
        .filter((p) => /^finalizado$/i.test(p.estado || "") && !/^finalizado$/i.test(previos.get(p.id_externo)?.estado || ""))
        .slice(0, 8)
        .map((p) => `F${p.jornada ?? "?"} · ${p.local} ${p.goles_local ?? "-"}-${p.goles_visitante ?? "-"} ${p.visitante}`);

      if (aplicar) {
        const ahora = new Date().toISOString();
        for (let k = 0; k < guardar.length; k += 500) {
          const lote = guardar.slice(k, k + 500).map((p) => ({ ...p, competencia_id: comp.id, actualizado_at: ahora }));
          const { error } = await admin.from("liga_partidos").upsert(lote, { onConflict: "competencia_id,id_externo" });
          if (error) throw new Error(error.message);
        }
        await admin.from("liga_competencias").update({ actualizado_at: ahora }).eq("id", comp.id);
        fila.guardados = guardar.length;
      }
    } catch (e) {
      fila.error = e instanceof Error ? e.message : String(e);
    }
    resultado.push(fila);
  }

  return responder({ modo: aplicar ? "aplicar" : "previa", competencias: resultado });
});
