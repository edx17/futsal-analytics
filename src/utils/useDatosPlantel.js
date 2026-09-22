import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { fetchParalelo } from './supaPaginado';

/* LA CARGA DEL PLANTEL, UNA SOLA VEZ Y EN UN SOLO LUGAR
 *
 * Resumen Plantel y Comparar necesitan exactamente los mismos datos: partidos,
 * jugadores, sanciones, torneos y todos los eventos del club. Tenerlo dos veces
 * garantiza que tarde o temprano una de las dos se quede vieja, así que vive acá.
 *
 * `avance` es cuántas acciones llegaron sobre el total, para que la espera no
 * sea un cartel quieto: son decenas de miles de filas y se nota.
 */
export function useDatosPlantel(clubId) {
  const [raw, setRaw] = useState({ partidos: [], jugadores: [], eventos: [], sanciones: [], torneos: [] });
  const [loading, setLoading] = useState(true);
  const [avance, setAvance] = useState({ traidas: 0, total: 0 });

  useEffect(() => {
    if (!clubId) { setLoading(false); return; }
    let cancelado = false;

    (async () => {
      setLoading(true);
      try {
        /* Las cuatro consultas de base no dependen entre sí, así que van
           juntas. Encadenadas eran cuatro viajes de ida y vuelta al servidor
           antes de empezar siquiera a pedir los eventos: en un teléfono con
           4G eso es más de un segundo de pantalla en blanco por nada. */
        const [
          { data: partidos },
          { data: jugadores },
          { data: sanciones },
          { data: torneos },
        ] = await Promise.all([
          // Partidos del club, SIN los cruces ajenos (Neutral)
          supabase.from('partidos').select('*')
            .eq('club_id', clubId)
            .or('condicion.is.null,condicion.neq.Neutral'),
          supabase.from('jugadores')
            .select('id, nombre, apellido, posicion, dorsal, categoria, foto, fechanac, pierna, estado_ficha, vencimiento_apto')
            .eq('club_id', clubId),
          supabase.from('disciplina_sanciones').select('*').eq('club_id', clubId),
          // Necesarios para saber dónde corta la Primera Rueda de cada torneo
          supabase.from('torneos').select('*').eq('club_id', clubId),
        ]);

        /* LOS EVENTOS, QUE SON EL GRUESO DE LA ESPERA
         *
         * Acá hay decenas de miles de filas y antes se pedían de a mil, una
         * página detrás de la otra. Son otras tantas idas y vueltas al
         * servidor encadenadas: en un teléfono con 4G eso solo ya son varios
         * segundos de reloj, antes de contar lo que tarda en bajar.
         *
         * `fetchParalelo` pide la primera página con el conteo incluido y con
         * ese total dispara todas las demás a la vez. El `.order('id')` no es
         * decorativo: las páginas se piden por OFFSET y en paralelo, así que
         * sin un orden estable dos de ellas podrían traer la misma fila.
         *
         * Se filtra por club y no por la lista de id_partido: esa lista viaja
         * en la URL y con un club de muchos partidos el servidor la rechaza
         * por largo. Los cruces entre terceros no tienen eventos cargados, así
         * que el conjunto es el mismo; por las dudas se acota después. */
        const idsPartidos = new Set((partidos || []).map(p => String(p.id)));
        const todos = await fetchParalelo(
          (opts) => supabase.from('eventos').select('*', opts)
            .eq('club_id', clubId)
            .order('id', { ascending: true }),
          { onProgreso: (traidas, total) => { if (!cancelado) setAvance({ traidas, total }); } }
        );
        const eventos = todos.filter(ev => idsPartidos.has(String(ev.id_partido)));

        if (!cancelado) setRaw({ partidos: partidos || [], jugadores: jugadores || [], eventos, sanciones: sanciones || [], torneos: torneos || [] });
      } catch (err) {
        console.error('Error cargando resumen de plantel:', err);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => { cancelado = true; };
  }, [clubId]);

  return { raw, loading, avance };
}
