/* El recorte de la tabla de posiciones. Vive afuera del componente para poder
 * probarlo sin navegador (y porque fast-refresh pide que un .jsx exporte sólo
 * componentes). */

export const TOPE = { feed: 14, story: 20 };

/* Devuelve las filas a dibujar; `corte: true` marca dónde va el hueco. */
export function filasVisibles(tabla = [], clave, tope = 10) {
  if (tabla.length <= tope) return tabla.map((t, i) => ({ t, puesto: i + 1 }));

  const mio = tabla.findIndex((t) => t.nombre === clave);
  if (mio === -1 || mio < tope) return tabla.slice(0, tope).map((t, i) => ({ t, puesto: i + 1 }));

  /* Nos alcanza con la punta más nuestro entorno. Se reservan tres lugares
     para el vecino de arriba, nosotros y el de abajo. */
  const arriba = tabla.slice(0, Math.max(1, tope - 3)).map((t, i) => ({ t, puesto: i + 1 }));
  const desde = Math.max(arriba.length, mio - 1);
  const entorno = tabla.slice(desde, Math.min(tabla.length, mio + 2))
    .map((t, i) => ({ t, puesto: desde + i + 1 }));

  return [...arriba, { corte: true }, ...entorno];
}
