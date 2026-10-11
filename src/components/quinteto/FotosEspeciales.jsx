import React, { useMemo, useState } from 'react';
import CartaGiratoria from './CartaGiratoria';
import { TIPOS } from '../../analytics/premios';
import { subirFotoEspecial, quitarFotoEspecial } from '../../utils/cartasFotos';

/* FOTOS ESPECIALES
 *
 * Cada carta de premio (TOTW, POTW, TOTM, POTM, TOTY) puede llevar una foto propia en
 * vez de la del plantel. Se sube acá, antes o después de publicar las cartas para los
 * sobres: no hace falta republicar. Una carta con foto especial se marca con ★.
 */

const POR_PAGINA = 24;

export default function FotosEspeciales({ premios = [], fotos = new Map(), clubId, alCambiar, esMovil }) {
  const conteo = useMemo(() => Object.fromEntries(TIPOS.map((t) => [t, premios.filter((c) => c.premio === t).length])), [premios]);
  const [tipo, setTipo] = useState(() => TIPOS.find((t) => conteo[t] > 0) || TIPOS[0]);
  const [jugador, setJugador] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ocupada, setOcupada] = useState(null);
  const [aviso, setAviso] = useState(null);

  const lista = useMemo(() => premios
    .filter((c) => c.premio === tipo && (!jugador || `${c.apellido} ${c.nombre}`.toLowerCase().includes(jugador.toLowerCase())))
    .sort((a, b) => String(b.fechaRef).localeCompare(String(a.fechaRef)) || b.ovr - a.ovr), [premios, tipo, jugador]);

  const subir = async (carta, archivo) => {
    if (!archivo) return;
    setOcupada(carta.clave); setAviso(null);
    try {
      await subirFotoEspecial({ clubId, clave: carta.clave, archivo });
      await alCambiar?.();
      setAviso({ texto: `Foto guardada para ${carta.apellido}.` });
    } catch (err) {
      console.error('Foto especial:', err);
      setAviso({ texto: err?.message || 'No se pudo subir la foto.', error: true });
    } finally {
      setOcupada(null);
    }
  };

  const quitar = async (carta) => {
    setOcupada(carta.clave); setAviso(null);
    try {
      await quitarFotoEspecial({ clubId, clave: carta.clave });
      await alCambiar?.();
    } catch (err) {
      setAviso({ texto: err?.message || 'No se pudo quitar la foto.', error: true });
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="bento-card" style={{ padding: 14, fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        Poné una <b style={{ color: 'var(--text)' }}>foto especial</b> a las cartas de premio, como en las ediciones limitadas del FIFA.
        Va mejor una foto <b style={{ color: 'var(--text)' }}>PNG recortada (sin fondo)</b>, de frente y con la cara en la parte de arriba.
        Se ve en el frente de la carta y entera al darla vuelta. No hace falta volver a publicar las cartas.
      </div>

      {aviso && (
        <div style={{ fontSize: '0.8rem', fontWeight: 700, padding: '10px 14px', borderRadius: 8,
          color: aviso.error ? '#ef4444' : 'var(--accent)', background: aviso.error ? 'rgba(239,68,68,.08)' : 'rgba(0,255,136,.08)',
          border: `1px solid ${aviso.error ? 'rgba(239,68,68,.3)' : 'rgba(0,255,136,.3)'}` }}>{aviso.texto}</div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {TIPOS.map((t) => (
          <button key={t} onClick={() => { setTipo(t); setLimite(POR_PAGINA); }} style={chip(tipo === t)}>{t} {conteo[t] || 0}</button>
        ))}
        <input value={jugador} onChange={(e) => { setJugador(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar jugador" aria-label="Buscar jugador"
          style={{ marginLeft: esMovil ? 0 : 'auto', padding: '6px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, width: esMovil ? '100%' : 180 }} />
      </div>

      {lista.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          No hay cartas {tipo} para estos filtros.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 18 }}>
          {lista.slice(0, limite).map((c) => {
            const especial = fotos.has(c.clave);
            return (
              <div key={c.clave} className="bento-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ paddingBottom: 26 }}><CartaGiratoria carta={c} etiqueta={c.premio} /></div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', minHeight: '2.6em' }}>{c.descripcion}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <label style={{ ...btn, opacity: ocupada === c.clave ? 0.5 : 1 }}>
                    {ocupada === c.clave ? 'SUBIENDO…' : especial ? '★ CAMBIAR FOTO' : 'SUBIR FOTO'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={ocupada === c.clave} style={{ display: 'none' }}
                      onChange={(e) => { subir(c, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {especial && <button onClick={() => quitar(c)} disabled={ocupada === c.clave} style={{ ...btn, background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>QUITAR</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {lista.length > limite && (
        <button onClick={() => setLimite((l) => l + POR_PAGINA)} style={{ ...btn, alignSelf: 'center', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
          VER MÁS ({lista.length - limite})
        </button>
      )}
    </div>
  );
}

const chip = (activo) => ({
  padding: '5px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`, color: activo ? 'var(--accent)' : 'var(--text-dim)',
  background: activo ? 'rgba(0,255,136,.08)' : 'transparent',
});
const btn = { padding: '8px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 900, fontSize: '0.72rem', cursor: 'pointer', display: 'inline-block' };
