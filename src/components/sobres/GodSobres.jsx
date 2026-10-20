import React, { useMemo, useState } from 'react';
import { SOBRES, RAREZAS, MONEDA, probabilidades } from '../../analytics/sobres';
import { VARIANTES, VARIANTE_DE_TIPO, VIDEOS } from '../../analytics/aperturas';
import { CINEMATICAS, ESCENAS_BASE } from '../../analytics/eventos';
import { resultadoDePrueba } from '../../analytics/god';
import {
  TIPOS_EDITABLES, CON_COSTO, REGLAS_TIPO, normalizarTipo, reglasDeTipo, tipoParaEditar, rarezasPorDefecto,
} from '../../analytics/tiposSobre';
import { guardarConfigSobres } from '../../utils/god';
import SelectorCartas from './SelectorCartas';

/* MODO GOD · SOBRES
 *
 * Arriba, lo del club: qué sobres están activos y una cinemática para todas
 * las aperturas. Abajo, cada tipo de sobre: su presentación (nombre, texto,
 * cinemática y colores), cuántas cartas trae, cuánto cuesta, qué rarezas
 * salen y con qué chance, y si trae sólo algunas cartas elegidas. Se guarda en
 * sobres_config.tipos y es lo que usa la base para sortear.
 */

const MONO = 'JetBrains Mono, monospace';
const COLORES = [['principal', 'Principal'], ['secundario', 'Fondo del sobre'], ['acento', 'Acento'], ['luz', 'Luz'], ['fondo', 'Fondo'], ['texto', 'Texto']];
const nombreCinematica = (c) => `${c.nombre}${VIDEOS[c.video] ? '' : ' · todavía con otro video'}`;

