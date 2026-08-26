import { useState, useEffect } from 'react';
import { useTablon } from '../utils/useTablon'; // vive junto a useEsMovil.js
import { activarNotificaciones, estaSuscripto, pushSoportado, diagnosticarPush } from '../utils/pushNotificaciones';

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
export default function Campanita({ clubId, misCategorias, perfilId }) {
  const { alertas, loading, descartar } = useTablon(clubId, misCategorias);
  const [abierto, setAbierto] = useState(false);
  const [pushEstado, setPushEstado] = useState('desconocido'); // desconocido | activando | activo | error | no-soportado
  const [pushMotivo, setPushMotivo] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null);

  useEffect(() => {
    if (!pushSoportado()) { setPushEstado('no-soportado'); return; }
    estaSuscripto().then((si) => setPushEstado(si ? 'activo' : 'inactivo'));
  }, []);

  const handleActivarPush = async () => {
    setPushEstado('activando');
    setPushMotivo(null);
    const res = await activarNotificaciones(clubId, perfilId);
    setPushEstado(res.ok ? 'activo' : 'error');
    /* El motivo se muestra: "no se pudo activar" a secas no le sirve a nadie
       para saber si falta la clave, si el navegador está bloqueado o si es un
       permiso de la base. */
    if (!res.ok) {
      setPushMotivo(res.mensaje + (res.detalle ? ` (${res.detalle})` : ''));
      /* Si falló, el diagnóstico se abre solo: es el momento en que sirve. */
      setDiagnostico(await diagnosticarPush(clubId, perfilId));
    }
  };

  const handleDiagnosticar = async () => {
    setDiagnostico({ cargando: true });
    setDiagnostico(await diagnosticarPush(clubId, perfilId));
  };

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
          background: abierto ? 'var(--hover)' : 'var(--panel)',
          border: `1px solid ${abierto ? 'var(--accent, #00e676)' : 'var(--border)'}`,
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
              border: '2px solid var(--panel)',
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
              background: 'var(--panel)',
              border: '1px solid var(--border)',
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
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
                    <p style={{ margin: '2px 0 0', color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.35 }}>
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
                      background: 'var(--hover)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-dim)',
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

            {pushEstado !== 'no-soportado' && (
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 8 }}>
                {pushEstado === 'activo' ? (
                  <p style={{ margin: 0, padding: '4px 8px', fontSize: '0.75rem', color: 'var(--accent, #00e676)', textAlign: 'center' }}>
                    🔔 Notificaciones activadas en este dispositivo
                  </p>
                ) : (
                  <button
                    onClick={handleActivarPush}
                    disabled={pushEstado === 'activando'}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: '1px dashed var(--border)',
                      color: 'var(--text-dim, #888)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: '0.75rem',
                      cursor: pushEstado === 'activando' ? 'default' : 'pointer',
                    }}
                  >
                    {pushEstado === 'activando' ? 'Activando...' : pushEstado === 'error' ? '⚠️ No se pudo activar — reintentar' : '🔔 Activar notificaciones en este dispositivo'}
                  </button>
                )}

                {pushEstado === 'error' && pushMotivo && (
                  <div style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,82,82,0.08)',
                    border: '1px solid rgba(255,82,82,0.35)',
                    color: 'var(--text-dim)',
                    fontSize: '0.7rem',
                    lineHeight: 1.5,
                  }}>
                    {pushMotivo}
                  </div>
                )}

                {/* El diagnóstico convierte "no se pudo activar" en una lista
                    de siete condiciones con una marcada en rojo. Sin esto no
                    hay forma de saber si falta la clave VAPID, si el navegador
                    está bloqueado o si la fila no se guardó en la base. */}
                {pushEstado !== 'activo' && (
                  <button
                    onClick={handleDiagnosticar}
                    style={{
                      width: '100%', marginTop: 6, background: 'transparent', border: 'none',
                      color: 'var(--text-dim)', fontSize: '0.68rem', textDecoration: 'underline',
                      cursor: 'pointer', padding: '4px',
                    }}
                  >
                    Ver diagnóstico
                  </button>
                )}

                {diagnostico?.chequeos && (
                  <div style={{
                    marginTop: 6, padding: '8px 10px', borderRadius: 8,
                    background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '0.68rem',
                  }}>
                    {diagnostico.chequeos.map((c) => (
                      <div key={c.etiqueta} style={{ padding: '3px 0' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                          <span>{c.estado === 'ok' ? '✅' : c.estado === 'aviso' ? '🟡' : '❌'}</span>
                          <span style={{ color: 'var(--text)' }}>{c.etiqueta}</span>
                        </div>
                        {c.detalle && (
                          <div style={{ color: 'var(--text-dim)', paddingLeft: 20, lineHeight: 1.4 }}>
                            {c.detalle}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}