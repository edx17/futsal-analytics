import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CartaJugador from '../quinteto/CartaJugador';
import CartaEspecial from '../quinteto/CartaEspecial';
import { SOBRES, MONEDA } from '../../analytics/sobres';
import { esEspecial } from '../../analytics/especialesCartas';
import { ESCENAS_BASE } from '../../analytics/eventos';
import { aplicarAjuste, pendientesDePublicar } from '../../analytics/god';
import { TIPOS_EDITABLES, CON_COSTO, REGLAS_TIPO, normalizarTipo, reglasDeTipo } from '../../analytics/tiposSobre';
import { listarCatalogo, activarCartas, listarAjustes, guardarAjuste, quitarAjuste, leerConfigSobres, guardarConfigSobres } from '../../utils/god';
import { listarFotos, subirFotoEspecial } from '../../utils/cartasFotos';
import { listarHistorial } from '../../utils/cartasDestacadas';
import { publicarCatalogo } from '../../utils/sobres';
import InvitacionesJuego from './InvitacionesJuego';

/* CARTAS Y SOBRES DEL CLUB (la vista simple, para el manager)
 *
 * Lo justo para el día a día, sin números técnicos:
 *   CARTAS  1) confirmar las de la semana y del mes (en MySquad · PREMIOS),
 *           2) publicarlas para los sobres, y por carta: foto, media y
 *              sacarla / volverla a los sobres.
 *   SOBRES  cada sobre: activo o no, nombre, cuántas cartas, precio y
 *           cinemática.
 *   GMAIL   los links para hinchas y quiénes juegan con Gmail.
 * Lo fino (rarezas y pesos, cartas elegidas, colores, eventos, usuarios) está
 * en el Modo GOD del superusuario. Lo de acá lo guarda la base con los
 * permisos del manager (migración 20261028120000_admin_club.sql).
 */

const POR_PAGINA = 24;
const MONO = 'JetBrains Mono, monospace';

export default function PanelClub({ clubId, alCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState('cartas');
  const [datos, setDatos] = useState(null); // { catalogo, ajustes, fotos, historial, config }
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [catalogo, ajustes, fotos, historial, config] = await Promise.all([
        listarCatalogo(clubId), listarAjustes(clubId).catch(() => new Map()), listarFotos(clubId).catch(() => new Map()),
        listarHistorial(clubId).catch(() => []), leerConfigSobres(clubId).catch(() => null),
      ]);
      setDatos({ catalogo, ajustes, fotos, historial, config: config || { suspendidos: [], evento_activo: null, tipos: {} } });
    } catch (err) {
      setAviso({ texto: err?.message || 'No se pudo leer.', error: true });
      setDatos({ catalogo: [], ajustes: new Map(), fotos: new Map(), historial: [], config: { suspendidos: [], tipos: {} } });
    }
  }, [clubId]);

  return (
    <div className="bento-card" style={{ marginTop: 26, padding: 14, border: '1px solid rgba(0,255,136,.35)' }}>
      <button onClick={() => { setAbierto((v) => !v); if (!datos) cargar(); }}
        style={{ width: '100%', background: 'transparent', color: 'var(--accent)', border: 'none', textAlign: 'left', padding: 0, fontWeight: 900, letterSpacing: '.06em', cursor: 'pointer' }}>
        CARTAS Y SOBRES DEL CLUB {abierto ? '▾' : '▸'}
      </button>
      {abierto && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['cartas', 'CARTAS'], ['sobres', 'SOBRES'], ['gmail', 'GMAIL · HINCHAS']].map(([id, t]) => <button key={id} onClick={() => setPestana(id)} style={chip(pestana === id)}>{t}</button>)}
          </div>
          {aviso && <div style={{ ...dim, fontWeight: 800, color: aviso.error ? '#ef4444' : 'var(--accent)' }}>{aviso.texto}</div>}
          {pestana === 'gmail' ? <InvitacionesJuego clubId={clubId} avisar={setAviso} />
            : !datos ? <div style={dim}>Leyendo…</div>
            : pestana === 'cartas' ? <Cartas clubId={clubId} datos={datos} recargar={cargar} avisar={setAviso} />
              : <Sobres clubId={clubId} config={datos.config} recargar={cargar} avisar={setAviso} alCambiar={alCambiar} />}
        </div>
      )}
    </div>
  );
}