export default function GodSobres({ clubId, estado, config, setConfig, catalogo, ajustes, avisar, alCambiar, alProbar }) {
  const [editando, setEditando] = useState(null); // tipo
  const [guardando, setGuardando] = useState(false);
  if (!config) return <div style={dim}>Leyendo…</div>;

  const guardar = async (nuevo, texto) => {
    setGuardando(true); avisar(null);
    try {
      await guardarConfigSobres(clubId, { ...nuevo, ...(nuevo.sinTipos ? { tipos: undefined } : {}) });
      setConfig(nuevo);
      avisar({ texto });
      alCambiar?.();
      return true;
    } catch (err) {
      avisar({ texto: err?.message || 'No se pudo guardar.', error: true });
      return false;
    } finally { setGuardando(false); }
  };

  const probar = (tipo, cfgTipo) => alProbar({
    resultado: resultadoDePrueba({ catalogo: catalogo || [], tipo, ajustes, config: cfgTipo }),
    escenaTipo: normalizarTipo(cfgTipo || {}, tipo).escena || null,
  });

  if (editando) {
    return (
      <Editor tipo={editando} inicial={config.tipos?.[editando] || {}} catalogo={catalogo || []} ajustes={ajustes} guardando={guardando}
        probar={probar} alCancelar={() => setEditando(null)}
        alGuardar={async (cfgTipo) => {
          const tipos = { ...(config.tipos || {}) };
          const n = normalizarTipo(cfgTipo, editando);
          if (Object.keys(n).length) tipos[editando] = n; else delete tipos[editando];
          if (await guardar({ ...config, tipos }, `${n.nombre || SOBRES[editando].nombre}: guardado. Ya rige para todos los del club.`)) setEditando(null);
        }} />
    );
  }

  const alternar = (t) => setConfig((c) => ({ ...c, suspendidos: c.suspendidos.includes(t) ? c.suspendidos.filter((x) => x !== t) : [...c.suspendidos, t] }));
  const restablecer = (t) => {
    if (!window.confirm(`¿Volver ${SOBRES[t].nombre} a como era (nombre, cartas, rarezas, escena)?`)) return;
    const tipos = { ...(config.tipos || {}) };
    delete tipos[t];
    guardar({ ...config, tipos }, `${SOBRES[t].nombre}: vuelve a como era.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {config.sinTabla && <div style={{ ...dim, color: '#ef4444' }}>Falta la migración 20261022130000_mysquad_god.sql: hasta correrla esto no se puede guardar.</div>}
      {config.sinTipos && !config.sinTabla && (
        <div style={{ ...dim, color: '#f97316' }}>Falta la migración 20261023120000_sobres_tipos.sql: hasta correrla, cada sobre no se puede editar (lo de arriba sí).</div>
      )}

      <div style={rotulo}>SOBRES ACTIVOS (tocá para suspender o activar)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TIPOS_EDITABLES.map((t) => {
          const suspendido = config.suspendidos.includes(t);
          return (
            <button key={t} onClick={() => alternar(t)} style={{ ...chip(!suspendido), borderColor: suspendido ? '#ef4444' : 'var(--accent)', color: suspendido ? '#ef4444' : 'var(--accent)' }}>
              {suspendido ? '⏸' : '▶'} {config.tipos?.[t]?.nombre || SOBRES[t].nombre}
            </button>
          );
        })}
      </div>
      <div style={rotulo}>CINEMÁTICA PARA TODAS LAS APERTURAS (opcional; pisa la de cada sobre)</div>
      <select value={config.evento_activo || ''} onChange={(e) => setConfig((c) => ({ ...c, evento_activo: e.target.value || null }))} style={campo}>
        <option value="">NINGUNA (cada sobre con la suya)</option>
        {CINEMATICAS.map((c) => <option key={c.id} value={c.id}>{nombreCinematica(c)}</option>)}
        {config.evento_activo && !CINEMATICAS.some((c) => c.id === config.evento_activo) && <option value={config.evento_activo}>{config.evento_activo}</option>}
      </select>
      <div style={dim}>Ahora: {estado?.evento ? (CINEMATICAS.find((c) => c.id === estado.evento)?.nombre || estado.evento) : 'cada sobre con su cinemática'} · suspendidos: {(estado?.suspendidos || []).join(', ') || 'ninguno'}</div>
      <button onClick={() => guardar(config, 'Guardado. Ya rige para todos los del club.')} disabled={guardando || config.sinTabla} style={{ ...boton, alignSelf: 'flex-start' }}>
        {guardando ? 'GUARDANDO…' : 'GUARDAR'}
      </button>

      <div style={{ ...rotulo, marginTop: 10 }}>CADA SOBRE</div>
      {TIPOS_EDITABLES.map((t) => {
        const cfg = config.tipos?.[t] || {};
        const r = reglasDeTipo(t, cfg);
        const cambiado = Object.keys(normalizarTipo(cfg, t)).length > 0;
        const luz = cfg.escena?.colores?.luz;
        return (
          <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 10, borderRadius: 10,
            border: `1px solid ${luz || (cambiado ? 'rgba(251,191,36,.6)' : 'var(--border)')}` }}>
            <b style={{ color: luz || 'var(--text)' }}>{cfg.nombre || SOBRES[t].nombre}</b>
            {cambiado && <span style={{ ...tag, background: '#b45309' }}>EDITADO</span>}
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>
              {r.cartas} cartas{CON_COSTO.has(t) ? ` · ${r.costo} ${MONEDA}` : ''} · {r.incluidas.length ? `sólo ${r.incluidas.length} elegidas` : r.rarezas.map((x) => x.toUpperCase()).join(' ')}
              {cfg.escena?.video ? ` · ${ESCENAS_BASE.find((e) => e.id === cfg.escena.video)?.nombre.split(' (')[0] || cfg.escena.video}` : ''}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button style={chip(false)} disabled={!catalogo} onClick={() => probar(t, cfg)}>PROBAR</button>
              <button style={chip(false)} disabled={config.sinTipos} onClick={() => setEditando(t)}>EDITAR</button>
              {cambiado && <button style={chip(false)} disabled={guardando} onClick={() => restablecer(t)}>RESTABLECER</button>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Editor({ tipo, inicial, catalogo, ajustes, guardando, probar, alGuardar, alCancelar }) {
  const base = SOBRES[tipo];
  const [t, setT] = useState(() => tipoParaEditar(tipo, inicial));
  const [conLista, setConLista] = useState(() => (inicial.incluidas || []).length > 0);
  const [coloresPropios, setColoresPropios] = useState(() => Object.keys(inicial.escena?.colores || {}).length > 0);
  const cambiar = (k, v) => setT((x) => ({ ...x, [k]: v }));
  const cambiarEscena = (k, v) => setT((x) => ({ ...x, escena: { ...x.escena, [k]: v } }));

  const variante = VARIANTES[VARIANTE_DE_TIPO[tipo]] || VARIANTES.puntos;
  const coloresBase = useMemo(() => variante.colores || {}, [variante]);
  const colores = coloresPropios ? { ...coloresBase, ...t.escena.colores } : coloresBase;

  // Lo que se guardaría (sin la lista si no se usa, sin colores si no son propios).
  const borrador = useMemo(() => ({
    ...t,
    incluidas: conLista ? t.incluidas : [],
    escena: { ...t.escena, colores: coloresPropios ? { ...coloresBase, ...t.escena.colores } : {} },
  }), [t, conLista, coloresPropios, coloresBase]);
  const reglas = reglasDeTipo(tipo, borrador);

  const activas = useMemo(() => catalogo.filter((k) => k.activa !== false
    && (reglas.incluidas.length ? reglas.incluidas.includes(k.clave) : !k.exclusiva_evento)), [catalogo, reglas.incluidas]);
  const chances = probabilidades(activas, { rarezas: reglas.rarezas, pesos: reglas.pesos });
  const alternarRareza = (r) => cambiar('rarezas', t.rarezas.includes(r) ? t.rarezas.filter((x) => x !== r) : [...t.rarezas, r]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={rotulo}>EDITAR · {base.nombre}</div>

      <div style={rotulo}>PRESENTACIÓN</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={t.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder={base.nombre} maxLength={40} style={{ ...campo, width: 240 }} />
        <input value={t.ayuda} onChange={(e) => cambiar('ayuda', e.target.value)} placeholder={`Texto (vacío = "${base.ayuda}")`} maxLength={160} style={{ ...campo, flex: 1, minWidth: 240 }} />
      </div>

      <div style={rotulo}>EL SOBRE</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Numero rot="Cartas por sobre" v={t.cartas} r={REGLAS_TIPO.cartas} cambiar={(v) => cambiar('cartas', v)} />
        {CON_COSTO.has(tipo) && <Numero rot={`Costo (${MONEDA}, 0 = gratis)`} v={t.costo} r={REGLAS_TIPO.costo} cambiar={(v) => cambiar('costo', v)} />}
      </div>

      <div style={rotulo}>QUÉ PUEDE SALIR</div>
      <div style={dim}>Tocá una rareza para que salga o no. El número es su peso: la chance de cada lugar del sobre es su peso sobre la suma (0 = no sale).</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {RAREZAS.map((r) => {
          const on = t.rarezas.includes(r.id);
          const ch = chances.find((c) => c.id === r.id);
          return (
            <div key={r.id} style={{ padding: 8, borderRadius: 8, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, opacity: on ? 1 : 0.5 }}>
              <button onClick={() => alternarRareza(r.id)} style={{ ...chip(on), width: '100%' }}>{on ? '✓ ' : ''}{r.nombre}</button>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                <input type="number" min={0} max={100} step={0.5} value={t.pesos[r.id]} disabled={!on}
                  onChange={(e) => cambiar('pesos', { ...t.pesos, [r.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  style={{ ...campo, width: 64 }} />
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>
                  {on ? (ch ? `${ch.porCiento.toFixed(1)}% · ${ch.cartas}` : 'sin cartas') : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={chip(false)} onClick={() => setT((x) => ({ ...x, rarezas: rarezasPorDefecto(tipo), pesos: Object.fromEntries(RAREZAS.map((r) => [r.id, r.peso])) }))}>RAREZAS Y PESOS DE SIEMPRE</button>
        <span style={dim}>{activas.length} cartas pueden salir{chances.length === 0 ? ': ¡ninguna! Así el sobre no se puede abrir.' : '.'}</span>
      </div>

      <label style={etiqueta}>
        <input type="checkbox" checked={conLista} onChange={(e) => setConLista(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
        Sólo cartas elegidas (el sobre trae únicamente las que marques, incluidas las exclusivas de un evento)
      </label>
      {conLista && <SelectorCartas catalogo={catalogo} ajustes={ajustes} elegidas={t.incluidas} cambiar={(cl) => cambiar('incluidas', cl)} />}

      <div style={rotulo}>CINEMÁTICA Y COLORES</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={t.escena.video || ''} onChange={(e) => cambiarEscena('video', e.target.value)} style={campo}>
          <option value="">La de siempre ({variante.modo === 'video' ? ESCENAS_BASE.find((e) => e.id === variante.video)?.nombre.split(' (')[0] || variante.video : 'estándar, sin video'})</option>
          {ESCENAS_BASE.filter((e) => e.id).map((e) => <option key={e.id} value={e.id}>{e.nombre}{VIDEOS[e.id] ? '' : ' · todavía sin video (usa otra)'}</option>)}
        </select>
        <input value={t.escena.titulo || ''} onChange={(e) => cambiarEscena('titulo', e.target.value)} placeholder="Título en la apertura (opcional)" maxLength={40} style={{ ...campo, width: 240 }} />
      </div>
      <label style={etiqueta}>
        <input type="checkbox" checked={coloresPropios} onChange={(e) => setColoresPropios(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
        Colores propios (pintan el sobre en la pantalla, el título, las partículas y la luz de la mejor carta)
      </label>
      {coloresPropios && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {COLORES.map(([k, rot]) => (
            <label key={k} style={{ ...etiqueta, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              {rot}
              <input type="color" value={colores[k] || '#000000'} onChange={(e) => cambiarEscena('colores', { ...t.escena.colores, [k]: e.target.value })}
                style={{ width: 54, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} />
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ ...etiqueta, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          Partículas {t.escena.particulas ?? `(las de siempre: ${variante.particulas ?? '—'})`}
          <input type="range" min={0} max={160} value={t.escena.particulas ?? variante.particulas ?? 60} onChange={(e) => cambiarEscena('particulas', Number(e.target.value))} style={{ width: 140 }} />
        </label>
        <label style={{ ...etiqueta, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          Intensidad {t.escena.intensidad != null ? Number(t.escena.intensidad).toFixed(1) : '(la de siempre)'}
          <input type="range" min={0} max={1.5} step={0.1} value={t.escena.intensidad ?? variante.intensidad ?? 1} onChange={(e) => cambiarEscena('intensidad', Number(e.target.value))} style={{ width: 140 }} />
        </label>
        {(t.escena.particulas != null || t.escena.intensidad != null) && (
          <button style={{ ...chip(false), alignSelf: 'flex-end' }} onClick={() => setT((x) => ({ ...x, escena: { ...x.escena, particulas: null, intensidad: null } }))}>LAS DE SIEMPRE</button>
        )}
      </div>

      {/* cómo se ve en la pantalla de Sobres */}
      <div style={{ maxWidth: 280, padding: 14, borderRadius: 10, border: `1px solid ${colores.luz || 'var(--accent)'}`,
        background: coloresPropios ? `linear-gradient(160deg, ${colores.secundario || '#111'} 0%, var(--panel) 70%)` : 'var(--panel)' }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em', color: coloresPropios ? colores.luz : 'var(--accent)' }}>{coloresPropios ? '★ ' : ''}{t.nombre || base.nombre}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '4px 0 10px', lineHeight: 1.4 }}>{t.ayuda || base.ayuda}</div>
        <div style={{ padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.8rem', textAlign: 'center',
          background: coloresPropios ? `linear-gradient(90deg, ${colores.principal}, ${colores.luz})` : 'var(--accent)', color: coloresPropios ? colores.texto : '#000' }}>
          ABRIR · {reglas.cartas} {reglas.rarezas.every((r) => ['totw', 'potw', 'totm', 'potm', 'toty'].includes(r)) ? 'ESPECIALES' : 'CARTAS'}
          {CON_COSTO.has(tipo) && tipo === 'mega' && reglas.costo ? ` · ${reglas.costo} V-COINS` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {t.rarezas.length === 0 && <span style={{ ...dim, color: '#f97316' }}>Elegí al menos una rareza.</span>}
        <button style={boton} disabled={guardando || chances.length === 0 || t.rarezas.length === 0} onClick={() => alGuardar(borrador)}>{guardando ? 'GUARDANDO…' : 'GUARDAR SOBRE'}</button>
        <button style={chip(false)} disabled={chances.length === 0} onClick={() => probar(tipo, borrador)}>PROBAR LA APERTURA</button>
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

const boton = { padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none', background: '#fbbf24', color: '#1a1205' };
const chip = (on) => ({
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text-dim)',
  background: on ? 'rgba(0,255,136,.08)' : 'transparent',
});
const tag = { fontSize: 10, fontWeight: 900, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 4, color: '#fff' };
const campo = { width: 'auto', flex: '0 0 auto', padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const etiqueta = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
