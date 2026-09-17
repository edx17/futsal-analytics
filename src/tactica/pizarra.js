/* ════════════════════════════════════════════════════════════════════════
   EL MOTOR DE LA PIZARRA

   Dibuja la cancha, las fichas, las flechas y las zonas sobre un canvas 2D.
   Vivía adentro de CreadorTareas, y el Banco de Tareas tenía una copia suya
   apenas distinta. El Libro Táctico, en cambio, se había quedado con un
   reproductor viejo hecho en Konva que leía otro formato de datos, así que
   las jugadas animadas nuevas le salían como una cancha vacía.

   Ahora los tres dibujan desde acá: lo que ves en el creador es exactamente
   lo que ven los jugadores en el playbook.

   Todo razona en coordenadas lógicas (BASE_W × baseH). Quien llama se ocupa
   de escalar, rotar y desplazar el contexto antes de pintar.
   ════════════════════════════════════════════════════════════════════════ */

import { trazarTrayecto, hayCurva } from '../utils/trayectoria'

export const PITCH_VARIANTS = {
  '40x20':         { label: '40×20 · Reglamentaria', mW: 40, mH: 20 },
  '28x20':         { label: '28×20 · Reducida',      mW: 28, mH: 20 },
  '20x20_mitad':   { label: '20×20 · Finalización',  mW: 20, mH: 20 },
  '20x20_central': { label: '20×20 · Media Pista',   mW: 20, mH: 20 },
}

export const TEAM_COLORS = {
  home:      { fill: '#2979ff', stroke: '#82b0ff' },
  away:      { fill: '#ef4444', stroke: '#ff8a80' },
  verde:     { fill: '#22c55e', stroke: '#86efac' },
  blanco:    { fill: '#ffffff', stroke: '#bdbdbd' },
  'gk-ama':  { fill: '#eab308', stroke: '#fde047' },
  'gk-vio':  { fill: '#a855f7', stroke: '#d8b4fe' },
  staff:     { fill: '#111111', stroke: '#555555'   },
}

export const ARROW_STYLES = {
  'arrow-pase':       { color: '#ffffff', dash: [9,5],  width: 2.2, label: 'Pase'        },
  'arrow-conduccion': { color: '#ffe600', dash: [],     width: 2.5, label: 'Conducción' },
  'arrow-disparo':    { color: '#ff3860', dash: [],     width: 3,   label: 'Disparo'    },
  'arrow-presion':    { color: '#00e5ff', dash: [4,3],  width: 2,   label: 'Presión'    },
}

export const MATERIALS = {
  azul:     (ctx,w,h) => { ctx.fillStyle='#1e3a8a'; ctx.fillRect(0,0,w,h) },
  verde:    (ctx,w,h) => { ctx.fillStyle='#064e3b'; ctx.fillRect(0,0,w,h) },
  naranja:  (ctx,w,h) => { ctx.fillStyle='#92400e'; ctx.fillRect(0,0,w,h) },
  gris:     (ctx,w,h) => { ctx.fillStyle='#334155'; ctx.fillRect(0,0,w,h) },
  parquet:  (ctx,w,h) => {
    const g = ctx.createLinearGradient(0,0,w,0)
    g.addColorStop(0,'#7c4f2a'); g.addColorStop(.5,'#9b6035'); g.addColorStop(1,'#7c4f2a')
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h)
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = .8
    const pw = w/22
    for (let x=pw; x<w; x+=pw) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke() }
  },
  negro:    (ctx,w,h) => {
    const g = ctx.createLinearGradient(0,0,w,h)
    g.addColorStop(0,'#1a1c26'); g.addColorStop(1,'#12141c')
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h)
  },
}
export const MATERIAL_LABELS = { azul:'Azul TV', verde:'Verde', naranja:'Naranja', gris:'Gris', parquet:'Parquet', negro:'Oscuro' }

export const BASE_W = 800;
export function getBaseH(variant) {
  const vrt = PITCH_VARIANTS[variant] || PITCH_VARIANTS['40x20']
  return BASE_W / (vrt.mW / vrt.mH)
}

