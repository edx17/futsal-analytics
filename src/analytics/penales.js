/* LOS PENALES DEL V-DRAFT
 *
 * Espejo de la tanda que corre en la base (migración
 * 20261026120000_vdraft_penales.sql): mismos números y mismas reglas. La base
 * decide; esto sirve para mostrar el arco, explicar la dificultad y probar que
 * las reglas se cumplen. Si se cambia un número, cambiarlo en los dos lados.
 *
 *   Patear: 9 cuadrantes (0 arriba a la izquierda … 8 abajo a la derecha).
 *           El arquero se tira a uno: si es el mismo, ataja; si es uno de al
 *           lado, llega con la chance `alcance`; los ángulos pueden ir al palo.
 *   Atajar: izquierda, centro o derecha (0, 1, 2). Si el rival patea a esa
 *           columna, se ataja con la chance `ataja`; a veces la tira afuera.
 */

/* La dificultad por ronda: 0 = cuartos (vs Primera D) … 3 = vs Primera A. */
export const DIFICULTAD = [
  { alcance: 0.18, palo: 0.04, ataja: 0.75, afuera: 0.06 },
  { alcance: 0.22, palo: 0.05, ataja: 0.71, afuera: 0.05 },
  { alcance: 0.26, palo: 0.06, ataja: 0.67, afuera: 0.045 },
  { alcance: 0.3, palo: 0.07, ataja: 0.63, afuera: 0.04 },
];

export const ESQUINAS = new Set([0, 2, 6, 8]);
export const LADOS = ['IZQUIERDA', 'CENTRO', 'DERECHA'];

const vecinos = (a, b) => Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) <= 1 && Math.abs((a % 3) - (b % 3)) <= 1;

/** Un tiro del jugador al cuadrante `celda`. `azar`: () => [0, 1). */
export function patear(celda, d, azar = Math.random) {
  const arquero = Math.floor(azar() * 9);
  if (ESQUINAS.has(celda) && azar() < d.palo) return { celda, arquero, gol: false, motivo: 'palo' };
  if (arquero === celda) return { celda, arquero, gol: false, motivo: 'atajada' };
  if (vecinos(arquero, celda) && azar() < d.alcance) return { celda, arquero, gol: false, motivo: 'atajada' };
  return { celda, arquero, gol: true, motivo: 'gol' };
}

/** Un tiro del rival; el jugador se tira al `lado` (0, 1, 2). */
export function atajar(lado, d, azar = Math.random) {
  const celda = Math.floor(azar() * 9);
  if (azar() < d.afuera) return { celda, lado, gol: false, motivo: 'afuera' };
  if (celda % 3 === lado && azar() < d.ataja) return { celda, lado, gol: false, motivo: 'atajada' };
  return { celda, lado, gol: true, motivo: 'gol' };
}

/** A quién le toca: alternan, empezando por `primero`. */
export function turno({ primero, tiros = [] }) {
  const np = tiros.filter((t) => t.equipo === 'propio').length;
  const nr = tiros.length - np;
  return np === nr ? primero : primero === 'propio' ? 'rival' : 'propio';
}

/** 'propio', 'rival' o null si sigue. Cinco cada uno (se corta si ya no se alcanza) y muerte súbita. */
export function ganador(tiros = []) {
  const np = tiros.filter((t) => t.equipo === 'propio').length;
  const nr = tiros.length - np;
  const gp = tiros.filter((t) => t.equipo === 'propio' && t.gol).length;
  const gr = tiros.filter((t) => t.equipo === 'rival' && t.gol).length;
  if (np <= 5 && nr <= 5) {
    if (gp > gr + (5 - nr)) return 'propio';
    if (gr > gp + (5 - np)) return 'rival';
    if (np === 5 && nr === 5 && gp !== gr) return gp > gr ? 'propio' : 'rival';
    return null;
  }
  return np === nr && gp !== gr ? (gp > gr ? 'propio' : 'rival') : null;
}

/** Los cinco puntitos de cada lado (y los de la muerte súbita): true gol, false errado, null falta. */
export function marcadorDeTiros(tiros = [], equipo) {
  const propios = tiros.filter((t) => t.equipo === equipo).map((t) => t.gol);
  const largo = Math.max(5, propios.length, tiros.length - propios.length);
  return Array.from({ length: largo }, (_, i) => (i < propios.length ? propios[i] : null));
}
