import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SelectorCartas from './SelectorCartas';
import { VIDEOS } from '../../analytics/aperturas';
import { MONEDA } from '../../analytics/sobres';
import { resultadoDePrueba } from '../../analytics/god';
import {
  ESCENAS_BASE, PLANTILLAS, REGLAS, normalizarEvento, erroresEvento, eventoDePlantilla, cambiosDeExclusivas,
} from '../../analytics/eventos';
import { listarEventos, guardarEvento, activarEvento, marcarExclusivas } from '../../utils/eventos';
import { guardarAjuste, quitarAjuste } from '../../utils/god';

/* MODO GOD · EVENTOS
 *
 * Un evento es un sobre propio del club: sus cartas (del catálogo), su media
 * (los ajustes de siempre), su cinemática y sus colores, y sus reglas
 * (cuántas cartas trae, cuánto cuesta, cuántos por día, entre qué fechas).
 * Los jugadores lo ven en Sobres mientras esté activo. Se puede probar antes.
 */

const MONO = 'JetBrains Mono, monospace';
const COLORES = [['principal', 'Principal'], ['secundario', 'Fondo del sobre'], ['acento', 'Acento'], ['luz', 'Luz'], ['fondo', 'Fondo'], ['texto', 'Texto']];
const NUEVO = normalizarEvento({ nombre: '', activo: false, cartas: [], escena: { video: 'elite', colores: { principal: '#2563eb', luz: '#60a5fa', acento: '#e0f2fe', secundario: '#0b1640', fondo: '#020617', texto: '#ffffff' } } });
/* Un sobre nuevo (Modo GOD · SOBRES): igual que un evento, pero sin fechas, siempre a la vista y con sus cartas no exclusivas. */
const NUEVO_SOBRE = normalizarEvento({ ...NUEVO, activo: true, sobre: { cartas: 3, costo: 100, por_dia: 1, exclusivas: false, permanente: true } });

