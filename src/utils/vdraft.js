import { supabase } from '../supabase';
import { esModoKiosco, tokenKiosco } from './kiosco';

/* V-DRAFT: lo que la app le pide a la base.
 *
 * Todo pasa por funciones (migración 20261020120000_vdraft.sql). En el Kiosco
 * se identifica con el token del PIN; en VirtualClub, con la cuenta del cuerpo
 * técnico (sin token), igual que los sobres. */

export const MENSAJE_SIN_VDRAFT =
  'Falta el V-Draft en la base: hay que correr la migración 20261020120000_vdraft.sql en Supabase.';

const token = () => (esModoKiosco() ? tokenKiosco() : null);

const faltaLaFuncion = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01' || error?.code === 'PGRST205'
  || /could not find the function|does not exist/i.test(error?.message || '');

async function llamar(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, { ...params, p_token: token() });
  if (error) {
    if (error.code === '28000') return { vencida: true };
    if (faltaLaFuncion(error)) return { error: new Error(MENSAJE_SIN_VDRAFT) };
    return { error: new Error((error.message || '').replace(/^(vdraft|sobres): /, '') || 'No se pudo completar.') };
  }
  return { data };
}

export const estadoVDraft = () => llamar('vdraft_estado');
export const nuevaPartida = (formacion) => llamar('vdraft_nueva', { p_formacion: formacion });
export const elegirCarta = (partida, catalogoId) => llamar('vdraft_elegir', { p_partida: partida, p_catalogo: catalogoId });
export const hacerCambio = (partida, lugar, banco) => llamar('vdraft_cambio', { p_partida: partida, p_lugar: lugar, p_banco: banco });
export const jugarPartido = (partida) => llamar('vdraft_jugar', { p_partida: partida });
export const abandonarPartida = (partida) => llamar('vdraft_abandonar', { p_partida: partida });
