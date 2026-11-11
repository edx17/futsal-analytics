import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icono } from '../iconos';
import { listarNotas } from '../utils/notas';
import { TIPOS_NOTA, filtrarNotas, ordenarNotas, etiquetaVinculo, minutoVideo, cuando } from '../analytics/notas';
import { abrirAnotador } from '../utils/anotadorContexto';
import '../components/notas/notas.css';

/* MIS NOTAS: todo lo anotado (mío y lo compartido por el cuerpo técnico),
 * con filtros por espacio y búsqueda. Cada nota lleva al espacio donde se
 * tomó (el video, el rival, el microciclo o el partido). */

const DESTINO = {
  video: () => '/videoanalisis',
  rival: () => '/scouting-rivales',
  microciclo: () => '/microciclo',
  sesion: () => '/microciclo',
  partido: (id) => `/resumen/${id}`,
};

export default function Notas() {
  const { user, perfil } = useAuth() || {};
  const navigate = useNavigate();
  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const [notas, setNotas] = useState(null);
  const [error, setError] = useState(null);
  const [tipo, setTipo] = useState('todas');
  const [texto, setTexto] = useState('');
  const [soloMias, setSoloMias] = useState(false);

  const cargar = useCallback(async () => {
    if (!clubId) return;
    try { setNotas(await listarNotas({ clubId, limite: 1000 })); setError(null); } catch (e) { setError(e.message); setNotas([]); }
  }, [clubId]);
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    window.addEventListener('notas:cambio', cargar);
    return () => { clearTimeout(t); window.removeEventListener('notas:cambio', cargar); };
  }, [cargar]);

  const lista = useMemo(() => ordenarNotas(filtrarNotas(notas || [], { tipo, texto, soloMias, yo: user?.id })), [notas, tipo, texto, soloMias, user?.id]);
  const cuenta = (t) => (notas || []).filter((n) => t === 'todas' || n.vinculo_tipo === t).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ color: 'var(--accent)' }}>ANOTADOR</div>
          <h1 style={{ margin: '4px 0 0', fontSize: '1.4rem', fontWeight: 900 }}>Mis notas</h1>
        </div>
        <button type="button" className="nt-btn" onClick={abrirAnotador}><Icono nombre="agregar" size="1em" relleno="propio" style={{ marginRight: 6 }} />NUEVA NOTA</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {['todas', ...Object.keys(TIPOS_NOTA)].map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem',
            border: `1px solid ${tipo === t ? (TIPOS_NOTA[t]?.color || 'var(--accent)') : 'var(--border)'}`, background: 'transparent',
            color: tipo === t ? (TIPOS_NOTA[t]?.color || 'var(--accent)') : 'var(--text-dim)' }}>
            {t === 'todas' ? 'TODAS' : TIPOS_NOTA[t].nombre.toUpperCase()} · {cuenta(t)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar en las notas…" style={{ flex: '1 1 240px' }} />
        <label className="nt-check"><input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} /> Sólo las mías</label>
      </div>

      {error && <div className="nt-error">{error}</div>}
      {notas === null && <div className="nt-vacio">Cargando…</div>}
      {notas && !lista.length && !error && <div className="nt-vacio">{notas.length ? 'Ninguna nota con ese filtro.' : 'Todavía no anotaste nada. Usá el botón redondo de abajo a la derecha desde cualquier pantalla.'}</div>}
      <ul className="nt-lista">
        {lista.map((n) => (
          <li key={n.id} className={`nt-nota${n.fijada ? ' nt-fijada' : ''}`}>
            <div className="nt-nota-cab">
              <span className="nt-vinculo" style={{ color: TIPOS_NOTA[n.vinculo_tipo]?.color }}>{etiquetaVinculo(n)}</span>
              {n.video_seg != null && <span className="nt-minuto">▶ {minutoVideo(n.video_seg)}</span>}
              {n.autor !== user?.id && <span className="nt-autor">{n.autor_nombre}</span>}
              {n.compartida && <span className="nt-compartida">COMPARTIDA</span>}
              <span className="nt-cuando">{cuando(n.created_at)}</span>
            </div>
            <p className="nt-texto">{n.texto}</p>
            {DESTINO[n.vinculo_tipo] && n.vinculo_id && (
              <div className="nt-acciones">
                <button type="button" onClick={() => navigate(DESTINO[n.vinculo_tipo](n.vinculo_id))}>Ir a {TIPOS_NOTA[n.vinculo_tipo].nombre.toLowerCase()} →</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
