/* ═══════════════════════════════════════════════════════════════════════════
   REPRODUCCIÓN Y EXPORTACIÓN DEL MOVIMIENTO

   Todo lo que se movió en el tablero quedó guardado con su minuto. Con eso
   se puede volver a pasar la jugada: las fichas se interpolan entre los
   puntos que fuiste marcando y el resultado se ve como un video.

   Dos salidas:
     · en pantalla, sobre el mismo tablero (posicionesEn)
     · a un archivo .webm que se descarga (exportarVideo), dibujando la
       cancha en un canvas aparte para que no dependa del tamaño de la
       ventana ni de lo que haya en la página

   La cancha del canvas es la misma que la de la pantalla: 40 × 20, medio
   campo, círculo central, las dos áreas de 6 metros y la grilla de zonas.
   ═══════════════════════════════════════════════════════════════════════════ */

import { BALON_ID, CELDAS, formatearTiempo } from './modelo';

const VERDE = '#00ff88';
const ROJO = '#ef4444';

/* ── Interpolación ───────────────────────────────────────────────────────── */

/* Dónde estaba una ficha en el instante t, según los puntos que se marcaron.
   Entre dos puntos se interpola en línea recta; antes del primero y después
   del último se queda quieta donde estaba. */
function posicionEnRastro(puntos = [], tMs) {
  if (puntos.length === 0) return null;
  if (tMs <= puntos[0].t_ms) return { x: puntos[0].x, y: puntos[0].y };
  const ultimo = puntos[puntos.length - 1];
  if (tMs >= ultimo.t_ms) return { x: ultimo.x, y: ultimo.y };

  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    if (tMs > b.t_ms) continue;
    const span = b.t_ms - a.t_ms;
    const k = span > 0 ? (tMs - a.t_ms) / span : 0;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  return { x: ultimo.x, y: ultimo.y };
}

const claveDeRastro = (r) =>
  r.id_jugador != null ? String(r.id_jugador) : `r${r.dorsal_rival ?? '?'}`;

/* Junta todos los rastros de un período por ficha, ordenados en el tiempo. */
export function rastrosPorFicha(recorridos = [], periodo = 'PT') {
  const mapa = {};
  recorridos
    .filter(r => (r.periodo || 'PT') === periodo)
    .forEach(r => {
      const clave = claveDeRastro(r);
      if (!mapa[clave]) mapa[clave] = [];
      mapa[clave].push(...(r.puntos || []));
    });
  Object.values(mapa).forEach(ps => ps.sort((a, b) => (a.t_ms ?? 0) - (b.t_ms ?? 0)));
  return mapa;
}

/* El tablero en el instante t: cada ficha en su rastro, y las que no tienen
   rastro se quedan donde estén en el tablero base. */
export function posicionesEn(base = [], rastros = {}, tMs = 0) {
  return base.map(p => {
    const clave = String(p.id_jugador);
    const rastro = rastros[clave];
    if (!rastro || rastro.length === 0) return p;
    const pos = posicionEnRastro(rastro, tMs);
    return pos ? { ...p, x: pos.x, y: pos.y } : p;
  });
}

/* Desde cuándo hasta cuándo hay movimiento grabado en este período. */
export function rangoGrabado(recorridos = [], periodo = 'PT') {
  let min = Infinity;
  let max = -Infinity;
  recorridos
    .filter(r => (r.periodo || 'PT') === periodo)
    .forEach(r => (r.puntos || []).forEach(p => {
      if (p.t_ms < min) min = p.t_ms;
      if (p.t_ms > max) max = p.t_ms;
    }));
  if (min === Infinity) return null;
  return { desde: min, hasta: max, duracionMs: max - min };
}

/* ── Dibujo en canvas ────────────────────────────────────────────────────── */

const aPx = (v, total) => (v / 100) * total;

export function dibujarCancha(ctx, w, h, { invertida = false, zonas = true } = {}) {
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = Math.max(1, w / 640);

  ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);

  /* Medio campo */
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();

  /* Círculo central: 3 m de radio sobre 40 × 20 */
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, aPx(7.5, w), aPx(15, h), 0, 0, Math.PI * 2);
  ctx.stroke();

  /* Áreas de 6 metros: semicírculos contra cada arco */
  const areaW = aPx(15, w);
  const areaH = aPx(50, h);
  ctx.beginPath();
  ctx.ellipse(0, h / 2, areaW, areaH / 2, 0, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(w, h / 2, areaW, areaH / 2, 0, Math.PI / 2, -Math.PI / 2);
  ctx.stroke();

  if (zonas) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([5, 5]);
    [25, 50, 75].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(aPx(x, w), 0);
      ctx.lineTo(aPx(x, w), h);
      ctx.stroke();
    });
    [100 / 3, 200 / 3].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(0, aPx(y, h));
      ctx.lineTo(w, aPx(y, h));
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.font = `900 ${Math.round(h / 34)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    CELDAS.forEach(c => {
      const cx = (c.x0 + c.x1) / 2;
      const cy = (c.y0 + c.y1) / 2;
      const vx = invertida ? 100 - cx : cx;
      const vy = invertida ? 100 - cy : cy;
      ctx.fillText(c.etiqueta, aPx(vx, w), aPx(vy, h));
    });
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#2f6b4f';
  ctx.font = `900 ${Math.round(h / 40)}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = invertida ? 'left' : 'right';
  ctx.fillText(invertida ? '◀ ATACAMOS' : 'ATACAMOS ▶', invertida ? 10 : w - 10, 8);
  ctx.restore();
}

