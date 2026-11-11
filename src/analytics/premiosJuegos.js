/* CONFIGURADOR GOD › V-COINS: lo que paga cada juego.
 *
 * Las claves son las de la base (20261116120000_juegos_premios.sql). Los
 * valores de siempre están acá también, para que la pantalla funcione aunque
 * la migración todavía no esté (y para los tests).
 */

export const PREMIOS_DE_SIEMPRE = {
  penales_n0: 20, penales_n1: 35, penales_n2: 50, penales_n3: 80, penales_por_dia: 3,
  vdraft_v1: 25, vdraft_v2: 75, vdraft_v3: 150, vdraft_v4: 300,
  desafio_1: 1000, desafio_2: 750, desafio_3: 500, desafio_resto: 150,
  duelo_ganador: 20, duelo_premios_dia: 3, duelo_apuesta_max: 1000,
  rep_bronce: 5, rep_plata: 10, rep_oro: 25, rep_totw: 40, rep_potw: 50, rep_totm: 60, rep_potm: 75, rep_toty: 100,
};

const TOPES_POR_DIA = new Set(['penales_por_dia', 'duelo_premios_dia']);
export const maximoDe = (clave) => (TOPES_POR_DIA.has(clave) ? 50 : 100000);

/* Cómo se muestran en la pantalla, por juego. `unidad`: 'vc' (V-Coins) o 'veces'. */
export const GRUPOS_PREMIOS = [
  {
    id: 'penales', titulo: 'PENALES', bajada: 'Lo que paga una tanda ganada, según el nivel de la CPU.',
    campos: [
      ['penales_n0', 'Amateur'], ['penales_n1', 'Primera C'], ['penales_n2', 'Primera B'], ['penales_n3', 'Primera A'],
      ['penales_por_dia', 'Tandas con premio por día', 'veces'],
    ],
  },
  {
    id: 'vdraft', titulo: 'V-DRAFT', bajada: 'La partida normal, según cuántos partidos ganaste (los sobres de campeón no cambian).',
    campos: [['vdraft_v1', '1 victoria'], ['vdraft_v2', '2 victorias'], ['vdraft_v3', '3 victorias (campeón)'], ['vdraft_v4', '4 victorias (campeón de campeones)']],
  },
  {
    id: 'desafio', titulo: 'DESAFÍO DEL DÍA', bajada: 'Al cerrar el día, según el puesto (si jugó al menos un partido).',
    campos: [['desafio_1', '1º puesto'], ['desafio_2', '2º puesto'], ['desafio_3', '3º puesto'], ['desafio_resto', 'Los demás']],
  },
  {
    id: 'duelos', titulo: 'DUELOS', bajada: 'El extra para el que gana (además del pozo de la apuesta).',
    campos: [['duelo_ganador', 'Extra por duelo ganado'], ['duelo_premios_dia', 'Duelos ganados con extra por día', 'veces'], ['duelo_apuesta_max', 'Apuesta máxima']],
  },
  {
    id: 'repetidas', titulo: 'CARTAS REPETIDAS', bajada: 'Lo que da una carta que ya tenías al abrir un sobre, según su rareza.',
    campos: [['rep_bronce', 'Bronce'], ['rep_plata', 'Plata'], ['rep_oro', 'Oro'], ['rep_totw', 'TOTW'], ['rep_potw', 'POTW'], ['rep_totm', 'TOTM'], ['rep_potm', 'POTM'], ['rep_toty', 'TOTY']],
  },
];

/** Qué está mal: { clave: texto } (vacío si se puede guardar). */
export function erroresDePremios(valores = {}) {
  const errores = {};
  Object.keys(PREMIOS_DE_SIEMPRE).forEach((k) => {
    const v = valores[k];
    const max = maximoDe(k);
    if (v === '' || v == null || !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > max) errores[k] = `De 0 a ${max.toLocaleString('es-AR')}, sin decimales.`;
  });
  return errores;
}

/** Los que quedan distintos a los de siempre (lo que se guarda en la base). */
export function cambiosRespectoDeSiempre(valores = {}, deSiempre = PREMIOS_DE_SIEMPRE) {
  return Object.fromEntries(Object.keys(deSiempre)
    .filter((k) => valores[k] !== undefined && Number(valores[k]) !== deSiempre[k])
    .map((k) => [k, Number(valores[k])]));
}

/** Lo que se manda: todas las claves, como enteros. */
export const paraGuardarPremios = (valores = {}) => Object.fromEntries(Object.keys(PREMIOS_DE_SIEMPRE).map((k) => [k, Number(valores[k])]));

/* Para las pantallas de los juegos: el premio del club si la base lo manda, si no el de siempre. */
export const premiosDeNivel = (estado) => (Array.isArray(estado?.premios_nivel) && estado.premios_nivel.length === 4 ? estado.premios_nivel
  : ['penales_n0', 'penales_n1', 'penales_n2', 'penales_n3'].map((k) => PREMIOS_DE_SIEMPRE[k]));
export const premiosDeVictorias = (estado) => (Array.isArray(estado?.premios_victorias) && estado.premios_victorias.length === 4 ? estado.premios_victorias
  : ['vdraft_v1', 'vdraft_v2', 'vdraft_v3', 'vdraft_v4'].map((k) => PREMIOS_DE_SIEMPRE[k]));
export const premiosDelDesafio = (estado) => (Array.isArray(estado?.desafio?.premios) && estado.desafio.premios.length === 4 ? estado.desafio.premios
  : ['desafio_1', 'desafio_2', 'desafio_3', 'desafio_resto'].map((k) => PREMIOS_DE_SIEMPRE[k]));
