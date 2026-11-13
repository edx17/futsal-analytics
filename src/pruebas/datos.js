import { supabase } from '../supabase';
import { fetchPaginado } from '../utils/supaPaginado';
import { reducirImagen } from '../utils/cartasFotos';

/* PRUEBAS · ACCESO A LA BASE
 *
 * Todo filtrado por club y categoría (nunca se mezclan categorías). Los
 * cruces se hacen en JS con Maps, sin embed. Las evaluaciones pueden pasar
 * las 1000 filas: van con fetchPaginado. Las reglas de quién ve y quién
 * escribe están en la migración 20261117120000_pruebas_jugadores.sql.
 */

export const MENSAJE_SIN_PRUEBAS = 'Falta la migración 20261117120000_pruebas_jugadores.sql en Supabase (Pruebas de jugadores).';
const falta = (e) => ['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202'].includes(e?.code);
const lanzar = (error) => { if (falta(error)) throw new Error(MENSAJE_SIN_PRUEBAS); throw error; };

// ── Candidatos ──
export async function listarCandidatos(clubId, categoria) {
  const { data, error } = await supabase.from('pruebas_candidatos').select('*')
    .eq('club_id', clubId).eq('categoria', categoria).order('created_at', { ascending: false });
  if (error) lanzar(error);
  return data || [];
}

export async function guardarCandidato(fila) {
  const { id, ...resto } = fila;
  const q = id ? supabase.from('pruebas_candidatos').update(resto).eq('id', id) : supabase.from('pruebas_candidatos').insert(resto);
  const { data, error } = await q.select().single();
  if (error) lanzar(error);
  return data;
}

export async function borrarCandidato(id) {
  const { error } = await supabase.from('pruebas_candidatos').delete().eq('id', id);
  if (error) lanzar(error);
}

