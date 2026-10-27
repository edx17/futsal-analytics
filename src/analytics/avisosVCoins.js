/* LOS EVENTOS DE V-COINS MULTIPLICADAS: DÓNDE APLICAN Y EL CARTEL
 *
 * Un evento (vcoins_multiplicadores, Modo GOD · USUARIOS) multiplica lo que se
 * gana en los juegos que elige (`aplica`). La base decide los premios
 * (migración 20261105120000_vcoins_eventos.sql); esto arma el texto del cartel
 * que ven los jugadores: anticipado (empieza pronto) y mientras corre.
 */

export const AREAS = [
  { id: 'sobres', nombre: 'SOBRES', ayuda: 'las repetidas' },
  { id: 'vdraft', nombre: 'V-DRAFT', ayuda: 'el premio del torneo' },
  { id: 'misiones', nombre: 'MISIONES', ayuda: 'las del día' },
  { id: 'penales', nombre: 'PENALES', ayuda: 'la tanda ganada' },
];
export const TODAS = AREAS.map((a) => a.id);

/** Sin `aplica` (eventos de antes) cuenta como todos los juegos. */
export const areasDe = (m) => (Array.isArray(m?.aplica) && m.aplica.length ? m.aplica : TODAS);
export const aplicaA = (m, area) => !!m && areasDe(m).includes(area);

/** "PENALES Y MISIONES", "SOBRES, V-DRAFT Y PENALES" o "TODOS LOS JUEGOS". */
export function textoAreas(aplica) {
  const ids = areasDe({ aplica });
  if (TODAS.every((a) => ids.includes(a))) return 'TODOS LOS JUEGOS';
  const n = AREAS.filter((a) => ids.includes(a.id)).map((a) => a.nombre);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} Y ${n[n.length - 1]}` : n[0] || '';
}

const factor = (f) => `x${String(Number(f)).replace('.', ',')}`;

/**
 * El cartel de los Juegos a partir de juegos_avisos: null si no hay nada.
 * { tipo: 'curso' | 'proximo', titulo, donde, hasta|desde (para la cuenta regresiva) }.
 * Mientras corre uno, manda ése; si no, el próximo (la base sólo manda los de 7 días).
 */
export function cartelVCoins(avisos, ahora = new Date()) {
  const t = +ahora;
  const a = avisos?.actual;
  if (a && +new Date(a.hasta) > t) {
    return { tipo: 'curso', titulo: `${factor(a.factor)} V-COINS · ${a.nombre}`, donde: textoAreas(a.aplica), hasta: a.hasta };
  }
  const p = avisos?.proximo;
  if (p && +new Date(p.desde) > t) {
    return { tipo: 'proximo', titulo: `${factor(p.factor)} V-COINS · ${p.nombre}`, donde: textoAreas(p.aplica), desde: p.desde, hasta: p.hasta };
  }
  return null;
}

/** El premio con el evento aplicado (para mostrarlo; la base lo calcula igual: redondeado). */
export const conFactor = (premio, avisos, area) => {
  const a = avisos?.actual;
  return a && aplicaA(a, area) ? Math.round(premio * Number(a.factor)) : premio;
};
