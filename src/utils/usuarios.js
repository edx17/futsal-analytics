import { supabase } from '../supabase';

/* MODO GOD · USUARIOS: lo que la pantalla le pide a la base.
 *
 * Migración 20261027120000_usuarios_vcoins.sql. Las funciones god_* verifican
 * en la base que sea el superusuario; acá no se decide nada.
 */

export const MENSAJE_SIN_USUARIOS =
  'Falta la migración 20261027120000_usuarios_vcoins.sql en Supabase (usuarios, bloqueos y V-Coins).';

const falta = (err) => ['PGRST202', '42883', '42P01', 'PGRST205', '42703'].includes(err?.code)
  || /could not find the function|does not exist|schema cache/i.test(err?.message || '');

const lanzar = (error) => {
  if (falta(error)) throw new Error(MENSAJE_SIN_USUARIOS);
  throw new Error((error.message || '').replace(/^(god|sobres): /, '') || 'No se pudo.');
};

/** Todos los del club con su actividad en el juego. */
export async function listarUsuarios(clubId) {
  const { data, error } = await supabase.rpc('god_usuarios', { p_club: clubId });
  if (error) lanzar(error);
  return data || [];
}

export async function bloquearUsuario(clubId, dueno, bloquear, motivo = '') {
  const { error } = await supabase.rpc('god_bloquear', { p_club: clubId, p_dueno: dueno, p_bloquear: bloquear, p_motivo: motivo || null });
  if (error) lanzar(error);
}

/** Suma (o resta) V-Coins. `duenos` null = a todos. Devuelve a cuántos. */
export async function darVCoins(clubId, duenos, cantidad, motivo = '') {
  const { data, error } = await supabase.rpc('god_vcoins', { p_club: clubId, p_duenos: duenos, p_cantidad: cantidad, p_motivo: motivo || null });
  if (error) lanzar(error);
  return data;
}

export async function listarMovimientos(clubId, limite = 40) {
  const { data, error } = await supabase.from('vcoins_movimientos').select('id, dueno, cantidad, motivo, created_at')
    .eq('club_id', clubId).order('created_at', { ascending: false }).limit(limite);
  if (error) { if (falta(error)) return []; throw error; }
  return data || [];
}

/* ── eventos de V-Coins multiplicadas ── */
export async function listarMultiplicadores(clubId) {
  const { data, error } = await supabase.from('vcoins_multiplicadores').select('*')
    .eq('club_id', clubId).order('desde', { ascending: false });
  if (error) { if (falta(error)) return null; throw error; }
  return data || [];
}

export async function guardarMultiplicador(clubId, m) {
  const fila = { club_id: clubId, nombre: m.nombre, factor: m.factor, desde: m.desde, hasta: m.hasta, activo: m.activo !== false };
  // Dónde aplica (migración 20261105120000): si son todos los juegos, vale el de la base (todos).
  if (Array.isArray(m.aplica) && m.aplica.length < 4) fila.aplica = m.aplica;
  const q = m.id ? supabase.from('vcoins_multiplicadores').update(fila).eq('id', m.id) : supabase.from('vcoins_multiplicadores').insert(fila);
  const { error } = await q;
  if (error) lanzar(error);
}

export async function activarMultiplicador(id, activo) {
  const { error } = await supabase.from('vcoins_multiplicadores').update({ activo }).eq('id', id);
  if (error) lanzar(error);
}
