import React, { useId, useState } from 'react';
import { FAMILIAS, familiaDe } from '../../analytics/especialesCartas';

/* LAS CARTAS ESPECIALES (Goleadores, Asistidores, Presencia, MVP, Recuperadores)
 *
 * Misma técnica que CartaPremio, para que se exporten igual en las placas:
 *   · capa de atrás: un <svg> con la forma, el metal y la luz de la familia;
 *   · la FOTO real del jugador en HTML (html2canvas no carga imágenes adentro
 *     de un SVG), con la luz de contorno detrás y el fundido abajo;
 *   · capa de adelante: otro <svg> con el marco, la insignia y el distintivo
 *     de puesto (series del 1 al 10);
 *   · los textos en HTML.
 * Grilla de 320×480 escalada con `ancho`. Cada familia tiene su silueta, su
 * insignia y su textura (ver FAMILIAS en analytics/especialesCartas.js): no
 * son recoloreos de una misma carta.
 *
 * `compacta`: la del banco (media, foto, apellido, insignia y puesto).
 * Todos los números salen de la carta: no se inventa nada si falta un dato.
 */

const W = 320;
const H = 480;
const FUENTE = "'Archivo', system-ui, -apple-system, sans-serif";

/* Siluetas */
const FORMAS = {
  hoja: 'M0,40 L40,0 L128,0 L160,24 L192,0 L280,0 L320,40 L320,440 L280,480 L40,480 L0,440 Z',
  arco: 'M0,124 C0,44 70,0 160,0 C250,0 320,44 320,124 L320,452 L292,480 L28,480 L0,452 Z',
  octo: 'M26,0 L294,0 L320,26 L320,454 L294,480 L26,480 L0,454 L0,26 Z',
  chaflan: 'M58,0 L262,0 L320,58 L320,422 L262,480 L58,480 L0,422 L0,58 Z',
  corona: 'M0,64 L44,64 L80,22 L118,52 L160,0 L202,52 L240,22 L276,64 L320,64 L320,440 L160,480 L0,440 Z',
  escudo: 'M0,0 L320,0 L320,300 C320,392 238,450 160,480 C82,450 0,392 0,300 Z',
};
/* El borde interior: la misma silueta, un poco adentro. */
const INTERIOR = 'translate(11,11) scale(0.93125,0.954)';

/* Cómo va la foto en cada silueta (el recorte va con border-radius: se exporta). */
const FOTO = {
  hoja: { top: 44, left: 26, w: 268, h: 230, radio: '6px 6px 0 0' },
  arco: { top: 30, left: 26, w: 268, h: 244, radio: '134px 134px 0 0' },
  octo: { top: 30, left: 24, w: 272, h: 244, radio: '14px 14px 0 0' },
  chaflan: { top: 30, left: 30, w: 260, h: 244, radio: '40px 40px 0 0' },
  corona: { top: 66, left: 26, w: 268, h: 210, radio: '4px 4px 0 0' },
  escudo: { top: 26, left: 26, w: 268, h: 236, radio: '6px 6px 0 0' },
};

/* Dónde va cada bloque de texto (el escudo se angosta abajo, la corona tiene laureles). */
const LAYOUT = {
  base: { cinta: 316, numero: 344, secundarios: 398, pie: 446, margen: 34, margenPie: 44 },
  escudo: { cinta: 306, numero: 332, secundarios: 382, pie: 428, margen: 62, margenPie: 92 },
  corona: { cinta: 316, numero: 344, secundarios: 394, pie: 440, margen: 40, margenPie: 70 },
};

const iniciales = (c) => `${(c.nombre || '?')[0] || ''}${(c.apellido || '')[0] || ''}`.toUpperCase();
/* La cinta entra en una línea: ~1 em por letra con el espaciado. */
const tamanoCinta = (texto, ancho) => Math.min(12.5, ancho / (Math.max(1, String(texto).length) * 0.98));
const tamanoNombre = (nombre, max = 34) => Math.max(14, Math.min(max, Math.floor(270 / (Math.max(1, nombre.length) * 0.82))));

