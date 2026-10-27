import React, { useMemo, useState } from 'react';
import CartaEspecial from '../quinteto/CartaEspecial';
import { aplicarAjuste } from '../../analytics/god';
import { jugadoresParaHalloween, filaHalloween, TIPO } from '../../analytics/halloween';
import { publicarCatalogo } from '../../utils/sobres';
import { activarCartas } from '../../utils/god';
import { subirFotoEspecial, quitarFotoEspecial } from '../../utils/cartasFotos';

/* MODO GOD · HALLOWEEN
 *
 * Las cartas de noche de brujas: el superusuario elige los jugadores, ve la
 * carta antes de crearla y puede corregir la media. Cada una sale de lo que el
 * jugador ya tiene en el catálogo (nombre, puesto, foto, atributos) y queda
 * exclusiva del sobre del evento: la plantilla "+ NOCHE DE HALLOWEEN" de
 * EVENTOS las toma todas. La foto se puede cambiar después, como cualquier carta.
 */

const ANIO = new Date().getFullYear();

export default function GodHalloween({ clubId, catalogo, ajustes, fotos, recargar, avisar }) {
  const [busca, setBusca] = useState('');
  const [elegidos, setElegidos] = useState({});        // jugador_id → media
  const [ver, setVer] = useState(null);                // el jugador de la vista previa
  const [ocupado, setOcupado] = useState(null);
  const jugadores = useMemo(() => jugadoresParaHalloween(catalogo || [], fotos, ANIO), [catalogo, fotos]);
  const creadas = useMemo(() => (catalogo || []).filter((k) => k.tipo === TIPO), [catalogo]);

  const hacer = async (id, fn, ok) => {
    setOcupado(id); avisar(null);
    try { await fn(); await recargar(); if (ok) avisar({ texto: ok }); return true; } catch (err) {
      const msg = /cartas_catalogo_tipo_check|23514/.test(`${err?.message} ${err?.code}`)
        ? 'Falta la migración 20261104120000_cartas_halloween.sql en Supabase (para guardar cartas de Halloween).' : err?.message || 'No se pudo.';
      avisar({ texto: msg, error: true });
      return false;
    } finally { setOcupado(null); }
  };

  if (catalogo === null) return <div style={dim}>Leyendo el catálogo…</div>;

  const q = busca.trim().toLowerCase();
  const lista = jugadores.filter((j) => !q || `${j.apellido} ${j.nombre}`.toLowerCase().includes(q));
  const ids = Object.keys(elegidos);
  const previa = jugadores.find((j) => j.jugador_id === (ver || ids[ids.length - 1])) || null;
  const alternar = (j) => {
    setVer(j.jugador_id);
    setElegidos((e) => {
      const n = { ...e };
      if (j.jugador_id in n) delete n[j.jugador_id]; else n[j.jugador_id] = j.ovr;
      return n;
    });
  };
  const crear = async () => {
    const filas = jugadores.filter((j) => j.jugador_id in elegidos).map((j) => filaHalloween(j, { anio: ANIO, ovr: elegidos[j.jugador_id] }));
    if (await hacer('crear', () => publicarCatalogo(clubId, filas), `Se crearon ${filas.length} cartas de Halloween (exclusivas del evento).`)) {
      setElegidos({}); setVer(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={dim}>
        Elegí los jugadores que reciben su carta de Halloween {ANIO}. Sale con su nombre, puesto, foto y atributos; la media se puede
        corregir antes de crearla. Quedan <b>exclusivas del evento</b>: para que salgan, armá el evento con la plantilla
        <b> + NOCHE DE HALLOWEEN</b> en EVENTOS (toma todas las cartas de Halloween).
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar jugador…" style={{ ...campo, flex: '1 1 160px' }} />
            <span style={rotulo}>{ids.length} ELEGIDOS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
            {lista.length === 0 && <div style={dim}>No hay jugadores con ese nombre en el catálogo.</div>}
            {lista.map((j) => {
              const elegido = j.jugador_id in elegidos;
              return (
                <div key={j.jugador_id} style={{ ...fila, borderColor: elegido ? '#ff7a00' : 'var(--border)', background: elegido ? 'rgba(255,122,0,.08)' : 'transparent' }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <input type="checkbox" checked={elegido} onChange={() => alternar(j)} style={{ width: 18, height: 18, accentColor: '#ff7a00' }} />
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13 }}>{j.apellido}</b> <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{j.nombre}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)' }}>
                        {j.rol} · media {j.ovr}{!j.foto ? ' · sin foto' : ''}{!j.atributos.length ? ' · sin atributos' : ''}
                      </span>
                    </span>
                  </label>
                  {j.tiene && <span style={{ ...tag, background: '#5b1a8a' }}>YA TIENE · SE ACTUALIZA</span>}
                  {elegido && (
                    <label style={etiqueta}>MEDIA
                      <input type="number" min="1" max="99" value={elegidos[j.jugador_id]} style={{ ...campo, width: 64 }}
                        onFocus={() => setVer(j.jugador_id)}
                        onChange={(e) => setElegidos((x) => ({ ...x, [j.jugador_id]: e.target.value }))} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <button style={{ ...boton, alignSelf: 'flex-start', opacity: ids.length ? 1 : 0.5 }} disabled={!ids.length || !!ocupado} onClick={crear}>
            {ocupado === 'crear' ? 'CREANDO…' : `CREAR ${ids.length || ''} ${ids.length === 1 ? 'CARTA' : 'CARTAS'} DE HALLOWEEN`}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={rotulo}>VISTA PREVIA</span>
          {previa
            ? <CartaEspecial carta={filaHalloween(previa, { anio: ANIO, ovr: elegidos[previa.jugador_id] ?? previa.ovr }).carta} tipo={TIPO} ancho={240} />
            : <div style={{ ...dim, width: 240, textAlign: 'center', padding: '120px 0', border: '1px dashed var(--border)', borderRadius: 12 }}>Elegí un jugador</div>}
        </div>
      </div>

      <div style={rotulo}>CREADAS · {creadas.length}</div>
      {creadas.length === 0 ? <div style={dim}>Todavía no hay cartas de Halloween.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
          {creadas.map((k) => {
            const foto = fotos.get(k.clave);
            const carta = aplicarAjuste({ ...(k.carta || {}), ...(foto ? { foto } : {}) }, ajustes.get(k.clave));
            return (
              <div key={k.clave} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: k.activa === false ? 0.45 : 1 }}>
                <CartaEspecial carta={carta} tipo={TIPO} ancho={176} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {k.activa === false && <span style={{ ...tag, background: '#7f1d1d' }}>DE BAJA</span>}
                  {k.exclusiva_evento && <span style={{ ...tag, background: '#5b1a8a' }}>SÓLO EVENTO</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <label style={{ ...chip, cursor: ocupado ? 'wait' : 'pointer' }}>
                    {foto ? 'CAMBIAR FOTO' : 'OTRA FOTO'}
                    <input type="file" accept="image/*" hidden disabled={!!ocupado} onChange={(e) => {
                      const archivo = e.target.files?.[0]; e.target.value = '';
                      if (archivo) hacer(k.clave, () => subirFotoEspecial({ clubId, clave: k.clave, archivo }), 'Foto guardada.');
                    }} />
                  </label>
                  {foto && <button style={chip} disabled={!!ocupado} onClick={() => hacer(k.clave, () => quitarFotoEspecial({ clubId, clave: k.clave }), 'Vuelve la foto del jugador.')}>QUITAR FOTO</button>}
                  <button style={chip} disabled={!!ocupado} onClick={() => hacer(k.clave, () => activarCartas([k.id], k.activa === false), k.activa === false ? 'Vuelve a estar activa.' : 'Dada de baja (quien la tiene la conserva).')}>
                    {k.activa === false ? 'DAR DE ALTA' : 'DAR DE BAJA'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const boton = { padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none', background: '#ff7a00', color: '#1a0800' };
const chip = {
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent',
};
const tag = { fontSize: 10, fontWeight: 900, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 4, color: '#fff' };
const campo = { padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const etiqueta = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' };
const fila = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
