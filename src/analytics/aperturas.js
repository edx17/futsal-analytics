/* APERTURA DE SOBRES: LAS VARIANTES
 *
 * Toda la puesta en escena de cada sobre vive acá: colores, duraciones,
 * escenario, portal, partículas y sonidos. Los componentes (components/sobres)
 * no tienen números propios: leen la variante y la dibujan.
 *
 * Dos modos:
 *   'estandar' → el sobre tiembla, se rompe y aparecen las cartas (rápido).
 *   'cine'     → el sobre se activa, se abre un portal, la cámara entra por el
 *                pasillo de un pabellón de futsal, se prepara la revelación y
 *                vuelve a las cartas.
 *
 * La variante sale del TIPO de sobre (el que se pagó o se ganó) y, como única
 * excepción, de lo que trae DE VERDAD el sobre: si salió un TOTY la apertura
 * es la solemne, y si además salió otra carta top, la excepcional. Nunca se
 * anuncia algo que no salió: la animación es una capa de presentación, las
 * cartas y las probabilidades son las de la base.
 */

/* ── tiempos (ms) ──────────────────────────────────────────────────────────── */

/* Apertura estándar: tiembla → se rompe → cartas. */
const TIEMPOS_ESTANDAR = { tiembla: 1900, abre: 650 };

/* Apertura de cine: ~6 s en total con velocidad normal. */
const TIEMPOS_CINE = { activacion: 1200, portal: 800, tunel: 2300, previa: 1000, clima: 750, salida: 550 };

/* Las fases en orden. 'cartas' es el final: la mecánica de siempre. */
export const FASES_ESTANDAR = ['tiembla', 'abre', 'cartas'];
export const FASES_CINE = ['activacion', 'portal', 'tunel', 'previa', 'clima', 'salida', 'cartas'];

/* ── la base de una variante ───────────────────────────────────────────────── */

const BASE = {
  id: 'base',
  nombre: 'SOBRE',
  modo: 'estandar',
  icono: 'estrella',                   // estrella | pulso | semana | rayo | cristal | copa
  colores: {
    principal: '#00b862',
    secundario: '#0a3b26',
    acento: '#fbbf24',
    fondo: '#02070a',
    luz: '#00ff88',
    particulas: ['#00ff88', '#ffffff', '#38bdf8'],
    texto: '#eafff4',
  },
  intensidad: 1,                       // 0 a 1.5: multiplica brillo, partículas y temblor
  tiempos: TIEMPOS_ESTANDAR,
  camara: { velocidad: 1, balanceo: 6 }, // px de balanceo al avanzar
  vibracion: 1,                        // temblor del sobre (0 = quieto)
  particulas: 50,
  desenfoque: 0,                       // px de desenfoque de profundidad en el pasillo
  escenario: null,                     // leds | focos | cristal | solemne (sólo cine)
  piso: 'parquet',                     // parquet | sintetico
  portal: null,                        // energia | expansion | geometrico | eclipse
  aparicion: 'silueta',                // qué se ve al fondo antes del clímax
  salida: 'destello',                  // destello | particulas | barrido
  sonidos: { activacion: 'carga', portal: 'portal', tunel: 'pabellon', clima: 'golpe', salida: 'brillo' },
  saltar: { permitido: true, protegidoMs: 300 },
};

/* ── las variantes ─────────────────────────────────────────────────────────── */

