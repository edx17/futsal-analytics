import { supabase } from '../supabase';

/* ANOTADOR: las notas en la base (migración 20261114120000_notas.sql).
 * Las políticas deciden quién ve qué: las mías y las compartidas del cuerpo
 * técnico de mi club. Cuando algo cambia se avisa con el evento
 * 'notas:cambio', así cada panel abierto se vuelve a leer. */

export const MENSAJE_SIN_NOTAS = 'Falta el anotador en la base: hay que correr la migración 20261114120000_notas.sql en Supabase.';
const falta = (e) => ['42P01', 'PGRST205'].includes(e?.code) || /relation .*notas|schema cache/i.test(e?.message || '');
const lanzar = (error) => { throw new Error(falta(error) ? MENSAJE_SIN_NOTAS : (error.message || 'No se pudo completar.')); };
const avisar = () => window.dispatchEvent(new Event('notas:cambio'));

const COLUMNAS = 'id, club_id, autor, texto, compartida, fijada, vinculo_tipo, vinculo_id, vinculo_nombre, video_seg, created_at, updated_at';

/** Las notas de un vínculo (o todas, sin tipo), con el nombre del autor. */
export async function listarNotas({ clubId, tipo = null, id = null, limite = 300 } = {}) {
  let q = supabase.from('notas').select(COLUMNAS).eq('club_id', clubId).order('created_at', { ascending: false }).limit(limite);
  if (tipo) q = q.eq('vinculo_tipo', tipo);
  if (id != null) q = q.eq('vinculo_id', String(id));
  const { data, error } = await q;
  if (error) lanzar(error);
  const autores = [...new Set((data || []).map((n) => n.autor))];
  let nombres = new Map();
  if (autores.length) {
    const { data: pf } = await supabase.from('perfiles').select('id, nombre_completo').in('id', autores);
    nombres = new Map((pf || []).map((p) => [p.id, p.nombre_completo]));
  }
  return (data || []).map((n) => ({ ...n, autor_nombre: nombres.get(n.autor) || 'Cuerpo técnico' }));
}

export async function crearNota({ clubId, texto, compartida = false, vinculo = null, videoSeg = null }) {
  const { data, error } = await supabase.from('notas').insert({
    club_id: clubId, texto: String(texto).trim(), compartida,
    vinculo_tipo: vinculo?.tipo || 'general', vinculo_id: vinculo?.id != null ? String(vinculo.id) : null,
    vinculo_nombre: vinculo?.nombre || null, video_seg: videoSeg,
  }).select(COLUMNAS).single();
  if (error) lanzar(error);
  avisar();
  return data;
}

export async function actualizarNota(id, cambios) {
  const { error } = await supabase.from('notas').update(cambios).eq('id', id);
  if (error) lanzar(error);
  avisar();
}

export async function borrarNota(id) {
  const { error } = await supabase.from('notas').delete().eq('id', id);
  if (error) lanzar(error);
  avisar();
}
