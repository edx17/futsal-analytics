import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { categoriasDelClub, categoriasVisiblesPara, LISTA_BASE, unirCategorias, normCat } from './categorias';
import { hayConfig, categoriasActivas } from '../club/configClub';
import { useConfigClub } from '../club/useConfigClub';

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
 *
 * Si el club armó sus categorías en el configurador general (CONFIG. DE CLUB),
 * mandan ésas: `activas` son las activas del configurador, en su orden, y lo
 * que aparece en los datos sin estar configurado queda como histórico.
 * `config` trae ramas, ligas y categorías (con rama y ligas de cada una).
 */
export function useCategorias({ incluirHistoricas = false, asignadas } = {}) {
  /* Las pantallas suelen pasar `perfil?.categorias_asignadas || []`, que es un
     array nuevo en cada render. Sin esta clave el memo de abajo se recalcularía
     siempre y devolvería un objeto nuevo cada vez. */
  const claveAsignadas = JSON.stringify(asignadas || []);
  const [filas, setFilas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const clubId = typeof window !== 'undefined' ? localStorage.getItem('club_id') : null;
  // La configuración del club sale de la caché compartida: al guardar el configurador se actualiza sola.
  const config = useConfigClub();

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
    const deDatos = categoriasDelClub(filas?.jugadores || [], filas?.partidos || []);
    const configurado = hayConfig(config);
    let { activas, historicas, todas } = deDatos;
    if (configurado) {
      activas = categoriasActivas(config);
      const enConfig = new Set(config.categorias.map((c) => normCat(c.nombre)));
      const inactivas = config.categorias.filter((c) => !c.activa).map((c) => c.nombre);
      historicas = unirCategorias(inactivas, deDatos.todas.filter((c) => !enConfig.has(normCat(c))));
      todas = [...activas, ...historicas];
    }
    const base = incluirHistoricas ? todas : activas;
    const fuente = base.length > 0 ? base : LISTA_BASE;
    return {
      categorias: categoriasVisiblesPara(fuente, JSON.parse(claveAsignadas), { mantenerOrden: configurado }),
      activas, historicas, todas,
      cargando,
      config, configurado,
      /* true cuando todavía no hay nada cargado y se está mostrando el
         respaldo, no las categorías reales del club. */
      esRespaldo: base.length === 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, config, incluirHistoricas, claveAsignadas, cargando]);
}
