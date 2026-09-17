import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { categoriasDelClub, categoriasVisiblesPara, LISTA_BASE } from './categorias';

/* Las categorías del club, para cualquier pantalla que tenga que ofrecerlas.
 *
 * Antes cada pantalla resolvía esto por su cuenta: unas con una lista escrita
 * a mano (que no coincidía entre sí) y otras deduciéndola de los datos. Acá
 * se resuelve una sola vez y siempre igual.
 *
 * `activas` son las que tienen plantel hoy. `historicas` las que sólo
 * aparecen en partidos o en jugadores dados de baja: no se ofrecen para
 * cargar cosas nuevas, pero se pueden consultar.
 *
 * Devuelve también `cargando`, para que una pantalla no muestre el respaldo
 * como si fuera la lista real mientras llega la consulta.
 */
export function useCategorias({ incluirHistoricas = false, asignadas } = {}) {
  /* Las pantallas suelen pasar `perfil?.categorias_asignadas || []`, que es un
     array nuevo en cada render. Sin esta clave el memo de abajo se recalcularía
     siempre y devolvería un objeto nuevo cada vez. */
  const claveAsignadas = JSON.stringify(asignadas || []);
  const [filas, setFilas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const clubId = typeof window !== 'undefined' ? localStorage.getItem('club_id') : null;

  useEffect(() => {
    let cancelado = false;

    /* Todo el setState va adentro del async: hacerlo en el cuerpo del efecto
       encadena renders y el linter de React lo marca. */
    (async () => {
      if (!clubId || clubId === 'club_default') {
        if (!cancelado) setCargando(false);
        return;
      }
      const [{ data: jug }, { data: par }] = await Promise.all([
        supabase.from('jugadores').select('categoria, activo').eq('club_id', clubId),
        supabase.from('partidos').select('categoria').eq('club_id', clubId),
      ]);
      if (cancelado) return;
      /* Si falta la columna `activo` (migración de bajas sin correr) la
         consulta devuelve null: mejor seguir con lo que haya que romper. */
      setFilas({ jugadores: jug || [], partidos: par || [] });
      setCargando(false);
    })().catch(() => { if (!cancelado) setCargando(false); });

    return () => { cancelado = true; };
  }, [clubId]);

  return useMemo(() => {
    const { activas, historicas, todas } = categoriasDelClub(
      filas?.jugadores || [], filas?.partidos || []
    );
    const base = incluirHistoricas ? todas : activas;
    const fuente = base.length > 0 ? base : LISTA_BASE;
    return {
      categorias: categoriasVisiblesPara(fuente, JSON.parse(claveAsignadas)),
      activas, historicas, todas,
      cargando,
      /* true cuando todavía no hay nada cargado y se está mostrando el
         respaldo, no las categorías reales del club. */
      esRespaldo: base.length === 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, incluirHistoricas, claveAsignadas, cargando]);
}