function getPitchLayout(cW, cH) {
  const p = Math.min(cW, cH) * 0.045
  return { px: p, py: p, ppw: cW-2*p, pph: cH-2*p }
}
function mX(m, mW, L) { return L.px + (m/mW)*L.ppw }
function mY(m, mH, L) { return L.py + (m/mH)*L.pph }

export function renderPitch(ctx, cW, cH, pitchCfg) {
  const { variant, material, lineColor, showZones, showGrid, showDims, goals } = pitchCfg
  const vrt = PITCH_VARIANTS[variant] || PITCH_VARIANTS['40x20']
  const MW = vrt.mW, MH = vrt.mH
  const L = getPitchLayout(cW, cH)
  const lc = lineColor || '#ffffff'
  const alpha = material === 'negro' ? .9 : .8

  ctx.fillStyle = '#0a0b0f'; ctx.fillRect(0,0,cW,cH)

  ctx.save()
  ctx.beginPath(); ctx.rect(L.px, L.py, L.ppw, L.pph); ctx.clip()
  ctx.save(); ctx.translate(L.px, L.py)
  ;(MATERIALS[material] || MATERIALS.azul)(ctx, L.ppw, L.pph)
  ctx.restore(); ctx.restore()

  ctx.shadowBlur = 16; ctx.shadowColor = 'rgba(0,0,0,.8)'
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 5
  ctx.strokeRect(L.px, L.py, L.ppw, L.pph); ctx.shadowBlur = 0

  function line(x1,y1,x2,y2,lw=1.5, dash=[]) {
    ctx.strokeStyle=lc; ctx.lineWidth=lw; ctx.globalAlpha=alpha
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(mX(x1,MW,L), mY(y1,MH,L))
    ctx.lineTo(mX(x2,MW,L), mY(y2,MH,L))
    ctx.stroke(); ctx.globalAlpha=1; ctx.setLineDash([])
  }
  function dot(x,y,r=3) {
    ctx.fillStyle=lc; ctx.globalAlpha=alpha
    ctx.beginPath(); ctx.arc(mX(x,MW,L), mY(y,MH,L), r, 0, Math.PI*2); ctx.fill()
    ctx.globalAlpha=1
  }

  ctx.save()
  ctx.beginPath(); ctx.rect(L.px, L.py, L.ppw, L.pph); ctx.clip()

  const midX = MW/2, midY = MH/2

  if (showGrid) {
    const gAlpha = 0.25
    ctx.strokeStyle = lc; ctx.lineWidth = 1; ctx.globalAlpha = gAlpha; ctx.setLineDash([5,5])
    const yDivs = [MH / 3, (MH * 2) / 3]
    yDivs.forEach(y => {
      ctx.beginPath(); ctx.moveTo(L.px, mY(y, MH, L)); ctx.lineTo(L.px + L.ppw, mY(y, MH, L)); ctx.stroke()
    })
    const xDivs = [MW / 4, MW / 2, (MW * 3) / 4]
    xDivs.forEach(x => {
      ctx.beginPath(); ctx.moveTo(mX(x, MW, L), L.py); ctx.lineTo(mX(x, MW, L), L.py + L.pph); ctx.stroke()
    })
    ctx.globalAlpha = 1; ctx.setLineDash([])
  }

  if (variant === '40x20' || variant === '28x20' || variant === '20x20_central') {
    line(midX,0, midX,MH, 2)
    const rPxCentral = (3/MW)*L.ppw
    ctx.strokeStyle=lc; ctx.lineWidth=1.5; ctx.globalAlpha=alpha
    ctx.beginPath(); ctx.arc(mX(midX,MW,L), mY(midY,MH,L), rPxCentral, 0, Math.PI*2); ctx.stroke()
    ctx.globalAlpha=1
    dot(midX, midY)
  }

  if (showZones) {
    const gy1 = midY - 1.5, gy2 = midY + 1.5
    ctx.strokeStyle=lc; ctx.lineWidth=1.5; ctx.globalAlpha=.8

    const drawArea = (isLeft) => {
      const baseX = isLeft ? 0 : MW
      const sign = isLeft ? 1 : -1
      const rPx = (6/MW)*L.ppw
      
      ctx.beginPath()
      if (isLeft) {
        ctx.arc(mX(baseX,MW,L), mY(gy1,MH,L), rPx, -Math.PI/2, 0, false) 
        ctx.lineTo(mX(baseX + 6, MW, L), mY(gy2, MH, L)) 
        ctx.arc(mX(baseX,MW,L), mY(gy2,MH,L), rPx, 0, Math.PI/2, false) 
      } else {
        ctx.arc(mX(baseX,MW,L), mY(gy1,MH,L), rPx, -Math.PI/2, Math.PI, true) 
        ctx.lineTo(mX(baseX - 6, MW, L), mY(gy2, MH, L)) 
        ctx.arc(mX(baseX,MW,L), mY(gy2,MH,L), rPx, Math.PI, Math.PI/2, true) 
      }
      ctx.stroke()

      dot(baseX + 6*sign, midY, 2.5)
      dot(baseX + 10*sign, midY, 2.5)

      const cr = (0.25/MW)*L.ppw
      ctx.beginPath(); ctx.arc(mX(baseX,MW,L), mY(0,MH,L), cr, isLeft?0:Math.PI/2, isLeft?Math.PI/2:Math.PI, false); ctx.stroke()
      ctx.beginPath(); ctx.arc(mX(baseX,MW,L), mY(MH,MH,L), cr, isLeft?-Math.PI/2:Math.PI, isLeft?0:-Math.PI/2, false); ctx.stroke()
    }

    if (variant !== '20x20_central') {
      drawArea(true)
      drawArea(false)
    }
    
    if (variant === '40x20' || variant === '28x20') {
      [[midX-5,0],[midX+5,0]].forEach(([mx2,my2]) => {
        const cx=mX(mx2,MW,L), cy=mY(my2,MH,L)
        ctx.strokeStyle=lc; ctx.lineWidth=2; ctx.globalAlpha=.6
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+8); ctx.stroke() 
      })
    }
    ctx.globalAlpha=1
  }

  ctx.restore()

  ctx.strokeStyle=lc; ctx.lineWidth=2; ctx.globalAlpha=alpha
  ctx.strokeRect(L.px, L.py, L.ppw, L.pph); ctx.globalAlpha=1

  if (goals !== 'none') {
    const gDepth = Math.min(L.ppw, L.pph) * 0.022
    const g1y = mY(midY-1.5, MH, L), g2y = mY(midY+1.5, MH, L)
    ctx.strokeStyle=lc; ctx.lineWidth=2.5; ctx.globalAlpha=.85
    
    const drawGoalNet = (gx, dir) => {
      ctx.beginPath()
      ctx.moveTo(gx,g1y); ctx.lineTo(gx+(gDepth*dir),g1y)
      ctx.lineTo(gx+(gDepth*dir),g2y); ctx.lineTo(gx,g2y)
      ctx.stroke()
      ctx.fillStyle='rgba(255,255,255,.08)'; ctx.fillRect(dir===-1?gx-gDepth:gx,g1y,gDepth,g2y-g1y)
      ctx.beginPath(); ctx.setLineDash([1,2]); ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,0.4)'
      for(let step=1; step<4; step++){
        let currY = g1y + ((g2y-g1y)/4)*step
        ctx.moveTo(gx, currY); ctx.lineTo(gx+(gDepth*dir), currY)
      }
      ctx.stroke(); ctx.setLineDash([])
    }

    if (goals === 'both' || goals === 'left') drawGoalNet(L.px, -1)
    if (goals === 'both' || goals === 'right') drawGoalNet(L.px+L.ppw, 1)
    
    ctx.globalAlpha=1
  }

  if (showDims) {
    const fs = Math.max(9, cW*0.012)
    ctx.fillStyle='rgba(255,255,255,.25)'; ctx.font=`${fs}px 'JetBrains Mono',monospace`
    ctx.textAlign='center'; ctx.fillText(`${MW}×${MH} m`, L.px+L.ppw/2, L.py-7)
  }
}

