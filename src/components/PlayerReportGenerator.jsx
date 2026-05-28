import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { getColorAccion } from '../utils/helpers';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

const CANVAS_W = 1300;
// CANVAS_H es dinámico — la altura real la mide el contenido
const FONT = "'JetBrains Mono', monospace";
const CL   = '#00e676';
const CA   = '#ffd600';

const asNumber = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
const calcularEdad = (f) => { if (!f) return 'N/D'; const d = Date.now() - new Date(f).getTime(); return Math.abs(new Date(d).getUTCFullYear() - 1970); };
const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '0.00');

const KpiCard = ({ label, value, color = CL, sub }) => (
  <div style={{ background:'rgba(255,255,255,.03)', borderRadius:12, border:'1px solid rgba(255,255,255,.06)', borderTop:`2px solid ${color}`, padding:'18px 14px', textAlign:'center', minWidth:0 }}>
    <div style={{ fontSize:'.56rem', color:'rgba(255,255,255,.75)', fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:8, fontFamily:FONT }}>{label}</div>
    <div style={{ fontSize:'2.6rem', fontWeight:900, color, lineHeight:1, fontFamily:FONT, letterSpacing:'-2px' }}>{value}</div>
    {sub && <div style={{ fontSize:'.55rem', color:'rgba(255,255,255,.35)', marginTop:5, fontFamily:FONT }}>{sub}</div>}
  </div>
);

const Row = ({ label, value, color='#fff', sub='', noBorder=false }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 0', borderBottom:noBorder?'none':'1px solid rgba(255,255,255,.05)', fontSize:'.95rem', gap:10 }}>
    <span style={{ color:'rgba(255,255,255,.55)', fontWeight:600 }}>{label}</span>
    <strong style={{ color, textAlign:'right', flexShrink:0, fontFamily:FONT }}>
      {value}{sub && <span style={{ color:'rgba(255,255,255,.3)', fontSize:'.8rem', marginLeft:6 }}>{sub}</span>}
    </strong>
  </div>
);

const CanchaFutsal = ({ accionesMapa, dotSize = 14 }) => (
  <div style={{ position:'relative', width:'100%', aspectRatio:'2/1', background:'#080808', borderRadius:8, overflow:'hidden', border:'2px solid rgba(255,255,255,.1)' }}>
    <div style={{ position:'absolute', left:'-1%', top:'-2%', width:'3%', height:'6%', border:'1.5px solid rgba(255,255,255,.2)', borderRadius:'50%' }} />
    <div style={{ position:'absolute', left:'-1%', bottom:'-2%', width:'3%', height:'6%', border:'1.5px solid rgba(255,255,255,.2)', borderRadius:'50%' }} />
    <div style={{ position:'absolute', right:'-1%', top:'-2%', width:'3%', height:'6%', border:'1.5px solid rgba(255,255,255,.2)', borderRadius:'50%' }} />
    <div style={{ position:'absolute', right:'-1%', bottom:'-2%', width:'3%', height:'6%', border:'1.5px solid rgba(255,255,255,.2)', borderRadius:'50%' }} />
    <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:2, background:'rgba(255,255,255,.2)', transform:'translateX(-50%)' }} />
    <div style={{ position:'absolute', left:'50%', top:'50%', width:'15%', height:'30%', border:'2px solid rgba(255,255,255,.2)', borderRadius:'50%', transform:'translate(-50%,-50%)' }} />
    <div style={{ position:'absolute', left:'50%', top:'50%', width:6, height:6, background:'rgba(255,255,255,.4)', borderRadius:'50%', transform:'translate(-50%,-50%)' }} />
    <div style={{ position:'absolute', left:0, top:'12.5%', bottom:'12.5%', width:'15%', border:'2px solid rgba(255,255,255,.2)', borderLeft:'none', borderRadius:'0 100% 100% 0 / 0 50% 50% 0' }} />
    <div style={{ position:'absolute', right:0, top:'12.5%', bottom:'12.5%', width:'15%', border:'2px solid rgba(255,255,255,.2)', borderRight:'none', borderRadius:'100% 0 0 100% / 50% 0 0 50%' }} />
    <div style={{ position:'absolute', left:'15%', top:'50%', width:6, height:6, background:'rgba(255,255,255,.4)', borderRadius:'50%', transform:'translate(-50%,-50%)' }} />
    <div style={{ position:'absolute', right:'15%', top:'50%', width:6, height:6, background:'rgba(255,255,255,.4)', borderRadius:'50%', transform:'translate(50%,-50%)' }} />
    <div style={{ position:'absolute', left:'25%', top:'50%', width:4, height:4, background:'rgba(255,255,255,.3)', borderRadius:'50%', transform:'translate(-50%,-50%)' }} />
    <div style={{ position:'absolute', right:'25%', top:'50%', width:4, height:4, background:'rgba(255,255,255,.3)', borderRadius:'50%', transform:'translate(50%,-50%)' }} />
    <div style={{ position:'absolute', left:-2, top:'42.5%', bottom:'42.5%', width:'2%', border:'3px solid #c2c2c2', borderLeft:'none' }} />
    <div style={{ position:'absolute', right:-2, top:'42.5%', bottom:'42.5%', width:'2%', border:'3px solid #c2c2c2', borderRight:'none' }} />
    {accionesMapa.map((ev, i) => {
      let col = getColorFromMap(ev.accion);
      if (ev.accion === 'Gol Recibido') col = '#ef4444';
      if (ev.accion === 'Atajada') col = '#3b82f6';
      return <div key={i} style={{ position:'absolute', left:`${ev.x}%`, top:`${ev.y}%`, width:dotSize, height:dotSize, backgroundColor:col, borderRadius:'50%', transform:'translate(-50%,-50%)', opacity:.9, boxShadow:`0 0 8px ${col}99`, zIndex:2 }} />;
    })}
  </div>
);

