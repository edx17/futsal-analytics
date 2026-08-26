import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import FiltrosTareas from '../components/FiltrosTareas';
import { etiquetaFase, etiquetaFormato, pasaFiltros, colorFase, leerFase, FILTROS_VACIOS,
         NATURALEZAS, FASES, FORMATOS, subfasesDe } from '../utils/taxonomiaTareas';

// =======================================================
// UTILIDADES PARA TAREAS FÍSICAS Y CÁLCULOS
// =======================================================
const getIconoTarea = (tarea) => {
  if (tarea.categoria_ejercicio === 'Físico') {
    return tarea.espacio === 'Gimnasio' ? '🏋️‍♂️' : '🏃‍♂️';
  }
  return '⚽';
};

const RenderRutinaFisica = ({ data }) => {
  if (!data || !data.bloques) return <div style={{padding: '20px', color: 'var(--text-dim)'}}>Sin detalles físicos cargados.</div>;

  return (
    <div style={{ padding: '15px', width: '100%', height: '100%', overflowY: 'auto', background: 'var(--panel)', boxSizing: 'border-box', textAlign: 'left' }}>
      <h4 style={{ color: '#f59e0b', marginTop: 0, marginBottom: '15px', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        {data.sub_modo === 'gimnasio' ? '🏋️‍♂️ Circuito de Gimnasio / Fuerza' : '🏃‍♂️ Bloques de Acondicionamiento en Cancha'}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {data.bloques.map((b, i) => (
          <div key={b.id || i} style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
            {data.sub_modo === 'gimnasio' ? (
              <>
                <div style={{ fontWeight: '900', color: 'var(--text)', fontSize: '1.1rem' }}>{i + 1}. {b.nombre}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: '10px', marginTop: '10px' }}>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>SERIES</span><strong style={{ color: 'var(--text)' }}>{b.series || '-'}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>REPS</span><strong style={{ color: 'var(--text)' }}>{b.reps || '-'}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>INTENSIDAD</span><strong style={{ color: 'var(--text)' }}>{b.rir || '-'}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>PAUSA</span><strong style={{ color: 'var(--text)' }}>{b.pausa || '-'}</strong></div>
                </div>
                {b.notas && <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '10px', fontStyle: 'italic' }}>📌 {b.notas}</div>}
              </>
            ) : (
              <>
                <div style={{ fontWeight: '900', color: 'var(--text)', fontSize: '1.1rem' }}>{b.nombreBloque}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginTop: '10px' }}>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Dist:</span> <strong style={{ color: 'var(--text)' }}>{b.distancia}m</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Trabajo:</span> <strong style={{ color: 'var(--text)' }}>{b.tiempoTrabajo}s</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Pausa:</span> <strong style={{ color: 'var(--text)' }}>{b.micropausa}s</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Pasadas:</span> <strong style={{ color: 'var(--text)' }}>{b.pasadas}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Series:</span> <strong style={{ color: 'var(--text)' }}>{b.series}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Macro:</span> <strong style={{ color: 'var(--text)' }}>{b.macropausa}m</strong></div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// =======================================================
// COMPONENTE INTERNO: Reproductor Automático ("Modo GIF" Nativo)
// =======================================================
const ReproductorLoop = ({ editorData }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [cvSize, setCvSize] = useState({ w: 0, h: 0 });
  const isMountedRef = useRef(true);

  const frames = editorData?.frames || [];
  const pitchCfg = editorData?.cancha || { variant: '40x20', material: 'azul' };

  const PITCH_VARIANTS = {
    '40x20': { mW: 40, mH: 20 },
    '28x20': { mW: 28, mH: 20 },
    '20x20_mitad': { mW: 20, mH: 20 },
    '20x20_central': { mW: 20, mH: 20 },
  };

  const BASE_W = 800;
  function getBaseH(variant) {
    const vrt = PITCH_VARIANTS[variant] || PITCH_VARIANTS['40x20'];
    return BASE_W / (vrt.mW / vrt.mH);
  }

  const TEAM_COLORS = {
    home: { fill: '#2979ff', stroke: '#82b0ff' },
    away: { fill: '#ef4444', stroke: '#ff8a80' },
    verde: { fill: '#22c55e', stroke: '#86efac' },
    rosa: { fill: '#ec4899', stroke: '#f9a8d4' },
    'gk-ama': { fill: '#eab308', stroke: '#fde047' },
    'gk-vio': { fill: '#a855f7', stroke: '#d8b4fe' },
    staff: { fill: '#111111', stroke: '#555555' },
  };

  const ARROW_STYLES = {
    'arrow-pase': { color: '#ffffff', dash: [9,5], width: 2.2 },
    'arrow-conduccion': { color: '#ffe600', dash: [], width: 2.5 },
    'arrow-disparo': { color: '#ff3860', dash: [], width: 3 },
    'arrow-presion': { color: '#00e5ff', dash: [4,3], width: 2 },
  };

  const MATERIALS = {
    azul: (ctx,w,h) => { ctx.fillStyle='#1e3a8a'; ctx.fillRect(0,0,w,h) },
    verde: (ctx,w,h) => { ctx.fillStyle='#064e3b'; ctx.fillRect(0,0,w,h) },
    naranja: (ctx,w,h) => { ctx.fillStyle='#92400e'; ctx.fillRect(0,0,w,h) },
    gris: (ctx,w,h) => { ctx.fillStyle='#334155'; ctx.fillRect(0,0,w,h) },
    parquet: (ctx,w,h) => {
      const g = ctx.createLinearGradient(0,0,w,0);
      g.addColorStop(0,'#7c4f2a'); g.addColorStop(.5,'#9b6035'); g.addColorStop(1,'#7c4f2a');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = .8;
      const pw = w/22;
      for (let x=pw; x<w; x+=pw) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke() }
    },
    negro: (ctx,w,h) => {
      const g = ctx.createLinearGradient(0,0,w,h);
      g.addColorStop(0,'#1a1c26'); g.addColorStop(1,'#12141c');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    },
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const variant = pitchCfg.variant || pitchCfg.tamaño || '40x20';
    const baseH = getBaseH(variant);
    const ratio = BASE_W / baseH;
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      
      const cw = entry.contentRect.width;
      const ch = entry.contentRect.height;
      if (cw === 0 || ch === 0) return;

      let w = Math.min(cw, ch * ratio);
      let h = w / ratio;
      
      if (h > ch) { h = ch; w = h * ratio; }
      
      w = Math.floor(w);
      h = Math.floor(h);

      setCvSize(prev => {
        if (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - h) > 2) {
          return { w, h };
        }
        return prev;
      });
    });
    
    observer.observe(container);
    return () => observer.disconnect();
  }, [pitchCfg.variant, pitchCfg.tamaño]);

  function mX(m, mW, L) { return L.px + (m/mW)*L.ppw; }
  function mY(m, mH, L) { return L.py + (m/mH)*L.pph; }
  function playerRadius(cW) { return cW * 0.021; } 
  function lighten(hex, amt) {
    if (!hex || !hex.startsWith('#')) return hex||'#fff';
    let c = hex.slice(1); if(c.length===3) c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    return '#'+c.match(/../g).map(h => Math.min(255,parseInt(h,16)+amt).toString(16).padStart(2,'0')).join('');
  }

  function drawPitch(ctx, cW, cH, cfg) {
    const variant = cfg.variant || cfg.tamaño || '40x20';
    const vrt = PITCH_VARIANTS[variant] || PITCH_VARIANTS['40x20'];
    const MW = vrt.mW, MH = vrt.mH;
    const p = Math.min(cW, cH) * 0.045;
    const L = { px: p, py: p, ppw: cW-2*p, pph: cH-2*p };
    const lc = cfg.lineColor || '#ffffff';
    const alpha = cfg.material === 'negro' ? .9 : .8;

    ctx.fillStyle = '#0a0b0f'; ctx.fillRect(0,0,cW,cH);

    ctx.save(); ctx.beginPath(); ctx.rect(L.px, L.py, L.ppw, L.pph); ctx.clip();
    ctx.save(); ctx.translate(L.px, L.py);
    (MATERIALS[cfg.material] || MATERIALS.azul)(ctx, L.ppw, L.pph);
    ctx.restore(); ctx.restore();

    ctx.shadowBlur = 16; ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 5;
    ctx.strokeRect(L.px, L.py, L.ppw, L.pph); ctx.shadowBlur = 0;

    function line(x1,y1,x2,y2,lw=1.5, dash=[]) {
      ctx.strokeStyle=lc; ctx.lineWidth=lw; ctx.globalAlpha=alpha; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(mX(x1,MW,L), mY(y1,MH,L)); ctx.lineTo(mX(x2,MW,L), mY(y2,MH,L)); ctx.stroke();
      ctx.globalAlpha=1; ctx.setLineDash([]);
    }
    function dot(x,y,r=3) {
      ctx.fillStyle=lc; ctx.globalAlpha=alpha;
      ctx.beginPath(); ctx.arc(mX(x,MW,L), mY(y,MH,L), r, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }

    ctx.save(); ctx.beginPath(); ctx.rect(L.px, L.py, L.ppw, L.pph); ctx.clip();
    const midX = MW/2, midY = MH/2;

    if (variant === '40x20' || variant === '28x20' || variant === '20x20_central') {
      line(midX,0, midX,MH, 2);
      const rPx = (3/MW)*L.ppw;
      ctx.strokeStyle=lc; ctx.lineWidth=1.5; ctx.globalAlpha=alpha;
      ctx.beginPath(); ctx.arc(mX(midX,MW,L), mY(midY,MH,L), rPx, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha=1; dot(midX, midY);
    }

    if (cfg.showZones !== false) {
      const gy1 = midY - 1.5, gy2 = midY + 1.5;
      ctx.strokeStyle=lc; ctx.lineWidth=1.5; ctx.globalAlpha=.8;
      const drawArea = (isLeft) => {
        const baseX = isLeft ? 0 : MW; const sign = isLeft ? 1 : -1; const rPx = (6/MW)*L.ppw;
        ctx.beginPath();
        if (isLeft) {
          ctx.arc(mX(baseX,MW,L), mY(gy1,MH,L), rPx, -Math.PI/2, 0, false);
          ctx.lineTo(mX(baseX+6,MW,L), mY(gy2,MH,L));
          ctx.arc(mX(baseX,MW,L), mY(gy2,MH,L), rPx, 0, Math.PI/2, false);
        } else {
          ctx.arc(mX(baseX,MW,L), mY(gy1,MH,L), rPx, -Math.PI/2, Math.PI, true);
          ctx.lineTo(mX(baseX-6,MW,L), mY(gy2,MH,L));
          ctx.arc(mX(baseX,MW,L), mY(gy2,MH,L), rPx, Math.PI, Math.PI/2, true);
        }
        ctx.stroke();
        dot(baseX + 6*sign, midY, 2.5); dot(baseX + 10*sign, midY, 2.5);
        const cr = (0.25/MW)*L.ppw;
        ctx.beginPath(); ctx.arc(mX(baseX,MW,L), mY(0,MH,L), cr, isLeft?0:Math.PI/2, isLeft?Math.PI/2:Math.PI, false); ctx.stroke();
        ctx.beginPath(); ctx.arc(mX(baseX,MW,L), mY(MH,MH,L), cr, isLeft?-Math.PI/2:Math.PI, isLeft?0:-Math.PI/2, false); ctx.stroke();
      };
      if (variant !== '20x20_central') { drawArea(true); drawArea(false); }
    }
    ctx.restore();
    ctx.strokeStyle=lc; ctx.lineWidth=2; ctx.globalAlpha=alpha;
    ctx.strokeRect(L.px, L.py, L.ppw, L.pph); ctx.globalAlpha=1;
  }

  function drawElements(ctx, elements, arrows, cW) {
    elements.filter(e => e.type?.startsWith('zone')).forEach(el => drawItem(ctx, el, cW));
    arrows.forEach(a => drawArr(ctx, a));
    elements.filter(e => !e.type?.startsWith('zone')).forEach(el => drawItem(ctx, el, cW));
  }

  function drawArr(ctx, a) {
    const st = ARROW_STYLES[a.style]||ARROW_STYLES['arrow-pase'];
    const color = a.color||st.color;
    ctx.strokeStyle=color; ctx.lineWidth=a.lineW||st.width;
    ctx.setLineDash(a.dashed!==undefined?(a.dashed?[9,5]:[]):st.dash);
    ctx.globalAlpha=a.opacity??1;
    const curve=a.curve||0, mx2=(a.x1+a.x2)/2, my2=(a.y1+a.y2)/2;
    const dx=a.x2-a.x1, dy=a.y2-a.y1;
    const cpx=mx2-dy*curve, cpy=my2+dx*curve;
    ctx.beginPath(); ctx.moveTo(a.x1,a.y1); ctx.quadraticCurveTo(cpx,cpy,a.x2,a.y2); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha=1;
    const ang=Math.atan2(a.y2-cpy,a.x2-cpx), hs=(a.lineW||st.width)*3.5;
    ctx.fillStyle=color;
    ctx.beginPath(); ctx.moveTo(a.x2,a.y2);
    ctx.lineTo(a.x2-hs*Math.cos(ang-.42),a.y2-hs*Math.sin(ang-.42));
    ctx.lineTo(a.x2-hs*Math.cos(ang+.42),a.y2-hs*Math.sin(ang+.42));
    ctx.closePath(); ctx.fill();
  }

  function drawItem(ctx, el, cW) {
    const { type: t, x, y, rotation = 0 } = el;
    ctx.save();
    let cx = x, cy = y;
    if (t === 'zone-rect' || t === 'zone-ellipse') { cx = x + el.w/2; cy = y + el.h/2; }
    if (rotation) { ctx.translate(cx, cy); ctx.rotate(rotation * Math.PI / 180); ctx.translate(-cx, -cy); }

    const PLAYER_TYPES = ['home','away','verde','rosa','gk-ama','gk-vio','staff'];

    if (PLAYER_TYPES.includes(t)) {
      const r = (el.size==='sm'?.8:el.size==='lg'?1.2:1)*playerRadius(cW);
      const tc = TEAM_COLORS[t] || TEAM_COLORS.home;
      const fill = el.color || tc.fill;
      ctx.shadowBlur=5; ctx.shadowColor='rgba(0,0,0,.5)';
      const g = ctx.createRadialGradient(x-r*.3,y-r*.35,0,x,y,r);
      g.addColorStop(0, lighten(fill,55)); g.addColorStop(1, fill);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = el.stroke || tc.stroke; ctx.lineWidth=1.8; ctx.stroke(); ctx.shadowBlur=0;
      
      if (t==='gk-ama'||t==='gk-vio'||t==='staff') {
        ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.globalAlpha=.45;
        ctx.beginPath(); ctx.arc(x,y,r+3,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1;
      }
      ctx.fillStyle='#fff'; ctx.font=`700 ${r*.85}px Syne,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(el.label||'', x, y+.5);
    }
    else if (t==='ball') {
      const r = cW*0.013; ctx.globalAlpha = 1;
      ctx.shadowBlur=4; ctx.shadowColor='rgba(0,0,0,.5)';
      ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(x, y, r*0.9, 0, Math.PI*2); ctx.fill();
      ctx.font = `${r*2.2}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚽', x, y + r*0.08); ctx.shadowBlur=0;
    }
    else if (t==='cono_alto'||t==='cono') {
      const r = cW*0.012; ctx.shadowBlur=4; ctx.shadowColor='rgba(0,0,0,.4)';
      ctx.fillStyle='#ea580c'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fb923c'; ctx.beginPath(); ctx.arc(x,y,r*0.6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,r*0.2,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.stroke(); ctx.shadowBlur=0;
    }
    else if (t==='cono_plato') {
      const r = cW*0.013; ctx.shadowBlur=2; ctx.shadowColor='rgba(0,0,0,.4)';
      ctx.fillStyle='#facc15'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ca8a04'; ctx.beginPath(); ctx.arc(x,y,r*0.3,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#a16207'; ctx.lineWidth=1; ctx.stroke(); ctx.shadowBlur=0;
    }
    else if (t==='valla') {
      const w=cW*.055, h=cW*.012; ctx.shadowBlur=4; ctx.shadowColor='rgba(0,0,0,.5)';
      const g = ctx.createLinearGradient(x, y-h/2, x, y+h/2);
      g.addColorStop(0, '#fcd34d'); g.addColorStop(1, '#d97706');
      ctx.fillStyle=g; ctx.fillRect(x-w/2, y-h/2, w, h);
      ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.strokeRect(x-w/2,y-h/2,w,h);
      ctx.fillStyle='#222'; ctx.fillRect(x-w/2+2,y-h,4,h*2); ctx.fillRect(x+w/2-6,y-h,4,h*2); ctx.shadowBlur=0;
    }
    else if (t==='mini_arco'||t==='arco') {
      const w = t==='mini_arco' ? cW*.05 : cW*.09; const depth = t==='mini_arco' ? w*0.4 : w*0.35;
      ctx.shadowBlur=5; ctx.shadowColor='rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.moveTo(x - w/2, y); ctx.lineTo(x - w/2 * 0.8, y - depth); ctx.lineTo(x + w/2 * 0.8, y - depth); ctx.lineTo(x + w/2, y);
      ctx.fillStyle='rgba(255, 255, 255, 0.15)'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.beginPath(); ctx.strokeStyle='rgba(255, 255, 255, 0.4)'; ctx.lineWidth=0.5;
      for(let i=-w; i<w*2; i+=w/8){ ctx.moveTo(x+i,y); ctx.lineTo(x+i+depth,y-depth); ctx.moveTo(x+i,y); ctx.lineTo(x+i-depth,y-depth); }
      ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(x - w/2, y); ctx.lineTo(x - w/2 * 0.8, y - depth); ctx.lineTo(x + w/2 * 0.8, y - depth); ctx.lineTo(x + w/2, y);
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - w/2, y); ctx.lineTo(x + w/2, y);
      ctx.strokeStyle=t==='arco'?'#ff3860':'#ffffff'; ctx.lineWidth=3; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - w/2, y, 2.5, 0, Math.PI*2); ctx.arc(x + w/2, y, 2.5, 0, Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill(); ctx.shadowBlur=0;
    }
    else if (t==='zone-rect') {
      ctx.globalAlpha=el.opacity??0.18; ctx.fillStyle=el.fill||'#00e5ff'; ctx.fillRect(el.x,el.y,el.w,el.h);
      ctx.globalAlpha=1; ctx.strokeStyle=el.stroke||'#00e5ff'; ctx.lineWidth=el.lineW||1.8;
      ctx.setLineDash(el.dashed?[7,4]:[]); ctx.strokeRect(el.x,el.y,el.w,el.h); ctx.setLineDash([]);
    }
    else if (t==='zone-ellipse') {
      const ecx=el.x+el.w/2, ecy=el.y+el.h/2;
      ctx.globalAlpha=el.opacity??0.18; ctx.fillStyle=el.fill||'#ff3860';
      ctx.beginPath(); ctx.ellipse(ecx,ecy,Math.abs(el.w/2),Math.abs(el.h/2),0,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1; ctx.strokeStyle=el.stroke||'#ff3860'; ctx.lineWidth=el.lineW||1.8;
      ctx.setLineDash(el.dashed?[7,4]:[]); ctx.stroke(); ctx.setLineDash([]);
    }
    else if (t==='text') {
      ctx.font=`${el.bold?'700':'500'} ${el.fontSize||13}px Syne,sans-serif`; ctx.textAlign='left'; ctx.textBaseline='top';
      if(el.bg!==false){const m=ctx.measureText(el.label||'');ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x-4,y-4,m.width+8,(el.fontSize||13)+8);}
      ctx.fillStyle=el.color||'#fff'; ctx.fillText(el.label||'',x,y);
    }
    ctx.restore();
  }

  useEffect(() => {
    isMountedRef.current = true;
    const cv = canvasRef.current;
    if (!cv || cvSize.w === 0) return;
    const ctx = cv.getContext('2d');

    const DURATION = 800;
    const PAUSE = 500;
    let animId;

    const variant = pitchCfg.variant || pitchCfg.tamaño || '40x20';
    const baseH = getBaseH(variant);

    const playLoop = async () => {
      while (isMountedRef.current) {
        if (frames.length < 2) {
          const f0 = frames[0] || {};
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cvSize.w, cvSize.h);
          ctx.scale(cvSize.w / BASE_W, cvSize.h / baseH);
          
          drawPitch(ctx, BASE_W, baseH, pitchCfg);
          drawElements(ctx, f0.elements || f0.elementos || [], f0.arrows || f0.lineas || [], BASE_W);
          break; 
        }

        for (let i = 0; i < frames.length - 1; i++) {
          if (!isMountedRef.current) break;
          const fA = frames[i];
          const fB = frames[i + 1];
          const elsA = fA.elements || fA.elementos || [];
          const elsB = fB.elements || fB.elementos || [];
          const arrsA = fA.arrows || fA.lineas || [];

          await new Promise(resolve => {
            let startTime = null;
            const animate = (timestamp) => {
              if (!isMountedRef.current) return resolve();
              if (!startTime) startTime = timestamp;
              const progress = Math.min((timestamp - startTime) / DURATION, 1);
              const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

              const interpolated = elsA.map(elA => {
                const elB = elsB.find(b => b.id === elA.id);
                if (!elB) return elA;
                return {
                  ...elA,
                  x: elA.x + (elB.x - elA.x) * ease,
                  y: elA.y + (elB.y - elA.y) * ease,
                  rotation: (elA.rotation||0) + ((elB.rotation||0) - (elA.rotation||0)) * ease,
                };
              });
              
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.clearRect(0, 0, cvSize.w, cvSize.h);
              ctx.scale(cvSize.w / BASE_W, cvSize.h / baseH);
              
              drawPitch(ctx, BASE_W, baseH, pitchCfg);
              drawElements(ctx, interpolated, arrsA, BASE_W);

              if (progress < 1) animId = requestAnimationFrame(animate);
              else resolve();
            };
            animId = requestAnimationFrame(animate);
          });

          if (!isMountedRef.current) break;
          await new Promise(res => setTimeout(res, PAUSE));
        }
        await new Promise(res => setTimeout(res, 1000));
      }
    };

    playLoop();
    return () => { isMountedRef.current = false; cancelAnimationFrame(animId); };
  }, [frames, cvSize, pitchCfg]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#0a0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <canvas 
        ref={canvasRef} 
        width={cvSize.w} 
        height={cvSize.h} 
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
      />
      {frames.length > 1 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>
          ▶ ANIMACIÓN
        </div>
      )}
    </div>
  );
};

