/**
 * CreadorTareas.jsx — v3.4 Pro (Categorías Recomendadas)
 * Motor táctico: FutsalBoard canvas (nativo, sin react-konva)
 * Lógica preservada: frames + animación interpolada, Supabase, Ficha Técnica,
 * modo edición, export PNG, mobile responsive, ToastContext, navigate
 */

import { useState, useRef, useEffect, useReducer, useCallback } from 'react'
import { supabase } from '../supabase'
import { useLocation, useNavigate } from 'react-router-dom'
import { useToast } from '../components/ToastContext'
// IMPORTAMOS AUTH para sacar las categorías del usuario
import { useAuth } from '../context/AuthContext' 

// ─────────────────────────────────────────────────────────────────
//  CONSTANTES DE PIZARRA Y SISTEMA VIRTUAL
// ─────────────────────────────────────────────────────────────────
const PITCH_VARIANTS = {
  '40x20':         { label: '40×20 · Reglamentaria', mW: 40, mH: 20 },
  '28x20':         { label: '28×20 · Reducida',      mW: 28, mH: 20 },
  '20x20_mitad':   { label: '20×20 · Finalización',  mW: 20, mH: 20 },
  '20x20_central': { label: '20×20 · Media Pista',   mW: 20, mH: 20 },
}

const TEAM_COLORS = {
  home:      { fill: '#2979ff', stroke: '#82b0ff' },
  away:      { fill: '#ef4444', stroke: '#ff8a80' },
  verde:     { fill: '#22c55e', stroke: '#86efac' },
  blanco:    { fill: '#ffffff', stroke: '#bdbdbd' },
  'gk-ama':  { fill: '#eab308', stroke: '#fde047' },
  'gk-vio':  { fill: '#a855f7', stroke: '#d8b4fe' },
  staff:     { fill: '#111111', stroke: '#555555'   },
}

const ARROW_STYLES = {
  'arrow-pase':       { color: '#ffffff', dash: [9,5],  width: 2.2, label: 'Pase'        },
  'arrow-conduccion': { color: '#ffe600', dash: [],     width: 2.5, label: 'Conducción' },
  'arrow-disparo':    { color: '#ff3860', dash: [],     width: 3,   label: 'Disparo'    },
  'arrow-presion':    { color: '#00e5ff', dash: [4,3],  width: 2,   label: 'Presión'    },
}

