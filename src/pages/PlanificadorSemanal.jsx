import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

// IMPORTAMOS AUTH PARA EL GRAN FILTRO
import { useAuth } from '../context/AuthContext';

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
// COMPONENTE INTERNO: Reproductor Automático
// =======================================================
const ReproductorLoop = ({ editorData }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [cvSize, setCvSize] = useState({ w: 800, h: 500 });
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

  // RESTAURADA: Esta lógica espeja EXACTAMENTE cómo CreadorTareas guarda las posiciones
  const getDimensionesLogicas = (variant) => {
    switch (variant) {
      case '20x20_mitad': case '20x20_central': return { w: 500, h: 500 };
      case '28x20': return { w: 700, h: 500 };
      case '40x20': default: return { w: 900, h: 500 };
    }
  };

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

  // Lógica de Redimensionamiento (CORREGIDA Y ADAPTADA A DIMENSIONES LÓGICAS)
  useEffect(() => {
    function handleResize() {
      if (!containerRef.current) return;
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      if (cw === 0 || ch === 0) return;

      const variant = pitchCfg.variant || pitchCfg.tamaño || '40x20';
      const logicalSize = getDimensionesLogicas(variant);
      const ratio = logicalSize.w / logicalSize.h;
      
      let w = Math.min(cw, ch * ratio);
      let h = w / ratio;
      
      if (h > ch) { h = ch; w = h * ratio; }
      setCvSize({ w, h });
    }
    
    handleResize();
    const observer = new ResizeObserver(() => handleResize());
    if (containerRef.current) observer.observe(containerRef.current);
    
    return () => {
      if (containerRef.current) observer.unobserve(containerRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [pitchCfg.variant, pitchCfg.tamaño]);

  // Funciones de Renderizado Geométrico
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

  // Motor de Bucle y Render
  useEffect(() => {
    isMountedRef.current = true;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');

    const DURATION = 800;
    const PAUSE = 500;
    let animId;

    // Calcular la dimensión lógica nativa de este tipo de cancha
    const variant = pitchCfg.variant || pitchCfg.tamaño || '40x20';
    const logicalSize = getDimensionesLogicas(variant);
    const { w: L_W, h: L_H } = logicalSize;

    const playLoop = async () => {
      while (isMountedRef.current) {
        if (frames.length < 2) {
          const f0 = frames[0] || {};
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cvSize.w, cvSize.h);
          ctx.scale(cvSize.w / L_W, cvSize.h / L_H);
          drawPitch(ctx, L_W, L_H, pitchCfg);
          drawElements(ctx, f0.elements || f0.elementos || [], f0.arrows || f0.lineas || [], L_W);
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
              
              // Limpiar y dibujar frame interpolado escalado perfectamente
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.clearRect(0, 0, cvSize.w, cvSize.h);
              ctx.scale(cvSize.w / L_W, cvSize.h / L_H);
              
              drawPitch(ctx, L_W, L_H, pitchCfg);
              drawElements(ctx, interpolated, arrsA, L_W);

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
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0a0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <canvas 
        ref={canvasRef} 
        width={cvSize.w} 
        height={cvSize.h} 
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

const PlanificadorSemanal = () => {
  const navigate = useNavigate(); 
  const { perfil } = useAuth(); // <-- GRAN FILTRO AUTH

  // --- GRAN FILTRO ---
  const misCategorias = perfil?.categorias_asignadas || [];

  // EXTRAER CATEGORÍAS PARA EL SUPERUSER
  const [categoriasExtraidas, setCategoriasExtraidas] = useState([]);
  useEffect(() => {
    const fetchCategorias = async () => {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      if (club_id === 'club_default') return;
      const { data } = await supabase.from('jugadores').select('categoria').eq('club_id', club_id);
      if (data) {
        const unicas = [...new Set(data.map(j => j.categoria).filter(Boolean))].sort();
        setCategoriasExtraidas(unicas);
      }
    };
    fetchCategorias();
  }, []);

  const categoriasMostrar = misCategorias.length > 0 ? misCategorias : categoriasExtraidas;
  const [filtroCategoria, setFiltroCategoria] = useState(misCategorias.length === 1 ? misCategorias[0] : 'Todas');

  const [fechaReferencia, setFechaReferencia] = useState(new Date());
  const [modoVista, setModoVista] = useState('semanal'); 
  const [diasCalendario, setDiasCalendario] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [partidosOficiales, setPartidosOficiales] = useState([]);
  const [tareasBanco, setTareasBanco] = useState([]);
  const [cargando, setCargando] = useState(true);

  // --- RESPONSIVE STATE ---
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modal State
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoModal, setModoModal] = useState('crear'); 
  const [tareaSeleccionadaDetalle, setTareaSeleccionadaDetalle] = useState(null); 
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [busquedaTarea, setBusquedaTarea] = useState('');
  
  const { showToast } = useToast(); 

  const [nuevaSesion, setNuevaSesion] = useState({
    id: null,
    tipo_sesion: 'Entrenamiento',
    objetivo: '',
    nivel_carga: 'Media', 
    categoria_equipo: misCategorias.length > 0 ? misCategorias[0] : 'Primera',
    tareas_ids: [],
    comentarios: '',
    bloque_fisico: false,
    enfoque_fisico: 'Activación / Core / Prevención',
    duracion_fisico: ''
  });

  const nivelesCarga = {
    'Baja': { color: '#10b981', label: 'Baja' },
    'Media-Baja': { color: '#84cc16', label: 'Med-Baja' },
    'Media': { color: '#eab308', label: 'Media' },
    'Media-Alta': { color: '#f97316', label: 'Med-Alta' },
    'Alta': { color: '#ef4444', label: 'Alta' }
  };

  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const diasNombres = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

  // 1. Motor del Calendario
  useEffect(() => {
    const calcularCalendario = () => {
      const year = fechaReferencia.getFullYear();
      const month = fechaReferencia.getMonth();
      const date = fechaReferencia.getDate();
      
      let grid = [];

      if (modoVista === 'semanal') {
        const day = fechaReferencia.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const lunes = new Date(year, month, date + diffToMonday);
        
        for (let i = 0; i < 7; i++) {
          const dia = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
          grid.push({
            fechaStr: `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`,
            diaNombre: diasNombres[dia.getDay()],
            numero: dia.getDate(),
            isHoy: dia.toDateString() === new Date().toDateString(),
            isMesActual: true
          });
        }
      } else {
        const primerDiaDelMes = new Date(year, month, 1);
        const day = primerDiaDelMes.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const startGridDate = new Date(year, month, 1 + diffToMonday);

        for (let i = 0; i < 42; i++) {
          const dia = new Date(startGridDate.getFullYear(), startGridDate.getMonth(), startGridDate.getDate() + i);
          grid.push({
            fechaStr: `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`,
            diaNombre: diasNombres[dia.getDay()],
            numero: dia.getDate(),
            isHoy: dia.toDateString() === new Date().toDateString(),
            isMesActual: dia.getMonth() === month
          });
        }
      }
      setDiasCalendario(grid);
    };
    
    calcularCalendario();
  }, [fechaReferencia, modoVista]);

  // 2. Traer Datos
  useEffect(() => {
    if (diasCalendario.length > 0) {
      cargarDatos();
    }
  }, [diasCalendario, filtroCategoria, misCategorias.length]);

  // 3. RECUPERAR SESIÓN EN BORRADOR
  useEffect(() => {
    const borradorStr = sessionStorage.getItem('borradorSesion');
    if (borradorStr && diasCalendario.length > 0) {
      try {
        const borrador = JSON.parse(borradorStr);
        const diaTarget = diasCalendario.find(d => d.fechaStr === borrador.fechaStr);
        if (diaTarget) {
          abrirModal(diaTarget, borrador, true); 
          sessionStorage.removeItem('borradorSesion');
        }
      } catch (e) {
        console.error("Error leyendo borrador", e);
      }
    }
  }, [diasCalendario]);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      const inicio = diasCalendario[0].fechaStr;
      const fin = diasCalendario[diasCalendario.length - 1].fechaStr;

      let querySesiones = supabase.from('sesiones').select('*').eq('club_id', club_id).gte('fecha', inicio).lte('fecha', fin);
      
      if (filtroCategoria !== 'Todas') {
        querySesiones = querySesiones.eq('categoria_equipo', filtroCategoria);
      } else if (misCategorias.length > 0) {
        querySesiones = querySesiones.in('categoria_equipo', misCategorias); 
      }

      const { data: dataSesiones, error: errSesiones } = await querySesiones;
      if (errSesiones) throw errSesiones;

      let queryPartidos = supabase.from('partidos').select('*').eq('club_id', club_id).gte('fecha', inicio).lte('fecha', fin);
      
      if (filtroCategoria !== 'Todas') {
        queryPartidos = queryPartidos.eq('categoria', filtroCategoria);
      } else if (misCategorias.length > 0) {
        queryPartidos = queryPartidos.in('categoria', misCategorias);
      }

      const { data: dataPartidos, error: errPartidos } = await queryPartidos;
      if (errPartidos) throw errPartidos;
      
      const { data: dataTareas, error: errTareas } = await supabase
        .from('tareas')
        .select('id, titulo, descripcion, categoria_ejercicio, duracion_estimada, intensidad_rpe, espacio, jugadores_involucrados, url_grafico, editor_data, video_url, fase_juego, objetivo_principal')
        .eq('club_id', club_id)
        .order('created_at', { ascending: false });
        
      if (errTareas) throw errTareas;

      setSesiones(dataSesiones || []);
      setPartidosOficiales(dataPartidos || []); 
      setTareasBanco(dataTareas || []);

    } catch (error) {
      console.error("Error cargando datos:", error.message);
    } finally {
      setCargando(false);
    }
  };

  const navegarTiempo = (direccion) => {
    const nuevaFecha = new Date(fechaReferencia);
    if (modoVista === 'semanal') {
      nuevaFecha.setDate(nuevaFecha.getDate() + (direccion * 7));
    } else {
      nuevaFecha.setMonth(nuevaFecha.getMonth() + direccion);
    }
    setFechaReferencia(nuevaFecha);
  };

  const abrirModal = (dia, sesionExistente = null, forzarEdicion = false) => {
    setDiaSeleccionado(dia);
    setBusquedaTarea(''); 
    setTareaSeleccionadaDetalle(null);
    
    if (sesionExistente) {
      setModoModal(forzarEdicion ? 'editar' : 'ver');
      setNuevaSesion({
        id: sesionExistente.id || null,
        tipo_sesion: sesionExistente.tipo_sesion,
        objetivo: sesionExistente.objetivo || '',
        nivel_carga: sesionExistente.nivel_carga || 'Media',
        categoria_equipo: sesionExistente.categoria_equipo || (categoriasMostrar.length > 0 ? categoriasMostrar[0] : 'Primera'),
        tareas_ids: sesionExistente.tareas_ids || [],
        comentarios: sesionExistente.comentarios || '',
        bloque_fisico: sesionExistente.bloque_fisico || false,
        enfoque_fisico: sesionExistente.enfoque_fisico || 'Activación / Core / Prevención',
        duracion_fisico: sesionExistente.duracion_fisico || ''
      });
    } else {
      setModoModal('crear');
      setNuevaSesion({ 
        id: null,
        tipo_sesion: 'Entrenamiento', 
        objetivo: '', 
        nivel_carga: 'Media',
        categoria_equipo: filtroCategoria === 'Todas' ? (categoriasMostrar.length > 0 ? categoriasMostrar[0] : 'Primera') : filtroCategoria,
        tareas_ids: [],
        comentarios: '',
        bloque_fisico: false,
        enfoque_fisico: 'Activación / Core / Prevención',
        duracion_fisico: ''
      });
    }
    setMostrarModal(true);
  };

  const toggleTarea = (tareaId) => {
    setNuevaSesion(prev => {
      const ids = prev.tareas_ids || [];
      const nuevasTareas = ids.includes(tareaId) ? ids.filter(id => id !== tareaId) : [...ids, tareaId];
      return { ...prev, tareas_ids: nuevasTareas };
    });
  };

  const irACreadorYGuardarBorrador = () => {
    const borrador = { ...nuevaSesion, fechaStr: diaSeleccionado.fechaStr };
    sessionStorage.setItem('borradorSesion', JSON.stringify(borrador));
    navigate('/creador-tareas'); 
  };

  const guardarSesion = async () => {
    if (!nuevaSesion.categoria_equipo) {
        showToast("Por favor, ingresá una categoría.", "warning");
        return;
    }

    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      const payload = {
        club_id,
        fecha: diaSeleccionado.fechaStr,
        tipo_sesion: nuevaSesion.tipo_sesion,
        objetivo: nuevaSesion.objetivo,
        categoria_equipo: nuevaSesion.categoria_equipo,
        nivel_carga: nuevaSesion.nivel_carga,
        tareas_ids: nuevaSesion.tareas_ids,
        comentarios: nuevaSesion.comentarios,
        bloque_fisico: nuevaSesion.bloque_fisico,
        enfoque_fisico: nuevaSesion.bloque_fisico ? nuevaSesion.enfoque_fisico : null,
        duracion_fisico: nuevaSesion.bloque_fisico ? Number(nuevaSesion.duracion_fisico) : null,
      };

      if (nuevaSesion.id) {
        const { error } = await supabase.from('sesiones').update(payload).eq('id', nuevaSesion.id);
        if (error) throw error;
        showToast('¡Sesión actualizada correctamente!', 'success');
      } else {
        const { error } = await supabase.from('sesiones').insert([payload]);
        if (error) throw error;
        showToast('¡Sesión planificada con éxito!', 'success');
      }

      setMostrarModal(false);
      cargarDatos();
    } catch (error) {
      showToast("Error al guardar la sesión: " + error.message, "error");
    }
  };

  const eliminarSesion = async (id, e) => {
    if(e) e.stopPropagation(); 
    if (!window.confirm("¿Eliminar esta sesión del calendario?")) return;
    try {
      const { error } = await supabase.from('sesiones').delete().eq('id', id);
      if (error) throw error;
      setSesiones(sesiones.filter(s => s.id !== id));
      showToast("Sesión eliminada", "info");
      
      if (mostrarModal && nuevaSesion.id === id) {
        setMostrarModal(false);
      }
    } catch (error) {
      showToast("Error al eliminar: " + error.message, "error");
    }
  };

  const tareasFiltradas = tareasBanco.filter(t => {
    const termino = busquedaTarea.toLowerCase();
    return t.titulo.toLowerCase().includes(termino) || t.categoria_ejercicio.toLowerCase().includes(termino);
  }).sort((a, b) => {
    const aSel = nuevaSesion.tareas_ids?.includes(a.id);
    const bSel = nuevaSesion.tareas_ids?.includes(b.id);
    if (aSel && !bSel) return -1;
    if (!aSel && bSel) return 1;
    return 0;
  });

  const tiempoEstimadoTotal = (nuevaSesion.tareas_ids || []).reduce((acc, id) => {
    const t = tareasBanco.find(tb => tb.id === id);
    return acc + (t && t.duracion_estimada ? Number(t.duracion_estimada) : 0);
  }, 0);

  const tiempoFisico = nuevaSesion.bloque_fisico ? Number(nuevaSesion.duracion_fisico || 0) : 0;
  const tiempoTotalSesion = tiempoEstimadoTotal + tiempoFisico;

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1400px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      {/* HEADER CONTROLES */}
      <div className="bento-card" style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'stretch' : 'center', marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)', gap: '15px', padding: esMovil ? '15px' : '20px' }}>
        <div>
          <h1 className="stat-label" style={{ color: 'var(--accent)', fontSize: esMovil ? '1.2rem' : '1.5rem', margin: 0 }}>PLANIFICADOR DE SESIONES</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Micro y Macrociclos de tu plantel.</p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', gap: '10px', alignItems: esMovil ? 'stretch' : 'center', width: esMovil ? '100%' : 'auto' }}>
          
          <div style={{ display: 'flex', background: '#000', padding: '4px', borderRadius: '8px', border: '1px solid #333' }}>
            <button onClick={() => setModoVista('semanal')} style={{ ...toggleBtn, background: modoVista === 'semanal' ? 'var(--accent)' : 'transparent', color: modoVista === 'semanal' ? '#000' : 'var(--text-dim)' }}>Semana</button>
            <button onClick={() => setModoVista('mensual')} style={{ ...toggleBtn, background: modoVista === 'mensual' ? 'var(--accent)' : 'transparent', color: modoVista === 'mensual' ? '#000' : 'var(--text-dim)' }}>Mes</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase', display: esMovil ? 'none' : 'block' }}>Categoría:</span>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ padding: '10px', background: '#111', color: '#fff', border: '1px solid var(--accent)', borderRadius: '6px', outline: 'none', fontWeight: 'bold', flex: esMovil ? 1 : 'none', minHeight: '40px' }}>
              {(misCategorias.length !== 1) && <option value="Todas">{misCategorias.length > 1 ? "TODAS MIS CATEGORÍAS" : "TODAS LAS CATEGORÍAS"}</option>}
              {categoriasMostrar.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px', background: '#000', padding: '5px', borderRadius: '8px', border: '1px solid #333' }}>
            <button onClick={() => navegarTiempo(-1)} style={navBtn}>⬅</button>
            <span style={{ fontWeight: '900', color: '#fff', fontSize: esMovil ? '0.8rem' : '0.9rem', minWidth: modoVista === 'semanal' && !esMovil ? '180px' : 'auto', textAlign: 'center', textTransform: 'uppercase', flex: esMovil ? 1 : 'none' }}>
              {diasCalendario.length > 0 && modoVista === 'semanal' && `Semana ${diasCalendario[0].numero}/${String(diasCalendario[0].fechaStr).split('-')[1]} al ${diasCalendario[6].numero}/${String(diasCalendario[6].fechaStr).split('-')[1]}`}
              {diasCalendario.length > 0 && modoVista === 'mensual' && `${mesesNombres[fechaReferencia.getMonth()]} ${fechaReferencia.getFullYear()}`}
            </span>
            <button onClick={() => navegarTiempo(1)} style={navBtn}>➡</button>
            <button onClick={() => setFechaReferencia(new Date())} style={{...navBtn, fontSize: '0.7rem', width: 'auto', padding: '0 10px', background: '#333'}}>HOY</button>
          </div>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--accent)' }}>Cargando agenda... ⏳</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* HEADER DÍAS (Solo en modo mensual) */}
          {modoVista === 'mensual' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: esMovil ? '2px' : '10px', textAlign: 'center' }}>
              {diasNombres.map((d, i) => (
                <div key={i} style={{ fontSize: esMovil ? '0.65rem' : '0.8rem', fontWeight: '900', color: 'var(--text-dim)' }}>{esMovil ? d.charAt(0) : d}</div>
              ))}
            </div>
          )}

          {/* GRILLA PRINCIPAL */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: modoVista === 'mensual' ? 'repeat(7, 1fr)' : (esMovil ? '1fr' : 'repeat(7, 1fr)'), 
            gap: modoVista === 'semanal' ? (esMovil ? '15px' : '10px') : (esMovil ? '2px' : '5px'), 
            alignItems: 'stretch' 
          }}>
            {diasCalendario.map((dia, idx) => {
              const sesionesDia = sesiones.filter(s => s.fecha === dia.fechaStr);
              const partidosDia = partidosOficiales.filter(p => p.fecha === dia.fechaStr);
              const opacidadMes = dia.isMesActual ? 1 : 0.4;

              if (modoVista === 'semanal') {
                return (
                  <div key={idx} style={{ background: dia.isHoy ? '#111827' : '#0a0a0a', border: dia.isHoy ? '2px solid var(--accent)' : '1px solid #222', borderRadius: '12px', display: 'flex', flexDirection: esMovil ? 'row' : 'column', overflow: 'hidden', minHeight: esMovil ? 'auto' : '400px' }}>
                    
                    {/* CABECERA DEL DÍA */}
                    <div style={{ background: dia.isHoy ? 'var(--accent)' : '#111', padding: '10px', textAlign: 'center', borderBottom: esMovil ? 'none' : '1px solid #222', borderRight: esMovil ? '1px solid #222' : 'none', minWidth: esMovil ? '70px' : 'auto', maxWidth: esMovil ? '70px' : 'auto', display: 'flex', flexDirection: 'column', justifyContent: esMovil ? 'flex-start' : 'center', flexShrink: 0 }}>
                      <span style={{ display: 'block', fontSize: esMovil ? '0.8rem' : '0.7rem', fontWeight: '900', color: dia.isHoy ? '#000' : 'var(--text-dim)' }}>{dia.diaNombre}</span>
                      <span style={{ fontSize: '1.8rem', fontWeight: '900', color: dia.isHoy ? '#000' : '#fff' }}>{dia.numero}</span>
                    </div>

                    {/* CONTENIDO DEL DÍA */}
                    <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
                      {partidosDia.map(partido => (
                        <div key={`partido-${partido.id}`} style={{ background: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6', padding: '10px', borderRadius: '6px', position: 'relative' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#3b82f6', marginBottom: '2px' }}>PARTIDO OFICIAL</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff', marginBottom: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {partido.rival?.toUpperCase()}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                            {partido.competicion} - {partido.condicion}
                          </div>
                        </div>
                      ))}

                      {sesionesDia.map(sesion => {
                        const colorNivel = nivelesCarga[sesion.nivel_carga]?.color || '#888';
                        const tareasIds = sesion.tareas_ids || [];
                        
                        return (
                          <div 
                            key={sesion.id} 
                            onClick={() => abrirModal(dia, sesion)} 
                            style={{ background: '#000', borderLeft: `4px solid ${colorNivel}`, padding: '10px', borderRadius: '6px', position: 'relative', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }}
                          >
                            <button onClick={(e) => eliminarSesion(sesion.id, e)} style={{ position: 'absolute', top: '5px', right: '5px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: '5px', zIndex: 2 }}>✖</button>
                            <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#fff', marginBottom: '2px', paddingRight: '25px' }}>{sesion.tipo_sesion.toUpperCase()}</div>
                            <div style={{ fontSize: '0.65rem', color: colorNivel, fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>CARGA: {sesion.nivel_carga || 'MEDIA'}</div>
                            
                            {sesion.bloque_fisico && (
                              <div style={{ background: '#f59e0b20', border: '1px solid #f59e0b50', padding: '3px 6px', borderRadius: '4px', fontSize: '0.6rem', color: '#fcd34d', fontWeight: 'bold', display: 'inline-block', marginBottom: '8px', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                🏃‍♂️ {sesion.duracion_fisico}' - {sesion.enfoque_fisico?.split('/')[0]}
                              </div>
                            )}

                            {sesion.objetivo && <div style={{ fontSize: '0.75rem', color: '#aaa', fontStyle: 'italic', marginBottom: '8px', lineHeight: '1.2' }}>"{sesion.objetivo}"</div>}

                            {tareasIds.length > 0 && !esMovil && (
                              <div style={{ borderTop: '1px solid #222', paddingTop: '8px', marginTop: '8px' }}>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>TAREAS:</span>
                                <ul style={{ margin: 0, paddingLeft: '15px', color: '#fff', fontSize: '0.7rem', lineHeight: '1.4' }}>
                                  {tareasIds.map(id => {
                                    const t = tareasBanco.find(tb => tb.id === id);
                                    return t ? <li key={id}>{getIconoTarea(t)} {t.titulo}</li> : null;
                                  })}
                                </ul>
                              </div>
                            )}
                            {tareasIds.length > 0 && esMovil && (
                               <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '5px', borderTop: '1px solid #222', paddingTop: '5px' }}>📋 {tareasIds.length} tareas asignadas</div>
                            )}
                          </div>
                        );
                      })}

                      <button onClick={() => abrirModal(dia)} style={{ marginTop: 'auto', background: 'transparent', border: '1px dashed #444', color: 'var(--text-dim)', padding: '12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s', width: '100%', minHeight: '44px' }}>
                        + AGREGAR
                      </button>
                    </div>
                  </div>
                );
              } else {
                // VISTA MENSUAL
                return (
                  <div key={idx} onClick={() => abrirModal(dia)} style={{ background: dia.isHoy ? '#111827' : '#0a0a0a', border: dia.isHoy ? '1px solid var(--accent)' : '1px solid #222', borderRadius: esMovil ? '4px' : '8px', display: 'flex', flexDirection: 'column', minHeight: esMovil ? '60px' : '100px', padding: esMovil ? '2px' : '5px', opacity: opacidadMes, cursor: 'pointer', overflow: 'hidden' }} className="mes-card">
                    <div style={{ textAlign: 'right', fontSize: esMovil ? '0.7rem' : '0.8rem', fontWeight: '900', color: dia.isHoy ? 'var(--accent)' : (dia.isMesActual ? '#fff' : '#666'), marginBottom: '2px' }}>
                      {dia.numero}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {partidosDia.map(partido => (
                        esMovil ? (
                          <div key={`partido-${partido.id}`} style={{ width: '100%', height: '6px', background: '#3b82f6', borderRadius: '2px', marginBottom: '2px' }} title={`Partido vs ${partido.rival}`} />
                        ) : (
                          <div key={`partido-${partido.id}`} style={{ background: 'rgba(59, 130, 246, 0.2)', borderLeft: '2px solid #3b82f6', padding: '4px', borderRadius: '3px', fontSize: '0.6rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ fontWeight: 'bold', color: '#93c5fd' }}>vs {partido.rival?.substring(0,4).toUpperCase()}</span>
                          </div>
                        )
                      ))}

                      {sesionesDia.map(sesion => {
                        const colorNivel = nivelesCarga[sesion.nivel_carga]?.color || '#888';
                        return esMovil ? (
                          <div key={sesion.id} style={{ width: '100%', height: '6px', background: colorNivel, borderRadius: '2px' }} title={sesion.tipo_sesion} />
                        ) : (
                          <div 
                            key={sesion.id} 
                            onClick={(e) => { e.stopPropagation(); abrirModal(dia, sesion); }}
                            style={{ background: `${colorNivel}20`, borderLeft: `2px solid ${colorNivel}`, padding: '4px', borderRadius: '3px', fontSize: '0.6rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            title={sesion.objetivo || 'Ver Sesión'}
                          >
                            <span style={{ fontWeight: 'bold' }}>
                              {sesion.tipo_sesion.substring(0,3).toUpperCase()} {sesion.bloque_fisico && '🏃‍♂️'}
                            </span>
                            {sesion.tareas_ids?.length > 0 && <span style={{ color: colorNivel }}>{sesion.tareas_ids.length}T</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
            })}
          </div>
          <style>{`.mes-card:hover { border-color: #555 !important; background: #111 !important; }`}</style>
        </div>
      )}

      {/* MODAL PRINCIPAL: DETALLES / EDICIÓN DE SESIÓN */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: esMovil ? '10px' : '20px' }}>
          
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '950px', border: '2px solid var(--accent)', maxHeight: esMovil ? '90vh' : '95vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', position: 'relative', padding: esMovil ? '15px' : '30px' }}>
            
            {/* HEADER DEL MODAL PRINCIPAL */}
            <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px', alignItems: esMovil ? 'flex-start' : 'center', gap: esMovil ? '15px' : '0', position: 'relative' }}>
              <div style={{ paddingRight: esMovil ? '40px' : '0' }}>
                <h3 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase', fontSize: esMovil ? '1.1rem' : '1.3rem' }}>
                  {modoModal === 'ver' ? '👁️ Detalles de la Sesión' : (nuevaSesion.id ? '✏️ Editar Sesión' : '➕ Planificar Nueva Sesión')} <br/>
                  <span style={{color: '#fff', fontSize: '0.85rem'}}>{diaSeleccionado?.diaNombre} {diaSeleccionado?.numero}</span>
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '10px', width: esMovil ? '100%' : 'auto', justifyContent: esMovil ? 'space-between' : 'flex-end', alignItems: 'center' }}>
                <div style={{display: 'flex', gap: '10px'}}>
                  {modoModal === 'ver' && (
                    <button onClick={() => setModoModal('editar')} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', padding: '8px 15px', borderRadius: '4px', fontWeight: 'bold' }}>
                      ✏️ EDICIÓN
                    </button>
                  )}
                  {modoModal === 'editar' && (
                    <button onClick={(e) => eliminarSesion(nuevaSesion.id, e)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: '8px 15px', borderRadius: '4px', fontWeight: 'bold' }}>
                      🗑️ ELIMINAR
                    </button>
                  )}
                </div>
                <button onClick={() => setMostrarModal(false)} style={{ background: '#222', border: '1px solid #444', color: '#fff', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', position: esMovil ? 'absolute' : 'relative', top: esMovil ? '0' : 'auto', right: esMovil ? '0' : 'auto' }}>✖</button>
              </div>
            </div>

            {/* CONTENIDO DEL MODAL: CONDICIONAL SEGÚN EL MODO */}
            {modoModal === 'ver' ? (
              // ==========================================
              // MODO VISTA (SÓLO LECTURA)
              // ==========================================
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', animation: 'fadeIn 0.2s' }}>
                
                {/* COLUMNA IZQUIERDA: INFO GENERAL */}
                <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0 }}>
                  <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                    <h4 style={{ color: 'var(--accent)', margin: '0 0 10px 0', fontSize: '0.8rem', textTransform: 'uppercase' }}>Datos de la Sesión</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
                      <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Categoría:</span> <strong style={{color: '#fff'}}>{nuevaSesion.categoria_equipo}</strong></div>
                      <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Tipo:</span> <strong style={{color: '#fff'}}>{nuevaSesion.tipo_sesion}</strong></div>
                      <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Carga General:</span> <strong style={{color: nivelesCarga[nuevaSesion.nivel_carga]?.color || '#fff'}}>{nuevaSesion.nivel_carga}</strong></div>
                    </div>
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #222' }}>
                      <span style={{color: '#888', display: 'block', marginBottom: '5px', fontSize: '0.75rem'}}>Objetivo Principal:</span>
                      <strong style={{color: '#fff', fontSize: '0.95rem'}}>{nuevaSesion.objetivo || 'Sin definir'}</strong>
                    </div>
                  </div>
                  
                  {nuevaSesion.bloque_fisico && (
                    <div style={{ background: '#f59e0b20', padding: '15px', borderRadius: '8px', border: '1px solid #f59e0b50' }}>
                      <h4 style={{ color: '#f59e0b', margin: '0 0 10px 0', fontSize: '0.8rem', textTransform: 'uppercase' }}>🏃‍♂️ Bloque de Preparación Física</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#fcd34d'}}>Enfoque:</span> <strong style={{color: '#fff', textAlign: 'right'}}>{nuevaSesion.enfoque_fisico}</strong></div>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#fcd34d'}}>Duración:</span> <strong style={{color: '#fff'}}>{nuevaSesion.duracion_fisico} min</strong></div>
                      </div>
                    </div>
                  )}

                  {nuevaSesion.comentarios && (
                    <div style={{ background: '#0a0a0a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                      <h4 style={{ color: '#aaa', margin: '0 0 10px 0', fontSize: '0.8rem', textTransform: 'uppercase' }}>Comentarios / Novedades</h4>
                      <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-wrap' }}>{nuevaSesion.comentarios}</p>
                    </div>
                  )}
                </div>

                {/* COLUMNA DERECHA: TAREAS (VISOR) */}
                <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TAREAS ASIGNADAS</span>
                      <span style={{ fontSize: '1.4rem', color: 'var(--accent)', fontWeight: '900' }}>{nuevaSesion.tareas_ids?.length || 0}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TIEMPO TOTAL</span>
                      <span style={{ fontSize: '1.4rem', color: '#fff', fontWeight: '900' }}>⏱️ {tiempoTotalSesion}'</span>
                    </div>
                  </div>

                  <div style={{ background: '#000', border: '1px solid #333', borderRadius: '8px', flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(!nuevaSesion.tareas_ids || nuevaSesion.tareas_ids.length === 0) && (
                      <span style={{ color: '#555', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No hay tareas asignadas.</span>
                    )}
                    
                    {nuevaSesion.tareas_ids?.map(id => {
                      const t = tareasBanco.find(tb => tb.id === id);
                      if (!t) return null;
                      return (
                        <div 
                          key={t.id} 
                          onClick={() => setTareaSeleccionadaDetalle(t)} 
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', background: '#111', border: '1px solid #333' }}
                        >
                          <div style={{ width: '55px', height: '42px', borderRadius: '4px', background: '#000', border: '1px solid #222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {t.url_grafico ? <img src={t.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem', color: '#444' }}>{getIconoTarea(t)}</span>}
                          </div>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <span style={{ display: 'block', fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 'bold', textTransform: 'uppercase' }}>{t.categoria_ejercicio}</span>
                              <span style={{ fontSize: '0.65rem', color: '#aaa' }}>• ⏱️ {t.duracion_estimada}'</span>
                            </div>
                          </div>
                          <div style={{ color: 'var(--accent)', fontSize: '1.2rem', paddingRight: '5px' }}>👁️</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            ) : (

              // ==========================================
              // MODO CREACIÓN / EDICIÓN
              // ==========================================
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                  {/* COLUMNA IZQUIERDA: DATOS GENERALES Y PF */}
                  <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '12px', flexDirection: esMovil ? 'column' : 'row' }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Categoría</label>
                        <select value={nuevaSesion.categoria_equipo} onChange={e => setNuevaSesion({...nuevaSesion, categoria_equipo: e.target.value})} style={inputStyle}>
                          {categoriasMostrar.length === 0 && <option value="Primera">Primera</option>}
                          {categoriasMostrar.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Tipo de Sesión</label>
                        <select value={nuevaSesion.tipo_sesion} onChange={e => setNuevaSesion({...nuevaSesion, tipo_sesion: e.target.value})} style={inputStyle}>
                          <option value="Entrenamiento">Entrenamiento</option>
                          <option value="Gimnasio">Gimnasio</option>
                          <option value="Amistoso">Amistoso (No Oficial)</option>
                          <option value="Descanso">Sesión Especial</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Objetivo Principal Táctico/Técnico</label>
                      <input type="text" value={nuevaSesion.objetivo} onChange={e => setNuevaSesion({...nuevaSesion, objetivo: e.target.value})} style={inputStyle} placeholder="Ej: Transiciones Ofensivas y Superioridad 3v2" />
                    </div>

                    <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                      <label style={labelStyle}>Carga Subjetiva Esperada (RPE)</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                        {Object.entries(nivelesCarga).map(([key, val]) => (
                          <button
                            key={key}
                            onClick={() => setNuevaSesion({...nuevaSesion, nivel_carga: key})}
                            style={{
                              flex: '1 1 auto', padding: '10px 5px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase', minHeight: '40px',
                              background: nuevaSesion.nivel_carga === key ? val.color : '#222',
                              color: nuevaSesion.nivel_carga === key ? '#000' : '#888',
                              transition: '0.2s'
                            }}
                          >
                            {val.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* SECCIÓN PREPARADOR FÍSICO */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: nuevaSesion.bloque_fisico ? '15px' : '0' }}>
                        <label style={{ ...labelStyle, color: '#f59e0b', margin: 0, fontSize: '0.75rem' }}>🏃‍♂️ BLOQUE FÍSICO</label>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '5px' }}>
                          <input 
                            type="checkbox" 
                            checked={nuevaSesion.bloque_fisico} 
                            onChange={(e) => setNuevaSesion({...nuevaSesion, bloque_fisico: e.target.checked})} 
                            style={{ marginRight: '8px', accentColor: '#f59e0b', width: '18px', height: '18px' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 'bold' }}>Incluir</span>
                        </label>
                      </div>

                      {nuevaSesion.bloque_fisico && (
                        <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', gap: '12px', animation: 'fadeIn 0.3s' }}>
                          <div style={{ flex: 2 }}>
                            <label style={{...labelStyle, color: '#fcd34d'}}>Enfoque Fisiológico / Motor</label>
                            <select value={nuevaSesion.enfoque_fisico} onChange={e => setNuevaSesion({...nuevaSesion, enfoque_fisico: e.target.value})} style={{...inputStyle, borderColor: '#f59e0b80', fontSize: '0.85rem'}}>
                              <option value="Activación / Core / Prevención">🛡️ Activación / Prevención</option>
                              <option value="Fuerza Máxima / Estructural">🏋️‍♂️ Fuerza Máxima / Estructural</option>
                              <option value="Potencia / Pliometría">🚀 Potencia / Pliometría</option>
                              <option value="RSA (Repeated Sprint Ability)">🔥 RSA (Sprints Repetidos)</option>
                              <option value="Velocidad y Agilidad (COD)">⚡ Velocidad / Agilidad / COD</option>
                              <option value="Resistencia Intermitente">🏃‍♂️ Resistencia Intermitente</option>
                              <option value="Recuperación Activa">🧘‍♂️ Recuperación Activa</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{...labelStyle, color: '#fcd34d'}}>Duración (min)</label>
                            <input type="number" placeholder="Ej: 20" value={nuevaSesion.duracion_fisico} onChange={e => setNuevaSesion({...nuevaSesion, duracion_fisico: e.target.value})} style={{...inputStyle, borderColor: '#f59e0b80', textAlign: 'center'}} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={labelStyle}>Comentarios / Novedades</label>
                      <textarea 
                        value={nuevaSesion.comentarios} 
                        onChange={e => setNuevaSesion({...nuevaSesion, comentarios: e.target.value})} 
                        style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontSize: '0.9rem' }} 
                        placeholder="Ej: Faltó Martínez. Rodríguez entrenó diferenciado."
                      />
                    </div>
                  </div>

                  {/* COLUMNA DERECHA: TAREAS EN CANCHA */}
                  <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TAREAS SELECCIONADAS</span>
                        <span style={{ fontSize: '1.4rem', color: 'var(--accent)', fontWeight: '900' }}>{nuevaSesion.tareas_ids?.length || 0}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TIEMPO TOTAL</span>
                        <span style={{ fontSize: '1.4rem', color: '#fff', fontWeight: '900' }}>⏱️ {tiempoTotalSesion}' min</span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={irACreadorYGuardarBorrador} 
                      style={{ background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '15px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{fontSize: '1.2rem'}}>➕</span> Crear Nueva Tarea y Volver
                    </button>

                    <input type="text" placeholder="🔍 Buscar tareas en el banco..." value={busquedaTarea} onChange={(e) => setBusquedaTarea(e.target.value)} style={{...inputStyle, padding: '12px', background: '#222', fontSize: '0.9rem'}} />

                    <div style={{ background: '#000', border: '1px solid #333', borderRadius: '8px', flex: 1, minHeight: esMovil ? '300px' : '400px', maxHeight: '500px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {tareasFiltradas.length === 0 && <span style={{ color: '#555', fontSize: '0.85rem', textAlign: 'center', marginTop: '30px' }}>No se encontraron tareas.</span>}
                      
                      {tareasFiltradas.map(t => {
                        const isSelected = nuevaSesion.tareas_ids?.includes(t.id);
                        return (
                          <div key={t.id} onClick={() => toggleTarea(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', background: isSelected ? 'rgba(0, 255, 136, 0.1)' : '#111', border: isSelected ? '1px solid var(--accent)' : '1px solid #222' }}>
                            <div style={{ width: '50px', height: '38px', borderRadius: '4px', background: '#000', border: '1px solid #333', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {t.url_grafico ? <img src={t.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem', color: '#444' }}>{getIconoTarea(t)}</span>}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <span style={{ display: 'block', fontSize: '0.85rem', color: isSelected ? '#fff' : '#ccc', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                <span style={pillStyle}>⏱️ {t.duracion_estimada}'</span>
                                <span style={pillStyle}>⚡ {t.intensidad_rpe}/10</span>
                              </div>
                            </div>
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid', borderColor: isSelected ? 'var(--accent)' : '#555', background: isSelected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {isSelected && <span style={{ color: '#000', fontSize: '0.9rem', fontWeight: '900' }}>✓</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '20px' }}>
                  <button onClick={guardarSesion} className="btn-action" style={{ width: '100%', padding: '15px', fontSize: '1rem', fontWeight: '900' }}>
                    {nuevaSesion.id ? '💾 GUARDAR CAMBIOS' : '💾 PLANIFICAR SESIÓN'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL SECUNDARIO INDEPENDIENTE: VISOR DE DETALLES DE TAREA */}
      {/* ========================================================= */}
      {tareaSeleccionadaDetalle && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: esMovil ? '0' : '20px' }}>
          
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '950px', height: esMovil ? '100%' : 'auto', maxHeight: esMovil ? '100%' : '95vh', border: esMovil ? 'none' : '2px solid var(--accent)', display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch', animation: 'fadeIn 0.2s', borderRadius: esMovil ? '0' : '12px', position: 'relative' }}>
            
            {/* HEADER DE LA TAREA */}
            <div style={{ padding: esMovil ? '15px' : '20px', background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #333', position: 'relative', flexShrink: 0 }}>
              <div style={{ flex: 1, paddingRight: '40px' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', display: 'inline-block', marginBottom: '8px' }}>
                  {tareaSeleccionadaDetalle.categoria_ejercicio} • {tareaSeleccionadaDetalle.fase_juego}
                </span>
                <h2 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: esMovil ? '1.2rem' : '1.8rem', textTransform: 'uppercase', fontWeight: '900', lineHeight: 1.2 }}>
                  {tareaSeleccionadaDetalle.titulo}
                </h2>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginTop: '5px' }}>{tareaSeleccionadaDetalle.objetivo_principal}</span>
              </div>
              {/* BOTÓN CERRAR FIJO ARRIBA A LA DERECHA */}
              <button onClick={() => setTareaSeleccionadaDetalle(null)} style={{ position: 'absolute', top: esMovil ? '10px' : '15px', right: esMovil ? '10px' : '15px', background: 'rgba(0,0,0,0.7)', border: '1px solid #444', color: '#fff', width: '38px', height: '38px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', padding: esMovil ? '15px' : '20px' }}>
              {/* VISUAL Y MULTIMEDIA */}
              <div style={{ flex: '1 1 100%', padding: esMovil ? '0 0 15px 0' : '10px', borderRight: esMovil ? 'none' : '1px solid #222', borderBottom: esMovil ? '1px solid #222' : 'none', minWidth: '0' }}>
                
                {/* AQUÍ ESTÁ EL REPRODUCTOR NATIVO ESCALADO */}
                <div style={{ background: '#000', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden', width: '100%', minHeight: esMovil ? '250px' : '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  
                  {tareaSeleccionadaDetalle.categoria_ejercicio === 'Físico' && tareaSeleccionadaDetalle.editor_data?.tipo === 'rutina_fisica' ? (
                    <RenderRutinaFisica data={tareaSeleccionadaDetalle.editor_data} />
                  ) : tareaSeleccionadaDetalle.editor_data?.frames?.length > 0 ? (
                    <ReproductorLoop editorData={tareaSeleccionadaDetalle.editor_data} />
                  ) : tareaSeleccionadaDetalle.url_grafico ? (
                    <img src={tareaSeleccionadaDetalle.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: '#444', fontSize: '4rem' }}>{getIconoTarea(tareaSeleccionadaDetalle)}</span>
                  )}

                </div>
                
                {tareaSeleccionadaDetalle.video_url && (
                  <div style={{ marginTop: '15px' }}>
                    <a href={tareaSeleccionadaDetalle.video_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2563eb', color: '#fff', textAlign: 'center', padding: '15px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.95rem' }}>
                      ▶️ VER VIDEO DE REFERENCIA
                    </a>
                  </div>
                )}
              </div>

              {/* BLOQUE DE DATOS Y REGLAS */}
              <div style={{ flex: '1 1 100%', padding: esMovil ? '15px 0 0 0' : '10px', display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#888', fontWeight: 'bold' }}>DURACIÓN</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '900', color: '#fff' }}>{tareaSeleccionadaDetalle.duracion_estimada}'</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#888', fontWeight: 'bold' }}>RPE (INTENSIDAD)</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '900', color: tareaSeleccionadaDetalle.intensidad_rpe > 7 ? '#ef4444' : '#eab308' }}>{tareaSeleccionadaDetalle.intensidad_rpe}/10</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#888', fontWeight: 'bold' }}>CARGA (UC)</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: '900', color: 'var(--accent)' }}>{(tareaSeleccionadaDetalle.duracion_estimada || 0) * (tareaSeleccionadaDetalle.intensidad_rpe || 0)}</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#888', fontWeight: 'bold' }}>JUGADORES</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tareaSeleccionadaDetalle.jugadores_involucrados}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.8rem' }}>Reglas y Desarrollo:</h4>
                  <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333', color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {tareaSeleccionadaDetalle.descripcion || "Sin descripción detallada."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const toggleBtn = { padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', transition: '0.2s', flex: 1 };
const navBtn = { background: '#222', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' };
const labelStyle = { display: 'block', fontSize: '0.75rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.95rem', outline: 'none', minHeight: '44px' };
const pillStyle = { fontSize: '0.65rem', background: '#222', color: '#aaa', padding: '3px 6px', borderRadius: '4px', border: '1px solid #333' };

export default PlanificadorSemanal;