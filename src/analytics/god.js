/* MODO GOD: LO QUE SE CALCULA (sin pantalla ni base, para poder probarlo)
 *
 *   resultadoDePrueba  un sobre "de mentira" para el superusuario: mismo sorteo
 *                      que la base (el espejo de sobres.js) sobre el catálogo
 *                      ACTIVO, sin gastar nada ni sumar a ninguna colección.
 *   aplicarAjustes     la media corregida a mano en vez de la calculada (la
 *                      calculada queda en `ovrCalculada`).
 *   pendientes…        las cartas de premio guardadas en el historial que
 *                      todavía no están en el catálogo de los sobres.
 *   mediaDudosa        avisa cuando la media no la sostienen los datos de la
 *                      propia carta (un 99 con un solo partido, por ejemplo).
 *   conFotosYAjustes   un premio del historial con la foto especial y la media
 *                      corregida que tiene hoy cada carta (para verla y exportarla).
 */

import { SOBRES, sortearSobre, catalogoDeCartas } from './sobres';
import { cartasDeHistorial, claveCarta } from './premiosCartas';
import { reglasDeTipo } from './tiposSobre';

/**
 * Un sobre de prueba con cartas reales del catálogo activo. No toca la base.
 * `config`: lo que el club cambió de ese tipo de sobre (sobres_config.tipos[tipo]).
 * `fotos`: las fotos subidas (cartas_fotos, clave → url), como las suma la base al abrir.
 */
export function resultadoDePrueba({ catalogo = [], tipo = 'diario', ajustes = new Map(), fotos = new Map(), azar = Math.random, n = Date.now(), evento = null, config = null }) {
  const reglas = evento ? null : reglasDeTipo(SOBRES[tipo] ? tipo : 'diario', config || {});
  const sobre = evento ? { id: 'evento', cartas: evento.sobre?.cartas || 3 } : { ...(SOBRES[tipo] || SOBRES.diario), cartas: reglas.cartas };
  // El sobre de un evento: sólo sus cartas. Los demás saltean las exclusivas de evento (salvo que se las incluya a mano).
  const claves = evento ? new Set(evento.cartas || []) : null;
  const activas = catalogo.filter((k) => k.activa !== false
    && (claves ? claves.has(k.clave) : reglas.incluidas.length > 0 || !k.exclusiva_evento));
  const { cartas } = sortearSobre({
    catalogo: activas, cantidad: sobre.cartas, soloEspeciales: !!sobre.soloEspeciales, azar,
    ...(reglas ? { rarezas: reglas.rarezas, pesos: reglas.pesos, incluidas: reglas.incluidas } : {}),
  });
  return {
    sobre_id: `prueba-${n}`,
    tipo: sobre.id,
    ...(evento ? { evento } : {}),
    prueba: true,
    puntos_ganados: 0,
    cartas: cartas.map((k) => ({
      catalogo_id: k.id, rareza: k.rareza, tipo: k.tipo, nueva: true, puntos: 0,
      carta: aplicarAjuste(fotos.has(k.clave) ? { ...(k.carta || {}), foto: fotos.get(k.clave), fotoEspecial: true } : (k.carta || {}), ajustes.get(k.clave)),
    })),
  };
}

/**
 * Un registro del historial guarda las cartas como estaban ese día; la foto
 * especial y la media corregida (Especiales, Modo GOD) se cambian después, con
 * la clave de cada carta. Esto las suma para mostrarlo y para la placa.
 */
export function conFotosYAjustes(registro, fotos = new Map(), ajustes = new Map()) {
  if (!registro || (!fotos.size && !ajustes.size)) return registro;
  const cartas = (registro.cartas || []).map((c) => {
    const clave = claveCarta(registro.tipo, registro.periodo, c.id);
    return aplicarAjuste({ ...c, foto: fotos.get(clave) || c.foto }, ajustes.get(clave));
  });
  return { ...registro, cartas };
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

/**
 * Las filas de catálogo de los premios guardados en el historial que todavía
 * no se publicaron. `historial`: registros (filaARegistro); `catalogo`: las
 * filas del catálogo (de ahí salen las cartas BASE, con sus atributos);
 * `fotos`: Map clave → url. Lo mismo que publica MySquad, sin recalcular nada.
 */
export function pendientesDePublicar(historial = [], catalogo = [], fotos = new Map(), calculadas = []) {
  const publicadas = new Set(catalogo.map((k) => k.clave));
  // Las cartas BASE del catálogo y, si vienen de MySquad, las calculadas (tienen
  // los atributos de todos los jugadores, aunque no tengan BASE publicada).
  const porId = new Map(catalogo.filter((k) => k.tipo === 'BASE').map((k) => [String(k.carta?.id ?? k.jugador_id), { ...(k.carta || {}), id: String(k.carta?.id ?? k.jugador_id) }]));
  (calculadas || []).filter(conAtributos).forEach((c) => porId.set(String(c.id), c));
  const premios = cartasDeHistorial(historial, [...porId.values()], fotos).filter((c) => !publicadas.has(c.clave));
  return catalogoDeCartas([], premios);
}

const conAtributos = (c) => Array.isArray(c?.atributos) && c.atributos.length > 0 && !c.enEvaluacion;

/**
 * Las cartas del catálogo que quedaron sin atributos (TIR, PAS…: se publicaron
 * sin la carta BASE del jugador), completadas con los de la carta calculada en
 * MySquad. Devuelve las filas listas para publicar (mismo formato que
 * catalogoDeCartas). Los Héroes no tienen datos: no se tocan.
 */
export function completarAtributos(catalogo = [], calculadas = []) {
  const porId = new Map((calculadas || []).filter(conAtributos).map((c) => [String(c.id), c]));
  return (catalogo || [])
    .filter((k) => k.tipo !== 'HERO' && !(k.carta?.atributos?.length) && porId.has(String(k.jugador_id)))
    .map((k) => {
      const c = porId.get(String(k.jugador_id));
      return {
        clave: k.clave, jugador_id: String(k.jugador_id), tipo: k.tipo, rareza: k.rareza,
        carta: { ...k.carta, atributos: c.atributos, ...(k.carta?.pie || !c.pie ? {} : { pie: c.pie }) },
      };
    });
}
