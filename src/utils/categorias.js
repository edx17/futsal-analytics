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
