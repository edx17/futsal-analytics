/* PRUEBAS · estilos compartidos (tema oscuro, acento var(--accent), números en JetBrains Mono). */
export const MONO = 'JetBrains Mono, monospace';
export const ACENTO = 'var(--accent, #00e676)';
export const dim = { color: 'var(--text-dim)', fontSize: '0.8rem' };
export const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.16em', color: 'var(--text-dim)' };
export const input = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', minHeight: 42, borderRadius: 8, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14 };
export const boton = { padding: '10px 16px', minHeight: 44, borderRadius: 8, border: 'none', fontWeight: 900, letterSpacing: '.06em', cursor: 'pointer', fontSize: 13, background: ACENTO, color: '#04140b' };
export const botonSec = { ...boton, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' };
export const chip = (activo) => ({
  padding: '8px 12px', minHeight: 40, whiteSpace: 'nowrap', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, letterSpacing: '.05em',
  border: `1px solid ${activo ? ACENTO : 'var(--border)'}`, color: activo ? ACENTO : 'var(--text-dim)', background: activo ? 'rgba(0,230,118,.08)' : 'transparent',
});
export const campo = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'var(--text-dim)' };
export const ESTADOS_CANDIDATO = {
  citado: { texto: 'CITADO', color: '#94a3b8' },
  en_prueba: { texto: 'EN PRUEBA', color: '#38bdf8' },
  incorporado: { texto: 'INCORPORADO', color: '#00e676' },
  descartado: { texto: 'DESCARTADO', color: '#ef4444' },
};
export const etiqueta = (color) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color, border: `1px solid ${color}55`, background: `${color}14` });
