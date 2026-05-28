import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';

const CANVAS_W = 1080;
const CANVAS_H = 1920;

const asNumber = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const fmt1  = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');
const fmt2  = (v) => (typeof v === 'number' ? v.toFixed(2) : '0.00');
const fmtPM = (v) => { const n = asNumber(v); return n > 0 ? `+${n}` : `${n}`; };

/* ── Paleta ── */
const C = '#00e676';
const CDim = 'rgba(255,255,255,.65)';
const FONT_MONO = "'JetBrains Mono', monospace";

/* ── Sub-componentes de render (no interactivos, para html2canvas) ── */

const BgDeco = () => (
  <>
    {/* SVG — reemplaza repeating-linear-gradient que rompe html2canvas en Android */}
    <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0 }}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="igGrid" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(255,255,255,.015)" strokeWidth="1"/>
        </pattern>
        <radialGradient id="blobL" cx="0%" cy="0%" r="60%">
          <stop offset="0%" stopColor="#00e676" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#00e676" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blobR" cx="100%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#6464ff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#6464ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#igGrid)" />
      <rect width="100%" height="100%" fill="url(#blobL)" />
      <rect width="100%" height="100%" fill="url(#blobR)" />
    </svg>
    {[
      { top:28, left:28,  borderTop:'1px solid rgba(0,230,118,.35)', borderLeft:'1px solid rgba(0,230,118,.35)' },
      { top:28, right:28, borderTop:'1px solid rgba(0,230,118,.35)', borderRight:'1px solid rgba(0,230,118,.35)' },
      { bottom:28, left:28,  borderBottom:'1px solid rgba(255,255,255,.1)', borderLeft:'1px solid rgba(255,255,255,.1)' },
      { bottom:28, right:28, borderBottom:'1px solid rgba(255,255,255,.1)', borderRight:'1px solid rgba(255,255,255,.1)' },
    ].map((s, i) => (
      <div key={i} style={{ position:'absolute', width:48, height:48, zIndex:4, ...s }}/>
    ))}
  </>
);

