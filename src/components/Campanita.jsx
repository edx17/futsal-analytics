import { useState } from 'react';
import { useTablon } from '../utils/useTablon'; // vive junto a useEsMovil.js

const COLOR_PRIORIDAD = {
  bloqueante: '#ff5252',
  importante: '#ffc107',
  info: 'var(--accent, #00e676)',
};

const ETIQUETA_CATEGORIA = {
  calendario: 'Calendario',
  transferencias: 'Transferencias',
  personal: 'Personal',
  tesoreria: 'Tesorería',
};

// Todo el componente se resuelve con estilos inline a propósito: no depende de
// ninguna clase CSS que tengas que definir en otro archivo. El bug de layout
// que viste (el dropdown estirando el header) era justamente porque le faltaba
// position:absolute — al no existir esas clases en ningún .css, el div se
// renderizaba como un bloque normal dentro del flex del header.
export default function Campanita({ clubId, misCategorias }) {
  const { alertas, loading, descartar } = useTablon(clubId, misCategorias);
  const [abierto, setAbierto] = useState(false);

  const bloqueantes = alertas.filter((a) => a.prioridad === 'bloqueante').length;

  return (
    // position:relative ancla el dropdown a ESTE punto, sin ocupar espacio propio
    // en el flex del header (display:inline-block => no estira a los hermanos).
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setAbierto((o) => !o)}
        aria-label="Notificaciones"
        aria-expanded={abierto}
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 10,
          background: abierto ? '#1a1a1a' : '#111',
          border: `1px solid ${abierto ? 'var(--accent, #00e676)' : '#333'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        🔔
        {alertas.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 9,
              background: bloqueantes > 0 ? '#ff5252' : 'var(--accent, #00e676)',
              color: '#000',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.65rem',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #000',
              boxSizing: 'content-box',
            }}
          >
            {alertas.length}
          </span>
        )}
      </button>

      {abierto && (
        <>
          {/* Backdrop invisible: cierra el dropdown al tocar afuera (clave en mobile) */}
          <div
            onClick={() => setAbierto(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
          />

          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 320,
              maxWidth: 'calc(100vw - 24px)',
              maxHeight: 420,
              overflowY: 'auto',
              background: '#111',
              border: '1px solid #333',
              borderRadius: 12,
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
              zIndex: 1000,
              padding: 8,
              animation: 'fadeIn 0.15s',
            }}
          >
            {loading && (
              <p style={{ color: 'var(--text-dim, #888)', fontSize: '0.85rem', textAlign: 'center', padding: 16, margin: 0 }}>
                Cargando...
              </p>
            )}
            {!loading && alertas.length === 0 && (
              <p style={{ color: 'var(--text-dim, #888)', fontSize: '0.85rem', textAlign: 'center', padding: 16, margin: 0 }}>
                No hay pendientes. 🎉
              </p>
            )}
            {!loading &&
              alertas.map((a) => (
                <a
                  key={a.id}
                  href={a.ruta || '#'}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 8px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a1a'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: COLOR_PRIORIDAD[a.prioridad],
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <small style={{ color: 'var(--accent, #00e676)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {ETIQUETA_CATEGORIA[a.categoria] || a.categoria}
                    </small>
                    <p style={{ margin: '2px 0 0', color: '#fff', fontSize: '0.85rem', lineHeight: 1.35 }}>
                      {a.titulo}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      descartar(a.id);
                    }}
                    aria-label="Descartar"
                    style={{
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      color: '#888',
                      borderRadius: 6,
                      width: 22,
                      height: 22,
                      flexShrink: 0,
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </a>
              ))}
          </div>
        </>
      )}
    </div>
  );
}