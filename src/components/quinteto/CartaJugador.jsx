import React from 'react';

/* UNA CARTA AL ESTILO ULTIMATE TEAM
 *
 * `chica`: la del banco (media, puesto y apellido). La grande lleva también
 * la foto y los seis atributos. La foto sale de la ficha del plantel; si no
 * hay, van las iniciales.
 */

const iniciales = (c) => `${(c.nombre || '?')[0] || ''}${(c.apellido || '')[0] || ''}`.toUpperCase();

const BADGE = { figura: 'FIGURA', evaluacion: 'EN EVALUACIÓN' };

/* `etiqueta`: el puesto que pide el lugar de la cancha (va en el chip de abajo).
   `fueraDePuesto`: el jugador no es de ese puesto; la carta lo avisa.
   El resto de las props (data-lugar, onPointerDown…) van al elemento de afuera. */
export default function CartaJugador({
  carta, chica = false, seleccionada = false, onClick, style, className = '',
  etiqueta, fueraDePuesto = false, ...resto
}) {
  if (!carta) return null;
  const clase = `${chica ? 'mq-mini' : 'mq-carta'} mq-${carta.tier}${seleccionada ? ' mq-sel' : ''}${fueraDePuesto ? ' mq-fuera' : ''} ${className}`;
  const titulo = `${carta.apellido} ${carta.nombre}`.trim();
  const badge = fueraDePuesto ? 'FUERA DE PUESTO' : BADGE[carta.tier];

  return (
    <div className={clase} style={style} onClick={onClick} title={titulo} role="button" tabIndex={0}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      {...resto}>
      {!chica && badge && <div className="mq-badge">{badge}</div>}
      <div className="mq-forma">
        <div className="mq-ovr">{carta.enEvaluacion ? '—' : carta.ovr}</div>
        <div className="mq-rol">{carta.rol}</div>
        <div className="mq-foto">
          {carta.foto
            ? <img src={carta.foto} alt="" loading="lazy" draggable={false} />
            : <span>{iniciales(carta)}</span>}
        </div>
        <div className="mq-nombre">{(carta.apellido || carta.nombre || '').toUpperCase()}</div>
        {!chica && (
          <div className="mq-attrs">
            {carta.atributos.map(([k, v]) => <span key={k}><em>{k}</em>{v}</span>)}
          </div>
        )}
      </div>
      {!chica && <div className="mq-chip">{etiqueta || carta.rol}</div>}
    </div>
  );
}
