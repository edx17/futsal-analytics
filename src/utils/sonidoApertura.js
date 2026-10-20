/* EL SONIDO DE LA APERTURA
 *
 * No hay archivos de audio en el proyecto: cada sonido se sintetiza con la Web
 * Audio API (osciladores, ruido y filtros), así no depende de nada externo.
 * Todo pasa por un volumen general bajo y cada sonido dura poco.
 *
 * El navegador sólo deja sonar después de un toque: `prepararAudio()` se llama
 * en el click de ABRIR. Si no hay audio (o está apagado), cada función no hace
 * nada y la apertura sigue igual.
 */

let ctx = null;
let general = null;
let encendido = true;
const vivos = new Set();

export function prepararAudio(conSonido = true) {
  encendido = conSonido;
  if (!conSonido || typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      general = ctx.createGain();
      general.gain.value = 0.32;
      general.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

export const sonidoActivo = (activo) => { encendido = activo; if (!activo) callarTodo(); };

/** Corta todo lo que esté sonando (al saltar o cerrar). */
export function callarTodo() {
  vivos.forEach((n) => { try { n.stop(); } catch { /* ya terminó */ } });
  vivos.clear();
}

const listo = () => encendido && ctx && ctx.state !== 'closed';

function registrar(nodo, fin) {
  vivos.add(nodo);
  nodo.onended = () => vivos.delete(nodo);
  nodo.start();
  nodo.stop(fin);
}

function tono({ tipo = 'sine', desde, hasta = desde, dur, vol = 0.4, ataque = 0.02, retraso = 0, filtro = null }) {
  const t0 = ctx.currentTime + retraso;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(desde, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, hasta), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let salida = g;
  osc.connect(g);
  if (filtro) {
    const f = ctx.createBiquadFilter();
    f.type = filtro.tipo || 'lowpass';
    f.frequency.value = filtro.frec;
    g.connect(f);
    salida = f;
  }
  salida.connect(general);
  registrar(osc, t0 + dur + 0.05);
}

function ruido({ dur, vol = 0.3, desde = 400, hasta = 4000, tipo = 'bandpass', retraso = 0, q = 0.8 }) {
  const t0 = ctx.currentTime + retraso;
  const largo = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, largo, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < largo; i += 1) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = tipo;
  f.Q.value = q;
  f.frequency.setValueAtTime(desde, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, hasta), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(general);
  vivos.add(src);
  src.onended = () => vivos.delete(src);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/* Los sonidos por nombre (los nombres que usan las variantes). */
const SONIDOS = {
  carga: (d) => { tono({ tipo: 'sawtooth', desde: 90, hasta: 520, dur: d, vol: 0.12, ataque: d * 0.8, filtro: { frec: 1400 } }); },
  latido: (d) => { [0, 0.22, 0.9, 1.12].forEach((r) => r < d && tono({ desde: 70, hasta: 45, dur: 0.18, vol: 0.5, retraso: r })); },
  solemne: (d) => {
    tono({ tipo: 'triangle', desde: 55, dur: d, vol: 0.28, ataque: d * 0.6 });
    tono({ tipo: 'sine', desde: 110, dur: d, vol: 0.12, ataque: d * 0.7 });
  },
  portal: (d) => { ruido({ dur: d, vol: 0.28, desde: 200, hasta: 3500 }); tono({ desde: 180, hasta: 60, dur: d, vol: 0.2 }); },
  barrido: (d) => { ruido({ dur: d, vol: 0.32, desde: 6000, hasta: 300, tipo: 'bandpass', q: 2 }); },
  cristal: (d) => { [0, 0.09, 0.18, 0.3].forEach((r, i) => tono({ tipo: 'triangle', desde: 1320 + i * 220, dur: 0.5, vol: 0.12, retraso: r })); ruido({ dur: d, vol: 0.15, desde: 3000, hasta: 8000, tipo: 'highpass' }); },
  // El pabellón: rumor de tribuna, el zumbido de los focos y el "clac" de cada fila de luces.
  pabellon: (d) => {
    ruido({ dur: d, vol: 0.14, desde: 500, hasta: 900, q: 0.5 });
    tono({ tipo: 'sawtooth', desde: 50, dur: d, vol: 0.04, ataque: 0.3, filtro: { frec: 300 } });
    for (let r = 0.25; r < d - 0.1; r += 0.45) ruido({ dur: 0.08, vol: 0.25, desde: 1800, hasta: 900, retraso: r, q: 3 });
  },
  golpe: () => { tono({ desde: 140, hasta: 40, dur: 0.6, vol: 0.7 }); ruido({ dur: 0.4, vol: 0.25, desde: 2000, hasta: 200, tipo: 'lowpass' }); },
  golpeSuave: () => { tono({ desde: 220, hasta: 90, dur: 0.35, vol: 0.35 }); },
  golpeFuerte: () => {
    tono({ desde: 120, hasta: 32, dur: 0.9, vol: 0.85 });
    ruido({ dur: 0.7, vol: 0.35, desde: 3000, hasta: 150, tipo: 'lowpass' });
    [523, 659, 784].forEach((f, i) => tono({ tipo: 'triangle', desde: f, dur: 1.2, vol: 0.09, retraso: 0.05 * i }));
  },
  brillo: () => { [1046, 1318, 1568].forEach((f, i) => tono({ tipo: 'sine', desde: f, dur: 0.5, vol: 0.08, retraso: 0.06 * i })); },
  carta: () => { ruido({ dur: 0.12, vol: 0.22, desde: 2500, hasta: 900, q: 1.5 }); },
  cartaRara: () => { ruido({ dur: 0.12, vol: 0.22, desde: 2500, hasta: 900, q: 1.5 }); [880, 1320].forEach((f, i) => tono({ desde: f, dur: 0.6, vol: 0.1, retraso: 0.08 + i * 0.08 })); },
};

/** Hace sonar uno por nombre. `dur` en segundos (para los que acompañan una fase). */
export function sonar(nombre, dur = 1) {
  if (!listo() || !SONIDOS[nombre]) return;
  try { SONIDOS[nombre](Math.max(0.1, dur)); } catch { /* un sonido que falla no frena la apertura */ }
}
