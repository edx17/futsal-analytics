import { supabase } from '../supabase';
import { esModoKiosco, tokenKiosco } from './kiosco';

/* JUEGOS: las misiones diarias (migración 20261101120000_juegos_misiones.sql).
   El progreso lo cuenta la base; acá sólo se pide y se cobra. */

export const MENSAJE_SIN_MISIONES = 'Faltan las misiones en la base: hay que correr la migración 20261101120000_juegos_misiones.sql.';

const token = () => (esModoKiosco() ? tokenKiosco() : null);
const falta = (e) => ['PGRST202', '42883', '42P01', 'PGRST205'].includes(e?.code) || /could not find the function|does not exist/i.test(e?.message || '');

async function llamar(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, { ...params, p_token: token() });
  if (error) {
    if (error.code === '28000') return { vencida: true };
    if (falta(error)) return { faltaMigracion: true, error: new Error(MENSAJE_SIN_MISIONES) };
    return { error: new Error((error.message || '').replace(/^(juegos|sobres): /, '') || 'No se pudo completar.') };
  }
  return { data };
}

export const misionesDelDia = () => llamar('juegos_misiones');
export const cobrarMision = (id) => llamar('juegos_cobrar_mision', { p_mision: id });
/* El evento de V-Coins en curso y el próximo (migración 20261105120000_vcoins_eventos.sql). */
export const avisosJuegos = () => llamar('juegos_avisos');
