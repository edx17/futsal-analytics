import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import MatchReport from './MatchReport';

const CANVAS_SIZE = 1080; // px — ancho Y alto del lienzo cuadrado

const ReportGenerator = ({ data }) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const wrapperRef = useRef(null);

  /* ── Escala responsiva ──────────────────────────────── */
  useEffect(() => {
    const calcular = () => {
      const parent = wrapperRef.current?.parentElement;
      if (!parent) return;

      const anchoDisponible = parent.offsetWidth - 48;          // 24px c/lado
      const altoDisponible  = window.innerHeight * 0.80;        // 80% del viewport

      const eW = anchoDisponible / CANVAS_SIZE;
      const eH = altoDisponible  / CANVAS_SIZE;

      setEscala(Math.min(eW, eH, 1)); // nunca escalar por encima de 1:1
    };

    const t = setTimeout(calcular, 80);
    window.addEventListener('resize', calcular);
    return () => { clearTimeout(t); window.removeEventListener('resize', calcular); };
  }, []);

  /* ── Exportar PNG 2× ────────────────────────────────── */
  const exportarPNG = async () => {
    const el = document.getElementById('match-report-exportable');
    if (!el || exportando) return;
    setExportando(true);

    /* 1. Guardar estado actual */
    const prevTransform       = el.style.transform;
    const prevTransformOrigin = el.style.transformOrigin;
    const prevWidth           = el.style.width;
    const prevHeight          = el.style.height;

    /* 2. Resetear a tamaño nativo para captura limpia */
    el.style.transform       = 'none';
    el.style.transformOrigin = 'top left';
    el.style.width           = `${CANVAS_SIZE}px`;
    el.style.height          = `${CANVAS_SIZE}px`;

    try {
      const canvas = await html2canvas(el, {
        scale:           2,          // → 2160×2160px retina
        useCORS:         true,
        backgroundColor: '#0d0d0d',
        logging:         false,
        width:           CANVAS_SIZE,
        height:          CANVAS_SIZE,
        windowWidth:     CANVAS_SIZE,
        windowHeight:    CANVAS_SIZE,
      });

      /* 3. Descargar */
      const slugify = (s) =>
        (s || '').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);

      const nombreL = slugify(data?.equipos?.local?.nombre);
      const nombreV = slugify(data?.equipos?.visitante?.nombre);
      const fecha   = (data?.info?.fecha || '').replace(/\//g, '-');

      const link      = document.createElement('a');
      link.download   = `Reporte_${nombreL}_vs_${nombreV}_${fecha}.png`;
      link.href       = canvas.toDataURL('image/png');
      link.click();

    } catch (err) {
      console.error('❌ Error exportando reporte:', err);
      alert('Hubo un error al generar la imagen. Revisá la consola.');
    } finally {
      /* 4. Restaurar escala visual */
      el.style.transform       = prevTransform;
      el.style.transformOrigin = prevTransformOrigin;
      el.style.width           = prevWidth;
      el.style.height          = prevHeight;
      setExportando(false);
    }
  };

  if (!data) return null;

  const canvasPx = Math.floor(CANVAS_SIZE * escala);

  return (
    <div
      ref={wrapperRef}
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        padding:       '16px',
        gap:           '14px',
      }}
    >
      {/* ── Barra de control ──────────────────────────── */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        width:          `${canvasPx}px`,
        maxWidth:       '100%',
      }}>
        <div>
          <div style={{ color: '#00e676', fontWeight: 800, fontSize: '0.75rem', letterSpacing: 1 }}>
            VISTA PREVIA — {CANVAS_SIZE}×{CANVAS_SIZE} px
          </div>
          <div style={{ color: '#333', fontSize: '0.62rem', marginTop: 2 }}>
            Exporta a {CANVAS_SIZE * 2}×{CANVAS_SIZE * 2} px (2× retina) · Escala: {Math.round(escala * 100)}%
          </div>
        </div>

        <button
          onClick={exportarPNG}
          disabled={exportando}
          style={{
            background:   exportando ? '#1a1a1a' : '#00e676',
            color:        exportando ? '#555'     : '#000',
            fontWeight:   900,
            fontSize:     '0.78rem',
            padding:      '10px 18px',
            border:       'none',
            borderRadius: '6px',
            cursor:       exportando ? 'not-allowed' : 'pointer',
            letterSpacing: 0.5,
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            transition:   'transform 0.12s, background 0.2s',
          }}
          onMouseOver={(e) => { if (!exportando) e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseOut={(e)  => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {exportando ? '⏳ Generando imagen…' : '📲 Descargar PNG · Alta Calidad'}
        </button>
      </div>

      {/* ── Lienzo escalado ──────────────────────────────── */}
      <div
        style={{
          width:        `${canvasPx}px`,
          height:       `${canvasPx}px`,
          overflow:     'hidden',
          maxWidth:     '100%',
          borderRadius: `${Math.round(8 * escala)}px`,
          boxShadow:    '0 0 0 1px rgba(255,255,255,0.05), 0 16px 48px rgba(0,0,0,0.7)',
          flexShrink:   0,
        }}
      >
        <div
          style={{
            transform:       `scale(${escala})`,
            transformOrigin: 'top left',
            width:           `${CANVAS_SIZE}px`,
            height:          `${CANVAS_SIZE}px`,
          }}
        >
          <MatchReport data={data} />
        </div>
      </div>
    </div>
  );
};

export default ReportGenerator;