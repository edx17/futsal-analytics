/* ════════════════════════════════════════════════════════════════════════
   GUÍAS DE ALINEACIÓN DEL CREADOR TÁCTICO ("como en Canva")

   Mientras se arrastra un material (cono, valla, arco, zona…), si su borde o
   su centro queda cerca de la línea de otro material, se pega a esa línea y
   se muestra una guía. También se pega a los ejes del centro de la cancha y
   a la misma distancia que ya hay entre otros dos materiales de la fila o la
   columna (filas de conos parejas).

   Jugadores, arqueros, pelotas y textos no se imantan ni sirven de
   referencia: se mueven libres.

   Todo en coordenadas lógicas de la pizarra (BASE_W × alto). Las medidas de
   cada material son las mismas con las que los dibuja pizarra.js.
   ════════════════════════════════════════════════════════════════════════ */

const NO_ALINEABLES = new Set(['home', 'away', 'verde', 'blanco', 'gk-ama', 'gk-vio', 'staff', 'ball', 'text'])

/** ¿Este elemento participa de las guías? */
export const esAlineable = (el) => !!el && !!el.type && !NO_ALINEABLES.has(el.type)

/* La caja de cada material relativa a su punto (x, y), y el punto alrededor
   del que rota. Copia las medidas de drawEl. */
function cajaLocal(el, cW) {
  const t = el.type
  if (t === 'zone-rect' || t === 'zone-ellipse') {
    const w = el.w || 0, h = el.h || 0
    return { x1: Math.min(0, w), y1: Math.min(0, h), x2: Math.max(0, w), y2: Math.max(0, h), rx: w / 2, ry: h / 2 }
  }
  if (t === 'cono' || t === 'cono_alto') { const r = cW * 0.012; return { x1: -r, y1: -r, x2: r, y2: r, rx: 0, ry: 0 } }
  if (t === 'cono_plato') { const r = cW * 0.013; return { x1: -r, y1: -r, x2: r, y2: r, rx: 0, ry: 0 } }
  if (t === 'valla') { const w = cW * 0.055, h = cW * 0.012; return { x1: -w / 2, y1: -h, x2: w / 2, y2: h, rx: 0, ry: 0 } }
  if (t === 'mini_arco' || t === 'arco') {
    const w = t === 'mini_arco' ? cW * 0.05 : cW * 0.09
    const depth = t === 'mini_arco' ? w * 0.4 : w * 0.35
    return { x1: -w / 2, y1: -depth, x2: w / 2, y2: 0, rx: 0, ry: 0 }
  }
  // Cualquier material nuevo que no esté acá: un punto, alineable por el centro.
  return { x1: 0, y1: 0, x2: 0, y2: 0, rx: 0, ry: 0 }
}

/** La caja en la pizarra (con la rotación aplicada) y su centro. */
export function cajaDe(el, cW) {
  const c = cajaLocal(el, cW)
  const rot = ((el.rotation || 0) * Math.PI) / 180
  let x1 = c.x1, y1 = c.y1, x2 = c.x2, y2 = c.y2
  if (rot) {
    const cos = Math.cos(rot), sin = Math.sin(rot)
    const pts = [[c.x1, c.y1], [c.x2, c.y1], [c.x1, c.y2], [c.x2, c.y2]].map(([px, py]) => {
      const dx = px - c.rx, dy = py - c.ry
      return [c.rx + dx * cos - dy * sin, c.ry + dx * sin + dy * cos]
    })
    x1 = Math.min(...pts.map((p) => p[0])); x2 = Math.max(...pts.map((p) => p[0]))
    y1 = Math.min(...pts.map((p) => p[1])); y2 = Math.max(...pts.map((p) => p[1]))
  }
  const X = el.x || 0, Y = el.y || 0
  return { x1: X + x1, y1: Y + y1, x2: X + x2, y2: Y + y2, cx: X + (x1 + x2) / 2, cy: Y + (y1 + y2) / 2 }
}

/* ── un eje por vez ─────────────────────────────────────────────────────
   'x' trabaja con x1/cx/x2 y busca vecinos en la misma fila (se pisan en y);
   'y' lo mismo, girado. */
const EJES = {
  x: { a: 'x1', c: 'cx', b: 'x2', oa: 'y1', ob: 'y2' },
  y: { a: 'y1', c: 'cy', b: 'y2', oa: 'x1', ob: 'x2' },
}

const EPS = 0.5
const SEPARACION_HUECO = 8 // unidades lógicas entre la fila y la marca de distancias iguales

