import React, { useId } from 'react';

/* LA CARTA DE LOS PREMIOS, HECHA PARA EXPORTARSE
 *
 * La carta de la cancha (CartaJugador + quinteto.css) saca su forma de escudo
 * con `clip-path`, y el exportador a PNG de las placas (html2canvas) no lo
 * entiende: la carta saldría como un rectángulo. Por eso esta se arma de otra
 * manera:
 *
 *   · la FORMA es un <svg> en línea (html2canvas lo convierte en imagen
 *     completo, con sus degradés). Adentro no hay texto ni imágenes externas,
 *     que es justo lo que un SVG convertido en imagen no puede cargar;
 *   · el TEXTO y la FOTO son HTML encima, con `border-radius`, que sí se
 *     exporta bien y toma la tipografía de la placa.
 *
 * Se dibuja sobre una grilla de 320×480 y se escala con `ancho`: los mismos
 * números sirven para la carta chica de la pantalla y la grande de la placa,
 * sin `transform` ni `zoom` (que el exportador trata distinto en cada
 * navegador).
 */

const BASE_W = 320;
const BASE_H = 480;

/* El escudo: esquinas cortadas arriba, punta abajo. Son las mismas
   proporciones que el clip-path de la carta de la cancha. */
const FORMA = 'M0,29 L32,0 L288,0 L320,29 L320,432 L160,480 L0,432 Z';
const FORMA_INTERIOR = 'M9,36 L38,9 L282,9 L311,36 L311,428 L160,467 L9,428 Z';
const BRILLO = 'M0,29 L32,0 L170,0 L0,250 Z';

/* Un juego de colores por premio. Los tres primeros espejan las cartas de
   siempre (oro, plata y bronce) para poder usar esta misma carta con ellas. */
export const VARIANTES = {
  oro:    { grad: ['#fff1b8', '#e7c766', '#b8902c'], borde: '#fff7d6', texto: '#2a2005', suave: 'rgba(42,32,5,.62)', pastilla: 'rgba(42,32,5,.14)' },
  plata:  { grad: ['#f4f6f8', '#c7ced6', '#8b96a3'], borde: '#ffffff', texto: '#1b2229', suave: 'rgba(27,34,41,.62)', pastilla: 'rgba(27,34,41,.12)' },
  bronce: { grad: ['#f6d2b0', '#c98b57', '#8a5527'], borde: '#ffe6cf', texto: '#2b1606', suave: 'rgba(43,22,6,.62)', pastilla: 'rgba(43,22,6,.14)' },
  potw:   { grad: ['#1b2b24', '#0a3b26', '#00b862'], borde: '#7dffc0', texto: '#eafff4', suave: 'rgba(234,255,244,.7)', pastilla: 'rgba(0,0,0,.28)' },
  totw:   { grad: ['#16233f', '#1f3a8a', '#3b82f6'], borde: '#bfdbfe', texto: '#eff6ff', suave: 'rgba(239,246,255,.72)', pastilla: 'rgba(0,0,0,.28)' },
  potm:   { grad: ['#2a1647', '#5b21b6', '#a855f7'], borde: '#e9d5ff', texto: '#faf5ff', suave: 'rgba(250,245,255,.72)', pastilla: 'rgba(0,0,0,.28)' },
  totm:   { grad: ['#06323a', '#0e7490', '#22d3ee'], borde: '#a5f3fc', texto: '#ecfeff', suave: 'rgba(236,254,255,.72)', pastilla: 'rgba(0,0,0,.28)' },
  toty:   { grad: ['#0b0b0b', '#3b2f0b', '#e7c766'], borde: '#ffe9a3', texto: '#fff7dc', suave: 'rgba(255,247,220,.72)', pastilla: 'rgba(0,0,0,.34)' },
};

const FUENTE = "'Archivo', system-ui, -apple-system, sans-serif";

/* El apellido se achica hasta entrar en una línea (284 de ancho útil, ~0,84 de
   ancho por letra en mayúsculas negrita) en vez de cortarse con "…". */
const tamanoNombre = (nombre) => Math.max(14, Math.min(34, Math.floor(284 / (Math.max(1, nombre.length) * 0.84))));

const iniciales = (c) => `${(c.nombre || '?')[0] || ''}${(c.apellido || '')[0] || ''}`.toUpperCase();
const nota1 = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '—');

