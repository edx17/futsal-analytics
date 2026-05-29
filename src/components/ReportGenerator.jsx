import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import MatchReport from './MatchReport';

const CANVAS_SIZE = 1080; // px — ancho Y alto del lienzo cuadrado

const ReportGenerator = ({ data }) => {
  const [escala, setEscala]       = useState(1);
  const [exportando, setExportando] = useState(false);
  const wrapperRef  = useRef(null);
  const exportRef   = useRef(null); // nodo oculto a tamaño nativo 1080×1080

  /* ── Escala responsiva ──────────────────────────────── */
  useEffect(() => {
    const calcular = () => {
      const parent = wrapperRef.current?.parentElement;
      if (!parent) return;

      const anchoDisponible = parent.offsetWidth - 48;
      const altoDisponible  = window.innerHeight * 0.80;

      const eW = anchoDisponible / CANVAS_SIZE;
      const eH = altoDisponible  / CANVAS_SIZE;

      setEscala(Math.min(eW, eH, 1));
    };

    const t = setTimeout(calcular, 80);
    window.addEventListener('resize', calcular);
    return () => { clearTimeout(t); window.removeEventListener('resize', calcular); };
  }, []);

  /* ── Exportar PNG 2× ────────────────────────────────── */
  const exportarPNG = async () => {
    const el = exportRef.current;
    if (!el || exportando) return;
    setExportando(true);

    try {
      // Breve espera para que los gráficos Recharts terminen de pintarse
      await new Promise(r => setTimeout(r, 300));

      const canvas = await html2canvas(el, {
        scale: window.innerWidth < 768 ? 1.5 : 2,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: '#0d0d0d',
        logging:         false,
        width:           CANVAS_SIZE,
        height:          CANVAS_SIZE,
        windowWidth:     CANVAS_SIZE,
        windowHeight:    CANVAS_SIZE,
        // Ignorar canvas de 0x0 que rompen Android
        ignoreElements:  (el) => el.tagName === 'CANVAS' && (el.width === 0 || el.height === 0),
        onclone: (clonedDoc) => {
          const root = clonedDoc.documentElement;
          root.style.setProperty('--c-local',    '#00e676');
          root.style.setProperty('--c-visita',   '#ff1744');
          root.style.setProperty('--c-accent',   '#ffffff');
          root.style.setProperty('--c-bg',       '#0d0d0d');
          root.style.setProperty('--c-surface',  '#161616');
          root.style.setProperty('--c-surface2', '#1e1e1e');
          root.style.setProperty('--c-border',   'rgba(255,255,255,0.07)');
          root.style.setProperty('--c-dim',      '#666');
          root.style.setProperty('--c-text',     '#ffffff');
          root.style.setProperty('--font-display','JetBrains Mono, monospace');
          root.style.setProperty('--font-body',  'system-ui, -apple-system, sans-serif');
          // Neutralizar repeating-linear-gradient que rompe Android
          clonedDoc.querySelectorAll('*').forEach(node => {
            const bg = node.style?.backgroundImage || '';
            if (bg.includes('repeating-linear-gradient')) {
              node.style.backgroundImage = 'none';
            }
          });
        },
      });

      /* Descargar — compatible Android + iOS */
      const slugify = (s) =>
        (s || '').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 20);

      const nombreL  = slugify(data?.equipos?.local?.nombre);
      const nombreV  = slugify(data?.equipos?.visitante?.nombre);
      const fecha    = (data?.info?.fecha || '').replace(/\//g, '-');
      const fileName = `Reporte_${nombreL}_vs_${nombreV}_${fecha}.png`;

      const isIOS    = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isIOS) {
        const dataUrl = canvas.toDataURL('image/png');
        const w = window.open('', '_blank');
        if (w) {
          w.document.write('<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;flex-direction:column;align-items:center"><p style="color:#fff;font-family:monospace;font-size:14px;padding:16px;text-align:center">Mantené pulsada la imagen para guardarla</p><img src="' + dataUrl + '" style="max-width:100%;display:block"/></body></html>');
          w.document.close();
        } else {
          alert('Activá ventanas emergentes para descargar.');
        }
      } else if (isMobile) {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url  = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href     = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
      } else {
        const link    = document.createElement('a');
        link.download = fileName;
        link.href     = canvas.toDataURL('image/png');
        link.click();
      }

    } catch (err) {
      console.error('MatchReport export error:', err);
      alert('Error: ' + (err?.message || String(err)));
    } finally {
      setExportando(false);
    }
  };

  if (!data) return null;

  const canvasPx = Math.floor(CANVAS_SIZE * escala);

  return (
    <div
      ref={wrapperRef}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', gap: '14px' }}
    >
      {/* ── Barra de control ──────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: `${canvasPx}px`, maxWidth: '100%',
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
            background:    exportando ? '#1a1a1a' : '#00e676',
            color:         exportando ? '#555'    : '#000',
            fontWeight:    900,
            fontSize:      '0.78rem',
            padding:       '10px 18px',
            border:        'none',
            borderRadius:  '6px',
            cursor:        exportando ? 'not-allowed' : 'pointer',
            letterSpacing: 0.5,
            display:       'flex',
            alignItems:    'center',
            gap:           8,
            transition:    'transform 0.12s, background 0.2s',
          }}
          onMouseOver={(e) => { if (!exportando) e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseOut={(e)  => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {exportando ? '⏳ Generando imagen…' : '📲 Descargar PNG · Alta Calidad'}
        </button>
      </div>

      {/* ── Lienzo visible (escalado) ─────────────────── */}
      <div style={{
        width: `${canvasPx}px`, height: `${canvasPx}px`,
        overflow: 'hidden', maxWidth: '100%',
        borderRadius: `${Math.round(8 * escala)}px`,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 16px 48px rgba(0,0,0,0.7)',
        flexShrink: 0,
      }}>
        <div style={{
          transform: `scale(${escala})`, transformOrigin: 'top left',
          width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px`,
        }}>
          <MatchReport data={data} />
        </div>
      </div>

      {/* ── Nodo OCULTO a tamaño nativo — solo para html2canvas ── */}
      {/*
        Está fuera del viewport (position absolute + left muy negativo)
        pero sigue montado en el DOM con dimensiones reales, así que
        Recharts / SVGs renderizan correctamente sin transform de por medio.
      */}
     <div
  style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: `${CANVAS_SIZE}px`,
    height: `${CANVAS_SIZE}px`,
    opacity: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: -1,
  }}
  aria-hidden="true"
>
  <div
    ref={exportRef}
    style={{
      width: `${CANVAS_SIZE}px`,
      height: `${CANVAS_SIZE}px`
    }}
  >
    <MatchReport data={data} />
  </div>
</div>

    </div>
  );
};

export default ReportGenerator;