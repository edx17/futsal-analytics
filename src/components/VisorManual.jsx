import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { linkManual, linkManualAbsoluto } from '../utils/manual';

/* ══════════════════════════════════════════════════════════════════════════
   EL MANUAL, FLOTANDO ARRIBA DE LA APP

   Abre public/manual/index.html en la sección pedida sin salir de la
   pantalla. Desde acá se puede abrir en otra pestaña, copiar el link para
   pasárselo a alguien (no hace falta usuario para verlo) o guardarlo como PDF.
   ══════════════════════════════════════════════════════════════════════════ */
export default function VisorManual({ seccion = '', titulo = 'Manual de Virtual.Club', onCerrar }) {
  const marcoRef = useRef(null);
  const [aviso, setAviso] = useState('');

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2500); };

  const copiarLink = async () => {
    const link = linkManualAbsoluto(seccion);
    try {
      await navigator.clipboard.writeText(link);
      avisar('Link copiado ✅');
    } catch {
      avisar(link);
    }
  };

  /* El manual es del mismo dominio, así que se puede mandar a imprimir
     desde acá: el navegador ofrece "Guardar como PDF". El manual trae sus
     propios estilos de impresión (texto negro sobre blanco, sin índice). */
  const guardarPdf = () => {
    try {
      marcoRef.current?.contentWindow?.focus();
      marcoRef.current?.contentWindow?.print();
    } catch {
      window.open(linkManual(seccion), '_blank', 'noopener');
    }
  };

  /* Portal al body: la campanita vive dentro de la barra de arriba, y un
     ancestro con filtro o transform encerraría el position:fixed ahí. */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
      }}
    >
      <div style={{
        width: '100%', maxWidth: '1100px', height: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: '12px', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text)' }}>📖 {titulo}</strong>
            <button onClick={onCerrar} aria-label="Cerrar manual" style={{ ...btn, borderColor: 'transparent', fontSize: '1.2rem', padding: '4px 10px' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', maxWidth: '480px' }}>
            <button onClick={copiarLink} style={btn}>🔗 COPIAR LINK</button>
            <button onClick={guardarPdf} style={btn}>⬇ PDF</button>
            <a href={linkManual(seccion)} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↗ PESTAÑA</a>
          </div>
        </div>
        {aviso && (
          <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--accent)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>{aviso}</div>
        )}
        <iframe
          ref={marcoRef}
          title={titulo}
          src={linkManual(seccion)}
          style={{ flex: 1, width: '100%', border: 0, background: '#0A0908' }}
        />
      </div>
    </div>,
    document.body
  );
}

const btn = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px',
  padding: '6px 10px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', minHeight: '36px', whiteSpace: 'nowrap',
};
