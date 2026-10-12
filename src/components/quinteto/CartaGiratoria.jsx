import React, { useState } from 'react';
import CartaJugador from './CartaJugador';

/* UNA CARTA QUE SE GIRA
 *
 * Del frente (media, puesto, foto, atributos) al dorso: la foto completa, con el
 * apellido y la media nada más. Un toque la da vuelta; otro, la vuelve a su lugar.
 * El dorso lleva el mismo color que el frente (oro, TOTW, TOTY…).
 */

const iniciales = (c) => `${(c.nombre || '?')[0] || ''}${(c.apellido || '')[0] || ''}`.toUpperCase();

export default function CartaGiratoria({ carta, etiqueta }) {
  const [volteada, setVolteada] = useState(false);
  if (!carta) return null;
  const premio = carta.premio ? ` mq-premio mq-p-${carta.premio.toLowerCase()}` : '';
  const alternar = () => setVolteada((v) => !v);

  return (
    <div className={`mq-giro${volteada ? ' mq-volteada' : ''}`}>
      <div className="mq-giro-in">
        <div className="mq-cara">
          <CartaJugador carta={carta} etiqueta={etiqueta} style={{ position: 'relative' }} onClick={alternar} />
        </div>
        <div className={`mq-cara mq-cara-dorso`}>
          <div className={`mq-carta mq-${carta.tier}${premio}`} style={{ position: 'relative' }} role="button" tabIndex={volteada ? 0 : -1}
            title={`${carta.apellido} ${carta.nombre}`.trim()} onClick={alternar}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } }}>
            <div className="mq-forma mq-dorso">
              {carta.foto
                ? <img src={carta.foto} alt="" draggable={false} />
                : <span className="mq-dorso-iniciales">{iniciales(carta)}</span>}
              <div className="mq-dorso-datos">
                <b>{(carta.apellido || carta.nombre || '').toUpperCase()}</b>
                <span>{carta.enEvaluacion ? '—' : carta.ovr}<em>{carta.rol}</em></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
