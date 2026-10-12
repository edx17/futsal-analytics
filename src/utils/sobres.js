import { supabase } from '../supabase';
import { esModoKiosco, tokenKiosco } from './kiosco';

/* SOBRES: lo que la app le pide a la base.
 *
 * Todo pasa por funciones (migración 20261011120000_sobres.sql): la base decide
 * si el sobre corresponde y qué sale. En el Kiosco se identifica con el token
 * del PIN; en VirtualClub, con la cuenta del cuerpo técnico (sin token). */

export const MENSAJE_SIN_SOBRES =
  'Faltan los sobres en la base: hay que correr la migración 20261011120000_sobres.sql en Supabase.';

const token = () => (esModoKiosco() ? tokenKiosco() : null);

const faltaLaFuncion = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01' || error?.code === 'PGRST205'
  || /could not find the function|does not exist/i.test(error?.message || '');

async function llamar(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    if (error.code === '28000') return { vencida: true };
    if (faltaLaFuncion(error)) return { error: new Error(MENSAJE_SIN_SOBRES) };
    // Los mensajes de las reglas ("ya abriste este sobre hoy"...) vienen escritos para mostrar.
    return { error: new Error((error.message || '').replace(/^sobres: /, '') || 'No se pudo completar.') };
  }
  return { data };
}

export const estadoSobres = () => llamar('sobres_estado', { p_token: token() });
export const abrirSobre = (tipo) => llamar('sobres_abrir', { p_tipo: tipo, p_token: token() });
export const coleccionSobres = () => llamar('sobres_coleccion', { p_token: token() });
export const reiniciarPruebaSobres = () => llamar('sobres_reiniciar_prueba');

/** El staff publica (o actualiza) las cartas que pueden salir en los sobres de su club. */
export async function publicarCatalogo(clubId, filas) {
  let escritas = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200).map((f) => ({ ...f, club_id: clubId, actualizada_at: new Date().toISOString() }));
    const { data, error } = await supabase.from('cartas_catalogo')
      .upsert(lote, { onConflict: 'club_id,clave' }).select('id');
    if (error) {
      if (faltaLaFuncion(error)) throw new Error(MENSAJE_SIN_SOBRES);
      throw error;
    }
    escritas += (data || []).length;
  }
  return escritas;
}