export function playerRadius(cW) { return cW * 0.021 }

function lighten(hex, amt) {
  if (!hex || !hex.startsWith('#')) return hex||'#fff'
  let c = hex.slice(1); if(c.length===3) c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  return '#'+c.match(/../g).map(h => Math.min(255,parseInt(h,16)+amt).toString(16).padStart(2,'0')).join('')
}

/* DPR: los celulares reportan 2 o 3. Sin esto el canvas se dibuja a
   resolucion CSS y se ve borroso. Tope en 3 para no crear un backing
   store gigante en pantallas 4x. */
export const MAX_DPR = 3
export function getDPR() {
  if (typeof window === 'undefined') return 1
  return Math.min(window.devicePixelRatio || 1, MAX_DPR)
}

/* Pinta cancha + elementos en coordenadas logicas (BASE_W x baseH).
   La usan tanto el canvas en pantalla como el export a PNG. */
export function renderBoard(ctx, opts) {
  const { elements, arrows, selected, pitchCfg, tempArrow, tempZone, isMobile,
          cebolla, trayectos, idArrastrado } = opts
  const baseH = getBaseH(pitchCfg.variant)
  renderPitch(ctx, BASE_W, baseH, pitchCfg)
  if (cebolla?.length) drawCebolla(ctx, cebolla, BASE_W, isMobile)
  if (trayectos?.length) drawTrayectos(ctx, trayectos, idArrastrado, opts.escalaPantalla)
  renderElements(ctx, elements, arrows, selected, BASE_W, tempArrow, tempZone, isMobile)
}

