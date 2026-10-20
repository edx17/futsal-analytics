import { supabase } from '../supabase';
import { fetchPaginado } from './supaPaginado';

/* MODO GOD (superusuario): lo que la pantalla le pide a la base.
 *
 * Migración 20261022130000_mysquad_god.sql. Las políticas dejan escribir sólo
 * al superusuario; acá no se decide nada, sólo se mueven filas.
 *   cartas_catalogo.activa   dar de baja / de alta (no se borra: quien la tiene la conserva)
 *   cartas_ajustes           media corregida a mano (se muestra en vez de la calculada)
 *   sobres_config            sobres suspendidos y evento activo del club
 */

export const MENSAJE_SIN_GOD =
  'Falta la migración 20261022130000_mysquad_god.sql en Supabase (cartas activas, ajustes y configuración de sobres).';

const falta = (err) => ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(err?.code)
  || /does not exist|schema cache|column .*activa/i.test(err?.message || '');

const lanzar = (error) => {
  if (falta(error)) throw new Error(MENSAJE_SIN_GOD);
  throw error;
};

/** Todo el catálogo del club (activas y dadas de baja). */
export async function listarCatalogo(clubId) {
  try {
    return await fetchPaginado(() => supabase.from('cartas_catalogo')
      .select('id, clave, jugador_id, tipo, rareza, carta, activa, actualizada_at')
      .eq('club_id', clubId).order('clave', { ascending: true }));
  } catch (err) { return lanzar(err); }
}

/** Da de baja (activa=false) o de alta un grupo de cartas. */
export async function activarCartas(ids, activa) {
  if (!ids.length) return 0;
  const { data, error } = await supabase.from('cartas_catalogo').update({ activa }).in('id', ids).select('id');
  if (error) lanzar(error);
  return (data || []).length;
}

/** Map clave → { ovr, motivo }. */
export async function listarAjustes(clubId) {
  const { data, error } = await supabase.from('cartas_ajustes').select('clave, ovr, motivo, actualizado_at').eq('club_id', clubId);
  if (error) { if (falta(error)) return new Map(); throw error; }
  return new Map((data || []).map((a) => [a.clave, a]));
}

export async function guardarAjuste(clubId, clave, ovr, motivo = '') {
  const { error } = await supabase.from('cartas_ajustes')
    .upsert({ club_id: clubId, clave, ovr, motivo, actualizado_at: new Date().toISOString() }, { onConflict: 'club_id,clave' });
  if (error) lanzar(error);
}

export async function quitarAjuste(clubId, clave) {
  const { error } = await supabase.from('cartas_ajustes').delete().eq('club_id', clubId).eq('clave', clave);
  if (error) lanzar(error);
}

/** { suspendidos: [], evento_activo: null } del club. */
export async function leerConfigSobres(clubId) {
  const { data, error } = await supabase.from('sobres_config').select('suspendidos, evento_activo').eq('club_id', clubId).maybeSingle();
  if (error) { if (falta(error)) return { suspendidos: [], evento_activo: null, sinTabla: true }; throw error; }
  return { suspendidos: data?.suspendidos || [], evento_activo: data?.evento_activo || null };
}

export async function guardarConfigSobres(clubId, { suspendidos, evento_activo }) {
  const { error } = await supabase.from('sobres_config')
    .upsert({ club_id: clubId, suspendidos, evento_activo: evento_activo || null, actualizado_at: new Date().toISOString() }, { onConflict: 'club_id' });
  if (error) lanzar(error);
}
