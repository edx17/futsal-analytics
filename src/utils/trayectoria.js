/* TRAYECTORIAS DE LAS FICHAS
 *
 * Entre un fotograma y el siguiente, una ficha viajaba siempre en línea
 * recta. Un desmarque en curva, una diagonal o un bloqueo y salida se
 * reproducían como si el jugador caminara derecho.
 *
 * Ahora cada ficha puede llevar un `bow`: cuánto se aparta del punto medio
 * el camino que hace para llegar a su posición de este fotograma. Se guarda
 * como desplazamiento relativo a ese punto medio, no como coordenada
 * absoluta, para que mover cualquiera de las dos puntas conserve la forma
 * de la curva en vez de deformarla.
 *
 * Sin `bow` la trayectoria es una recta, así que todas las jugadas ya
 * guardadas se siguen reproduciendo exactamente igual.
 */

export const puntoMedio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/* Dónde se dibuja el tirador que se arrastra: es el punto por el que pasa
 * la curva en la mitad del recorrido, no el punto de control de la bezier.
 * Así el camino sigue al dedo en vez de quedar a mitad de camino de él. */
export const tiradorDe = (desde, hasta, bow) => {
  const m = puntoMedio(desde, hasta);
  return { x: m.x + (bow?.x || 0), y: m.y + (bow?.y || 0) };
};

export const bowDesdeTirador = (desde, hasta, tirador) => {
  const m = puntoMedio(desde, hasta);
  return { x: tirador.x - m.x, y: tirador.y - m.y };
};

/* Una bezier cuadrática pasa por (P0 + 2C + P2)/4 en t=0.5. Para que pase
 * justo por el tirador D hay que poner el control en C = 2D - M. */
export const controlDe = (desde, hasta, bow) => {
  const m = puntoMedio(desde, hasta);
  return { x: m.x + 2 * (bow?.x || 0), y: m.y + 2 * (bow?.y || 0) };
};

export const hayCurva = (bow) => !!bow && (Math.abs(bow.x) > 0.01 || Math.abs(bow.y) > 0.01);

/* Posición en el recorrido para un avance t de 0 a 1. */
export function puntoEnTrayecto(desde, hasta, bow, t) {
  if (!hayCurva(bow)) {
    return { x: desde.x + (hasta.x - desde.x) * t, y: desde.y + (hasta.y - desde.y) * t };
  }
  const c = controlDe(desde, hasta, bow);
  const u = 1 - t;
  return {
    x: u * u * desde.x + 2 * u * t * c.x + t * t * hasta.x,
    y: u * u * desde.y + 2 * u * t * c.y + t * t * hasta.y,
  };
}

/* Traza el camino en un contexto de canvas, sin pintarlo. */
export function trazarTrayecto(ctx, desde, hasta, bow) {
  ctx.beginPath();
  ctx.moveTo(desde.x, desde.y);
  if (!hayCurva(bow)) {
    ctx.lineTo(hasta.x, hasta.y);
  } else {
    const c = controlDe(desde, hasta, bow);
    ctx.quadraticCurveTo(c.x, c.y, hasta.x, hasta.y);
  }
}

/* Cruza el fotograma anterior con el actual y devuelve, para cada ficha que
 * se movió, de dónde viene y por dónde. Las zonas y los textos quedan
 * afuera: mover un rótulo no es un desplazamiento de jugada. */
const MOVIBLE = (el) => el && !el.type?.startsWith('zone') && el.type !== 'text';
const MOVIO = 1.5; // px lógicos: menos que esto es la misma posición

export function trayectosEntre(elementosPrevios, elementosActuales) {
  const previos = new Map((elementosPrevios || []).map(e => [e.id, e]));
  const salida = [];
  (elementosActuales || []).forEach(el => {
    if (!MOVIBLE(el)) return;
    const antes = previos.get(el.id);
    if (!antes) return;
    if (Math.hypot(el.x - antes.x, el.y - antes.y) < MOVIO) return;
    salida.push({
      id: el.id,
      desde: { x: antes.x, y: antes.y },
      hasta: { x: el.x, y: el.y },
      bow: el.bow || null,
      tirador: tiradorDe(antes, el, el.bow),
      tipo: el.type,
    });
  });
  return salida;
}

/* Qué tirador cayó bajo el dedo. Radio generoso: en una tablet el dedo no
 * tiene la precisión de un mouse. */
export function tiradorEn(trayectos, x, y, radio = 13) {
  for (let i = trayectos.length - 1; i >= 0; i--) {
    const t = trayectos[i];
    if (Math.hypot(x - t.tirador.x, y - t.tirador.y) <= radio) return t;
  }
  return null;
}
