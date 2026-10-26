/* PENALES · LA ESCENA RENDERIZADA (sin pantalla, para poder probarla)
 *
 * La tanda se ve desde el punto del penal: el fondo, la red y el arquero son
 * renders de Blender (cine/escena_penales.py → public/penales/). Acá se decide
 * qué se muestra en cada tiro:
 *   · adónde va la pelota en la imagen (cuadrante, palo o afuera);
 *   · qué parada hace el arquero y si va espejada (las de la derecha son las
 *     de la izquierda dadas vuelta);
 *   · qué cuadro de la tira mostrar.
 * Las medidas salen de public/penales/penales.json (`geo`).
 */

const U = [0.16, 0.5, 0.84];   // columnas del arco (0 izquierda de la pantalla)
const V = [0.17, 0.5, 0.84];   // filas (0 arriba)
const ALTURAS_IZQ = ['izq_alta', 'izq_media', 'izq_baja'];
const ALTURAS_CENTRO = ['centro_alto', 'centro_medio', 'centro_bajo'];

const mezclar = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Un punto del plano del arco (u: 0 palo izquierdo → 1 derecho; v: 0 travesaño → 1 piso) en la imagen. */
export function puntoDelArco(geo, u, v) {
  const { arriba_izq: ai, arriba_der: ad, abajo_izq: bi, abajo_der: bd } = geo.arco;
  return mezclar(mezclar(ai, ad, u), mezclar(bi, bd, u), v);
}

/** Adónde va la pelota: el cuadrante; al palo, el palo de ese lado; afuera, al costado o por arriba. */
export function destinoDeLaPelota(geo, celda, motivo) {
  const c = celda % 3;
  const f = Math.floor(celda / 3);
  if (motivo === 'palo') return puntoDelArco(geo, c === 0 ? 0 : 1, V[f]);
  if (motivo === 'afuera') {
    if (c === 1 || f === 0) return puntoDelArco(geo, U[c], -0.16);
    return puntoDelArco(geo, c === 0 ? -0.13 : 1.13, V[f]);
  }
  return puntoDelArco(geo, U[c], V[f]);
}

/** Dónde termina la pelota que entra: contra la red del fondo, a la misma altura relativa. */
export function fondoDeLaRed(geo, celda) {
  const g = { arco: geo.red_fondo };
  return puntoDelArco(g, U[celda % 3], V[Math.floor(celda / 3)]);
}

/**
 * La parada del arquero en un tiro. En el tuyo ataja la CPU (va al cuadrante
 * `tiro.arquero`); en el del rival atajás vos: al cuadrante `tiro.arquero` (modo
 * con cartas) o al lado `tiro.lado` (V-Draft), y si es la columna de la pelota,
 * a su altura.
 */
export function paradaDelArquero(tiro) {
  let col;
  let fila;
  // En tu tiro ataja la CPU; en el modo con cartas también atajás a un cuadrante (`arquero`).
  if (tiro.equipo === 'propio' || Number.isInteger(tiro.arquero)) {
    col = tiro.arquero % 3;
    fila = Math.floor(tiro.arquero / 3);
  } else {
    col = tiro.lado;
    fila = tiro.celda % 3 === tiro.lado ? Math.floor(tiro.celda / 3) : 1;
  }
  if (col === 1) return { anim: ALTURAS_CENTRO[fila], espejo: false };
  return { anim: ALTURAS_IZQ[fila], espejo: col === 2 };
}

/** Quién ataja: cuando patea el club, el arquero rival; cuando patea el rival, el nuestro. */
export const equipoDelArquero = (pateador) => (pateador === 'propio' ? 'rival' : 'propio');

/** Adónde va la pelota cuando la atajan: a las manos (el cuadrante al que fue el arquero). */
export function destinoAtajada(geo, tiro) {
  if (tiro.equipo === 'propio' || Number.isInteger(tiro.arquero)) return destinoDeLaPelota(geo, tiro.arquero, 'atajada');
  return destinoDeLaPelota(geo, tiro.celda, 'atajada');
}

/** El cuadro n (desde 0) de una tira: posición del fondo en % (CSS background-position). */
export function posicionDelCuadro(n, cuadros, columnas) {
  const filas = Math.ceil(cuadros / columnas);
  const col = n % columnas;
  const fila = Math.floor(n / columnas);
  return {
    x: columnas > 1 ? (col / (columnas - 1)) * 100 : 0,
    y: filas > 1 ? (fila / (filas - 1)) * 100 : 0,
    ancho: columnas * 100,
    alto: filas * 100,
  };
}

/** Qué cuadro toca a los `ms` de empezada: el loop vuelve a empezar; la parada se queda en el último. */
export function cuadroEn(ms, { cuadros, loop }, fps = 30) {
  const n = Math.floor((Math.max(0, ms) / 1000) * fps);
  return loop ? n % cuadros : Math.min(n, cuadros - 1);
}

/** El rectángulo del arquero en % de la imagen; espejado, del otro lado del centro. */
export function cajaDelArquero(geo, espejo) {
  const { x, y, w, h } = geo.arquero;
  const izq = espejo ? geo.ancho - (x + w) : x;
  return { left: (izq / geo.ancho) * 100, top: (y / geo.alto) * 100, width: (w / geo.ancho) * 100, height: (h / geo.alto) * 100 };
}

/* ── el vuelo de la pelota ─────────────────────────────────────────────── */

export const VUELO_MS = 460;

/**
 * La pelota a la fracción t (0 → 1) del vuelo: sale grande desde abajo (el
 * punto del penal está justo bajo la cámara), hace una pequeña curva y llega
 * del tamaño que tiene en la línea del arco. Devuelve { x, y, r } en píxeles
 * de la imagen.
 */
export function pelotaEnVuelo(geo, destino, t) {
  const inicio = [geo.ancho / 2, geo.alto + 60];
  const e = 1 - (1 - t) ** 2;                         // sale rápida y frena un poco
  const [x, y] = mezclar(inicio, destino, e);
  const comba = Math.sin(Math.PI * e) * 40;           // un poco de vuelo
  const rFinal = geo.pelota_en_arco;
  const r = rFinal + (95 - rFinal) * (1 - e) ** 1.6;
  return { x, y: y - comba, r };
}