// Mapa completo — colores exactos de helpers.js
const COLOR_MAP = {
  'remate - gol':       { label:'Gol',                color:'#00ff88' },
  'gol':                { label:'Gol',                color:'#00ff88' },
  'remate - atajado':   { label:'Rem. atajado',       color:'#3b82f6' },
  'remate - desviado':  { label:'Rem. desviado',      color:'#888888' },
  'remate - rebatido':  { label:'Rem. rebatido',      color:'#a855f7' },
  'recuperación':       { label:'Recuperación',       color:'#eab308' },
  'pérdida':            { label:'Pérdida',            color:'#ef4444' },
  'pase incompleto':    { label:'Pase incompleto',    color:'#f59e0b' },
  'duelo def ganado':   { label:'Duelo DEF ganado',   color:'#10b981' },
  'duelo def perdido':  { label:'Duelo DEF perdido',  color:'#dc2626' },
  'duelo ofe ganado':   { label:'Duelo OFE ganado',   color:'#0ea5e9' },
  'duelo ofe perdido':  { label:'Duelo OFE perdido',  color:'#f97316' },
  'lateral':            { label:'Lateral',            color:'#06b6d4' },
  'córner':             { label:'Córner',             color:'#f97316' },
  'falta cometida':     { label:'Falta cometida',     color:'#ec4899' },
  'falta recibida':     { label:'Falta recibida',     color:'#ec4899' },
  'tarjeta amarilla':   { label:'Tarjeta amarilla',   color:'#facc15' },
  'tarjeta roja':       { label:'Tarjeta roja',       color:'#991b1b' },
  'asistencia':         { label:'Asistencia',         color:'#06b6d4' },
  'penal a favor':      { label:'Penal a favor',      color:'#10b981' },
  'penal en contra':    { label:'Penal en contra',    color:'#ef4444' },
  'atajada':            { label:'Atajada',            color:'#3b82f6' },
  'gol recibido':       { label:'Gol recibido',       color:'#ef4444' },
};

const getColorFromMap = (accion) => {
  const key = (accion || '').toLowerCase().trim();
  if (COLOR_MAP[key]) return COLOR_MAP[key].color;
  return getColorAccion(accion); // fallback al helper original
};

const LeyendaMapaAdaptativa = ({ accionesMapa }) => {
  // Construir leyenda solo con los colores que aparecen realmente en el mapa
  const vistos = new Map();
  accionesMapa.forEach(ev => {
    const key = (ev.accion || '').toLowerCase().trim();
    if (vistos.has(key)) return;
    let color = COLOR_MAP[key]?.color || getColorAccion(ev.accion);
    let label = COLOR_MAP[key]?.label || ev.accion || key;
    // Sobreescrituras explícitas
    if (ev.accion === 'Gol Recibido') { color='#ef4444'; label='Gol recibido'; }
    if (ev.accion === 'Atajada')      { color='#3b82f6'; label='Atajada'; }
    vistos.set(key, { label, color });
  });
  const items = [...vistos.values()];
  if (!items.length) return null;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 14px', marginTop:10, justifyContent:'center' }}>
      {items.map(({ label, color }) => (
        <span key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.78rem', color:'rgba(255,255,255,.6)', fontWeight:700, fontFamily:FONT }}>
          <span style={{ width:9, height:9, borderRadius:'50%', background:color, flexShrink:0, border: color.includes('255,255,255') ? '1px solid rgba(255,255,255,.3)' : 'none' }} />
          {label}
        </span>
      ))}
    </div>
  );
};

// ── Cancha con líneas SVG (igual que Resumen) ──
const PitchLinesSVG = () => (
  <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"
    style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:0, pointerEvents:'none' }}>
    <rect x="0" y="0" width="100" height="50" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="0.5" />
    <line x1="50" y1="0" x2="50" y2="50" stroke="rgba(255,255,255,.18)" strokeWidth="0.5" />
    <circle cx="50" cy="25" r="7.5" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="0.5" />
    <circle cx="50" cy="25" r="0.6" fill="rgba(255,255,255,.18)" />
    <path d="M 0 6.25 A 15 15 0 0 1 15 21.25 L 15 28.75 A 15 15 0 0 1 0 43.75" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="0.5" />
    <rect x="-2.5" y="21.25" width="2.5" height="7.5" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
    <path d="M 100 6.25 A 15 15 0 0 0 85 21.25 L 85 28.75 A 15 15 0 0 0 100 43.75" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="0.5" />
    <rect x="100" y="21.25" width="2.5" height="7.5" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
    <path d="M 2.5 0 A 2.5 2.5 0 0 1 0 2.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.35" />
    <path d="M 0 47.5 A 2.5 2.5 0 0 1 2.5 50" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.35" />
    <path d="M 97.5 50 A 2.5 2.5 0 0 1 100 47.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.35" />
    <path d="M 100 2.5 A 2.5 2.5 0 0 1 97.5 0" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="0.35" />
  </svg>
);