const MATERIALS = {
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
const MATERIAL_LABELS = { azul:'Azul TV', verde:'Verde', naranja:'Naranja', gris:'Gris', parquet:'Parquet', negro:'Oscuro' }

// Sistema Virtual: Todos los elementos guardan coordenadas sobre un ancho base fijo.
const BASE_W = 800;
function getBaseH(variant) {
  const vrt = PITCH_VARIANTS[variant] || PITCH_VARIANTS['40x20']
  return BASE_W / (vrt.mW / vrt.mH)
}

// ─────────────────────────────────────────────────────────────────
//  GEOMETRÍA
// ─────────────────────────────────────────────────────────────────
function getPitchLayout(cW, cH) {
  const p = Math.min(cW, cH) * 0.045
  return { px: p, py: p, ppw: cW-2*p, pph: cH-2*p }
}
function mX(m, mW, L) { return L.px + (m/mW)*L.ppw }
function mY(m, mH, L) { return L.py + (m/mH)*L.pph }

// ─────────────────────────────────────────────────────────────────
//  RENDER PISTA
// ─────────────────────────────────────────────────────────────────
function renderPitch(ctx, cW, cH, pitchCfg) {
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

// ─────────────────────────────────────────────────────────────────
//  RENDER ELEMENTOS TÁCTICOS MEJORADOS
// ─────────────────────────────────────────────────────────────────
function playerRadius(cW) { return cW * 0.021 }

function lighten(hex, amt) {
  if (!hex || !hex.startsWith('#')) return hex||'#fff'
  let c = hex.slice(1); if(c.length===3) c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  return '#'+c.match(/../g).map(h => Math.min(255,parseInt(h,16)+amt).toString(16).padStart(2,'0')).join('')
}

function renderElements(ctx, elements, arrows, selected, cW, tempArrow, tempZone) {
  elements.filter(e => e.type?.startsWith('zone')).forEach(el => drawEl(ctx, el, selected, cW))
  arrows.forEach(a => drawArrow(ctx, a, selected))
  if (tempArrow) drawTempArrow(ctx, tempArrow)
  if (tempZone)  drawTempZone(ctx, tempZone)
  elements.filter(e => !e.type?.startsWith('zone')).forEach(el => drawEl(ctx, el, selected, cW))
}

function drawEl(ctx, el, selected, cW) {
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
    
    ctx.fillStyle='#fff'; ctx.font=`700 ${r*.85}px Syne,sans-serif`
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(el.label||'', x, y+.5)
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

function drawArrow(ctx, a, selected) {
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

function drawTempArrow(ctx, ta) {
  const st=ARROW_STYLES[ta.style]||ARROW_STYLES['arrow-pase']
  ctx.strokeStyle=st.color+'88'; ctx.lineWidth=st.width; ctx.setLineDash([6,4])
  ctx.beginPath(); ctx.moveTo(ta.x1,ta.y1); ctx.lineTo(ta.cx,ta.cy); ctx.stroke(); ctx.setLineDash([])
}

function drawTempZone(ctx, tz) {
  ctx.globalAlpha=.12; ctx.fillStyle=tz.type==='zone-ellipse'?'#ff3860':'#00e5ff'
  ctx.strokeStyle=tz.type==='zone-ellipse'?'#ff3860':'#00e5ff'; ctx.lineWidth=1.5; ctx.setLineDash([5,3])
  if(tz.type==='zone-rect'){ctx.fillRect(tz.x,tz.y,tz.w,tz.h);ctx.globalAlpha=.7;ctx.strokeRect(tz.x,tz.y,tz.w,tz.h)}
  else{const ecx=tz.x+tz.w/2,ecy=tz.y+tz.h/2;ctx.beginPath();ctx.ellipse(ecx,ecy,Math.abs(tz.w/2)||1,Math.abs(tz.h/2)||1,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.7;ctx.stroke()}
  ctx.setLineDash([]); ctx.globalAlpha=1
}

// ─────────────────────────────────────────────────────────────────
//  HIT TEST 
// ─────────────────────────────────────────────────────────────────
function hitEl(elements, px, py, cW) {
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
function hitArrow(arrows, x, y) {
  for(let i=arrows.length-1;i>=0;i--){const a=arrows[i];if(distSeg(x,y,a.x1,a.y1,a.x2,a.y2)<9)return a}; return null
}
function distSeg(px,py,x1,y1,x2,y2) {
  const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy; if(!l2)return Math.hypot(px-x1,py-y1)
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2)); return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))
}

let _uid=0
function uid() { return 'e'+(++_uid)+'_'+Date.now() }

// ─────────────────────────────────────────────────────────────────
//  ESTADO BOARD (useReducer)
// ─────────────────────────────────────────────────────────────────
const INIT_BOARD = { elements:[], arrows:[], selected:null, history:[] }

function boardReducer(state, action) {
  const save = (s) => ({ ...s, history:[...s.history, {elements:JSON.parse(JSON.stringify(s.elements)),arrows:JSON.parse(JSON.stringify(s.arrows))}].slice(-50) })
  switch(action.type) {
    case 'ADD_EL':    { const s=save(state); return {...s, elements:[...s.elements, action.el]} }
    case 'ADD_ARR':   { const s=save(state); return {...s, arrows:[...s.arrows, action.arr]} }
    case 'MOVE_EL':   return {...state, elements:state.elements.map(e=>e.id===action.id?{...e,x:action.x,y:action.y}:e)}
    case 'SELECT':    return {...state, selected:action.sel}
    case 'UPDATE_SEL':{
      const { type, id, isArrow, ...patch } = action; 
      return isArrow 
        ? {...state, arrows: state.arrows.map(a => a.id === id ? {...a, ...patch} : a)} 
        : {...state, elements: state.elements.map(e => e.id === id ? {...e, ...patch} : e)} 
    }
    case 'DEL_SEL':   { if(!state.selected)return state; const s=save(state); const{id,isArrow}=s.selected; return {...s,elements:isArrow?s.elements:s.elements.filter(e=>e.id!==id),arrows:isArrow?s.arrows.filter(a=>a.id!==id):s.arrows,selected:null} }
    case 'LAYER':     { if(!state.selected||state.selected.isArrow)return state; const arr=[...state.elements]; const i=arr.findIndex(e=>e.id===state.selected.id); if(action.dir==='front'&&i<arr.length-1)[arr[i],arr[i+1]]=[arr[i+1],arr[i]]; if(action.dir==='back'&&i>0)[arr[i],arr[i-1]]=[arr[i-1],arr[i]]; return {...state,elements:arr} }
    case 'UNDO':      { if(!state.history.length)return state; const prev=state.history[state.history.length-1]; return {...state,...prev,history:state.history.slice(0,-1),selected:null} }
    case 'CLEAR':     { const s=save(state); return {...s,elements:[],arrows:[],selected:null} }
    case 'LOAD':      return {...INIT_BOARD, elements:action.elements||[], arrows:action.arrows||[]}
    default:          return state
  }
}

// ─────────────────────────────────────────────────────────────────
//  ESTILOS CSS (inyectados una vez)
// ─────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
.ct-root *,ct-root *::before,.ct-root *::after{box-sizing:border-box;margin:0;padding:0}
.ct-root{
  --bg:#0a0b0f;--s1:#111318;--s2:#181b23;--s3:#1f2230;
  --border:#252836;--border2:#2e3245;
  --accent:#00ff88;--accentb:#00e5ff;--red:#ef4444;--blue:#3b82f6;
  --text:#dde1f0;--muted:#5a6080;--muted2:#3a3f55;
  font-family:'Syne',sans-serif;color:var(--text);background:var(--bg);
  display:flex;flex-direction:column;overflow:hidden;user-select:none;
  position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;
}
.ct-header{height:50px;background:var(--s1);border-bottom:2px solid var(--border);display:flex;align-items:center;gap:8px;padding:0 14px;flex-shrink:0;overflow-x:auto}
.ct-header.edit-mode{border-bottom-color:var(--blue)}
.ct-workspace{flex:1;display:flex;overflow:hidden}
.ct-sidebar{width:215px;background:var(--s1);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;flex-shrink:0}
.ct-sidebar::-webkit-scrollbar{width:3px}.ct-sidebar::-webkit-scrollbar-thumb{background:var(--border2)}
.ct-sbl{font-size:9px;font-weight:700;letter-spacing:1.8px;color:var(--muted);text-transform:uppercase;padding:11px 14px 5px}
.ct-sbb{padding:0 8px 8px}
.ct-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px}
.ct-grid.s1{grid-template-columns:1fr}
.ct-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:7px 4px;background:var(--s2);border:1px solid var(--border);border-radius:7px;cursor:pointer;font-size:9px;color:var(--muted);transition:all .12s;text-align:center;line-height:1.3}
.ct-tool .ti{font-size:17px;line-height:1}
.ct-tool:hover{background:var(--s3);border-color:var(--border2);color:var(--text)}
.ct-tool.on{background:rgba(0,255,136,.07);border-color:var(--accent);color:var(--accent)}
.ct-tool.wide{grid-column:span 2;flex-direction:row;gap:8px;padding:6px 10px;font-size:10px;justify-content:flex-start}
.ct-div{height:1px;background:var(--border);margin:4px 8px}
.ct-canvas-area{flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg);background-image:radial-gradient(ellipse at 30% 20%,rgba(0,229,255,.04) 0%,transparent 50%);overflow:hidden;position:relative}
.ct-canvas{border-radius:3px;cursor:crosshair;display:block;box-shadow:0 0 40px rgba(0,0,0,0.5)}
.ct-propbar{width:220px;background:var(--s1);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;flex-shrink:0;box-shadow:-4px 0 16px rgba(0,0,0,.2)}
.ct-propbar::-webkit-scrollbar{width:3px}.ct-propbar::-webkit-scrollbar-thumb{background:var(--border2)}
.ct-prop-title{font-size:9px;font-weight:700;letter-spacing:1.8px;color:var(--muted);text-transform:uppercase;padding:15px 14px 10px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)}
.ct-prop-row{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;gap:8px;border-bottom:1px solid rgba(37,40,54,.6)}
.ct-prop-lbl{font-size:10px;color:var(--muted);white-space:nowrap;flex-shrink:0}
.ct-pinput{background:var(--s2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Syne',sans-serif;font-size:10px;padding:4px 7px;width:95px;text-align:right}
.ct-pinput:focus{outline:none;border-color:var(--accentb)}
.ct-pinput.w{width:110px}
.ct-seg{display:flex;gap:2px;flex-wrap:wrap}
.ct-sopt{padding:3px 7px;background:var(--s2);border:1px solid var(--border);border-radius:4px;font-size:9px;cursor:pointer;color:var(--muted);transition:all .1s}
.ct-sopt:hover{border-color:var(--border2);color:var(--text)}
.ct-sopt.on{background:rgba(0,229,255,.08);border-color:var(--accentb);color:var(--accentb)}
.ct-psec{padding:12px 14px 4px}
.ct-psec-title{font-size:8px;font-weight:700;letter-spacing:1.5px;color:var(--muted2);text-transform:uppercase;margin-bottom:5px}
.ct-del-btn{margin:12px 14px;padding:10px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:6px;color:var(--red);font-size:10px;font-weight:600;cursor:pointer;width:calc(100% - 28px);transition:all .13s;font-family:'Syne',sans-serif}
.ct-del-btn:hover{background:rgba(239,68,68,.15);border-color:var(--red)}
.ct-empty-prop{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--muted);font-size:10px;padding:20px;text-align:center}
.ct-bottombar{height:52px;background:var(--s1);border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;padding:0 12px;flex-shrink:0;overflow-x:auto}
.ct-play-btn{width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:bold;transition:.2s;flex-shrink:0}
.ct-frame-chip{min-width:36px;height:36px;border-radius:7px;border:1px solid var(--border);background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:pointer;transition:all .12s;position:relative;flex-shrink:0}
.ct-frame-chip:hover{border-color:var(--border2)}
.ct-frame-chip.on{background:var(--accent);border-color:var(--accent);color:#000}
.ct-frame-chip .del-x{position:absolute;top:-7px;right:-7px;background:var(--red);border:none;color:#fff;width:16px;height:16px;border-radius:50%;font-size:.55rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
.ct-tbtn{height:30px;padding:0 10px;background:transparent;border:1px solid transparent;border-radius:5px;color:var(--muted);font-family:'Syne',sans-serif;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .13s;white-space:nowrap}
.ct-tbtn:hover{background:var(--s3);border-color:var(--border2);color:var(--text)}
.ct-tbtn.on{background:rgba(0,255,136,.07);border-color:var(--accent);color:var(--accent)}
.ct-tbtn.blue{color:var(--blue)}
.ct-tbtn.blue:hover{border-color:var(--blue);color:var(--blue)}
.ct-save-btn{padding:7px 18px;border:none;border-radius:7px;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;flex-shrink:0}
.ct-input{padding:7px 10px;background:#000;border:1px solid #333;border-radius:6px;color:#fff;font-family:'Syne',sans-serif;font-size:.85rem;outline:none}
.ct-status{font-size:9px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-left:auto;white-space:nowrap}
/* Mobile */
.ct-mob-overlay-panel{position:absolute;bottom:60px;left:10px;right:10px;background:rgba(20,20,20,.95);border:1px solid #333;border-radius:16px;padding:14px;z-index:50;backdrop-filter:blur(10px);box-shadow:0 -10px 30px rgba(0,0,0,.5);max-height:60vh;overflow-y:auto}
.ct-mob-float-bar{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:20;display:flex;background:rgba(20,20,20,.88);padding:5px;border-radius:30px;border:1px solid #333;backdrop-filter:blur(10px);gap:4px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.ct-mob-float-btn{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;color:#fff;background:transparent;font-size:1.25rem}
.ct-mob-float-btn.on{background:var(--accent);color:#000}
/* Modal */
.ct-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
.ct-modal{background:#111;width:100%;max-width:800px;border:2px solid var(--accent);border-radius:12px;padding:28px;max-height:95vh;overflow-y:auto}
.ct-modal.blue-border{border-color:var(--blue)}
.ct-modal h2{margin:0;color:var(--accent);font-size:1.4rem;text-transform:uppercase}
.ct-modal h2.blue{color:var(--blue)}
.ct-modal-lbl{display:block;font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px}
.ct-modal-input{width:100%;padding:10px;background:#000;border:1px solid #333;border-radius:6px;color:#fff;font-family:'Syne',sans-serif;font-size:.9rem;outline:none;box-sizing:border-box}
.ct-modal-input:focus{border-color:var(--accentb)}
.ct-btn-primary{padding:8px 18px;background:var(--accent);color:#000;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif}
.ct-btn-sec{padding:8px 14px;background:#1a1a1a;border:1px solid #333;border-radius:7px;color:#fff;font-size:12px;cursor:pointer;font-family:'Syne',sans-serif}
@keyframes fadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.ct-modal{animation:fadeIn .2s}
.ct-mob-overlay-panel{animation:slideUp .2s ease-out}
`

// ─────────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────
const CreadorTareas = () => {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { showToast } = useToast()
  
  // EXTRAEMOS CATEGORÍAS DEL PERFIL
  const { perfil } = useAuth()
  const misCategorias = perfil?.categorias_asignadas || []

  const tareaAEditar = location.state?.editando
  const [tareaIdEditando, setTareaIdEditando] = useState(tareaAEditar?.id || null)

  // ── Board state ──
  const [board, dispatchBoard] = useReducer(boardReducer, INIT_BOARD)
  const [tool, setTool] = useState('select')

  // ── Pista config (Azul por defecto) ──
  const [pitchCfg, setPitchCfg] = useState({
    variant:   'selected' in (tareaAEditar?.editor_data?.cancha || {}) ? tareaAEditar.editor_data.cancha.tamaño : '40x20',
    material:  'azul',
    lineColor: '#ffffff',
    showZones: true,
    showGrid:  false, // MicroZonas
    showDims:  true,
    goals:     'both',
  })

  // ── Frames (animación) ──
  const [frames, setFrames] = useState([{ id:'frame-0', elements:[], arrows:[] }])
  const [frameIdx, setFrameIdx] = useState(0)
  const isPlayingRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [animSnapshot, setAnimSnapshot] = useState(null) // {elements, arrows} durante anim

  // ── Flecha/zona dibujando ──
  const tempRef = useRef({ arrow:null, zone:null })
  const ixRef   = useRef({ dragging:false, dOffX:0, dOffY:0, drawingArrow:null, drawingZone:null, tempTextPos:null })

  // ── Canvas / resize ──
  const canvasRef  = useRef(null)
  const areaRef    = useRef(null)
  const [cvSize, setCvSize] = useState({ w:800, h:500 })
  const [,forceUpdate] = useReducer(x=>x+1,0)

  // ── UI state ──
  const [showModal, setShowModal]   = useState(false)
  const [esMovil, setEsMovil]       = useState(window.innerWidth<=768)
  const [panelMovil, setPanelMovil] = useState(null) // 'elementos'|'trazos'|'anim'|'config'
  const [nombreTarea, setNombreTarea] = useState(tareaAEditar?.titulo||'')
  const [textModal, setTextModal]   = useState(false)
  const [textValue, setTextValue]   = useState('')

  // ── AGREGAMOS categoria_recomendada A LA FICHA ──
  const [fichaTecnica, setFichaTecnica] = useState({
    categoria_recomendada: tareaAEditar?.categoria_recomendada || 'Todas',
    categoria_ejercicio: tareaAEditar?.categoria_ejercicio || 'Táctico',
    fase_juego:          tareaAEditar?.fase_juego          || 'Ataque Posicional',
    duracion_estimada:   tareaAEditar?.duracion_estimada   || 15,
    intensidad_rpe:      tareaAEditar?.intensidad_rpe      || 6,
    jugadores_involucrados: tareaAEditar?.jugadores_involucrados || '',
    objetivo_principal:  tareaAEditar?.objetivo_principal  || '',
    descripcion:         tareaAEditar?.descripcion         || '',
    video_url:           tareaAEditar?.video_url           || '',
  })

  // ── CSS inject ──
  useEffect(() => {
    if (document.getElementById('ct-styles')) return
    const s = document.createElement('style'); s.id='ct-styles'; s.textContent=CSS
    document.head.appendChild(s)
  }, [])

  // ── Load tarea a editar ──
  useEffect(() => {
    if (!tareaAEditar?.editor_data) return
    const ed = tareaAEditar.editor_data
    let loadedFrames = []
    if (ed.frames?.length) {
      loadedFrames = ed.frames.map(f => ({
        id:       f.id || uid(),
        elements: f.elements || f.elementos?.map(convertOldEl) || [],
        arrows:   f.arrows   || f.lineas?.map(convertOldLine)  || [],
      }))
    } else {
      loadedFrames = [{
        id:'frame-0',
        elements: ed.elements || ed.elementos?.map(convertOldEl) || [],
        arrows:   ed.arrows   || ed.lineas?.map(convertOldLine)  || [],
      }]
    }
    setFrames(loadedFrames)
    const f0 = loadedFrames[0]
    dispatchBoard({ type:'LOAD', elements:f0.elements, arrows:f0.arrows })
    if (ed.cancha) setPitchCfg(p=>({...p, variant: ed.cancha.tamaño||'40x20', material: ed.cancha.material||'azul' }))
  }, [])

  // ── Resize ──
  useEffect(() => {
    function measure() {
      setEsMovil(window.innerWidth<=768)
      if (!areaRef.current) return
      const mW=areaRef.current.clientWidth-40, mH=areaRef.current.clientHeight-40
      const vrt = PITCH_VARIANTS[pitchCfg.variant]||PITCH_VARIANTS['40x20']
      const ratio = vrt.mW/vrt.mH
      let w=Math.min(mW,mH*ratio), h=w/ratio
      if(h>mH){h=mH;w=h*ratio}
      setCvSize({w:Math.round(w),h:Math.round(h)})
    }
    measure()
    window.addEventListener('resize', measure)
    const t = setTimeout(measure,150)
    return () => { window.removeEventListener('resize', measure); clearTimeout(t) }
  }, [pitchCfg.variant, panelMovil])

  // ── Render loop (SISTEMA DE COORDENADAS VIRTUAL) ──
  useEffect(() => {
    const cv = canvasRef.current; if(!cv)return
    const ctx = cv.getContext('2d')
    const displayEls  = isPlaying && animSnapshot ? animSnapshot.elements : board.elements
    const displayArrs = isPlaying && animSnapshot ? animSnapshot.arrows   : board.arrows

    const baseH = getBaseH(pitchCfg.variant)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cvSize.w, cvSize.h)

    ctx.scale(cvSize.w / BASE_W, cvSize.h / baseH)

    renderPitch(ctx, BASE_W, baseH, pitchCfg)
    renderElements(ctx, displayEls, displayArrs, board.selected, BASE_W, tempRef.current.arrow, tempRef.current.zone)
    
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [board, cvSize, pitchCfg, animSnapshot, isPlaying])

  // ── FRAME MANAGEMENT ──
  function syncCurrentFrame(overrideIdx) {
    const idx = overrideIdx ?? frameIdx
    setFrames(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], elements: JSON.parse(JSON.stringify(board.elements)), arrows: JSON.parse(JSON.stringify(board.arrows)) }
      return updated
    })
  }

  function cambiarFrame(newIdx) {
    if (isPlaying) return
    syncCurrentFrame(frameIdx)
    const f = frames[newIdx]
    dispatchBoard({ type:'LOAD', elements: f.elements||[], arrows: f.arrows||[] })
    setFrameIdx(newIdx)
  }

  function agregarFrameVacio() {
    if (isPlaying) return
    syncCurrentFrame(frameIdx)
    const newFrame = { id:`frame-${Date.now()}`, elements:[], arrows:[] }
    setFrames(prev => { const a=[...prev]; a.push(newFrame); return a })
    dispatchBoard({ type:'LOAD', elements:[], arrows:[] })
    setFrameIdx(prev => prev+1) 
  }

  function duplicarFrameActual() {
    if (isPlaying) return
    syncCurrentFrame(frameIdx)
    setFrames(prev => {
      const a=[...prev]
      a[frameIdx] = {...a[frameIdx], elements:JSON.parse(JSON.stringify(board.elements)), arrows:JSON.parse(JSON.stringify(board.arrows))}
      const newFrame = { id:`frame-${Date.now()}`, elements:JSON.parse(JSON.stringify(board.elements)), arrows:JSON.parse(JSON.stringify(board.arrows)) }
      a.splice(frameIdx+1, 0, newFrame)
      return a
    })
    setFrameIdx(prev=>prev+1)
  }

  function eliminarFrame(idx) {
    if (isPlaying) return
    if (frames.length<=1) { showToast("No podés borrar el único fotograma.","warning"); return }
    if (!window.confirm("¿Borrar este fotograma?")) return
    const newFrames = frames.filter((_,i)=>i!==idx)
    setFrames(newFrames)
    const newIdx = frameIdx>=newFrames.length ? newFrames.length-1 : frameIdx
    dispatchBoard({ type:'LOAD', elements:newFrames[newIdx].elements||[], arrows:newFrames[newIdx].arrows||[] })
    setFrameIdx(newIdx)
  }

  // ── ANIMACIÓN INTERPOLADA ──
  const togglePlay = async () => {
    if (isPlayingRef.current) {
      isPlayingRef.current=false; setIsPlaying(false); setAnimSnapshot(null); return
    }
    if (frames.length<2) { showToast("Necesitás al menos 2 fotogramas para reproducir una jugada.","warning"); return }

    syncCurrentFrame(frameIdx)

    isPlayingRef.current=true; setIsPlaying(true); setTool('select')
    if(esMovil) setPanelMovil(null)

    const DURATION=800, PAUSE=400

    const allFrames = [...frames]
    allFrames[frameIdx] = { ...allFrames[frameIdx], elements:JSON.parse(JSON.stringify(board.elements)), arrows:JSON.parse(JSON.stringify(board.arrows)) }

    for (let i=0; i<allFrames.length-1; i++) {
      if (!isPlayingRef.current) break
      const fA = allFrames[i], fB = allFrames[i+1]

      setAnimSnapshot({ elements: fA.elements||[], arrows: fA.arrows||[] })

      await new Promise(resolve => {
        let startTime=null
        const animate = (ts) => {
          if (!isPlayingRef.current) return resolve()
          if (!startTime) startTime=ts
          const elapsed=ts-startTime
          let progress=elapsed/DURATION; if(progress>1)progress=1
          const ease = progress<.5 ? 2*progress*progress : 1-Math.pow(-2*progress+2,2)/2

          const interpolated = (fA.elements||[]).map(elA => {
            const elB=(fB.elements||[]).find(b=>b.id===elA.id)
            if(!elB) return elA
            return { ...elA, x:elA.x+(elB.x-elA.x)*ease, y:elA.y+(elB.y-elA.y)*ease }
          })
          const newEls = (fB.elements||[]).filter(b=>!(fA.elements||[]).find(a=>a.id===b.id))
          setAnimSnapshot({ elements:[...interpolated,...(progress>.8?newEls:[])], arrows: fA.arrows||[] })

          if(progress<1) requestAnimationFrame(animate)
          else resolve()
        }
        requestAnimationFrame(animate)
      })

      if (!isPlayingRef.current) break
      setAnimSnapshot({ elements: fB.elements||[], arrows: fB.arrows||[] })
      await new Promise(res=>setTimeout(res,PAUSE))
    }

    isPlayingRef.current=false; setIsPlaying(false); setAnimSnapshot(null)
    const lastIdx=allFrames.length-1
    dispatchBoard({ type:'LOAD', elements:allFrames[lastIdx].elements||[], arrows:allFrames[lastIdx].arrows||[] })
    setFrameIdx(lastIdx)
  }

  // ── POINTER EVENTS (Adaptado a Coordenadas Virtuales) ──
  const getPos = useCallback((e) => {
    const r = canvasRef.current.getBoundingClientRect()
    const src = e.touches ? e.touches[0] || e.changedTouches[0] : e
    const rawX = src.clientX - r.left
    const rawY = src.clientY - r.top
    
    const scaleX = r.width ? BASE_W / r.width : 1
    const scaleY = r.height ? getBaseH(pitchCfg.variant) / r.height : 1
    
    return { x: rawX * scaleX, y: rawY * scaleY }
  }, [pitchCfg.variant])

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    if (isPlaying) return
    if (esMovil && panelMovil) setPanelMovil(null)
    const p=getPos(e); const ix=ixRef.current

    if (tool==='select') {
      const arr=hitArrow(board.arrows,p.x,p.y)
      if(arr){dispatchBoard({type:'SELECT',sel:{id:arr.id,isArrow:true}});return}
      const el=hitEl(board.elements, p.x, p.y, BASE_W)
      if(el){dispatchBoard({type:'SELECT',sel:{id:el.id,isArrow:false}});ix.dragging=true;ix.dOffX=p.x-el.x;ix.dOffY=p.y-el.y}
      else dispatchBoard({type:'SELECT',sel:null})
      return
    }

    const placeables=['home','away','verde','blanco','gk-ama','gk-vio','staff','ball','cono_alto','cono_plato','valla','mini_arco','arco','cono']
    if(placeables.includes(tool)){
      const count=board.elements.filter(e=>e.type===tool).length+1
      dispatchBoard({type:'ADD_EL',el:{id:uid(),type:tool,x:p.x,y:p.y,rotation:0,label:['ball','cono_alto','cono_plato','valla','mini_arco','arco','cono'].includes(tool)?'':String(count)}})
      return
    }
    if(tool.startsWith('arrow-')){
      ix.drawingArrow={x1:p.x,y1:p.y,cx:p.x,cy:p.y,style:tool}
      tempRef.current.arrow=ix.drawingArrow; return
    }
    if(tool==='zone-rect'||tool==='zone-ellipse'){
      ix.drawingZone={type:tool,x:p.x,y:p.y,sx:p.x,sy:p.y,w:0,h:0}
      tempRef.current.zone=ix.drawingZone; return
    }
    if(tool==='text'){ix.tempTextPos=p;setTextModal(true)}
  },[tool, board, isPlaying, esMovil, panelMovil, getPos])

  const onPointerMove = useCallback((e) => {
    if(isPlaying) return
    const p=getPos(e); const ix=ixRef.current
    if(ix.dragging&&board.selected){dispatchBoard({type:'MOVE_EL',id:board.selected.id,x:p.x-ix.dOffX,y:p.y-ix.dOffY});return}
    if(ix.drawingArrow){ix.drawingArrow.cx=p.x;ix.drawingArrow.cy=p.y;tempRef.current.arrow={...ix.drawingArrow};forceUpdate();return}
    if(ix.drawingZone){ix.drawingZone.w=p.x-ix.drawingZone.sx;ix.drawingZone.h=p.y-ix.drawingZone.sy;tempRef.current.zone={...ix.drawingZone};forceUpdate()}
  },[board.selected, isPlaying, getPos])

  const onPointerUp = useCallback((e) => {
    const p=getPos(e); const ix=ixRef.current; ix.dragging=false
    if(ix.drawingArrow){
      if(Math.hypot(p.x-ix.drawingArrow.x1,p.y-ix.drawingArrow.y1)>18){
        const st=ARROW_STYLES[ix.drawingArrow.style]
        dispatchBoard({type:'ADD_ARR',arr:{id:uid(),x1:ix.drawingArrow.x1,y1:ix.drawingArrow.y1,x2:p.x,y2:p.y,style:ix.drawingArrow.style,color:st.color,curve:0}})
      }
      ix.drawingArrow=null;tempRef.current.arrow=null;forceUpdate()
    }
    if(ix.drawingZone){
      if(Math.abs(ix.drawingZone.w)>16&&Math.abs(ix.drawingZone.h)>16){
        const x=ix.drawingZone.w<0?ix.drawingZone.sx+ix.drawingZone.w:ix.drawingZone.sx
        const y=ix.drawingZone.h<0?ix.drawingZone.sy+ix.drawingZone.h:ix.drawingZone.sy
        dispatchBoard({type:'ADD_EL',el:{id:uid(),type:ix.drawingZone.type,x,y,w:Math.abs(ix.drawingZone.w),h:Math.abs(ix.drawingZone.h),rotation:0,fill:ix.drawingZone.type==='zone-ellipse'?'#ff3860':'#00e5ff',stroke:ix.drawingZone.type==='zone-ellipse'?'#ff3860':'#00e5ff',opacity:.18,dashed:false,lineW:1.8}})
      }
      ix.drawingZone=null;tempRef.current.zone=null;forceUpdate()
    }
  },[getPos])

  // ── KEYBOARD ROBUSTO (Fix Bug Desaparición) ──
  useEffect(()=>{
    function onKey(e){
      const tag = e.target.tagName.toUpperCase()
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable
      if (isInput) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        dispatchBoard({type:'DEL_SEL'})
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        dispatchBoard({type:'UNDO'})
      }
      if (e.key === 'Escape') {
        setTool('select')
        dispatchBoard({type:'SELECT', sel:null})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  },[])

  // ── TEXT ──
  function confirmText(){
    const ix=ixRef.current
    if(textValue.trim()&&ix.tempTextPos){
      dispatchBoard({type:'ADD_EL',el:{id:uid(),type:'text',x:ix.tempTextPos.x,y:ix.tempTextPos.y,rotation:0,label:textValue.trim(),color:'#fff',fontSize:13,bold:false,bg:true}})
    }
    setTextModal(false);setTextValue('');ix.tempTextPos=null
  }

  // ── GUARDAR ──
  const confirmarGuardado = async () => {
    if (!nombreTarea.trim()) { showToast("Poné un nombre a la tarea antes de guardar.","warning"); return }

    const finalFrames=[...frames]
    finalFrames[frameIdx]={...finalFrames[frameIdx],elements:JSON.parse(JSON.stringify(board.elements)),arrows:JSON.parse(JSON.stringify(board.arrows))}

    const dataURL = canvasRef.current.toDataURL('image/png')
    const club_id = localStorage.getItem('club_id')||'club_default'

    const payload = {
      club_id, titulo:nombreTarea,
      espacio: pitchCfg.variant,
      url_grafico: dataURL,
      editor_data: { frames:finalFrames, cancha:{ tamaño:pitchCfg.variant, material:pitchCfg.material } },
      categoria_recomendada: fichaTecnica.categoria_recomendada, // <--- NUEVO DATO
      categoria_ejercicio:   fichaTecnica.categoria_ejercicio,
      fase_juego:            fichaTecnica.fase_juego,
      duracion_estimada:     parseInt(fichaTecnica.duracion_estimada)||0,
      intensidad_rpe:        parseInt(fichaTecnica.intensidad_rpe)||0,
      jugadores_involucrados:fichaTecnica.jugadores_involucrados,
      objetivo_principal:    fichaTecnica.objetivo_principal,
      descripcion:           fichaTecnica.descripcion,
      video_url:             fichaTecnica.video_url,
    }

    try {
      if (tareaIdEditando) {
        const {error}=await supabase.from('tareas').update(payload).eq('id',tareaIdEditando)
        if(error)throw error
        showToast("¡Tarea ACTUALIZADA con éxito!","success")
        navigate('/banco-tareas')
      } else {
        const {error}=await supabase.from('tareas').insert([payload])
        if(error)throw error
        showToast("¡Nueva Ficha Táctica guardada!","success")
        setShowModal(false)
        setFrames([{id:'frame-0',elements:[],arrows:[]}])
        dispatchBoard({type:'LOAD',elements:[],arrows:[]})
        setFrameIdx(0); setNombreTarea('')
      }
    } catch(err) { showToast("Error al guardar: "+err.message,"error") }
  }

  const upPitch = (patch) => setPitchCfg(p=>({...p,...patch}))

  // ── HERRAMIENTAS ──
  const TOOLS_PLAYERS = [
    {id:'home',    icon:'🔵', label:'Local'},
    {id:'away',    icon:'🔴', label:'Visit.'},
    {id:'verde',   icon:'🟢', label:'Verde'},
    {id:'blanco',    icon:'⚪', label:'Blanco'},
    {id:'gk-ama',  icon:'🟡', label:'Arq. Ama'},
    {id:'gk-vio',  icon:'🟣', label:'Arq. Vio'},
    {id:'staff',   icon:'👔', label:'Staff'},
  ]
  const TOOLS_MAT = [
    {id:'ball',       icon:'⚽', label:'Pelota'},
    {id:'cono_alto',  icon:'🔺', label:'Cono Alto'},
    {id:'cono_plato', icon:'🟡', label:'Cono Plano'},
    {id:'valla',      icon:'🚧', label:'Valla'},
    {id:'mini_arco',  icon:'🥅', label:'Mini Arco'},
    {id:'arco',       icon:'⬛', label:'Arco'},
  ]
  const TOOLS_ANNOT = [
    {id:'arrow-pase',       icon:'⤳', label:'Pase'},
    {id:'arrow-conduccion', icon:'⤴', label:'Conducción'},
    {id:'arrow-disparo',    icon:'🎯', label:'Disparo'},
    {id:'arrow-presion',    icon:'⚡', label:'Presión'},
    {id:'zone-rect',        icon:'⬜', label:'Zona Rect.'},
    {id:'zone-ellipse',     icon:'⭕', label:'Zona Elipse'},
    {id:'text',             icon:'T',  label:'Texto'},
  ]

  // ── PROPS PANEL ──
  const selData = board.selected
    ? (board.selected.isArrow ? board.arrows.find(a=>a.id===board.selected.id) : board.elements.find(e=>e.id===board.selected.id))
    : null

  const upSel = (patch) => { if(!board.selected)return; dispatchBoard({type:'UPDATE_SEL',id:board.selected.id,isArrow:board.selected.isArrow,...patch}) }

  const PLAYER_TYPES=['home','away','verde','blanco','gk-ama','gk-vio','staff']
  const isPlayer = selData && PLAYER_TYPES.includes(selData.type)
  const isZone   = selData && (selData.type==='zone-rect'||selData.type==='zone-ellipse')
  const isArrow  = board.selected?.isArrow

  function toHexSafe(c){
    if(!c) return '#ffffff'
    if(c.startsWith('#')) {
      if (c.length === 4) return '#' + c[1]+c[1]+c[2]+c[2]+c[3]+c[3]
      return c.slice(0,7)
    }
    if(c.startsWith('rgb')){
      const m=c.match(/\d+/g);
      if(m && m.length >= 3) return '#'+[m[0],m[1],m[2]].map(x=>(+x).toString(16).padStart(2,'0')).join('')
    }
    return '#ffffff'
  }

  const vrtLabel = PITCH_VARIANTS[pitchCfg.variant]?.label || ''

  return (
    <div className="ct-root">

      {/* ══ HEADER PC ══ */}
      {!esMovil && (
        <div className={`ct-header${tareaIdEditando?' edit-mode':''}`}>
          {tareaIdEditando && <div style={{background:'var(--blue)',color:'#fff',padding:'4px 10px',borderRadius:'6px',fontSize:'0.75rem',fontWeight:'bold',flexShrink:0}}>MODO EDICIÓN</div>}

          <input
            className="ct-input" placeholder="Título de la tarea..."
            value={nombreTarea} onChange={e=>setNombreTarea(e.target.value)}
            disabled={isPlaying} style={{width:250}}
          />

          <button className="ct-tbtn" onClick={()=>dispatchBoard({type:'UNDO'})} disabled={isPlaying}>↩ Deshacer</button>
          <button className="ct-tbtn" style={{color:'var(--red)'}} onClick={()=>{if(confirm('¿Limpiar todo?'))dispatchBoard({type:'CLEAR'})}}>✕ Limpiar</button>

          <div style={{flex:1}}/>

          <button
            className="ct-save-btn"
            style={{background:tareaIdEditando?'var(--blue)':'var(--accent)',color:tareaIdEditando?'#fff':'#000'}}
            onClick={()=>setShowModal(true)}
          >
            {tareaIdEditando?'💾 ACTUALIZAR':'💾 GUARDAR TAREA'}
          </button>
        </div>
      )}

      {/* ══ WORKSPACE ══ */}
      <div className="ct-workspace">

        {/* LEFT SIDEBAR */}
        {!esMovil && (
          <aside className="ct-sidebar">
            <div className="ct-sbl">Jugadores</div>
            <div className="ct-sbb">
              <div className="ct-grid">
                {TOOLS_PLAYERS.map(t=>(
                  <div key={t.id} className={`ct-tool${tool===t.id?' on':''}`} onClick={()=>setTool(t.id)}>
                    <span className="ti">{t.icon}</span>{t.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="ct-div"/>
            <div className="ct-sbl">Materiales</div>
            <div className="ct-sbb">
              <div className="ct-grid">
                {TOOLS_MAT.map(t=>(
                  <div key={t.id} className={`ct-tool${tool===t.id?' on':''}`} onClick={()=>setTool(t.id)}>
                    <span className="ti">{t.icon}</span>{t.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="ct-div"/>
            <div className="ct-sbl">Anotaciones</div>
            <div className="ct-sbb">
              <div className="ct-grid">
                {TOOLS_ANNOT.map(t=>(
                  <div key={t.id} className={`ct-tool${tool===t.id?' on':''}`} onClick={()=>setTool(t.id)}>
                    <span className="ti">{t.icon}</span>{t.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="ct-div"/>
            <div className="ct-sbl">Modos</div>
            <div className="ct-sbb">
              <div className="ct-grid s1">
                <div className={`ct-tool wide${tool==='select'?' on':''}`} onClick={()=>setTool('select')}>↖ Seleccionar / Mover</div>
              </div>
            </div>
          </aside>
        )}

        {/* CANVAS AREA */}
        <div className="ct-canvas-area" ref={areaRef}>
          {/* Mobile: back & save buttons */}
          {esMovil && (
            <>
              <div style={{position:'absolute',top:0,left:0,right:0,height:70,background:'linear-gradient(to bottom,rgba(0,0,0,.7),transparent)',zIndex:10,pointerEvents:'none'}}/>
              <div style={{position:'absolute',bottom:0,left:0,right:0,height:90,background:'linear-gradient(to top,rgba(0,0,0,.75),transparent)',zIndex:10,pointerEvents:'none'}}/>

              <button onClick={()=>navigate(-1)} style={{position:'absolute',top:14,left:14,zIndex:20,background:'rgba(0,0,0,.6)',border:'1px solid #444',color:'#fff',width:40,height:40,borderRadius:'50%',fontSize:'1.2rem',display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(5px)'}}>⬅</button>
              <button onClick={()=>setShowModal(true)} style={{position:'absolute',top:14,right:14,zIndex:20,background:tareaIdEditando?'var(--blue)':'var(--accent)',color:tareaIdEditando?'#fff':'#000',border:'none',padding:'0 20px',height:40,borderRadius:20,fontSize:'.9rem',fontWeight:'bold',display:'flex',alignItems:'center',justifyContent:'center'}}>
                {tareaIdEditando?'💾 ACTUALIZAR':'💾 GUARDAR'}
              </button>

              {/* Floating toolbar */}
              <div className="ct-mob-float-bar">
                <button className={`ct-mob-float-btn${tool==='select'&&!panelMovil?' on':''}`} onClick={()=>{setTool('select');setPanelMovil(null)}}>🖐️</button>
                <div style={{width:1,background:'#333',margin:'5px 0'}}/>
                <button className={`ct-mob-float-btn${panelMovil==='trazos'?' on':''}`} onClick={()=>setPanelMovil(p=>p==='trazos'?null:'trazos')}>📐</button>
                <button className={`ct-mob-float-btn${panelMovil==='elementos'?' on':''}`} onClick={()=>setPanelMovil(p=>p==='elementos'?null:'elementos')}>🎒</button>
                <button className={`ct-mob-float-btn${panelMovil==='anim'?' on':''}`} onClick={()=>setPanelMovil(p=>p==='anim'?null:'anim')}>🎬</button>
              </div>
            </>
          )}

          <canvas
            ref={canvasRef}
            className="ct-canvas"
            width={cvSize.w} height={cvSize.h}
            onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp}
            onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
          />

          {/* Mobile panels */}
          {esMovil && panelMovil==='elementos' && (
            <div className="ct-mob-overlay-panel">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <span style={{fontSize:'9px',fontWeight:'700',letterSpacing:'1.5px',color:'var(--muted)',textTransform:'uppercase'}}>JUGADORES Y MATERIALES</span>
                <button onClick={()=>setPanelMovil(null)} style={{background:'none',border:'none',color:'#fff',fontSize:'1.2rem',cursor:'pointer'}}>✖</button>
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {[...TOOLS_PLAYERS,...TOOLS_MAT].map(t=>(
                  <div key={t.id} className={`ct-tool${tool===t.id?' on':''}`} style={{width:50,padding:'8px 4px'}} onClick={()=>{setTool(t.id);setPanelMovil(null)}}>
                    <span className="ti">{t.icon}</span><span style={{fontSize:8}}>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {esMovil && panelMovil==='trazos' && (
            <div className="ct-mob-overlay-panel">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontSize:'9px',fontWeight:'700',letterSpacing:'1.5px',color:'var(--muted)',textTransform:'uppercase'}}>ANOTACIONES</span>
                <button onClick={()=>setPanelMovil(null)} style={{background:'none',border:'none',color:'#fff',fontSize:'1.2rem',cursor:'pointer'}}>✖</button>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {TOOLS_ANNOT.map(t=>(
                  <div key={t.id} className={`ct-tool${tool===t.id?' on':''}`} style={{width:70,padding:'8px 4px'}} onClick={()=>{setTool(t.id);setPanelMovil(null)}}>
                    <span className="ti">{t.icon}</span><span style={{fontSize:8}}>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {esMovil && panelMovil==='anim' && (
            <div className="ct-mob-overlay-panel">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <span style={{fontSize:'9px',fontWeight:'700',letterSpacing:'1.5px',color:'var(--muted)',textTransform:'uppercase'}}>LÍNEA DE TIEMPO</span>
                <button onClick={()=>setPanelMovil(null)} style={{background:'none',border:'none',color:'#fff',fontSize:'1.2rem',cursor:'pointer'}}>✖</button>
              </div>
              <TimelineBar frames={frames} frameIdx={frameIdx} isPlaying={isPlaying} onPlay={togglePlay} onGo={cambiarFrame} onDup={duplicarFrameActual} onAdd={agregarFrameVacio} onDel={eliminarFrame} />
            </div>
          )}
        </div>

        {/* ══ RIGHT: SIDEBAR UNIFICADO PROPIEDADES/PISTA (PC only) ══ */}
        {!esMovil && (
          <aside className="ct-propbar">
            <div className="ct-prop-title">{!selData ? 'Ajustes de Pista' : 'Propiedades'}</div>
            
            {!selData ? (
              /* PROPIEDADES DE LA PISTA */
              <>
                <div className="ct-psec"><div className="ct-psec-title">Dimensiones</div></div>
                <div className="ct-prop-row">
                  <select className="ct-pinput" value={pitchCfg.variant} disabled={isPlaying} style={{width:'100%',textAlign:'left'}}
                    onChange={e=>upPitch({variant:e.target.value})}>
                    {Object.entries(PITCH_VARIANTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div className="ct-psec"><div className="ct-psec-title">Superficie</div></div>
                <div className="ct-prop-row">
                  <select className="ct-pinput" value={pitchCfg.material} onChange={e=>upPitch({material:e.target.value})} style={{width:'100%',textAlign:'left'}}>
                    {Object.entries(MATERIAL_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}
                  </select>
                </div>

                <div className="ct-psec"><div className="ct-psec-title">Porterías</div></div>
                <div className="ct-prop-row">
                  <select className="ct-pinput" value={pitchCfg.goals} onChange={e=>upPitch({goals:e.target.value})} style={{width:'100%',textAlign:'left'}}>
                    <option value="both">Ambas (Partido)</option>
                    <option value="left">Izquierda</option>
                    <option value="right">Derecha</option>
                    <option value="none">Ninguna</option>
                  </select>
                </div>

                <div className="ct-psec"><div className="ct-psec-title">Mostrar elementos</div></div>
                <div className="ct-prop-row">
                  <span className="ct-prop-lbl">Áreas y Puntos</span>
                  <div className="ct-seg">
                    <div className={`ct-sopt${pitchCfg.showZones?' on':''}`} onClick={()=>upPitch({showZones:true})}>Sí</div>
                    <div className={`ct-sopt${!pitchCfg.showZones?' on':''}`} onClick={()=>upPitch({showZones:false})}>No</div>
                  </div>
                </div>
                <div className="ct-prop-row">
                  <span className="ct-prop-lbl">MicroZonas (Grilla)</span>
                  <div className="ct-seg">
                    <div className={`ct-sopt${pitchCfg.showGrid?' on':''}`} onClick={()=>upPitch({showGrid:true})}>Sí</div>
                    <div className={`ct-sopt${!pitchCfg.showGrid?' on':''}`} onClick={()=>upPitch({showGrid:false})}>No</div>
                  </div>
                </div>
              </>
            ) : (
              /* PROPIEDADES DEL ELEMENTO SELECCIONADO */
              <>
                <div className="ct-psec"><div className="ct-psec-title">Tipo</div></div>
                <div className="ct-prop-row"><span className="ct-prop-lbl">Elemento</span><span style={{fontSize:10,color:'var(--accentb)',fontWeight:'bold'}}>{isArrow?(ARROW_STYLES[selData.style]?.label||selData.style):selData.type.toUpperCase()}</span></div>

                {!isArrow && (
                  <>
                    <div className="ct-psec"><div className="ct-psec-title">Transformación</div></div>
                    <div className="ct-prop-row">
                      <span className="ct-prop-lbl">Rotación</span>
                      <div style={{display:'flex', alignItems:'center', gap:5}}>
                        <input className="ct-pinput" type="range" min={0} max={359} step={5} value={selData.rotation||0} onChange={e=>upSel({rotation:+e.target.value})} style={{width:80}} />
                        <span style={{fontSize:10, color:'var(--text)', width:25, textAlign:'right'}}>{selData.rotation||0}°</span>
                      </div>
                    </div>
                  </>
                )}

                {isPlayer && <>
                  <div className="ct-psec"><div className="ct-psec-title">Jugador</div></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Etiqueta / N°</span><input className="ct-pinput" value={selData.label||''} maxLength={3} onChange={e=>upSel({label:e.target.value})} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Color</span><input type="color" style={{width:50,height:26,borderRadius:5,border:'1px solid var(--border2)',cursor:'pointer'}} value={toHexSafe(selData.color||TEAM_COLORS[selData.type]?.fill)} onChange={e=>upSel({color:e.target.value})} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Tamaño</span><div className="ct-seg">{[['sm','S'],['md','M'],['lg','L']].map(([v,l])=><div key={v} className={`ct-sopt${(selData.size||'md')===v?' on':''}`} onClick={()=>upSel({size:v})}>{l}</div>)}</div></div>
                </>}

                {selData.type==='text' && <>
                  <div className="ct-psec"><div className="ct-psec-title">Texto</div></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Contenido</span><input className="ct-pinput w" value={selData.label||''} onChange={e=>upSel({label:e.target.value})} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Tamaño</span><input className="ct-pinput" type="number" value={selData.fontSize||13} min={8} max={60} onChange={e=>upSel({fontSize:+e.target.value})} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Color</span><input type="color" style={{width:50,height:26,borderRadius:5,border:'1px solid var(--border2)',cursor:'pointer'}} value={toHexSafe(selData.color||'#fff')} onChange={e=>upSel({color:e.target.value})} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Negrita</span><div className="ct-seg"><div className={`ct-sopt${selData.bold?' on':''}`} onClick={()=>upSel({bold:!selData.bold})}>B</div></div></div>
                </>}

                {isZone && <>
                  <div className="ct-psec"><div className="ct-psec-title">Zona</div></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Color</span><input type="color" style={{width:50,height:26,borderRadius:5,border:'1px solid var(--border2)',cursor:'pointer'}} value={toHexSafe(selData.fill||'#00e5ff')} onChange={e=>upSel({fill:e.target.value,stroke:e.target.value})} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Opacidad</span><input className="ct-pinput" type="range" min={0.03} max={0.6} step={0.01} value={selData.opacity??0.18} onChange={e=>upSel({opacity:+e.target.value})} style={{width:80}} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Borde</span><input className="ct-pinput" type="range" min={0.5} max={5} step={0.5} value={selData.lineW??1.8} onChange={e=>upSel({lineW:+e.target.value})} style={{width:80}} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Punteado</span><div className="ct-seg"><div className={`ct-sopt${selData.dashed?' on':''}`} onClick={()=>upSel({dashed:true})}>Sí</div><div className={`ct-sopt${!selData.dashed?' on':''}`} onClick={()=>upSel({dashed:false})}>No</div></div></div>
                </>}

                {isArrow && <>
                  <div className="ct-psec"><div className="ct-psec-title">Flecha</div></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Color</span><input type="color" style={{width:50,height:26,borderRadius:5,border:'1px solid var(--border2)',cursor:'pointer'}} value={toHexSafe(selData.color||'#fff')} onChange={e=>upSel({color:e.target.value})} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Curvatura</span><input className="ct-pinput" type="range" min={-0.5} max={0.5} step={0.05} value={selData.curve||0} onChange={e=>upSel({curve:+e.target.value})} style={{width:80}} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Grosor</span><input className="ct-pinput" type="range" min={1} max={6} step={0.5} value={selData.lineW||2} onChange={e=>upSel({lineW:+e.target.value})} style={{width:80}} /></div>
                  <div className="ct-prop-row"><span className="ct-prop-lbl">Punteado</span><div className="ct-seg"><div className={`ct-sopt${selData.dashed?' on':''}`} onClick={()=>upSel({dashed:true})}>Sí</div><div className={`ct-sopt${!selData.dashed?' on':''}`} onClick={()=>upSel({dashed:false})}>No</div></div></div>
                </>}

                <div className="ct-psec">
                  <div className="ct-psec-title">Capas</div>
                  <div style={{display:'flex',gap:3,paddingBottom:4}}>
                    <div className="ct-sopt" style={{flex:1,textAlign:'center'}} onClick={()=>dispatchBoard({type:'LAYER',dir:'front'})}>▲ Arriba</div>
                    <div className="ct-sopt" style={{flex:1,textAlign:'center'}} onClick={()=>dispatchBoard({type:'LAYER',dir:'back'})}>▼ Abajo</div>
                  </div>
                </div>
                <button className="ct-del-btn" onClick={()=>dispatchBoard({type:'DEL_SEL'})}>🗑 Eliminar Elemento</button>
              </>
            )}
          </aside>
        )}
      </div>

      {/* ══ BOTTOM: TIMELINE (PC) ══ */}
      {!esMovil && (
        <div className="ct-bottombar">
          <TimelineBar
            frames={frames} frameIdx={frameIdx} isPlaying={isPlaying}
            onPlay={togglePlay} onGo={cambiarFrame} onDup={duplicarFrameActual}
            onAdd={agregarFrameVacio} onDel={eliminarFrame}
          />
          <span className="ct-status">{vrtLabel} · Editor Pro</span>
        </div>
      )}

      {/* ══ TEXT MODAL ══ */}
      {textModal && (
        <div className="ct-overlay">
          <div style={{background:'var(--s2)',border:'1px solid var(--border2)',borderRadius:10,padding:20,width:280,boxShadow:'0 24px 60px rgba(0,0,0,.7)'}}>
            <h3 style={{fontSize:13,marginBottom:12,fontWeight:700}}>Agregar texto</h3>
            <input className="ct-modal-input" value={textValue} placeholder="Ej: Zona de presión alta" maxLength={60} autoFocus
              onChange={e=>setTextValue(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')confirmText();if(e.key==='Escape'){setTextModal(false);setTextValue('')}}}
            />
            <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:4}}>
              <button className="ct-btn-sec" onClick={()=>{setTextModal(false);setTextValue('')}}>Cancelar</button>
              <button className="ct-btn-primary" onClick={confirmText}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL FICHA TÉCNICA ══ */}
      {showModal && (
        <div className="ct-overlay">
          <div className={`ct-modal${tareaIdEditando?' blue-border':''}`}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,borderBottom:'1px solid #333',paddingBottom:15}}>
              <div>
                <h2 className={tareaIdEditando?'blue':''}>{tareaIdEditando?'Actualizar Ficha Técnica':'Ficha Técnica de la Tarea'}</h2>
                <span style={{color:'var(--muted)',fontSize:'0.8rem'}}>{vrtLabel}</span>
              </div>
              <button onClick={()=>setShowModal(false)} style={{background:'transparent',border:'none',color:'#fff',fontSize:'1.5rem',cursor:'pointer'}}>✖</button>
            </div>

            <div style={{marginBottom:20}}>
              <label className="ct-modal-lbl" style={{color:'var(--accent)'}}>Nombre de la Tarea *</label>
              <input type="text" className="ct-modal-input" style={{borderColor:'var(--accent)'}} placeholder="Ej: Rondo 4v2 con finalización..." value={nombreTarea} onChange={e=>setNombreTarea(e.target.value)} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:esMovil?'1fr':'1fr 1fr',gap:15,marginBottom:15}}>
              
              {/* NUEVO CAMPO: CATEGORÍA RECOMENDADA */}
              <div>
                <label className="ct-modal-lbl" style={{color: '#facc15'}}>Categoría de la Tarea</label>
                <select className="ct-modal-input" style={{borderColor: '#ca8a04'}} value={fichaTecnica.categoria_recomendada} onChange={e=>setFichaTecnica({...fichaTecnica,categoria_recomendada:e.target.value})}>
                  <option value="Todas">Todas las Categorías</option>
                  {misCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="ct-modal-lbl">Enfoque Teórico</label>
                <select className="ct-modal-input" value={fichaTecnica.categoria_ejercicio} onChange={e=>setFichaTecnica({...fichaTecnica,categoria_ejercicio:e.target.value})}>
                  {['Táctico','Técnico','Físico','Cognitivo','ABP','Libro Táctico'].map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="ct-modal-lbl">Fase del Juego</label>
                {fichaTecnica.categoria_ejercicio==='Libro Táctico' ? (
                  <select className="ct-modal-input" value={fichaTecnica.fase_juego} onChange={e=>setFichaTecnica({...fichaTecnica,fase_juego:e.target.value})}>
                    {['Salida de Presión','Saque Inicial','Laterales Bajos','Laterales Medios','Laterales Altos','Corners','Tiros Libres','5v4'].map(v=><option key={v}>{v}</option>)}
                  </select>
                ) : (
                  <select className="ct-modal-input" value={fichaTecnica.fase_juego} onChange={e=>setFichaTecnica({...fichaTecnica,fase_juego:e.target.value})}>
                    {['Ataque Posicional','Defensa Posicional','Transición Ofensiva','Transición Defensiva'].map(v=><option key={v}>{v}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="ct-modal-lbl">Duración (min)</label>
                <input type="number" className="ct-modal-input" value={fichaTecnica.duracion_estimada} onChange={e=>setFichaTecnica({...fichaTecnica,duracion_estimada:e.target.value})} />
              </div>
              <div>
                <label className="ct-modal-lbl">Intensidad RPE (1-10)</label>
                <input type="number" min="1" max="10" className="ct-modal-input" value={fichaTecnica.intensidad_rpe} onChange={e=>setFichaTecnica({...fichaTecnica,intensidad_rpe:e.target.value})} />
              </div>
              <div>
                <label className="ct-modal-lbl">Jugadores Involucrados</label>
                <input type="text" placeholder="Ej: 4v4 + 2 Comodines" className="ct-modal-input" value={fichaTecnica.jugadores_involucrados} onChange={e=>setFichaTecnica({...fichaTecnica,jugadores_involucrados:e.target.value})} />
              </div>
              <div style={{gridColumn: esMovil ? 'span 1' : 'span 2'}}>
                <label className="ct-modal-lbl">Objetivo Específico</label>
                <input type="text" placeholder="Ej: Mantener posesión bajo presión" className="ct-modal-input" value={fichaTecnica.objetivo_principal} onChange={e=>setFichaTecnica({...fichaTecnica,objetivo_principal:e.target.value})} />
              </div>
            </div>

            <div style={{marginBottom:15}}>
              <label className="ct-modal-lbl">Reglas y Desarrollo</label>
              <textarea rows={4} className="ct-modal-input" style={{height:'auto',resize:'vertical'}} placeholder="Describí paso a paso el desarrollo de la tarea..." value={fichaTecnica.descripcion} onChange={e=>setFichaTecnica({...fichaTecnica,descripcion:e.target.value})}/>
            </div>
            <div style={{marginBottom:25}}>
              <label className="ct-modal-lbl">URL del Video (Opcional)</label>
              <input type="text" placeholder="https://youtube.com/..." className="ct-modal-input" value={fichaTecnica.video_url} onChange={e=>setFichaTecnica({...fichaTecnica,video_url:e.target.value})} />
            </div>

            <button onClick={confirmarGuardado} className="ct-btn-primary" style={{width:'100%',padding:15,fontSize:'1.1rem',borderRadius:8}}>
              {tareaIdEditando?'💾 ACTUALIZAR TAREA':'💾 GUARDAR EN EL BANCO'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
//  SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────
function TimelineBar({ frames, frameIdx, isPlaying, onPlay, onGo, onDup, onAdd, onDel }) {
  return (
    <>
      <button className="ct-play-btn"
        style={{background:isPlaying?'#ef4444':'var(--accent)',color:isPlaying?'#fff':'#000'}}
        onClick={onPlay} title={isPlaying?'Detener':'Reproducir animación'}>
        {isPlaying?'🛑':'▶'}
      </button>
      <div style={{width:1,height:30,background:'var(--border)',flexShrink:0}}/>
      <div style={{display:'flex',gap:8,alignItems:'center',opacity:isPlaying?.5:1,pointerEvents:isPlaying?'none':'auto'}}>
        {frames.map((f,i)=>(
          <div key={f.id} className={`ct-frame-chip${i===frameIdx?' on':''}`} onClick={()=>onGo(i)}>
            {i+1}
            {i===frameIdx&&frames.length>1&&(
              <button className="del-x" onClick={e=>{e.stopPropagation();onDel(i)}}>✖</button>
            )}
          </div>
        ))}
      </div>
      <div style={{width:1,height:30,background:'var(--border)',flexShrink:0}}/>
      <button className="ct-tbtn" style={{background:'var(--blue)',color:'#fff',borderColor:'var(--blue)'}} onClick={onDup} title="Continuar jugada">⏭ Continuar</button>
      <button className="ct-tbtn" style={{background:'#222',borderColor:'#333'}} onClick={onAdd}>➕ Vacío</button>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
//  CONVERSORES (compatibilidad con datos viejos de Konva)
// ─────────────────────────────────────────────────────────────────
function convertOldEl(el) {
  const typeMap = {
    jugador: el.color==='#ef4444'?'away':el.color==='#3b82f6'?'home':el.color==='#22c55e'?'verde':'blanco',
    arquero: el.color==='#eab308'?'gk-ama':'gk-vio',
    staff:   'staff', pelota:'ball', cono_alto:'cono_alto',
    cono_plato:'cono_plato', valla:'valla', mini_arco:'mini_arco', arco:'arco',
  }
  return { id:el.id||uid(), type:typeMap[el.tipo]||el.tipo, x:el.x, y:el.y, label:el.texto||'', color:el.color }
}

function convertOldLine(li) {
  const styleMap = { dibujar_pase:'arrow-pase', dibujar_conduccion:'arrow-conduccion' }
  const pts = li.puntos||[]
  return {
    id:li.id||uid(), x1:pts[0]||0, y1:pts[1]||0,
    x2:pts[pts.length-2]||0, y2:pts[pts.length-1]||0,
    style:styleMap[li.tipoTool]||'arrow-pase', color:li.color||'#fff',
    lineW:li.grosor||2, dashed:li.tipoTrazo==='punteada', curve:0, opacity:li.transparencia||1,
  }
}

export default CreadorTareas