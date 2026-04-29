import React, { useState, useEffect, useRef } from 'react';

// =======================================================
// COMPONENTE COMPARTIDO: Reproductor Automático de Tareas
// Usado en: BancoTareas, PlanificadorSemanal
// Motor: Canvas nativo con interpolación de frames
// =======================================================

const PITCH_VARIANTS = {
  '40x20': { mW: 40, mH: 20 },
  '28x20': { mW: 28, mH: 20 },
  '20x20_mitad': { mW: 20, mH: 20 },
  '20x20_central': { mW: 20, mH: 20 },
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

const BASE_W = 800;

function getBaseH(variant) {
  const vrt = PITCH_VARIANTS[variant] || PITCH_VARIANTS['40x20'];
  return BASE_W / (vrt.mW / vrt.mH);
}

function lighten(hex, amt) {
  if (!hex || !hex.startsWith('#')) return hex || '#fff';
  let c = hex.slice(1); if(c.length===3) c=c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  return '#'+c.match(/../g).map(h => Math.min(255,parseInt(h,16)+amt).toString(16).padStart(2,'0')).join('');
}

function playerRadius(cW) { return cW * 0.021; }

function drawPitch(ctx, cW, cH, cfg) {
  const vrt = PITCH_VARIANTS[cfg.variant] || PITCH_VARIANTS['40x20'];
  const MW = vrt.mW, MH = vrt.mH;
  const p = Math.min(cW, cH) * 0.045;
  const L = { px: p, py: p, ppw: cW-2*p, pph: cH-2*p };
  const lc = cfg.lineColor || '#ffffff';
  const alpha = cfg.material === 'negro' ? .9 : .8;

  function mX(m) { return L.px + (m/MW)*L.ppw; }
  function mY(m) { return L.py + (m/MH)*L.pph; }
  function dot(x,y,r=3) {
    ctx.fillStyle=lc; ctx.globalAlpha=alpha;
    ctx.beginPath(); ctx.arc(mX(x), mY(y), r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
  }
  function line(x1,y1,x2,y2,lw=1.5, dash=[]) {
    ctx.strokeStyle=lc; ctx.lineWidth=lw; ctx.globalAlpha=alpha; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(mX(x1), mY(y1)); ctx.lineTo(mX(x2), mY(y2)); ctx.stroke();
    ctx.globalAlpha=1; ctx.setLineDash([]);
  }

  ctx.fillStyle = '#0a0b0f'; ctx.fillRect(0,0,cW,cH);

  ctx.save(); ctx.beginPath(); ctx.rect(L.px, L.py, L.ppw, L.pph); ctx.clip();
  ctx.save(); ctx.translate(L.px, L.py);
  (MATERIALS[cfg.material] || MATERIALS.azul)(ctx, L.ppw, L.pph);
  ctx.restore(); ctx.restore();

  ctx.shadowBlur = 16; ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 5;
  ctx.strokeRect(L.px, L.py, L.ppw, L.pph); ctx.shadowBlur = 0;

  ctx.save(); ctx.beginPath(); ctx.rect(L.px, L.py, L.ppw, L.pph); ctx.clip();
  const midX = MW/2, midY = MH/2;

  if (cfg.variant === '40x20' || cfg.variant === '28x20' || cfg.variant === '20x20_central') {
    line(midX,0, midX,MH, 2);
    const rPx = (3/MW)*L.ppw;
    ctx.strokeStyle=lc; ctx.lineWidth=1.5; ctx.globalAlpha=alpha;
    ctx.beginPath(); ctx.arc(mX(midX), mY(midY), rPx, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha=1; dot(midX, midY);
  }

  if (cfg.showZones !== false) {
    const gy1 = midY - 1.5, gy2 = midY + 1.5;
    ctx.strokeStyle=lc; ctx.lineWidth=1.5; ctx.globalAlpha=.8;
    const drawArea = (isLeft) => {
      const baseX = isLeft ? 0 : MW; const sign = isLeft ? 1 : -1; const rPx = (6/MW)*L.ppw;
      ctx.beginPath();
      if (isLeft) {
        ctx.arc(mX(baseX), mY(gy1), rPx, -Math.PI/2, 0, false);
        ctx.lineTo(mX(baseX+6), mY(gy2));
        ctx.arc(mX(baseX), mY(gy2), rPx, 0, Math.PI/2, false);
      } else {
        ctx.arc(mX(baseX), mY(gy1), rPx, -Math.PI/2, Math.PI, true);
        ctx.lineTo(mX(baseX-6), mY(gy2));
        ctx.arc(mX(baseX), mY(gy2), rPx, Math.PI, Math.PI/2, true);
      }
      ctx.stroke();
      dot(baseX + 6*sign, midY, 2.5); dot(baseX + 10*sign, midY, 2.5);
      const cr = (0.25/MW)*L.ppw;
      ctx.beginPath(); ctx.arc(mX(baseX), mY(0), cr, isLeft?0:Math.PI/2, isLeft?Math.PI/2:Math.PI, false); ctx.stroke();
      ctx.beginPath(); ctx.arc(mX(baseX), mY(MH), cr, isLeft?-Math.PI/2:Math.PI, isLeft?0:-Math.PI/2, false); ctx.stroke();
    };
    if (cfg.variant !== '20x20_central') { drawArea(true); drawArea(false); }
  }
  ctx.restore();
  ctx.strokeStyle=lc; ctx.lineWidth=2; ctx.globalAlpha=alpha;
  ctx.strokeRect(L.px, L.py, L.ppw, L.pph); ctx.globalAlpha=1;
}

function drawArr(ctx, a) {
  const st = ARROW_STYLES[a.style] || ARROW_STYLES['arrow-pase'];
  const color = a.color || st.color;
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

function drawElements(ctx, elements, arrows, cW) {
  elements.filter(e => e.type?.startsWith('zone')).forEach(el => drawItem(ctx, el, cW));
  arrows.forEach(a => drawArr(ctx, a));
  elements.filter(e => !e.type?.startsWith('zone')).forEach(el => drawItem(ctx, el, cW));
}

// =======================================================
// COMPONENTE PRINCIPAL
// =======================================================
const ReproductorLoop = ({ editorData }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [cvSize, setCvSize] = useState({ w: 800, h: 500 });
  const isMountedRef = useRef(true);

  const frames = editorData?.frames || [];
  const pitchCfg = editorData?.cancha || { variant: '40x20', material: 'azul' };

  // Redimensionamiento responsivo
  useEffect(() => {
    function handleResize() {
      if (!containerRef.current) return;
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const baseH = getBaseH(pitchCfg.variant);
      const ratio = BASE_W / baseH;
      let w = Math.min(cw, ch * ratio);
      let h = w / ratio;
      if (h > ch) { h = ch; w = h * ratio; }
      setCvSize({ w, h });
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pitchCfg.variant]);

  // Motor de bucle y render
  useEffect(() => {
    isMountedRef.current = true;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');

    const DURATION = 800;
    const PAUSE = 500;
    let animId;

    const playLoop = async () => {
      while (isMountedRef.current) {
        if (frames.length < 2) {
          // Frame estático — dibuja y corta el bucle
          const f0 = frames[0] || {};
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cvSize.w, cvSize.h);
          ctx.scale(cvSize.w / BASE_W, cvSize.h / getBaseH(pitchCfg.variant));
          drawPitch(ctx, BASE_W, getBaseH(pitchCfg.variant), pitchCfg);
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
              ctx.scale(cvSize.w / BASE_W, cvSize.h / getBaseH(pitchCfg.variant));
              drawPitch(ctx, BASE_W, getBaseH(pitchCfg.variant), pitchCfg);
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
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0a0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <canvas ref={canvasRef} width={cvSize.w} height={cvSize.h} />
      {frames.length > 1 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>
          ▶ ANIMACIÓN
        </div>
      )}
    </div>
  );
};

export default ReproductorLoop;