import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CartaJugador from '../quinteto/CartaJugador';
import { SOBRES, rarezaPorId } from '../../analytics/sobres';
import { VARIANTES, VIDEOS, EVENTOS } from '../../analytics/aperturas';
import { PREMIOS } from '../../analytics/premiosCartas';
import { resultadoDePrueba, aplicarAjuste, mediaDudosa, pendientesDePublicar } from '../../analytics/god';
import { listarHistorial } from '../../utils/cartasDestacadas';
import { publicarCatalogo } from '../../utils/sobres';
import {
  listarCatalogo, activarCartas, MENSAJE_SIN_GOD, listarAjustes, guardarAjuste, quitarAjuste, leerConfigSobres, guardarConfigSobres,
} from '../../utils/god';
import { listarFotos, subirFotoEspecial, quitarFotoEspecial } from '../../utils/cartasFotos';
import { prepararVideo } from '../../utils/videoApertura';
import GodEventos from './GodEventos';

/* MODO GOD (sólo superusuario)
 *
 *   PROBAR    abrir cualquier sobre con cualquier escena (o evento) sin gastar
 *             nada: cartas reales del catálogo activo, nada se guarda.
 *   CARTAS    dar de baja / de alta (no se borran: quien las tiene las
 *             conserva), corregir la media cuando los datos no la sostienen y
 *             cambiar la foto de cualquier carta.
 *   SOBRES    suspender tipos de sobre y activar un evento para el club.
 *
 * Las reglas de quién puede escribir están en la base (políticas de la
 * migración 20261022130000_mysquad_god.sql): esta pantalla sólo se muestra.
 */

const MONO = 'JetBrains Mono, monospace';
const PESTANAS = [['probar', 'PROBAR'], ['eventos', 'EVENTOS'], ['cartas', 'CARTAS'], ['sobres', 'SOBRES']];
const POR_PAGINA = 40;

/* Las escenas que se pueden forzar, con aviso si su video todavía no está. */
const ESCENAS = [
  ['', 'LA QUE CORRESPONDA'],
  ...Object.values(VARIANTES).map((v) => [v.id, `${v.nombre}${v.modo === 'video' && !VIDEOS[v.video] ? ' (sin video: estándar)' : ''}`]),
  ...Object.entries(EVENTOS).map(([id, e]) => [`evento:${id}`, e.nombre]),
];

