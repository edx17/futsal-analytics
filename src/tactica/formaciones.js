/* FORMACIONES DE FUTSAL
 *
 * Armar un 3-1 ficha por ficha son cinco clics más cinco ediciones de
 * etiqueta, y encima queda torcido. Estas son las estructuras que un CT
 * dibuja todo el tiempo.
 *
 * Las posiciones van en fracciones de la cancha (0 a 1), no en píxeles, para
 * que sirvan igual en la cancha reglamentaria, en la reducida y en media
 * pista. `x` crece hacia el arco rival.
 */

export const FORMACIONES = {
  '3-1': {
    label: '3-1 Clásico',
    ayuda: 'Cierre, dos alas y un pivot. La base del futsal.',
    puestos: [
      { rol: 'Arquero', x: 0.06, y: 0.50, arquero: true },
      { rol: 'Cierre',  x: 0.30, y: 0.50 },
      { rol: 'Ala izq', x: 0.52, y: 0.20 },
      { rol: 'Ala der', x: 0.52, y: 0.80 },
      { rol: 'Pivot',   x: 0.76, y: 0.50 },
    ],
  },
  '4-0': {
    label: '4-0 Universal',
    ayuda: 'Los cuatro de campo en línea, sin pivot fijo. Rotación permanente.',
    puestos: [
      { rol: 'Arquero', x: 0.06, y: 0.50, arquero: true },
      { rol: 'Uno',     x: 0.46, y: 0.16 },
      { rol: 'Dos',     x: 0.46, y: 0.39 },
      { rol: 'Tres',    x: 0.46, y: 0.61 },
      { rol: 'Cuatro',  x: 0.46, y: 0.84 },
    ],
  },
  '2-2': {
    label: '2-2 Cuadrado',
    ayuda: 'Dos y dos. Simple de defender, cómodo para empezar a enseñar.',
    puestos: [
      { rol: 'Arquero', x: 0.06, y: 0.50, arquero: true },
      { rol: 'Cierre izq', x: 0.32, y: 0.30 },
      { rol: 'Cierre der', x: 0.32, y: 0.70 },
      { rol: 'Ala izq',    x: 0.66, y: 0.30 },
      { rol: 'Ala der',    x: 0.66, y: 0.70 },
    ],
  },
  '1-2-1': {
    label: '1-2-1 Rombo',
    ayuda: 'Cierre, dos por dentro y punta. Rombo de ataque posicional.',
    puestos: [
      { rol: 'Arquero', x: 0.06, y: 0.50, arquero: true },
      { rol: 'Cierre',  x: 0.28, y: 0.50 },
      { rol: 'Medio izq', x: 0.53, y: 0.26 },
      { rol: 'Medio der', x: 0.53, y: 0.74 },
      { rol: 'Punta',   x: 0.78, y: 0.50 },
    ],
  },
  '5v4': {
    label: '5v4 · Power play',
    ayuda: 'Arquero-jugador sumado al ataque: cuatro arriba y uno de apoyo.',
    puestos: [
      { rol: 'Arq-jugador', x: 0.42, y: 0.50, arquero: true },
      { rol: 'Ala izq',  x: 0.62, y: 0.16 },
      { rol: 'Ala der',  x: 0.62, y: 0.84 },
      { rol: 'Pivot izq', x: 0.84, y: 0.34 },
      { rol: 'Pivot der', x: 0.84, y: 0.66 },
    ],
  },
};

export const CLAVES_FORMACION = Object.keys(FORMACIONES);

/* Convierte una formación en elementos listos para la pizarra.
 *
 * `comoRival` la da vuelta Y la mete en el campo de ellos. Un espejo a secas
 * los dejaba encima de nuestras fichas —el 3-1 reflejado cae justo sobre el
 * propio— y la pizarra quedaba ilegible. Replegados a su mitad se lee lo que
 * de verdad pasa: ellos defienden, nosotros atacamos.
 */
const MITAD_RIVAL = 0.55;   // desde dónde arranca su campo
const HONDO_RIVAL = 0.45;   // cuánto de cancha ocupan replegados

export function elementosDeFormacion(clave, {
  ancho, alto, equipo = 'home', arquero = 'gk-ama', comoRival = false, nuevoId,
} = {}) {
  const f = FORMACIONES[clave];
  if (!f || !ancho || !alto) return [];
  return f.puestos.map((p, i) => {
    const fx = comoRival ? MITAD_RIVAL + (1 - p.x) * HONDO_RIVAL : p.x;
    return {
      id: nuevoId ? nuevoId() : `form-${clave}-${i}-${Date.now()}`,
      type: p.arquero ? arquero : equipo,
      x: Math.round(fx * ancho),
      y: Math.round(p.y * alto),
      rotation: 0,
      /* El arquero lleva 1 y el resto se numera del 2 en adelante: es como se
         escriben las pizarras, no por posición en el array. */
      label: p.arquero ? '1' : String(i + 1),
    };
  });
}
