import React, { useEffect } from 'react';
import CartaGiratoria from '../quinteto/CartaGiratoria';
import { rarezaPorId, MONEDA } from '../../analytics/sobres';
import { sonar } from '../../utils/sonidoApertura';

/* LA MEJOR CARTA DEL SOBRE
 *
 * Después del pasillo, en la luz del final aparece sola la carta más rara del
 * sobre (la real, la que salió en la base). Después se ven las demás.
 */
const aCarta = (c) => ({ atributos: [], stats: {}, ...(c.carta || c) });
const ESPECIALES = new Set(['totw', 'potw', 'totm', 'potm', 'toty']);

export default function MejorCarta({ carta, variante, restantes, onSeguir }) {
  useEffect(() => {
    if (carta) sonar(ESPECIALES.has(carta.rareza) ? 'cartaRara' : 'carta');
    else onSeguir(); // un sobre sin cartas: no hay nada que mostrar acá
  }, [carta, onSeguir]);
  if (!carta) return null;
  const rareza = rarezaPorId[carta.rareza]?.nombre || '';
  return (
    <div className="ap-mejor">
      <div className="ap-mejor-luz" aria-hidden="true" />
      <div className="ap-mejor-rayos" aria-hidden="true" />
      <div className="ap-mejor-rotulo">{variante.nombre}</div>
      <div className="ap-mejor-carta">
        <CartaGiratoria carta={aCarta(carta)} etiqueta={rareza} />
      </div>
      <div className="ap-mejor-datos">
        <b>{rareza}</b>
        <span style={{ color: carta.nueva ? '#00ff88' : '#fbbf24' }}>
          {carta.nueva ? 'NUEVA' : `REPETIDA · +${carta.puntos} ${MONEDA.toUpperCase()}`}
        </span>
      </div>
      <button className="ap-btn" onClick={onSeguir} autoFocus>
        {restantes > 0 ? `VER LAS ${restantes} QUE QUEDAN` : 'SEGUIR'}
      </button>
    </div>
  );
}