export default function PanelGod({ clubId, estado, alProbar, alCambiar, abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [pestana, setPestana] = useState('probar');
  const [catalogo, setCatalogo] = useState(null);
  const [ajustes, setAjustes] = useState(new Map());
  const [fotos, setFotos] = useState(new Map());
  const [aviso, setAviso] = useState(null);
  /* Premios guardados en HISTORIAL que todavía no están en el catálogo de sobres. */
  const [pendientes, setPendientes] = useState([]);
  const [publicando, setPublicando] = useState(false);

  const cargar = useCallback(async () => {
    if (!clubId) return;
    try {
      const [k, a, f, h] = await Promise.all([listarCatalogo(clubId), listarAjustes(clubId), listarFotos(clubId).catch(() => new Map()),
        listarHistorial(clubId).catch(() => [])]);
      setCatalogo(k); setAjustes(a); setFotos(f);
      setPendientes(pendientesDePublicar(h, k, f));
    } catch (err) {
      setAviso({ texto: err?.message || 'No se pudo leer el catálogo.', error: true });
      setCatalogo([]);
    }
  }, [clubId]);


  // Abierto de entrada (la pantalla del superusuario): el catálogo se pide al montar.
  useEffect(() => {
    if (!abiertoInicial) return undefined;
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [abiertoInicial, cargar]);

  return (
    <div className="bento-card" style={{ marginTop: 26, padding: 14, border: '1px solid rgba(251,191,36,.45)' }}>
      <button onClick={() => { setAbierto((v) => !v); if (catalogo === null) cargar(); }} style={{ ...btn, width: '100%', background: 'transparent', color: '#fbbf24', border: 'none', textAlign: 'left', padding: 0 }}>
        ⚡ MODO GOD · SUPERUSUARIO {abierto ? '▾' : '▸'}
      </button>
      {abierto && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {PESTANAS.map(([id, t]) => <button key={id} onClick={() => setPestana(id)} style={chip(pestana === id)}>{t}</button>)}
          </div>
          {aviso && <Aviso {...aviso} />}
          {pendientes.length > 0 && (pestana === 'cartas' || pestana === 'eventos') && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, marginBottom: 10,
              border: '1px solid rgba(251,191,36,.5)', background: 'rgba(251,191,36,.07)', fontSize: '0.78rem', color: 'var(--text)' }}>
              <span style={{ flex: 1, minWidth: 220 }}>
                Hay <b>{pendientes.length}</b> cartas guardadas en HISTORIAL que todavía no están publicadas para los sobres
                ({Object.entries(pendientes.reduce((m, f) => ({ ...m, [f.tipo]: (m[f.tipo] || 0) + 1 }), {})).map(([t, n]) => `${PREMIOS[t]?.sigla || t} ${n}`).join(' · ')}).
                Hasta publicarlas no aparecen acá ni pueden salir en un sobre.
              </span>
              <button style={{ ...btn, background: '#fbbf24', color: '#1a1205' }} disabled={publicando} onClick={async () => {
                setPublicando(true); setAviso(null);
                try { const n = await publicarCatalogo(clubId, pendientes); await cargar(); setAviso({ texto: `Se publicaron ${n} cartas.` }); } catch (err) {
                  setAviso({ texto: err?.message || 'No se pudieron publicar.', error: true });
                } finally { setPublicando(false); }
              }}>{publicando ? 'PUBLICANDO…' : `PUBLICAR LAS ${pendientes.length}`}</button>
            </div>
          )}
          {pestana === 'probar' && <Probar catalogo={catalogo} ajustes={ajustes} alProbar={alProbar} />}
          {pestana === 'cartas' && (
            <Cartas clubId={clubId} catalogo={catalogo} ajustes={ajustes} fotos={fotos} recargar={cargar} avisar={setAviso} />
          )}
          {pestana === 'eventos' && (
            <GodEventos clubId={clubId} catalogo={catalogo} ajustes={ajustes} recargar={cargar} avisar={setAviso} alProbar={alProbar} />
          )}
          {pestana === 'sobres' && <Config clubId={clubId} estado={estado} avisar={setAviso} alCambiar={alCambiar} />}
        </div>
      )}
    </div>
  );
}

/* ── PROBAR: cualquier sobre, cualquier escena, sin gastar ── */
function Probar({ catalogo, ajustes, alProbar }) {
  const [tipo, setTipo] = useState('mega');
  const [escena, setEscena] = useState('');
  const activas = (catalogo || []).filter((k) => k.activa !== false);

  const probar = (t = tipo, e = escena) => {
    if (!activas.length) return;
    const forzar = e && !e.startsWith('evento:') ? e : null;
    const evento = e && e.startsWith('evento:') ? e.slice(7) : null;
    const resultado = resultadoDePrueba({ catalogo: activas, tipo: t, ajustes });
    alProbar({ resultado, forzar: forzar || (evento ? `evento:${evento}` : null), evento });
  };

  if (catalogo === null) return <div style={dim}>Leyendo el catálogo…</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={dim}>Abre un sobre de prueba con cartas reales del catálogo activo ({activas.length}). No gasta V-Coins, no suma a ninguna colección y no queda registrado.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={select} aria-label="Tipo de sobre">
          {Object.values(SOBRES).map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.cartas} cartas</option>)}
        </select>
        <select value={escena} onChange={(e) => setEscena(e.target.value)} style={select} aria-label="Escena">
          {ESCENAS.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
        </select>
        <button onClick={() => probar()} disabled={!activas.length} style={{ ...btn, background: '#fbbf24', color: '#1a1205' }}>ABRIR DE PRUEBA</button>
      </div>
      <div style={rotulo}>VER CADA CINEMÁTICA (con un Mega Sobre de prueba)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ESCENAS.filter(([id]) => id && (id.startsWith('evento:') || VARIANTES[id]?.modo === 'video')).map(([id, t]) => (
          <button key={id} style={chip(false)} disabled={!activas.length}
            onPointerEnter={() => { const v = VARIANTES[id]; if (v && VIDEOS[v.video]) prepararVideo({ id: v.video, ...VIDEOS[v.video] }); }}
            onClick={() => probar('mega', id)}>{t.replace(' (sin video: estándar)', ' ·  sin video')}</button>
        ))}
      </div>
    </div>
  );
}

