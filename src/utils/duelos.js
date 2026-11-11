import { supabase } from '../supabase';
import { esModoKiosco, tokenKiosco } from './kiosco';

/* DUELO DE CARTAS: lo que la app le pide a la base (migración
 * 20261113120000_juegos_duelos.sql). En el Kiosco se identifica con el token
 * del PIN; con Gmail o como staff, con la cuenta. */

export const MENSAJE_SIN_DUELOS =
  'Falta el Duelo de cartas en la base: hay que correr la migración 20261113120000_juegos_duelos.sql en Supabase.';

const token = () => (esModoKiosco() ? tokenKiosco() : null);
const faltaLaFuncion = (error) =>
  ['PGRST202', '42883', '42P01', 'PGRST205'].includes(error?.code)
  || /could not find the function|does not exist/i.test(error?.message || '');

async function llamar(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, { ...params, p_token: token() });
  if (error) {
    if (error.code === '28000') return { vencida: true };
    if (faltaLaFuncion(error)) return { error: new Error(MENSAJE_SIN_DUELOS) };
    return { error: new Error((error.message || '').replace(/^(duelo|sobres): /, '') || 'No se pudo completar.') };
  }
  return { data };
}

export const estadoDuelos = () => llamar('duelos_estado');
/** cartas: los 5 catalogo_id en el orden de los lugares (el 1º al arco). */
export const retar = (rival, formacion, cartas, apuesta = 0) =>
  llamar('duelo_retar', { p_rival: rival, p_formacion: formacion, p_cartas: cartas, p_apuesta: apuesta });
export const responder = (duelo, formacion, cartas) =>
  llamar('duelo_responder', { p_duelo: duelo, p_formacion: formacion, p_cartas: cartas });
export const rechazar = (duelo) => llamar('duelo_rechazar', { p_duelo: duelo });
export const marcarVisto = (duelo) => llamar('duelo_visto', { p_duelo: duelo });
