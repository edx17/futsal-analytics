import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FORMATOS, CLAVES_FORMATO, FORMATO_POR_DEFECTO, formatoDe } from './formatos';
import { exportarPlaca } from './exportar';
import { asegurarEstilos, COLOR_CLUB, COLOR_RIVAL, aRGB } from './estilos';

/* EL MARCO DE TODAS LAS PLACAS
 *
 * Se ocupa de lo que antes repetía cada una: elegir formato, escalar la vista
 * para que entre en pantalla, y descargar. La placa en sí sólo dibuja.
 *
 * El nodo que se exporta es el MISMO que se ve, escalado con `transform`.
 * Tener un nodo oculto aparte —como hacía la placa de partido— es una fuente
 * segura de que lo exportado no sea lo que se vio.
 */
export default function VisorPlaca({
  children,                 // (formato) => JSX de la placa
  nombreArchivo = 'placa',
  formatos = CLAVES_FORMATO,
  formatoInicial = FORMATO_POR_DEFECTO,
  colorClub = COLOR_CLUB,
  onCerrar,
}) {
  asegurarEstilos();

  const [formato, setFormato] = useState(formatoInicial);
  const [escala, setEscala] = useState(0.4);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState(null);
  const marcoRef = useRef(null);
  const placaRef = useRef(null);

  const f = formatoDe(formato);

  /* La placa se dibuja a tamaño nativo y se encoge para entrar en el hueco. */
  useEffect(() => {
    const medir = () => {
      const cont = marcoRef.current?.parentElement;
      if (!cont) return;
      const anchoDisp = cont.clientWidth - 24;
      const altoDisp = Math.max(320, window.innerHeight - 220);
      setEscala(Math.min(anchoDisp / f.ancho, altoDisp / f.alto, 1));
    };
    medir();
    const t = setTimeout(medir, 60);
    window.addEventListener('resize', medir);
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); };
  }, [f.ancho, f.alto]);

  const descargar = useCallback(async () => {
    if (exportando) return;
    setExportando(true); setError(null);
    try {
      await exportarPlaca(placaRef.current, {
        nombre: `${nombreArchivo}-${f.id}`,
        ancho: f.ancho, alto: f.alto,
      });
    } catch (e) {
      console.error('Export de placa:', e);
      setError(e?.message || 'No se pudo generar la imagen.');
    } finally {
      setExportando(false);
    }
  }, [exportando, nombreArchivo, f]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>

      <div style={barra}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {formatos.map((k) => {
            const activo = formato === k;
            return (
              <button key={k} onClick={() => setFormato(k)} title={FORMATOS[k].ayuda}
                style={{ ...btnFormato, ...(activo ? { background: colorClub, color: '#04120C', borderColor: colorClub } : null) }}>
                {FORMATOS[k].label}
                <span style={{ opacity: .65, marginLeft: 7, fontSize: '.68rem' }}>
                  {FORMATOS[k].ancho}×{FORMATOS[k].alto}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={descargar} disabled={exportando}
            style={{ ...btnBajar, background: colorClub, opacity: exportando ? .6 : 1 }}>
            {exportando ? 'GENERANDO…' : '⬇ DESCARGAR PNG'}
          </button>
          {onCerrar && <button onClick={onCerrar} style={btnCerrar}>✕</button>}
        </div>
      </div>

      {error && (
        <div style={aviso}>
          No se pudo generar la imagen: {error}
          <div style={{ color: 'var(--text-dim)', fontSize: '.74rem', marginTop: 6 }}>
            Suele pasar cuando un escudo o una foto no permite su descarga. Probá de nuevo o sacá esa imagen.
          </div>
        </div>
      )}

      {/* El hueco reserva el alto que ocupa la placa ya escalada. */}
      <div ref={marcoRef} style={{ height: f.alto * escala, width: f.ancho * escala, position: 'relative' }}>
        <div
          ref={placaRef}
          className="pl"
          style={{
            width: f.ancho, height: f.alto,
            transform: `scale(${escala})`, transformOrigin: 'top left',
            '--pl-club': colorClub, '--pl-rival': COLOR_RIVAL,
            '--pl-club-rgb': aRGB(colorClub), '--pl-rival-rgb': aRGB(COLOR_RIVAL),
          }}
        >
          {typeof children === 'function' ? children(f) : children}
        </div>
      </div>
    </div>
  );
}

const barra = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
  flexWrap: 'wrap', width: '100%', maxWidth: '760px',
};
const btnFormato = {
  padding: '9px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '.78rem', fontWeight: 800,
  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)',
  fontFamily: 'inherit', letterSpacing: '.03em',
};
const btnBajar = {
  padding: '9px 20px', borderRadius: '8px', border: 'none', color: '#04120C',
  fontSize: '.78rem', fontWeight: 900, cursor: 'pointer', letterSpacing: '.04em',
};
const btnCerrar = {
  padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-dim)', fontSize: '.85rem', cursor: 'pointer',
};
const aviso = {
  width: '100%', maxWidth: '760px', padding: '12px 14px', borderRadius: '8px',
  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
  color: '#ef4444', fontSize: '.8rem',
};
