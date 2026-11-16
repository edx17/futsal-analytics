/* LIBRO TÁCTICO → PDF (el "playbook" del club)
 *
 * Una jugada animada no se puede imprimir. En el papel se cuenta como una
 * secuencia de pasos: cada fotograma es una imagen fija, con la posición
 * anterior en transparencia y el recorrido de cada ficha punteado, así se lee
 * quién se mueve, hacia dónde y por qué camino (las curvas se respetan).
 *
 * Todo lo que dibuja sale del mismo motor que el creador y el reproductor
 * (src/tactica/pizarra.js): la jugada se ve igual en la app y en el PDF.
 */
import { BASE_W, getBaseH, renderBoard, convertOldEl, convertOldLine } from './pizarra';
import { controlDe } from '../utils/trayectoria';

/* Los dos formatos guardados (el del creador actual y el viejo de Konva) a uno
   solo: una lista de fotogramas con elements/arrows, y la cancha. */
export function normalizarJugada(editorData) {
  const crudos = editorData?.frames?.length
    ? editorData.frames
    : [{ elements: editorData?.elements, elementos: editorData?.elementos,
         arrows: editorData?.arrows, lineas: editorData?.lineas }];
  const frames = crudos.map((f, i) => ({
    id: f.id || `f${i}`,
    elements: f.elements || (f.elementos || []).map(convertOldEl),
    arrows: f.arrows || (f.lineas || []).map(convertOldLine),
    duracion: f.duracion,
  }));
  const cancha = editorData?.cancha || {};
  return {
    frames,
    pitchCfg: {
      variant: cancha.tamaño || cancha.variant || '40x20',
      material: cancha.material || 'azul',
      showZones: true, showGrid: false, goals: 'both', lineColor: '#ffffff',
    },
  };
}

/* Qué fichas cambian de lugar entre un fotograma y el siguiente (las zonas no
   cuentan: se dibujan pero no "corren"). Un movimiento de menos de 8 unidades
   lógicas (media ficha) es un retoque, no un desplazamiento: dibujarlo deja una
   flecha encimada sobre la ficha. */
export function movimientos(anterior, actual) {
  if (!anterior) return [];
  const previo = new Map((anterior.elements || []).map((e) => [e.id, e]));
  return (actual.elements || [])
    .filter((e) => !e.type?.startsWith('zone') && previo.has(e.id))
    .map((e) => ({ el: e, desde: previo.get(e.id), hasta: e, bow: e.bow }))
    .filter(({ desde, hasta }) => Math.hypot(hasta.x - desde.x, hasta.y - desde.y) > 8);
}

/* Si una jugada tiene algo que dibujar con el motor (si no, se usa su imagen). */
export function tieneDibujo(editorData) {
  const { frames } = normalizarJugada(editorData);
  return frames.some((f) => f.elements.length || f.arrows.length);
}

function flecha(ctx, desde, hasta, bow, color) {
  const c = controlDe(desde, hasta, bow);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.6;
  ctx.setLineDash([9, 6]);
  ctx.beginPath();
  ctx.moveTo(desde.x, desde.y);
  ctx.quadraticCurveTo(c.x, c.y, hasta.x, hasta.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // punta: en la dirección de llegada de la curva (de control a destino)
  const ang = Math.atan2(hasta.y - c.y, hasta.x - c.x);
  const r = 16; // la punta queda afuera de la ficha, que mide ~17 de radio
  const px = hasta.x - Math.cos(ang) * r, py = hasta.y - Math.sin(ang) * r;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - Math.cos(ang - 0.45) * 13, py - Math.sin(ang - 0.45) * 13);
  ctx.lineTo(px - Math.cos(ang + 0.45) * 13, py - Math.sin(ang + 0.45) * 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* La imagen (PNG en data URL) de un paso: el fotograma i, con el anterior en
   transparencia y el recorrido de cada ficha que se movió. */
export function imagenDePaso(jugada, i, escala = 2) {
  const { frames, pitchCfg } = jugada;
  const f = frames[i];
  const anterior = i > 0 ? frames[i - 1] : null;
  const baseH = getBaseH(pitchCfg.variant);
  const cv = document.createElement('canvas');
  cv.width = Math.round(BASE_W * escala);
  cv.height = Math.round(baseH * escala);
  const ctx = cv.getContext('2d');
  ctx.scale(escala, escala);
  const movs = movimientos(anterior, f);
  renderBoard(ctx, {
    elements: f.elements, arrows: f.arrows, selected: null, pitchCfg,
    tempArrow: null, tempZone: null, isMobile: false,
    cebolla: movs.map((m) => m.desde),
  });
  movs.forEach((m) => flecha(ctx, m.desde, m.hasta, m.bow, 'rgba(255, 214, 10, 0.95)'));
  return cv.toDataURL('image/png');
}

/* Todo lo que el PDF necesita de una jugada, ya calculado. */
export function armarPlaybookJugada(tarea) {
  const jugada = normalizarJugada(tarea.editor_data);
  const conDibujo = tarea.editor_data && tieneDibujo(tarea.editor_data);
  const pasos = conDibujo
    ? jugada.frames.map((f, i) => ({
      n: i + 1,
      imagen: imagenDePaso(jugada, i),
      movimientos: movimientos(i > 0 ? jugada.frames[i - 1] : null, f).length,
    }))
    : [];
  return { tarea, pasos, imagenSuelta: conDibujo ? null : (tarea.url_grafico || null) };
}
