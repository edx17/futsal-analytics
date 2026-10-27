import React, { useCallback, useState } from 'react';
import { Countdown } from './ui';
import useAvisosVCoins from './useAvisosVCoins';
import { cartelVCoins } from '../analytics/avisosVCoins';

/* EL CARTEL DE LAS V-COINS MULTIPLICADAS (arriba de todos los Juegos)
 *
 *   Anticipado:  "PRÓXIMAMENTE · x2 V-COINS · FINDE" + en qué juegos + "empieza en 2d 03:10:05"
 *   En curso:    "⚡ x2 V-COINS · FINDE" + en qué juegos + "termina en 05:10:22"
 * Cuando termina la cuenta, se vuelve a pedir (pasa de anticipado a en curso, o se va).
 */
export default function AvisoVCoins({ activo = true }) {
  const [vuelta, setVuelta] = useState(0);
  const avisos = useAvisosVCoins(activo, vuelta);
  // Una vez por cuenta (es estable): pide de nuevo y el cartel cambia o se va.
  const alTerminar = useCallback(() => setVuelta((v) => v + 1), []);
  const c = cartelVCoins(avisos);
  if (!c) return null;
  const curso = c.tipo === 'curso';
  return (
    <div className={`jg-aviso-vc ${curso ? 'jg-aviso-curso' : 'jg-aviso-proximo'}`} role="status">
      <svg className="jg-aviso-icono" viewBox="0 0 24 24" aria-hidden="true">
        {curso ? <path d="M13 2 3 14h9l-1 8 10-12h-9z" fill="currentColor" />
          : <><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 9v4l2.5 2M9 2h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
      </svg>
      <span className="jg-aviso-texto">
        {!curso && <small>PRÓXIMAMENTE</small>}
        <b>{c.titulo}</b>
        <span>En {c.donde}</span>
      </span>
      <span className="jg-aviso-cuenta">
        <small>{curso ? 'TERMINA EN' : 'EMPIEZA EN'}</small>
        <Countdown hasta={curso ? c.hasta : c.desde} alTerminar={alTerminar} />
      </span>
    </div>
  );
}
