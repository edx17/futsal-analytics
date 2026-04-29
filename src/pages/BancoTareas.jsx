import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

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
  if (!data || !data.bloques) return <div style={{padding: '20px', color: '#888'}}>Sin detalles físicos cargados.</div>;

  return (
    <div style={{ padding: '15px', width: '100%', height: '100%', overflowY: 'auto', background: '#0a0a0a', boxSizing: 'border-box', textAlign: 'left' }}>
      <h4 style={{ color: '#f59e0b', marginTop: 0, marginBottom: '15px', textTransform: 'uppercase', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
        {data.sub_modo === 'gimnasio' ? '🏋️‍♂️ Circuito de Gimnasio / Fuerza' : '🏃‍♂️ Bloques de Acondicionamiento en Cancha'}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {data.bloques.map((b, i) => (
          <div key={b.id || i} style={{ background: '#111', border: '1px solid #222', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
            {data.sub_modo === 'gimnasio' ? (
              <>
                <div style={{ fontWeight: '900', color: '#fff', fontSize: '1.1rem' }}>{i + 1}. {b.nombre}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px' }}>
                  <div style={{ background: '#000', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: '#888' }}>SERIES</span><strong style={{ color: '#fff' }}>{b.series || '-'}</strong></div>
                  <div style={{ background: '#000', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: '#888' }}>REPS</span><strong style={{ color: '#fff' }}>{b.reps || '-'}</strong></div>
                  <div style={{ background: '#000', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: '#888' }}>INTENSIDAD</span><strong style={{ color: '#fff' }}>{b.rir || '-'}</strong></div>
                  <div style={{ background: '#000', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: '#888' }}>PAUSA</span><strong style={{ color: '#fff' }}>{b.pausa || '-'}</strong></div>
                </div>
                {b.notas && <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '10px', fontStyle: 'italic' }}>📌 {b.notas}</div>}
              </>
            ) : (
              <>
                <div style={{ fontWeight: '900', color: '#fff', fontSize: '1.1rem' }}>{b.nombreBloque}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
                  <div style={{ background: '#000', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: '#888' }}>Dist:</span> <strong style={{ color: '#fff' }}>{b.distancia}m</strong></div>
                  <div style={{ background: '#000', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: '#888' }}>Trabajo:</span> <strong style={{ color: '#fff' }}>{b.tiempoTrabajo}s</strong></div>
                  <div style={{ background: '#000', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: '#888' }}>Pausa:</span> <strong style={{ color: '#fff' }}>{b.micropausa}s</strong></div>
                  <div style={{ background: '#000', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: '#888' }}>Pasadas:</span> <strong style={{ color: '#fff' }}>{b.pasadas}</strong></div>
                  <div style={{ background: '#000', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: '#888' }}>Series:</span> <strong style={{ color: '#fff' }}>{b.series}</strong></div>
                  <div style={{ background: '#000', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: '#888' }}>Macro:</span> <strong style={{ color: '#fff' }}>{b.macropausa}m</strong></div>
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

  // Configuraciones y Constantes del Motor Nativo
  const frames = editorData?.frames || [];
  const pitchCfg = editorData?.cancha || { variant: '40x20', material: 'azul' };

  const PITCH_VARIANTS = {
    '40x20': { mW: 40, mH: 20 },
    '28x20': { mW: 28, mH: 20 },
    '20x20_mitad': { mW: 20, mH: 20 },
    '20x20_central': { mW: 20, mH: 20 },
  };

  // RESTAURADO: Lógica original de coordenadas y escalas para mantener fidelidad
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

  // 🛡️ REDIMENSIONAMIENTO BLINDADO CONTRA EL "INFINITE ZOOM"
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

  // Funciones de Renderizado Geométrico
  function mX(m, mW, L) { return L.px + (m/mW)*L.ppw; }
  function mY(m, mH, L) { return L.py + (m/mH)*L.pph; }
  function playerRadius(cW) { return cW * 0.021; } // Restablecido a usar BASE_W
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

  // Motor de Bucle y Render
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
          // Restablecido a BASE_W y baseH original
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
              // Restablecido a BASE_W y baseH original
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

const BancoTareas = () => {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroFase, setFiltroFase] = useState('Todas');
  
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    cargarTareas();
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

  const getColoresCategoria = (categoria) => {
    switch (categoria) {
      case 'Táctico': return { bg: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)', border: '#3b82f6', text: '#bfdbfe' };
      case 'Físico': return { bg: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)', border: '#ef4444', text: '#fecaca' };
      case 'Técnico': return { bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', border: '#10b981', text: '#a7f3d0' };
      case 'Cognitivo': return { bg: 'linear-gradient(135deg, #4c1d95 0%, #2e1065 100%)', border: '#8b5cf6', text: '#ddd6fe' };
      case 'ABP': return { bg: 'linear-gradient(135deg, #78350f 0%, #451a03 100%)', border: '#f59e0b', text: '#fde68a' };
      default: return { bg: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', border: '#4b5563', text: '#d1d5db' };
    }
  };

  const tareasFiltradas = tareas.filter(t => {
    const coincideBusqueda = t.titulo.toLowerCase().includes(busqueda.toLowerCase()) || (t.objetivo_principal || '').toLowerCase().includes(busqueda.toLowerCase());
    const coincideCategoria = filtroCategoria === 'Todas' || t.categoria_ejercicio === filtroCategoria;
    const coincideFase = filtroFase === 'Todas' || t.fase_juego === filtroFase;
    return coincideBusqueda && coincideCategoria && coincideFase;
  });

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
          width: '260px',
          height: '380px',
          padding: '15px',
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
            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{carga}</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: colores.text, textTransform: 'uppercase', letterSpacing: '1px' }}>Carga UC</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '900', color: colores.border, textTransform: 'uppercase', display: 'block' }}>{tarea.categoria_ejercicio}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text }}>{tarea.fase_juego}</span>
          </div>
        </div>

        <div style={{ flex: 1, background: '#000', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${colores.border}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {tarea.url_grafico ? (
            <img src={tarea.url_grafico} alt="Gráfico Tarea" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ color: '#555', fontSize: '3rem' }}>{getIconoTarea(tarea)}</span>
          )}
          <div style={{ position: 'absolute', bottom: '5px', right: '5px', background: 'rgba(0,0,0,0.8)', border: `1px solid ${colores.border}`, color: '#fff', fontSize: '0.6rem', fontWeight: '900', padding: '3px 6px', borderRadius: '4px' }}>
            {tarea.jugadores_involucrados || 'Grupal'}
          </div>
        </div>

        <div style={{ textAlign: 'center', margin: '12px 0', borderBottom: `1px solid ${colores.border}40`, paddingBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tarea.titulo}
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px', textAlign: 'center' }}>
          <div>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#fff' }}>{tarea.duracion_estimada}'</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>MINS</span>
          </div>
          <div style={{ borderLeft: `1px solid ${colores.border}40`, borderRight: `1px solid ${colores.border}40` }}>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#fff' }}>{tarea.intensidad_rpe}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>RPE</span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: '900', color: '#fff', marginTop: '3px' }}>{tarea.espacio?.replace('_', ' ')}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>ZONA</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '2.5rem' }}>🗃️</div>
            <h1 className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.5rem', margin: 0 }}>BANCO DE TAREAS</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Biblioteca de ejercicios y rutinas</p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 Buscar tarea..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={inputFiltro}
            />
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectFiltro}>
              <option value="Todas">Enfoque Principal</option>
              <option value="Táctico">Táctico</option>
              <option value="Técnico">Técnico</option>
              <option value="Físico">Físico / Gimnasio</option>
              <option value="ABP">ABP (Acción a Balón Parado)</option>
              <option value="Cognitivo">Cognitivo</option>
            </select>
            <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} style={selectFiltro}>
              <option value="Todas">Fase de Juego</option>
              <option value="Ataque Posicional">Ataque</option>
              <option value="Defensa Posicional">Defensa</option>
              <option value="Transición Ofensiva">Transiciones</option>
              <option value="Transición Defensiva">Situación Especial</option>
              <option value="Fuerza / Prevención">Fuerza / Prevención</option>
              <option value="Acondicionamiento Metabólico">Acondicionamiento</option>
            </select>
          </div>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--accent)' }}>Cargando el playbook... ⚽</div>
      ) : tareasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: 'rgba(255,255,255,0.02)', borderRadius: '15px', border: '1px dashed #333' }}>
          <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📋</div>
          <h3 style={{ color: '#fff', margin: 0 }}>No hay tareas aún.</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Creá tu primer ejercicio en el Creador para empezar a llenar tu biblioteca.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '25px', justifyContent: 'center' }}>
          {tareasFiltradas.map(tarea => (
            <CartaFUT key={tarea.id} tarea={tarea} />
          ))}
        </div>
      )}

      {/* MODAL DE DETALLE DE LA TAREA */}
      {tareaSeleccionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '900px', border: `2px solid ${getColoresCategoria(tareaSeleccionada.categoria_ejercicio).border}`, padding: '0', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px', background: getColoresCategoria(tareaSeleccionada.categoria_ejercicio).bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {tareaSeleccionada.categoria_ejercicio} • {tareaSeleccionada.fase_juego}
                </span>
                <h2 style={{ margin: '10px 0 0 0', color: '#fff', fontSize: '1.8rem', textTransform: 'uppercase', fontWeight: '900' }}>
                  {tareaSeleccionada.titulo}
                </h2>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 'bold' }}>{tareaSeleccionada.objetivo_principal}</span>
              </div>
              <button onClick={() => setTareaSeleccionada(null)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', padding: '20px' }}>
              <div style={{ flex: '1 1 500px', padding: '20px', borderRight: '1px solid #222' }}>
                
                {/* 🛡️ CONTENEDOR RELATIVO PARA ENCAPSULAR AL CANVAS ABSOLUTO */}
                <div style={{ background: '#000', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  
                  {tareaSeleccionada.categoria_ejercicio === 'Físico' && tareaSeleccionada.editor_data?.tipo === 'rutina_fisica' ? (
                    <RenderRutinaFisica data={tareaSeleccionada.editor_data} />
                  ) : tareaSeleccionada.editor_data?.frames?.length > 0 ? (
                    <ReproductorLoop editorData={tareaSeleccionada.editor_data} />
                  ) : tareaSeleccionada.url_grafico ? (
                    <img src={tareaSeleccionada.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: '#444', fontSize: '4rem' }}>{getIconoTarea(tareaSeleccionada)}</span>
                  )}

                </div>
                {tareaSeleccionada.video_url && (
                  <div style={{ marginTop: '15px' }}>
                    <a href={tareaSeleccionada.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#2563eb', color: '#fff', textAlign: 'center', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                      ▶️ VER VIDEO DE REFERENCIA
                    </a>
                  </div>
                )}
              </div>

              <div style={{ flex: '1 1 300px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>DURACIÓN</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff' }}>{tareaSeleccionada.duracion_estimada}'</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>RPE (INTENSIDAD)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: tareaSeleccionada.intensidad_rpe > 7 ? '#ef4444' : '#eab308' }}>{tareaSeleccionada.intensidad_rpe}/10</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>CARGA (UC)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--accent)' }}>{(tareaSeleccionada.duracion_estimada || 0) * (tareaSeleccionada.intensidad_rpe || 0)}</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>JUGADORES</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>{tareaSeleccionada.jugadores_involucrados}</span>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.85rem' }}>Reglas y Desarrollo:</h4>
                  <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333', color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                    {tareaSeleccionada.descripcion || "Sin descripción detallada."}
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => eliminarTarea(tareaSeleccionada.id)}
                    style={{ flex: 1, background: '#ef4444', border: 'none', color: '#fff', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: '10px' }}
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

const inputFiltro = { padding: '12px 15px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', minWidth: '250px', outline: 'none' };
const selectFiltro = { padding: '12px 15px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer' };

export default BancoTareas;