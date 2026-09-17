/* Jerarquía de categorías, compartida por las pantallas que las listan.
 * Ordenar alfabéticamente deja "Cuarta" antes que "Primera", que no es como
 * un club lee sus divisiones. Las que no reconocemos (promocionales, femenino,
 * nombres propios) van al final, alfabéticas entre sí. */

export const normCat = (s) =>
  (s || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const ORDEN_CATEGORIAS = [
  'primera', 'segunda', 'tercera', 'cuarta', 'quinta',
  'sexta', 'septima', 'octava', 'novena', 'decima',
];

export const rankCategoria = (cat) => {
  const n = normCat(cat);
  const i = ORDEN_CATEGORIAS.findIndex((tok) => n.includes(tok));
  return i === -1 ? 999 : i;
};

export const ordenarCategorias = (cats) =>
  [...(cats || [])].sort(
    (a, b) => (rankCategoria(a) - rankCategoria(b)) || String(a).localeCompare(String(b))
  );

/* La de mayor jerarquía disponible. */
export const categoriaMasAlta = (cats) => ordenarCategorias(cats)[0];

/* Compara ignorando mayúsculas y acentos: "3ra"/"Tercera" siguen siendo
 * distintas, pero "Primera" y "primera " son la misma. */
export const mismaCategoria = (a, b) => normCat(a) === normCat(b);

/* Une listas de categorías sacando duplicados por forma normalizada,
 * conservando la primera grafía que aparece. */
export const unirCategorias = (...listas) => {
  const vistas = new Map();
  listas.flat().forEach((c) => {
    if (!c) return;
    const k = normCat(c);
    if (k && !vistas.has(k)) vistas.set(k, c);
  });
  return ordenarCategorias([...vistas.values()]);
};

/* Las categorías asignadas al CT mandan: si tiene alguna, sólo ve esas.
 * Si no tiene ninguna (superuser, manager, o un CT sin configurar) ve todas
 * las del club. Se intersecta por forma normalizada para que una diferencia
 * de acento no le deje la pantalla vacía; si la intersección da vacía se
 * respetan las asignadas, que es lo que el club configuró a mano. */
export const categoriasVisiblesPara = (categoriasClub, asignadas) => {
  const club = ordenarCategorias(categoriasClub);
  const mias = (asignadas || []).filter(Boolean);
  if (mias.length === 0) return club;
  const permitidas = new Set(mias.map(normCat));
  const interseccion = club.filter((c) => permitidas.has(normCat(c)));
  return interseccion.length > 0 ? interseccion : ordenarCategorias(mias);
};

/* ── LAS CATEGORÍAS REALES DEL CLUB ────────────────────────────────────────
 *
 * Había cuatro listas distintas escritas a mano en la app, más las pantallas
 * que las deducían de los datos. Por eso una mostraba hasta Octava, otra
 * sumaba las promocionales por año y otra se quedaba en Cuarta.
 *
 * Fuente única: lo que existe de verdad en la base. "Activa" es la que tiene
 * al menos un jugador en el plantel; las que sólo aparecen en partidos
 * viejos quedan como históricas, para no perder el acceso a sus datos pero
 * tampoco ofrecerlas al cargar cosas nuevas.
 *
 * LISTA_BASE es sólo el respaldo para un club recién creado que todavía no
 * cargó un solo jugador: sin ella la primera pantalla saldría vacía.
 */
export const LISTA_BASE = [
  'Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava',
];

/* `jugadores` y `partidos` son filas con { categoria } (y `activo` en las de
 * jugadores). Devuelve las activas, las históricas y la unión de ambas. */
export function categoriasDelClub(jugadores = [], partidos = []) {
  const conPlantel = jugadores.filter(j => j && j.activo !== false).map(j => j.categoria);
  const activas = unirCategorias(conPlantel);
  const vistas = new Set(activas.map(normCat));

  const historicas = unirCategorias(
    jugadores.map(j => j?.categoria),
    partidos.map(p => p?.categoria),
  ).filter(c => !vistas.has(normCat(c)));

  return { activas, historicas, todas: unirCategorias(activas, historicas) };
}

/* Lo que una pantalla ofrece para elegir: las activas del club, recortadas
 * por las asignadas al CT. Con `incluirHistoricas` suma las que ya no tienen
 * plantel, para las pantallas de consulta. Si el club todavía no cargó nada,
 * cae en LISTA_BASE para no dejar un selector vacío. */
export function categoriasParaElegir({
  jugadores = [], partidos = [], asignadas = [], incluirHistoricas = false,
} = {}) {
  const { activas, todas } = categoriasDelClub(jugadores, partidos);
  const base = incluirHistoricas ? todas : activas;
  const fuente = base.length > 0 ? base : LISTA_BASE;
  return categoriasVisiblesPara(fuente, asignadas);
}
