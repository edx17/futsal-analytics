import React, { useEffect, useRef, useState } from 'react';
import { sonar, callarTodo } from '../../utils/sonidoApertura';

/* EL VIDEO DE LA APERTURA
 *
 * Reproduce la cinemática (sin audio: los sonidos se sintetizan sincronizados
 * con el video). Termina — y llama a onFin una sola vez — cuando:
 *   - el video llega al final;
 *   - falla o no se puede reproducir;
 *   - no arranca en unos segundos (red lenta): no se deja a nadie esperando;
 *   - por las dudas, si pasó bastante más que su duración.
 * Al desmontarse corta el video y lo descarga (no sigue consumiendo nada).
 */
const ESPERA_CARGA = 4000;

export default function VideoApertura({ video, velocidad = 1, onFin }) {
  const ref = useRef(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    let terminado = false;
    const timers = [];
    const fin = () => {
      if (terminado) return;
      terminado = true;
      timers.forEach(clearTimeout);
      onFin();
    };
    const empezo = () => {
      setCargando(false);
      // Los sonidos, en sus segundos (a la velocidad del video).
      (video.sonidos || []).forEach(([seg, nombre, dur]) => {
        timers.push(setTimeout(() => sonar(nombre, dur / velocidad), (seg * 1000) / velocidad));
      });
      timers.push(setTimeout(fin, ((video.duracion + 3) * 1000) / velocidad));
    };
    v.playbackRate = velocidad;
    v.addEventListener('playing', empezo, { once: true });
    v.addEventListener('ended', fin);
    v.addEventListener('error', fin, true);
    timers.push(setTimeout(() => { if (v.readyState < 3 && v.paused) fin(); }, ESPERA_CARGA));
    const intento = v.play();
    if (intento && intento.catch) intento.catch(fin);

    return () => {
      terminado = true;
      timers.forEach(clearTimeout);
      callarTodo();
      v.removeEventListener('ended', fin);
      v.removeEventListener('error', fin, true);
      try { v.pause(); v.removeAttribute('src'); while (v.firstChild) v.removeChild(v.firstChild); v.load(); } catch { /* ya no está */ }
    };
  }, [video, velocidad, onFin]);

  return (
    <div className="ap-video">
      <video ref={ref} muted playsInline preload="auto" poster={video.poster} disablePictureInPicture
        controls={false} aria-hidden="true">
        {video.fuentes.map((f) => <source key={f.src} src={f.src} type={f.tipo} />)}
      </video>
      {cargando && <div className="ap-video-carga" aria-hidden="true" />}
    </div>
  );
}
