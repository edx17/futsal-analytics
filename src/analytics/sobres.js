import { tierDe } from './quinteto';

/* SOBRES DE CARTAS
 *
 * Las reglas del juego, en un solo lugar. El sorteo de verdad corre en la base
 * (migración 20261011120000_sobres.sql), para que nadie pueda tocarlo desde el
 * teléfono; esto es el espejo en JS: sirve para mostrar las probabilidades,
 * para el simulador y para probar que las reglas se cumplen. Si se cambia un
 * número, hay que cambiarlo en los dos lados.
 *
 * Una "carta" del catálogo es una fila de `cartas_catalogo`: la base de cada
 * jugador (oro, plata o bronce según su media) y cada premio ganado (POTW, TOTW,
 * POTM, TOTM, TOTY). Cuanto más rara, menos probable.
 */

/* Probabilidad de cada rareza en cada lugar del sobre (suman 100) y puntos que
   da una carta repetida. `orden` es el de la tirada en la base: no cambiarlo. */
export const RAREZAS = [
  { id: 'bronce', nombre: 'BRONCE', peso: 42, puntos: 5 },
  { id: 'plata', nombre: 'PLATA', peso: 30, puntos: 10 },
  { id: 'oro', nombre: 'ORO', peso: 15, puntos: 25 },
  { id: 'totw', nombre: 'TOTW', peso: 5, puntos: 40 },
  { id: 'potw', nombre: 'POTW', peso: 3, puntos: 50 },
  { id: 'totm', nombre: 'TOTM', peso: 2.5, puntos: 60 },
  { id: 'potm', nombre: 'POTM', peso: 1.5, puntos: 75 },
  { id: 'toty', nombre: 'TOTY', peso: 1, puntos: 100 },
];

export const COSTO_SOBRE_PUNTOS = 50;
export const RACHA_PARA_PREMIO = 7;

/* Cuántas cartas trae cada sobre. Pocas a propósito: así cuesta completar. */
export const SOBRES = {
  diario: { id: 'diario', nombre: 'SOBRE DIARIO', cartas: 3, ayuda: 'Uno por día. Si no lo abrís hoy, se pierde.' },
  wellness: { id: 'wellness', nombre: 'SOBRE WELLNESS', cartas: 3, ayuda: 'Completá el wellness de hoy y ganás otro. Se pierde si no lo abrís hoy.' },
  racha: { id: 'racha', nombre: 'SOBRE DE LA SEMANA', cartas: 4, ayuda: 'Entrá 7 días seguidos. Se abre el día que completás la semana.' },
  puntos: { id: 'puntos', nombre: 'SOBRE POR PUNTOS', cartas: 3, ayuda: `Se paga con ${COSTO_SOBRE_PUNTOS} puntos de cartas repetidas.` },
};

export const rarezaPorId = Object.fromEntries(RAREZAS.map((r) => [r.id, r]));

/** La rareza de una carta base según su media; las de premio, la de su tipo. */
export const rarezaDeCarta = (carta) => (carta.premio ? carta.premio.toLowerCase() : tierDe(carta.ovr));

const CAMPOS_CARTA = ['id', 'nombre', 'apellido', 'dorsal', 'foto', 'categoria', 'rol', 'ovr', 'tier', 'atributos', 'stats', 'premio', 'edicion', 'descripcion'];

/**
 * Las filas del catálogo a partir de las cartas de MySquad.
 * Las cartas "en evaluación" (todavía sin media) no entran: no hay qué mostrar.
 */
export function catalogoDeCartas(cartasBase = [], premios = []) {
  const filas = [];
  cartasBase.filter((c) => !c.enEvaluacion).forEach((c) => {
    filas.push(fila(`BASE|${c.id}`, 'BASE', c));
  });
  premios.forEach((c) => filas.push(fila(c.clave, c.premio, c)));
  return filas;
}

function fila(clave, tipo, c) {
  const carta = {};
  CAMPOS_CARTA.forEach((k) => { if (c[k] !== undefined) carta[k] = c[k]; });
  carta.enEvaluacion = false;
  return { clave, jugador_id: String(c.id), tipo, rareza: rarezaDeCarta(c), carta };
}

/**
 * Un sobre. `catalogo`: [{ id, rareza, ... }]; `poseidas`: Set de ids que ya tiene.
 * Se sortea la rareza (sólo entre las que todavía tienen cartas para sacar) y
 * después una carta de esa rareza; en un mismo sobre no se repite ninguna.
 * Una carta que ya tenías no se suma: da puntos.
 * `azar`: () => número en [0, 1); se puede pasar uno fijo para probar.
 */
export function sortearSobre({ catalogo = [], poseidas = new Set(), cantidad = 3, azar = Math.random }) {
  const sacadas = new Set();
  const cartas = [];
  for (let i = 0; i < cantidad; i += 1) {
    const libres = catalogo.filter((c) => !sacadas.has(c.id));
    const disponibles = RAREZAS.filter((r) => libres.some((c) => c.rareza === r.id));
    if (disponibles.length === 0) break;

    const total = disponibles.reduce((s, r) => s + r.peso, 0);
    const tirada = azar() * total;
    let acum = 0;
    let rareza = disponibles[disponibles.length - 1];
    for (const r of disponibles) { acum += r.peso; if (tirada < acum) { rareza = r; break; } }

    const delTipo = libres.filter((c) => c.rareza === rareza.id);
    const carta = delTipo[Math.min(delTipo.length - 1, Math.floor(azar() * delTipo.length))];
    sacadas.add(carta.id);

    const nueva = !poseidas.has(carta.id);
    cartas.push({ ...carta, nueva, puntos: nueva ? 0 : rareza.puntos });
  }
  return { cartas, puntosGanados: cartas.reduce((s, c) => s + c.puntos, 0) };
}

/** Las probabilidades reales: se renormalizan si el club todavía no tiene cartas de alguna rareza. */
export function probabilidades(catalogo = []) {
  const disponibles = RAREZAS.filter((r) => catalogo.some((c) => c.rareza === r.id));
  const total = disponibles.reduce((s, r) => s + r.peso, 0);
  return disponibles.map((r) => ({
    ...r,
    porCiento: total ? (r.peso / total) * 100 : 0,
    cartas: catalogo.filter((c) => c.rareza === r.id).length,
  }));
}
