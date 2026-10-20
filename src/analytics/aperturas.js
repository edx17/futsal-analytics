/* APERTURA DE SOBRES: LAS VARIANTES
 *
 * Toda la puesta en escena de cada sobre vive acá: colores, tiempos, video,
 * sonidos. Los componentes (components/sobres) no tienen números propios: leen
 * la variante y la muestran.
 *
 * Dos modos:
 *   'estandar' → el sobre tiembla, se rompe y aparecen las cartas (rápido).
 *   'video'    → una cinemática renderizada en Blender (cine/escena_pasillo.py):
 *                el sobre se rompe, la cámara recorre el pasillo del pabellón
 *                y se va oscureciendo; al final aparece LA MEJOR CARTA del
 *                sobre y después las demás, boca abajo.
 *
 * La variante sale del TIPO de sobre (el que se pagó o se ganó) y, como única
 * excepción, de lo que trae DE VERDAD el sobre: si salió un TOTY la escena es
 * la de Leyenda, y si además salió otra carta top, la excepcional. Nunca se
 * anuncia algo que no salió: la animación es una capa de presentación, las
 * cartas y las probabilidades son las de la base.
 */

/* ── los videos renderizados ─────────────────────────────────────────────────
   Uno por variante de cine (public/cine). Sólo se usan los que existen: una
   variante cuyo video todavía no se renderizó abre en modo estándar.
   `musica`: su pieza (cine/musica.py), que arranca con el video y dura un poco
   más (acompaña la mejor carta). `sonidos`: [segundo, sonido, duración], los
   sintetizados que suenan si la música no está lista o en velocidad rápida. */
export const VIDEOS = {
  vdraft: {
    fuentes: [{ src: '/cine/vdraft.webm', tipo: 'video/webm' }, { src: '/cine/vdraft.mp4', tipo: 'video/mp4' }],
    poster: '/cine/vdraft.jpg',
    duracion: 6.5,
    musica: '/cine/musica/vdraft.m4a',
    sonidos: [[0, 'carga', 1.5], [1.5, 'portal', 0.6], [2.1, 'pabellon', 3.2], [5.3, 'solemne', 1.1], [6.1, 'golpeFuerte', 1]],
  },
};

/* ── tiempos (ms) ──────────────────────────────────────────────────────────── */

/* Apertura estándar: tiembla → se rompe → cartas. */
const TIEMPOS_ESTANDAR = { tiembla: 1900, abre: 650 };

/* Las fases en orden. 'cartas' es el final: la mecánica de siempre. */
export const FASES_ESTANDAR = ['tiembla', 'abre', 'cartas'];
export const FASES_VIDEO = ['video', 'figura', 'cartas'];

/* ── la base de una variante ───────────────────────────────────────────────── */

const BASE = {
  id: 'base',
  nombre: 'SOBRE',
  modo: 'estandar',
  icono: 'estrella',                   // estrella | pulso | semana | rayo | cristal | copa
  video: null,                         // clave de VIDEOS
  colores: {
    principal: '#00b862',
    secundario: '#0a3b26',
    acento: '#fbbf24',
    fondo: '#02070a',
    luz: '#00ff88',
    particulas: ['#00ff88', '#ffffff', '#38bdf8'],
    texto: '#eafff4',
  },
  intensidad: 1,                       // 0 a 1.5: brillo, partículas y temblor
  tiempos: TIEMPOS_ESTANDAR,
  vibracion: 1,                        // temblor del sobre (0 = quieto)
  particulas: 50,
  sonidos: { tiembla: 'carga', abre: 'golpeSuave' },
  saltar: { permitido: true, protegidoMs: 300 },
};

/* ── las variantes ─────────────────────────────────────────────────────────── */

