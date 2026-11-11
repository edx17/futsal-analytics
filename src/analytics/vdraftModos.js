/* V-DRAFT · LOS MODOS: normal, DESAFÍO DEL DÍA y TORNEO SEMANAL
 *
 * Las reglas y los premios viven en la base (migración
 * 20261112120000_vdraft_desafio_torneo.sql); esto es el espejo para
 * mostrarlos y probarlos. Si se cambia un número, cambiarlo en los dos lados.
 */

export const MODOS = [
  { id: 'normal', nombre: 'V-DRAFT', bajada: 'El de siempre: 1 gratis por día.' },
  { id: 'desafio', nombre: 'DESAFÍO DEL DÍA', bajada: 'Mismas cartas para todos. Una vez por día.' },
  { id: 'torneo', nombre: 'TORNEO SEMANAL', bajada: 'Pagás la entrada y el pozo es de los 3 mejores.' },
];

/** Premio del desafío según el puesto: 1º 1000, 2º 750, 3º 500, el resto 150 (si jugó al menos un partido). */
export const PREMIOS_DESAFIO = [1000, 750, 500, 150];
export function premioDesafio(puesto, jugados = 1) {
  if (!jugados || !puesto) return 0;
  return PREMIOS_DESAFIO[Math.min(puesto, 4) - 1];
}

/** Cómo se reparte el pozo del torneo: 50/30/20 con 3 o más; 60/40 con 2; con 1, se devuelve la entrada. */
export function repartoTorneo(anotados, pozo) {
  const n = Number(anotados) || 0;
  const total = Number(pozo) || 0;
  const partes = n >= 3 ? [0.5, 0.3, 0.2] : n === 2 ? [0.6, 0.4] : [];
  const montos = partes.map((p) => Math.floor(total * p));
  if (montos.length) montos[0] += total - montos.reduce((s, x) => s + x, 0);
  return montos;
}

export const ordinal = (n) => (n ? `${n}º` : '—');

/** El cartel de la partida en juego según el modo (null para la normal). */
export function etiquetaDeModo(partida) {
  if (!partida || !partida.modo || partida.modo === 'normal') return null;
  if (partida.modo === 'desafio') return `DESAFÍO DEL DÍA${partida.regla?.nombre ? ` · ${partida.regla.nombre}` : ''}`;
  return 'TORNEO SEMANAL';
}

/**
 * Lo que se cuenta al terminar una partida de desafío o torneo (la normal
 * muestra su premio de siempre). { titulo, detalle } o null.
 */
export function cierreDeModo(partida) {
  if (!partida || partida.estado !== 'terminada' || !partida.modo || partida.modo === 'normal') return null;
  const v = partida.victorias || 0;
  const ganados = `${v} ${v === 1 ? 'partido ganado' : 'partidos ganados'}`;
  if (partida.modo === 'desafio') {
    return { titulo: `DESAFÍO TERMINADO · ${ganados}`, detalle: 'Mirá tu puesto en el ranking del día. Los premios se pagan mañana.' };
  }
  return { titulo: `PARTIDA DE TORNEO · ${ganados}`, detalle: 'Se suman a tu tabla del torneo de esta semana.' };
}

/** Lo que dice el botón para empezar según el modo y el estado (lo que trae vdraft_estado). */
export function botonDeModo(modo, estado) {
  if (!estado) return { texto: '', habilitado: false, nota: '' };
  if (modo === 'desafio') {
    const d = estado.desafio || {};
    if (d.jugado) return { texto: 'YA JUGASTE EL DE HOY', habilitado: false, nota: 'Mañana hay otro desafío, con otra regla.' };
    return { texto: 'JUGAR EL DESAFÍO · GRATIS', habilitado: true, nota: 'Una sola vez por día. El partido sale igual para el mismo equipo: gana el que mejor arma.' };
  }
  if (modo === 'torneo') {
    const t = estado.torneo || {};
    if (!t.activo) return { texto: 'NO HAY TORNEO ESTA SEMANA', habilitado: false, nota: '' };
    if (!t.yo) {
      const alcanza = (estado.puntos || 0) >= (t.entrada || 0);
      return {
        texto: `ANOTARME · ${t.entrada} V-COINS`, habilitado: alcanza, anotarse: true,
        nota: alcanza ? `Te da ${t.partidas} partidas del torneo, aparte de las normales.`
          : `Te faltan ${(t.entrada || 0) - (estado.puntos || 0)} V-Coins para la entrada.`,
      };
    }
    if (!t.yo.restantes) return { texto: 'YA JUGASTE TUS PARTIDAS', habilitado: false, nota: 'Esperá el reparto del lunes.' };
    return { texto: `JUGAR PARTIDA DE TORNEO · QUEDAN ${t.yo.restantes}`, habilitado: true, nota: 'Suman los partidos que ganes en cada una.' };
  }
  return null;
}
