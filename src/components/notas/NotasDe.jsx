import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Icono } from '../../iconos';
import { listarNotas, crearNota, actualizarNota, borrarNota } from '../../utils/notas';
import { minutoVideo, ordenarNotas, cuando, etiquetaVinculo } from '../../analytics/notas';
import { abrirAnotador } from '../../utils/anotadorContexto';
import './notas.css';

/* LAS NOTAS DE UN ESPACIO (un video, un rival, una semana, una sesión, un partido)
 *
 * Las mías y las compartidas por el cuerpo técnico, vinculadas a esto. Se
 * pueden agregar acá mismo o desde el anotador flotante. En un video, cada
 * nota lleva su minuto: al tocarlo, `onIrA(segundo)` lleva el video ahí.
 * `tiempo`: en un video, la función que da el segundo actual (para anotar
 * en el minuto en que estás). Con `todas`, lista todas (sin filtrar por id)
 * y muestra a qué está vinculada cada una.
 */
export default function NotasDe({ tipo, id, nombre, titulo = 'MIS NOTAS', onIrA, tiempo, compacto = false, todas = false }) {
  const { user, perfil } = useAuth() || {};
  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const [notas, setNotas] = useState(null);
  const [error, setError] = useState(null);
  const [texto, setTexto] = useState('');
  const [compartir, setCompartir] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!clubId || (!todas && (!tipo || id == null))) return;
    try { setNotas(await listarNotas({ clubId, tipo, id: todas ? null : id })); setError(null); } catch (e) { setError(e.message); setNotas([]); }
  }, [clubId, tipo, id, todas]);
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    window.addEventListener('notas:cambio', cargar);
    return () => { clearTimeout(t); window.removeEventListener('notas:cambio', cargar); };
  }, [cargar]);

  const agregar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      await crearNota({ clubId, texto, compartida: compartir, vinculo: { tipo, id, nombre }, videoSeg: tiempo ? Math.floor(tiempo()) : null });
      setTexto('');
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  };
  const hacer = async (fn) => { try { await fn(); } catch (e) { setError(e.message); } };

  const lista = ordenarNotas(notas || [], { porMinuto: tipo === 'video' });
  // Sólo el cuerpo técnico (el resumen del partido, por ejemplo, también lo ven los jugadores).
  if (!['superuser', 'manager', 'admin', 'ct'].includes(String(perfil?.rol || '').toLowerCase())) return null;
  return (
    <section className={`nt-de${compacto ? ' nt-compacto' : ''}`}>
      <div className="nt-de-cab">
        <b><Icono nombre="nota" size="1em" relleno="propio" style={{ marginRight: 6 }} />{titulo}{notas?.length ? ` · ${notas.length}` : ''}</b>
        <button type="button" className="nt-link" onClick={abrirAnotador}>Abrir anotador</button>
      </div>
      {error && <div className="nt-error">{error}</div>}
      {!todas && (
        <div className="nt-nueva">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={4000}
            placeholder={tiempo ? 'Anotá algo de este momento del video…' : 'Agregá una nota…'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) agregar(); }} />
          <div className="nt-nueva-pie">
            <label className="nt-check"><input type="checkbox" checked={compartir} onChange={(e) => setCompartir(e.target.checked)} /> Compartir con el cuerpo técnico</label>
            <button type="button" className="nt-btn" onClick={agregar} disabled={guardando || !texto.trim()}>
              {guardando ? 'GUARDANDO…' : tiempo ? 'ANOTAR EN ESTE MINUTO' : 'ANOTAR'}
            </button>
          </div>
        </div>
      )}
      {notas === null && <div className="nt-vacio">Cargando…</div>}
      {notas?.length === 0 && !error && <div className="nt-vacio">Todavía no hay notas acá.</div>}
      <ul className="nt-lista">
        {lista.map((n) => {
          const mia = n.autor === user?.id;
          return (
            <li key={n.id} className={`nt-nota${n.fijada ? ' nt-fijada' : ''}`}>
              <div className="nt-nota-cab">
                {n.video_seg != null && (
                  <button type="button" className="nt-minuto" onClick={() => onIrA?.(Number(n.video_seg))} disabled={!onIrA} title={onIrA ? 'Ir a este momento del video' : ''}>
                    ▶ {minutoVideo(n.video_seg)}
                  </button>
                )}
                {todas && <span className="nt-vinculo">{etiquetaVinculo(n)}</span>}
                {!mia && <span className="nt-autor">{n.autor_nombre}</span>}
                {n.compartida && <span className="nt-compartida">COMPARTIDA</span>}
                <span className="nt-cuando">{cuando(n.created_at)}</span>
              </div>
              {editando?.id === n.id ? (
                <div className="nt-nueva">
                  <textarea value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} rows={3} autoFocus />
                  <div className="nt-nueva-pie">
                    <button type="button" className="nt-link" onClick={() => setEditando(null)}>Cancelar</button>
                    <button type="button" className="nt-btn" disabled={!editando.texto.trim()}
                      onClick={() => hacer(async () => { await actualizarNota(n.id, { texto: editando.texto.trim() }); setEditando(null); })}>GUARDAR</button>
                  </div>
                </div>
              ) : <p className="nt-texto">{n.texto}</p>}
              {mia && editando?.id !== n.id && (
                <div className="nt-acciones">
                  <button type="button" onClick={() => hacer(() => actualizarNota(n.id, { fijada: !n.fijada }))}>{n.fijada ? 'Desfijar' : 'Fijar'}</button>
                  <button type="button" onClick={() => hacer(() => actualizarNota(n.id, { compartida: !n.compartida }))}>{n.compartida ? 'Dejar de compartir' : 'Compartir'}</button>
                  <button type="button" onClick={() => setEditando({ id: n.id, texto: n.texto })}>Editar</button>
                  <button type="button" className="nt-borrar" onClick={() => window.confirm('¿Borrar esta nota?') && hacer(() => borrarNota(n.id))}>Borrar</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
