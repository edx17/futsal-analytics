/* Medidas reglamentarias de una cancha de futsal, en metros.
 * Viven acá y no en Cancha.jsx para que ese archivo exporte sólo el
 * componente (lo pide la regla de fast-refresh del linter). */

export const LARGO_M = 40;
export const ANCHO_M = 20;

/* El tracker guarda las posiciones en 0-100 sobre cada eje. */
export const aMetros = (x, y) => ({
  x: (Number(x) || 0) / 100 * LARGO_M,
  y: (Number(y) || 0) / 100 * ANCHO_M,
});