export default function CartaPremio({ carta, variante = 'potw', sigla = '', pie = '', ancho = BASE_W, destacada = false, style, className = '' }) {
  const v = VARIANTES[variante] || VARIANTES.potw;
  const u = ancho / BASE_W;
  const alto = Math.round(BASE_H * u);
  const px = (n) => Math.round(n * u * 100) / 100;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!carta) return null;

  const nombre = (carta.apellido || carta.nombre || '').toUpperCase();
  const sub = [carta.dorsal != null && carta.dorsal !== '' ? `#${carta.dorsal}` : null, carta.categoria].filter(Boolean).join(' · ');
  const stats = [['NOTA', nota1(carta.nota)], ['PJ', carta.pj ?? '—'], ['G', carta.goles ?? 0], ['A', carta.asistencias ?? 0]];

  return (
    <div className={className} style={{ position: 'relative', width: ancho, height: alto, flexShrink: 0, fontFamily: FUENTE, color: v.texto, ...style }}>
      <svg width={ancho} height={alto} viewBox={`0 0 ${BASE_W} ${BASE_H}`} style={{ position: 'absolute', left: 0, top: 0, display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor={v.grad[0]} />
            <stop offset="0.5" stopColor={v.grad[1]} />
            <stop offset="1" stopColor={v.grad[2]} />
          </linearGradient>
        </defs>
        <path d={FORMA} fill={`url(#f${id})`} />
        <path d={BRILLO} fill="#ffffff" fillOpacity="0.09" />
        <path d={FORMA_INTERIOR} fill="none" stroke={v.borde} strokeOpacity="0.55" strokeWidth="2" />
        <path d={FORMA} fill="none" stroke={v.borde} strokeOpacity="0.9" strokeWidth="3" />
      </svg>

      {/* media y puesto */}
      <div style={{ position: 'absolute', left: px(34), top: px(34), lineHeight: 1 }}>
        <div style={{ fontSize: px(72), fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 0.95 }}>{carta.ovr ?? '—'}</div>
        <div style={{ fontSize: px(26), fontWeight: 800, letterSpacing: '0.08em', marginTop: px(6) }}>{carta.rol}</div>
        {sigla && (
          <div style={{ display: 'inline-block', marginTop: px(12), padding: `${px(3)}px ${px(9)}px`, borderRadius: px(6),
                        background: v.pastilla, fontSize: px(15), fontWeight: 900, letterSpacing: '0.14em', lineHeight: 1.1 }}>
            {sigla}
          </div>
        )}
      </div>

      {/* foto */}
      <div style={{ position: 'absolute', left: px(142), top: px(46), width: px(160), height: px(160), borderRadius: '50%', overflow: 'hidden',
                    background: v.pastilla, border: `${px(3)}px solid ${v.borde}`, boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {carta.foto
          ? <img src={carta.foto} alt="" crossOrigin="anonymous" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ fontSize: px(60), fontWeight: 900, color: v.suave }}>{iniciales(carta)}</span>}
      </div>

      {/* nombre */}
      <div style={{ position: 'absolute', left: px(18), right: px(18), top: px(236), textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis', fontSize: px(tamanoNombre(nombre)), fontWeight: 900, letterSpacing: '0.02em', lineHeight: 1.1 }}>
        {nombre}
      </div>
      <div style={{ position: 'absolute', left: px(60), right: px(60), top: px(282), height: px(2), background: v.borde, opacity: 0.45 }} />
      <div style={{ position: 'absolute', left: px(18), right: px(18), top: px(290), textAlign: 'center', fontSize: px(14), fontWeight: 700,
                    letterSpacing: '0.12em', color: v.suave, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sub || ' '}
      </div>

      {/* números */}
      <div style={{ position: 'absolute', left: px(26), right: px(26), top: px(326), display: 'flex', justifyContent: 'space-between' }}>
        {stats.map(([k, val]) => (
          <div key={k} style={{ flex: 1, textAlign: 'center', lineHeight: 1 }}>
            <div style={{ fontSize: px(26), fontWeight: 900 }}>{val}</div>
            <div style={{ fontSize: px(11), fontWeight: 800, letterSpacing: '0.16em', color: v.suave, marginTop: px(5) }}>{k}</div>
          </div>
        ))}
      </div>

      {/* pie: el período al que corresponde */}
      {pie && (
        <div style={{ position: 'absolute', left: px(20), right: px(20), top: px(396), textAlign: 'center', fontSize: px(13), fontWeight: 800,
                      letterSpacing: '0.14em', color: v.suave, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {pie}
        </div>
      )}

      {/* estrella del jugador que dio nombre al premio dentro del quinteto */}
      {destacada && (
        <div style={{ position: 'absolute', right: px(22), top: px(14), width: px(40), height: px(40), borderRadius: '50%', background: v.borde,
                      color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: px(24), fontWeight: 900, lineHeight: 1 }}>
          ★
        </div>
      )}
    </div>
  );
}
