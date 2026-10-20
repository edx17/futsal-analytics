import React, { useState } from 'react';

/* EL PASILLO AL PABELLÓN DE FUTSAL (la apertura de cine)
 *
 * Una escena 2.5D hecha con planos de CSS 3D: piso (parquet o sintético),
 * techo con focos, dos paredes y, al fondo, la boca del pasillo con la cancha
 * cubierta. La "cámara" es un translateZ que avanza por el pasillo: la
 * profundidad es real (perspectiva del navegador), no un zoom de una imagen.
 *
 * Lo que cambia por variante (analytics/aperturas.js) son clases y variables
 * CSS: escenario (leds, focos, cristal, solemne), piso, portal y aparición.
 * Las fases las marca el director (AperturaSobre): .ap-fase-portal, -tunel…
 *
 * Medidas: el pasillo mide W × H y L de largo (en px de CSS). La cancha del
 * fondo respeta el arco de futsal (3 × 2 m) y una pelota a escala.
 */

const LARGO = 2600;
const LAMPARAS = 10;

const medir = () => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const W = Math.round(Math.min(900, Math.max(380, vw * 1.02)));
  const H = Math.round(Math.min(vh * 0.95, W * 0.62));
  return { W, H };
};

/* Una camiseta colgada en la pared, con su número. */
function Camiseta({ numero }) {
  return (
    <svg viewBox="0 0 60 64" className="tf-camiseta" aria-hidden="true">
      <path d="M18 4l-14 8 6 12 6-3v39h28V21l6 3 6-12-14-8c-2 5-6 7-12 7S20 9 18 4z" fill="var(--ap-secundario)" stroke="var(--ap-luz)" strokeWidth="1.6" />
      <text x="30" y="46" textAnchor="middle" fontSize="20" fontWeight="900" fill="var(--ap-luz)">{numero}</text>
    </svg>
  );
}

/* La cancha cubierta al final del pasillo, vista desde la boca del túnel. */
function Cancha({ piso }) {
  const sintetico = piso === 'sintetico';
  return (
    <svg viewBox="0 0 400 250" className="tf-cancha" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="tf-tribuna" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070a" />
          <stop offset="1" stopColor="#161b22" />
        </linearGradient>
        <pattern id="tf-publico" width="7" height="8" patternUnits="userSpaceOnUse">
          <circle cx="3.5" cy="3" r="2.1" fill="rgba(255,255,255,.11)" />
          <rect x="1.3" y="5" width="4.4" height="3" rx="1.5" fill="rgba(255,255,255,.07)" />
        </pattern>
        <linearGradient id="tf-pisocancha" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sintetico ? '#1d4ed8' : '#a16207'} />
          <stop offset="1" stopColor={sintetico ? '#1e3a8a' : '#78350f'} />
        </linearGradient>
        <radialGradient id="tf-halo" cx="50%" cy="60%" r="50%">
          <stop offset="0" stopColor="var(--ap-luz)" stopOpacity=".95" />
          <stop offset="1" stopColor="var(--ap-luz)" stopOpacity="0" />
        </radialGradient>
        <pattern id="tf-red" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 0L4 4M4 0L0 4" stroke="rgba(255,255,255,.45)" strokeWidth=".5" />
        </pattern>
      </defs>
      {/* tribunas con público y los focos del techo del pabellón */}
      <rect width="400" height="130" fill="url(#tf-tribuna)" />
      <rect y="40" width="400" height="80" fill="url(#tf-publico)" />
      {[50, 130, 200, 270, 350].map((x) => <ellipse key={x} cx={x} cy="12" rx="16" ry="4" fill="var(--ap-luz)" className="tf-foco-pabellon" />)}
      {/* el piso de la cancha en perspectiva, con sus líneas */}
      <polygon points="40,250 360,250 318,122 82,122" fill="url(#tf-pisocancha)" />
      <polygon points="40,250 360,250 318,122 82,122" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.4" />
      <path d="M150 122 Q200 160 250 122" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.2" />
      <ellipse cx="200" cy="232" rx="58" ry="12" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1.2" />
      <circle cx="200" cy="141" r="1.6" fill="#fff" />
      {/* el arco de futsal (3 × 2 m): 30 × 20 a esta distancia */}
      <rect x="185" y="102" width="30" height="20" fill="url(#tf-red)" />
      <path d="M185 122V102h30v20" fill="none" stroke="#fff" strokeWidth="2" />
      {/* la figura, a contraluz: no se sabe quién es hasta las cartas */}
      <ellipse cx="244" cy="176" rx="70" ry="80" fill="url(#tf-halo)" className="tf-halo" />
      <polygon points="244,-10 294,250 194,250" fill="var(--ap-luz)" className="tf-haz" />
      <polygon points="-20,-10 30,-10 274,250 214,250" fill="var(--ap-luz)" className="tf-foco-cruzado" />
      <polygon points="420,-10 370,-10 214,250 274,250" fill="var(--ap-luz)" className="tf-foco-cruzado" />
      <g className="tf-silueta" transform="translate(44 8)">
        <path d="M200 96c-6 0-10 5-10 11s4 11 10 11 10-5 10-11-4-11-10-11zM186 121c-7 2-11 7-12 14l-5 30c-1 4 4 6 6 2l7-24v26l-6 46c-1 5 6 6 7 1l8-40 2-2 2 2 8 40c1 5 8 4 7-1l-6-46v-26l7 24c2 4 7 2 6-2l-5-30c-1-7-5-12-12-14z" fill="#000" />
        {/* la pelota de futsal, a escala del jugador */}
        <circle cx="222" cy="232" r="6" fill="#f8fafc" stroke="#111" strokeWidth=".8" />
        <path d="M222 228.6l2.6 1.9-1 3h-3.2l-1-3z" fill="#111" />
      </g>
    </svg>
  );
}

