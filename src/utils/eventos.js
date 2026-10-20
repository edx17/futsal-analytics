import { supabase } from '../supabase';
import { normalizarEvento } from '../analytics/eventos';

/* EVENTOS DE SOBRES: lectura y escritura de `sobres_eventos` (Modo GOD).
 * Migración 20261022140000_sobres_eventos.sql. Sólo el superusuario escribe
 * (lo controla la base). Abrir el sobre de un evento: abrirSobreEvento en utils/sobres. */

export const MENSAJE_SIN_EVENTOS = 'Falta la migración 20261022140000_sobres_eventos.sql en Supabase (eventos de sobres).';

const falta = (err) => ['42P01', 'PGRST205'].includes(err?.code) || /sobres_eventos.*(does not exist|schema cache)/i.test(err?.message || '');

export async function listarEventos(clubId) {
  const { data, error } = await supabase.from('sobres_eventos').select('*').eq('club_id', clubId).order('created_at', { ascending: false });
  if (error) { if (falta(error)) throw new Error(MENSAJE_SIN_EVENTOS); throw error; }
  return data || [];
}

/** Crea o actualiza (si trae id). Devuelve la fila guardada. */
export async function guardarEvento(clubId, evento) {
  const fila = { ...normalizarEvento(evento), club_id: clubId, updated_at: new Date().toISOString() };
  const q = fila.id
    ? supabase.from('sobres_eventos').update(fila).eq('id', fila.id).select().single()
    : supabase.from('sobres_eventos').insert(fila).select().single();
  const { data, error } = await q;
  if (error) { if (falta(error)) throw new Error(MENSAJE_SIN_EVENTOS); throw error; }
  return data;
}

/** Marca (o desmarca) cartas del catálogo como exclusivas de evento. */
export async function marcarExclusivas(clubId, claves, valor) {
  if (!claves.length) return;
  for (let i = 0; i < claves.length; i += 100) {
    const { error } = await supabase.from('cartas_catalogo').update({ exclusiva_evento: valor })
      .eq('club_id', clubId).in('clave', claves.slice(i, i + 100));
    if (error) { if (falta(error) || error.code === '42703') throw new Error(MENSAJE_SIN_EVENTOS); throw error; }
  }
}

export async function activarEvento(id, activo) {
  const { error } = await supabase.from('sobres_eventos').update({ activo, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
