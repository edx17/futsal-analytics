import React from 'react';

/* Cómo se abren los sobres (de cine o simple, normal o rápida, con o sin
   sonido). La usan Sobres y la sección PROBAR del Configurador GOD. */
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };

export default function PreferenciasApertura({ prefs, cambiar }) {
  const opcion = (activo) => ({
    padding: '5px 12px', minHeight: 'var(--jg-toque, 44px)', fontSize: 12, fontWeight: 800, letterSpacing: '.06em', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`, color: activo ? 'var(--accent)' : 'var(--text-dim)',
    background: activo ? 'rgba(0,255,136,.08)' : 'transparent',
  });
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '6px 0 8px' }} aria-label="Cómo se abren los sobres">
      <span style={{ ...rotulo, marginBottom: 0, marginRight: 4 }}>APERTURA</span>
      <button style={opcion(prefs.cine !== false)} onClick={() => cambiar('cine', true)} aria-pressed={prefs.cine !== false}>DE CINE</button>
      <button style={opcion(prefs.cine === false)} onClick={() => cambiar('cine', false)} aria-pressed={prefs.cine === false}>SIMPLE</button>
      <span style={{ width: 8 }} />
      <button style={opcion(prefs.velocidad !== 'rapida')} onClick={() => cambiar('velocidad', 'normal')} aria-pressed={prefs.velocidad !== 'rapida'}>NORMAL</button>
      <button style={opcion(prefs.velocidad === 'rapida')} onClick={() => cambiar('velocidad', 'rapida')} aria-pressed={prefs.velocidad === 'rapida'}>RÁPIDA</button>
      <span style={{ width: 8 }} />
      <button style={opcion(prefs.sonido)} onClick={() => cambiar('sonido', !prefs.sonido)} aria-pressed={prefs.sonido}>
        {prefs.sonido ? 'SONIDO: SÍ' : 'SONIDO: NO'}
      </button>
    </div>
  );
}