// =======================================================
// COMPONENTE PRINCIPAL BANCO DE TAREAS
// =======================================================
const BancoTareas = () => {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  const esMovil = useEsMovil();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  
  // MODAL CREAR TAREA
  const [showCrearModal, setShowCrearModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  
  const [categoriasClub, setCategoriasClub] = useState([]);
  const { perfil } = useAuth();
  
  const [nuevaTarea, setNuevaTarea] = useState({
    titulo: '',
    categoria_recomendada: 'Todas',
    categoria_ejercicio: 'Táctico',
    fase_juego: 'Ataque',
    subfase_juego: '',
    formato_tarea: 'Reducido',
    duracion_estimada: 15,
    intensidad_rpe: 6,
    jugadores_involucrados: '',
    objetivo_principal: '',
    descripcion: '',
    video_url: '',
  });

  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    cargarTareas();
    cargarCategoriasClub();
  }, []);

  const cargarTareas = async () => {
    setCargando(true);
    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      const { data, error } = await supabase
        .from('tareas')
        .select('*')
        .eq('club_id', club_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTareas(data || []);
    } catch (error) {
      console.error("Error al cargar tareas:", error.message);
    } finally {
      setCargando(false);
    }
  };

  const cargarCategoriasClub = async () => {
    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      if (club_id === 'club_default') return;
      const { data } = await supabase.from('jugadores').select('categoria').eq('club_id', club_id);
      if (data) {
        const unicas = [...new Set(data.map(j => j.categoria).filter(Boolean))].sort();
        setCategoriasClub(unicas);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const misCategorias = perfil?.categorias_asignadas || [];
  const categoriasDisponibles = [...new Set([...misCategorias, ...categoriasClub])].sort();

  const eliminarTarea = async (id) => {
    const confirmar = window.confirm("⚠️ ¿Estás seguro de que querés eliminar esta tarea definitivamente? Esta acción no se puede deshacer.");
    if (!confirmar) return;

    try {
      const { error } = await supabase.from('tareas').delete().eq('id', id);
      if (error) throw error;
      
      setTareas(tareas.filter(t => t.id !== id));
      setTareaSeleccionada(null);
      showToast("Tarea eliminada con éxito", "success");
    } catch (error) {
      showToast("Error al eliminar la tarea: " + error.message, "error");
    }
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'video/mp4' && file.type !== 'video/webm') {
        showToast("Solo se permiten archivos MP4 o WebM cortos.", "warning");
        return;
      }
      if (file.size > 20 * 1024 * 1024) { // 20 MB max
        showToast("El video es muy pesado. Máximo 20MB.", "warning");
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const guardarNuevaTarea = async () => {
    if (!nuevaTarea.titulo.trim()) { showToast("Poné un nombre a la tarea antes de guardar.", "warning"); return; }
    
    setIsUploading(true);
    const club_id = localStorage.getItem('club_id') || 'club_default';
    let url_video_mp4 = null;

    try {
      if (videoFile) {
        const fileExt = videoFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        
        // Asume que tenés un bucket público llamado 'videos_tareas'
        const { error: uploadError } = await supabase.storage.from('videos_tareas').upload(fileName, videoFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('videos_tareas').getPublicUrl(fileName);
        url_video_mp4 = publicUrl;
      }

      const payload = {
        club_id,
        titulo: nuevaTarea.titulo,
        categoria_recomendada: nuevaTarea.categoria_recomendada,
        categoria_ejercicio: nuevaTarea.categoria_ejercicio,
        fase_juego: nuevaTarea.fase_juego,
        subfase_juego: nuevaTarea.subfase_juego || null,
        formato_tarea: nuevaTarea.formato_tarea,
        duracion_estimada: parseInt(nuevaTarea.duracion_estimada) || 0,
        intensidad_rpe: parseInt(nuevaTarea.intensidad_rpe) || 0,
        jugadores_involucrados: nuevaTarea.jugadores_involucrados,
        objetivo_principal: nuevaTarea.objetivo_principal,
        descripcion: nuevaTarea.descripcion,
        video_url: nuevaTarea.video_url, // Link externo de Youtube
        video_mp4_url: url_video_mp4, // El video nativo subido
      };

      const { data, error } = await supabase.from('tareas').insert([payload]).select().single();
      if (error) throw error;

      showToast("¡Tarea guardada exitosamente!", "success");
      setTareas([data, ...tareas]);
      setShowCrearModal(false);
      setVideoFile(null);
      setVideoPreview(null);
      setNuevaTarea({ ...nuevaTarea, titulo: '', descripcion: '', objetivo_principal: '' });
      
    } catch (err) {
      showToast("Error al guardar: " + err.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const getColoresCategoria = (categoria) => {
    switch (categoria) {
      case 'Táctico': return { bg: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)', border: '#3b82f6', text: '#bfdbfe' };
      case 'Físico': return { bg: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)', border: '#ef4444', text: '#fecaca' };
      case 'Técnico': return { bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', border: '#10b981', text: '#a7f3d0' };
      case 'Cognitivo': return { bg: 'linear-gradient(135deg, #4c1d95 0%, #2e1065 100%)', border: '#8b5cf6', text: '#ddd6fe' };
      case 'Libro Táctico': return { bg: 'linear-gradient(135deg, #164e63 0%, #083344 100%)', border: '#22d3ee', text: '#a5f3fc' };
      case 'ABP': return { bg: 'linear-gradient(135deg, #78350f 0%, #451a03 100%)', border: '#f59e0b', text: '#fde68a' };
      default: return { bg: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', border: '#4b5563', text: '#d1d5db' };
    }
  };

  const tareasFiltradas = tareas.filter(t => pasaFiltros(t, filtros));

  const CartaFUT = ({ tarea }) => {
    const colores = getColoresCategoria(tarea.categoria_ejercicio);
    const carga = (tarea.duracion_estimada || 0) * (tarea.intensidad_rpe || 0);

    return (
      <div
        onClick={() => setTareaSeleccionada(tarea)}
        style={{
          background: colores.bg,
          border: `2px solid ${colores.border}`,
          borderRadius: '16px',
          /* Antes eran 260px clavados y en el celular quedaban cortadas.
             Ahora la carta se estira hasta el ancho disponible. */
          width: '100%',
          maxWidth: '280px',
          height: esMovil ? '340px' : '380px',
          padding: esMovil ? '12px' : '15px',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          position: 'relative',
          boxShadow: `0 8px 25px rgba(0,0,0,0.6), inset 0 0 15px rgba(255,255,255,0.1)`,
          transition: 'transform 0.2s, box-shadow 0.2s',
          animation: 'fadeIn 0.4s ease-out'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'; e.currentTarget.style.boxShadow = `0 15px 35px rgba(0,0,0,0.8), 0 0 20px ${colores.border}40`; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = `0 8px 25px rgba(0,0,0,0.6), inset 0 0 15px rgba(255,255,255,0.1)`; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#ffffff', lineHeight: '1' }}>{carga}</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: colores.text, textTransform: 'uppercase', letterSpacing: '1px' }}>Carga UC</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '900', color: colores.border, textTransform: 'uppercase', display: 'block' }}>{tarea.categoria_ejercicio}</span>
            <span style={{ fontSize: '0.6rem', color: colorFase(leerFase(tarea).fase) }}>{etiquetaFase(tarea) || '—'}</span>
          </div>
        </div>

        <div style={{ flex: 1, background: '#0a0b0f', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${colores.border}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {tarea.video_mp4_url ? (
            <video src={tarea.video_mp4_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline autoPlay />
          ) : tarea.url_grafico ? (
            <img src={tarea.url_grafico} alt="Gráfico Tarea" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '3rem' }}>{getIconoTarea(tarea)}</span>
          )}
          {tarea.formato_tarea && (
            <div style={{ position: 'absolute', top: '5px', left: '5px', background: 'rgba(8,145,178,0.85)', border: '1px solid #22d3ee', color: '#ffffff', fontSize: '0.6rem', fontWeight: '900', padding: '3px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
              {etiquetaFormato(tarea.formato_tarea)}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: '5px', right: '5px', background: 'rgba(0,0,0,0.8)', border: `1px solid ${colores.border}`, color: '#ffffff', fontSize: '0.6rem', fontWeight: '900', padding: '3px 6px', borderRadius: '4px' }}>
            {tarea.jugadores_involucrados || 'Grupal'}
          </div>
        </div>

        <div style={{ textAlign: 'center', margin: '12px 0', borderBottom: `1px solid ${colores.border}40`, paddingBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tarea.titulo}
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px', textAlign: 'center' }}>
          <div>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }}>{tarea.duracion_estimada}'</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>MINS</span>
          </div>
          <div style={{ borderLeft: `1px solid ${colores.border}40`, borderRight: `1px solid ${colores.border}40` }}>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }}>{tarea.intensidad_rpe}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>RPE</span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: '900', color: '#ffffff', marginTop: '3px' }}>{tarea.espacio?.replace('_', ' ')}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>ZONA</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', padding: esMovil ? '0 10px 80px' : undefined, animation: 'fadeIn 0.3s' }}>
      
      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px', background: 'var(--panel)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="stat-label" style={{ color: 'var(--accent)', fontSize: esMovil ? '1.15rem' : '1.5rem', margin: 0 }}>
              🗃️ BANCO DE TAREAS
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {tareasFiltradas.length} de {tareas.length} ejercicios
            </p>
          </div>

          <button onClick={() => setShowCrearModal(true)} style={{
            background: 'var(--accent)', color: '#000', padding: esMovil ? '12px 16px' : '12px 20px',
            borderRadius: '8px', border: 'none', fontWeight: '900', cursor: 'pointer',
            fontSize: '0.85rem', boxShadow: '0 4px 15px rgba(0,255,136,0.3)',
            flex: esMovil ? '1 1 100%' : '0 0 auto',
          }}>
            + NUEVA TAREA
          </button>
        </div>

        <FiltrosTareas valores={filtros} onCambiar={setFiltros} compacto={esMovil} />
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--accent)' }}>Cargando el playbook... ⚽</div>
      ) : tareasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: 'var(--hover)', borderRadius: '15px', border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📋</div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>No hay tareas aún.</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Creá tu primer ejercicio en el Creador o subí un video para empezar.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))',
          gap: esMovil ? '14px' : '25px',
          justifyItems: 'center',
        }}>
          {tareasFiltradas.map(tarea => (
            <CartaFUT key={tarea.id} tarea={tarea} />
          ))}
        </div>
      )}

      {/* MODAL: CREAR TAREA (VIDEO O CREADOR) */}
      {showCrearModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--panel)', width: '100%', maxWidth: '800px', borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--accent)', borderRadius: '12px', padding: esMovil ? '18px' : '28px', maxHeight: '95vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '15px' }}>
              <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.4rem', textTransform: 'uppercase' }}>Subir Nueva Tarea Rápida</h2>
              <button onClick={() => {setShowCrearModal(false); setVideoFile(null); setVideoPreview(null);}} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '1.5rem', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>✖</button>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
              <button onClick={() => navigate('/creador-tareas')} style={{ flex: 1, padding: '15px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '8px', color: '#60a5fa', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '5px' }}>🎨</span>
                Abrir Creador Táctico
              </button>
              
              <label style={{ flex: 1, padding: '15px', background: 'rgba(0, 255, 136, 0.1)', border: '1px dashed var(--accent)', borderRadius: '8px', color: 'var(--accent)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '5px' }}>📁</span>
                {videoFile ? 'Cambiar Video MP4' : 'Subir Video MP4 (Corto)'}
                <input type="file" accept="video/mp4,video/webm" style={{ display: 'none' }} onChange={handleVideoChange} />
              </label>
            </div>

            {videoPreview && (
              <div style={{ marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)', width: '100%', aspectRatio: '16/9', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
                <video src={videoPreview} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label className="campo-rotulo" style={{ color: 'var(--accent)' }}>Nombre de la Tarea *</label>
              <input type="text" className="campo" style={{ borderColor: 'var(--accent)' }} placeholder="Ej: Rondo 4v2 con finalización..." value={nuevaTarea.titulo} onChange={e => setNuevaTarea({...nuevaTarea, titulo: e.target.value})} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
              <div>
                <label className="campo-rotulo" style={{ color: '#facc15' }}>Categoría Recomendada</label>
                <select className="campo" style={{ borderColor: '#ca8a04' }} value={nuevaTarea.categoria_recomendada} onChange={e => setNuevaTarea({...nuevaTarea, categoria_recomendada: e.target.value})}>
                  <option value="Todas">Todas las Categorías</option>
                  {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Naturaleza · Contenido</label>
                <select className="campo" value={nuevaTarea.categoria_ejercicio} onChange={e => setNuevaTarea({...nuevaTarea, categoria_ejercicio: e.target.value})}>
                  {NATURALEZAS.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Fase del Juego</label>
                <select className="campo" value={nuevaTarea.fase_juego} onChange={e => setNuevaTarea({...nuevaTarea, fase_juego: e.target.value, subfase_juego: ''})}>
                  {FASES.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Situación</label>
                <select className="campo"
                        value={nuevaTarea.subfase_juego}
                        onChange={e => setNuevaTarea({...nuevaTarea, subfase_juego: e.target.value})}>
                  <option value="">— sin especificar —</option>
                  {subfasesDe(nuevaTarea.fase_juego).map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo" style={{ color: '#22d3ee' }}>Formato de Tarea</label>
                <select className="campo campo-frio" value={nuevaTarea.formato_tarea} onChange={e => setNuevaTarea({...nuevaTarea, formato_tarea: e.target.value})}>
                  {FORMATOS.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Duración (min)</label>
                <input type="number" className="campo" value={nuevaTarea.duracion_estimada} onChange={e => setNuevaTarea({...nuevaTarea, duracion_estimada: e.target.value})} />
              </div>
              <div>
                <label className="campo-rotulo">Intensidad RPE</label>
                <input type="number" min="1" max="10" className="campo" value={nuevaTarea.intensidad_rpe} onChange={e => setNuevaTarea({...nuevaTarea, intensidad_rpe: e.target.value})} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="campo-rotulo">Objetivo Principal</label>
                <input type="text" className="campo" value={nuevaTarea.objetivo_principal} onChange={e => setNuevaTarea({...nuevaTarea, objetivo_principal: e.target.value})} />
              </div>
            </div>

            <div style={{ marginBottom: 15 }}>
              <label className="campo-rotulo">Reglas y Desarrollo</label>
              <textarea rows={3} className="campo" value={nuevaTarea.descripcion} onChange={e => setNuevaTarea({...nuevaTarea, descripcion: e.target.value})}/>
            </div>

            <button onClick={guardarNuevaTarea} disabled={isUploading} style={{ width: '100%', padding: 15, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: '1.1rem', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.7 : 1 }}>
              {isUploading ? '⏳ SUBIENDO VIDEO Y GUARDANDO...' : '💾 GUARDAR EN EL BANCO'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLE DE LA TAREA */}
      {tareaSeleccionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: 'var(--panel)', width: '100%', maxWidth: '900px', border: `2px solid ${getColoresCategoria(tareaSeleccionada.categoria_ejercicio).border}`, padding: '0', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px', background: getColoresCategoria(tareaSeleccionada.categoria_ejercicio).bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text)', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {tareaSeleccionada.categoria_ejercicio} • {tareaSeleccionada.fase_juego}{tareaSeleccionada.formato_tarea ? ` • ${tareaSeleccionada.formato_tarea}` : ''}
                </span>
                <h2 style={{ margin: '10px 0 0 0', color: 'var(--text)', fontSize: '1.8rem', textTransform: 'uppercase', fontWeight: '900' }}>
                  {tareaSeleccionada.titulo}
                </h2>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 'bold' }}>{tareaSeleccionada.objetivo_principal}</span>
              </div>
              <button onClick={() => setTareaSeleccionada(null)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: 'var(--text)', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', padding: '20px' }}>
              <div style={{ flex: '1 1 500px', padding: '20px', borderRight: '1px solid var(--border)' }}>
                
                <div style={{ background: '#000', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {tareaSeleccionada.video_mp4_url ? (
                    <video src={tareaSeleccionada.video_mp4_url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : tareaSeleccionada.categoria_ejercicio === 'Físico' && tareaSeleccionada.editor_data?.tipo === 'rutina_fisica' ? (
                    <RenderRutinaFisica data={tareaSeleccionada.editor_data} />
                  ) : tareaSeleccionada.editor_data?.frames?.length > 0 ? (
                    <ReproductorLoop editorData={tareaSeleccionada.editor_data} />
                  ) : tareaSeleccionada.url_grafico ? (
                    <img src={tareaSeleccionada.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: '4rem' }}>{getIconoTarea(tareaSeleccionada)}</span>
                  )}
                </div>
                {tareaSeleccionada.video_url && (
                  <div style={{ marginTop: '15px' }}>
                    <a href={tareaSeleccionada.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#2563eb', color: '#ffffff', textAlign: 'center', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                      ▶️ VER VIDEO DE REFERENCIA
                    </a>
                  </div>
                )}
              </div>

              <div style={{ flex: '1 1 300px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>DURACIÓN</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--text)' }}>{tareaSeleccionada.duracion_estimada}'</span>
                  </div>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>RPE (INTENSIDAD)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: tareaSeleccionada.intensidad_rpe > 7 ? '#ef4444' : '#eab308' }}>{tareaSeleccionada.intensidad_rpe}/10</span>
                  </div>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>CARGA (UC)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--accent)' }}>{(tareaSeleccionada.duracion_estimada || 0) * (tareaSeleccionada.intensidad_rpe || 0)}</span>
                  </div>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>JUGADORES</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text)' }}>{tareaSeleccionada.jugadores_involucrados}</span>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.85rem' }}>Reglas y Desarrollo:</h4>
                  <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                    {tareaSeleccionada.descripcion || "Sin descripción detallada."}
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => eliminarTarea(tareaSeleccionada.id)}
                    style={{ flex: 1, background: '#ef4444', border: 'none', color: 'var(--text)', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: '10px' }}
                  >
                    🗑️ ELIMINAR
                  </button>

                  <button
                    onClick={() => navigate(tareaSeleccionada.categoria_ejercicio === 'Físico' ? '/creador-fisico' : '/creador-tareas', { state: { editando: tareaSeleccionada } })}
                    style={{ flex: 2, background: 'var(--accent)', border: 'none', color: '#000', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: '10px' }}
                  >
                    ✏️ Editar {tareaSeleccionada.categoria_ejercicio === 'Físico' ? 'Rutina' : 'en Pizarra'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BancoTareas;