// ── Grilla de zonas tácticas (Z1-Z4 × I-C-D) ──
const CanchaZonas = ({ eventos, colorBase, titulo }) => {
  const zX = ['Z1','Z2','Z3','Z4'];
  const zY = ['I','C','D'];
  const counts = {};
  let maxCount = 0;
  eventos.forEach(ev => {
    const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
    const y = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
    if (x == null || y == null) return;
    const col = x < 25 ? 'Z1' : x < 50 ? 'Z2' : x < 75 ? 'Z3' : 'Z4';
    const row = y < 33.33 ? 'I' : y < 66.66 ? 'C' : 'D';
    const key = `${col}-${row}`;
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] > maxCount) maxCount = counts[key];
  });
  const total = eventos.length;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ fontSize:'.62rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:'rgba(255,255,255,.6)', fontFamily:FONT }}>
        {titulo} <span style={{ color:'rgba(255,255,255,.35)', fontWeight:400 }}>({total})</span>
      </div>
      <div style={{ position:'relative', width:'100%', aspectRatio:'2/1', borderRadius:6, overflow:'hidden', background:'#080808', border:'1px solid rgba(255,255,255,.08)' }}>
        <PitchLinesSVG />
        <svg viewBox="0 0 100 50" style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1, pointerEvents:'none' }}>
          {zX.map((xVal, colIdx) =>
            zY.map((yVal, rowIdx) => {
              const key = `${xVal}-${yVal}`;
              const count = counts[key] || 0;
              const opacity = count > 0 ? Math.min(0.75, (count / (maxCount || 1)) * 0.6 + 0.12) : 0;
              return (
                <g key={key}>
                  {count > 0 && <rect x={colIdx*25} y={rowIdx*16.66} width="25" height="16.66" fill={colorBase} fillOpacity={opacity} />}
                  <rect x={colIdx*25} y={rowIdx*16.66} width="25" height="16.66" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="0.15" />
                  <text x={colIdx*25+1} y={rowIdx*16.66+3} fill="rgba(255,255,255,.2)" fontSize="2" fontWeight="bold">{key}</text>
                  {count > 0 && (
                    <text x={colIdx*25+12.5} y={rowIdx*16.66+11} fill="#fff" fontSize="7" textAnchor="middle" fontWeight="900"
                      style={{ filter:'drop-shadow(0px 0px 2px rgba(0,0,0,1))' }}>
                      {count}
                    </text>
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
};

const COLORS_REMATES = { Gol:'#00e676', Atajado:'#3b82f6', Desviado:'#6b7280', Rebatido:'#a855f7' };

const SeccionRemates = ({ dataRemates, totalRemates }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
    {dataRemates.length > 0 ? dataRemates.map((item, i) => {
      const pct = totalRemates > 0 ? Math.round((item.value / totalRemates) * 100) : 0;
      return (
        <div key={i}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.95rem', fontWeight:700, marginBottom:6 }}>
            <span style={{ color:COLORS_REMATES[item.name]||'#fff' }}>{item.name}</span>
            <span style={{ color:'#ccc', fontFamily:FONT }}>{item.value} <span style={{ color:'rgba(255,255,255,.3)', fontSize:'.82em' }}>({pct}%)</span></span>
          </div>
          <div style={{ width:'100%', height:8, background:'rgba(255,255,255,.07)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:COLORS_REMATES[item.name]||'#fff', borderRadius:4 }} />
          </div>
        </div>
      );
    }) : <div style={{ color:'rgba(255,255,255,.25)', fontSize:'1rem', textAlign:'center', fontWeight:700 }}>Sin remates</div>}
  </div>
);

const PlayerReportGenerator = ({ jugador, perfil, wellness, contexto, jugadores = [] }) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const wrapperRef = useRef(null);

  const isArquero   = perfil?.rol === 'ARQUERO' || (jugador?.posicion || '').toLowerCase().includes('arquero');
  const accentColor = isArquero ? CA : CL;
  const stats            = perfil?.stats ?? {};
  const accionesDirectas = perfil?.accionesDirectas ?? [];
  const dataRemates      = Array.isArray(perfil?.dataTortaRemates) ? perfil.dataTortaRemates : [];
  const clubName         = localStorage.getItem('mi_club') || 'VIRTUAL FUTSAL';
  const escudoUrl        = localStorage.getItem('escudo_url') || null;

  const accionesMapa   = accionesDirectas.map(ev => ({ ...ev, x: ev.zona_x_norm ?? ev.zona_x, y: ev.zona_y_norm ?? ev.zona_y })).filter(ev => ev.x != null && ev.y != null);
  const accionesAtaque = accionesMapa.filter(ev => ['Gol','Remate - Gol','Remate - Atajado','Remate - Desviado','Remate - Rebatido','Asistencia'].includes(ev.accion) || ev.accion?.includes('Remate'));
  const accionesResto  = accionesMapa.filter(ev => !accionesAtaque.includes(ev));
  const accionesArco   = accionesMapa.filter(ev => ['Atajada','Gol Recibido'].includes(ev.accion));
  const accionesDistGK = accionesMapa.filter(ev => !['Atajada','Gol Recibido'].includes(ev.accion));

  const amarillas      = asNumber(stats.amarillas);
  const rojas          = asNumber(stats.rojas);
  const factor40       = perfil?.minutos > 0 ? (40 / perfil.minutos) : 0;
  const atajadas       = asNumber(perfil?.totalAtajadas ?? stats.atajadas);
  const golesRecibidos = asNumber(perfil?.totalGolesRecibidos ?? stats.golesRecibidos);
  const tirosRecibidos = atajadas + golesRecibidos;
  const pctAtajadas    = tirosRecibidos > 0 ? Math.round((atajadas / tirosRecibidos) * 100) : 0;

  let companerosQuinteto = [];
  if (perfil?.mejorQuinteto && jugadores.length > 0) {
    companerosQuinteto = perfil.mejorQuinteto.ids.filter(id => id != jugador.id).map(id => jugadores.find(j => j.id == id)).filter(Boolean);
  } else if (perfil?.topSocios) {
    companerosQuinteto = perfil.topSocios;
  }

  useEffect(() => {
    const calc = () => {
      const parent = wrapperRef.current?.parentElement || document.body;
      // Solo limitamos por ancho — la altura es libre y crece con el contenido
      setEscala(Math.min((parent.offsetWidth - 48) / CANVAS_W, 1));
    };
    const t = setTimeout(calc, 80);
    window.addEventListener('resize', calc);
    return () => { clearTimeout(t); window.removeEventListener('resize', calc); };
  }, []);

  const exportarPNG = async () => {
    const sw = document.getElementById('report-scale-wrapper');
    const cd = sw.parentElement;
    const el = document.getElementById('player-report-exportable');
    if (!el || !sw || !cd || exportando) return;
    setExportando(true);
    const [oT,oW,oH,oO] = [sw.style.transform, cd.style.width, cd.style.height, cd.style.overflow];
    const realH = el.scrollHeight;
    sw.style.transform = 'scale(1)'; cd.style.width = `${CANVAS_W}px`; cd.style.height = `${realH}px`; cd.style.overflow = 'visible';
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(el, { scale:2, useCORS:true, backgroundColor:'#050505', logging:false, height:realH, windowHeight:realH });
        const fileName = `Scouting_${jugador?.apellido}_${contexto === 'TODA LA TEMPORADA' ? new Date().getFullYear() : 'Partido'}.png`;
        const isIOS    = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isIOS) {
          const dataUrl = canvas.toDataURL('image/png');
          const w = window.open('', '_blank');
          if (w) {
            w.document.write(`<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;flex-direction:column;align-items:center">
              <p style="color:#fff;font-family:monospace;font-size:14px;padding:16px;text-align:center">
                📸 Mantené pulsada la imagen → <strong>"Añadir a fotos"</strong> para guardarla
              </p>
              <img src="${dataUrl}" style="max-width:100%;display:block" />
            </body></html>`);
            w.document.close();
          } else {
            alert('Permitir ventanas emergentes para descargar la imagen.');
          }
        } else if (isMobile) {
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = fileName;
            document.body.appendChild(link); link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }, 'image/png');
        } else {
          const link = document.createElement('a');
          link.download = fileName; link.href = canvas.toDataURL('image/png'); link.click();
        }
      } catch (err) { console.error(err); alert('Error al generar la imagen.'); }
      finally { sw.style.transform=oT; cd.style.width=oW; cd.style.height=oH; cd.style.overflow=oO; setExportando(false); }
    }, 300);
  };

  if (!jugador || !perfil) return null;

  const inicial     = (jugador.apellido || '?').charAt(0).toUpperCase();
  const ratingColor = asNumber(perfil.impacto) >= 7 ? CL : asNumber(perfil.impacto) >= 6 ? CA : '#ff1744';
  const pmVal       = asNumber(perfil.plusMinus);
  const pmDisplay   = pmVal > 0 ? `+${pmVal}` : String(pmVal);

  const pills = [
    { val: `#${jugador.dorsal}`, bg:'rgba(255,255,255,.08)', color:'#fff' },
    jugador.posicion && { val: jugador.posicion, bg:`rgba(0,230,118,.1)`, color: accentColor },
    jugador.pierna   && { val: jugador.pierna,   bg:'rgba(255,255,255,.05)', color:'rgba(255,255,255,.6)' },
    jugador.fechanac && { val: `${calcularEdad(jugador.fechanac)} años`, bg:'rgba(255,255,255,.05)', color:'rgba(255,255,255,.6)' },
    jugador.altura   && { val: `${jugador.altura} cm`, bg:'rgba(255,255,255,.05)', color:'rgba(255,255,255,.6)' },
    jugador.peso     && { val: `${jugador.peso} kg`, bg:'rgba(255,255,255,.05)', color:'rgba(255,255,255,.6)' },
    jugador.categoria && { val: jugador.categoria, bg:'rgba(255,214,0,.07)', color:'#ffd600' },
    { val: perfil.rol, bg: accentColor, color:'#000' },
  ].filter(Boolean);

  return (
    <div ref={wrapperRef} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:16, fontFamily:"'Inter',system-ui,sans-serif" }}>

      <div style={{ width:`${CANVAS_W*escala}px`, display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
        <button onClick={exportarPNG} disabled={exportando}
          style={{ background:exportando?'#1a1a1a':CL, color:exportando?'#555':'#000', fontWeight:900, fontSize:'.9rem', padding:'12px 24px', border:'none', borderRadius:6, cursor:'pointer', fontFamily:FONT }}>
          {exportando ? '⏳ Generando...' : '📸 DESCARGAR REPORTE'}
        </button>
      </div>

      <div style={{ width:`${CANVAS_W*escala}px`, overflow:'hidden', borderRadius:Math.round(16*escala), boxShadow:'0 20px 50px rgba(0,0,0,.8)' }}>
        <div id="report-scale-wrapper" style={{ transform:`scale(${escala})`, transformOrigin:'top left', width:CANVAS_W }}>

          <div id="player-report-exportable" style={{
            width:CANVAS_W, minHeight:2100, background:'#050505',
            backgroundImage:'radial-gradient(circle at 50% 0%, rgba(0,30,20,.9) 0%, #050505 55%)',
            color:'#fff', padding:40, boxSizing:'border-box', display:'flex', flexDirection:'column', gap:14
          }}>

            {/* ══ HEADER ══ */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderLeft:`4px solid ${accentColor}`, paddingLeft:24, paddingBottom:20, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:24 }}>
                <div style={{ width:130, height:130, borderRadius:'50%', background:`rgba(0,230,118,.06)`, border:`3px solid ${accentColor}`, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                  {jugador.foto ? <div style={{ width:'100%', height:'100%', backgroundImage:`url(${jugador.foto})`, backgroundSize:'cover', backgroundPosition:'center' }}/> : <span style={{ fontSize:'2.8rem', color:accentColor, fontWeight:900, fontFamily:FONT }}>{inicial}</span>}
                </div>
                <div>
                  <div style={{ fontSize:'.65rem', fontWeight:700, letterSpacing:4, textTransform:'uppercase', color:'rgba(255,255,255,.4)', marginBottom:4, fontFamily:FONT }}>{clubName} · SCOUTING</div>
                  <div style={{ fontSize:'3.8rem', fontWeight:900, textTransform:'uppercase', lineHeight:.92, letterSpacing:'-2px', marginBottom:4, fontFamily:FONT }}>{jugador.apellido}</div>
                  <div style={{ fontSize:'1.3rem', color:'rgba(255,255,255,.5)', fontWeight:400, marginBottom:10 }}>{jugador.nombre}</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {pills.map((p, i) => (
                      <span key={i} style={{ background:p.bg, color:p.color, padding:'4px 12px', borderRadius:4, fontSize:'.75rem', fontWeight:900, fontFamily:FONT }}>{p.val}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
                {escudoUrl
                  ? <div style={{ width:90, height:90, backgroundImage:`url(${escudoUrl})`, backgroundSize:'contain', backgroundPosition:'center', backgroundRepeat:'no-repeat' }}/>
                  : <div style={{ width:90, height:90, border:'1px solid #333', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#333', fontSize:'.7rem', fontFamily:FONT }}>ESCUDO</div>
                }
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'2.8rem', fontWeight:900, fontFamily:FONT, color:ratingColor, lineHeight:1, letterSpacing:'-2px' }}>
                    {asNumber(perfil.impacto) > 0 ? asNumber(perfil.impacto).toFixed(1) : '—'}
                  </div>
                  <div style={{ fontSize:'.5rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:'rgba(255,255,255,.35)', fontFamily:FONT }}>RATING</div>
                </div>
              </div>
            </div>

            {/* ══ KPI TIER ══ */}
            {(() => {
              const xgPorRemate = asNumber(stats.remates) > 0 ? (asNumber(stats.xG) / asNumber(stats.remates)).toFixed(3) : '—';
              const contrib = asNumber(stats.goles) + asNumber(stats.asistencias);
              const minsPorContrib = contrib > 0 && asNumber(perfil.minutos) > 0 ? Math.round(asNumber(perfil.minutos) / contrib) : '—';
              const pasesClave = asNumber(stats.pasesClave);
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:12 }}>
                  <KpiCard label="MINUTOS"  value={`${perfil.minutos ?? 0}'`} color='rgba(255,255,255,.6)' sub={`${perfil.partidosJugados ?? 0} partidos`} />
                  {isArquero ? (<>
                    <KpiCard label="ATAJADAS"     value={atajadas}                              color='#3b82f6' sub={`${tirosRecibidos} tiros`} />
                    <KpiCard label="EFECTIVIDAD"  value={`${pctAtajadas}%`}                    color='#c084fc' />
                    <KpiCard label="GOLES PREVN." value={asNumber(perfil.golesPrevenidos) > 0 ? `+${Number(perfil.golesPrevenidos).toFixed(2)}` : Number(perfil.golesPrevenidos).toFixed(2)} color={asNumber(perfil.golesPrevenidos) >= 0 ? CL : '#ff1744'} sub="vs xG recibido" />
                    <KpiCard label="xG BUILDUP"   value={fmt2(asNumber(perfil.xgBuildup))}     color={CA} />
                    <KpiCard label="PLUS / MINUS" value={pmDisplay}                            color={pmVal >= 0 ? CL : '#ff1744'} />
                  </>) : (<>
                    <KpiCard label="GOLES"        value={stats.goles ?? 0}                     color={CL}      sub={`${stats.remates ?? 0} remates`} />
                    <KpiCard label="ASISTENCIAS"  value={stats.asistencias ?? 0}               color={CA}      sub={pasesClave > 0 ? `${pasesClave} p. clave` : undefined} />
                    <KpiCard label="xG / REMATE"  value={xgPorRemate}                         color='#c084fc' sub={`xG total: ${fmt2(asNumber(stats.xG))}`} />
                    <KpiCard label="MIN / CONTRIB" value={minsPorContrib === '—' ? '—' : `${minsPorContrib}'`} color='#0ea5e9' sub={contrib > 0 ? `${contrib} contribuc.` : 'sin G+A'} />
                    <KpiCard label="PLUS / MINUS" value={pmDisplay}                           color={pmVal >= 0 ? CL : '#ff1744'} sub={`${fmt2(asNumber(perfil.xgBuildup))} xG buildup`} />
                  </>)}
                </div>
              );
            })()}

            {/* ══ FILA ANÁLISIS: 3 COLS ══ */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.3fr 1fr', gap:16 }}>

              {/* Izq: Radiografía */}
              <div style={{ background:'rgba(255,255,255,.025)', padding:22, borderRadius:14, border:'1px solid rgba(255,255,255,.05)' }}>
                <div style={{ fontSize:'1rem', fontWeight:900, color: isArquero ? '#3b82f6' : CL, marginBottom:16, fontFamily:FONT }}>
                  {isArquero ? '🧤 ARCO' : '⚔️ OFENSIVA'}
                </div>
                {isArquero ? (<>
                  <Row label="Tiros recibidos"   value={tirosRecibidos} />
                  <Row label="Atajadas"          value={atajadas}       color='#00e676' />
                  <Row label="Goles recibidos"   value={golesRecibidos} color='#ef4444' />
                  <Row label="% Efectividad"     value={`${pctAtajadas}%`} color='#c084fc' />
                  <Row label="xG Buildup (pies)" value={fmt2(asNumber(perfil.xgBuildup))} noBorder />
                </>) : (<>
                  <Row label="Goles / xG"     value={`${stats.goles ?? 0} / ${fmt2(asNumber(stats.xG))}`} />
                  <Row label="Asistencias"    value={stats.asistencias ?? 0} />
                  <Row label="Pases clave"    value={stats.pasesClave ?? 0} color='#a78bfa' />
                  <Row label="Remates (p40)"  value={stats.remates ?? 0} sub={`(${(asNumber(stats.remates)*factor40).toFixed(1)})`} />
                  <Row label="Duelos OFE"     value={`${stats.duelosOfeGanados??0}/${stats.duelosOfeTotales??0}`} sub={`(${stats.duelosOfeTotales>0?Math.round((stats.duelosOfeGanados/stats.duelosOfeTotales)*100):0}%)`} />
                  <Row label="Ocasiones fall." value={stats.ocasionesFalladas ?? 0} color='#ef4444' noBorder />
                </>)}
              </div>

              {/* Centro: Radar */}
              <div style={{ background:'rgba(255,255,255,.02)', borderRadius:14, border:'1px solid rgba(255,255,255,.05)', display:'flex', flexDirection:'column', alignItems:'center', padding:18 }}>
                <div style={{ fontSize:'1rem', fontWeight:900, color:'#fff', marginBottom:4, fontFamily:FONT }}>PERFIL DE RENDIMIENTO</div>
                <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.3)', marginBottom:8, textAlign:'center', fontFamily:FONT }}>Producción p40 normalizada</div>
                <div style={{ flex:1, width:'100%', minHeight:220, display:'flex', justifyContent:'center' }}>
                  <RadarChart width={420} height={270} cx="50%" cy="50%" outerRadius="72%" data={perfil.dataRadar}>
                    <PolarGrid stroke="rgba(255,255,255,.1)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill:'rgba(255,255,255,.6)', fontSize:11, fontWeight:'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0,100]} tick={false} axisLine={false} />
                    <Radar name="Jugador" dataKey="A" stroke={accentColor} fill={accentColor} fillOpacity={0.3} isAnimationActive={false} dot={{ fill:accentColor, r:3 }} />
                  </RadarChart>
                </div>
              </div>

              {/* Der: Defensiva */}
              <div style={{ background:'rgba(255,255,255,.025)', padding:22, borderRadius:14, border:'1px solid rgba(255,255,255,.05)' }}>
                <div style={{ fontSize:'1rem', fontWeight:900, color: isArquero ? CL : '#ef4444', marginBottom:16, fontFamily:FONT }}>
                  {isArquero ? '⚡ DISTRIBUCIÓN' : '🛡️ DEFENSIVA'}
                </div>
                {isArquero ? (<>
                  <Row label="Recuperaciones" value={stats.recuperaciones ?? 0} color={CL} />
                  <Row label="Pérdidas"       value={stats.perdidas ?? 0}       color='#ef4444' />
                  <Row label="Asistencias"    value={stats.asistencias ?? 0}    color={CA} />
                  <Row label="Duelos (Gan/Tot)" value={`${stats.duelosDefGanados??0}/${stats.duelosDefTotales??0}`} sub={`(${stats.duelosDefTotales>0?Math.round((stats.duelosDefGanados/stats.duelosDefTotales)*100):0}%)`} />
                  <Row label="Faltas recibidas" value={stats.faltasRecibidas ?? 0} noBorder />
                </>) : (<>
                  <Row label="Recuperaciones (p40)" value={stats.recuperaciones ?? 0} sub={`(${(asNumber(stats.recuperaciones)*factor40).toFixed(1)})`} color={CL} />
                  <Row label="Rec. en campo alto"   value={stats.recAltas ?? 0}       color={CA} />
                  <Row label="Pérdidas (peligrosas)" value={`${stats.perdidas??0}`}   sub={`(${stats.perdidasPeligrosas??0})`} color='#ef4444' />
                  <Row label="Duelos DEF"  value={`${stats.duelosDefGanados??0}/${stats.duelosDefTotales??0}`} sub={`(${stats.duelosDefTotales>0?Math.round((stats.duelosDefGanados/stats.duelosDefTotales)*100):0}%)`} />
                  <Row label="Duelos perdidos" value={stats.duelosDefPerdidos ?? 0} color='#ef4444' noBorder />
                </>)}
              </div>
            </div>

            {/* ══ GRILLA MAPAS — 2 columnas independientes con align-items:start ══ */}
            <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>

              {/* ── COL IZQUIERDA: Mapa ofensivo + Mapa distribución (fluyen solos) ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                {/* Mapa 1 */}
                <div style={{ background:'rgba(255,255,255,.02)', borderRadius:14, padding:18, border:'1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ fontSize:'1rem', fontWeight:900, color: isArquero ? '#3b82f6' : CL, marginBottom:4, fontFamily:FONT }}>
                    {isArquero ? 'MAPA DEL ARCO — TIROS RECIBIDOS' : 'MAPA OFENSIVO — REMATES Y ASISTENCIAS'}
                  </div>
                  <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.35)', marginBottom:12, fontFamily:FONT }}>
                    {isArquero ? `${accionesArco.length} acciones de arco` : `${accionesAtaque.length} acciones de finalización`}
                  </div>
                  <CanchaFutsal accionesMapa={isArquero ? accionesArco : accionesAtaque} dotSize={16} />
                  {isArquero && (
                    <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:8 }}>
                      <span style={{ fontSize:'.82rem', color:'rgba(255,255,255,.6)', fontWeight:700, fontFamily:FONT }}><span style={{ color:'#3b82f6' }}>●</span> Atajadas</span>
                      <span style={{ fontSize:'.82rem', color:'rgba(255,255,255,.6)', fontWeight:700, fontFamily:FONT }}><span style={{ color:'#ef4444' }}>●</span> Goles recibidos</span>
                    </div>
                  )}
                </div>

                {/* Mapa 2 */}
                <div style={{ background:'rgba(255,255,255,.02)', borderRadius:14, padding:18, border:'1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ fontSize:'1rem', fontWeight:900, color: isArquero ? CL : '#3b82f6', marginBottom:4, fontFamily:FONT }}>
                    {isArquero ? 'JUEGO CON LOS PIES Y DISTRIBUCIÓN' : 'DISTRIBUCIÓN Y LUCHA'}
                  </div>
                  <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.35)', marginBottom:12, fontFamily:FONT }}>
                    {isArquero ? `${accionesDistGK.length} acciones de juego con los pies` : `${accionesResto.length} acciones de recuperaciones, pérdidas y duelos`}
                  </div>
                  <CanchaFutsal accionesMapa={isArquero ? accionesDistGK : accionesResto} dotSize={16} />
                  <LeyendaMapaAdaptativa accionesMapa={isArquero ? accionesDistGK : accionesResto} />
                </div>
              </div>

              {/* ── COL DERECHA: cada bloque mide solo lo que necesita ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                {/* Destino de remates */}
                <div style={{ background:'rgba(255,255,255,.025)', borderRadius:14, padding:20, border:'1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ fontSize:'1rem', fontWeight:900, color:'#fff', marginBottom:16, fontFamily:FONT }}>
                    {isArquero ? 'COMPOSICIÓN TIROS AL ARCO' : 'DESTINO DE REMATES'}
                  </div>
                  {isArquero ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                      {[
                        { label:'Atajadas',        val:atajadas,       pct:pctAtajadas,     color:'#00e676' },
                        { label:'Goles recibidos', val:golesRecibidos, pct:100-pctAtajadas, color:'#ef4444' },
                      ].map((r, i) => (
                        <div key={i}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.95rem', fontWeight:700, marginBottom:6 }}>
                            <span style={{ color:r.color }}>{r.label}</span>
                            <span style={{ color:'#ccc', fontFamily:FONT }}>{r.val} <span style={{ color:'rgba(255,255,255,.3)', fontSize:'.82em' }}>({r.pct}%)</span></span>
                          </div>
                          <div style={{ width:'100%', height:8, background:'rgba(255,255,255,.07)', borderRadius:4, overflow:'hidden' }}>
                            <div style={{ width:`${r.pct}%`, height:'100%', background:r.color, borderRadius:4 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SeccionRemates dataRemates={dataRemates} totalRemates={stats.remates ?? 0} />
                  )}
                  {!isArquero && perfil.perfilRemate && (
                    <div style={{ display:'flex', gap:10, marginTop:16, paddingTop:14, borderTop:'1px solid rgba(255,255,255,.05)' }}>
                      <div style={{ flex:1, background:'rgba(255,255,255,.02)', padding:10, borderRadius:8, textAlign:'center' }}>
                        <div style={{ fontSize:'.6rem', color:'rgba(255,255,255,.4)', fontWeight:800, marginBottom:6, fontFamily:FONT }}>ZONA (CARRIL)</div>
                        <div style={{ display:'flex', justifyContent:'space-around', fontSize:'.9rem' }}>
                          <span style={{ color:'rgba(255,255,255,.6)' }}>Centro: <strong style={{color:'#fff',fontFamily:FONT}}>{perfil.perfilRemate.centro}</strong></span>
                          <span style={{ color:'rgba(255,255,255,.6)' }}>Banda: <strong style={{color:'#fff',fontFamily:FONT}}>{perfil.perfilRemate.banda}</strong></span>
                        </div>
                      </div>
                      <div style={{ flex:1, background:'rgba(255,255,255,.02)', padding:10, borderRadius:8, textAlign:'center' }}>
                        <div style={{ fontSize:'.6rem', color:'rgba(255,255,255,.4)', fontWeight:800, marginBottom:6, fontFamily:FONT }}>DISTANCIA</div>
                        <div style={{ display:'flex', justifyContent:'space-around', fontSize:'.9rem' }}>
                          <span style={{ color:'rgba(255,255,255,.6)' }}>Cerca: <strong style={{color:'#fff',fontFamily:FONT}}>{perfil.perfilRemate.cerca}</strong></span>
                          <span style={{ color:'rgba(255,255,255,.6)' }}>Lejos: <strong style={{color:'#fff',fontFamily:FONT}}>{perfil.perfilRemate.lejos}</strong></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Disciplina */}
                <div style={{ background:'rgba(255,255,255,.025)', borderRadius:14, padding:14, border:'1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ fontSize:'.9rem', fontWeight:900, color:CA, marginBottom:10, fontFamily:FONT }}>DISCIPLINA</div>
                  <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:6 }}>
                    <div style={{ display:'flex', gap:8 }}>
                      <div style={{ display:'flex', alignItems:'center', background:'#0a0a0a', padding:'6px 12px', borderRadius:6, gap:8 }}>
                        <div style={{ width:13, height:20, background:'#facc15', borderRadius:2 }} />
                        <div style={{ fontSize:'1.2rem', fontWeight:900, fontFamily:FONT }}>{amarillas}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', background:'#0a0a0a', padding:'6px 12px', borderRadius:6, gap:8 }}>
                        <div style={{ width:13, height:20, background:'#ef4444', borderRadius:2 }} />
                        <div style={{ fontSize:'1.2rem', fontWeight:900, fontFamily:FONT }}>{rojas}</div>
                      </div>
                    </div>
                    <div style={{ flex:1 }}>
                      <Row label="Faltas cometidas" value={stats.faltasCometidas ?? 0} noBorder />
                      <Row label="Faltas recibidas" value={stats.faltasRecibidas ?? 0} noBorder />
                    </div>
                  </div>
                </div>

                {/* Recuperaciones y pérdidas por zona */}
                {!isArquero && (() => {
                  const evRec  = accionesResto.filter(ev => (ev.accion||'').toLowerCase().includes('recuper'));
                  const evPerd = accionesResto.filter(ev => (ev.accion||'').toLowerCase().includes('pérdida') || (ev.accion||'').toLowerCase().includes('perdida'));
                  return (
                    <div style={{ background:'rgba(255,255,255,.025)', borderRadius:14, padding:14, border:'1px solid rgba(255,255,255,.05)', display:'flex', flexDirection:'column', gap:14 }}>
                      <CanchaZonas eventos={evRec}  colorBase="rgba(16,185,129,.9)" titulo="Recuperaciones por zona" />
                      <CanchaZonas eventos={evPerd} colorBase="rgba(239,68,68,.9)"  titulo="Pérdidas por zona" />
                    </div>
                  );
                })()}

                {/* Arquero: distribución */}
                {isArquero && (
                  <div style={{ background:'rgba(255,255,255,.025)', borderRadius:14, padding:14, border:'1px solid rgba(255,255,255,.05)' }}>
                    <div style={{ fontSize:'.9rem', fontWeight:900, color:'#0ea5e9', marginBottom:12, fontFamily:FONT }}>DISTRIBUCIÓN</div>
                    <Row label="Recuperaciones"     value={stats.recuperaciones ?? 0}    color={CL} />
                    <Row label="Pérdidas en salida" value={stats.perdidasPeligrosas ?? 0} color='#ef4444' />
                    <Row label="Asistencias"        value={stats.asistencias ?? 0}        color={CA} noBorder />
                  </div>
                )}

              </div>
            </div>

            {/* ══ FOOTER IQ + QUINTETO ══ */}
            <div style={{ background:'linear-gradient(90deg,#0d1528 0%,#050505 100%)', borderRadius:14, padding:20, border:'1px solid rgba(59,130,246,.25)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:28 }}>
              <div>
                <div style={{ fontSize:'.9rem', fontWeight:900, color:'#3b82f6', marginBottom:12, fontFamily:FONT }}>🧠 INTELIGENCIA TÁCTICA</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
                  <span style={{ color:'rgba(255,255,255,.55)', fontSize:'.9rem' }}>Transiciones rápidas involucradas</span>
                  <strong style={{ fontSize:'1.3rem', color:'#fff', fontFamily:FONT }}>{perfil.transicionesInvolucrado ?? 0}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
                  <span style={{ color:'rgba(255,255,255,.55)', fontSize:'.9rem' }}>xG Buildup (creación de juego)</span>
                  <strong style={{ fontSize:'1.3rem', color:CA, fontFamily:FONT }}>{fmt2(asNumber(perfil.xgBuildup))}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0' }}>
                  <span style={{ color:'rgba(255,255,255,.55)', fontSize:'.9rem' }}>Ratio seguridad (Rec/Perd)</span>
                  <strong style={{ fontSize:'1.3rem', color: asNumber(perfil.ratioSeguridad) >= 60 ? CL : '#ef4444', fontFamily:FONT }}>{perfil.ratioSeguridad ?? 0}%</strong>
                </div>
              </div>

              <div>
                <div style={{ fontSize:'.9rem', fontWeight:900, color:'#c084fc', marginBottom:12, fontFamily:FONT }}>🤝 MEJOR QUINTETO ESTRUCTURAL</div>
                <div style={{ background:'rgba(255,255,255,.03)', padding:12, borderRadius:10, display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-around', alignItems:'center' }}>
                    {/* Jugador principal */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                      <div style={{ width:52, height:52, borderRadius:'50%', background:'#111', border:`2px solid ${CL}`, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                        {jugador.foto ? <div style={{ width:'100%', height:'100%', backgroundImage:`url(${jugador.foto})`, backgroundSize:'cover', backgroundPosition:'center' }}/> : <span style={{color:CL,fontWeight:'bold',fontSize:'.9rem',fontFamily:FONT}}>{inicial}</span>}
                      </div>
                      <div style={{ fontSize:'.65rem', fontWeight:900, color:CL, fontFamily:FONT }}>{jugador.apellido}</div>
                    </div>
                    <div style={{ color:'rgba(255,255,255,.3)', fontWeight:900, fontSize:'1.2rem' }}>+</div>
                    {companerosQuinteto.length > 0 ? companerosQuinteto.map((s, i) => (
                      <div key={s.id||i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                        <div style={{ width:44, height:44, borderRadius:'50%', background:'#222', border:'2px solid #c084fc', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                          {s.foto ? <div style={{ width:'100%', height:'100%', backgroundImage:`url(${s.foto})`, backgroundSize:'cover', backgroundPosition:'center' }}/> : <span style={{color:'#c084fc',fontWeight:'bold',fontSize:'.8rem',fontFamily:FONT}}>{s.apellido?.substring(0,2).toUpperCase()}</span>}
                        </div>
                        <div style={{ fontSize:'.62rem', fontWeight:800, color:'rgba(255,255,255,.8)', textAlign:'center', fontFamily:FONT }}>{s.apellido}</div>
                      </div>
                    )) : <div style={{ color:'rgba(255,255,255,.25)', fontStyle:'italic', fontSize:'.8rem', flex:1, textAlign:'center' }}>Sin datos suficientes</div>}
                  </div>
                  {perfil?.mejorQuinteto && (
                    <div style={{ display:'flex', justifyContent:'space-around', borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:8 }}>
                      {[
                        { label:'Rating', val: perfil.mejorQuinteto.rating.toFixed(1), color: CL },
                        { label:'+/-',    val: `${perfil.mejorQuinteto.diffGoles>0?'+':''}${perfil.mejorQuinteto.diffGoles}`, color:'#fff' },
                        { label:'Mins',   val: `${perfil.mejorQuinteto.minutos.toFixed(0)}'`, color:'rgba(255,255,255,.6)' },
                      ].map((k,i) => (
                        <span key={i} style={{ fontSize:'.75rem', color:'rgba(255,255,255,.45)', fontFamily:FONT }}>
                          {k.label}: <strong style={{ color:k.color }}>{k.val}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ══ PIE DE PÁGINA ══ */}
            <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'.65rem', color:'rgba(255,255,255,.35)', letterSpacing:2, fontWeight:700, fontFamily:FONT }}>
                VIRTUAL.CLUB © {new Date().getFullYear()} · <span style={{ color:'rgba(253,125,5,.6)' }}>VirtualFutsal</span>
              </span>
              <span style={{ fontSize:'.65rem', color:'rgba(255,255,255,.35)', letterSpacing:1, fontWeight:700, fontFamily:FONT }}>
                {contexto === 'TODA LA TEMPORADA' ? `TEMPORADA ${new Date().getFullYear()}` : contexto}
              </span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerReportGenerator;