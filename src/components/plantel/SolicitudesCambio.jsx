import React, { useState } from 'react';
import { supabase } from '../../supabase';

/* ══════════════════════════════════════════════════════════════════════════
   CAMBIOS PEDIDOS POR LOS JUGADORES

   Lo que un jugador (o su familia) corrigió desde "Mis datos" en el kiosco.
   Se aprueba dato por dato: la función resolver_solicitud_cambio() escribe en
   la ficha sólo lo marcado, y sólo si quien aprueba es admin, manager o
   superuser del club (lo valida la base, no esta pantalla).
   ══════════════════════════════════════════════════════════════════════════ */

const TITULOS = {
  contacto: 'Celular',
  contacto_emergencia: 'Contacto de emergencia',
  obra_social: 'Obra social',
  grupo_sanguineo: 'Grupo sanguíneo',
};

export default function SolicitudesCambio({ pendientes, jugadores, onCerrar, onResuelta, showToast }) {
  // { [solicitudId]: Set(campos marcados) } — por defecto, todo marcado.
  const [marcados, setMarcados] = useState(() =>
    Object.fromEntries(pendientes.map((s) => [s.id, new Set(Object.keys(s.cambios || {}))])));
  const [notas, setNotas] = useState({});
  const [trabajando, setTrabajando] = useState(null);

  const nombreDe = (id) => {
    const j = jugadores.find((x) => String(x.id) === String(id));
    return j ? `${j.apellido || ''}, ${j.nombre || ''}`.replace(/^, /, '') + (j.categoria ? ` · ${j.categoria}` : '') : `Jugador ${id}`;
  };

  const alternar = (sid, campo) => setMarcados((m) => {
    const s = new Set(m[sid]);
    s.has(campo) ? s.delete(campo) : s.add(campo);
    return { ...m, [sid]: s };
  });

  const resolver = async (sol, aprobados) => {
    setTrabajando(sol.id);
    const { data, error } = await supabase.rpc('resolver_solicitud_cambio', {
      p_id: sol.id, p_aprobados: aprobados, p_nota: notas[sol.id] || null,
    });
    setTrabajando(null);
    if (error) {
      showToast?.(error.code === '42501' ? 'No tenés permiso para aprobar cambios.' : `No se pudo: ${error.message}`, 'error');
      return;
    }
    showToast?.(data === 'rechazada' ? 'Pedido rechazado.' : 'Cambios aplicados a la ficha ✅', 'success');
    onResuelta?.();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !trabajando) onCerrar(); }}>
      <div className="bento-card modal-content" style={{ maxWidth: '640px', background: 'var(--panel)' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>📝 CAMBIOS PEDIDOS POR JUGADORES</h2>
          <button onClick={onCerrar} disabled={!!trabajando} className="close-btn">×</button>
        </div>

        {pendientes.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>No hay pedidos pendientes 👌</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {pendientes.map((sol) => {
              const campos = Object.entries(sol.cambios || {});
              const elegidos = marcados[sol.id] || new Set();
              return (
                <div key={sol.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', background: 'var(--bg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--text)' }}>{nombreDe(sol.jugador_id)}</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      {new Date(sol.creada_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {campos.map(([k, v]) => (
                    <label key={k} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderTop: '1px dashed var(--border)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={elegidos.has(k)} onChange={() => alternar(sol.id, k)} style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                        <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '0.5px' }}>{(TITULOS[k] || k).toUpperCase()}</span>
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-dim)' }}>{v.antes || 'vacío'}</span>
                        {' → '}
                        <strong>{v.despues || '(borrar el dato)'}</strong>
                      </span>
                    </label>
                  ))}

                  <input
                    value={notas[sol.id] || ''}
                    onChange={(e) => setNotas({ ...notas, [sol.id]: e.target.value })}
                    placeholder="Nota para el jugador (opcional)"
                    maxLength={200}
                    style={{ width: '100%', padding: '10px', marginTop: '8px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', boxSizing: 'border-box', fontSize: '16px' }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                    <button onClick={() => resolver(sol, [])} disabled={trabajando === sol.id}
                      style={{ minHeight: '44px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer' }}>
                      ✕ RECHAZAR
                    </button>
                    <button onClick={() => resolver(sol, [...elegidos])} disabled={trabajando === sol.id || elegidos.size === 0}
                      style={{ minHeight: '44px', background: 'var(--accent)', border: 'none', color: '#000', borderRadius: '8px', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', opacity: elegidos.size === 0 ? 0.5 : 1 }}>
                      {trabajando === sol.id ? 'GUARDANDO…' : elegidos.size === campos.length ? '✓ APROBAR TODO' : `✓ APROBAR ${elegidos.size}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