export const VARIANTES = {
  /* Diario: rápida y sobria, para no cansar al que abre muchos. */
  diario: {
    id: 'diario', nombre: 'SOBRE DIARIO', modo: 'estandar', icono: 'estrella',
    colores: { principal: '#4b5563', secundario: '#1f2328', acento: '#e5e7eb', fondo: '#07090b', luz: '#d1d5db',
      particulas: ['#e5e7eb', '#9ca3af', '#ffffff'], texto: '#f3f4f6' },
    intensidad: 0.6, tiempos: { tiembla: 1200, abre: 500 }, vibracion: 0.7, particulas: 28,
    sonidos: { activacion: 'carga', clima: 'golpeSuave' },
  },

  /* Wellness: el premio por cuidarse. Celeste agua, el sobre late como un corazón. */
  wellness: {
    id: 'wellness', nombre: 'SOBRE WELLNESS', modo: 'estandar', icono: 'pulso', latido: true,
    colores: { principal: '#0ea5b7', secundario: '#083344', acento: '#a5f3fc', fondo: '#020b0f', luz: '#67e8f9',
      particulas: ['#67e8f9', '#ffffff', '#a7f3d0'], texto: '#ecfeff' },
    intensidad: 0.8, tiempos: { tiembla: 1700, abre: 600 }, vibracion: 0.5, particulas: 40,
    sonidos: { activacion: 'latido', clima: 'golpeSuave' },
  },

  /* Por V-Coins: el verde de siempre. */
  puntos: {
    id: 'puntos', nombre: 'SOBRE POR V-COINS', modo: 'estandar', icono: 'estrella',
    intensidad: 0.85, particulas: 45,
  },

  /* Sobre de la semana: el primero de cine. Verde esmeralda, LEDs verdes. */
  semana: {
    id: 'semana', nombre: 'SOBRE DE LA SEMANA', modo: 'cine', icono: 'semana',
    colores: { principal: '#00b862', secundario: '#032015', acento: '#fbbf24', fondo: '#010806', luz: '#00ff88',
      particulas: ['#00ff88', '#34d399', '#ffffff', '#fbbf24'], texto: '#ffffff' },
    intensidad: 1, tiempos: TIEMPOS_CINE, particulas: 60, desenfoque: 1,
    escenario: 'leds', piso: 'parquet', portal: 'energia', aparicion: 'silueta', salida: 'destello',
  },

  /* Mega Sobre: azul eléctrico, focos cenitales y barridos de luz. */
  mega: {
    id: 'mega', nombre: 'MEGA SOBRE ESPECIAL', modo: 'cine', icono: 'rayo',
    colores: { principal: '#2563eb', secundario: '#0b1640', acento: '#e0f2fe', fondo: '#020617', luz: '#60a5fa',
      particulas: ['#60a5fa', '#e0f2fe', '#ffffff', '#a5b4fc'], texto: '#ffffff' },
    intensidad: 1.3, tiempos: { ...TIEMPOS_CINE, tunel: 2500, clima: 900 }, camara: { velocidad: 1.15, balanceo: 4 },
    particulas: 90, desenfoque: 2, vibracion: 1.2,
    escenario: 'focos', piso: 'sintetico', portal: 'expansion', aparicion: 'focos', salida: 'barrido',
    sonidos: { activacion: 'carga', portal: 'barrido', tunel: 'pabellon', clima: 'golpeFuerte', salida: 'brillo' },
  },

  /* Sobre de campeón del V-Draft (3 cartas): estándar, en violeta. */
  premio: {
    id: 'premio', nombre: 'SOBRE DE CAMPEÓN', modo: 'estandar', icono: 'copa',
    colores: { principal: '#7c3aed', secundario: '#1e0b3b', acento: '#f0abfc', fondo: '#07020f', luz: '#c084fc',
      particulas: ['#c084fc', '#f0abfc', '#ffffff'], texto: '#faf5ff' },
    intensidad: 0.95, particulas: 55,
  },

  /* Sobre especial del V-Draft (5 especiales): portal geométrico y cristales. */
  premio_especial: {
    id: 'premio_especial', nombre: 'SOBRE ESPECIAL V-DRAFT', modo: 'cine', icono: 'cristal',
    colores: { principal: '#7c3aed', secundario: '#1a0633', acento: '#f0abfc', fondo: '#06010d', luz: '#c084fc',
      particulas: ['#c084fc', '#e879f9', '#ffffff', '#a5f3fc'], texto: '#ffffff' },
    intensidad: 1.2, tiempos: { ...TIEMPOS_CINE, portal: 1000, previa: 1100 }, particulas: 80, desenfoque: 2,
    escenario: 'cristal', piso: 'parquet', portal: 'geometrico', aparicion: 'silueta', salida: 'particulas',
    sonidos: { activacion: 'carga', portal: 'cristal', tunel: 'pabellon', clima: 'golpe', salida: 'brillo' },
  },

  /* Salió un TOTY: negro y oro, solemne. Se apaga todo y se van prendiendo las luces. */
  toty: {
    id: 'toty', nombre: 'EQUIPO DEL AÑO', modo: 'cine', icono: 'copa',
    colores: { principal: '#b45309', secundario: '#120c02', acento: '#fde68a', fondo: '#000000', luz: '#fbbf24',
      particulas: ['#fbbf24', '#fde68a', '#fff7ed', '#f59e0b'], texto: '#fff7ed' },
    intensidad: 1.3,
    tiempos: { activacion: 1600, portal: 1200, tunel: 2600, previa: 1500, clima: 1000, salida: 700 },
    camara: { velocidad: 0.85, balanceo: 3 }, particulas: 70, desenfoque: 2, vibracion: 0.6,
    escenario: 'solemne', piso: 'parquet', portal: 'eclipse', aparicion: 'haz', salida: 'destello',
    sonidos: { activacion: 'solemne', portal: 'portal', tunel: 'pabellon', clima: 'golpeFuerte', salida: 'brillo' },
  },

  /* Recompensa excepcional: TOTY y además otra carta top en el mismo sobre. */
  excepcional: {
    id: 'excepcional', nombre: 'RECOMPENSA EXCEPCIONAL', modo: 'cine', icono: 'copa',
    colores: { principal: '#d97706', secundario: '#0c0a09', acento: '#ffffff', fondo: '#000000', luz: '#fde68a',
      particulas: ['#fde68a', '#ffffff', '#fbbf24', '#e879f9'], texto: '#ffffff' },
    intensidad: 1.5,
    tiempos: { activacion: 1700, portal: 1300, tunel: 2800, previa: 1700, clima: 1300, salida: 800 },
    camara: { velocidad: 0.8, balanceo: 3 }, particulas: 110, desenfoque: 2, vibracion: 0.8,
    escenario: 'solemne', piso: 'parquet', portal: 'eclipse', aparicion: 'haz', salida: 'particulas',
    sonidos: { activacion: 'solemne', portal: 'portal', tunel: 'pabellon', clima: 'golpeFuerte', salida: 'brillo' },
  },
};

