import React, { useEffect, useRef, useState } from 'react';
import { sonar, callarTodo } from '../../utils/sonidoApertura';
import { prepararVideo, recargarVideo } from '../../utils/videoApertura';

/* EL VIDEO DE LA APERTURA
 *
 * Toma el reproductor ya preparado de la cinemática (utils/videoApertura) y lo
 * muestra. Estados, todos reales:
 *   inicializando → cargando → lista → reproduciendo → finalizada
 *                                   ↘ error (recuperable: reintentar o seguir)
 *   - 'lista' llega con el primer cuadro (loadeddata / canplay): no se espera
 *     a que baje el video entero;
 *   - si en CARGA_MAX no llegó ni el primer cuadro, o si reproduciendo deja
 *     de avanzar por TRABADO_MAX, es error: nunca queda colgado;
 *   - si el navegador no deja reproducir solo (p. ej. modo ahorro en iPhone),
 *     se ofrece un botón para verla;
 *   - al terminar (o al salir) se pausa y se saca de la pantalla.
 * Sin audio en el video: los sonidos se sintetizan sincronizados con él.
 */
const CARGA_MAX = 8000;
const TRABADO_MAX = 5000;

export default function VideoApertura({ video, velocidad = 1, onFin }) {
  const caja = useRef(null);
  const [estado, setEstado] = useState('inicializando');
  const [intento, setIntento] = useState(0);
  const finRef = useRef(onFin);
  useEffect(() => { finRef.current = onFin; }, [onFin]);

  useEffect(() => {
    const v = intento === 0 ? prepararVideo(video) : recargarVideo(video);
    const lugar = caja.current;
    if (!v || !lugar) {
      const t = setTimeout(() => setEstado('error'), 0); // sin reproductor: se ofrece seguir
      return () => clearTimeout(t);
    }
    lugar.appendChild(v);
    let vivo = true;
    let termino = false;
    let sonidosPuestos = false;
    let ultimoAvance = { t: -1, cuando: Date.now() };
    const timers = [];
    const poner = (e) => { if (vivo) setEstado(e); };
    const terminar = () => {
      if (termino || !vivo) return;
      termino = true;
      poner('finalizada');
      finRef.current();
    };
    const error = () => { if (!termino) poner('error'); };

    const intentarReproducir = () => {
      v.playbackRate = velocidad;
      const p = v.play();
      if (p && p.catch) {
        p.catch((err) => {
          if (!vivo || termino) return;
          // Autoplay bloqueado: se pide un toque. Cualquier otro problema: error.
          poner(err && err.name === 'NotAllowedError' ? 'bloqueado' : 'error');
        });
      }
    };
    const lista = () => {
      if (termino) return;
      poner('lista');
      if (v.paused) intentarReproducir();
    };
    const reproduciendo = () => {
      poner('reproduciendo');
      if (sonidosPuestos) return;
      sonidosPuestos = true;
      const desde = v.currentTime;
      (video.sonidos || []).forEach(([seg, nombre, dur]) => {
        if (seg < desde) return;
        timers.push(setTimeout(() => sonar(nombre, dur / velocidad), ((seg - desde) * 1000) / velocidad));
      });
    };
    const avanza = () => { ultimoAvance = { t: v.currentTime, cuando: Date.now() }; };
    // Se frenó a esperar datos (red lenta): vuelve a 'cargando' hasta el próximo 'playing'.
    const espera = () => { if (!termino && !v.ended) poner('cargando'); };

    v.addEventListener('loadeddata', lista);
    v.addEventListener('canplay', lista);
    v.addEventListener('playing', reproduciendo);
    v.addEventListener('timeupdate', avanza);
    v.addEventListener('waiting', espera);
    v.addEventListener('ended', terminar);
    v.addEventListener('error', error);

    // Puede que ya esté listo (preparado antes, o es la segunda vez).
    v.currentTime = 0;
    if (v.error) error();
    else if (v.readyState >= 2) lista();
    else { poner('cargando'); if (v.networkState === 0) v.load(); }

    // Sin primer cuadro a tiempo → error recuperable (no se queda esperando).
    timers.push(setTimeout(() => { if (v.readyState < 2 && !termino) error(); }, CARGA_MAX));
    // Reproduciendo pero trabado (red que se corta) → error recuperable.
    const vigia = setInterval(() => {
      if (termino || v.paused || v.ended) return;
      if (v.currentTime === ultimoAvance.t && Date.now() - ultimoAvance.cuando > TRABADO_MAX) error();
      if (v.currentTime !== ultimoAvance.t) avanza();
    }, 500);

    return () => {
      vivo = false;
      timers.forEach(clearTimeout);
      clearInterval(vigia);
      callarTodo();
      ['loadeddata', 'canplay'].forEach((ev) => v.removeEventListener(ev, lista));
      v.removeEventListener('playing', reproduciendo);
      v.removeEventListener('timeupdate', avanza);
      v.removeEventListener('waiting', espera);
      v.removeEventListener('ended', terminar);
      v.removeEventListener('error', error);
      try { v.pause(); } catch { /* nada */ }
      v.remove(); // sale de la pantalla; queda preparado para la próxima vez
    };
  }, [video, velocidad, intento]);

  const verla = () => {
    const v = caja.current?.querySelector('video');
    if (!v) return;
    const p = v.play();
    if (p && p.catch) p.catch(() => setEstado('error'));
  };

  const preparando = estado === 'inicializando' || estado === 'cargando';
  return (
    <div className="ap-video" data-estado={estado} ref={caja}>
      {preparando && <div className="ap-video-carga" role="status" aria-label="Cargando la animación" />}
      {estado === 'bloqueado' && (
        <div className="ap-video-aviso">
          <button className="ap-btn" onClick={verla}>▶ VER LA APERTURA</button>
        </div>
      )}
      {estado === 'error' && (
        <div className="ap-video-aviso" role="alert">
          <span>No se pudo cargar la animación.</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="ap-btn ap-btn-sec" onClick={() => setIntento((i) => i + 1)}>REINTENTAR</button>
            <button className="ap-btn" onClick={() => finRef.current()}>VER MIS CARTAS</button>
          </div>
        </div>
      )}
    </div>
  );
}
