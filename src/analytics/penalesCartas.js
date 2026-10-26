/* PENALES CON CARTAS
 *
 * El modo Penales con premio: elegís un pateador y un arquero de TUS cartas y
 * jugás una tanda contra la CPU. La tanda corre en la base (migración
 * 20261103120000_penales_cartas.sql); esto es el espejo de sus números para
 * mostrar las chances y probar las reglas. Si se cambia un número, cambiarlo
 * en los dos lados.
 *
 *   Patear: elegís 1 de 9 cuadrantes. Tu pateador vale 0,6·TIR + 0,4·IMP.
 *           El arquero de la CPU a veces te lee el tiro; si va al mismo
 *           cuadrante o a uno de al lado, ataja según su nivel contra tu
 *           pateador. Los ángulos pueden ir al palo (menos con buen pateador).
 *   Atajar: elegís 1 de 9 cuadrantes. Tu arquero vale (ATA + SAL + EVI) / 3.
 *           Si adivinás el cuadrante (o llegás a uno de al lado), atajás
 *           según tu arquero contra el pateador de la CPU.
 *   Reloj:  5 segundos por tiro. Si no elegís: pateás a cualquier lado (y
 *           puede irse afuera) o te quedás en el medio.
 */

export const SEGUNDOS_POR_TIRO = 5;
export const PREMIOS_POR_DIA = 3;
export const SIN_ELEGIR = -1;

export const NIVELES_CARTAS = [
  { id: 0, nombre: 'AMATEUR', cpu: 58, premio: 20, detalle: 'Arquero y pateador de la CPU flojos.' },
  { id: 1, nombre: 'PRIMERA C', cpu: 66, premio: 35, detalle: 'Un poco más parejo.' },
  { id: 2, nombre: 'PRIMERA B', cpu: 74, premio: 50, detalle: 'La CPU lee más tiros y define mejor.' },
  { id: 3, nombre: 'PRIMERA A', cpu: 82, premio: 80, detalle: 'Hace falta un buen pateador y un buen arquero.' },
];

const limitar = (x, a, b) => Math.max(a, Math.min(b, x));
const vecinos = (a, b) => Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) <= 1 && Math.abs((a % 3) - (b % 3)) <= 1;
export const ESQUINAS = new Set([0, 2, 6, 8]);

function atributo(c, clave) {
  const par = (c?.carta?.atributos || c?.atributos || []).find((a) => Array.isArray(a) && a[0] === clave);
  return par ? Number(par[1]) : null;
}
const ovr = (c) => Number(c?.carta?.ovr ?? c?.ovr ?? 60);

/** Lo que vale una carta pateando: 0,6·TIR + 0,4·IMP (sin atributos, su media). */
export function valorPateador(c) {
  const tir = atributo(c, 'TIR');
  const imp = atributo(c, 'IMP');
  if (tir == null || imp == null) return Math.round(ovr(c));
  return Math.round(0.6 * tir + 0.4 * imp);
}

/** Lo que vale una carta atajando: (ATA + SAL + EVI) / 3 (sin atributos, su media). */
export function valorArquero(c) {
  const xs = ['ATA', 'SAL', 'EVI'].map((k) => atributo(c, k));
  if (xs.some((x) => x == null)) return Math.round(ovr(c));
  return Math.round(xs.reduce((s, x) => s + x, 0) / 3);
}

/** Las chances de un tiro tuyo (pateador S contra el arquero de la CPU K). */
export function chancesPatear(S, K) {
  return {
    palo: limitar(0.10 - (S - 60) / 600, 0.02, 0.12),
    lectura: limitar(0.12 + (K - 60) / 200, 0.08, 0.3),
    mismo: limitar(0.55 + (K - S) / 150, 0.3, 0.85),
    vecino: limitar(0.25 + (K - S) / 250, 0.08, 0.4),
  };
}

/** Las chances cuando atajás (tu arquero G contra el pateador de la CPU R). */
export function chancesAtajar(G, R) {
  return {
    afuera: limitar(0.06 - (R - 60) / 800, 0.02, 0.08),
    mismo: limitar(0.55 + (G - R) / 150, 0.3, 0.85),
    vecino: limitar(0.3 + (G - R) / 250, 0.1, 0.45),
  };
}

/** Un tiro tuyo al cuadrante `celda` (o SIN_ELEGIR). `azar`: () => [0, 1). */
export function patearConCarta(celda, S, K, azar = Math.random) {
  const ch = chancesPatear(S, K);
  if (celda === SIN_ELEGIR) {
    const c = Math.floor(azar() * 9);
    if (azar() < 0.3) return { celda: c, arquero: 4, gol: false, motivo: 'afuera' };
    celda = c;
  }
  const arquero = azar() < ch.lectura ? celda : Math.floor(azar() * 9);
  if (ESQUINAS.has(celda) && azar() < ch.palo) return { celda, arquero, gol: false, motivo: 'palo' };
  if (arquero === celda && azar() < ch.mismo) return { celda, arquero, gol: false, motivo: 'atajada' };
  if (arquero !== celda && vecinos(arquero, celda) && azar() < ch.vecino) return { celda, arquero, gol: false, motivo: 'atajada' };
  return { celda, arquero, gol: true, motivo: 'gol' };
}

/** Un tiro de la CPU; te tirás al cuadrante `eleccion` (o SIN_ELEGIR: te quedás en el medio). */
export function atajarConCarta(eleccion, G, R, azar = Math.random) {
  const ch = chancesAtajar(G, R);
  const arquero = eleccion === SIN_ELEGIR ? 4 : eleccion;
  const celda = Math.floor(azar() * 9);
  if (azar() < ch.afuera) return { celda, arquero, lado: arquero % 3, gol: false, motivo: 'afuera' };
  if (arquero === celda && azar() < ch.mismo) return { celda, arquero, lado: arquero % 3, gol: false, motivo: 'atajada' };
  if (arquero !== celda && vecinos(arquero, celda) && azar() < ch.vecino) return { celda, arquero, lado: arquero % 3, gol: false, motivo: 'atajada' };
  return { celda, arquero, lado: arquero % 3, gol: true, motivo: 'gol' };
}

/** Las cartas que sirven: pateadores (de campo) y arqueros, de la mejor a la peor. */
export function cartasParaPenales(cartas = []) {
  const lista = (cartas || []).filter((c) => c && c.carta);
  const arqueros = lista.filter((c) => c.carta.rol === 'ARQ').sort((a, b) => valorArquero(b) - valorArquero(a));
  const pateadores = lista.filter((c) => c.carta.rol !== 'ARQ').sort((a, b) => valorPateador(b) - valorPateador(a));
  return { pateadores, arqueros };
}
