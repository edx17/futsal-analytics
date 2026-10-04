import React from 'react';

/* UNA CARTA AL ESTILO ULTIMATE TEAM
 *
 * `chica`: la del banco (media, puesto y apellido). La grande lleva también
 * la foto y los seis atributos. La foto sale de la ficha del plantel; si no
 * hay, van las iniciales.
 */

const iniciales = (c) => `${(c.nombre || '?')[0] || ''}${(c.apellido || '')[0] || ''}`.toUpperCase();

const BADGE = { figura: 'FIGURA', evaluacion: 'EN EVALUACIÓN' };

export default function CartaJugador({ carta, chica = false, seleccionada = false, onClick, style }) {
  if (!carta) return null;
  const clase = `${chica ? 'mq-mini' : 'mq-carta'} mq-${carta.tier}${seleccionada ? ' mq-sel' : ''}`;
  const titulo = `${carta.apellido} ${carta.nombre}`.trim();

  return (
    <div className={clase} style={style} onClick={onClick} title={titulo} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}>
      {!chica && BADGE[carta.tier] && <div className="mq-badge">{BADGE[carta.tier]}</div>}
      <div className="mq-forma">
        <div className="mq-ovr">{carta.enEvaluacion ? '—' : carta.ovr}</div>
        <div className="mq-rol">{carta.rol}</div>
        <div className="mq-foto">
          {carta.foto
            ? <img src={carta.foto} alt="" loading="lazy" />
            : <span>{iniciales(carta)}</span>}
        </div>
        <div className="mq-nombre">{(carta.apellido || carta.nombre || '').toUpperCase()}</div>
        {!chica && (
          <div className="mq-attrs">
            {carta.atributos.map(([k, v]) => <span key={k}><em>{k}</em>{v}</span>)}
          </div>
        )}
      </div>
      {!chica && <div className="mq-chip">{carta.rol}</div>}
    </div>
  );
}
