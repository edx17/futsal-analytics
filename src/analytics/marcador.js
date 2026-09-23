/* ============================================================================
   DE DÓNDE SALE EL MARCADOR DE UN PARTIDO
   ----------------------------------------------------------------------------
   Un partido puede llegar a la app por dos caminos, y hasta ahora medio motor
   sólo conocía uno:

     · CAPTURADO — se pasó por Toma de Datos, así que hay un evento por cada
       acción, goles incluidos. Al finalizar, Toma de Datos ADEMÁS escribe el
       marcador en `partidos.goles_propios` y `partidos.goles_rival`.

     · CARGADO A MANO — alguien escribió el resultado en el fixture de Torneos.
       Están las columnas del marcador y NO hay ni un evento.

   El motor de temporada contaba los goles filtrando eventos con accion 'Gol'.
   Para un partido cargado a mano eso da 0 a 0, o sea EMPATE. Una temporada
   cargada a mano se veía como una fila de empates, con 0 goles a favor y 0 en
   contra, aunque el fixture mostrara los resultados bien.

   LA REGLA: el marcador de la tabla `partidos` manda, porque lo escriben los
   DOS caminos. Los eventos sólo se usan como respaldo, para datos viejos donde
   el marcador nunca se actualizó.
============================================================================ */

/** Las dos formas en que un gol quedó anotado como evento. */
export const esGol = (ev) => ev?.accion === 'Gol' || ev?.accion === 'Remate - Gol';

const numeroDe = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * El marcador de un partido, mirando las dos fuentes.
 *
 * Devuelve `{ gf, gc, origen }`, donde `origen` es:
 *   'marcador' → salió de las columnas de `partidos` (el caso normal)
 *   'eventos'  → salió de contar goles (datos viejos sin marcador cargado)
 *   'vacio'    → no hay ni una cosa ni la otra: 0 a 0 de verdad, o sin cargar
 *
 * Por qué el marcador en cero NO gana automáticamente: al crear un partido,
 * `goles_propios` y `goles_rival` arrancan en 0. O sea que un 0 puede ser un
 * 0 a 0 real o un partido al que nadie le cargó el resultado. Cuando las dos
 * columnas están en cero pero hay goles anotados como eventos, mandan los
 * eventos: es el único caso en que el cero es, con seguridad, un dato que
 * falta y no un resultado.
 */
export function marcadorDe(partido, eventosDelPartido = []) {
  const gfCol = numeroDe(partido?.goles_propios);
  const gcCol = numeroDe(partido?.goles_rival);
  const hayColumnas = gfCol !== null && gcCol !== null;

  let gfEv = 0;
  let gcEv = 0;
  (eventosDelPartido || []).forEach((ev) => {
    if (!esGol(ev)) return;
    if (ev.equipo === 'Propio') gfEv += 1; else gcEv += 1;
  });

  if (hayColumnas && (gfCol > 0 || gcCol > 0)) return { gf: gfCol, gc: gcCol, origen: 'marcador' };
  if (gfEv > 0 || gcEv > 0) return { gf: gfEv, gc: gcEv, origen: 'eventos' };
  return { gf: hayColumnas ? gfCol : 0, gc: hayColumnas ? gcCol : 0, origen: hayColumnas ? 'marcador' : 'vacio' };
}

/** V, E o D desde un marcador ya resuelto. */
export const resultadoDeMarcador = (gf, gc) => (gf > gc ? 'V' : gf === gc ? 'E' : 'D');

/**
 * ¿Este partido tiene datos de captura?
 *
 * Sirve para avisar en pantalla por qué un partido no tiene xG, ni remates, ni
 * duelos: no es que estén en cero, es que nunca se capturó. Sin esto, la
 * pantalla muestra ceros y parece rota.
 */
export const tieneCaptura = (eventosDelPartido = []) => (eventosDelPartido || []).length > 0;

/** Agrupa los eventos por partido una sola vez, en vez de filtrar N veces. */
export function eventosPorPartido(eventos = []) {
  const mapa = new Map();
  (eventos || []).forEach((ev) => {
    const k = ev?.id_partido;
    if (k == null) return;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(ev);
  });
  return mapa;
}