/* Cuál es la variante de cada tipo de sobre de la base (sobres_abrir). */
export const VARIANTE_DE_TIPO = {
  diario: 'diario',
  wellness: 'wellness',
  racha: 'semana',
  puntos: 'puntos',
  mega: 'mega',
  premio: 'premio',
  premio_especial: 'premio_especial',
};

/* ── eventos ─────────────────────────────────────────────────────────────────
   Para torneos, temporadas o aniversarios con identidad propia. No hay ninguno
   cargado: se agregan acá (id → definición) y se activan pasando `evento` al
   resolver. Una definición se arma sobre la escena de cine con lo que cambie:
   { nombre, colores, escenario, portal, particulas, sonidos, tiempos, intensidad, salida, icono }. */
export const EVENTOS = {};

export const PLANTILLA_EVENTO = {
  nombre: 'EVENTO ESPECIAL', icono: 'estrella', escenario: 'focos', portal: 'expansion', salida: 'destello',
};

/* ── armado y validación ───────────────────────────────────────────────────── */

const RAREZAS_TOP = new Set(['toty', 'potm']);
const limitar = (v, min, max, def) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : def);
const esColor = (c) => typeof c === 'string' && /^(#[0-9a-f]{3,8}|rgba?\(.+\))$/i.test(c.trim());

/**
 * Completa una variante con los valores por defecto y corrige lo que esté mal
 * (un color inválido, una duración negativa): siempre devuelve algo dibujable.
 */
export function completarVariante(def = {}) {
  const modo = def.modo === 'cine' ? 'cine' : 'estandar';
  const baseTiempos = modo === 'cine' ? TIEMPOS_CINE : TIEMPOS_ESTANDAR;
  const tiempos = {};
  Object.keys(baseTiempos).forEach((k) => { tiempos[k] = limitar(def.tiempos?.[k], 0, 6000, baseTiempos[k]); });
  const colores = { ...BASE.colores };
  Object.entries(def.colores || {}).forEach(([k, v]) => {
    if (k === 'particulas') { if (Array.isArray(v) && v.length && v.every(esColor)) colores.particulas = v; } else if (esColor(v)) colores[k] = v;
  });
  return {
    ...BASE,
    ...def,
    modo,
    colores,
    tiempos,
    camara: { ...BASE.camara, ...(def.camara || {}) },
    sonidos: { ...BASE.sonidos, ...(def.sonidos || {}) },
    saltar: { ...BASE.saltar, ...(def.saltar || {}) },
    intensidad: limitar(def.intensidad, 0, 1.5, BASE.intensidad),
    vibracion: limitar(def.vibracion, 0, 2, BASE.vibracion),
    particulas: Math.round(limitar(def.particulas, 0, 160, BASE.particulas)),
    desenfoque: limitar(def.desenfoque, 0, 6, BASE.desenfoque),
    escenario: modo === 'cine' ? (def.escenario || 'leds') : null,
    portal: modo === 'cine' ? (def.portal || 'energia') : null,
  };
}

/** Una variante de evento: la escena de cine con la identidad del evento. */
export function varianteDeEvento(id, def = {}) {
  return completarVariante({ ...VARIANTES.semana, ...PLANTILLA_EVENTO, ...def, id: `evento:${id}`, modo: 'cine' });
}

/**
 * La variante de una apertura.
 * @param {{ tipo: string, cartas?: Array<{ rareza: string }>, evento?: string, eventos?: object }} datos
 */
export function varianteDeApertura({ tipo, cartas = [], evento = null, eventos = EVENTOS } = {}) {
  if (evento && eventos[evento]) return varianteDeEvento(evento, eventos[evento]);
  const rarezas = cartas.map((c) => c?.rareza);
  const totys = rarezas.filter((r) => r === 'toty').length;
  const delTipo = VARIANTES[VARIANTE_DE_TIPO[tipo]] || VARIANTES.puntos;
  if (totys > 0) {
    const tops = rarezas.filter((r) => RAREZAS_TOP.has(r)).length;
    const escena = tops >= 2 ? VARIANTES.excepcional : VARIANTES.toty;
    // La escena cambia, pero el sobre conserva su nombre y su ícono: la carta
    // no se anuncia antes de darla vuelta.
    return completarVariante({ ...escena, nombre: delTipo.nombre, icono: delTipo.icono, escena: escena.id });
  }
  return completarVariante(delTipo);
}

/* ── preferencias ──────────────────────────────────────────────────────────── */

export const PREFERENCIAS_POR_DEFECTO = { sonido: true, velocidad: 'normal', cine: true };

/**
 * Lo que de verdad se va a mostrar, según las preferencias y el equipo:
 *  - velocidad 'rapida' acorta todo a algo más de la mitad;
 *  - sin cine (o con "reducir movimiento"), los sobres de cine abren estándar;
 *  - en equipos livianos, menos partículas y sin desenfoque.
 * Nunca cambia qué cartas salen.
 */
export function ajustarVariante(variante, { prefs = PREFERENCIAS_POR_DEFECTO, menosMovimiento = false, liviano = false } = {}) {
  let v = variante;
  if (v.modo === 'cine' && (menosMovimiento || prefs.cine === false)) {
    v = { ...v, modo: 'estandar', tiempos: { tiembla: 1400, abre: 550 } };
  }
  const factor = prefs.velocidad === 'rapida' ? 0.55 : 1;
  const tiempos = Object.fromEntries(Object.entries(v.tiempos).map(([k, ms]) => [k, Math.round(ms * factor)]));
  return {
    ...v,
    tiempos,
    particulas: liviano ? Math.round(v.particulas * 0.45) : v.particulas,
    desenfoque: liviano ? 0 : v.desenfoque,
    sinMovimiento: menosMovimiento,
  };
}

/** Las fases de una variante y cuánto dura cada una (la última, 'cartas', no termina sola). */
export function guionDe(variante) {
  const fases = variante.modo === 'cine' ? FASES_CINE : FASES_ESTANDAR;
  return fases.map((id) => ({ id, ms: variante.tiempos[id] ?? null }));
}

/** Duración total hasta las cartas (ms). */
export const duracionTotal = (variante) => guionDe(variante).reduce((s, f) => s + (f.ms || 0), 0);

/* Un número "al azar" pero fijo para cada semilla: partículas y luces que no
   cambian de lugar en cada render. */
export const azarFijo = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