/* ── CARTAS ── */
function Cartas({ clubId, datos, recargar, avisar }) {
  const { catalogo, ajustes, fotos, historial } = datos;
  const [filtro, setFiltro] = useState('todas');
  const [buscar, setBuscar] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ocupado, setOcupado] = useState(null);
  const [media, setMedia] = useState(null); // { clave, valor }

  const pendientes = useMemo(() => pendientesDePublicar(historial, catalogo, fotos), [historial, catalogo, fotos]);
  const lista = useMemo(() => catalogo
    .filter((k) => (filtro === 'todas' ? k.activa !== false : filtro === 'especiales' ? k.tipo !== 'BASE' && k.activa !== false : k.activa === false))
    .filter((k) => !buscar || `${k.carta?.apellido} ${k.carta?.nombre}`.toLowerCase().includes(buscar.toLowerCase()))
    .map((k) => ({ ...k, vista: aplicarAjuste({ atributos: [], stats: {}, ...(k.carta || {}), foto: fotos.get(k.clave) || k.carta?.foto }, ajustes.get(k.clave)) })),
  [catalogo, ajustes, fotos, filtro, buscar]);

  const hacer = async (id, fn, ok) => {
    setOcupado(id); avisar(null);
    try { await fn(); await recargar(); avisar({ texto: ok }); } catch (err) { avisar({ texto: err?.message || 'No se pudo.', error: true }); } finally { setOcupado(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* los dos pasos de cada semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        <div style={paso}>
          <div style={rotulo}>1 · CONFIRMAR</div>
          <div style={dim}>Las cartas de la semana y del mes (y las especiales) se confirman en MySquad, en PREMIOS.</div>
          <Link to="/mysquad?seccion=premios" style={{ ...boton, textDecoration: 'none', textAlign: 'center' }}>IR A PREMIOS</Link>
        </div>
        <div style={paso}>
          <div style={rotulo}>2 · PUBLICAR PARA LOS SOBRES</div>
          {pendientes.length ? (
            <>
              <div style={dim}>Hay <b>{pendientes.length}</b> cartas confirmadas que todavía no salen en los sobres.</div>
              <button style={boton} disabled={!!ocupado} onClick={() => hacer('publicar', () => publicarCatalogo(clubId, pendientes), `Se publicaron ${pendientes.length} cartas.`)}>
                {ocupado === 'publicar' ? 'PUBLICANDO…' : `PUBLICAR LAS ${pendientes.length}`}
              </button>
            </>
          ) : <div style={{ ...dim, color: 'var(--accent)', fontWeight: 800 }}>✓ Todo lo confirmado ya está en los sobres.</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['todas', 'EN LOS SOBRES'], ['especiales', 'ESPECIALES'], ['baja', 'SACADAS']].map(([id, t]) => (
          <button key={id} onClick={() => { setFiltro(id); setLimite(POR_PAGINA); }} style={chip(filtro === id)}>{t}</button>
        ))}
        <input value={buscar} onChange={(e) => { setBuscar(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar jugador" style={{ ...campo, width: 170 }} />
        <span style={{ marginLeft: 'auto', ...dim, fontFamily: MONO }}>{lista.length}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
        {lista.slice(0, limite).map((k) => {
          const c = k.vista;
          const fuera = k.activa === false;
          return (
            <div key={k.clave} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: fuera ? 0.5 : 1 }}>
              {esEspecial(k.tipo) ? <CartaEspecial carta={c} tipo={k.tipo} ancho={130} /> : <CartaJugador carta={c} chica />}
              {c.ovrAjustada && <span style={{ ...dim, fontSize: 10 }}>media corregida (era {c.ovrCalculada})</span>}
              {media?.clave === k.clave ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input type="number" min={1} max={99} value={media.valor} onChange={(e) => setMedia({ ...media, valor: e.target.value })} style={{ ...campo, width: 60 }} autoFocus aria-label="Media" />
                  <button style={chipOk} disabled={!!ocupado || !(Number(media.valor) >= 1 && Number(media.valor) <= 99)}
                    onClick={() => { hacer(k.clave, () => guardarAjuste(clubId, k.clave, Math.round(Number(media.valor)), 'Manager'), `Media de ${c.apellido} → ${Math.round(Number(media.valor))}.`); setMedia(null); }}>OK</button>
                  {c.ovrAjustada && <button style={chip(false)} onClick={() => { hacer(k.clave, () => quitarAjuste(clubId, k.clave), 'Vuelve la media calculada.'); setMedia(null); }}>↺</button>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <label style={{ ...chip(false), cursor: 'pointer' }}>FOTO
                    <input type="file" accept="image/*" hidden disabled={!!ocupado} onChange={(e) => {
                      const archivo = e.target.files?.[0]; e.target.value = '';
                      if (archivo) hacer(k.clave, () => subirFotoEspecial({ clubId, clave: k.clave, archivo }), 'Foto guardada.');
                    }} />
                  </label>
                  <button style={chip(false)} disabled={!!ocupado} onClick={() => setMedia({ clave: k.clave, valor: c.ovr ?? '' })}>MEDIA</button>
                  <button style={{ ...chip(false), color: fuera ? 'var(--accent)' : '#ef4444' }} disabled={!!ocupado}
                    onClick={() => hacer(k.clave, () => activarCartas([k.id], fuera), fuera ? 'Vuelve a los sobres.' : 'Sacada de los sobres (quien la tiene la conserva).')}>
                    {fuera ? 'VOLVER' : 'SACAR'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lista.length > limite && <button style={chip(false)} onClick={() => setLimite((l) => l + POR_PAGINA)}>VER MÁS</button>}
    </div>
  );
}

/* ── SOBRES ── */
function Sobres({ clubId, config, recargar, avisar, alCambiar }) {
  const [cfg, setCfg] = useState(() => ({
    suspendidos: [...(config.suspendidos || [])],
    tipos: Object.fromEntries(TIPOS_EDITABLES.map((t) => {
      const r = reglasDeTipo(t, config.tipos?.[t] || {});
      return [t, { nombre: config.tipos?.[t]?.nombre || '', cartas: r.cartas, costo: r.costo, video: config.tipos?.[t]?.escena?.video || '' }];
    })),
  }));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (t, k, v) => setCfg((c) => ({ ...c, tipos: { ...c.tipos, [t]: { ...c.tipos[t], [k]: v } } }));
  const alternar = (t) => setCfg((c) => ({ ...c, suspendidos: c.suspendidos.includes(t) ? c.suspendidos.filter((x) => x !== t) : [...c.suspendidos, t] }));

  const guardar = async () => {
    setGuardando(true); avisar(null);
    try {
      // Lo simple se suma a lo que haya puesto el superusuario (rarezas, colores…), sin pisarlo.
      const tipos = { ...(config.tipos || {}) };
      TIPOS_EDITABLES.forEach((t) => {
        const s = cfg.tipos[t];
        const previo = config.tipos?.[t] || {};
        const escena = { ...(previo.escena || {}), video: s.video || undefined };
        const n = normalizarTipo({ ...previo, nombre: s.nombre, cartas: s.cartas, costo: s.costo, escena }, t);
        if (Object.keys(n).length) tipos[t] = n; else delete tipos[t];
      });
      await guardarConfigSobres(clubId, { suspendidos: cfg.suspendidos, evento_activo: config.evento_activo, ...(config.sinTipos ? {} : { tipos }) });
      avisar({ texto: 'Guardado. Ya rige para todos los del club.' });
      await recargar(); alCambiar?.();
    } catch (err) {
      avisar({ texto: /row-level security|permission/i.test(err?.message || '') ? 'Falta habilitar a los managers en la base (migración 20261028120000_admin_club.sql).' : err?.message || 'No se pudo guardar.', error: true });
    } finally { setGuardando(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {TIPOS_EDITABLES.map((t) => {
        const s = cfg.tipos[t];
        const activo = !cfg.suspendidos.includes(t);
        return (
          <div key={t} style={{ ...paso, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', opacity: activo ? 1 : 0.6 }}>
            <button style={{ ...chip(activo), minWidth: 104, color: activo ? 'var(--accent)' : '#ef4444', borderColor: activo ? 'var(--accent)' : '#ef4444' }} onClick={() => alternar(t)}>
              {activo ? '▶ ACTIVO' : '⏸ SUSPENDIDO'}
            </button>
            <input value={s.nombre} onChange={(e) => cambiar(t, 'nombre', e.target.value)} placeholder={SOBRES[t].nombre} maxLength={40} style={{ ...campo, flex: '1 1 180px' }} aria-label="Nombre del sobre" />
            <label style={etiqueta}>Cartas
              <input type="number" min={REGLAS_TIPO.cartas.min} max={REGLAS_TIPO.cartas.max} value={s.cartas} onChange={(e) => cambiar(t, 'cartas', e.target.value)} style={{ ...campo, width: 58 }} />
            </label>
            {CON_COSTO.has(t) && (
              <label style={etiqueta}>Precio
                <input type="number" min={0} max={REGLAS_TIPO.costo.max} value={s.costo} onChange={(e) => cambiar(t, 'costo', e.target.value)} style={{ ...campo, width: 80 }} />
                <span style={dim}>{MONEDA}</span>
              </label>
            )}
            <select value={s.video} onChange={(e) => cambiar(t, 'video', e.target.value)} style={campo} aria-label="Cinemática">
              <option value="">Cinemática de siempre</option>
              {ESCENAS_BASE.filter((e) => e.id).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
        );
      })}
      <div style={dim}>Qué rarezas salen, cartas elegidas a mano y colores los maneja el superusuario.</div>
      <button style={{ ...boton, alignSelf: 'flex-start' }} disabled={guardando} onClick={guardar}>{guardando ? 'GUARDANDO…' : 'GUARDAR SOBRES'}</button>
    </div>
  );
}

const paso = { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, border: '1px solid var(--border)' };
const boton = { padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none', background: 'var(--accent)', color: '#04120c' };
const chip = (on) => ({
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent)' : 'var(--text-dim)', background: on ? 'rgba(0,255,136,.08)' : 'transparent',
});
const chipOk = { ...chip(true), background: 'var(--accent)', color: '#04120c' };
const campo = { width: 'auto', flex: '0 0 auto', padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const etiqueta = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