function candidatosEje(caja, otras, eje, medio, umbral) {
  const k = EJES[eje]
  const mias = [caja[k.a], caja[k.c], caja[k.b]]
  const cands = []

  /* 1) alinear con bordes y centros de los otros, y con el centro de la cancha.
     `prio`: centro con centro primero, después borde con borde y al final
     borde con centro. Con materiales chicos (un cono mide pocos píxeles) las
     tres pueden caer dentro del umbral, y lo que se espera es la fila
     centrada, no un cono corrido medio diámetro. */
  otras.forEach((o) => {
    [o[k.a], o[k.c], o[k.b]].forEach((t, j) => {
      mias.forEach((m, i) => {
        if (Math.abs(t - m) > umbral) return
        const prio = i === 1 && j === 1 ? 0 : i !== 1 && j !== 1 ? 1 : 2
        cands.push({ d: t - m, tipo: 'alinear', prio })
      })
    })
  })
  // contra los ejes de la cancha cuenta el centro del material, no sus bordes
  if (Math.abs(medio - caja[k.c]) <= umbral) cands.push({ d: medio - caja[k.c], tipo: 'alinear', prio: 0 })

  // 2) la misma distancia que ya hay entre otros de la misma fila / columna
  const fila = otras
    .filter((o) => o[k.ob] > caja[k.oa] && o[k.oa] < caja[k.ob])
    .sort((p, q) => p[k.a] - q[k.a])
  const huecos = []
  for (let i = 0; i + 1 < fila.length; i++) {
    const g = fila[i + 1][k.a] - fila[i][k.b]
    if (g > EPS) huecos.push(g)
  }
  const largo = caja[k.b] - caja[k.a]
  if (fila.length) {
    const ultimo = fila.reduce((p, q) => (q[k.b] > p[k.b] ? q : p))
    const primero = fila.reduce((p, q) => (q[k.a] < p[k.a] ? q : p))
    huecos.forEach((g) => {
      const d1 = ultimo[k.b] + g - caja[k.a]
      if (Math.abs(d1) <= umbral) cands.push({ d: d1, tipo: 'espacio', prio: 1 })
      const d2 = primero[k.a] - g - caja[k.b]
      if (Math.abs(d2) <= umbral) cands.push({ d: d2, tipo: 'espacio', prio: 1 })
    })
    // justo en el medio de dos vecinos
    for (let i = 0; i + 1 < fila.length; i++) {
      const A = fila[i], B = fila[i + 1]
      const libre = B[k.a] - A[k.b] - largo
      if (libre <= 0) continue
      const d = A[k.b] + libre / 2 - caja[k.a]
      if (Math.abs(d) <= umbral) cands.push({ d, tipo: 'espacio', prio: 1 })
    }
  }

  if (!cands.length) return null
  // Primero la prioridad; dentro de la misma, el más cercano (y alinear antes que espaciar).
  cands.sort((p, q) => p.prio - q.prio || Math.abs(p.d) - Math.abs(q.d) || (p.tipo === 'alinear' ? -1 : 1))
  return cands[0]
}

/* Las guías que se ven después de imantar: todas las líneas de los otros
   (y de la cancha) que quedaron coincidiendo con una línea de la caja, y
   los huecos iguales de la fila si se pegó por distancia. */
