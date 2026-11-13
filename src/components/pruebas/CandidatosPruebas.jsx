import React, { useState } from 'react';
import { TablaResponsive } from '../TablaResponsive';
import { PUESTOS, PUESTOS_PENDIENTES } from '../../pruebas/rubrica';
import { edadRelativa } from '../../pruebas/edadRelativa';
import { guardarCandidato, subirFotoCandidato, borrarCandidato } from '../../pruebas/datos';
import { MONO, dim, rotulo, input, boton, botonSec, campo, ESTADOS_CANDIDATO, etiqueta } from './estilos';

/* PRUEBAS · CANDIDATOS (la ficha previa)
 *
 * Listado de la categoría elegida (nunca se mezclan) y alta/edición de la
 * ficha. La edad relativa (trimestre y edad decimal) no se guarda: se
 * calcula con la fecha de nacimiento. Las observaciones no se puntúan.
 */

const VACIO = {
  nombre: '', apellido: '', fecha_nacimiento: '', foto_url: '', puesto_principal: 'Ala', puesto_alternativo: '',
  perfil_dominante: { pierna: '', zona: '', rol: '' }, antecedentes: { club_anterior: '', minutos: '', lesiones: '' },
  observaciones: '', estado: 'citado',
};

export default function CandidatosPruebas({ clubId, categoria, candidatos, recargar, puedeCargar, puedeBorrar, esMovil, avisar }) {
  const [editando, setEditando] = useState(null);

  const columnas = [
    { k: 'nombre', t: 'CANDIDATO', r: (c) => <b>{[c.apellido, c.nombre].filter(Boolean).join(', ')}</b> },
    { k: 'puesto', t: 'PUESTO', r: (c) => `${c.puesto_principal}${c.puesto_alternativo ? ` / ${c.puesto_alternativo}` : ''}` },
    { k: 'edad', t: 'EDAD RELATIVA', r: (c) => { const e = edadRelativa(c.fecha_nacimiento); return e ? <span style={{ fontFamily: MONO }}>{e.texto}</span> : '—'; } },
    { k: 'estado', t: 'ESTADO', r: (c) => <span style={etiqueta(ESTADOS_CANDIDATO[c.estado]?.color)}>{ESTADOS_CANDIDATO[c.estado]?.texto}</span> },
    ...(puedeCargar ? [{ k: 'acciones', t: '', bloque: true, r: (c) => <button style={botonSec} onClick={(e) => { e.stopPropagation(); setEditando(c); }}>EDITAR FICHA</button> }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...dim, flex: 1, minWidth: 220 }}>
          Candidatos de <b style={{ color: 'var(--text)' }}>{categoria}</b>. Puestos de esta versión: Cierre, Ala y Pivot ({PUESTOS_PENDIENTES.join(', ')}: pendiente, necesita criterios propios).
        </span>
        {puedeCargar && <button style={boton} onClick={() => setEditando({ ...VACIO })}>+ NUEVO CANDIDATO</button>}
      </div>

      <TablaResponsive filas={candidatos} columnas={columnas} colsClave={['puesto', 'edad', 'estado']} getId={(c) => c.id}
        getTitulo={(c) => [c.apellido, c.nombre].filter(Boolean).join(', ')} getSubtitulo={(c) => c.puesto_principal}
        onRowClick={puedeCargar ? (c) => setEditando(c) : undefined} vacio="Todavía no hay candidatos en esta categoría.">
        <div className="bento-card" style={{ padding: 0, overflowX: 'auto' }}>
          {candidatos.length === 0 ? <div style={{ padding: 24, textAlign: 'center', ...dim }}>Todavía no hay candidatos en esta categoría.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{columnas.map((c) => <th key={c.k} style={{ ...rotulo, textAlign: 'left', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>{c.t}</th>)}</tr></thead>
              <tbody>
                {candidatos.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {columnas.map((col) => <td key={col.k} style={{ padding: '10px 14px' }}>{col.r(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TablaResponsive>

      {editando && (
        <FichaCandidato inicial={editando} clubId={clubId} categoria={categoria} esMovil={esMovil} puedeBorrar={puedeBorrar}
          cerrar={() => setEditando(null)} alGuardar={(texto) => { setEditando(null); recargar(); avisar?.(texto); }} />
      )}
    </div>
  );
}

function FichaCandidato({ inicial, clubId, categoria, esMovil, puedeBorrar, cerrar, alGuardar }) {
  const [f, setF] = useState(() => ({
    ...VACIO, ...inicial,
    perfil_dominante: { ...VACIO.perfil_dominante, ...(inicial.perfil_dominante || {}) },
    antecedentes: { ...VACIO.antecedentes, ...(inicial.antecedentes || {}) },
    fecha_nacimiento: inicial.fecha_nacimiento || '', puesto_alternativo: inicial.puesto_alternativo || '',
  }));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setSub = (g, k, v) => setF((x) => ({ ...x, [g]: { ...x[g], [k]: v } }));
  const edad = edadRelativa(f.fecha_nacimiento);
  const noEditable = inicial.estado === 'incorporado';

  const subirFoto = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setOcupado(true); setError(null);
    try { set('foto_url', await subirFotoCandidato(clubId, archivo)); } catch (err) { setError(err?.message || 'No se pudo subir la foto.'); } finally { setOcupado(false); }
  };

  const guardar = async () => {
    if (!f.nombre.trim()) { setError('Falta el nombre.'); return; }
    if (f.puesto_alternativo && f.puesto_alternativo === f.puesto_principal) { setError('El puesto alternativo tiene que ser otro.'); return; }
    setOcupado(true); setError(null);
    try {
      await guardarCandidato({
        ...(f.id ? { id: f.id } : { club_id: clubId, categoria }),
        nombre: f.nombre.trim(), apellido: f.apellido.trim(), fecha_nacimiento: f.fecha_nacimiento || null, foto_url: f.foto_url || null,
        puesto_principal: f.puesto_principal, puesto_alternativo: f.puesto_alternativo || null,
        perfil_dominante: f.perfil_dominante,
        antecedentes: { ...f.antecedentes, minutos: f.antecedentes.minutos === '' ? null : Number(f.antecedentes.minutos) },
        observaciones: f.observaciones || null, estado: f.estado,
      });
      alGuardar(f.id ? 'Ficha actualizada.' : 'Candidato agregado.');
    } catch (err) { setError(err?.message || 'No se pudo guardar.'); setOcupado(false); }
  };

  const borrar = async () => {
    if (!window.confirm('¿Borrar el candidato y todas sus evaluaciones? No se puede deshacer.')) return;
    setOcupado(true);
    try { await borrarCandidato(f.id); alGuardar('Candidato borrado.'); } catch (err) { setError(err?.message || 'No se pudo borrar.'); setOcupado(false); }
  };

  const grid = { display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 };
  return (
    <div role="dialog" aria-modal="true" aria-label="Ficha del candidato" onClick={cerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: esMovil ? 'stretch' : 'center', justifyContent: 'center', padding: esMovil ? 0 : 20 }}>
      <div className="bento-card" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 760, maxHeight: esMovil ? '100%' : '90vh', overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn .2s', borderRadius: esMovil ? 0 : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{f.id ? 'FICHA DEL CANDIDATO' : 'NUEVO CANDIDATO'}</div>
            <div style={dim}>{categoria}{edad && <> · <span style={{ fontFamily: MONO, color: 'var(--accent)' }}>{edad.texto}</span></>}</div>
          </div>
          <button style={botonSec} onClick={cerrar} aria-label="Cerrar">✕</button>
        </div>
        {noEditable && <div style={{ ...dim, color: '#00e676' }}>Ya está incorporado al plantel: la ficha queda como registro.</div>}

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 12, background: 'var(--panel)', border: '1px solid var(--border)', overflow: 'hidden', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
            {f.foto_url ? <img src={f.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={dim}>SIN FOTO</span>}
          </div>
          <label style={{ ...botonSec, display: 'inline-flex', alignItems: 'center' }}>
            {ocupado ? 'SUBIENDO…' : f.foto_url ? 'CAMBIAR FOTO' : 'SUBIR FOTO'}
            <input type="file" accept="image/*" onChange={subirFoto} disabled={ocupado || noEditable} style={{ display: 'none' }} />
          </label>
        </div>

        <div style={grid}>
          <label style={campo}>NOMBRE<input style={input} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} disabled={noEditable} /></label>
          <label style={campo}>APELLIDO<input style={input} value={f.apellido} onChange={(e) => set('apellido', e.target.value)} disabled={noEditable} /></label>
          <label style={campo}>FECHA DE NACIMIENTO<input type="date" style={input} value={f.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} disabled={noEditable} /></label>
          <label style={campo}>ESTADO
            <select style={input} value={f.estado} onChange={(e) => set('estado', e.target.value)} disabled={noEditable}>
              {Object.entries(ESTADOS_CANDIDATO).filter(([k]) => k !== 'incorporado' || f.estado === 'incorporado').map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
            </select>
          </label>
          <label style={campo}>PUESTO PRINCIPAL
            <select style={input} value={f.puesto_principal} onChange={(e) => set('puesto_principal', e.target.value)} disabled={noEditable}>
              {PUESTOS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={campo}>PUESTO ALTERNATIVO
            <select style={input} value={f.puesto_alternativo} onChange={(e) => set('puesto_alternativo', e.target.value)} disabled={noEditable}>
              <option value="">—</option>
              {PUESTOS.filter((p) => p !== f.puesto_principal).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <div style={rotulo}>PERFIL DOMINANTE</div>
        <div style={{ ...grid, gridTemplateColumns: esMovil ? '1fr' : 'repeat(3, minmax(0, 1fr))' }}>
          <label style={campo}>PIERNA
            <select style={input} value={f.perfil_dominante.pierna} onChange={(e) => setSub('perfil_dominante', 'pierna', e.target.value)} disabled={noEditable}>
              <option value="">—</option><option value="Derecha">Derecha</option><option value="Izquierda">Izquierda</option><option value="Ambas">Ambas</option>
            </select>
          </label>
          <label style={campo}>ZONA<input style={input} placeholder="ej. banda izquierda" value={f.perfil_dominante.zona} onChange={(e) => setSub('perfil_dominante', 'zona', e.target.value)} disabled={noEditable} /></label>
          <label style={campo}>ROL<input style={input} placeholder="ej. ala que pisa área" value={f.perfil_dominante.rol} onChange={(e) => setSub('perfil_dominante', 'rol', e.target.value)} disabled={noEditable} /></label>
        </div>

        <div style={rotulo}>ANTECEDENTES</div>
        <div style={{ ...grid, gridTemplateColumns: esMovil ? '1fr' : '2fr 1fr' }}>
          <label style={campo}>CLUB ANTERIOR<input style={input} value={f.antecedentes.club_anterior} onChange={(e) => setSub('antecedentes', 'club_anterior', e.target.value)} disabled={noEditable} /></label>
          <label style={campo}>MINUTOS (TEMPORADA PASADA)<input type="number" min={0} style={{ ...input, fontFamily: MONO }} value={f.antecedentes.minutos ?? ''} onChange={(e) => setSub('antecedentes', 'minutos', e.target.value)} disabled={noEditable} /></label>
        </div>
        <label style={campo}>LESIONES RECIENTES<input style={input} value={f.antecedentes.lesiones} onChange={(e) => setSub('antecedentes', 'lesiones', e.target.value)} disabled={noEditable} /></label>
        <label style={campo}>OBSERVACIONES (actitud, puntualidad, cómo llega · no se puntúa)
          <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={f.observaciones || ''} onChange={(e) => set('observaciones', e.target.value)} disabled={noEditable} />
        </label>

        {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
        {!noEditable && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={boton} onClick={guardar} disabled={ocupado}>{ocupado ? 'GUARDANDO…' : 'GUARDAR FICHA'}</button>
            {f.id && puedeBorrar && <button style={{ ...botonSec, color: '#ef4444' }} onClick={borrar} disabled={ocupado}>BORRAR</button>}
          </div>
        )}
      </div>
    </div>
  );
}
