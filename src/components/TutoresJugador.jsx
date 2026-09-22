import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useToast } from './ToastContext';
import { estadoDeJugador, PARENTESCOS } from '../analytics/tutores';

/* TUTORES Y AUTORIZACIONES DE UN JUGADOR
 *
 * Quién está a cargo del chico y qué tiene permitido el club. Hasta ahora esto
 * vivía en el WhatsApp del entrenador de turno y se perdía cuando el entrenador
 * cambiaba.
 *
 * Los permisos son de TRES estados y se muestran como tres: sin responder, no
 * autoriza, autoriza. "Todavía no lo pedimos" es trabajo pendiente del club;
 * "la familia dijo que no" es una decisión tomada. Pintarlos igual esconde una
 * de las dos cosas, que es justo lo que este módulo viene a arreglar.
 *
 * El cálculo de qué falta vive en `src/analytics/tutores.js` y está probado
 * aparte; acá sólo se pinta y se guarda.
 */

const VERDE = '#00ff88';
const ROJO = '#ef4444';
const AMBAR = '#fbbf24';

const COLOR_ESTADO = { si: VERDE, no: ROJO, pendiente: AMBAR };
const ICONO_ESTADO = { si: '✓', no: '✗', pendiente: '?' };
const ROTULO_ESTADO = { si: 'Autoriza', no: 'No autoriza', pendiente: 'Sin responder' };

const vacio = {
  nombre: '', parentesco: 'Madre', telefono: '', email: '', dni: '',
  principal: false, puede_retirar: true, observaciones: '',
};