export const VARIANTES = {
  /* Común (diario, wellness, V-Coins): rápida, sin video. */
  diario: {
    id: 'diario', nombre: 'SOBRE DIARIO', icono: 'estrella',
    colores: { principal: '#4b5563', secundario: '#1f2328', acento: '#e5e7eb', fondo: '#07090b', luz: '#d1d5db',
      particulas: ['#e5e7eb', '#9ca3af', '#ffffff'], texto: '#f3f4f6' },
    intensidad: 0.6, tiempos: { tiembla: 1200, abre: 500 }, vibracion: 0.7, particulas: 28,
  },
  wellness: {
    id: 'wellness', nombre: 'SOBRE WELLNESS', icono: 'pulso', latido: true,
    colores: { principal: '#0ea5b7', secundario: '#083344', acento: '#a5f3fc', fondo: '#020b0f', luz: '#67e8f9',
      particulas: ['#67e8f9', '#ffffff', '#a7f3d0'], texto: '#ecfeff' },
    intensidad: 0.8, tiempos: { tiembla: 1700, abre: 600 }, vibracion: 0.5, particulas: 40,
    sonidos: { tiembla: 'latido', abre: 'golpeSuave' },
  },
  puntos: {
    id: 'puntos', nombre: 'SOBRE POR V-COINS', icono: 'estrella', intensidad: 0.85, particulas: 45,
  },

  /* V-Draft: pasillo oscuro con verde esmeralda (el primero renderizado). */
  vdraft: {
    id: 'vdraft', nombre: 'SOBRE ESPECIAL V-DRAFT', modo: 'video', video: 'vdraft', icono: 'cristal',
    colores: { principal: '#00b862', secundario: '#032015', acento: '#fbbf24', fondo: '#010806', luz: '#00ff88',
      particulas: ['#00ff88', '#34d399', '#ffffff', '#fbbf24'], texto: '#ffffff' },
    intensidad: 1.1, particulas: 70,
  },
  vdraft_campeon: {
    id: 'vdraft_campeon', nombre: 'SOBRE DE CAMPEÓN', modo: 'video', video: 'vdraft', icono: 'copa',
    colores: { principal: '#00b862', secundario: '#032015', acento: '#fbbf24', fondo: '#010806', luz: '#00ff88',
      particulas: ['#00ff88', '#ffffff', '#fbbf24'], texto: '#ffffff' },
    intensidad: 1, particulas: 60,
  },

  /* Élite (Mega Sobre): azul eléctrico, blanco frío. */
  elite: {
    id: 'elite', nombre: 'MEGA SOBRE ESPECIAL', modo: 'video', video: 'elite', icono: 'rayo',
    colores: { principal: '#2563eb', secundario: '#0b1640', acento: '#e0f2fe', fondo: '#020617', luz: '#60a5fa',
      particulas: ['#60a5fa', '#e0f2fe', '#ffffff', '#a5b4fc'], texto: '#ffffff' },
    intensidad: 1.3, particulas: 90, vibracion: 1.2,
  },

  /* Épico (Sobre de la semana): violeta y magenta. */
  epico: {
    id: 'epico', nombre: 'SOBRE DE LA SEMANA', modo: 'video', video: 'epico', icono: 'semana',
    colores: { principal: '#7c3aed', secundario: '#1a0633', acento: '#f0abfc', fondo: '#06010d', luz: '#c084fc',
      particulas: ['#c084fc', '#e879f9', '#ffffff', '#a5f3fc'], texto: '#ffffff' },
    intensidad: 1.15, particulas: 80,
  },

  /* Leyenda (salió un TOTY): negro y oro, solemne. */
  leyenda: {
    id: 'leyenda', nombre: 'EQUIPO DEL AÑO', modo: 'video', video: 'leyenda', icono: 'copa',
    colores: { principal: '#b45309', secundario: '#120c02', acento: '#fde68a', fondo: '#000000', luz: '#fbbf24',
      particulas: ['#fbbf24', '#fde68a', '#fff7ed', '#f59e0b'], texto: '#fff7ed' },
    intensidad: 1.3, particulas: 90, vibracion: 0.6,
  },

  /* Excepcional: TOTY y además otra carta top. Su propia escena (silencio, el haz
     central, el golpe más grande); si su video no está, la de Leyenda. */
  excepcional: {
    id: 'excepcional', nombre: 'RECOMPENSA EXCEPCIONAL', modo: 'video', video: 'excepcional', videoAlternativo: 'leyenda', icono: 'copa', excepcional: true,
    colores: { principal: '#d97706', secundario: '#0c0a09', acento: '#ffffff', fondo: '#000000', luz: '#fde68a',
      particulas: ['#fde68a', '#ffffff', '#fbbf24', '#e879f9'], texto: '#ffffff' },
    intensidad: 1.5, particulas: 140, vibracion: 0.8,
  },
};