/* ── CARTAS: alta / baja, media y foto ── */
function Cartas({ clubId, catalogo, ajustes, fotos, recargar, avisar }) {
  const [buscar, setBuscar] = useState('');
  const [tipo, setTipo] = useState('TODAS');
  const [estado, setEstado] = useState('todas');
  const [soloDudosas, setSoloDudosas] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ocupado, setOcupado] = useState(null);

  const filas = useMemo(() => (catalogo || []).map((k) => {
    const carta = aplicarAjuste({ atributos: [], stats: {}, ...(k.carta || {}), foto: fotos.get(k.clave) || k.carta?.foto }, ajustes.get(k.clave));
    return { ...k, cartaVista: carta, dudosa: mediaDudosa({ ...carta, ovr: carta.ovrCalculada ?? carta.ovr }) };
  }), [catalogo, ajustes, fotos]);

  const tipos = useMemo(() => ['TODAS', ...new Set(filas.map((f) => f.tipo))], [filas]);
  const lista = useMemo(() => filas.filter((f) => (tipo === 'TODAS' || f.tipo === tipo)
    && (estado === 'todas' || (estado === 'activas' ? f.activa !== false : f.activa === false))
    && (!soloDudosas || f.dudosa)
    && (!buscar || `${f.carta?.apellido} ${f.carta?.nombre}`.toLowerCase().includes(buscar.toLowerCase())))
    .sort((a, b) => (b.dudosa ? 1 : 0) - (a.dudosa ? 1 : 0) || (b.cartaVista.ovr || 0) - (a.cartaVista.ovr || 0)), [filas, tipo, estado, soloDudosas, buscar]);

  const hacer = async (id, fn, ok) => {
    setOcupado(id); avisar(null);
    try { await fn(); await recargar(); if (ok) avisar({ texto: ok }); } catch (err) { avisar({ texto: err?.message || 'No se pudo.', error: true }); } finally { setOcupado(null); }
  };

  if (catalogo === null) return <div style={dim}>Leyendo el catálogo…</div>;
  if (catalogo[0]?.sinMigracion) return <Aviso texto={MENSAJE_SIN_GOD} error />;
  const visibles = lista.slice(0, limite);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={dim}>
        Dar de baja saca la carta de los sobres y del V-Draft, pero quien ya la tiene la conserva. La media corregida reemplaza a la calculada
        en los sobres (la rareza con la que sale no cambia). Las marcadas <b style={{ color: '#f97316' }}>REVISAR</b> tienen una media que sus propios datos no sostienen.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={buscar} onChange={(e) => { setBuscar(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar jugador" style={{ ...select, width: 170 }} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={select}>{tipos.map((t) => <option key={t} value={t}>{PREMIOS[t]?.sigla || t}</option>)}</select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={select}>
          <option value="todas">ACTIVAS Y DE BAJA</option><option value="activas">SÓLO ACTIVAS</option><option value="baja">SÓLO DE BAJA</option>
        </select>
        <label style={{ ...dim, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={soloDudosas} onChange={(e) => setSoloDudosas(e.target.checked)} style={{ width: 'auto', margin: 0 }} />sólo a revisar ({filas.filter((f) => f.dudosa).length})
        </label>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>{lista.length} cartas</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={chip(false)} disabled={!lista.length || !!ocupado}
          onClick={() => window.confirm(`¿Dar de BAJA las ${lista.length} cartas filtradas?`) && hacer('lote', () => activarCartas(lista.map((f) => f.id), false), 'Cartas dadas de baja.')}>DAR DE BAJA LAS FILTRADAS</button>
        <button style={chip(false)} disabled={!lista.length || !!ocupado}
          onClick={() => hacer('lote', () => activarCartas(lista.map((f) => f.id), true), 'Cartas dadas de alta.')}>DAR DE ALTA LAS FILTRADAS</button>
      </div>

      {visibles.map((f) => (
        <FilaCarta key={f.id} f={f} ajuste={ajustes.get(f.clave)} foto={fotos.get(f.clave)} ocupado={ocupado === f.id}
          alternar={() => hacer(f.id, () => activarCartas([f.id], f.activa === false))}
          ajustar={(ovr, motivo) => hacer(f.id, () => guardarAjuste(clubId, f.clave, ovr, motivo), `Media de ${f.carta?.apellido} corregida a ${ovr}.`)}
          desajustar={() => hacer(f.id, () => quitarAjuste(clubId, f.clave), 'Vuelve la media calculada.')}
          subirFoto={(archivo) => hacer(f.id, () => subirFotoEspecial({ clubId, clave: f.clave, archivo }), 'Foto guardada.')}
          quitarFoto={() => hacer(f.id, () => quitarFotoEspecial({ clubId, clave: f.clave }), 'Foto quitada.')} />
      ))}
      {lista.length > limite && <button style={chip(false)} onClick={() => setLimite((l) => l + POR_PAGINA)}>VER {Math.min(POR_PAGINA, lista.length - limite)} MÁS</button>}
    </div>
  );
}

function FilaCarta({ f, ajuste, foto, ocupado, alternar, ajustar, desajustar, subirFoto, quitarFoto }) {
  const c = f.cartaVista;
  const [ovr, setOvr] = useState(ajuste?.ovr ?? '');
  const [motivo, setMotivo] = useState(ajuste?.motivo ?? '');
  const baja = f.activa === false;
  const calculada = c.ovrCalculada ?? c.ovr;
  const datos = [
    c.pj ?? c.stats?.pj, c.nota ?? c.stats?.rating, c.goles ?? c.stats?.goles, c.asistencias ?? c.stats?.asist,
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 12, padding: 10, borderRadius: 10, border: '1px solid var(--border)', opacity: baja ? 0.55 : 1 }}>
      <CartaJugador carta={c} chica />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <b style={{ fontSize: 14 }}>{(c.apellido || '').toUpperCase()} {c.nombre}</b>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>{PREMIOS[f.tipo]?.sigla || f.tipo} · {rarezaPorId[f.rareza]?.nombre} · {c.edicion || c.categoria || ''}</span>
          {baja && <span style={{ ...tag, background: '#ef4444' }}>DE BAJA</span>}
          {f.exclusiva_evento && <span style={{ ...tag, background: '#7c3aed' }} title="Sólo sale en el sobre de su evento">SÓLO EVENTO</span>}
          {f.dudosa && <span style={{ ...tag, background: '#f97316' }} title="La media no cuadra con sus datos">REVISAR · {f.dudosa}</span>}
          {c.ovrAjustada && <span style={{ ...tag, background: '#fbbf24', color: '#1a1205' }}>MEDIA {c.ovr} (CALC. {calculada})</span>}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)' }}>
          Datos de la carta: PJ {datos[0] ?? '—'} · NOTA {Number.isFinite(Number(datos[1])) && datos[1] !== null ? Number(datos[1]).toFixed(2) : '—'} · G {datos[2] ?? '—'} · A {datos[3] ?? '—'} · media calculada {calculada ?? '—'}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={chip(false)} disabled={ocupado} onClick={alternar}>{baja ? 'DAR DE ALTA' : 'DAR DE BAJA'}</button>
          <input type="number" min={1} max={99} value={ovr} onChange={(e) => setOvr(e.target.value)} placeholder="Media" style={{ ...select, width: 74 }} aria-label="Media corregida" />
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" style={{ ...select, width: 160 }} aria-label="Motivo" />
          <button style={chip(false)} disabled={ocupado || !(Number(ovr) >= 1 && Number(ovr) <= 99)} onClick={() => ajustar(Math.round(Number(ovr)), motivo)}>CORREGIR MEDIA</button>
          {ajuste && <button style={chip(false)} disabled={ocupado} onClick={desajustar}>VOLVER A LA CALCULADA</button>}
          <label style={{ ...chip(false), display: 'inline-block' }}>
            {foto ? 'CAMBIAR FOTO' : 'PONER FOTO'}
            <input type="file" accept="image/*" hidden disabled={ocupado} onChange={(e) => { subirFoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {foto && <button style={chip(false)} disabled={ocupado} onClick={quitarFoto}>QUITAR FOTO</button>}
        </div>
      </div>
    </div>
  );
}

/* ── SOBRES Y EVENTOS ── */
function Config({ clubId, estado, avisar, alCambiar }) {
  const [cfg, setCfg] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { leerConfigSobres(clubId).then(setCfg).catch((err) => avisar({ texto: err?.message, error: true })); }, [clubId, avisar]);
  if (!cfg) return <div style={dim}>Leyendo…</div>;

  const alternar = (t) => setCfg((c) => ({ ...c, suspendidos: c.suspendidos.includes(t) ? c.suspendidos.filter((x) => x !== t) : [...c.suspendidos, t] }));
  const guardar = async () => {
    setGuardando(true); avisar(null);
    try { await guardarConfigSobres(clubId, cfg); avisar({ texto: 'Guardado. Ya rige para todos los del club.' }); alCambiar?.(); } catch (err) {
      avisar({ texto: err?.message || 'No se pudo guardar.', error: true });
    } finally { setGuardando(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {cfg.sinTabla && <Aviso texto="Falta la migración 20261022130000_mysquad_god.sql: hasta correrla esto no se puede guardar." error />}
      <div style={rotulo}>SOBRES ACTIVOS</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.values(SOBRES).map((s) => {
          const suspendido = cfg.suspendidos.includes(s.id);
          return (
            <button key={s.id} onClick={() => alternar(s.id)} style={{ ...chip(!suspendido), borderColor: suspendido ? '#ef4444' : 'var(--accent)', color: suspendido ? '#ef4444' : 'var(--accent)' }}>
              {suspendido ? '⏸' : '▶'} {s.nombre}
            </button>
          );
        })}
      </div>
      <div style={rotulo}>ESCENA PARA TODAS LAS APERTURAS (opcional; los eventos con sobre propio se arman en EVENTOS)</div>
      <select value={cfg.evento_activo || ''} onChange={(e) => setCfg((c) => ({ ...c, evento_activo: e.target.value || null }))} style={select}>
        <option value="">NINGUNO</option>
        {Object.entries(EVENTOS).map(([id, e]) => <option key={id} value={id}>{e.nombre}{e.demo ? ' (demostración)' : ''}</option>)}
      </select>
      <div style={dim}>Ahora: {estado?.evento ? `evento ${estado.evento}` : 'sin evento'} · suspendidos: {(estado?.suspendidos || []).join(', ') || 'ninguno'}</div>
      <button onClick={guardar} disabled={guardando || cfg.sinTabla} style={{ ...btn, background: '#fbbf24', color: '#1a1205', alignSelf: 'flex-start' }}>
        {guardando ? 'GUARDANDO…' : 'GUARDAR'}
      </button>
    </div>
  );
}

const Aviso = ({ texto, error }) => (
  <div style={{ fontSize: '0.8rem', fontWeight: 700, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
    color: error ? '#ef4444' : 'var(--accent)', background: error ? 'rgba(239,68,68,.08)' : 'rgba(0,255,136,.08)',
    border: `1px solid ${error ? 'rgba(239,68,68,.3)' : 'rgba(0,255,136,.3)'}` }}>{texto}</div>
);

const btn = { padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none' };
const chip = (on) => ({
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text-dim)',
  background: on ? 'rgba(0,255,136,.08)' : 'transparent',
});
const select = { width: 'auto', flex: '0 0 auto', padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
const tag = { fontSize: 10, fontWeight: 900, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 4, color: '#fff' };