/* `soloSobres`: la lista y el editor de los sobres creados (los eventos `sobre.permanente`). */
export default function GodEventos({ clubId, catalogo, ajustes, fotos, recargar, avisar, alProbar, soloSobres = false }) {
  const [eventos, setEventos] = useState(null);
  const [editando, setEditando] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const todos = await listarEventos(clubId);
      setEventos(todos.filter((e) => !!e.sobre?.permanente === soloSobres));
    } catch (err) { avisar({ texto: err?.message, error: true }); setEventos([]); }
  }, [clubId, avisar, soloSobres]);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);

  const probar = (ev) => alProbar({ resultado: resultadoDePrueba({ catalogo: catalogo || [], ajustes, fotos, evento: { ...normalizarEvento(ev), id: ev.id || 'nuevo' } }) });

  const alternar = async (ev) => {
    try { await activarEvento(ev.id, !ev.activo); await cargar(); avisar({ texto: `${ev.nombre}: ${ev.activo ? 'suspendido' : 'activo'}.` }); } catch (err) {
      avisar({ texto: err?.message || 'No se pudo.', error: true });
    }
  };

  if (editando) {
    return (
      <Editor inicial={editando} catalogo={catalogo || []} ajustes={ajustes} clubId={clubId} avisar={avisar} probar={probar} otros={eventos || []}
        recargarAjustes={recargar}
        alGuardar={async () => { setEditando(null); await cargar(); }} alCancelar={() => setEditando(null)} />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={dim}>{soloSobres
        ? 'Sobres creados por el club: sus cartas, su precio, cuántos por día, su cinemática y sus colores. Están siempre en Sobres mientras estén activos.'
        : 'Cada evento es un sobre propio: lo ven todos los del club en Sobres mientras esté activo (y dentro de sus fechas).'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={{ ...boton, background: '#fbbf24', color: '#1a1205' }} onClick={() => setEditando(soloSobres ? NUEVO_SOBRE : NUEVO)}>{soloSobres ? '+ CREAR SOBRE' : '+ CREAR EVENTO'}</button>
        {!soloSobres && Object.entries(PLANTILLAS).map(([id, p]) => (
          <button key={id} style={chip(false)} disabled={!catalogo}
            onClick={() => setEditando(eventoDePlantilla(id, catalogo || []))}>+ {p.nombre}</button>
        ))}
      </div>
      {eventos === null ? <div style={dim}>Leyendo eventos…</div> : eventos.length === 0 ? (
        <div style={dim}>{soloSobres ? 'Todavía no hay sobres creados.' : 'Todavía no hay eventos.'}</div>
      ) : eventos.map((ev) => (
        <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 10, borderRadius: 10,
          border: `1px solid ${ev.activo ? ev.escena?.colores?.luz || 'var(--accent)' : 'var(--border)'}` }}>
          <b style={{ color: ev.escena?.colores?.luz || 'var(--text)' }}>{ev.nombre}</b>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>
            {ev.cartas.length} cartas · {ev.sobre?.cartas ?? 3} por sobre · {ev.sobre?.costo ? `${ev.sobre.costo} ${MONEDA}` : 'gratis'} · {ev.sobre?.por_dia ?? 1}/día
            {ev.desde || ev.hasta ? ` · ${ev.desde || '…'} a ${ev.hasta || '…'}` : ''}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button style={chip(ev.activo)} onClick={() => alternar(ev)}>{ev.activo ? '▶ ACTIVO' : '⏸ SUSPENDIDO'}</button>
            <button style={chip(false)} onClick={() => probar(ev)}>PROBAR</button>
            <button style={chip(false)} onClick={() => setEditando(normalizarEvento(ev))}>EDITAR</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function Editor({ inicial, catalogo, ajustes, clubId, avisar, probar, otros, recargarAjustes, alGuardar, alCancelar }) {
  const [ev, setEv] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [suma, setSuma] = useState(0);
  const cambiar = (k, v) => setEv((e) => ({ ...e, [k]: v }));
  const cambiarSobre = (k, v) => setEv((e) => ({ ...e, sobre: { ...e.sobre, [k]: v } }));
  const cambiarEscena = (k, v) => setEv((e) => ({ ...e, escena: { ...e.escena, [k]: v } }));
  const cambiarColor = (k, v) => setEv((e) => ({ ...e, escena: { ...e.escena, colores: { ...e.escena.colores, [k]: v } } }));

  const elegidas = useMemo(() => new Set(ev.cartas), [ev.cartas]);
  const activas = useMemo(() => catalogo.filter((k) => k.activa !== false), [catalogo]);
  const delEvento = useMemo(() => activas.filter((k) => elegidas.has(k.clave)), [activas, elegidas]);
  const errores = erroresEvento(ev);

  const guardar = async () => {
    setGuardando(true); avisar(null);
    try {
      const guardado = await guardarEvento(clubId, ev);
      const { si, no } = cambiosDeExclusivas({ ...normalizarEvento(ev), id: guardado?.id || ev.id }, otros, inicial.cartas);
      await marcarExclusivas(clubId, si, true);
      await marcarExclusivas(clubId, no, false);
      await recargarAjustes();
      avisar({ texto: `Evento "${ev.nombre}" guardado${ev.activo ? ' y activo' : ''}.` });
      await alGuardar();
    } catch (err) {
      avisar({ texto: err?.message || 'No se pudo guardar.', error: true });
    } finally { setGuardando(false); }
  };

  /* La media de las cartas del evento: los ajustes de siempre (se ve igual en todos lados). */
  const medias = async (fn, ok) => {
    try { await fn(); await recargarAjustes(); avisar({ texto: ok }); } catch (err) { avisar({ texto: err?.message || 'No se pudo.', error: true }); }
  };
  const sumarATodas = () => medias(() => Promise.all(delEvento.map((k) => {
    const calc = Number(k.carta?.ovr);
    return Number.isFinite(calc) ? guardarAjuste(clubId, k.clave, Math.max(1, Math.min(99, calc + Number(suma))), `Evento ${ev.nombre}: ${suma > 0 ? '+' : ''}${suma}`) : null;
  })), `Media ${suma > 0 ? '+' : ''}${suma} a las ${delEvento.length} cartas del evento.`);
  const volverTodas = () => medias(() => Promise.all(delEvento.filter((k) => ajustes.has(k.clave)).map((k) => quitarAjuste(clubId, k.clave))), 'Vuelven las medias calculadas.');

  const c = ev.escena.colores;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={rotulo}>{inicial.sobre?.permanente ? (inicial.id ? 'EDITAR SOBRE' : 'CREAR SOBRE') : inicial.id ? 'EDITAR EVENTO' : 'CREAR EVENTO'}</div>

      {/* nombre y fechas */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={ev.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder={inicial.sobre?.permanente ? 'Nombre del sobre' : 'Nombre del evento'} maxLength={60} style={{ ...campo, width: 240 }} />
        {!inicial.sobre?.permanente && <>
          <label style={etiqueta}>Desde <input type="date" value={ev.desde || ''} onChange={(e) => cambiar('desde', e.target.value || null)} style={campo} /></label>
          <label style={etiqueta}>Hasta <input type="date" value={ev.hasta || ''} onChange={(e) => cambiar('hasta', e.target.value || null)} style={campo} /></label>
        </>}
        <label style={etiqueta}><input type="checkbox" checked={ev.activo} onChange={(e) => cambiar('activo', e.target.checked)} style={{ width: 'auto', margin: 0 }} /> Activo</label>
      </div>

      {/* reglas del sobre */}
      <div style={rotulo}>EL SOBRE</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Numero rot="Cartas por sobre" v={ev.sobre.cartas} r={REGLAS.cartas} cambiar={(v) => cambiarSobre('cartas', v)} />
        <Numero rot={`Costo (${MONEDA}, 0 = gratis)`} v={ev.sobre.costo} r={REGLAS.costo} cambiar={(v) => cambiarSobre('costo', v)} />
        <Numero rot="Sobres por día" v={ev.sobre.por_dia} r={REGLAS.por_dia} cambiar={(v) => cambiarSobre('por_dia', v)} />
      </div>
      <label style={etiqueta}>
        <input type="checkbox" checked={ev.sobre.exclusivas !== false} onChange={(e) => cambiarSobre('exclusivas', e.target.checked)} style={{ width: 'auto', margin: 0 }} />
        Cartas exclusivas de este sobre (no salen en los demás sobres ni en el V-Draft; quien ya las tiene las conserva)
      </label>
      <div style={dim}>Sale con los mismos pesos por rareza que los demás sobres, pero sólo entre las cartas del evento. Una repetida da las V-Coins de siempre.</div>

      {/* cartas */}
      <div style={rotulo}>CARTAS QUE INCLUYE · {ev.cartas.length}</div>
      <SelectorCartas catalogo={catalogo} ajustes={ajustes} elegidas={ev.cartas} cambiar={(cl) => cambiar('cartas', cl)} />

      {/* media */}
      {delEvento.length > 0 && (
        <>
          <div style={rotulo}>MEDIA DE LAS CARTAS DEL EVENTO</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={etiqueta}>Sumar a todas</span>
            <input type="number" min={-20} max={20} value={suma} onChange={(e) => setSuma(Math.max(-20, Math.min(20, Number(e.target.value) || 0)))} style={{ ...campo, width: 70 }} />
            <button style={chip(false)} disabled={!suma} onClick={sumarATodas}>APLICAR A LAS {delEvento.length}</button>
            <button style={chip(false)} onClick={volverTodas}>VOLVER A LAS CALCULADAS</button>
          </div>
          <div style={dim}>Sobre la media calculada de cada una. También se puede corregir una por una en CARTAS. Se ve igual en el evento, en la colección y en el V-Draft.</div>
        </>
      )}

      {/* cinemática */}
      <div style={rotulo}>CINEMÁTICA Y COLORES</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={ev.escena.video} onChange={(e) => cambiarEscena('video', e.target.value)} style={campo}>
          {ESCENAS_BASE.map((e) => <option key={e.id} value={e.id}>{e.nombre}{e.id && !VIDEOS[e.id] ? ' · todavía sin video (usa otra)' : ''}</option>)}
        </select>
        <input value={ev.escena.titulo} onChange={(e) => cambiarEscena('titulo', e.target.value)} placeholder="Título en la apertura" maxLength={40} style={{ ...campo, width: 220 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {COLORES.map(([k, t]) => (
          <label key={k} style={{ ...etiqueta, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            {t}
            <input type="color" value={c[k] || '#000000'} onChange={(e) => cambiarColor(k, e.target.value)} style={{ width: 54, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} />
          </label>
        ))}
        <label style={{ ...etiqueta, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          Partículas {ev.escena.particulas}
          <input type="range" min={0} max={160} value={ev.escena.particulas} onChange={(e) => cambiarEscena('particulas', Number(e.target.value))} style={{ width: 120 }} />
        </label>
        <label style={{ ...etiqueta, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          Intensidad {Number(ev.escena.intensidad).toFixed(1)}
          <input type="range" min={0} max={1.5} step={0.1} value={ev.escena.intensidad} onChange={(e) => cambiarEscena('intensidad', Number(e.target.value))} style={{ width: 120 }} />
        </label>
      </div>
      <div style={{ padding: 12, borderRadius: 10, background: `linear-gradient(160deg, ${c.secundario || '#111'} 0%, ${c.fondo || '#000'} 100%)`, border: `1px solid ${c.luz || '#fff'}` }}>
        <b style={{ color: c.luz, letterSpacing: '.08em' }}>★ {ev.escena.titulo || ev.nombre || 'EVENTO'}</b>
        <div style={{ marginTop: 8, display: 'inline-block', padding: '6px 12px', borderRadius: 6, fontWeight: 900, fontSize: 12,
          background: `linear-gradient(90deg, ${c.principal}, ${c.luz})`, color: c.texto }}>ABRIR · {ev.sobre.cartas} CARTAS</div>
        <span style={{ marginLeft: 10, color: c.acento, fontSize: 12, fontWeight: 800 }}>acento</span>
      </div>
      <div style={dim}>El video es el que elijas (los colores de la imagen 3D vienen del render); los colores de acá pintan el sobre, el título, las partículas y la luz de la mejor carta.</div>

      {errores.length > 0 && <div style={{ ...dim, color: '#f97316' }}>{errores.join(' ')}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{ ...boton, background: '#fbbf24', color: '#1a1205' }} disabled={guardando || errores.length > 0} onClick={guardar}>{guardando ? 'GUARDANDO…' : 'GUARDAR EVENTO'}</button>
        <button style={chip(false)} disabled={!ev.cartas.length} onClick={() => probar(ev)}>PROBAR LA APERTURA</button>
        <button style={chip(false)} onClick={alCancelar}>CANCELAR</button>
      </div>
    </div>
  );
}

const Numero = ({ rot, v, r, cambiar }) => (
  <label style={{ ...etiqueta, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
    {rot}
    <input type="number" min={r.min} max={r.max} value={v} onChange={(e) => cambiar(Math.max(r.min, Math.min(r.max, Number(e.target.value) || r.min)))} style={{ ...campo, width: 110 }} />
  </label>
);

const boton = { padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none' };
const chip = (on) => ({
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text-dim)',
  background: on ? 'rgba(0,255,136,.08)' : 'transparent',
});
const campo = { width: 'auto', flex: '0 0 auto', padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const etiqueta = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
