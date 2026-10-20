import React, { useMemo, useState } from 'react';
import CartaGiratoria from '../quinteto/CartaGiratoria';
import { rarezaPorId, MONEDA } from '../../analytics/sobres';
import { azarFijo } from '../../analytics/aperturas';
import { sonar } from '../../utils/sonidoApertura';

/* LAS CARTAS DEL SOBRE (la mecánica de siempre)
 *
 * Las cartas que devolvió la base, boca abajo. Se dan vuelta de a una con un
 * toque (o todas juntas) y después se pueden girar para ver la foto. Si vino
 * algo muy raro, caen papelitos dorados.
 */

const MUY_RARAS = new Set(['oro', 'totw', 'potw', 'totm', 'potm', 'toty']);
const ESPECIALES = new Set(['totw', 'potw', 'totm', 'potm', 'toty']);
const COLORES_COMUN = ['#00ff88', '#ffffff', '#38bdf8', '#a7f3d0'];
const COLORES_RARA = ['#fbbf24', '#fde68a', '#f59e0b', '#ffffff', '#c084fc', '#38bdf8'];

/* Una carta del catálogo en el formato que dibuja CartaJugador. */
const aCarta = (c) => ({ atributos: [], stats: {}, ...(c.carta || c) });

function Papelitos({ rara, semilla }) {
  const papeles = useMemo(() => {
    const colores = rara ? COLORES_RARA : COLORES_COMUN;
    return Array.from({ length: rara ? 90 : 55 }, (_, i) => {
      const r = (k) => azarFijo(semilla * 31 + i * 7 + k);
      return {
        i, left: r(0) * 100, delay: r(1) * 1.2, dur: 2.4 + r(2) * 2,
        dx: (r(3) - 0.5) * 160, giro: 360 + r(4) * 720, color: colores[i % colores.length], ancho: 6 + r(5) * 6,
      };
    });
  }, [rara, semilla]);
  return papeles.map((p) => (
    <i key={p.i} className="ap-papel" style={{
      left: `${p.left}%`, background: p.color, width: p.ancho, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
      '--dx': `${p.dx}px`, '--giro': `${p.giro}deg`,
    }} />
  ));
}

/* `yaDada`: la carta que ya se mostró sola antes (la mejor del sobre), que
   aparece dada vuelta. */
export default function RevelacionCartas({ resultado, variante, onCerrar, yaDada = -1 }) {
  const cartas = resultado.cartas || [];
  const rara = cartas.some((c) => MUY_RARAS.has(c.rareza));
  const [dadas, setDadas] = useState(() => (yaDada >= 0 ? { [yaDada]: true } : {}));
  const todas = cartas.length > 0 && cartas.every((_, i) => dadas[i]);
  const semilla = cartas.length * 3 + (resultado.puntos_ganados || 0);

  const dar = (i) => {
    sonar(ESPECIALES.has(cartas[i]?.rareza) ? 'cartaRara' : 'carta');
    setDadas((d) => ({ ...d, [i]: true }));
  };
  const darTodas = () => {
    sonar(cartas.some((c) => ESPECIALES.has(c.rareza)) ? 'cartaRara' : 'carta');
    setDadas(Object.fromEntries(cartas.map((_, i) => [i, true])));
  };

  return (
    <div className="ap-cartas">
      {!variante.sinMovimiento && <Papelitos rara={rara} semilla={semilla} />}
      <div className="ap-cartas-titulo">{variante.nombre}</div>
      <div className="ap-cartas-ayuda">{todas ? 'Listo.' : 'Tocá cada carta para darla vuelta. Después, tocala para ver la foto.'}</div>
      <div className="ap-cartas-fila">
        {cartas.map((c, i) => (
          <div key={c.catalogo_id || i} className="ap-entra" style={{ animationDelay: `${i * 0.1}s` }}>
            {dadas[i] ? (
              <>
                <div className={`ap-gira${MUY_RARAS.has(c.rareza) ? ' ap-rara-carta' : ''}`}>
                  <CartaGiratoria carta={aCarta(c)} etiqueta={rarezaPorId[c.rareza]?.nombre} />
                </div>
                <div className="ap-estado" style={{ color: c.nueva ? '#00ff88' : '#fbbf24' }}>
                  {c.nueva ? 'NUEVA' : <>REPETIDA<br /><span style={{ whiteSpace: 'nowrap' }}>+{c.puntos} {MONEDA.toUpperCase()}</span></>}
                </div>
              </>
            ) : (
              <button className="ap-reverso" onClick={() => dar(i)} aria-label={`Dar vuelta la carta ${i + 1}`}>
                <span>?</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {todas && resultado.puntos_ganados > 0 && (
        <div style={{ color: '#fbbf24', fontWeight: 900, marginBottom: 14 }}>+{resultado.puntos_ganados} {MONEDA} por repetidas</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        {!todas && <button onClick={darTodas} className="ap-btn ap-btn-sec">DAR VUELTA TODAS</button>}
        {todas && <button onClick={onCerrar} className="ap-btn" autoFocus>LISTO</button>}
      </div>
    </div>
  );
}
