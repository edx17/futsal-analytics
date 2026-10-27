import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MONEDA } from '../../analytics/sobres';
import { AREAS, TODAS, textoAreas } from '../../analytics/avisosVCoins';
import {
  FILTROS_USUARIOS, FACTORES, filtrarUsuarios, resumenUsuarios, multiplicadorVigente, erroresMultiplicador, estadoMultiplicador,
} from '../../analytics/usuarios';
import {
  listarUsuarios, bloquearUsuario, darVCoins, listarMovimientos, listarMultiplicadores, guardarMultiplicador, activarMultiplicador,
} from '../../utils/usuarios';

/* MODO GOD · USUARIOS
 *
 * Todos los del club (jugadores y staff) con su actividad en el juego:
 * V-Coins, cartas, sobres, partidas de V-Draft y último sobre. Se puede
 * suspender o habilitar a alguien (no abre sobres ni juega al V-Draft), sumar
 * o restar V-Coins a uno, a los elegidos o a todos (regalos), y armar eventos
 * de V-Coins multiplicadas (x2) con fecha. Todo queda registrado.
 */

const MONO = 'JetBrains Mono, monospace';
const fecha = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const ahoraLocal = (h = 0) => { const d = new Date(Date.now() + h * 3600e3); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function GodUsuarios({ clubId, avisar }) {
  const [usuarios, setUsuarios] = useState(null);
  const [movs, setMovs] = useState([]);
  const [multis, setMultis] = useState([]);
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [elegidos, setElegidos] = useState(() => new Set());
  const [cantidad, setCantidad] = useState(100);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [u, m, x] = await Promise.all([listarUsuarios(clubId), listarMovimientos(clubId), listarMultiplicadores(clubId)]);
      setUsuarios(u); setMovs(m); setMultis(x || []);
    } catch (err) {
      avisar({ texto: err?.message || 'No se pudo leer.', error: true });
      setUsuarios([]);
    }
  }, [clubId, avisar]);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);

  const visibles = useMemo(() => filtrarUsuarios(usuarios || [], { texto, filtro }), [usuarios, texto, filtro]);
  const resumen = useMemo(() => resumenUsuarios(usuarios || []), [usuarios]);
  const nombres = useMemo(() => new Map((usuarios || []).map((u) => [u.dueno, u.nombre])), [usuarios]);
  const vigente = multiplicadorVigente(multis);

  const hacer = async (fn, ok) => {
    setOcupado(true); avisar(null);
    try { const r = await fn(); await cargar(); avisar({ texto: typeof ok === 'function' ? ok(r) : ok }); } catch (err) {
      avisar({ texto: err?.message || 'No se pudo.', error: true });
    } finally { setOcupado(false); }
  };

  const regalar = (aTodos) => {
    const n = Math.round(Number(cantidad));
    if (!n) return;
    const duenos = aTodos ? null : [...elegidos];
    const quienes = aTodos ? 'a todos los del club' : `a ${duenos.length} ${duenos.length === 1 ? 'persona' : 'personas'}`;
    if (!window.confirm(`¿${n > 0 ? 'Dar' : 'Quitar'} ${Math.abs(n)} ${MONEDA} ${quienes}?`)) return;
    hacer(() => darVCoins(clubId, duenos, n, motivo), (c) => `${n > 0 ? '+' : ''}${n} ${MONEDA} a ${c} ${c === 1 ? 'persona' : 'personas'}.`);
  };
  const alternarBloqueo = (u) => {
    if (u.bloqueado) { hacer(() => bloquearUsuario(clubId, u.dueno, false), `${u.nombre}: habilitado.`); return; }
    const m = window.prompt(`¿Suspender a ${u.nombre} en el juego? (no va a poder abrir sobres ni jugar al V-Draft)\nMotivo (opcional):`, '');
    if (m === null) return;
    hacer(() => bloquearUsuario(clubId, u.dueno, true, m), `${u.nombre}: suspendido.`);
  };
  const alternarElegido = (d) => setElegidos((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; });

  if (usuarios === null) return <div style={dim}>Leyendo usuarios…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <Dato rot="USUARIOS" v={resumen.total} />
        <Dato rot="JUEGAN" v={resumen.juegan} />
        <Dato rot={`${MONEDA} EN CIRCULACIÓN`} v={resumen.vcoins.toLocaleString('es-AR')} />
        <Dato rot="BLOQUEADOS" v={resumen.bloqueados} rojo={resumen.bloqueados > 0} />
      </div>

      {vigente && (
        <div style={{ ...caja, borderColor: '#fbbf24', color: '#fbbf24', fontWeight: 900 }}>
          ⚡ {vigente.nombre} · x{vigente.factor} hasta el {new Date(vigente.hasta).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
        </div>
      )}

      {/* regalos */}
      <div style={caja}>
        <div style={rotulo}>DAR O QUITAR {MONEDA.toUpperCase()}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ ...campo, width: 100 }} aria-label="Cantidad" />
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (queda registrado)" maxLength={80} style={{ ...campo, flex: 1, minWidth: 180 }} />
          <button style={boton} disabled={ocupado || !Number(cantidad)} onClick={() => regalar(true)}>A TODOS</button>
          <button style={chip} disabled={ocupado || !Number(cantidad) || elegidos.size === 0} onClick={() => regalar(false)}>A LOS ELEGIDOS ({elegidos.size})</button>
        </div>
        <div style={{ ...dim, marginTop: 6 }}>Con número negativo se quita (nunca queda en menos de 0). "A todos": los jugadores activos y cualquiera que ya haya jugado.</div>
      </div>

      {/* eventos de V-Coins */}
      <Multiplicadores multis={multis} ocupado={ocupado} sinTabla={multis === null}
        guardar={(m) => hacer(() => guardarMultiplicador(clubId, m), `Evento "${m.nombre}" guardado.`)}
        alternar={(m) => hacer(() => activarMultiplicador(m.id, !m.activo), `${m.nombre}: ${m.activo ? 'apagado' : 'activo'}.`)} />

      {/* la lista */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o categoría" style={{ ...campo, width: 220 }} />
        {FILTROS_USUARIOS.map(([id, t]) => <button key={id} onClick={() => setFiltro(id)} style={chipOn(filtro === id)}>{t}</button>)}
        <span style={{ marginLeft: 'auto', ...dim }}>{visibles.length} de {usuarios.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={chip} onClick={() => setElegidos(new Set(visibles.map((u) => u.dueno)))}>ELEGIR LOS {visibles.length}</button>
        {elegidos.size > 0 && <button style={chip} onClick={() => setElegidos(new Set())}>NINGUNO</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visibles.map((u) => (
          <div key={u.dueno} style={{ ...fila, opacity: u.activo === false ? 0.6 : 1, borderColor: u.bloqueado ? 'rgba(239,68,68,.5)' : 'var(--border)' }}>
            <input type="checkbox" checked={elegidos.has(u.dueno)} onChange={() => alternarElegido(u.dueno)} style={{ width: 'auto', margin: 0 }} aria-label={`Elegir a ${u.nombre}`} />
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {u.nombre}{u.bloqueado && <span style={{ ...tag, background: '#b91c1c', marginLeft: 6 }}>BLOQUEADO</span>}
              </div>
              <div style={{ ...dim, fontSize: 11 }}>
                {u.tipo === 'staff' ? `STAFF · ${u.detalle || ''}` : u.detalle || 'JUGADOR'}{u.bloqueado && u.motivo ? ` · ${u.motivo}` : ''}
              </div>
            </div>
            <Num rot={MONEDA} v={u.puntos} fuerte />
            <Num rot="CARTAS" v={u.cartas} />
            <Num rot="SOBRES" v={u.sobres} />
            <Num rot="V-DRAFT" v={u.vdraft} />
            <Num rot="ÚLTIMO" v={fecha(u.ultimo_sobre)} />
            <button style={{ ...chip, color: u.bloqueado ? 'var(--accent)' : '#ef4444' }} disabled={ocupado} onClick={() => alternarBloqueo(u)}>
              {u.bloqueado ? 'HABILITAR' : 'BLOQUEAR'}
            </button>
          </div>
        ))}
      </div>

      {movs.length > 0 && (
        <div style={caja}>
          <div style={rotulo}>ÚLTIMOS MOVIMIENTOS A MANO</div>
          <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 12 }}>
            {movs.slice(0, 15).map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontFamily: MONO, color: 'var(--text-dim)' }}>{new Date(m.created_at).toLocaleDateString('es-AR')}</span>
                <b style={{ fontFamily: MONO, color: m.cantidad > 0 ? 'var(--accent)' : '#ef4444' }}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</b>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombres.get(m.dueno) || m.dueno}{m.motivo ? ` · ${m.motivo}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Multiplicadores({ multis, ocupado, sinTabla, guardar, alternar }) {
  const [nuevo, setNuevo] = useState(null);
  const errores = nuevo ? erroresMultiplicador(nuevo) : [];
  if (sinTabla) return null;
  return (
    <div style={caja}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={rotulo}>EVENTOS DE {MONEDA.toUpperCase()} MULTIPLICADAS</div>
        {!nuevo && <button style={{ ...chip, marginLeft: 'auto' }} onClick={() => setNuevo({ nombre: `${MONEDA.toUpperCase()} X2`, factor: 2, desde: ahoraLocal(), hasta: ahoraLocal(48), aplica: [...TODAS] })}>+ CREAR</button>}
      </div>
      <div style={{ ...dim, marginTop: 4 }}>
        Mientras corre, lo que se gana en los juegos elegidos se multiplica. Los jugadores ven un cartel en todos los Juegos:
        desde 7 días antes (con la cuenta regresiva) y mientras dura.
      </div>
      {nuevo && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
          <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} maxLength={60} style={{ ...campo, width: 180 }} aria-label="Nombre" />
          <select value={nuevo.factor} onChange={(e) => setNuevo({ ...nuevo, factor: Number(e.target.value) })} style={campo} aria-label="Factor">
            {FACTORES.map((f) => <option key={f} value={f}>x{f}</option>)}
          </select>
          <label style={etiqueta}>Desde <input type="datetime-local" value={nuevo.desde} onChange={(e) => setNuevo({ ...nuevo, desde: e.target.value })} style={campo} /></label>
          <label style={etiqueta}>Hasta <input type="datetime-local" value={nuevo.hasta} onChange={(e) => setNuevo({ ...nuevo, hasta: e.target.value })} style={campo} /></label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flexBasis: '100%' }} role="group" aria-label="Dónde aplica">
            <span style={etiqueta}>Aplica a</span>
            {AREAS.map((a) => {
              const on = nuevo.aplica.includes(a.id);
              return (
                <button key={a.id} type="button" style={chipOn(on)} aria-pressed={on} title={a.ayuda}
                  onClick={() => setNuevo({ ...nuevo, aplica: on ? nuevo.aplica.filter((x) => x !== a.id) : [...nuevo.aplica, a.id] })}>
                  {on ? '✓ ' : ''}{a.nombre}
                </button>
              );
            })}
          </div>
          <button style={boton} disabled={ocupado || errores.length > 0}
            onClick={() => { guardar({ ...nuevo, desde: new Date(nuevo.desde).toISOString(), hasta: new Date(nuevo.hasta).toISOString() }); setNuevo(null); }}>GUARDAR</button>
          <button style={chip} onClick={() => setNuevo(null)}>CANCELAR</button>
          {errores.length > 0 && <span style={{ ...dim, color: '#f97316' }}>{errores.join(' ')}</span>}
        </div>
      )}
      {multis.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {multis.map((m) => {
            const estado = estadoMultiplicador(m);
            return (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                <b>{m.nombre}</b><span style={{ fontFamily: MONO }}>x{m.factor}</span>
                <span style={{ ...tag, background: '#1f2937' }}>{textoAreas(m.aplica)}</span>
                <span style={dim}>{new Date(m.desde).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} → {new Date(m.hasta).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span style={{ ...tag, background: estado === 'CORRIENDO' ? '#b45309' : '#374151' }}>{estado}</span>
                <button style={{ ...chip, marginLeft: 'auto' }} disabled={ocupado} onClick={() => alternar(m)}>{m.activo ? 'APAGAR' : 'PRENDER'}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const Dato = ({ rot, v, rojo }) => (
  <div style={{ ...caja, padding: 10 }}>
    <div style={rotulo}>{rot}</div>
    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: rojo ? '#ef4444' : 'var(--accent)' }}>{v}</div>
  </div>
);
const Num = ({ rot, v, fuerte }) => (
  <div style={{ textAlign: 'center', minWidth: 54 }}>
    <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: fuerte ? 15 : 13, color: fuerte ? 'var(--accent)' : 'var(--text)' }}>{v ?? '—'}</div>
    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', color: 'var(--text-dim)' }}>{rot}</div>
  </div>
);

const caja = { padding: 12, borderRadius: 10, border: '1px solid var(--border)' };
const fila = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' };
const boton = { padding: '8px 12px', borderRadius: 8, fontWeight: 900, fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none', background: '#fbbf24', color: '#1a1205' };
const chip = {
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent',
};
const chipOn = (on) => ({ ...chip, borderColor: on ? 'var(--accent)' : 'var(--border)', color: on ? 'var(--accent)' : 'var(--text-dim)', background: on ? 'rgba(0,255,136,.08)' : 'transparent' });
const tag = { fontSize: 10, fontWeight: 900, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 4, color: '#fff' };
const campo = { width: 'auto', flex: '0 0 auto', padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const etiqueta = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