export default function CartaEspecial({ carta, tipo, ancho = W, compacta = false, style, className = '' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [fotoRota, setFotoRota] = useState(null); // la url que no cargó: van las iniciales
  const t = tipo || carta?.premio;
  const fam = FAMILIAS[familiaDe(t)];
  if (!carta || !fam) return null;
  const u = ancho / W;
  const alto = Math.round(H * u);
  const px = (n) => Math.round(n * u * 100) / 100;
  const e = carta.especial || {};
  const forma = FORMAS[fam.forma];
  const foto = FOTO[fam.forma];
  const c = fam.colores;
  const nombre = (carta.apellido || carta.nombre || '').toUpperCase();
  const valor = e.valor ?? carta.stats?.[fam.stat] ?? carta[fam.stat];
  const puesto = e.puesto;
  const enSerie = fam.serie && Number.isFinite(Number(puesto));
  const g = (s) => `${s}${id}`;
  const L = LAYOUT[fam.forma] || LAYOUT.base;
  // En la carta de la cancha (122 px) las letras más chicas no se leen: va lo esencial, más grande.
  const mediana = !compacta && ancho < 200;

  return (
    <div className={className} style={{ position: 'relative', width: ancho, height: alto, flexShrink: 0, fontFamily: FUENTE, color: c.texto, ...style }}>
      {/* ── capa de atrás: metal, luz y textura de la familia ── */}
      <svg width={ancho} height={alto} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id={g('fondo')} x1="0" y1="0" x2="0.35" y2="1">
            {c.fondo.map((col, i) => <stop key={i} offset={i / (c.fondo.length - 1)} stopColor={col} />)}
          </linearGradient>
          <radialGradient id={g('luz')} cx="0.5" cy="0.36" r="0.55">
            <stop offset="0" stopColor={c.luz} stopOpacity="0.75" />
            <stop offset="0.55" stopColor={c.luz} stopOpacity="0.16" />
            <stop offset="1" stopColor={c.luz} stopOpacity="0" />
          </radialGradient>
          <pattern id={g('hex')} width="24" height="41.6" patternUnits="userSpaceOnUse">
            <path d="M12,0 L24,6.9 L24,20.8 L12,27.7 L0,20.8 L0,6.9 Z M12,27.7 L12,41.6" fill="none" stroke={c.detalle} strokeOpacity="0.22" strokeWidth="1" />
          </pattern>
          <pattern id={g('cepillado')} width="320" height="4" patternUnits="userSpaceOnUse">
            <rect width="320" height="1" fill="#ffffff" fillOpacity="0.05" />
          </pattern>
          <clipPath id={g('recorte')}><path d={forma} /></clipPath>
        </defs>
        <g clipPath={`url(#${g('recorte')})`}>
          <path d={forma} fill={`url(#${g('fondo')})`} />
          <path d={forma} fill={`url(#${g('luz')})`} />
          <Textura fam={fam} g={g} forma={forma} />
        </g>
      </svg>

      {/* ── la foto real del jugador ── */}
      <div style={{ position: 'absolute', top: px(foto.top), left: px(foto.left), width: px(foto.w), height: px(foto.h), borderRadius: escalarRadio(foto.radio, u), overflow: 'hidden' }}>
        {carta.foto && fotoRota !== carta.foto
          ? <img src={carta.foto} alt="" crossOrigin="anonymous" draggable={false} onError={() => setFotoRota(carta.foto)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: px(84), fontWeight: 900, color: c.suave, opacity: 0.6 }}>{iniciales(carta)}</div>}
        {/* fundido hacia el color de la carta (con degradé CSS: se exporta) */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', background: `linear-gradient(180deg, transparent 0%, ${c.fundido} 92%)` }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(115deg, rgba(255,255,255,.16) 0%, transparent 28%, transparent 70%, ${c.contraluz} 100%)` }} />
      </div>

      {/* ── capa de adelante: marco, insignia, puesto ── */}
      <svg width={ancho} height={alto} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id={g('metal')} x1="0" y1="0" x2="1" y2="1">
            {c.metal.map((col, i) => <stop key={i} offset={i / (c.metal.length - 1)} stopColor={col} />)}
          </linearGradient>
          <clipPath id={g('recorte2')}><path d={forma} /></clipPath>
        </defs>
        <path d={forma} fill="none" stroke={`url(#${g('metal')})`} strokeWidth="9" />
        <path d={forma} transform={INTERIOR} fill="none" stroke={c.filo} strokeOpacity="0.8" strokeWidth="1.6" />
        <g clipPath={`url(#${g('recorte2')})`}><Adorno fam={fam} g={g} /></g>
        <g transform="translate(268,92)"><Insignia fam={fam} g={g} /></g>
        {enSerie && <Medalla fam={fam} g={g} puesto={puesto} empate={!!e.empate} />}
      </svg>

      {/* media y puesto (como todas las cartas del juego) */}
      <div style={{ position: 'absolute', left: px(36), top: px(fam.forma === 'corona' ? 78 : 48), lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,.65)' }}>
        <div style={{ fontSize: px(60), fontWeight: 900, letterSpacing: '-0.03em', color: c.media }}>{carta.ovr ?? '—'}</div>
        <div style={{ fontSize: px(20), fontWeight: 800, letterSpacing: '0.1em', marginTop: px(4) }}>{carta.rol}</div>
      </div>

      {/* nombre */}
      <div style={{ position: 'absolute', left: px(22), right: px(22), top: px(compacta ? 300 : 276), textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
                    fontSize: px(tamanoNombre(nombre, compacta ? 44 : 32)), fontWeight: 900, letterSpacing: '0.03em', lineHeight: 1.1, textShadow: '0 2px 6px rgba(0,0,0,.5)' }}>
        {nombre}
      </div>

      {!compacta && (
        <>
          {/* qué premio es */}
          <div style={{ position: 'absolute', left: px(L.margen - 8), right: px(L.margen - 8), top: px(L.cinta), textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: `${px(3)}px ${px(10)}px`, borderRadius: px(4), background: c.cinta, color: c.cintaTexto,
                           fontSize: px(tamanoCinta(carta.titulo || fam.titulo, W - 2 * (L.margen - 8) - 24)), fontWeight: 900, letterSpacing: '0.14em',
                           whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden' }}>
              {carta.titulo || fam.titulo}
            </span>
          </div>

          {/* el número que lo hizo ganar */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: px(mediana ? L.numero + 22 : L.numero), textAlign: 'center', lineHeight: 1 }}>
            <span style={{ fontSize: px(mediana ? 58 : 46), fontWeight: 900, color: c.media }}>{valor ?? '—'}</span>
            <span style={{ fontSize: px(mediana ? 18 : 14), fontWeight: 900, letterSpacing: '0.14em', marginLeft: px(8), color: c.suave }}>
              {mediana && fam.etiquetaCorta ? fam.etiquetaCorta : fam.etiqueta(valor, e)}
            </span>
          </div>

          {/* el resto, de los mismos datos */}
          {!mediana && <div style={{ position: 'absolute', left: px(L.margen), right: px(L.margen), top: px(L.secundarios),
                        display: 'flex', justifyContent: 'space-between' }}>
            {fam.secundarios(carta).map(([k, v]) => (
              <div key={k} style={{ flex: 1, textAlign: 'center', lineHeight: 1 }}>
                <div style={{ fontSize: px(19), fontWeight: 900 }}>{v}</div>
                <div style={{ fontSize: px(9.5), fontWeight: 800, letterSpacing: '0.16em', color: c.suave, marginTop: px(4) }}>{k}</div>
              </div>
            ))}
          </div>}

          {/* el período */}
          {carta.pie && !mediana && (
            <div style={{ position: 'absolute', left: px(L.margenPie), right: px(L.margenPie), top: px(L.pie), textAlign: 'center', fontSize: px(10.5),
                          fontWeight: 800, letterSpacing: '0.16em', color: c.suave, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {carta.pie}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const escalarRadio = (radio, u) => radio.split(' ').map((r) => `${Math.round(parseFloat(r) * u * 100) / 100}px`).join(' ');

/* ── texturas (detrás de la foto) ── */
function Textura({ fam, g }) {
  const c = fam.colores;
  switch (fam.textura) {
    case 'vetas': // goleadores: tajos rojos en diagonal
      return (
        <g>
          {[[-40, 0.5], [40, 0.3], [130, 0.22], [210, 0.14]].map(([x, o], i) => (
            <polygon key={i} points={`${x},480 ${x + 46},480 ${x + 236},0 ${x + 190},0`} fill={c.detalle} fillOpacity={o * 0.55} />
          ))}
          <polygon points="0,330 320,250 320,262 0,342" fill={c.detalle} fillOpacity="0.35" />
        </g>
      );
    case 'rayos': // goleador del mes: abanico de rayos desde atrás de la foto
      return (
        <g transform="translate(160,170)">
          {Array.from({ length: 18 }, (_, i) => (
            <polygon key={i} points="0,0 -9,-340 9,-340" fill={c.detalle} fillOpacity={i % 2 ? 0.1 : 0.2} transform={`rotate(${i * 20})`} />
          ))}
        </g>
      );
    case 'circuito': // asistidores: trazas de circuito en los costados
      return (
        <g stroke={c.detalle} strokeOpacity="0.35" strokeWidth="2" fill="none">
          <path d="M14,90 L14,160 L34,180 L34,300 L14,320 L14,420" />
          <path d="M306,90 L306,160 L286,180 L286,300 L306,320 L306,420" />
          {[[14, 90], [34, 240], [14, 420], [306, 90], [286, 240], [306, 420]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill={c.detalle} fillOpacity="0.6" stroke="none" />
          ))}
        </g>
      );
    case 'acero': // presencia: acero cepillado
      return <rect width={W} height={H} fill={`url(#${g('cepillado')})`} />;
    case 'filigrana': // MVP: rayos dorados finos detrás de la corona
      return (
        <g transform="translate(160,60)">
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} x1="0" y1="0" x2="0" y2="-420" stroke={c.detalle} strokeOpacity="0.12" strokeWidth="2" transform={`rotate(${i * 15})`} />
          ))}
        </g>
      );
    case 'malla': // recuperadores: malla hexagonal
      return <rect width={W} height={H} fill={`url(#${g('hex')})`} />;
    default:
      return null;
  }
}

/* ── adornos del marco (delante de la foto) ── */
function Adorno({ fam }) {
  const c = fam.colores;
  switch (fam.adorno) {
    case 'pase': // la trayectoria de un pase, de un costado al otro
      return (
        <g fill="none" stroke={c.detalle} strokeWidth="3" strokeLinecap="round">
          <path d="M36,262 C110,180 210,180 276,232" strokeDasharray="2 9" strokeOpacity="0.9" />
          <path d="M266,222 L278,234 L262,240" strokeOpacity="0.9" />
          <circle cx="36" cy="262" r="5" fill={c.detalle} />
        </g>
      );
    case 'remaches': // presencia: remaches de acero en el marco
      return (
        <g fill={c.filo}>
          {[[62, 14], [258, 14], [14, 62], [306, 62], [14, 418], [306, 418], [62, 466], [258, 466]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.2" stroke="#000" strokeOpacity="0.4" />
          ))}
        </g>
      );
    case 'laureles': // MVP: ramas de laurel abajo
      return (
        <g fill={c.detalle} fillOpacity="0.9">
          {[-1, 1].map((s) => (
            <g key={s} transform={`translate(160,447) scale(${s},1)`}>
              {Array.from({ length: 5 }, (_, i) => (
                <ellipse key={i} cx={-62 - i * 15} cy={-i * 5} rx="8" ry="3.4" transform={`rotate(${-20 - i * 5} ${-62 - i * 15} ${-i * 5})`} />
              ))}
            </g>
          ))}
        </g>
      );
    case 'llama': // goleador del mes: base encendida
      return <path d="M30,452 Q160,410 290,452" fill="none" stroke={c.detalle} strokeWidth="3" strokeOpacity="0.8" />;
    case 'filo': // goleadores: filo dorado en la muesca de arriba
      return <path d="M128,0 L160,24 L192,0" fill="none" stroke={c.filo} strokeWidth="4" />;
    case 'bisel': // recuperadores: bisel plateado bajo el borde de arriba
      return <path d="M24,24 L296,24" stroke={c.filo} strokeOpacity="0.55" strokeWidth="2" />;
    default:
      return null;
  }
}

/* ── insignias (centradas en 0,0, ~56 px) ── */
function Insignia({ fam, g }) {
  const c = fam.colores;
  const fondo = <circle r="27" fill={c.insigniaFondo} stroke={`url(#${g('metal')})`} strokeWidth="4" />;
  switch (fam.insignia) {
    case 'balon':
      return (
        <g>
          <polygon points="0,-31 27,-15.5 27,15.5 0,31 -27,15.5 -27,-15.5" fill={c.insigniaFondo} stroke={`url(#${g('metal')})`} strokeWidth="4" />
          <circle r="15" fill="#fff" />
          <polygon points="0,-6 5.7,-1.9 3.5,4.9 -3.5,4.9 -5.7,-1.9" fill="#111" />
          {[0, 72, 144, 216, 288].map((a) => <line key={a} x1="0" y1="-6" x2="0" y2="-15" stroke="#111" strokeWidth="1.6" transform={`rotate(${a})`} />)}
        </g>
      );
    case 'balonMes':
      return (
        <g>
          {fondo}
          <circle r="14" fill="#fff" />
          <polygon points="0,-5.5 5.2,-1.7 3.2,4.5 -3.2,4.5 -5.2,-1.7" fill="#111" />
          <path d="M-20,20 L20,20" stroke={c.detalle} strokeWidth="5" />
        </g>
      );
    case 'pase':
      return (
        <g>
          {fondo}
          <path d="M-11,-12 L1,0 L-11,12 M2,-12 L14,0 L2,12" fill="none" stroke={c.detalle} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'presente':
      return (
        <g>
          <polygon points="-11,-27 11,-27 27,-11 27,11 11,27 -11,27 -27,11 -27,-11" fill={c.insigniaFondo} stroke={`url(#${g('metal')})`} strokeWidth="4" />
          <path d="M-12,0 L-3,10 L13,-9" fill="none" stroke={c.detalle} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'corona':
      return (
        <g>
          {fondo}
          <path d="M-16,9 L-18,-10 L-8,-1 L0,-14 L8,-1 L18,-10 L16,9 Z" fill={c.detalle} />
          <rect x="-16" y="11" width="32" height="5" fill={c.detalle} />
        </g>
      );
    case 'escudo':
      return (
        <g>
          <path d="M-24,-26 L24,-26 L24,2 C24,16 12,25 0,30 C-12,25 -24,16 -24,2 Z" fill={c.insigniaFondo} stroke={`url(#${g('metal')})`} strokeWidth="4" />
          <path d="M-12,-6 L10,-6 M2,-14 L10,-6 L2,2" fill="none" stroke={c.detalle} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M-12,8 L12,8" stroke={c.detalle} strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    default:
      return fondo;
  }
}

/* ── el distintivo de puesto de las series (1 a 10) ── */
function Medalla({ fam, g, puesto, empate }) {
  const c = fam.colores;
  return (
    <g transform="translate(62,246)">
      <polygon points="0,-34 30,-17 30,17 0,34 -30,17 -30,-17" fill={c.medallaFondo} stroke={`url(#${g('metal')})`} strokeWidth="5" />
      <text x="0" y={empate ? 6 : 12} textAnchor="middle" fontFamily={FUENTE} fontWeight="900" fontSize={puesto >= 10 ? 28 : 34} fill={c.medallaTexto}>{puesto}</text>
      {empate && <text x="0" y="24" textAnchor="middle" fontFamily={FUENTE} fontWeight="900" fontSize="9" letterSpacing="1.5" fill={c.medallaTexto}>EMP.</text>}
    </g>
  );
}
