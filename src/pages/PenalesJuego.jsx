import React, { useRef, useState } from 'react';
import Penales from '../components/vdraft/Penales';
import { NIVELES, tandaNueva, tiroDePractica } from '../analytics/penales';
import './vdraft.css';

/* PENALES: el modo de juego suelto, una tanda contra la CPU.
 *
 * Es la misma tanda (y la misma escena) que el desempate del V-Draft, pero de
 * práctica: se juega entera en el navegador y no da V-Coins. Se elige el nivel
 * (la dificultad de las rondas del V-Draft) y quién patea primero. Las tandas
 * ganadas quedan en este dispositivo.
 */

const CLAVE = 'penales_record';
const leerRecord = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
};
const guardarRecord = (r) => { try { localStorage.setItem(CLAVE, JSON.stringify(r)); } catch { /* sin storage */ } };

export default function PenalesJuego() {
  const [nivel, setNivel] = useState(0);
  const [primero, setPrimero] = useState('propio');
  const [jugando, setJugando] = useState(null);     // { n, tanda inicial }
  const [final, setFinal] = useState(null);         // { gano, penales }
  const [record, setRecord] = useState(leerRecord);
  const tanda = useRef(null);

  const empezar = () => {
    const quien = primero === 'sorteo' ? (Math.random() < 0.5 ? 'propio' : 'rival') : primero;
    const t = tandaNueva(nivel, quien);
    tanda.current = t;
    setFinal(null);
    setJugando({ n: (jugando?.n || 0) + 1, tanda: t });
  };

  const patear = async (eleccion) => {
    const d = tiroDePractica(tanda.current, eleccion);
    if (d.tanda) tanda.current = d.tanda;
    return { data: d };
  };

  const alDefinir = (d) => {
    const r = { ...record };
    const k = String(nivel);
    const prev = r[k] || { jugadas: 0, ganadas: 0, racha: 0, mejorRacha: 0 };
    const gano = !!d.ultimo?.gano;
    const racha = gano ? prev.racha + 1 : 0;
    r[k] = { jugadas: prev.jugadas + 1, ganadas: prev.ganadas + (gano ? 1 : 0), racha, mejorRacha: Math.max(prev.mejorRacha, racha) };
    guardarRecord(r);
    setRecord(r);
    setFinal({ gano, penales: d.ultimo?.penales });
  };

  const rec = record[String(nivel)];

  return (
    <div className="vd-pagina" style={{ padding: '16px', maxWidth: jugando && !final ? '1040px' : '560px', margin: '0 auto', boxSizing: 'border-box', paddingBottom: '80px', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px' }}>JUEGOS</div>
      <h1 style={{ margin: '4px 0 14px', fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>Penales</h1>

      {(!jugando || final) && (
        <div style={panel}>
          {final && (
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: final.gano ? '#00ff88' : '#ef4444' }}>
                {final.gano ? '¡GANASTE LA TANDA!' : 'PERDISTE LA TANDA'}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>{final.penales}</div>
            </div>
          )}

          <div style={rotulo}>NIVEL</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {NIVELES.map((n) => (
              <button key={n.id} onClick={() => setNivel(n.id)} style={opcion(nivel === n.id)}>
                <b style={{ display: 'block', fontSize: '0.8rem' }}>{n.nombre}</b>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>{n.detalle}</span>
              </button>
            ))}
          </div>

          <div style={{ ...rotulo, marginTop: 14 }}>EMPIEZA</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[['propio', 'PATEO YO'], ['rival', 'ATAJO YO'], ['sorteo', 'SORTEO']].map(([id, txt]) => (
              <button key={id} onClick={() => setPrimero(id)} style={opcion(primero === id)}><b style={{ fontSize: '0.75rem' }}>{txt}</b></button>
            ))}
          </div>

          <button onClick={empezar} style={botonJugar}>{final ? 'JUGAR OTRA TANDA' : 'EMPEZAR LA TANDA'}</button>

          <div style={{ marginTop: 12, fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center' }}>
            {rec ? `En ${NIVELES[nivel].nombre}: ${rec.ganadas} ganadas de ${rec.jugadas} · racha ${rec.racha} · mejor racha ${rec.mejorRacha}` : 'Modo práctica: no da V-Coins.'}
          </div>
        </div>
      )}

      {jugando && !final && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Penales key={jugando.n} partida={{ id: null, tanda: jugando.tanda }} rival={`Arquero · ${NIVELES[nivel].nombre}`}
          nombre="VOS" patear={patear} alDefinir={alDefinir} />
        </div>
      )}
    </div>
  );
}

const panel = { padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--panel)' };
const rotulo = { fontSize: '0.62rem', fontWeight: 900, letterSpacing: '1px', color: 'var(--text-dim)', marginBottom: 6 };
const opcion = (activo) => ({
  padding: '10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
  border: `1px solid ${activo ? '#f97316' : 'var(--border)'}`, background: activo ? 'rgba(249,115,22,.12)' : 'transparent',
});
const botonJugar = { width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none', background: '#f97316', color: '#160800', fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer', letterSpacing: '.04em' };