/** Sube la foto (achicada) al bucket de fotos de jugadores y devuelve la URL pública. */
export async function subirFotoCandidato(clubId, archivo) {
  let subir = archivo; let ext = archivo.name.split('.').pop(); let tipo = archivo.type;
  if (/^image\//.test(archivo.type) && !/svg/i.test(archivo.type)) {
    const r = await reducirImagen(archivo);
    subir = r.blob; ext = r.ext; tipo = r.tipo;
  }
  const ruta = `pruebas/${clubId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('foto').upload(ruta, subir, { cacheControl: '31536000', contentType: tipo });
  if (error) throw error;
  return supabase.storage.from('foto').getPublicUrl(ruta).data.publicUrl;
}

// ── Sesiones ──
export async function listarSesiones(clubId, categoria) {
  const { data, error } = await supabase.from('pruebas_sesiones').select('*')
    .eq('club_id', clubId).eq('categoria', categoria).order('fecha', { ascending: false });
  if (error) lanzar(error);
  return data || [];
}

export async function crearSesion({ clubId, categoria, fecha, etapa, evaluadores = [], notas = null }) {
  const { data, error } = await supabase.from('pruebas_sesiones')
    .insert({ club_id: clubId, categoria, fecha, etapa, evaluadores, notas }).select().single();
  if (error) lanzar(error);
  return data;
}

// ── Evaluaciones (la RLS devuelve las propias mientras la carga está abierta y las de todos al cerrarla) ──
export async function listarEvaluaciones(clubId, categoria) {
  return fetchPaginado(() => supabase.from('pruebas_evaluaciones')
    .select('id, sesion_id, candidato_id, evaluador_id, bloque, criterio, puntaje, dato_objetivo, comentario, updated_at')
    .eq('club_id', clubId).eq('categoria', categoria).order('id', { ascending: true }));
}

export const CONFLICTO_EVALUACION = 'sesion_id,candidato_id,evaluador_id,bloque,criterio';

/** Sube un lote de puntajes (idempotente: el mismo criterio del mismo evaluador se pisa). */
export async function subirEvaluaciones(filas) {
  if (!filas.length) return 0;
  const { error } = await supabase.from('pruebas_evaluaciones').upsert(filas, { onConflict: CONFLICTO_EVALUACION });
  if (error) lanzar(error);
  return filas.length;
}

// ── Cierres ──
export async function listarCierres(clubId, categoria) {
  const { data, error } = await supabase.from('pruebas_cierres').select('*').eq('club_id', clubId).eq('categoria', categoria);
  if (error) lanzar(error);
  return data || [];
}

/** Cierra la carga de un candidato en una etapa: desde acá todos ven todos los puntajes y ya no se cargan más. */
export async function cerrarCarga({ clubId, categoria, candidatoId, etapa }) {
  const { data, error } = await supabase.from('pruebas_cierres')
    .insert({ club_id: clubId, categoria, candidato_id: candidatoId, etapa, estado: 'revision' }).select().single();
  if (error) lanzar(error);
  return data;
}

/** La decisión final: queda congelada con la configuración usada (snapshot y versión). */
export async function decidir(cierreId, { resultado, recomendacion, decision, comentario, config, configVersion, rubricaVersion }) {
  const { data, error } = await supabase.from('pruebas_cierres').update({
    estado: 'decidido', resultado, recomendacion, decision, comentario_dt: comentario || null,
    config_snapshot: config, config_version: configVersion, rubrica_version: rubricaVersion,
  }).eq('id', cierreId).eq('estado', 'revision').select().single();
  if (error) lanzar(error);
  return data;
}

/** Sólo el superusuario (la RLS lo controla): vuelve a abrir la carga. */
export async function reabrirCierre(cierreId) {
  const { error } = await supabase.from('pruebas_cierres').delete().eq('id', cierreId);
  if (error) lanzar(error);
}

// ── Configuración ──
export async function leerConfigs(clubId) {
  const { data, error } = await supabase.from('pruebas_config').select('*').eq('club_id', clubId);
  if (error) { if (falta(error)) return []; throw error; }
  return data || [];
}

/** Guarda la configuración del club (categoria null) o de una categoría. La versión la sube la base. */
export async function guardarConfig({ clubId, categoria = null, config, filaActual = null }) {
  const cuerpo = { ponderaciones: config.ponderaciones, umbrales: config.umbrales, bloques_clave: config.bloques_clave };
  const q = filaActual?.id
    ? supabase.from('pruebas_config').update(cuerpo).eq('id', filaActual.id)
    : supabase.from('pruebas_config').insert({ club_id: clubId, categoria, ...cuerpo });
  const { data, error } = await q.select().single();
  if (error) lanzar(error);
  return data;
}

export async function borrarConfig(id) {
  const { error } = await supabase.from('pruebas_config').delete().eq('id', id);
  if (error) lanzar(error);
}

// ── Nombres de los evaluadores (perfiles) ──
export async function nombresDePerfiles(ids = []) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data } = await supabase.from('perfiles').select('id, nombre_completo').in('id', unicos);
  return new Map((data || []).map((p) => [p.id, p.nombre_completo || 'Sin nombre']));
}

// ── Incorporar: crea el jugador con los datos de la ficha (como un alta de Plantel) ──
export async function incorporarCandidato(candidato) {
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  const base = `${candidato.apellido || candidato.nombre}_sd_${pin}`.toLowerCase().replace(/\s+/g, '');
  const jugador = {
    club_id: candidato.club_id,                       // uuid en las dos tablas
    nombre: candidato.nombre,
    apellido: candidato.apellido || null,
    categoria: candidato.categoria,
    posicion: candidato.puesto_principal,
    pierna: candidato.perfil_dominante?.pierna || null,
    fechanac: candidato.fecha_nacimiento || null,
    foto: candidato.foto_url || null,
    estado_ficha: 'Activo',
    activo: true,
    username: base,
    pin_kiosco: pin,
    user_id: null,
  };
  const { data, error } = await supabase.from('jugadores').insert([jugador]).select('id').single();
  if (error) throw new Error(`No se pudo crear el jugador: ${error.message}`);
  const { error: e2 } = await supabase.from('pruebas_candidatos').update({ estado: 'incorporado', jugador_id: data.id }).eq('id', candidato.id);
  if (e2) lanzar(e2);
  return { jugadorId: data.id, pin };
}

/** Map `${candidato}|${etapa}` → { evaluadores, puntajes } (cuántos cargaron, sin ver los puntajes). */
export async function resumenCarga(clubId, categoria) {
  const { data, error } = await supabase.rpc('pruebas_resumen_carga', { p_club: clubId, p_categoria: categoria });
  if (error) { if (falta(error)) return new Map(); throw error; }
  return new Map((data || []).map((f) => [`${f.candidato_id}|${f.etapa}`, { evaluadores: f.evaluadores, puntajes: f.puntajes }]));
}
