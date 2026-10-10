import { supabase } from '../supabase';
import { fetchPaginado } from './supaPaginado';
import { registroAFila, filaARegistro } from '../analytics/premiosCartas';

/* EL HISTORIAL DE PREMIOS DE MYSQUAD
 *
 * Lectura y escritura de `cartas_destacadas` (ver la migración
 * 20261010120000_cartas_destacadas.sql). Los cálculos viven en premios.js; esto
 * sólo mueve filas.
 */

const TABLA = 'cartas_destacadas';
const CLAVE_UNICA = 'club_id,tipo,periodo,categoria,torneo_id';

/* Si la migración todavía no se corrió, la tabla no existe: se avisa qué hacer
   en vez de mostrar el código de error de la base. */
const faltaLaTabla = (err) =>
  err?.code === '42P01' || err?.code === 'PGRST205' || /cartas_destacadas/i.test(err?.message || '') && /does not exist|schema cache/i.test(err?.message || '');

export const MENSAJE_SIN_TABLA =
  'Falta crear la tabla del historial: hay que correr la migración 20261010120000_cartas_destacadas.sql en Supabase.';

/** Todo el historial del club, lo más nuevo primero. */
export async function listarHistorial(clubId) {
  try {
    const filas = await fetchPaginado(() =>
      supabase.from(TABLA).select('*')
        .eq('club_id', clubId)
        .order('fecha_ref', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
    );
    return filas.map(filaARegistro);
  } catch (err) {
    if (faltaLaTabla(err)) throw new Error(MENSAJE_SIN_TABLA);
    throw err;
  }
}

/**
 * Guarda registros de premios (ver registrosDePartido/Mes/Temporada).
 *
 * `sobrescribir: false` (lo que se congela en bloque): si ya estaba guardado, se
 * respeta lo que había. `true` (un premio guardado a mano): se pisa, que es lo
 * que se quiere al corregir un partido y volver a guardar.
 *
 * Devuelve cuántas filas se escribieron de verdad.
 */
export async function guardarRegistros({ clubId, categoria, torneoId, registros, porId, sobrescribir = false }) {
  const filas = registros.map((r) => registroAFila(r, porId, { clubId, categoria, torneoId }));
  if (filas.length === 0) return { escritas: 0, total: 0 };

  let escritas = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    const { data, error } = await supabase.from(TABLA)
      .upsert(lote, { onConflict: CLAVE_UNICA, ignoreDuplicates: !sobrescribir })
      .select('id');
    if (error) {
      if (faltaLaTabla(error)) throw new Error(MENSAJE_SIN_TABLA);
      throw error;
    }
    escritas += (data || []).length;
  }
  return { escritas, total: filas.length };
}

export async function quitarRegistro(id) {
  const { error } = await supabase.from(TABLA).delete().eq('id', id);
  if (error) throw error;
}
