/* PAGINAR UN REPORTE EN HOJAS A4
 *
 * El navegador, al imprimir, sólo sabe cortar: si una sección no entra en lo
 * que queda, la pasa entera a la hoja siguiente y deja medio vacía la
 * anterior. Acá la app decide las hojas antes de imprimir, con las alturas
 * medidas de cada sección (ver HojasA4.jsx):
 *
 *  · Hoja 1, si hay devolución: portada + devolución + staff (lo que haga
 *    falta se achica, hasta ESCALA_HOJA1). El resto arranca en la hoja 2.
 *  · Una tabla con filas variables (ej. "Sus mejores partidos", de 5 a 10)
 *    muestra todas las que entren en lo que queda de la hoja.
 *  · Si una sección casi entra (hasta ESCALA_MIN), se achica para que entre
 *    en vez de dejar el hueco.
 *  · Si la última hoja queda casi vacía, se junta con la anterior achicando
 *    las dos un poco (hasta ESCALA_JUNTAR).
 *  · Si no, va a la hoja siguiente. Si no entra ni en una hoja entera, se
 *    achica lo necesario (hasta ESCALA_PISO). Si ni así entra (una tabla de
 *    200 filas), devuelve null y se imprime como antes (el navegador corta).
 *
 * Entra: [{ id, alto, filas?: { total, min, alturas: [px por fila] } }], el
 * alto útil de la hoja y la separación entre secciones (en px).
 * Sale: [[{ id, escala, filas }]] (una lista por hoja) o null.
 */

export const ESCALA_MIN = 0.85;
export const ESCALA_HOJA1 = 0.7;
export const ESCALA_PISO = 0.6;
export const ESCALA_JUNTAR = 0.8;   // para no dejar una última hoja casi vacía
export const CASI_VACIA = 0.35;

/** Alto de la sección mostrando `k` filas de su tabla variable. */
const altoCon = (s, k) => (s.filas ? s.alto - s.filas.alturas.slice(k).reduce((a, b) => a + b, 0) : s.alto);

export function paginar(secciones = [], { alto, separacion = 0 } = {}) {
  if (!(alto > 0) || !secciones.length) return null;
  const hojas = [];
  const usados = [];
  let hoja = [];
  let libre = alto;
  let fija = 0;   // las primeras `fija` hojas no se tocan al juntar (la hoja 1 con la devolución)
  const cerrar = () => { if (hoja.length) { hojas.push(hoja); usados.push(alto - libre); } hoja = []; libre = alto; };
  const poner = (s, escala = 1, filas = s.filas ? s.filas.total : null) => {
    const h = altoCon(s, filas ?? 0) * escala;
    libre -= h + (hoja.length ? separacion : 0);
    hoja.push({ id: s.id, escala: Math.round(escala * 1000) / 1000, filas });
  };

  let resto = secciones;
  /* Hoja 1: portada + devolución + staff, juntas. */
  if (secciones.some((s) => s.id === 'devolucion')) {
    const primeras = [];
    for (const s of secciones) {
      if (['portada', 'devolucion', 'staff'].includes(s.id)) primeras.push(s); else break;
    }
    if (primeras.some((s) => s.id === 'devolucion')) {
      const portada = primeras.find((s) => s.id === 'portada');
      const fijo = portada ? portada.alto : 0;
      const achicables = primeras.filter((s) => s !== portada);
      const seps = separacion * (primeras.length - 1);
      const altoAchicable = achicables.reduce((a, s) => a + s.alto, 0);
      const escala = Math.min(1, (alto - fijo - seps) / altoAchicable);
      if (escala >= ESCALA_HOJA1) {
        primeras.forEach((s) => poner(s, s === portada ? 1 : escala));
        cerrar();
        fija = 1;
        resto = secciones.slice(primeras.length);
      }
    }
  }

  for (const s of resto) {
    const disponible = libre - (hoja.length ? separacion : 0);
    if (s.filas) {
      // Todas las filas que entren en lo que queda (al menos el mínimo).
      let k = s.filas.total;
      while (k > s.filas.min && altoCon(s, k) > disponible) k -= 1;
      if (altoCon(s, k) <= disponible) { poner(s, 1, k); continue; }
    } else if (s.alto <= disponible) { poner(s); continue; }
    const h = s.filas ? altoCon(s, s.filas.min) : s.alto;
    if (hoja.length && h * ESCALA_MIN <= disponible) { poner(s, disponible / h, s.filas ? s.filas.min : null); continue; }
    // A la hoja siguiente.
    cerrar();
    if (s.filas) {
      let k = s.filas.total;
      while (k > s.filas.min && altoCon(s, k) > alto) k -= 1;
      const hk = altoCon(s, k);
      if (hk <= alto) { poner(s, 1, k); continue; }
      if (alto / hk < ESCALA_PISO) return null;
      poner(s, alto / hk, k);
      continue;
    }
    if (s.alto <= alto) { poner(s); continue; }
    if (alto / s.alto < ESCALA_PISO) return null;
    poner(s, alto / s.alto);
  }
  cerrar();

  /* Si la última hoja queda casi vacía, se junta con la anterior achicando las dos (hasta ESCALA_JUNTAR). */
  const n = hojas.length;
  if (n >= 2 && n - 2 >= fija && usados[n - 1] < alto * CASI_VACIA) {
    const f = alto / (usados[n - 2] + separacion + usados[n - 1]);
    if (f >= ESCALA_JUNTAR) {
      const juntas = [...hojas[n - 2], ...hojas[n - 1]].map((x) => ({ ...x, escala: Math.round(x.escala * Math.min(1, f) * 1000) / 1000 }));
      hojas.splice(n - 2, 2, juntas);
    }
  }
  return hojas;
}