export default function TutoresJugador({ jugador, clubId, puedeEditar = true, onCambioPermisos }) {
  const { showToast } = useToast();
  const [tutores, setTutores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(null);          // null = no hay formulario abierto
  const [guardando, setGuardando] = useState(false);
  /* Los permisos se editan en local y se guardan de una: así no hay seis
     viajes al servidor mientras el admin va tildando. */
  const [permisos, setPermisos] = useState({});

  const jugId = jugador?.id;

  useEffect(() => {
    if (!jugId) return;
    let cancelado = false;

    (async () => {
      setCargando(true);
      const { data, error } = await supabase.from('tutores')
        .select('*').eq('jugador_id', jugId).order('principal', { ascending: false });
      if (cancelado) return;
      if (error) console.error('Error cargando tutores:', error);
      setTutores(data || []);
      setCargando(false);
    })();

    return () => { cancelado = true; };
  }, [jugId]);

  useEffect(() => {
    setPermisos({
      autoriza_traslado: jugador?.autoriza_traslado ?? null,
      autoriza_imagen: jugador?.autoriza_imagen ?? null,
      autoriza_atencion_medica: jugador?.autoriza_atencion_medica ?? null,
      retira_solo: jugador?.retira_solo ?? null,
      autorizaciones_firmadas_por: jugador?.autorizaciones_firmadas_por || '',
      autorizaciones_fecha: jugador?.autorizaciones_fecha || '',
    });
  }, [jugador]);

  const estado = estadoDeJugador({ ...jugador, ...permisos }, tutores);

  const recargar = useCallback(async () => {
    const { data } = await supabase.from('tutores')
      .select('*').eq('jugador_id', jugId).order('principal', { ascending: false });
    setTutores(data || []);
  }, [jugId]);

  const guardarTutor = async () => {
    if (!form?.nombre?.trim()) return showToast('El nombre del tutor es obligatorio.', 'warning');
    setGuardando(true);
    try {
      /* Sólo puede haber un principal por jugador (hay un índice único en la
         base que lo garantiza). Si este se marca principal, los demás dejan
         de serlo ANTES de guardar, si no la base rechaza el guardado. */
      if (form.principal) {
        await supabase.from('tutores').update({ principal: false })
          .eq('jugador_id', jugId).neq('id', form.id || '00000000-0000-0000-0000-000000000000');
      }

      const payload = {
        club_id: clubId, jugador_id: jugId,
        nombre: form.nombre.trim(), parentesco: form.parentesco || null,
        telefono: form.telefono?.trim() || null, email: form.email?.trim() || null,
        dni: form.dni?.trim() || null,
        principal: !!form.principal, puede_retirar: !!form.puede_retirar,
        observaciones: form.observaciones?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = form.id
        ? await supabase.from('tutores').update(payload).eq('id', form.id)
        : await supabase.from('tutores').insert([payload]);
      if (error) throw error;

      showToast(form.id ? 'Tutor actualizado ✅' : 'Tutor agregado ✅', 'success');
      setForm(null);
      await recargar();
    } catch (e) {
      console.error('Error guardando el tutor:', e);
      showToast('No se pudo guardar el tutor: ' + (e.message || 'error desconocido'), 'error');
    }
    setGuardando(false);
  };

  const borrarTutor = async (t) => {
    if (!window.confirm(`¿Sacar a ${t.nombre} de los tutores de ${jugador.nombre}?`)) return;
    const { error } = await supabase.from('tutores').delete().eq('id', t.id);
    if (error) return showToast('No se pudo borrar: ' + error.message, 'error');
    showToast('Tutor eliminado', 'info');
    recargar();
  };

  /* Tres estados en un solo botón: sin responder → sí → no → sin responder. */
  const ciclar = (k) => setPermisos((p) => ({ ...p, [k]: p[k] == null ? true : p[k] === true ? false : null }));

  const guardarPermisos = async () => {
    setGuardando(true);
    const payload = {
      autoriza_traslado: permisos.autoriza_traslado,
      autoriza_imagen: permisos.autoriza_imagen,
      autoriza_atencion_medica: permisos.autoriza_atencion_medica,
      retira_solo: permisos.retira_solo,
      autorizaciones_firmadas_por: permisos.autorizaciones_firmadas_por?.trim() || null,
      autorizaciones_fecha: permisos.autorizaciones_fecha || null,
    };
    const { error } = await supabase.from('jugadores').update(payload).eq('id', jugId);
    setGuardando(false);
    if (error) {
      console.error('Error guardando autorizaciones:', error);
      return showToast('No se pudieron guardar las autorizaciones: ' + error.message, 'error');
    }
    showToast('Autorizaciones guardadas ✅', 'success');
    if (onCambioPermisos) onCambioPermisos();
  };

  if (!jugId) return null;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 15, marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>TUTORES Y AUTORIZACIONES</div>
        <div style={{ fontSize: '0.65rem', color: estado.completo ? VERDE : AMBAR, fontWeight: 800 }}>
          {estado.completo
            ? '✓ COMPLETO'
            : `${estado.faltantes.length} PENDIENTE${estado.faltantes.length > 1 ? 'S' : ''}`}
          {estado.edad != null && <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>{estado.edad} años</span>}
        </div>
      </div>

      {/* Lo que falta, arriba y en criollo. */}
      {estado.faltantes.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {estado.faltantes.map((f) => (
            <div key={f.k} style={{ fontSize: '0.72rem', color: f.grave ? ROJO : AMBAR }}>
              {f.grave ? '⚠️' : '•'} {f.rotulo}
            </div>
          ))}
        </div>
      )}

      {/* ── LA GENTE ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: 14 }}>
        {cargando ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Cargando tutores…</div>
        ) : estado.tutores.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Todavía no hay ningún tutor cargado.</div>
        ) : (
          estado.tutores.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                  {t.nombre}
                  {t.principal && <span style={{ color: VERDE, fontSize: '0.6rem', marginLeft: 8, fontWeight: 800 }}>PRINCIPAL</span>}
                  {!t.puede_retirar && <span style={{ color: ROJO, fontSize: '0.6rem', marginLeft: 8, fontWeight: 800 }}>NO RETIRA</span>}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  {[t.parentesco, t.telefono, t.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </div>
              </div>
              {/* Los botones van juntos: en el celu, sueltos, el ✕ se caía solo
                  a un renglón aparte. */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {t.telefono && (
                  <a href={`https://wa.me/${String(t.telefono).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                     style={{ background: '#25D366', color: '#fff', padding: '5px 10px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 800, textDecoration: 'none' }}>
                    💬
                  </a>
                )}
                {puedeEditar && (
                  <>
                    <button onClick={() => setForm({ ...vacio, ...t })} style={btnChico}>EDITAR</button>
                    <button onClick={() => borrarTutor(t)} style={{ ...btnChico, borderColor: ROJO, color: ROJO }}>✕</button>
                  </>
                )}
              </div>
            </div>
          ))
        )}

        {puedeEditar && !form && (
          <button onClick={() => setForm({ ...vacio, principal: tutores.length === 0 })}
                  style={{ ...btnChico, marginTop: 10 }}>
            + AGREGAR TUTOR
          </button>
        )}
      </div>

      {/* ── FORMULARIO ───────────────────────────────────────────────── */}
      {form && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <Campo etiqueta="NOMBRE Y APELLIDO" valor={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
            <div>
              <div className="section-title" style={{ marginBottom: 5 }}>PARENTESCO</div>
              <select value={form.parentesco || ''} onChange={(e) => setForm({ ...form, parentesco: e.target.value })} style={input}>
                {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <Campo etiqueta="TELÉFONO" valor={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
            <Campo etiqueta="EMAIL" valor={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Campo etiqueta="DNI" valor={form.dni} onChange={(v) => setForm({ ...form, dni: v })} />
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <label style={check}>
              <input type="checkbox" checked={!!form.principal} onChange={(e) => setForm({ ...form, principal: e.target.checked })} style={{ width: 'auto' }} />
              <span>Es el contacto principal</span>
            </label>
            <label style={check}>
              <input type="checkbox" checked={!!form.puede_retirar} onChange={(e) => setForm({ ...form, puede_retirar: e.target.checked })} style={{ width: 'auto' }} />
              <span>Puede retirarlo del club</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={guardarTutor} disabled={guardando} className="btn-action" style={{ flex: 1 }}>
              {guardando ? 'GUARDANDO…' : 'GUARDAR TUTOR'}
            </button>
            <button onClick={() => setForm(null)} style={btnChico}>CANCELAR</button>
          </div>
        </div>
      )}

      {/* ── LOS PERMISOS ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>PERMISOS DE LA FAMILIA</div>

        {estado.permisos.map((p) => (
          <div key={p.k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
            <button onClick={() => puedeEditar && ciclar(p.k)}
                    disabled={!puedeEditar}
                    title={puedeEditar ? 'Tocá para cambiar: sin responder → autoriza → no autoriza' : undefined}
                    style={{
                      width: 30, height: 30, flexShrink: 0, borderRadius: 6, fontWeight: 900,
                      background: 'transparent', cursor: puedeEditar ? 'pointer' : 'default',
                      border: `1px solid ${COLOR_ESTADO[p.estado]}`, color: COLOR_ESTADO[p.estado],
                    }}>
              {ICONO_ESTADO[p.estado]}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{p.rotulo}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{p.ayuda}</div>
            </div>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: COLOR_ESTADO[p.estado], whiteSpace: 'nowrap' }}>
              {ROTULO_ESTADO[p.estado]}
            </div>
          </div>
        ))}

        {puedeEditar && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
              <Campo etiqueta="FIRMADO POR" valor={permisos.autorizaciones_firmadas_por}
                     onChange={(v) => setPermisos({ ...permisos, autorizaciones_firmadas_por: v })} />
              <div>
                <div className="section-title" style={{ marginBottom: 5 }}>FECHA DE FIRMA</div>
                <input type="date" value={permisos.autorizaciones_fecha || ''}
                       onChange={(e) => setPermisos({ ...permisos, autorizaciones_fecha: e.target.value })} style={input} />
              </div>
            </div>
            <button onClick={guardarPermisos} disabled={guardando} className="btn-action" style={{ width: '100%', marginTop: 12 }}>
              {guardando ? 'GUARDANDO…' : 'GUARDAR AUTORIZACIONES'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const input = { width: '100%', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', padding: 8, borderRadius: 4, fontSize: '0.8rem' };
const btnChico = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '5px 10px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer' };
const check = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', cursor: 'pointer' };

const Campo = ({ etiqueta, valor, onChange }) => (
  <div>
    <div className="section-title" style={{ marginBottom: 5 }}>{etiqueta}</div>
    <input value={valor || ''} onChange={(e) => onChange(e.target.value)} style={input} />
  </div>
);
