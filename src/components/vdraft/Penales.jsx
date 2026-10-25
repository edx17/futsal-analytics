import React, { useState } from 'react';
import { LADOS, marcadorDeTiros } from '../../analytics/penales';
import { patearPenal } from '../../utils/vdraft';

/* LA TANDA DE PENALES DEL V-DRAFT
 *
 * Cuando el partido termina empatado, la tanda se juega tiro por tiro:
 *   · te toca patear: tocás uno de los 9 cuadrantes del arco;
 *   · te toca atajar: tocás izquierda, centro o derecha.
 * La base decide qué hace la CPU (vdraft_penal) y devuelve el tiro; acá sólo
 * se muestra: la pelota va al cuadrante, el arquero se tira, y el cartel.
 * `partida`: la vista con `tanda`. `alDefinir(partida)`: cuando se terminó.
 */

/* El arco de futsal: 3 × 2 m. La grilla de 3 × 3 cubre el interior. */
const AW = 300;
const AH = 200;
const centro = (celda) => ({ x: ((celda % 3) + 0.5) * (AW / 3), y: (Math.floor(celda / 3) + 0.5) * (AH / 3) });
const CARTEL = {
  propio: { gol: '¡GOOOL!', atajada: 'TE LA ATAJÓ', palo: '¡AL PALO!' },
  rival: { gol: 'GOL DEL RIVAL', atajada: '¡LA ATAJASTE!', afuera: '¡AFUERA!' },
};

