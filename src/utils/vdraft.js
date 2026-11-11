import { supabase } from '../supabase';
import { esModoKiosco, tokenKiosco } from './kiosco';

/* V-DRAFT: lo que la app le pide a la base.
 *
 * Todo pasa por funciones (migración 20261020120000_vdraft.sql). En el Kiosco
 * se identifica con el token del PIN; en VirtualClub, con la cuenta del cuerpo
 * técnico (sin token), igual que los sobres. */

export const MENSAJE_SIN_MODOS =
  'Falta el Desafío y el Torneo en la base: hay que correr la migración 20261112120000_vdraft_desafio_torneo.sql en Supabase.';

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
/* modo: 'normal' (el de siempre), 'desafio' (el del día) o 'torneo' (el semanal).
   La normal no manda p_modo: así anda también con la base sin la migración del desafío. */
export const nuevaPartida = (formacion, modo = 'normal') => llamar('vdraft_nueva',
  modo === 'normal' ? { p_formacion: formacion } : { p_formacion: formacion, p_modo: modo });
/* Paga la entrada del torneo de esta semana; devuelve el estado nuevo. */
export const anotarseTorneo = () => llamar('vdraft_torneo_anotarse');
export const elegirCarta = (partida, catalogoId) => llamar('vdraft_elegir', { p_partida: partida, p_catalogo: catalogoId });
export const hacerCambio = (partida, lugar, banco) => llamar('vdraft_cambio', { p_partida: partida, p_lugar: lugar, p_banco: banco });
export const jugarPartido = (partida) => llamar('vdraft_jugar', { p_partida: partida });
export const abandonarPartida = (partida) => llamar('vdraft_abandonar', { p_partida: partida });
/* Un tiro de la tanda: el cuadrante (0-8) si pateás, el lado (0-2) si atajás. */
export const patearPenal = (partida, eleccion) => llamar('vdraft_penal', { p_partida: partida, p_eleccion: eleccion });

/* Modo GOD · TORNEO: la config del torneo semanal del club y las últimas semanas. Sólo el superusuario. */
async function god(fn, params) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    if (faltaLaFuncion(error)) throw new Error(MENSAJE_SIN_MODOS);
    throw new Error((error.message || '').replace(/^god: /, '') || 'No se pudo completar.');
  }
  return data;
}
export const estadoTorneoGod = (clubId) => god('god_torneo_estado', { p_club: clubId });
export const guardarTorneoGod = (clubId, { entrada, partidas, extra, activo }) => god('god_torneo_config', {
  p_club: clubId, p_entrada: entrada, p_partidas: partidas, p_extra: extra, p_activo: activo,
});
