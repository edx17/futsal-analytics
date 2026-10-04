/* LA CANCHA EN PERSPECTIVA, EN NÚMEROS
 *
 * La cancha se piensa en metros (futsal: 20 de ancho × 40 de largo) y se
 * proyecta como la vería una cámara: el ancho aparente y la altura en
 * pantalla van con 1/distancia. Así la mitad del fondo se ve más corta que la
 * de adelante y los círculos salen ovalados solos.
 *
 * Vive fuera de los componentes para que el linter de fast-refresh no se
 * queje y para poder usarlo desde la placa más adelante.
 */

export const LIENZO = { ancho: 840, alto: 610 };
export const ANCHO_M = 20;
export const LARGO_M = 40;
/* Ancho del fondo / ancho de adelante: lo cerrado del trapecio. */
export const RELACION = 0.66;

/** u: 0-1 a lo ancho · v: 0 (fondo) a 1 (adelante) → punto en el lienzo y escala aparente. */
export function proyectar(u, v) {
  const { ancho, alto } = LIENZO;
  const z = (1 - v) / RELACION + v;
  const esc = 1 / z;
  return { x: ancho / 2 + (u - 0.5) * ancho * esc, y: (alto * (esc - RELACION)) / (1 - RELACION), esc };
}

export const enMetros = (X, Z) => proyectar(X / ANCHO_M, Z / LARGO_M);

const arcoM = (cx, cz, r, a0, a1, n = 48) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return pts;
};

const camino = (pts) => pts
  .map(([X, Z], i) => { const p = enMetros(X, Z); return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; })
  .join(' ');

/* Área de futsal: dos cuartos de círculo de 6 m con centro en cada palo
   (palos a 1,5 m del centro) unidos por una recta de 3 m. */
const area = (zArco, haciaAdelante) => {
  const izq = ANCHO_M / 2 - 1.5, der = ANCHO_M / 2 + 1.5;
  const a = haciaAdelante ? arcoM(izq, zArco, 6, Math.PI, Math.PI / 2) : arcoM(izq, zArco, 6, Math.PI, 1.5 * Math.PI);
  const b = haciaAdelante ? arcoM(der, zArco, 6, Math.PI / 2, 0) : arcoM(der, zArco, 6, 1.5 * Math.PI, 2 * Math.PI);
  return camino([...a, ...b]);
};

const arcoGol = (zArco, haciaAdelante) => {
  const a = ANCHO_M / 2 - 1.5, b = ANCHO_M / 2 + 1.5, f = zArco + (haciaAdelante ? -1 : 1);
  return camino([[a, zArco], [a, f], [b, f], [b, zArco]]);
};

/** Todo lo que se dibuja de la cancha, ya proyectado. */
export function dibujoCancha() {
  const franjas = [];
  for (let z = 0; z < LARGO_M; z += 8) {
    const q = [enMetros(0, z), enMetros(ANCHO_M, z), enMetros(ANCHO_M, z + 4), enMetros(0, z + 4)];
    franjas.push(q.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  }
  const esquinas = [[0, 0, 0, 0.5 * Math.PI], [ANCHO_M, 0, 0.5 * Math.PI, Math.PI],
    [0, LARGO_M, 1.5 * Math.PI, 2 * Math.PI], [ANCHO_M, LARGO_M, Math.PI, 1.5 * Math.PI]];
  const puntos = [[ANCHO_M / 2, LARGO_M / 2], [ANCHO_M / 2, 6], [ANCHO_M / 2, LARGO_M - 6],
    [ANCHO_M / 2, 10], [ANCHO_M / 2, LARGO_M - 10]].map(([X, Z]) => enMetros(X, Z));
  const pasto = [enMetros(0, 0), enMetros(ANCHO_M, 0), enMetros(ANCHO_M, LARGO_M), enMetros(0, LARGO_M)]
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return {
    pasto,
    franjas,
    lineas: [
      camino([[0, 0], [ANCHO_M, 0], [ANCHO_M, LARGO_M], [0, LARGO_M], [0, 0]]),
      camino([[0, LARGO_M / 2], [ANCHO_M, LARGO_M / 2]]),
      camino(arcoM(ANCHO_M / 2, LARGO_M / 2, 3, 0, 2 * Math.PI, 96)),
      area(0, true),
      area(LARGO_M, false),
      ...esquinas.map(([x, z, a0, a1]) => camino(arcoM(x, z, 0.6, a0, a1, 10))),
      ...[LARGO_M / 2 - 10, LARGO_M / 2 - 5, LARGO_M / 2 + 5, LARGO_M / 2 + 10]
        .map((z) => camino([[ANCHO_M, z], [ANCHO_M - 0.5, z]])),
    ],
    arcos: [arcoGol(0, true), arcoGol(LARGO_M, false)],
    puntos,
  };
}
