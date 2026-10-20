import React from 'react';

/* EL SOBRE
 *
 * El mismo sobre de siempre (bordes dentados, brillo que pasa), con los colores
 * y el ícono de su variante. El nombre va escrito: el tipo no se distingue
 * sólo por el color.
 */

const ICONOS = {
  estrella: <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" />,
  pulso: <path d="M2 12h4l2.5-6 4 12 3-8 1.5 2H22" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  rayo: <path d="M13.5 2L4 13.5h6.5L9.5 22 20 9.5h-6.5z" />,
  cristal: <path d="M12 2l8 6-3 12H7L4 8zM12 2v18M4 8h16M7 20l5-12 5 12" fill="none" strokeWidth="1.6" strokeLinejoin="round" />,
  copa: <path d="M7 3h10v4a5 5 0 0 1-10 0zM5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3M12 12v5M8 21h8M9.5 17h5" fill="none" strokeWidth="1.8" strokeLinecap="round" />,
};

function Icono({ nombre }) {
  if (nombre === 'semana') {
    return (
      <svg viewBox="0 0 24 24" className="ap-sobre-icono" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <text x="12" y="19" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="currentColor">7</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="ap-sobre-icono" aria-hidden="true" fill="currentColor" stroke="currentColor">
      {ICONOS[nombre] || ICONOS.estrella}
    </svg>
  );
}

export default function PaqueteSobre({ variante }) {
  return (
    <div className="ap-sobre">
      <div className="ap-sobre-aura" />
      <div className="ap-sobre-cuerpo">
        <Icono nombre={variante.icono} />
        <span className="ap-sobre-tipo">{variante.nombre}</span>
        <span className="ap-sobre-marca">MYSQUAD · FUTSAL</span>
      </div>
      {/* las mitades en que se parte al abrirse (portal de energía / estándar) */}
      <div className="ap-sobre-tajo" />
    </div>
  );
}