export function renderElements(ctx, elements, arrows, selected, cW, tempArrow, tempZone, isMobile) {
  elements.filter(e => e.type?.startsWith('zone')).forEach(el => drawEl(ctx, el, selected, cW, isMobile))
  arrows.forEach(a => drawArrow(ctx, a, selected))
  if (tempArrow) drawTempArrow(ctx, tempArrow)
  if (tempZone)  drawTempZone(ctx, tempZone)
  elements.filter(e => !e.type?.startsWith('zone')).forEach(el => drawEl(ctx, el, selected, cW, isMobile))
}

export function drawEl(ctx, el, selected, cW, isMobile) {
  const isSel = selected?.id === el.id
  const { type: t, x, y, rotation = 0 } = el

  ctx.save()

  let cx = x, cy = y
  if (t === 'zone-rect' || t === 'zone-ellipse') {
    cx = x + el.w/2
    cy = y + el.h/2
  }
  if (rotation) {
    ctx.translate(cx, cy)
    ctx.rotate(rotation * Math.PI / 180)
    ctx.translate(-cx, -cy)
  }

  ctx.shadowBlur = isSel ? 14 : 0; ctx.shadowColor = '#00e5ff'

  const PLAYER_TYPES = ['home','away','verde','blanco','gk-ama','gk-vio','staff']

  if (PLAYER_TYPES.includes(t)) {
    const r = (el.size==='sm'?.8:el.size==='lg'?1.2:1)*playerRadius(cW)
    const tc = TEAM_COLORS[t] || TEAM_COLORS.home
    const fill = el.color || tc.fill
    ctx.shadowBlur = isSel?14:5; ctx.shadowColor = isSel?'#00e5ff':'rgba(0,0,0,.5)'
    const g = ctx.createRadialGradient(x-r*.3,y-r*.35,0,x,y,r)
    g.addColorStop(0, lighten(fill,55)); g.addColorStop(1, fill)
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
    ctx.strokeStyle = el.stroke || tc.stroke; ctx.lineWidth=1.8; ctx.stroke()
    ctx.shadowBlur=0
    
    if (t==='gk-ama'||t==='gk-vio'||t==='staff') {
      ctx.strokeStyle=t==='staff'?'#fff':'#fff'; ctx.lineWidth=1; ctx.globalAlpha=.45
      ctx.beginPath(); ctx.arc(x,y,r+3,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1
    }
    
    ctx.restore(); ctx.save()
    ctx.shadowBlur = 0
    const labelText = t==='staff' ? (el.label&&el.label!==''?el.label:'E') : (el.label||'')
    if (isMobile) {
      ctx.translate(x, y)
      ctx.rotate(-Math.PI / 2)
      ctx.translate(-x, -y)
    }
    ctx.fillStyle='#fff'; ctx.font=`700 ${r*.85}px Syne,sans-serif`
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(labelText, x, y+.5)
    if (isSel) selRing(ctx,x,y,r+6)
  }
  else if (t==='ball') {
    const r = cW*0.013 
    ctx.globalAlpha = 1 
    ctx.shadowBlur=isSel?14:4; ctx.shadowColor=isSel?'#00e5ff':'rgba(0,0,0,.5)'
    ctx.fillStyle='#ffffff'; 
    ctx.beginPath(); 
    ctx.arc(x, y, r*0.9, 0, Math.PI*2); 
    ctx.fill()
    ctx.font = `${r*2.2}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('⚽', x, y + r*0.08)
    ctx.shadowBlur=0; if(isSel) selRing(ctx,x,y,r+4)
  }
  else if (t==='cono_alto'||t==='cono') {
    const r = cW*0.012
    ctx.shadowBlur = isSel?14:4; ctx.shadowColor = isSel?'#00e5ff':'rgba(0,0,0,.4)'
    ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
    ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(x,y,r*0.6,0,Math.PI*2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x,y,r*0.2,0,Math.PI*2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.stroke(); ctx.shadowBlur=0
    if(isSel) selRing(ctx,x,y,r+4)
  }
  else if (t==='cono_plato') {
    const r = cW*0.013
    ctx.shadowBlur = isSel?14:2; ctx.shadowColor = isSel?'#00e5ff':'rgba(0,0,0,.4)'
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
    ctx.fillStyle = '#ca8a04'; ctx.beginPath(); ctx.arc(x,y,r*0.3,0,Math.PI*2); ctx.fill()
    ctx.strokeStyle = '#a16207'; ctx.lineWidth=1; ctx.stroke(); ctx.shadowBlur=0
    if(isSel) selRing(ctx,x,y,r+4)
  }
  else if (t==='valla') {
    const w=cW*.055, h=cW*.012
    ctx.shadowBlur = isSel?14:4; ctx.shadowColor = isSel?'#00e5ff':'rgba(0,0,0,.5)'
    const g = ctx.createLinearGradient(x, y-h/2, x, y+h/2)
    g.addColorStop(0, '#fcd34d'); g.addColorStop(1, '#d97706')
    ctx.fillStyle=g; ctx.fillRect(x-w/2, y-h/2, w, h)
    ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.strokeRect(x-w/2,y-h/2,w,h)
    ctx.fillStyle='#222'; ctx.fillRect(x-w/2+2,y-h,4,h*2); ctx.fillRect(x+w/2-6,y-h,4,h*2)
    ctx.shadowBlur=0
    if(isSel){ctx.strokeStyle='#00e5ff';ctx.lineWidth=1.5;ctx.setLineDash([3,2]);ctx.strokeRect(x-w/2-4,y-h-4,w+8,h*2+8);ctx.setLineDash([])}
  }
  else if (t==='mini_arco'||t==='arco') {
    const w = t==='mini_arco' ? cW*.05 : cW*.09
    const depth = t==='mini_arco' ? w*0.4 : w*0.35
    ctx.shadowBlur = isSel?14:5; ctx.shadowColor = isSel?'#00e5ff':'rgba(0,0,0,0.5)'

    ctx.beginPath()
    ctx.moveTo(x - w/2, y) 
    ctx.lineTo(x - w/2 * 0.8, y - depth) 
    ctx.lineTo(x + w/2 * 0.8, y - depth) 
    ctx.lineTo(x + w/2, y) 
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.fill()

    ctx.save()
    ctx.clip()
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 0.5
    for(let i = -w; i < w*2; i += w/8) {
       ctx.moveTo(x + i, y); ctx.lineTo(x + i + depth, y - depth)
       ctx.moveTo(x + i, y); ctx.lineTo(x + i - depth, y - depth)
    }
    ctx.stroke(); ctx.restore()

    ctx.beginPath()
    ctx.moveTo(x - w/2, y); ctx.lineTo(x - w/2 * 0.8, y - depth)
    ctx.lineTo(x + w/2 * 0.8, y - depth); ctx.lineTo(x + w/2, y)
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()

    ctx.beginPath(); ctx.moveTo(x - w/2, y); ctx.lineTo(x + w/2, y)
    ctx.strokeStyle = t==='arco' ? '#ff3860' : '#ffffff'; ctx.lineWidth = 3; ctx.stroke()

    ctx.beginPath(); ctx.arc(x - w/2, y, 2.5, 0, Math.PI*2); ctx.arc(x + w/2, y, 2.5, 0, Math.PI*2)
    ctx.fillStyle = '#fff'; ctx.fill()

    ctx.shadowBlur=0
    if(isSel){ctx.strokeStyle='#00e5ff';ctx.lineWidth=1.5;ctx.setLineDash([3,2]);ctx.strokeRect(x-w/2-4,y-depth-4,w+8,depth+8);ctx.setLineDash([])}
  }
  else if (t==='zone-rect') {
    ctx.globalAlpha=el.opacity??0.18; ctx.fillStyle=el.fill||'#00e5ff'; ctx.fillRect(el.x,el.y,el.w,el.h)
    ctx.globalAlpha=1; ctx.strokeStyle=el.stroke||'#00e5ff'; ctx.lineWidth=el.lineW||1.8
    ctx.setLineDash(el.dashed?[7,4]:[]); ctx.strokeRect(el.x,el.y,el.w,el.h); ctx.setLineDash([])
    if(isSel){ctx.strokeStyle='#00e5ff';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.strokeRect(el.x-5,el.y-5,el.w+10,el.h+10);ctx.setLineDash([])}
  }
  else if (t==='zone-ellipse') {
    const ecx=el.x+el.w/2,ecy=el.y+el.h/2
    ctx.globalAlpha=el.opacity??0.18; ctx.fillStyle=el.fill||'#ff3860'
    ctx.beginPath(); ctx.ellipse(ecx,ecy,Math.abs(el.w/2),Math.abs(el.h/2),0,0,Math.PI*2); ctx.fill()
    ctx.globalAlpha=1; ctx.strokeStyle=el.stroke||'#ff3860'; ctx.lineWidth=el.lineW||1.8
    ctx.setLineDash(el.dashed?[7,4]:[]); ctx.stroke(); ctx.setLineDash([])
    if(isSel){ctx.strokeStyle='#00e5ff';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.beginPath();ctx.ellipse(ecx,ecy,Math.abs(el.w/2)+5,Math.abs(el.h/2)+5,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}
  }
  else if (t==='text') {
    if (isMobile) { ctx.translate(x, y); ctx.rotate(-Math.PI / 2); ctx.translate(-x, -y) }
    ctx.font=`${el.bold?'700':'500'} ${el.fontSize||13}px Syne,sans-serif`
    ctx.textAlign='left'; ctx.textBaseline='top'
    if(el.bg!==false){const m=ctx.measureText(el.label||'');ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x-4,y-4,m.width+8,(el.fontSize||13)+8)}
    ctx.fillStyle=el.color||'#fff'; ctx.fillText(el.label||'',x,y)
    if(isSel){const m=ctx.measureText(el.label||'');ctx.strokeStyle='#00e5ff';ctx.lineWidth=1.3;ctx.setLineDash([3,2]);ctx.strokeRect(x-7,y-7,m.width+14,(el.fontSize||13)+14);ctx.setLineDash([])}
  }

  ctx.restore()
}

function selRing(ctx,x,y,r) {
  ctx.strokeStyle='#00e5ff'; ctx.lineWidth=1.8; ctx.setLineDash([5,3])
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([])
}

/* PAPEL CEBOLLA: el fotograma anterior, tenue, debajo del actual. Sin esto
   se anima a ciegas: duplicás el cuadro, movés las fichas y no ves de dónde
   venían. */
export function drawCebolla(ctx, elements, cW, isMobile) {
  ctx.save()
  ctx.globalAlpha = 0.22
  elements.filter(e => !e.type?.startsWith('zone')).forEach(el => drawEl(ctx, el, null, cW, isMobile))
  ctx.restore()
}

/* El camino que hace cada ficha desde el fotograma anterior, con el tirador
   que lo curva. Es lo que después recorre la animación. */
export function drawTrayectos(ctx, trayectos, idArrastrado, escala = 1) {
  /* La cancha se escala a la pantalla, asi que un radio en unidades logicas
     se achica con ella: en un celular el tirador quedaba de unos 3 px y no
     habia forma de agarrarlo. Todo lo de abajo se mide en px de PANTALLA y
     se divide por la escala para volver a unidades logicas. */
  const px = (n) => n / (escala || 1)
  trayectos.forEach(t => {
    const activo = t.id === idArrastrado
    ctx.save()
    ctx.strokeStyle = activo ? '#00ff88' : 'rgba(0,229,255,.55)'
    ctx.lineWidth = px(activo ? 2.4 : 1.6)
    ctx.setLineDash([px(7), px(6)])
    trazarTrayecto(ctx, t.desde, t.hasta, t.bow)
    ctx.stroke()
    ctx.setLineDash([])

    // Punto de partida: marca de donde salio.
    ctx.fillStyle = 'rgba(0,229,255,.5)'
    ctx.beginPath(); ctx.arc(t.desde.x, t.desde.y, px(3.5), 0, Math.PI*2); ctx.fill()

    // Tirador. Se agranda mientras se arrastra para no perderlo bajo el dedo.
    const r = px(activo ? 12 : 9)
    ctx.fillStyle = activo ? '#00ff88' : '#0a0b0f'
    ctx.strokeStyle = activo ? '#00ff88' : '#00e5ff'
    ctx.lineWidth = px(2.2)
    ctx.beginPath(); ctx.arc(t.tirador.x, t.tirador.y, r, 0, Math.PI*2)
    ctx.fill(); ctx.stroke()
    if (!hayCurva(t.bow) && !activo) {
      // Recta todavia: una crucecita que invita a arrastrar.
      const b = px(3.5)
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = px(1.6)
      ctx.beginPath()
      ctx.moveTo(t.tirador.x - b, t.tirador.y); ctx.lineTo(t.tirador.x + b, t.tirador.y)
      ctx.moveTo(t.tirador.x, t.tirador.y - b); ctx.lineTo(t.tirador.x, t.tirador.y + b)
      ctx.stroke()
    }
    ctx.restore()
  })
}

export function drawArrow(ctx, a, selected) {
  const isSel = selected?.id===a.id
  const st = ARROW_STYLES[a.style]||ARROW_STYLES['arrow-pase']
  const color = a.color||st.color
  ctx.strokeStyle=color; ctx.lineWidth=a.lineW||st.width
  ctx.setLineDash(a.dashed!==undefined?(a.dashed?[9,5]:[]):st.dash)
  ctx.shadowBlur=isSel?12:0; ctx.shadowColor='#00e5ff'; ctx.globalAlpha=a.opacity??1
  const curve=a.curve||0, mx2=(a.x1+a.x2)/2, my2=(a.y1+a.y2)/2
  const dx=a.x2-a.x1, dy=a.y2-a.y1
  const cpx=mx2-dy*curve, cpy=my2+dx*curve
  ctx.beginPath(); ctx.moveTo(a.x1,a.y1); ctx.quadraticCurveTo(cpx,cpy,a.x2,a.y2); ctx.stroke()
  ctx.setLineDash([]); ctx.globalAlpha=1; ctx.shadowBlur=0
  const ang=Math.atan2(a.y2-cpy,a.x2-cpx), hs=(a.lineW||st.width)*3.5
  ctx.fillStyle=color
  ctx.beginPath(); ctx.moveTo(a.x2,a.y2)
  ctx.lineTo(a.x2-hs*Math.cos(ang-.42),a.y2-hs*Math.sin(ang-.42))
  ctx.lineTo(a.x2-hs*Math.cos(ang+.42),a.y2-hs*Math.sin(ang+.42))
  ctx.closePath(); ctx.fill()
}

export function drawTempArrow(ctx, ta) {
  const st=ARROW_STYLES[ta.style]||ARROW_STYLES['arrow-pase']
  ctx.strokeStyle=st.color+'88'; ctx.lineWidth=st.width; ctx.setLineDash([6,4])
  ctx.beginPath(); ctx.moveTo(ta.x1,ta.y1); ctx.lineTo(ta.cx,ta.cy); ctx.stroke(); ctx.setLineDash([])
}

export function drawTempZone(ctx, tz) {
  ctx.globalAlpha=.12; ctx.fillStyle=tz.type==='zone-ellipse'?'#ff3860':'#00e5ff'
  ctx.strokeStyle=tz.type==='zone-ellipse'?'#ff3860':'#00e5ff'; ctx.lineWidth=1.5; ctx.setLineDash([5,3])
  if(tz.type==='zone-rect'){ctx.fillRect(tz.x,tz.y,tz.w,tz.h);ctx.globalAlpha=.7;ctx.strokeRect(tz.x,tz.y,tz.w,tz.h)}
  else{const ecx=tz.x+tz.w/2,ecy=tz.y+tz.h/2;ctx.beginPath();ctx.ellipse(ecx,ecy,Math.abs(tz.w/2)||1,Math.abs(tz.h/2)||1,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.7;ctx.stroke()}
  ctx.setLineDash([]); ctx.globalAlpha=1
}

export function hitEl(elements, px, py, cW) {
  for (let i=elements.length-1;i>=0;i--) {
    const el=elements[i]; const r=playerRadius(cW)*1.2
    
    let cx = el.x, cy = el.y
    if(el.type?.startsWith('zone')){ cx = el.x + el.w/2; cy = el.y + el.h/2; }
    
    let rot = (el.rotation || 0) * Math.PI / 180
    let dx = px - cx, dy = py - cy
    let x = cx + dx * Math.cos(-rot) - dy * Math.sin(-rot)
    let y = cy + dx * Math.sin(-rot) + dy * Math.cos(-rot)

    if(el.type?.startsWith('zone')) {
      if(el.type==='zone-rect'){if(x>=el.x&&x<=el.x+el.w&&y>=el.y&&y<=el.y+el.h)return el}
      else{if(((x-(el.x+el.w/2))/(el.w/2))**2+((y-(el.y+el.h/2))/(el.h/2))**2<=1)return el}
    } else if(el.type==='text'){if(x>=el.x-6&&y>=el.y-6&&x<=el.x+200&&y<=el.y+(el.fontSize||13)+6)return el}
    else{if(Math.hypot(x-el.x,y-el.y)<=r)return el}
  }; return null
}
export function hitArrow(arrows, x, y) {
  for(let i=arrows.length-1;i>=0;i--){const a=arrows[i];if(distSeg(x,y,a.x1,a.y1,a.x2,a.y2)<9)return a}; return null
}
function distSeg(px,py,x1,y1,x2,y2) {
  const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy; if(!l2)return Math.hypot(px-x1,py-y1)
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2)); return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))
}

let _uid=0
export function uid() { return 'e'+(++_uid)+'_'+Date.now() }

export function convertOldEl(el) {
  const typeMap = {
    jugador: el.color==='#ef4444'?'away':el.color==='#3b82f6'?'home':el.color==='#22c55e'?'verde':'blanco',
    arquero: el.color==='#eab308'?'gk-ama':'gk-vio',
    staff:   'staff', pelota:'ball', cono_alto:'cono_alto',
    cono_plato:'cono_plato', valla:'valla', mini_arco:'mini_arco', arco:'arco',
  }
  return { id:el.id||uid(), type:typeMap[el.tipo]||el.tipo, x:el.x, y:el.y, label:el.texto||'', color:el.color }
}

export function convertOldLine(li) {
  const styleMap = { dibujar_pase:'arrow-pase', dibujar_conduccion:'arrow-conduccion' }
  const pts = li.puntos||[]
  return {
    id:li.id||uid(), x1:pts[0]||0, y1:pts[1]||0,
    x2:pts[pts.length-2]||0, y2:pts[pts.length-1]||0,
    style:styleMap[li.tipoTool]||'arrow-pase', color:li.color||'#fff',
    lineW:li.grosor||2, dashed:li.tipoTrazo==='punteada', curve:0, opacity:li.transparencia||1,
  }
}
