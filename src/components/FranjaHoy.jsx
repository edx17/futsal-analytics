import React from 'react';
import { TIPOS } from '../analytics/agenda';
import { cuandoEsElPartido } from '../analytics/tablero';

/* LA FRANJA DE HOY
 *
 * Una línea arriba de todo que contesta "¿qué tengo que hacer hoy?" sin
 * scrollear. No reemplaza a ningún módulo: resume la agenda y el triage, que
 * están más abajo, para que no haya que bajar sólo para enterarse.
 *
 * Se puede apagar con la ✕ y se vuelve a prender desde el modo edición. La
 * preferencia vive en el dispositivo, igual que el resto del tablero.
 *
 * Si no hay nada que decir —sin agenda hoy, sin partido a la vista y sin
 * avisos— no se muestra. Un cartel de "todo en orden" que nadie pidió es
 * espacio ocupado.
 */

const MONO = { fontFamily: "'JetBrains Mono', monospace" };
const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

const fechaCorta = (dia) => {
  const [a, m, d] = String(dia).split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return `${DIAS[t.getUTCDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

export default function FranjaHoy({ franja, hoy, esMovil, onIr, onApagar }) {
  if (!franja || franja.vacia) return null;

  const { hoy: deHoy, manana, partido, diasAlPartido, avisos, graves } = franja;
  const cuando = cuandoEsElPartido(diasAlPartido);
  /* El partido de hoy ya aparece entre los eventos del día: no se repite. */
  const mostrarPartido = partido && diasAlPartido > 0;

  const borde = graves > 0 ? '#ef4444' : 'var(--accent)';

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${borde}`,
      borderRadius: 10,
      padding: esMovil ? '12px 12px 12px 14px' : '12px 16px',
      marginBottom: 16,
      display: 'flex',
      flexDirection: esMovil ? 'column' : 'row',
      alignItems: esMovil ? 'stretch' : 'center',
      gap: esMovil ? 10 : 14,
    }}>
      {/* Qué día es */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ ...MONO, fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.14em', color: borde }}>HOY</span>
        <span style={{ ...MONO, fontSize: '0.72rem', color: 'var(--text-dim)' }}>{fechaCorta(hoy)}</span>
        {esMovil && <div style={{ flex: 1 }} />}
        {esMovil && <Cerrar onApagar={onApagar} />}
      </div>

      {/* Lo que pasa hoy */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {deHoy.length === 0 ? (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
            Hoy no hay nada agendado{manana.length > 0 ? `. Mañana sí: ${manana.length} cosa${manana.length > 1 ? 's' : ''}.` : '.'}
          </span>
        ) : (
          deHoy.slice(0, 3).map((e) => {
            const def = TIPOS[e.tipo];
            return (
              <button key={e.id} onClick={() => onIr && onIr(e.ruta)} style={chip(def.color)} title={e.sub || e.titulo}>
                <span>{def.ico}</span>
                {e.hora && <span style={{ ...MONO, opacity: 0.85 }}>{e.hora}</span>}
                <span style={{ maxWidth: esMovil ? 150 : 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.titulo}
                </span>
              </button>
            );
          })
        )}
        {deHoy.length > 3 && (
          <button onClick={() => onIr && onIr('/agenda')} style={chip('var(--text-dim)')}>
            +{deHoy.length - 3} más
          </button>
        )}
      </div>

      {/* A la derecha: el próximo partido y los avisos */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        {mostrarPartido && (
          <button onClick={() => onIr && onIr('/torneos')} style={chip('#00ff88')}>
            <span>⚽</span>
            <span style={{ maxWidth: esMovil ? 130 : 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {partido.titulo}
            </span>
            <span style={{ ...MONO, fontSize: '0.58rem', opacity: 0.8 }}>{cuando}</span>
          </button>
        )}

        {avisos > 0 && (
          <button onClick={() => onIr && onIr('/agenda')} style={chip(graves > 0 ? '#ef4444' : '#f59e0b')}>
            <span>{graves > 0 ? '⚠️' : '•'}</span>
            <span>{avisos} aviso{avisos > 1 ? 's' : ''}</span>
          </button>
        )}

        {!esMovil && <Cerrar onApagar={onApagar} />}
      </div>
    </div>
  );
}

const Cerrar = ({ onApagar }) => (
  <button onClick={onApagar} title="Ocultar esta franja (se vuelve a prender desde ⚙️ Editar)"
          aria-label="Ocultar la franja de hoy"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>
    ✕
  </button>
);

const chip = (color) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'transparent',
  border: `1px solid ${color}`,
  color,
  borderRadius: 20,
  padding: '5px 11px',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
  maxWidth: '100%',
});