function guiasEje(caja, otras, eje, medio, alto, tipo) {
  const k = EJES[eje]
  const lineas = []
  otras.forEach((o) => {
    const desde = Math.min(caja[k.oa], o[k.oa]), hasta = Math.max(caja[k.ob], o[k.ob])
    const agregar = (t) => {
      const clave = `${t.toFixed(1)}`
      // Una sola guía por línea, estirada hasta cubrir a todos los alineados.
      const ya = lineas.find((l) => l.clave === clave)
      if (ya) { ya.desde = Math.min(ya.desde, desde); ya.hasta = Math.max(ya.hasta, hasta) }
      else lineas.push({ clave, en: t, desde, hasta })
    }
    // Centrados entre sí: alcanza con la guía del centro. Con dos conos
    // iguales coinciden también los bordes, y tres líneas paralelas ensucian.
    if (Math.abs(o[k.c] - caja[k.c]) <= EPS) { agregar(o[k.c]); return }
    [o[k.a], o[k.b]].forEach((t) => {
      if ([caja[k.a], caja[k.b]].some((m) => Math.abs(t - m) <= EPS)) agregar(t)
    })
    if ([o[k.a], o[k.b]].some((t) => Math.abs(t - caja[k.c]) <= EPS)) agregar(caja[k.c])
    if ([caja[k.a], caja[k.b]].some((m) => Math.abs(o[k.c] - m) <= EPS)) agregar(o[k.c])
  })
  if (Math.abs(medio - caja[k.c]) <= EPS) lineas.push({ clave: 'medio', en: medio, desde: 0, hasta: alto, cancha: true })

  const huecos = []
  if (tipo === 'espacio') {
    const fila = [...otras.filter((o) => o[k.ob] > caja[k.oa] && o[k.oa] < caja[k.ob]), caja]
      .sort((p, q) => p[k.a] - q[k.a])
    const gaps = []
    for (let i = 0; i + 1 < fila.length; i++) gaps.push({ A: fila[i], B: fila[i + 1], g: fila[i + 1][k.a] - fila[i][k.b] })
    const mio = gaps.filter((x) => x.A === caja || x.B === caja).map((x) => x.g)
    gaps.forEach((x) => {
      if (x.g > EPS && mio.some((g) => Math.abs(g - x.g) <= EPS)) {
        // un poco por fuera de la fila, para no pisarse con la guía del centro
        const afuera = Math.max(x.A[k.ob], x.B[k.ob]) + SEPARACION_HUECO
        huecos.push({ desde: x.A[k.b], hasta: x.B[k.a], en: afuera })
      }
    })
  }

  // a coordenadas de la pizarra: segmentos {x1,y1,x2,y2}
  const seg = (en, desde, hasta) => (eje === 'x'
    ? { x1: en, y1: desde, x2: en, y2: hasta }
    : { x1: desde, y1: en, x2: hasta, y2: en })
  return {
    lineas: lineas.map((l) => ({ ...seg(l.en, l.desde, l.hasta), cancha: !!l.cancha })),
    huecos: huecos.map((h) => (eje === 'x'
      ? { x1: h.desde, y1: h.en, x2: h.hasta, y2: h.en }
      : { x1: h.en, y1: h.desde, x2: h.en, y2: h.hasta })),
  }
}

/**
 * Imanta la posición propuesta del elemento que se arrastra.
 * @param el      el elemento con su x/y propuesta (ya con el arrastre aplicado)
 * @param otros   los demás elementos de la pizarra (se filtran los no alineables)
 * @param opts    { cW, cH, umbral } umbral en unidades lógicas
 * @returns { x, y, guias: { lineas, huecos } }
 */
export function imantar(el, otros, { cW, cH, umbral }) {
  if (!esAlineable(el)) return { x: el.x, y: el.y, guias: null }
  const cajas = otros.filter((o) => o.id !== el.id && esAlineable(o)).map((o) => cajaDe(o, cW))
  const caja0 = cajaDe(el, cW)

  const cx = candidatosEje(caja0, cajas, 'x', cW / 2, umbral)
  const cy = candidatosEje(caja0, cajas, 'y', cH / 2, umbral)
  const dx = cx ? cx.d : 0
  const dy = cy ? cy.d : 0

  const x = el.x + dx, y = el.y + dy
  const caja = cajaDe({ ...el, x, y }, cW)
  const gx = cx ? guiasEje(caja, cajas, 'x', cW / 2, cH, cx.tipo) : { lineas: [], huecos: [] }
  const gy = cy ? guiasEje(caja, cajas, 'y', cH / 2, cW, cy.tipo) : { lineas: [], huecos: [] }
  const guias = { lineas: [...gx.lineas, ...gy.lineas], huecos: [...gx.huecos, ...gy.huecos] }
  return { x, y, guias: guias.lineas.length || guias.huecos.length ? guias : null }
}

/** Dibuja las guías. `escala` = px de pantalla por unidad lógica, para que la
    línea mida siempre 1 px en pantalla, con o sin zoom. */
export function dibujarGuias(ctx, guias, escala = 1) {
  if (!guias) return
  const px = 1 / (escala || 1)
  ctx.save()
  ctx.strokeStyle = '#ff2bd6'
  ctx.fillStyle = '#ff2bd6'
  ctx.lineWidth = 1.2 * px
  guias.lineas.forEach((l) => {
    ctx.setLineDash(l.cancha ? [6 * px, 4 * px] : [])
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke()
  })
  ctx.setLineDash([])
  // huecos iguales: segmento con topes en las puntas
  const tope = 4 * px
  guias.huecos.forEach((h) => {
    ctx.beginPath(); ctx.moveTo(h.x1, h.y1); ctx.lineTo(h.x2, h.y2); ctx.stroke()
    const vertical = h.x1 === h.x2
    ;[[h.x1, h.y1], [h.x2, h.y2]].forEach(([x, y]) => {
      ctx.beginPath()
      if (vertical) { ctx.moveTo(x - tope, y); ctx.lineTo(x + tope, y) }
      else { ctx.moveTo(x, y - tope); ctx.lineTo(x, y + tope) }
      ctx.stroke()
    })
  })
  ctx.restore()
}
