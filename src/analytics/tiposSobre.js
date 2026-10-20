import { SOBRES, RAREZAS, ESPECIALES, COSTO_SOBRE_PUNTOS } from './sobres';

/* CADA SOBRE, EDITABLE DESDE EL MODO GOD
 *
 * Lo que el superusuario cambia de un tipo de sobre vive en
 * sobres_config.tipos (migración 20261023120000_sobres_tipos.sql) y es lo que
 * usa la base para sortear. Esto es el espejo: valida lo que se guarda y arma
 * las reglas efectivas (lo cambiado sobre lo de siempre).
 *
 *   { nombre, ayuda,            la presentación ('' = la de siempre)
 *     cartas,                   cuántas trae (1-10)
 *     costo,                    V-Coins (sólo el de V-Coins y el Mega)
 *     rarezas: ['oro', …],      qué rarezas salen ([] = las de siempre)
 *     pesos: { rareza: n },     la chance de una rareza (0 = no sale)
 *     incluidas: [clave, …],    si hay alguna, trae SÓLO esas
 *     escena: { video, titulo, colores{…}, particulas, intensidad } }
 */

export const TIPOS_EDITABLES = ['diario', 'wellness', 'racha', 'puntos', 'mega', 'premio', 'premio_especial'];
export const CON_COSTO = new Set(['puntos', 'mega']);
export const REGLAS_TIPO = { cartas: { min: 1, max: 10 }, costo: { min: 0, max: 5000 }, peso: { min: 0, max: 100 } };

const IDS_RAREZA = RAREZAS.map((r) => r.id);
/* El costo de siempre: el del Mega está en SOBRES; el del sobre por V-Coins, aparte. */
const costoBase = (tipo) => (tipo === 'puntos' ? COSTO_SOBRE_PUNTOS : SOBRES[tipo]?.costo ?? 0);
const PESO_BASE = Object.fromEntries(RAREZAS.map((r) => [r.id, r.peso]));
const esColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim());
const limitar = (v, { min, max }) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(max, Math.max(min, Number(v))) : null);

/** Las rarezas que salen si no se tocó nada: las especiales en el Mega y el especial del V-Draft; todas en el resto. */
export const rarezasPorDefecto = (tipo) => (SOBRES[tipo]?.soloEspeciales ? IDS_RAREZA.filter((r) => ESPECIALES.has(r)) : [...IDS_RAREZA]);

/** Lo que se guarda: sólo lo que cambia, siempre dentro de rango. */
export function normalizarTipo(cfg = {}, tipo = 'diario') {
  const base = SOBRES[tipo] || SOBRES.diario;
  const out = {};
  const nombre = String(cfg.nombre || '').trim().slice(0, 40);
  if (nombre && nombre !== base.nombre) out.nombre = nombre;
  const ayuda = String(cfg.ayuda || '').trim().slice(0, 160);
  if (ayuda && ayuda !== base.ayuda) out.ayuda = ayuda;
  const cartas = limitar(cfg.cartas, REGLAS_TIPO.cartas);
  if (cartas !== null && Math.round(cartas) !== base.cartas) out.cartas = Math.round(cartas);
  if (CON_COSTO.has(tipo)) {
    const costo = limitar(cfg.costo, REGLAS_TIPO.costo);
    if (costo !== null && Math.round(costo) !== costoBase(tipo)) out.costo = Math.round(costo);
  }
  const rarezas = [...new Set((cfg.rarezas || []).filter((r) => IDS_RAREZA.includes(r)))];
  const defecto = rarezasPorDefecto(tipo);
  if (rarezas.length && !(rarezas.length === defecto.length && defecto.every((r) => rarezas.includes(r)))) {
    out.rarezas = IDS_RAREZA.filter((r) => rarezas.includes(r));
  }
  const pesos = {};
  Object.entries(cfg.pesos || {}).forEach(([r, v]) => {
    const p = limitar(v, REGLAS_TIPO.peso);
    if (IDS_RAREZA.includes(r) && p !== null && p !== PESO_BASE[r]) pesos[r] = p;
  });
  if (Object.keys(pesos).length) out.pesos = pesos;
  const incluidas = [...new Set((cfg.incluidas || []).map(String).filter(Boolean))];
  if (incluidas.length) out.incluidas = incluidas;
  const e = cfg.escena || {};
  const escena = {};
  if (e.video) escena.video = String(e.video);
  const titulo = String(e.titulo || '').trim().slice(0, 40);
  if (titulo) escena.titulo = titulo;
  const colores = Object.fromEntries(Object.entries(e.colores || {}).filter(([, v]) => esColor(v)));
  if (Object.keys(colores).length) escena.colores = colores;
  const particulas = limitar(e.particulas, { min: 0, max: 160 });
  if (particulas !== null) escena.particulas = Math.round(particulas);
  const intensidad = limitar(e.intensidad, { min: 0, max: 1.5 });
  if (intensidad !== null) escena.intensidad = intensidad;
  if (Object.keys(escena).length) out.escena = escena;
  return out;
}