/* Cuál es la variante de cada tipo de sobre de la base (sobres_abrir). */
export const VARIANTE_DE_TIPO = {
  diario: 'diario',
  wellness: 'wellness',
  puntos: 'puntos',
  racha: 'epico',
  mega: 'elite',
  premio: 'vdraft_campeon',
  premio_especial: 'vdraft',
};

/* ── eventos ─────────────────────────────────────────────────────────────────
   Para torneos, temporadas o aniversarios con identidad propia. Se agregan acá
   (id → definición) y se activan SÓLO pasando `evento` al resolver (en Sobres:
   `?evento=<id>` en la dirección); nunca solos. Una definición se arma sobre la
   escena de video con lo que cambie: { nombre, colores, video, particulas,
   intensidad, icono }. Para un video propio: un perfil nuevo en
   cine/perfiles.json (copiando 'evento_demo'), se renderiza con
   escena_pabellon.py --perfil <id>, se genera su música y se suma a VIDEOS.

   'demo' es sólo un PERFIL DE DEMOSTRACIÓN del sistema (rojo oscuro y ámbar,
   textos "DEMO"): no representa ningún evento real. */
export const EVENTOS = {
  demo: {
    nombre: 'EVENTO · DEMO', demo: true, icono: 'estrella', video: 'evento_demo', videoAlternativo: 'vdraft',
    colores: { principal: '#b91c1c', secundario: '#1c0303', acento: '#fbbf24', fondo: '#070101', luz: '#f59e0b',
      particulas: ['#f59e0b', '#fbbf24', '#ffffff', '#ef4444'], texto: '#fff7ed' },
    intensidad: 1.2, particulas: 90,
  },
};

export const PLANTILLA_EVENTO = { nombre: 'EVENTO ESPECIAL', icono: 'estrella', modo: 'video', video: 'vdraft' };

/* ── armado y validación ───────────────────────────────────────────────────── */

