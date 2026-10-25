import React, { useMemo, useState } from 'react';
import CartaJugador from '../quinteto/CartaJugador';
import { PREMIOS } from '../../analytics/premiosCartas';
import { RAREZAS } from '../../analytics/sobres';
import { aplicarAjuste } from '../../analytics/god';

/* MODO GOD · ELEGIR CARTAS DEL CATÁLOGO
 *
 * Las cartas activas, filtrables por tipo y por jugador; se tocan para
 * sumarlas o sacarlas. Lo usan el editor de eventos y el de sobres.
 * `elegidas`: claves; `cambiar(claves)`.
 */
export default function SelectorCartas({ catalogo = [], ajustes = new Map(), elegidas = [], cambiar }) {
  const [tipo, setTipo] = useState('TODAS');
  const [buscar, setBuscar] = useState('');
  const [rareza, setRareza] = useState('TODAS');
  const set = useMemo(() => new Set(elegidas), [elegidas]);
  const activas = useMemo(() => catalogo.filter((k) => k.activa !== false), [catalogo]);
  const tipos = useMemo(() => ['TODAS', ...new Set(activas.map((k) => k.tipo))], [activas]);
  const candidatas = useMemo(() => activas.filter((k) => (tipo === 'TODAS' || k.tipo === tipo) && (rareza === 'TODAS' || k.rareza === rareza)
    && (!buscar || `${k.carta?.apellido} ${k.carta?.nombre}`.toLowerCase().includes(buscar.toLowerCase()))), [activas, tipo, rareza, buscar]);

  const alternar = (clave) => cambiar(set.has(clave) ? elegidas.filter((c) => c !== clave) : [...elegidas, clave]);

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={campo}>{tipos.map((t) => <option key={t} value={t}>{PREMIOS[t]?.sigla || t}</option>)}</select>
        <select value={rareza} onChange={(e) => setRareza(e.target.value)} style={campo} aria-label="Rareza">
          <option value="TODAS">TODAS LAS RAREZAS</option>
          {RAREZAS.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar jugador" style={{ ...campo, width: 160 }} />
        <button style={chip} onClick={() => cambiar([...new Set([...elegidas, ...candidatas.map((k) => k.clave)])])}>AGREGAR LAS {candidatas.length} FILTRADAS</button>
        <button style={chip} onClick={() => cambiar(elegidas.filter((cl) => !candidatas.some((k) => k.clave === cl)))}>QUITAR LAS FILTRADAS</button>
      </div>
      <div className="custom-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
        {candidatas.slice(0, 60).map((k) => (
          <div key={k.clave} style={{ position: 'relative', opacity: set.has(k.clave) ? 1 : 0.45, flex: '0 0 auto' }}>
            <CartaJugador carta={aplicarAjuste({ atributos: [], stats: {}, ...(k.carta || {}) }, ajustes.get(k.clave))} chica onClick={() => alternar(k.clave)} />
            {set.has(k.clave) && <span style={{ position: 'absolute', top: -6, right: -4, background: '#00ff88', color: '#04120c', borderRadius: 10, fontSize: 10, fontWeight: 900, padding: '1px 5px' }}>✓</span>}
          </div>
        ))}
        {candidatas.length > 60 && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>…y {candidatas.length - 60} más (filtrá para verlas)</span>}
      </div>
    </>
  );
}

const chip = {
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent',
};
const campo = { width: 'auto', flex: '0 0 auto', padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