/** Las reglas efectivas de un tipo (lo cambiado sobre lo de siempre): lo que usa el sorteo. */
export function reglasDeTipo(tipo, cfg = {}) {
  const base = SOBRES[tipo] || SOBRES.diario;
  const n = normalizarTipo(cfg, tipo);
  return {
    cartas: n.cartas ?? base.cartas,
    costo: CON_COSTO.has(tipo) ? n.costo ?? costoBase(tipo) : 0,
    rarezas: n.rarezas || rarezasPorDefecto(tipo),
    pesos: { ...PESO_BASE, ...(n.pesos || {}) },
    incluidas: n.incluidas || [],
  };
}

/**
 * El sobre como lo ve el jugador: el de siempre con lo que cambió el club.
 * `info`: estado.tipos[tipo] de la base ({ nombre, ayuda, cartas, costo, … }).
 */
export function sobreDelClub(tipo, info = null) {
  const base = SOBRES[tipo];
  if (!base || !info) return base;
  const costo = CON_COSTO.has(tipo) ? (Number.isFinite(Number(info.costo)) ? Number(info.costo) : costoBase(tipo)) : base.costo;
  const cartas = Number.isFinite(Number(info.cartas)) ? Number(info.cartas) : base.cartas;
  // Sólo especiales si todas las rarezas que salen lo son.
  const soloEspeciales = Array.isArray(info.rarezas) && info.rarezas.length ? info.rarezas.every((r) => ESPECIALES.has(r)) : !!base.soloEspeciales;
  return {
    ...base,
    nombre: info.nombre || base.nombre,
    ayuda: info.ayuda || ayudaDe(tipo, base, { cartas, costo }),
    cartas,
    soloEspeciales,
    ...(costo !== undefined ? { costo } : {}),
    escena: info.escena || null,
    totalCartas: info.total_cartas,
  };
}

/* La ayuda de siempre con los números del club (el texto fijo dice "10 cartas" o "500 V-Coins"). */
function ayudaDe(tipo, base, { cartas, costo }) {
  if (tipo === 'mega') return `${cartas} cartas, todas especiales (TOTW, POTW, TOTM, POTM, TOTY). Cuesta ${costo} V-Coins.`;
  if (tipo === 'puntos') return `Se paga con ${costo} V-Coins de cartas repetidas.`;
  if (tipo === 'premio_especial') return `${cartas} cartas especiales. Lo ganaste en el V-Draft.`;
  return base.ayuda;
}

/** Lo que el editor muestra de cada tipo: lo guardado completado con lo de siempre. */
export function tipoParaEditar(tipo, cfg = {}) {
  const base = SOBRES[tipo];
  const n = normalizarTipo(cfg, tipo);
  const r = reglasDeTipo(tipo, cfg);
  return {
    nombre: n.nombre || base.nombre,
    ayuda: n.ayuda || '',
    cartas: r.cartas,
    costo: r.costo,
    rarezas: r.rarezas,
    pesos: r.pesos,
    incluidas: r.incluidas,
    escena: { video: '', titulo: '', colores: {}, particulas: null, intensidad: null, ...(n.escena || {}) },
  };
}
