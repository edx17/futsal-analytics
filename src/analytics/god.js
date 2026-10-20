/* MODO GOD: LO QUE SE CALCULA (sin pantalla ni base, para poder probarlo)
 *
 *   resultadoDePrueba  un sobre "de mentira" para el superusuario: mismo sorteo
 *                      que la base (el espejo de sobres.js) sobre el catálogo
 *                      ACTIVO, sin gastar nada ni sumar a ninguna colección.
 *   aplicarAjustes     la media corregida a mano en vez de la calculada (la
 *                      calculada queda en `ovrCalculada`).
 *   mediaDudosa        avisa cuando la media no la sostienen los datos de la
 *                      propia carta (un 99 con un solo partido, por ejemplo).
 */

import { SOBRES, sortearSobre } from './sobres';

/** Un sobre de prueba con cartas reales del catálogo activo. No toca la base. */
export function resultadoDePrueba({ catalogo = [], tipo = 'diario', ajustes = new Map(), azar = Math.random, n = Date.now() }) {
  const sobre = SOBRES[tipo] || SOBRES.diario;
  const activas = catalogo.filter((k) => k.activa !== false);
  const { cartas } = sortearSobre({ catalogo: activas, cantidad: sobre.cartas, soloEspeciales: !!sobre.soloEspeciales, azar });
  return {
    sobre_id: `prueba-${n}`,
    tipo: sobre.id,
    prueba: true,
    puntos_ganados: 0,
    cartas: cartas.map((k) => ({
      catalogo_id: k.id, rareza: k.rareza, tipo: k.tipo, nueva: true, puntos: 0,
      carta: aplicarAjuste(k.carta || {}, ajustes.get(k.clave)),
    })),
  };
}

/** Una carta con su media ajustada (si hay ajuste). */
export function aplicarAjuste(carta, ajuste) {
  if (!ajuste || !Number.isFinite(Number(ajuste.ovr))) return carta;
  return { ...carta, ovr: Number(ajuste.ovr), ovrCalculada: carta.ovrCalculada ?? carta.ovr, ovrAjustada: true, motivoAjuste: ajuste.motivo || '' };
}

/** Muchas cartas: `claveDe(carta)` dice con qué clave buscar el ajuste. */
export const aplicarAjustes = (cartas = [], ajustes = new Map(), claveDe = (c) => c.clave) =>
  (ajustes.size ? cartas.map((c) => aplicarAjuste(c, ajustes.get(claveDe(c)))) : cartas);

/**
 * ¿La media está por encima de lo que muestran sus propios datos? Devuelve el
 * motivo (texto) o null. No corrige nada: lo decide el superusuario.
 *   - 95 o más con 1 o 2 partidos: es la nota de un partido llevada a la escala;
 *   - 90 o más con nota menor a 8: no cuadra con la escala (nota 8 ≈ 90);
 *   - 99: el techo; casi siempre es un partido extraordinario aislado.
 */
export function mediaDudosa(carta = {}) {
  const ovr = Number(carta.ovr);
  if (!Number.isFinite(ovr)) return null;
  const pj = Number(carta.pj ?? carta.stats?.pj);
  const nota = Number(carta.nota ?? carta.stats?.rating);
  if (ovr >= 95 && Number.isFinite(pj) && pj <= 2) return `${ovr} con ${pj} ${pj === 1 ? 'partido' : 'partidos'}`;
  if (ovr >= 90 && Number.isFinite(nota) && nota > 0 && nota < 8) return `${ovr} con nota ${nota.toFixed(1)}`;
  if (ovr === 99) return '99: el techo de la escala';
  return null;
}
