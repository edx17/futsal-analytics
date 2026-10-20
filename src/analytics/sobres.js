import { tierDe } from './quinteto';
import { ESPECIALES as ESPECIALES_CARTAS } from './especialesCartas';

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

/* La moneda del juego: lo que dan las cartas repetidas y con lo que se pagan
   los sobres extra. En la base sigue siendo la columna `puntos`. */
export const MONEDA = 'V-Coins';

/* Probabilidad de cada rareza en cada lugar del sobre (suman 100) y V-Coins que
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
export const COSTO_MEGA = 500;

/* Las cartas especiales (las de premio): las únicas que trae el Mega Sobre. */
export const ESPECIALES = new Set(['totw', 'potw', 'totm', 'potm', 'toty']);
export const RACHA_PARA_PREMIO = 7;

/* Cuántas cartas trae cada sobre. Pocas a propósito: así cuesta completar. */
export const SOBRES = {
  diario: { id: 'diario', nombre: 'SOBRE DIARIO', cartas: 3, ayuda: 'Uno por día. Si no lo abrís hoy, se pierde.' },
  wellness: { id: 'wellness', nombre: 'SOBRE WELLNESS', cartas: 3, ayuda: 'Completá el wellness de hoy y ganás otro. Se pierde si no lo abrís hoy.' },
  racha: { id: 'racha', nombre: 'SOBRE DE LA SEMANA', cartas: 4, ayuda: 'Entrá 7 días seguidos. Se abre el día que completás la semana.' },
  puntos: { id: 'puntos', nombre: 'SOBRE POR V-COINS', cartas: 3, ayuda: `Se paga con ${COSTO_SOBRE_PUNTOS} ${MONEDA} de cartas repetidas.` },
  mega: { id: 'mega', nombre: 'MEGA SOBRE ESPECIAL', cartas: 10, costo: COSTO_MEGA, soloEspeciales: true,
    ayuda: `10 cartas, todas especiales (TOTW, POTW, TOTM, POTM, TOTY). Cuesta ${COSTO_MEGA} ${MONEDA}.` },
  // Los que se ganan en el V-Draft: quedan guardados hasta que los abrís.
  premio: { id: 'premio', nombre: 'SOBRE DE CAMPEÓN', cartas: 3, ayuda: 'Lo ganaste en el V-Draft.' },
  premio_especial: { id: 'premio_especial', nombre: 'SOBRE ESPECIAL V-DRAFT', cartas: 5, soloEspeciales: true, premio: true,
    ayuda: '5 cartas especiales. Lo ganaste en el V-Draft.' },
};

export const rarezaPorId = Object.fromEntries(RAREZAS.map((r) => [r.id, r]));

/** Cómo se nombra una carta del sobre: su rareza, o el premio especial que es ('GOLEADORES · 3º'). */
export function nombreDeCarta(c = {}) {
  const tipo = c.tipo || c.carta?.premio;
  const esp = ESPECIALES_CARTAS[tipo];
  if (!esp) return rarezaPorId[c.rareza]?.nombre || '';
  const puesto = esp.serie ? c.carta?.especial?.puesto : null;
  return puesto ? `${esp.sigla} · ${puesto}º` : esp.sigla;
}

/** La rareza de una carta base según su media; las de premio, la de su tipo. */
export const rarezaDeCarta = (carta) => {
  if (!carta.premio) return tierDe(carta.ovr);
  // Las especiales nuevas caen en una rareza que ya existe (ver especialesCartas.js).
  return ESPECIALES_CARTAS[carta.premio]?.rareza || carta.premio.toLowerCase();
};

const CAMPOS_CARTA = ['id', 'nombre', 'apellido', 'dorsal', 'foto', 'categoria', 'rol', 'ovr', 'tier', 'atributos', 'stats', 'premio', 'edicion', 'descripcion',
  // las especiales: lo que dibuja CartaEspecial
  'pj', 'nota', 'goles', 'asistencias', 'rec', 'mvp', 'titulo', 'pie', 'especial'];

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
 * Una carta que ya tenías no se suma: da V-Coins. `soloEspeciales`: el Mega Sobre.
 * `azar`: () => número en [0, 1); se puede pasar uno fijo para probar.
 */
export function sortearSobre({ catalogo = [], poseidas = new Set(), cantidad = 3, soloEspeciales = false, azar = Math.random }) {
  const sacadas = new Set();
  const cartas = [];
  for (let i = 0; i < cantidad; i += 1) {
    const libres = catalogo.filter((c) => !sacadas.has(c.id));
    const disponibles = RAREZAS.filter((r) => (!soloEspeciales || ESPECIALES.has(r.id)) && libres.some((c) => c.rareza === r.id));
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
export function probabilidades(catalogo = [], { soloEspeciales = false } = {}) {
  const disponibles = RAREZAS.filter((r) => (!soloEspeciales || ESPECIALES.has(r.id)) && catalogo.some((c) => c.rareza === r.id));
  const total = disponibles.reduce((s, r) => s + r.peso, 0);
  return disponibles.map((r) => ({
    ...r,
    porCiento: total ? (r.peso / total) * 100 : 0,
    cartas: catalogo.filter((c) => c.rareza === r.id).length,
  }));
}