const RiverRow = ({ label, value, maxValue, color = C }) => {
  const pct = maxValue > 0 ? Math.min((Math.abs(value) / maxValue) * 100, 100) : 0;
  const display = typeof value === 'number' && value > 0 ? `+${value}` : value;
  return (
    <div style={{ display:'flex', alignItems:'center', height:52 }}>
      <div style={{ width:110, textAlign:'right', paddingRight:20, fontSize:'2rem', fontWeight:900, fontFamily:FONT_MONO, color, flexShrink:0 }}>
        {display}
      </div>
      <div style={{ flex:1, position:'relative', height:10, background:'rgba(255,255,255,.05)', borderRadius:5, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', borderRadius:5, background:`linear-gradient(90deg,rgba(0,230,118,.45),${color})` }}/>
        <div style={{
          position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
          fontSize:'.8rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase',
          color:'rgba(255,255,255,.45)', whiteSpace:'nowrap', background:'#050505', padding:'2px 10px',
          fontFamily:FONT_MONO
        }}>{label}</div>
      </div>
      <div style={{ width:110, paddingLeft:20, fontSize:'.8rem', fontWeight:700, fontFamily:FONT_MONO, color:'rgba(255,255,255,.7)', flexShrink:0 }}>
        MAX
      </div>
    </div>
  );
};

const KpiCell = ({ label, value, color = '#fff' }) => (
  <div style={{
    background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)',
    borderRadius:12, padding:'22px 14px', textAlign:'center', display:'flex', flexDirection:'column', gap:6
  }}>
    <div style={{ fontSize:'2.6rem', fontWeight:900, fontFamily:FONT_MONO, lineHeight:1, letterSpacing:-2, color }}>{value}</div>
    <div style={{ fontSize:'.68rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:CDim, fontFamily:FONT_MONO }}>{label}</div>
  </div>
);

const QuintetoPlayer = ({ jugador: j, isMain = false }) => {
  const size    = isMain ? 72 : 54;
  const mt      = isMain ? 0  : 9;
  const color   = isMain ? C  : 'rgba(255,255,255,.35)';
  const bdr     = isMain
    ? '2px solid rgba(0,230,118,.4)'
    : j ? '1.5px solid rgba(255,255,255,.14)' : '1.5px dashed rgba(255,255,255,.07)';
  const bg      = isMain ? 'rgba(0,230,118,.08)' : 'rgba(255,255,255,.04)';
  const initial = j ? (j.apellido || '?').charAt(0).toUpperCase() : '·';

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, zIndex:1 }}>
      <div style={{ width:size, height:size, borderRadius:'50%', background:bg, border:bdr, display:'flex', alignItems:'center', justifyContent:'center', marginTop:mt, overflow:'hidden', flexShrink:0 }}>
        {j?.foto
          ? <div style={{ width:'100%', height:'100%', backgroundImage:`url(${j.foto})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
          : <span style={{ fontSize: isMain?'1.9rem':'1.3rem', fontWeight:900, color: j ? color : 'rgba(255,255,255,.25)', fontFamily:FONT_MONO }}>{initial}</span>
        }
      </div>
      <span style={{ fontSize:'.64rem', fontWeight:700, textTransform:'uppercase', color: isMain ? C : (j ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.2)'), letterSpacing:.5, textAlign:'center', maxWidth:82, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {j ? `#${j.dorsal || '?'} ${(j.apellido || '').substring(0,10)}` : '—'}
      </span>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════ */
const PlayerReportIGStory = ({ jugador, perfil, contexto, jugadores = [], quintetoResuelto = null }) => {
  const [escala,    setEscala]    = useState(1);
  const [exportando, setExportando] = useState(false);
  const wrapperRef = useRef(null);

  const isArquero = perfil?.rol === 'ARQUERO' || (jugador?.posicion || '').toLowerCase().includes('arquero');
  const stats     = perfil?.stats ?? {};
  const clubName  = localStorage.getItem('mi_club') || 'VIRTUAL FUTSAL';
  const escudoUrl = localStorage.getItem('escudo_url') || null;

  /* ── Cálculos de stats ── */
  const goles         = asNumber(stats.goles);
  const asistencias   = asNumber(stats.asistencias);
  const remates       = asNumber(stats.remates);
  const recuperaciones = asNumber(stats.recuperaciones);
  const perdidas      = asNumber(stats.perdidas);
  const plusMinus     = asNumber(perfil?.plusMinus);
  const impacto       = asNumber(perfil?.impacto);
  const minutos       = asNumber(perfil?.minutos);
  const partidos      = asNumber(perfil?.partidosJugados);
  const xgBuildup     = asNumber(perfil?.xgBuildup);
  const amarillas     = asNumber(stats.amarillas);
  const rojas         = asNumber(stats.rojas);

  // Arquero: leer desde perfil.total* donde el engine los deposita
  const atajadas       = asNumber(perfil?.totalAtajadas ?? stats.atajadas);
  const golesRecibidos = asNumber(perfil?.totalGolesRecibidos ?? stats.golesRecibidos);
  const tirosRecibidos = atajadas + golesRecibidos;
  const pctAtajadas    = tirosRecibidos > 0 ? Math.round((atajadas / tirosRecibidos) * 100) : 0;

  const totalDuelosOfe = asNumber(stats.duelosOfeGanados) + asNumber(stats.duelosOfePerdidos);
  const totalDuelosDef = asNumber(stats.duelosDefGanados) + asNumber(stats.duelosDefPerdidos);
  const totalDuelos    = totalDuelosOfe + totalDuelosDef;
  const duelosGanados  = asNumber(stats.duelosOfeGanados) + asNumber(stats.duelosDefGanados);
  const pctDuelos      = totalDuelos > 0 ? Math.round((duelosGanados / totalDuelos) * 100) : 0;

  const conversionPct = remates > 0 ? Math.round((goles / remates) * 100) : 0;

  const faltasCometidas = asNumber(stats.faltasCometidas);
  const faltasRecibidas = asNumber(stats.faltasRecibidas);
  const pmDisplay       = plusMinus > 0 ? `+${plusMinus}` : String(plusMinus);

  /* ── Grilla 2×3 diferenciada por rol ── */
  const cardGrid = isArquero ? [
    { label:'Atajadas',        value: atajadas,        color:'#3b82f6', sub:`${pctAtajadas}% efectividad · ${tirosRecibidos} tiros` },
    { label:'Goles recibidos', value: golesRecibidos,  color:'#ff1744', sub:`xG recibido: ${fmt2(asNumber(perfil?.xgEnContra))}` },
    { label:'Recuperaciones',  value: recuperaciones,  color: C,        sub:`${perdidas} pérdidas` },
    { label:'Plus / Minus',    value: pmDisplay,       color: plusMinus >= 0 ? C : '#ff1744', sub:'Diferencial de goles' },
    { label:'Minutos',         value: `${minutos}'`,   color:'rgba(255,255,255,.7)', sub:`${partidos} partidos` },
    { label:'xG Buildup',      value: fmt2(xgBuildup), color:'#ffd600', sub:'Creación de juego' },
  ] : [
    { label:'Goles',           value: goles,           color: C,        sub:`${remates} remates · ${conversionPct}% conv.` },
    { label:'Asistencias',     value: asistencias,     color:'#ffd600', sub:`${fmt2(xgBuildup)} xG buildup` },
    { label:'Recuperaciones',  value: recuperaciones,  color:'#3b82f6', sub:`${perdidas} pérdidas` },
    { label:'Pérdidas',        value: perdidas,        color:'#ff1744', sub:`${recuperaciones} recuperaciones` },
    { label:'Faltas',          value: faltasCometidas, color:'#facc15', sub:`${faltasRecibidas} rec · ${amarillas}🟨 ${rojas}🟥` },
    { label:'Plus / Minus',    value: pmDisplay,       color: plusMinus >= 0 ? C : '#ff1744', sub:`${minutos}' · ${pctDuelos}% duelos` },
  ];

    /* ── Quinteto ──
     Usamos quintetoResuelto cuando viene desde JugadorPerfil (ya buscados con ==).
     Fallback: resolver acá con String() para tolerancia de tipos.
  */
  let companerosQuinteto = [null, null, null, null];
  let ratingEstruc = null;
  let diffGoles    = null;

  if (perfil?.mejorQuinteto) {
    ratingEstruc = perfil.mejorQuinteto.rating != null
      ? Number(perfil.mejorQuinteto.rating).toFixed(1) : null;
    diffGoles = perfil.mejorQuinteto.diffGoles;

    if (quintetoResuelto) {
      // Viene pre-resuelto desde JugadorPerfil — filtramos al jugador principal
      const sinPrincipal = quintetoResuelto
        .filter(j => j && String(j.id) !== String(jugador.id))
        .slice(0, 4);
      companerosQuinteto = sinPrincipal;
      while (companerosQuinteto.length < 4) companerosQuinteto.push(null);
    } else {
      // Fallback: resolver localmente
      const otrosIds = (perfil.mejorQuinteto.ids || [])
        .filter(id => String(id) !== String(jugador.id))
        .slice(0, 4);
      companerosQuinteto = otrosIds.map(id =>
        jugadores.find(j => String(j.id) === String(id)) || null
      );
      while (companerosQuinteto.length < 4) companerosQuinteto.push(null);
    }
  } else if (perfil?.topSocios && perfil.topSocios.length > 0) {
    companerosQuinteto = perfil.topSocios.slice(0, 4);
    while (companerosQuinteto.length < 4) companerosQuinteto.push(null);
  }

  /* ── Escala responsive ── */
  useEffect(() => {
    const calcular = () => {
      const parent = wrapperRef.current?.parentElement || document.body;
      const anchoDisponible = parent.offsetWidth - 48;
      const altoDisponible  = window.innerHeight * 0.9;
      setEscala(Math.min(anchoDisponible / CANVAS_W, altoDisponible / CANVAS_H, 1));
    };
    const t = setTimeout(calcular, 80);
    window.addEventListener('resize', calcular);
    return () => { clearTimeout(t); window.removeEventListener('resize', calcular); };
  }, []);

  /* ── Export PNG — compatible iOS + Android ── */
  const exportarPNG = async () => {
    const scaleWrapper = document.getElementById('ig-scale-wrapper');
    const containerDiv = scaleWrapper?.parentElement;
    const el           = document.getElementById('ig-story-exportable');
    if (!el || !scaleWrapper || !containerDiv || exportando) return;
    setExportando(true);
    const origTransform = scaleWrapper.style.transform;
    const origW         = containerDiv.style.width;
    const origH         = containerDiv.style.height;
    scaleWrapper.style.transform = 'scale(1)';
    containerDiv.style.width     = `${CANVAS_W}px`;
    containerDiv.style.height    = `${CANVAS_H}px`;
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(el, {
          scale: 2, useCORS: true, backgroundColor: '#050505', logging: false,
          onclone: (doc) => { doc.documentElement.style.setProperty('--c-accent', '#00e676'); }
        });
        const fileName = `Story_${jugador?.apellido || 'Jugador'}_${contexto || 'Temporada'}.png`;
        const isIOS    = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isIOS) {
          const dataUrl = canvas.toDataURL('image/png');
          const w = window.open('', '_blank');
          if (w) {
            w.document.write('<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;flex-direction:column;align-items:center"><p style="color:#fff;font-family:monospace;font-size:14px;padding:16px;text-align:center">📸 Mantené pulsada la imagen → <strong>Añadir a fotos</strong></p><img src="' + dataUrl + '" style="max-width:100%;display:block" /></body></html>');
            w.document.close();
          } else {
            alert('Permitir ventanas emergentes para descargar.');
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
      } catch (err) {
        console.error('IGStory export error:', err);
        alert('Error: ' + (err?.message || String(err)));
      } finally {
        scaleWrapper.style.transform = origTransform;
        containerDiv.style.width     = origW;
        containerDiv.style.height    = origH;
        setExportando(false);
      }
    }, 300);
  };

  if (!jugador || !perfil) return null;

  const inicial = (jugador.apellido || '?').charAt(0).toUpperCase();
  const ratingColor = impacto >= 7 ? C : impacto >= 6 ? '#ffd600' : '#ff1744';

  return (
    <div ref={wrapperRef} style={{ display:'flex', flexDirection:'column', alignItems:'center', fontFamily:"'Inter', system-ui, sans-serif" }}>

      {/* Botón export */}
      <div style={{ width:`${CANVAS_W * escala}px`, display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
        <button
          onClick={exportarPNG}
          disabled={exportando}
          style={{ background: exportando ? '#1a1a1a' : C, color: exportando ? '#555' : '#000', fontWeight:900, fontSize:'.9rem', padding:'12px 24px', border:'none', borderRadius:6, cursor: exportando ? 'not-allowed' : 'pointer' }}
        >
          {exportando ? '⏳ Generando...' : '📸 DESCARGAR STORY'}
        </button>
      </div>

      {/* Viewport escalado */}
      <div style={{ width:`${CANVAS_W * escala}px`, height:`${CANVAS_H * escala}px`, overflow:'hidden', borderRadius:`${Math.round(20 * escala)}px`, boxShadow:'0 20px 50px rgba(0,0,0,.8)' }}>
        <div id="ig-scale-wrapper" style={{ transform:`scale(${escala})`, transformOrigin:'top left', width:CANVAS_W, height:CANVAS_H }}>

          {/* ══ LIENZO EXPORTABLE ══ */}
          <div id="ig-story-exportable" style={{
            width:CANVAS_W, height:CANVAS_H,
            background:'#050505', color:'#fff',
            boxSizing:'border-box', position:'relative', overflow:'hidden',
            display:'flex', flexDirection:'column'
          }}>
            <BgDeco />

            {/* ── ZONE 1: HERO ── */}
            <div style={{
              position:'relative', zIndex:2, height:860, flexShrink:0,
              display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', padding:'60px 70px 40px', gap:0
            }}>
              {/* Club + contexto */}
              <div style={{ fontSize:'.8rem', fontWeight:700, letterSpacing:4, textTransform:'uppercase', color:'rgba(255,255,255,.55)', marginBottom:36, fontFamily:FONT_MONO }}>
                {clubName} · {contexto || 'Temporada 2025'}
              </div>

              {/* Avatar */}
              <div style={{
                width:180, height:180, borderRadius:'50%',
                background:'rgba(0,230,118,.08)', border:'3px solid rgba(0,230,118,.28)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'4.5rem', fontWeight:900, color:C, marginBottom:30,
                flexShrink:0, overflow:'hidden', fontFamily:FONT_MONO
              }}>
                {jugador.foto
                  ? <div style={{ width:'100%', height:'100%', backgroundImage:`url(${jugador.foto})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
                  : inicial
                }
              </div>

              {/* Dorsal + rol */}
              <div style={{ fontSize:'.82rem', fontWeight:700, letterSpacing:4, color:'rgba(255,255,255,.6)', marginBottom:6, fontFamily:FONT_MONO }}>
                #{jugador.dorsal || '—'} · {jugador.posicion || ''}
              </div>

              {/* Apellido */}
              <div style={{
                fontSize:'5.2rem', fontWeight:900, textTransform:'uppercase',
                letterSpacing:-4, lineHeight:.9, textAlign:'center',
                marginBottom:8, color: C
              }}>
                {jugador.apellido}
              </div>

              {/* Nombre */}
              <div style={{ fontSize:'1.6rem', fontWeight:400, color:'rgba(255,255,255,.6)', marginBottom:22, letterSpacing:1 }}>
                {jugador.nombre}
              </div>

              {/* Pills */}
              <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', justifyContent:'center', marginBottom:48 }}>
                {jugador.posicion && (
                  <div style={{ padding:'5px 16px', borderRadius:20, fontSize:'.68rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', fontFamily:FONT_MONO, background:'rgba(0,230,118,.1)', border:'1px solid rgba(0,230,118,.25)', color:C }}>
                    {jugador.posicion}
                  </div>
                )}
                {perfil.rol && (
                  <div style={{ padding:'5px 16px', borderRadius:20, fontSize:'.68rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', fontFamily:FONT_MONO, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.2)', color:'rgba(255,255,255,.75)' }}>
                    {perfil.rol}
                  </div>
                )}
                {contexto && (
                  <div style={{ padding:'5px 16px', borderRadius:20, fontSize:'.68rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', fontFamily:FONT_MONO, background:'rgba(255,214,0,.07)', border:'1px solid rgba(255,214,0,.2)', color:'#ffd600' }}>
                    {contexto}
                  </div>
                )}
              </div>

              {/* Rating mega */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                <div style={{ fontSize:'9rem', fontWeight:900, fontFamily:FONT_MONO, lineHeight:.85, letterSpacing:-6, color: ratingColor }}>
                  {fmt1(impacto)}
                </div>
                <div style={{ fontSize:'.66rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(255,255,255,0.60)', fontFamily:FONT_MONO }}>
                  Rating de impacto
                </div>
              </div>
            </div>

            {/* ── DIVIDER ── */}
            <div style={{ height:1, flexShrink:0, background:'linear-gradient(90deg,transparent,rgba(0,230,118,.4),rgba(0,230,118,.1),transparent)', position:'relative', zIndex:3 }}/>

            {/* ── ZONE 2+3: TARJETAS 2×3 ── */}
            <div style={{ position:'relative', zIndex:2, padding:'28px 56px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, flexShrink:0 }}>
              {cardGrid.map((c, i) => (
                <div key={i} style={{
                  background:'rgba(255,255,255,.03)',
                  border:'1px solid rgba(255,255,255,.07)',
                  borderTop:`2px solid ${c.color}`,
                  borderRadius:12, padding:'22px 16px 16px',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:7, textAlign:'center'
                }}>
                  <div style={{ fontSize:'3.2rem', fontWeight:900, fontFamily:FONT_MONO, lineHeight:1, letterSpacing:-2, color:c.color }}>
                    {c.value}
                  </div>
                  <div style={{ fontSize:'.68rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:'rgba(255,255,255,.8)', fontFamily:FONT_MONO }}>
                    {c.label}
                  </div>
                  {c.sub && (
                    <div style={{ fontSize:'.58rem', fontWeight:600, color:'rgba(255,255,255,.36)', fontFamily:FONT_MONO, letterSpacing:.3, lineHeight:1.4 }}>
                      {c.sub}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── ZONE 3: QUINTETO + BRAND ── */}
            <div style={{ position:'relative', zIndex:2, flex:1, padding:'8px 56px 56px', display:'flex', flexDirection:'column', gap:18 }}>

              {/* Quinteto */}              {/* Quinteto */}
              <div style={{
                background:'rgba(255,255,255,.025)', border:'1px solid rgba(255,255,255,.06)',
                borderRadius:12, padding:'20px 24px', display:'flex', flexDirection:'column', gap:14
              }}>
                <div style={{ fontSize:'.68rem', fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'rgba(255,255,255,.65)', fontFamily:FONT_MONO }}>
                  Mejor quinteto estructural
                  {ratingEstruc ? ` · Rating ${ratingEstruc}` : ''}
                  {diffGoles != null ? ` · ${diffGoles > 0 ? '+' : ''}${diffGoles} goles` : ''}
                </div>

                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative' }}>
                  {/* línea conectora */}
                  <div style={{ position:'absolute', top:34, left:58, right:58, height:1, background:'rgba(255,255,255,.07)', zIndex:0 }}/>

                  <QuintetoPlayer jugador={jugador} isMain />
                  {companerosQuinteto.map((c, i) => <QuintetoPlayer key={i} jugador={c} />)}
                </div>
              </div>

              {/* Brand */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'auto' }}>
                <span style={{ fontSize:'1.4rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', fontFamily:FONT_MONO, color:'rgba(255,255,255,0.70)' }}>
                  VIRTUAL.CLUB
                </span>
                <span style={{ fontSize:'1.4rem', fontWeight:700, letterSpacing:2, textTransform:'uppercase', fontFamily:FONT_MONO, color:'rgba(253,125,5,.2)' }}>
                  Virtual.Futsal
                </span>
              </div>

            </div>
          </div>
          {/* ══ FIN LIENZO ══ */}

        </div>
      </div>
    </div>
  );
};

export default PlayerReportIGStory;