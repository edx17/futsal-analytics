/* V-DRAFT · EL PARTIDO (sin pantalla, para poder probarlo)
 *
 * Lo que muestra la pantalla del partido con lo que ya devuelve la base
 * (vdraft_jugar): fuerza propia y del rival, los goles con su autor. No
 * inventa nada del rival: de él sólo se conoce la fuerza.
 *   - el perfil de tu equipo (ataque, defensa, arco) sacado de tus cartas;
 *   - las barras del VS;
 *   - la carta del que hizo el gol;
 *   - qué sigue después del partido y qué premio te llevás.
 */

import { premioPorVictorias } from './vdraft';

/** Un atributo de una carta: carta.atributos es [['TIR', 85], …]. */
export function atributo(c, clave) {
  const lista = c?.carta?.atributos || c?.atributos || [];
  const par = lista.find((a) => Array.isArray(a) && a[0] === clave);
  return par ? Number(par[1]) : null;
}

const promedio = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
};

/**
 * Ataque, defensa y arco de tu equipo, según los atributos de tus cartas.
 * Ataque: TIR, PAS y REG de los de campo. Defensa: DEF de los de campo.
 * Arco: ATA, SAL y EVI del arquero (lugar 0). null si no hay datos.
 */
export function perfilEquipo(equipo = []) {
  const campo = (equipo || []).slice(1).filter(Boolean);
  const arquero = (equipo || [])[0];
  return {
    ataque: promedio(campo.flatMap((c) => ['TIR', 'PAS', 'REG'].map((k) => atributo(c, k)))),
    defensa: promedio(campo.map((c) => atributo(c, 'DEF'))),
    arco: arquero ? promedio(['ATA', 'SAL', 'EVI'].map((k) => atributo(arquero, k))) : null,
  };
}

const num = (x) => (x == null || x === '' ? NaN : Number(x));

/** La parte de cada uno en una barra enfrentada (0 a 1 para el propio). */
export function parte(propio, rival) {
  const a = num(propio);
  const b = num(rival);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a + b <= 0) return 0.5;
  return a / (a + b);
}

/** Quién es favorito: 'propio' | 'rival' | 'parejo' (menos de 2 puntos de fuerza). */
export function favorito(propio, rival) {
  const d = num(propio) - num(rival);
  if (!Number.isFinite(d) || Math.abs(d) < 2) return 'parejo';
  return d > 0 ? 'propio' : 'rival';
}

/** La carta del que hizo el gol (por apellido, entre titulares y suplentes). */
export function cartaDelAutor(partida, apellido) {
  if (!apellido) return null;
  const todas = [...(partida?.equipo || []), ...(partida?.banco || [])].filter(Boolean);
  return todas.find((c) => c.carta?.apellido === apellido) || null;
}

/**
 * Qué pasa después del partido:
 *   { fin, campeon, premio, siguiente: rival | null, asegurado: premio si te retirás ahora }.
 */
export function despuesDelPartido(partida) {
  const fin = partida?.estado === 'terminada';
  const victorias = partida?.victorias || 0;
  const jugados = partida?.partidos?.length || 0;
  return {
    fin,
    campeon: fin && victorias >= 3,
    premio: fin ? (partida.premio || premioPorVictorias(victorias)) : null,
    siguiente: fin ? null : partida?.rivales?.[jugados] || null,
    asegurado: fin ? null : premioPorVictorias(victorias),
    proximo: fin ? null : premioPorVictorias(victorias + 1),
  };
}

/** Cuántas monedas caen en la pantalla del premio (más premio, más monedas; tope 40). */
export const monedasQueCaen = (vcoins) => Math.max(0, Math.min(40, Math.round((Number(vcoins) || 0) / 8)));