export function dibujarFichas(ctx, w, h, posiciones = [], { invertida = false, etiquetas = 'dorsal' } = {}) {
  const radio = Math.max(8, h / 26);

  const ordenadas = [
    ...posiciones.filter(p => p.equipo === 'Rival' && p.id_jugador !== BALON_ID),
    ...posiciones.filter(p => p.equipo !== 'Rival' && p.id_jugador !== BALON_ID),
    ...posiciones.filter(p => p.id_jugador === BALON_ID),
  ];

  ordenadas.forEach(p => {
    const esBalon = p.id_jugador === BALON_ID;
    const esRival = p.equipo === 'Rival';
    const color = esBalon ? '#ffffff' : esRival ? ROJO : VERDE;
    const vx = invertida ? 100 - p.x : p.x;
    const vy = invertida ? 100 - p.y : p.y;
    const cx = aPx(vx, w);
    const cy = aPx(vy, h);
    const r = esBalon ? radio * 0.5 : radio;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = esBalon ? '#fff' : esRival ? 'rgba(239,68,68,0.28)' : 'rgba(0,255,136,0.28)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, radio / 10);
    ctx.strokeStyle = color;
    ctx.stroke();

    if (esBalon) return;

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(r * 0.9)}px system-ui, sans-serif`;
    if (p.dorsal != null && p.dorsal !== '') ctx.fillText(String(p.dorsal), cx, cy);

    if (etiquetas === 'apellido') {
      const texto = p.apellido || p.nombre || (esRival ? `R${p.dorsal}` : '');
      if (texto) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.font = `600 ${Math.round(r * 0.72)}px system-ui, sans-serif`;
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(texto, cx, cy - r - 3);
        ctx.restore();
      }
    }
  });
}

export function dibujarMarcaTiempo(ctx, w, h, { periodo = 'PT', tMs = 0, titulo = '' } = {}) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const alto = Math.round(h / 13);
  ctx.fillRect(0, h - alto, w, alto);
  ctx.fillStyle = '#00ff88';
  ctx.font = `900 ${Math.round(alto * 0.55)}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${periodo} ${formatearTiempo(tMs)}`, 12, h - alto / 2);
  if (titulo) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `700 ${Math.round(alto * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(titulo, w - 12, h - alto / 2);
  }
  ctx.restore();
}

/* ── Exportación ─────────────────────────────────────────────────────────── */

export const soportaExportar = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function';

const mimeSoportado = () =>
  ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(m => window.MediaRecorder.isTypeSupported?.(m)) || 'video/webm';

/* Genera el archivo. `duracionSegundos` es lo que dura el video: el tramo de
   partido elegido se comprime o se estira hasta ahí. */
export function exportarVideo({
  base = [], recorridos = [], periodo = 'PT',
  desdeMs = 0, hastaMs = 0,
  invertida = false, etiquetas = 'apellido', zonas = true,
  ancho = 1280, duracionSegundos = 20, fps = 25,
  titulo = '', onProgreso,
}) {
  return new Promise((resolve, reject) => {
    if (!soportaExportar()) {
      reject(new Error('Este navegador no puede grabar video desde la app. Probá con Chrome o Edge.'));
      return;
    }
    if (hastaMs <= desdeMs) {
      reject(new Error('No hay movimiento grabado para exportar en este período.'));
      return;
    }

    const alto = Math.round(ancho / 2);   // 40 × 20
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');

    const rastros = rastrosPorFicha(recorridos, periodo);
    const totalFrames = Math.max(2, Math.round(duracionSegundos * fps));
    const stream = canvas.captureStream(fps);

    let grabadora;
    try {
      grabadora = new window.MediaRecorder(stream, { mimeType: mimeSoportado(), videoBitsPerSecond: 4_000_000 });
    } catch (e) {
      reject(new Error(`No se pudo iniciar la grabación: ${e.message}`));
      return;
    }

    const trozos = [];
    grabadora.ondataavailable = (e) => { if (e.data?.size) trozos.push(e.data); };
    grabadora.onerror = (e) => reject(e.error || new Error('Falló la grabación'));
    grabadora.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      resolve(new Blob(trozos, { type: 'video/webm' }));
    };

    let frame = 0;
    const pintar = () => {
      const k = frame / (totalFrames - 1);
      const t = desdeMs + (hastaMs - desdeMs) * k;

      dibujarCancha(ctx, ancho, alto, { invertida, zonas });
      dibujarFichas(ctx, ancho, alto, posicionesEn(base, rastros, t), { invertida, etiquetas });
      dibujarMarcaTiempo(ctx, ancho, alto, { periodo, tMs: t, titulo });

      onProgreso?.(Math.round((frame / (totalFrames - 1)) * 100));
      frame += 1;

      if (frame < totalFrames) {
        setTimeout(pintar, 1000 / fps);
      } else {
        /* Un respiro antes de cortar: si se frena en el mismo frame que se
           dibuja, el último trozo a veces no entra en el archivo. */
        setTimeout(() => grabadora.state !== 'inactive' && grabadora.stop(), 250);
      }
    };

    grabadora.start();
    pintar();
  });
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