export default function TunelFutsal({ variante }) {
  const [{ W, H }] = useState(medir);
  const lamparas = Array.from({ length: LAMPARAS }, (_, i) => i);
  const vars = { '--W': `${W}px`, '--H': `${H}px`, '--L': `${LARGO}px` };

  return (
    <div className={`tf tf-${variante.escenario} tf-portal-${variante.portal} tf-ap-${variante.aparicion} tf-piso-${variante.piso} tf-salida-${variante.salida}`}
      style={vars} aria-hidden="true">
      <div className="tf-vista">
        <div className="tf-camara">
          <div className="tf-balanceo">
            {/* piso: tablas de parquet (o sintético), la línea de LED y los reflejos de cada foco */}
            <div className="tf-plano tf-piso">
              <div className="tf-piso-linea" />
              {lamparas.map((i) => (
                <i key={i} className="tf-reflejo" style={{ top: (i + 0.5) * (LARGO / LAMPARAS), '--i': i }} />
              ))}
            </div>
            {/* techo: los focos se van prendiendo a medida que pasa la cámara */}
            <div className="tf-plano tf-techo">
              {lamparas.map((i) => (
                <i key={i} className="tf-lampara" style={{ top: (i + 0.5) * (LARGO / LAMPARAS), '--i': i }} />
              ))}
            </div>
            <div className="tf-plano tf-pared tf-izq">
              <div className="tf-led tf-led-alta" />
              <div className="tf-led tf-led-baja" />
              <div className="tf-cartel" style={{ left: 380 }}>MYSQUAD</div>
              <div className="tf-colgada" style={{ left: 1150 }}><Camiseta numero="10" /></div>
              <div className="tf-colgada" style={{ left: 1900 }}><Camiseta numero="7" /></div>
            </div>
            <div className="tf-plano tf-pared tf-der">
              <div className="tf-led tf-led-alta" />
              <div className="tf-led tf-led-baja" />
              <div className="tf-cartel" style={{ left: LARGO - 380 - 260 }}>FUTSAL</div>
              <div className="tf-colgada" style={{ left: LARGO - 1500 }}><Camiseta numero="9" /></div>
              <div className="tf-colgada" style={{ left: LARGO - 2250 }}><Camiseta numero="1" /></div>
            </div>
            {/* el fondo: la boca del pasillo y la cancha cubierta */}
            <div className="tf-fondo">
              <div className="tf-boca"><Cancha piso={variante.piso} /></div>
              <div className="tf-marco-cartel">CANCHA</div>
            </div>
          </div>
        </div>
      </div>
      <div className="tf-barrido" />
      <div className="tf-cristales">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
      <div className="tf-anillo" />
      <div className="tf-vineta" />
    </div>
  );
}