const RAREZAS_TOP = new Set(['toty', 'potm']);
/* De la más rara a la más común (para elegir la mejor carta del sobre). */
export const ORDEN_RAREZA = ['toty', 'potm', 'totm', 'potw', 'totw', 'oro', 'plata', 'bronce'];
const limitar = (v, min, max, def) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : def);
const esColor = (c) => typeof c === 'string' && /^(#[0-9a-f]{3,8}|rgba?\(.+\))$/i.test(c.trim());

/**
 * Completa una variante con los valores por defecto y corrige lo que esté mal
 * (un color inválido, una duración negativa, un video que no existe): siempre
 * devuelve algo que se puede mostrar.
 */
export function completarVariante(def = {}, videos = VIDEOS) {
  const existe = (id) => (id && videos[id] ? id : null);
  const video = def.modo === 'video' ? existe(def.video) || existe(def.videoAlternativo) : null;
  const modo = video ? 'video' : 'estandar';
  const tiempos = {};
  Object.keys(TIEMPOS_ESTANDAR).forEach((k) => { tiempos[k] = limitar(def.tiempos?.[k], 0, 6000, TIEMPOS_ESTANDAR[k]); });
  const colores = { ...BASE.colores };
  Object.entries(def.colores || {}).forEach(([k, v]) => {
    if (k === 'particulas') { if (Array.isArray(v) && v.length && v.every(esColor)) colores.particulas = v; } else if (esColor(v)) colores[k] = v;
  });
  return {
    ...BASE,
    ...def,
    modo,
    video: video ? { id: video, ...videos[video] } : null,
    colores,
    tiempos,
    sonidos: { ...BASE.sonidos, ...(def.sonidos || {}) },
    saltar: { ...BASE.saltar, ...(def.saltar || {}) },
    intensidad: limitar(def.intensidad, 0, 1.5, BASE.intensidad),
    vibracion: limitar(def.vibracion, 0, 2, BASE.vibracion),
    particulas: Math.round(limitar(def.particulas, 0, 160, BASE.particulas)),
  };
}

/** Una variante de evento: la escena de video con la identidad del evento. */
export function varianteDeEvento(id, def = {}, videos = VIDEOS) {
  return completarVariante({ ...VARIANTES.vdraft, ...PLANTILLA_EVENTO, ...def, id: `evento:${id}` }, videos);
}

/**
 * La variante de una apertura.
 * @param {{ tipo: string, cartas?: Array<{ rareza: string }>, evento?: string, eventos?: object, videos?: object }} datos
 */
export function varianteDeApertura({ tipo, cartas = [], evento = null, eventos = EVENTOS, videos = VIDEOS } = {}) {
  if (evento && eventos[evento]) return varianteDeEvento(evento, eventos[evento], videos);
  const rarezas = cartas.map((c) => c?.rareza);
  const delTipo = VARIANTES[VARIANTE_DE_TIPO[tipo]] || VARIANTES.puntos;
  if (rarezas.includes('toty')) {
    const tops = rarezas.filter((r) => RAREZAS_TOP.has(r)).length;
    const escena = tops >= 2 ? VARIANTES.excepcional : VARIANTES.leyenda;
    // La escena cambia, pero el sobre conserva su nombre y su ícono: la carta
    // no se anuncia antes de darla vuelta. (El video de Leyenda usa un sobre
    // genérico de MySquad por lo mismo.)
    const v = completarVariante({ ...escena, nombre: delTipo.nombre, icono: delTipo.icono, escena: escena.id }, videos);
    // Si todavía no está el video de Leyenda, se usa el del tipo de sobre.
    return v.video ? v : completarVariante({ ...delTipo, colores: escena.colores, particulas: escena.particulas, escena: escena.id }, videos);
  }
  return completarVariante(delTipo, videos);
}

/** La mejor carta del sobre: la más rara y, entre iguales, la de más media. */
export function indiceMejorCarta(cartas = []) {
  let mejor = -1;
  let clave = null;
  cartas.forEach((c, i) => {
    const rango = ORDEN_RAREZA.indexOf(c?.rareza);
    const k = [rango < 0 ? 99 : rango, -(Number(c?.carta?.ovr) || 0)];
    if (clave === null || k[0] < clave[0] || (k[0] === clave[0] && k[1] < clave[1])) { mejor = i; clave = k; }
  });
  return mejor;
}

/* ── preferencias ──────────────────────────────────────────────────────────── */

export const PREFERENCIAS_POR_DEFECTO = { sonido: true, velocidad: 'normal', cine: true };

/**
 * Lo que de verdad se va a mostrar, según las preferencias y el equipo:
 *  - velocidad 'rapida': la apertura estándar más corta y el video más rápido;
 *  - sin cine (o con "reducir movimiento"), los sobres de video abren estándar
 *    (con "reducir movimiento", además, sin animación: directo a las cartas);
 *  - en equipos livianos, menos partículas.
 * Nunca cambia qué cartas salen.
 */
export function ajustarVariante(variante, { prefs = PREFERENCIAS_POR_DEFECTO, menosMovimiento = false, liviano = false } = {}) {
  let v = variante;
  if (v.modo === 'video' && (menosMovimiento || prefs.cine === false)) {
    v = { ...v, modo: 'estandar', tiempos: { tiembla: 1400, abre: 550 } };
  }
  const rapida = prefs.velocidad === 'rapida';
  const tiempos = Object.fromEntries(Object.entries(v.tiempos).map(([k, ms]) => [k, Math.round(ms * (rapida ? 0.55 : 1))]));
  return {
    ...v,
    tiempos,
    velocidadVideo: rapida ? 1.6 : 1,
    particulas: liviano ? Math.round(v.particulas * 0.45) : v.particulas,
    sinMovimiento: menosMovimiento,
  };
}

/** Las fases de una variante y cuánto dura cada una (las que no terminan solas, null). */
export function guionDe(variante) {
  if (variante.modo === 'video') return FASES_VIDEO.map((id) => ({ id, ms: null }));
  return FASES_ESTANDAR.map((id) => ({ id, ms: variante.tiempos[id] ?? null }));
}

/** Duración total hasta las cartas (ms; el video cuenta por su duración). */
export const duracionTotal = (variante) => (variante.modo === 'video'
  ? Math.round((variante.video?.duracion || 0) * 1000 / (variante.velocidadVideo || 1))
  : guionDe(variante).reduce((s, f) => s + (f.ms || 0), 0));

/* Un número "al azar" pero fijo para cada semilla: partículas que no cambian
   de lugar en cada render. */
export const azarFijo = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
