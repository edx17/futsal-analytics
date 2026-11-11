import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icono } from '../../iconos';
import { crearNota } from '../../utils/notas';
import { useContextoNotas } from '../../utils/anotadorContexto';
import { etiquetaVinculo, minutoVideo, TIPOS_NOTA } from '../../analytics/notas';
import './notas.css';

/* EL ANOTADOR FLOTANTE
 *
 * Un botón redondo abajo a la derecha, en todas las pantallas del cuerpo
 * técnico. Abre una ventanita (en la PC se puede mover; en el celular sale de
 * abajo) para anotar sin perder lo que se está mirando. La nota queda
 * vinculada a lo que la pantalla avisó (useVincularNotas): el video (con el
 * minuto), el rival, la semana o la sesión del microciclo, el partido. Se
 * puede dejar en "General". Lo que se escribe se guarda como borrador en el
 * navegador hasta que se anota.
 */

const ROLES = ['superuser', 'manager', 'admin', 'ct'];
const BORRADOR = 'anotador_borrador';
const leer = () => { try { return localStorage.getItem(BORRADOR) || ''; } catch { return ''; } };
const escribir = (t) => { try { localStorage.setItem(BORRADOR, t); } catch { /* sin almacenamiento: no pasa nada */ } };

export default function Anotador({ esMovil = false }) {
  const { perfil } = useAuth() || {};
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = useContextoNotas();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(leer);
  const [general, setGeneral] = useState(false);       // anotar en "General" aunque haya algo abierto
  const [compartir, setCompartir] = useState(false);
  const [conMinuto, setConMinuto] = useState(true);
  const [estado, setEstado] = useState(null);          // { ok | error }
  const [pos, setPos] = useState(null);                // PC: dónde la dejaste
  const arrastre = useRef(null);
  const area = useRef(null);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener('anotador:abrir', abrir);
    return () => window.removeEventListener('anotador:abrir', abrir);
  }, []);
  useEffect(() => { if (abierto) setTimeout(() => area.current?.focus(), 50); }, [abierto]);
  useEffect(() => {
    const t = setTimeout(() => setEstado(null), 2500);
    return () => clearTimeout(t);
  }, [estado]);

  const rol = String(perfil?.rol || '').toLowerCase();
  if (!ROLES.includes(rol)) return null;
  if (/^\/(kiosco|juegos|sobres|vdraft|penales|duelos|mysquad)(\/|$)/.test(location.pathname)) return null;

  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const vinculo = !general && ctx ? ctx : null;

  const cambiar = (t) => { setTexto(t); escribir(t); };
  const anotar = async () => {
    if (!texto.trim()) return;
    // El minuto, en el momento de anotar (el video siguió corriendo).
    const seg = vinculo?.tiempo && conMinuto ? Math.floor(vinculo.tiempo() || 0) : null;
    try {
      await crearNota({ clubId, texto, compartida: compartir, vinculo, videoSeg: seg });
      cambiar('');
      setEstado({ ok: `Anotado en ${vinculo ? etiquetaVinculo(vinculo) : 'General'}${seg != null ? ` (${minutoVideo(seg)})` : ''}` });
    } catch (e) { setEstado({ error: e.message }); }
  };

  const empezarArrastre = (e) => {
    if (esMovil) return;
    const caja = e.currentTarget.parentElement.getBoundingClientRect();
    arrastre.current = { dx: e.clientX - caja.left, dy: e.clientY - caja.top };
    const mover = (ev) => setPos({
      x: Math.min(Math.max(0, ev.clientX - arrastre.current.dx), window.innerWidth - 120),
      y: Math.min(Math.max(0, ev.clientY - arrastre.current.dy), window.innerHeight - 60),
    });
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  const tipo = TIPOS_NOTA[vinculo?.tipo || 'general'];
  return (
    <>
      {!abierto && (
        <button type="button" className={`nt-fab${esMovil ? ' nt-fab-movil' : ''}`} onClick={() => setAbierto(true)} aria-label="Abrir el anotador" title="Anotador">
          <Icono nombre="nota" size={22} relleno="propio" />
          {texto.trim() && <i className="nt-fab-punto" aria-label="hay un borrador" />}
        </button>
      )}
      {abierto && (
        <div className={`nt-ventana${esMovil ? ' nt-ventana-movil' : ''}`} role="dialog" aria-label="Anotador"
          style={!esMovil && pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}>
          <div className="nt-ventana-cab" onPointerDown={empezarArrastre}>
            <b><Icono nombre="nota" size="1em" relleno="propio" style={{ marginRight: 6 }} />ANOTADOR</b>
            <span className="nt-ventana-botones">
              <button type="button" onClick={() => navigate('/notas')} title="Ver todas mis notas">TODAS</button>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Minimizar">—</button>
            </span>
          </div>
          <div className="nt-ventana-cuerpo">
            <div className="nt-destino" style={{ '--c': tipo.color }}>
              <span>Se guarda en</span>
              <b>{vinculo ? etiquetaVinculo(vinculo) : 'General'}</b>
              {ctx && (
                <button type="button" className="nt-link" onClick={() => setGeneral((g) => !g)}>
                  {general ? `Vincular a ${etiquetaVinculo(ctx)}` : 'Dejar en General'}
                </button>
              )}
            </div>
            {!ctx && <small className="nt-ayuda">Abrí un video, un rival, el microciclo, una sesión o un partido y la nota se vincula sola.</small>}
            <textarea ref={area} value={texto} onChange={(e) => cambiar(e.target.value)} rows={esMovil ? 4 : 6} maxLength={4000}
              placeholder="Escribí… (Ctrl + Enter para anotar)"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) anotar(); if (e.key === 'Escape') setAbierto(false); }} />
            <div className="nt-opciones">
              {vinculo?.tiempo && (
                <label className="nt-check"><input type="checkbox" checked={conMinuto} onChange={(e) => setConMinuto(e.target.checked)} /> Con el minuto del video (el de cuando anotás)</label>
              )}
              <label className="nt-check"><input type="checkbox" checked={compartir} onChange={(e) => setCompartir(e.target.checked)} /> Compartir con el cuerpo técnico</label>
            </div>
            <button type="button" className="nt-btn nt-btn-ancho" onClick={anotar} disabled={!texto.trim()}>ANOTAR</button>
            {estado && <div className={estado.error ? 'nt-error' : 'nt-ok'} role="status">{estado.error || estado.ok}</div>}
          </div>
        </div>
      )}
    </>
  );
}