export default function Penales({ partida, rival, alDefinir }) {
  const [tanda, setTanda] = useState(partida.tanda);
  const [tiro, setTiro] = useState(null);       // el último, mientras se anima
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [definida, setDefinida] = useState(null); // la partida, cuando terminó la tanda

  const turno = tanda?.turno;
  const tiros = tanda?.tiros || [];
  const puedo = !ocupado && !tiro && !definida && tanda;

  const elegir = async (eleccion) => {
    if (!puedo) return;
    setOcupado(true); setError(null);
    const r = await patearPenal(partida.id, eleccion);
    setOcupado(false);
    if (r.error || r.vencida) { setError(r.error?.message || 'Tu sesión venció.'); return; }
    const d = r.data;
    setTiro({ ...d.tiro, equipo: d.tiro.equipo });
    // El marcador de la tanda incluye el tiro recién hecho (aunque ya se haya definido).
    setTanda((t) => ({ ...(d.tanda || t), tiros: [...(t?.tiros || []), d.tiro], propio: d.marcador.propio, rival: d.marcador.rival,
      turno: d.tanda?.turno ?? t?.turno }));
    setTimeout(() => {
      setTiro(null);
      if (d.definida) { setDefinida(d); setTimeout(() => alDefinir(d), 1300); }
    }, 1500);
  };

  const pasoTexto = definida
    ? (definida.ultimo?.gano ? `¡GANASTE LA TANDA ${definida.ultimo.penales}!` : `PERDISTE LA TANDA ${definida.ultimo?.penales || ''}`)
    : tiro ? CARTEL[tiro.equipo][tiro.motivo]
      : turno === 'propio' ? 'TE TOCA PATEAR · elegí dónde' : 'ATAJÁS VOS · elegí un lado';

  const pelota = tiro ? centro(tiro.celda) : null;
  // El arquero: en tu tiro, la CPU (a su cuadrante); en el del rival, vos (a tu lado).
  const arquero = tiro ? (tiro.equipo === 'propio' ? centro(tiro.arquero) : { x: (tiro.lado + 0.5) * (AW / 3), y: AH * 0.62 }) : { x: AW / 2, y: AH * 0.62 };
  // Se tira: cuanto más al costado, más se inclina.
  const inclinacion = ((arquero.x - AW / 2) / (AW / 3)) * 38;

  return (
    <div className="vd-penales-caja">
      <div className="vd-penales-titulo">PENALES</div>
      <div className="vd-penales-marcador">
        <Fila nombre="MI EQUIPO" goles={tanda?.propio ?? 0} puntos={marcadorDeTiros(tiros, 'propio')} />
        <Fila nombre={String(rival || 'RIVAL').toUpperCase()} goles={tanda?.rival ?? 0} puntos={marcadorDeTiros(tiros, 'rival')} />
      </div>

      <div className={`vd-penales-paso${tiro ? ` vd-penales-${tiro.gol === (tiro.equipo === 'propio') ? 'bien' : 'mal'}` : ''}`}>{pasoTexto}</div>

      <div className="vd-arco" style={{ aspectRatio: `${AW + 24} / ${AH + 14}` }}>
        <svg viewBox={`-12 -12 ${AW + 24} ${AH + 14}`} className="vd-arco-svg" aria-hidden="true">
          <defs>
            <pattern id="vd-red" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M0,0 L12,12 M12,0 L0,12" stroke="#fff" strokeOpacity="0.22" strokeWidth="1" />
            </pattern>
            <pattern id="vd-palo" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
              <rect width="24" height="12" fill="#ffffff" /><rect y="12" width="24" height="12" fill="#dc2626" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={AW} height={AH} fill="#0b1a2e" />
          <rect x="0" y="0" width={AW} height={AH} fill="url(#vd-red)" />
          {/* la grilla, apenas marcada */}
          {[1, 2].map((i) => <line key={`v${i}`} x1={(AW / 3) * i} y1="0" x2={(AW / 3) * i} y2={AH} stroke="#fff" strokeOpacity="0.12" strokeDasharray="4 6" />)}
          {[1, 2].map((i) => <line key={`h${i}`} x1="0" y1={(AH / 3) * i} x2={AW} y2={(AH / 3) * i} stroke="#fff" strokeOpacity="0.12" strokeDasharray="4 6" />)}
          {/* palos y travesaño (blancos y rojos, como en futsal) */}
          <rect x="-10" y="-10" width="10" height={AH + 10} fill="url(#vd-palo)" />
          <rect x={AW} y="-10" width="10" height={AH + 10} fill="url(#vd-palo)" />
          <rect x="-10" y="-10" width={AW + 20} height="10" fill="#ffffff" />
          {/* el arquero */}
          <g className="vd-arquero" style={{ transform: `translate(${arquero.x}px, ${arquero.y}px) rotate(${inclinacion}deg)` }}>
            {/* brazos abiertos con guantes, buzo naranja, cabeza */}
            <path d="M-16,-18 L-42,-34 M16,-18 L42,-34" stroke="#f97316" strokeWidth="9" strokeLinecap="round" />
            <circle cx="-44" cy="-36" r="7" fill="#fef3c7" stroke="#111" strokeWidth="1.5" />
            <circle cx="44" cy="-36" r="7" fill="#fef3c7" stroke="#111" strokeWidth="1.5" />
            <rect x="-18" y="-26" width="36" height="44" rx="10" fill="#f97316" />
            <text x="0" y="4" textAnchor="middle" fontSize="16" fontWeight="900" fill="#1a1205">1</text>
            <path d="M-12,18 L-16,44 M12,18 L16,44" stroke="#111827" strokeWidth="10" strokeLinecap="round" />
            <circle cy="-38" r="11" fill="#d6a77a" />
          </g>
          {/* la pelota */}
          {pelota && (
            <g className="vd-pelota-penal" style={{ transform: `translate(${pelota.x}px, ${pelota.y}px)` }}>
              <circle r="11" fill="#fff" stroke="#111" strokeWidth="1.5" />
              <circle r="4" fill="#111" />
            </g>
          )}
        </svg>

        {/* lo que se toca: 9 cuadrantes para patear, 3 franjas para atajar */}
        {puedo && turno === 'propio' && (
          <div className="vd-arco-grilla">
            {Array.from({ length: 9 }, (_, i) => (
              <button key={i} className="vd-arco-celda" onClick={() => elegir(i)} aria-label={`Patear al cuadrante ${i + 1}`} />
            ))}
          </div>
        )}
        {puedo && turno === 'rival' && (
          <div className="vd-arco-lados">
            {LADOS.map((l, i) => (
              <button key={l} className="vd-arco-lado" onClick={() => elegir(i)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {ocupado && <div className="vd-penales-nota">…</div>}
      {error && <div className="vd-error" style={{ marginTop: 10 }}>{error}</div>}
      {!definida && !error && (
        <div className="vd-penales-nota">
          {turno === 'propio' ? 'Los ángulos son más difíciles de atajar, pero pueden ir al palo.' : 'Si adivinás el lado, tenés buenas chances de atajarla.'}
        </div>
      )}
    </div>
  );
}

function Fila({ nombre, goles, puntos }) {
  return (
    <div className="vd-penales-fila">
      <span className="vd-penales-nombre">{nombre}</span>
      <span className="vd-penales-puntos">
        {puntos.map((p, i) => <i key={i} className={p === null ? '' : p ? 'vd-p-gol' : 'vd-p-errado'} />)}
      </span>
      <b>{goles}</b>
    </div>
  );
}
