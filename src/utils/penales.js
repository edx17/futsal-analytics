import { supabase } from '../supabase';
import { esModoKiosco, tokenKiosco } from './kiosco';

/* PENALES CON CARTAS: lo que la app le pide a la base
 * (migración 20261103120000_penales_cartas.sql). La tanda y el premio se
 * deciden allá; acá sólo se manda la elección del jugador. */

export const MENSAJE_SIN_PENALES = 'Faltan los penales con cartas en la base: hay que correr la migración 20261103120000_penales_cartas.sql.';

const token = () => (esModoKiosco() ? tokenKiosco() : null);
const falta = (e) => ['PGRST202', '42883', '42P01', 'PGRST205'].includes(e?.code) || /could not find the function|does not exist/i.test(e?.message || '');

async function llamar(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, { ...params, p_token: token() });
  if (error) {
    if (error.code === '28000') return { vencida: true };
    if (falta(error)) return { faltaMigracion: true, error: new Error(MENSAJE_SIN_PENALES) };
    return { error: new Error((error.message || '').replace(/^(penales|sobres): /, '') || 'No se pudo completar.') };
  }
  return { data };
}

export const estadoPenales = () => llamar('penales_estado');
export const nuevaTanda = ({ pateador, arquero, nivel, primero }) =>
  llamar('penales_nueva', { p_pateador: pateador, p_arquero: arquero, p_nivel: nivel, p_primero: primero });
/* Un tiro: el cuadrante (0-8) al que pateás o al que te tirás; -1 si se acabó el tiempo. */
export const tirarPenal = (tanda, eleccion) => llamar('penales_tiro', { p_tanda: tanda, p_eleccion: eleccion });
export const abandonarTanda = (tanda) => llamar('penales_abandonar', { p_tanda: tanda });
