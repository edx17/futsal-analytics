import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { normalizarConfig } from './configClub';

/* LA CONFIGURACIÓN DEL CLUB, UNA SOLA VEZ PARA TODA LA APP
 *
 * Cada pantalla armaba su lista de categorías por su cuenta (de los jugadores,
 * de los partidos…). Con el configurador general, todas tienen que mostrar lo
 * mismo y en el mismo orden. Esto lee clubes una vez por club (caché en
 * memoria) y avisa a todas las pantallas cuando se guarda el configurador.
 */

const cache = new Map();          // clubId → config normalizada
const pedidos = new Map();        // clubId → promesa en curso
const oyentes = new Set();
const VACIA = normalizarConfig({});

const clubActual = () => (typeof window !== 'undefined' ? localStorage.getItem('club_id') : null);

export function leerConfigClub(clubId = clubActual()) {
  if (!clubId || clubId === 'club_default') return Promise.resolve(VACIA);
  if (cache.has(clubId)) return Promise.resolve(cache.get(clubId));
  if (!pedidos.has(clubId)) {
    // '*' y no las columnas nuevas: sin la migración del configurador no tiene que fallar.
    pedidos.set(clubId, supabase.from('clubes').select('*').eq('id', clubId).maybeSingle()
      .then(({ data }) => { const c = normalizarConfig(data || {}); cache.set(clubId, c); return c; })
      .catch(() => VACIA)
      .finally(() => pedidos.delete(clubId)));
  }
  return pedidos.get(clubId);
}

/** Después de guardar el configurador: todas las pantallas vuelven a leer. */
export function invalidarConfigClub(clubId = clubActual()) {
  cache.delete(clubId);
  leerConfigClub(clubId).then(() => oyentes.forEach((f) => f()));
}

/** La configuración del club actual, o de `club` si se pasa (kiosco, paneles con club propio).
 *  Vacía mientras llega o si no configuró nada. */
export function useConfigClub(club) {
  const clubId = club || clubActual();
  const [config, setConfig] = useState(() => cache.get(clubId) || VACIA);
  useEffect(() => {
    let vivo = true;
    const actualizar = () => leerConfigClub(clubId).then((c) => { if (vivo) setConfig(c); });
    actualizar();
    oyentes.add(actualizar);
    return () => { vivo = false; oyentes.delete(actualizar); };
  }, [clubId]);
  return config;
}

export { segunClub } from './configClub';
