import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CartaJugador from '../components/quinteto/CartaJugador';
import CanchaPerspectiva from '../components/quinteto/CanchaPerspectiva';
import CanchaPlana from '../components/vdraft/CanchaPlana';
import Penales from '../components/vdraft/Penales';
import { FORMACIONES } from '../analytics/quinteto';
import { MONEDA } from '../analytics/sobres';
import {
  COSTO_PARTIDA, FORMACIONES_DRAFT, NOMBRE_SOBRE, RONDAS, pasoDelDraft, marcador, puestoRival,
  lineasDraft, pelotaEn, pseudoAzar,
} from '../analytics/vdraft';
import { estadoVDraft, nuevaPartida, elegirCarta, hacerCambio, jugarPartido, abandonarPartida } from '../utils/vdraft';
import { caminoDePremios, podioDelRanking, destinoDeCarta, avanceDelDraft } from '../analytics/vdraftVista';
import { esModoKiosco, RUTA_KIOSCO } from '../utils/kiosco';
import { GameButton, ProgressBar, Countdown } from '../juegos/ui';
import useFeedback from '../juegos/useFeedback';
import useCuenta from '../juegos/useCuenta';
import { volarCarta } from '../juegos/volar';
import '../components/quinteto/quinteto.css';
import './juegos.css';
import './vdraft.css';

/* V-DRAFT
 *
 * Armá un equipo con las cartas del club (capitán, cinco titulares y dos
 * suplentes) y jugá un torneo contra equipos reales de la liga, de la Primera D
 * a la A. Perdés y se termina; cuantos más partidos ganes, más V-Coins y
 * sobres. Una sola pantalla para el Kiosco (/kiosco/vdraft) y para el cuerpo
 * técnico (/vdraft). Las reglas, el azar y los premios viven en la base.
 */

const MONO = 'JetBrains Mono, monospace';
const aCarta = (c) => (c ? { atributos: [], stats: {}, ...(c.carta || c) } : null);
/* El piso del V-Draft: azul pista, como las canchas de futsal techadas. */
const PISO_PISTA = { pasto: '#1f4675', franja: 'rgba(255,255,255,.045)' };
const SESION_VENCIDA = 'Tu sesión venció. Volvé al menú e ingresá con tu PIN.';

export default function VDraft() {
  const navigate = useNavigate();
  const kiosco = esModoKiosco();
  const { feedback, sound } = useFeedback();
  const [estado, setEstado] = useState(null);
  const [partida, setPartida] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [formacion, setFormacion] = useState('1-2-1');
  const [vivo, setVivo] = useState(null);           // el partido que se está mostrando
  const [cambio, setCambio] = useState(null);       // { lugar } o { banco } elegido para cambiar

  const aplicar = useCallback((r) => {
    setCargando(false);
    if (r.vencida) { setError(SESION_VENCIDA); return; }
    if (r.error) { setError(r.error.message); return; }
    setError(null);
    setEstado(r.data);
    setPartida(r.data.partida);
  }, []);
  const cargar = useCallback(() => estadoVDraft().then(aplicar), [aplicar]);

  useEffect(() => { estadoVDraft().then(aplicar); }, [aplicar]);

  /* Equipo completo (del draft al torneo): suena y vibra. */
  const estadoAntes = useRef(null);
  useEffect(() => {
    const e = partida?.estado || null;
    if (estadoAntes.current === 'draft' && e === 'torneo') feedback('victoria');
    estadoAntes.current = e;
  }, [partida?.estado, feedback]);

  /* Una tanda de penales que quedó a medias (se cerró la app): se retoma directo. */
  const tandaPendiente = partida?.estado === 'torneo' && !!partida?.tanda && !vivo;
  useEffect(() => {
    if (!tandaPendiente) return undefined;
    const t = setTimeout(() => setVivo({ ...partida, ultimo: partida.partidos[partida.partidos.length - 1], directo: true }), 0);
    return () => clearTimeout(t);
  }, [tandaPendiente, partida]);

  /* Cada acción devuelve la partida actualizada. */
  const accion = async (fn) => {
    setOcupado(true);
    setError(null);
    const r = await fn();
    setOcupado(false);
    if (r.vencida) { setError(SESION_VENCIDA); return null; }
    if (r.error) { setError(r.error.message); cargar(); return null; }
    setPartida(r.data);
    return r.data;
  };

  const empezar = () => { feedback('elegir'); return accion(() => nuevaPartida(formacion)); };
  const elegir = (c) => accion(() => elegirCarta(partida.id, c.catalogo_id));
  const jugar = async () => {
    setCambio(null);
    const p = await accion(() => jugarPartido(partida.id));
    if (p?.ultimo) setVivo(p);
  };
  const abandonar = async () => {
    const enDraft = partida.estado === 'draft';
    const aviso = enDraft
      ? 'Si abandonás el draft no hay premio (y la partida del día queda usada). ¿Seguro?'
      : 'Te llevás el premio de lo que ganaste hasta acá. ¿Abandonar el torneo?';
    if (!window.confirm(aviso)) return;
    const p = await accion(() => abandonarPartida(partida.id));
    if (p) setVivo({ ...p, ultimo: null });
  };
  const cerrarVivo = () => {
    setVivo(null);
    if (partida?.estado === 'terminada') { setPartida(null); cargar(); }
  };

  /* Cambios entre partidos: tocás un titular y un suplente (en cualquier orden). */
  const tocarCambio = async (que) => {
    if (partida?.estado !== 'torneo' || ocupado) return;
    const sel = { ...cambio, ...que };
    if (cambio && ('lugar' in que) === ('lugar' in cambio)) { setCambio(que); return; }
    if (!('lugar' in sel) || !('banco' in sel)) { setCambio(que); return; }
    setCambio(null);
    await accion(() => hacerCambio(partida.id, sel.lugar, sel.banco));
  };

  if (cargando) return <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}>Armando el vestuario…</div>;

  return (
    <div className="jg-ui vd">
      <header className="vd-cabeza jg-entra">
        <div>
          <h1 className="vd-titulo">V-DRAFT</h1>
          <p className="vd-bajada">Armá tu equipo con las cartas del club y salí campeón contra la liga.</p>
        </div>
        {estado && <div className="jh-dato"><span>V-COINS</span><b className="jh-oro">{estado.puntos}</b></div>}
      </header>

      {error && (
        <div className="vd-error" role="alert">
          {error}
          {kiosco && error === SESION_VENCIDA && (
            <GameButton variante="secondary" onClick={() => navigate(RUTA_KIOSCO)} style={{ marginLeft: 10 }}>IR AL MENÚ</GameButton>
          )}
        </div>
      )}

      {estado && !partida && (
        <Inicio estado={estado} formacion={formacion} setFormacion={(f) => { sound('click'); setFormacion(f); }} empezar={empezar} ocupado={ocupado} />
      )}

      {partida?.estado === 'draft' && (
        <Draft partida={partida} elegir={elegir} ocupado={ocupado} abandonar={abandonar} sonar={sound} />
      )}

      {partida?.estado === 'torneo' && (
        <Torneo partida={partida} jugar={jugar} ocupado={ocupado} abandonar={abandonar} cambio={cambio} tocarCambio={tocarCambio} />
      )}

      {vivo && <PartidoVivo partida={vivo} onCerrar={cerrarVivo} kiosco={kiosco}
        alDefinirPenales={(p) => { setPartida(p); setVivo({ ...p, directo: true }); }} />}
    </div>
  );
}

/* ── INICIO: formación, entrar, camino de premios y ranking ─────────────── */

function Inicio({ estado, formacion, setFormacion, empezar, ocupado }) {
  const gratis = estado.gratis_hoy;
  const alcanza = gratis || estado.puntos >= estado.costo;
  return (
    <>
      <section className="jg-panel vd-inicio jg-entra" style={{ '--i': 1 }}>
        <h2 className="jg-panel-titulo">ELEGÍ LA FORMACIÓN</h2>
        <div className="vd-formaciones" role="radiogroup" aria-label="Formación">
          {FORMACIONES_DRAFT.map((f) => (
            <button key={f.id} role="radio" aria-checked={formacion === f.id} onClick={() => setFormacion(f.id)}
              className={`vd-formacion${formacion === f.id ? ' vd-on' : ''}`}>
              <MiniCancha formacion={f} />
              <span className="vd-formacion-texto"><b>{f.id}</b><span>{f.nombre}</span></span>
              <small className="vd-formacion-roles">{resumenRoles(f)}</small>
            </button>
          ))}
        </div>
        <p className="vd-explica">
          Capitán entre 5 especiales, después cada lugar entre 4 cartas de su puesto (el último, el comodín, trae una especial)
          y 2 suplentes. Después, 4 partidos contra la liga: Primera D, C, B y A. Si perdés, se termina.
        </p>
        <GameButton grande ancho disabled={!alcanza || ocupado} onClick={empezar} className="vd-empezar">
          {ocupado ? 'ARMANDO…' : gratis ? 'EMPEZAR · GRATIS HOY' : `EMPEZAR · ${COSTO_PARTIDA} ${MONEDA.toUpperCase()}`}
        </GameButton>
        <small className="vd-nota">
          {gratis ? 'Tenés 1 partida gratis por día.'
            : alcanza ? `Ya usaste la gratis de hoy. Las siguientes cuestan ${COSTO_PARTIDA} ${MONEDA}.`
              : <>Ya usaste la gratis de hoy. Te faltan {COSTO_PARTIDA - estado.puntos} {MONEDA} (o volvé en <Countdown />).</>}
        </small>
      </section>

      <section className="jg-panel jg-entra" style={{ '--i': 2 }}>
        <h2 className="jg-panel-titulo">EL CAMINO DE PREMIOS</h2>
        <Camino />
        <small className="vd-nota">Te llevás el premio del último escalón que alcances. Los sobres se abren en <b>Sobres</b>.</small>
      </section>

      <div className="vd-dos">
        <section className="jg-panel jg-entra" style={{ '--i': 3 }}>
          <h2 className="jg-panel-titulo">RANKING DE LA SEMANA</h2>
          <Podio ranking={estado.ranking} />
        </section>

        {estado.ultimas?.length > 0 && (
          <section className="jg-panel jg-entra" style={{ '--i': 4 }}>
            <h2 className="jg-panel-titulo">MIS ÚLTIMAS PARTIDAS</h2>
            {estado.ultimas.map((u, i) => (
              <div key={i} className="vd-premio">
                <span>{u.dia} · {u.formacion} · {u.victorias} {u.victorias === 1 ? 'victoria' : 'victorias'}</span>
                <b>{u.premio?.vcoins ? `+${u.premio.vcoins} VC` : '—'}{u.premio?.sobre ? ' + sobre' : ''}</b>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

const COLOR_ROL = { ARQ: '#fbbf24', CIE: '#38bdf8', ALA: '#00ff88', PIV: '#f472b6' };
const resumenRoles = (f) => {
  const n = {};
  f.lugares.slice(1).forEach((l) => { const r = l.roles.join('/'); n[r] = (n[r] || 0) + 1; });
  return Object.entries(n).map(([r, k]) => `${k} ${r}`).join(' · ');
};

/* Media cancha de futsal (20 × 20 m, el arco propio abajo) con los lugares de la formación. */
function MiniCancha({ formacion }) {
  const linea = { fill: 'none', stroke: 'rgba(255,255,255,.55)', strokeWidth: 0.25 };
  return (
    <svg className="vd-minicancha" viewBox="-1 -1 22 22.6" aria-hidden="true">
      <rect x="-1" y="-1" width="22" height="22.6" rx="1.2" fill="#14335a" />
      <rect x="0" y="0" width="20" height="20" fill="#1f4675" />
      <rect x="0" y="0" width="20" height="20" {...linea} />
      <path d="M 7 0 A 3 3 0 0 0 13 0" {...linea} />
      <path d="M 2.5 20 A 6 6 0 0 1 8.5 14 L 11.5 14 A 6 6 0 0 1 17.5 20" {...linea} />
      <rect x="8.5" y="20" width="3" height="1" fill="rgba(255,255,255,.35)" stroke="#fff" strokeWidth="0.2" />
      {formacion.enlaces.map(([i, j]) => (
        <line key={`${i}-${j}`} x1={formacion.lugares[i].u * 20} y1={formacion.lugares[i].v * 19} x2={formacion.lugares[j].u * 20} y2={formacion.lugares[j].v * 19}
          stroke="rgba(255,255,255,.22)" strokeWidth="0.3" />
      ))}
      {formacion.lugares.map((l, i) => (
        <g key={i} transform={`translate(${l.u * 20} ${l.v * 19})`}>
          <circle r="1.7" fill={COLOR_ROL[l.roles[0]] || '#fff'} stroke="#04110a" strokeWidth="0.35" />
          <text y="0.6" textAnchor="middle" fontSize="1.5" fontWeight="900" fill="#04110a">{l.roles[0][0]}</text>
        </g>
      ))}
    </svg>
  );
}

function Trofeo({ tono }) {
  return (
    <svg className={`vd-trofeo vd-trofeo-${tono}`} viewBox="0 0 48 56" aria-hidden="true">
      <path d="M12 6h24v10a12 12 0 0 1-24 0z" />
      <path d="M12 9H5v4a8 8 0 0 0 8 8M36 9h7v4a8 8 0 0 1-8 8" fill="none" strokeWidth="3" />
      <path d="M21 28h6v9h-6z" />
      <path d="M14 40h20l2 8H12z" />
      <path d="M18 9h3v9a6 6 0 0 1-3-4z" className="vd-trofeo-brillo" />
    </svg>
  );
}

function Camino() {
  return (
    <ol className="vd-camino">
      {caminoDePremios().map((e, i) => (
        <li key={e.victorias} className={`vd-escalon vd-escalon-${e.trofeo} jg-entra`} style={{ '--i': i + 2 }}>
          <Trofeo tono={e.trofeo} />
          <span className="vd-escalon-titulo">{e.titulo}</span>
          <span className="vd-escalon-victorias">{e.victorias} {e.victorias === 1 ? 'victoria' : 'victorias'}</span>
          <b className="vd-escalon-premio">+{e.vcoins} VC</b>
          {e.sobre && <span className="vd-escalon-sobre">+ {e.sobre}</span>}
        </li>
      ))}
    </ol>
  );
}

const inicial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();

function Podio({ ranking }) {
  const { podio, resto, yo } = podioDelRanking(ranking);
  if (!podio.length) return <div className="vd-nota">Nadie jugó esta semana. ¡Estrenalo!</div>;
  return (
    <>
      <div className="vd-podio">
        {podio.map((r) => (
          <div key={r.dueno || r.puesto} className={`vd-podio-lugar vd-podio-${r.puesto}${r.yo ? ' vd-yo' : ''}`}>
            <span className="vd-podio-avatar">{inicial(r.nombre)}</span>
            <b className="vd-podio-nombre">{r.yo ? 'VOS' : r.nombre}</b>
            <small>🏆 {r.campeonatos} · {r.victorias}G</small>
            <div className="vd-podio-base">{r.puesto}</div>
          </div>
        ))}
      </div>
      {resto.length > 0 && (
        <ol className="vd-resto" start={4}>
          {resto.map((r) => (
            <li key={r.dueno || r.puesto} className={r.yo ? 'vd-yo' : ''}>
              <span className="vd-pos">{r.puesto}</span>
              <span className="vd-nombre">{r.yo ? `${r.nombre} (vos)` : r.nombre}</span>
              <span title="Campeonatos">🏆 {r.campeonatos}</span>
              <span title="Partidos ganados" style={{ fontFamily: MONO }}>{r.victorias}G</span>
            </li>
          ))}
        </ol>
      )}
      {yo === null && <small className="vd-nota">Todavía no jugaste esta semana.</small>}
    </>
  );
}

/* ── EL ARMADO ──────────────────────────────────────────────────────────────
   La cancha a la izquierda (o arriba) y las cartas para elegir en un panel
   fijo: al costado en la PC, abajo (plegable) en el celular. La carta que
   elegís vuela al lugar que brilla. */

function Draft({ partida, elegir, ocupado, abandonar, sonar }) {
  const paso = pasoDelDraft(partida);
  const avance = avanceDelDraft(partida);
  const [plegado, setPlegado] = useState(false);
  const claveOferta = (partida.oferta || []).map((c) => c.catalogo_id).join('|');
  const buscarDestino = (c) => {
    const d = destinoDeCarta(partida, c);
    if (!d) return null;
    return 'banco' in d ? document.querySelector(`[data-banco="${d.banco}"]`)
      : document.querySelector(`.vd-cancha-p [data-lugar="${d.lugar}"]`);
  };
  return (
    <div className="vd-armado">
      <div className="vd-armado-cancha">
        <Equipo partida={partida} />
      </div>
      <aside className={`vd-dock${plegado ? ' vd-dock-plegado' : ''}`} aria-label="Cartas para elegir">
        <button className="vd-dock-cab" onClick={() => setPlegado((v) => !v)} aria-expanded={!plegado}>
          <span>
            <b className="vd-paso" key={`t-${claveOferta}`}>{paso?.titulo}</b>
            <small>{paso?.ayuda}</small>
          </span>
          <span className="vd-dock-cuenta">{avance.hechos}/{avance.total}</span>
          <span className="vd-dock-flecha" aria-hidden="true">{plegado ? '▲' : '▼'}</span>
        </button>
        <ProgressBar valor={avance.hechos / avance.total} alto={4} />
        <div className="vd-dock-cuerpo">
          {/* Una oferta nueva se monta de cero: se reparte otra vez y se olvida la elegida. */}
          <Oferta key={claveOferta} oferta={partida.oferta || []} elegir={elegir} ocupado={ocupado}
            capitan={partida.paso === 'capitan'} buscarDestino={buscarDestino} sonar={sonar} />
          <GameButton variante="ghost" onClick={abandonar} disabled={ocupado} className="vd-abandonar">ABANDONAR</GameButton>
        </div>
      </aside>
    </div>
  );
}

/* Las cartas se reparten dadas vuelta y giran de a una. Al elegir, la elegida
   vuela a su lugar y las otras se van; recién ahí se le avisa a la base. */
function Oferta({ oferta, elegir, ocupado, capitan, buscarDestino, sonar }) {
  const [elegida, setElegida] = useState(null);
  const [volando, setVolando] = useState(false);
  const tocar = async (c, boton) => {
    if (elegida || ocupado) return;
    setElegida(c.catalogo_id);
    sonar('elegir');
    const carta = boton.querySelector('.mq-carta') || boton;
    const vuelo = volarCarta(carta, buscarDestino(c));
    setVolando(true);
    const quitar = await vuelo;
    await elegir(c);
    quitar();
  };
  return (
    <div className={`vd-oferta${capitan ? ' vd-oferta-capitan' : ''}`}>
      {oferta.map((c, i) => {
        const estado = !elegida ? '' : elegida === c.catalogo_id ? ` vd-opcion-elegida${volando ? ' vd-volando' : ''}` : ' vd-opcion-descartada';
        return (
          <button key={c.catalogo_id} className={`vd-opcion${estado}`} disabled={ocupado || !!elegida} onClick={(e) => tocar(c, e.currentTarget)}
            style={{ animationDelay: `${i * 0.11}s` }}>
            <div className="vd-carta-grande">
              <CartaJugador carta={aCarta(c)} />
              {c.nueva && <span className="vd-nueva">NUEVA</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* La cancha de MySquad (en perspectiva, con las medidas del futsal) con las
   líneas de química, y el banco. En el torneo, tocás un titular y un suplente
   para cambiarlos. */
function Equipo({ partida, cambio, tocarCambio }) {
  const forma = FORMACIONES[partida.formacion];
  const f = partida.fuerza || {};
  const enTorneo = partida.estado === 'torneo';
  const alineacion = (partida.equipo || []).map(aCarta);
  const lineas = lineasDraft(partida.equipo || [], forma);
  const seleccionado = enTorneo ? (cambio && 'lugar' in cambio ? cambio.lugar : null)
    : (partida.paso === 'lugar' || partida.paso === 'capitan' ? partida.lugar_actual : null);
  const capitan = (partida.equipo || []).findIndex((c) => c && c.catalogo_id === partida.capitan);
  return (
    <section className="jg-panel vd-equipo">
      <div className="vd-numeros">
        <Numero rotulo="FUERZA" valor={f.fuerza} decimales={1} />
        <Numero rotulo="MEDIA" valor={f.media} decimales={1} />
        <Numero rotulo="QUÍMICA" valor={f.quimica ?? 0} de={100} barra />
      </div>
      <div className="vd-cancha-p" data-cap={capitan}>
        <CanchaPerspectiva formacion={forma} alineacion={alineacion} lineas={lineas} seleccionado={seleccionado} tema={PISO_PISTA}
          onElegir={enTorneo ? (i) => tocarCambio({ lugar: i }) : undefined} />
      </div>
      <h3 className="vd-rotulo" style={{ marginTop: 10 }}>BANCO{enTorneo ? ' · tocá un titular y un suplente para cambiarlos' : ''}</h3>
      <div className="vd-banco">
        {[0, 1].map((j) => {
          const c = partida.banco?.[j];
          return c ? (
            <div key={j} data-banco={j} className={`vd-envoltura vd-aparece${cambio && cambio.banco === j ? ' vd-elegido' : ''}`}>
              <CartaJugador carta={aCarta(c)} chica onClick={enTorneo ? () => tocarCambio({ banco: j }) : undefined} />
            </div>
          ) : <div key={j} data-banco={j} className={`vd-vacio vd-vacio-banco${partida.paso === 'banco' && (partida.banco?.length || 0) === j ? ' vd-actual' : ''}`}>SUP</div>;
        })}
      </div>
    </section>
  );
}

/* Un número del equipo que cuenta hasta su valor nuevo y muestra cuánto subió. */
function Numero({ rotulo, valor, decimales = 0, de, barra = false }) {
  const n = valor == null ? NaN : Number(valor);
  const v = useCuenta(Number.isFinite(n) ? n : 0);
  const [antes, setAntes] = useState(n);
  const [delta, setDelta] = useState(null);
  if (Number.isFinite(n) && n !== antes) {
    setDelta(Number.isFinite(antes) ? n - antes : null);
    setAntes(n);
  }
  const texto = Number.isFinite(n) ? v.toFixed(decimales) : '—';
  return (
    <div className="vd-numero">
      <div className="vd-rotulo">{rotulo}</div>
      <div className="vd-numero-valor">
        {texto}{de ? <small>/{de}</small> : null}
        {delta > 0 && <em key={`${rotulo}-${n}`} className="vd-delta">+{Number(delta.toFixed(decimales))}</em>}
      </div>
      {barra && <div className="vd-barra"><i style={{ width: `${Math.max(0, Math.min(100, (v / (de || 100)) * 100))}%` }} /></div>}
    </div>
  );
}

/* ── TORNEO ─────────────────────────────────────────────────────────────── */

function Torneo({ partida, jugar, ocupado, abandonar, cambio, tocarCambio }) {
  const n = partida.partidos?.length || 0;
  const proximo = partida.rivales?.[n];
  return (
    <>
      {n === 0 && <div className="vd-completo" role="status">¡EQUIPO COMPLETO!{partida.fuerza?.fuerza != null && ` · FUERZA ${partida.fuerza.fuerza}`}</div>}
      <div className="bento-card vd-panel">
        <div className="vd-rotulo">EL CAMINO</div>
        <div className="vd-llave">
          {(partida.rivales || []).map((r, i) => {
            const jugado = partida.partidos?.[i];
            return (
              <div key={i} className={`vd-ronda${i === n ? ' vd-proxima' : ''}${jugado ? (jugado.gano ? ' vd-gano' : ' vd-perdio') : ''}`}
                style={{ animationDelay: `${i * 0.12}s` }}>
                <div className="vd-ronda-nombre">{r.ronda || RONDAS[i]}</div>
                <div className="vd-ronda-rival">{r.equipo}</div>
                <div className="vd-ronda-dato">{puestoRival(r)} · fuerza {r.fuerza}</div>
                {jugado && <div className="vd-ronda-resultado">{jugado.gano ? 'GANASTE' : 'PERDISTE'} {marcador(jugado)}</div>}
              </div>
            );
          })}
        </div>
        {proximo && (
          <button className="vd-btn vd-btn-jugar" onClick={jugar} disabled={ocupado} style={{ width: '100%', marginTop: 12 }}>
            {ocupado ? 'JUGANDO…' : `JUGAR ${proximo.ronda} · VS ${proximo.equipo.toUpperCase()}`}
          </button>
        )}
      </div>
      <Equipo partida={partida} cambio={cambio} tocarCambio={tocarCambio} />
      <div style={{ textAlign: 'center' }}>
        <button className="vd-btn vd-btn-sec" onClick={abandonar} disabled={ocupado}>
          {n > 0 ? 'RETIRARME CON LO GANADO' : 'ABANDONAR'}
        </button>
      </div>
    </>
  );
}

/* ── EL PARTIDO ─────────────────────────────────────────────────────────────
   1. La previa: mi equipo contra el rival, con sus fuerzas.
   2. El reloj corre (40'), la pelota se mueve por la cancha y en cada gol se
      frena: la pelota entra al arco, se ilumina la red y aparece el cartel.
   3. El final: ganaste (papelitos) o perdiste; si terminó el torneo, el premio. */

const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const PAUSA_GOL = 1300;
const TICK = 120;

function PartidoVivo({ partida, onCerrar, kiosco, alDefinirPenales }) {
  const p = partida.ultimo;
  const sinMovimiento = reducido();
  // `directo`: sin el partido de nuevo (se retoma una tanda, o se acaba de definir).
  const [fase, setFase] = useState(() => (!p || sinMovimiento || partida.directo ? 'fin' : 'previa'));
  const [minuto, setMinuto] = useState(() => (!p || sinMovimiento || partida.directo ? 40 : 0));
  const goles = useMemo(() => p?.goles || [], [p]);
  const semilla = goles.length * 7 + (p?.goles_propios || 0) * 3 + (p?.rival?.length || 0);

  useEffect(() => {
    if (fase === 'previa') {
      const t = setTimeout(() => setFase('juego'), 1800);
      return () => clearTimeout(t);
    }
    if (fase !== 'juego') return undefined;
    if (minuto >= 40) {
      const t = setTimeout(() => setFase('fin'), 500);
      return () => clearTimeout(t);
    }
    const hayGol = goles.some((g) => g.minuto === minuto);
    const t = setTimeout(() => setMinuto((m) => m + 1), hayGol ? PAUSA_GOL : TICK);
    return () => clearTimeout(t);
  }, [fase, minuto, goles]);

  const saltar = () => { setMinuto(40); setFase('fin'); };
  const terminado = fase === 'fin';
  const vistos = goles.filter((g) => g.minuto <= minuto);
  const gp = vistos.filter((g) => g.equipo === 'propio').length;
  const gr = vistos.length - gp;
  const golAhora = fase === 'juego' ? goles.filter((g) => g.minuto === minuto) : [];
  const pelota = pelotaEn(fase === 'juego' ? minuto : -1, fase === 'juego' ? goles : [], semilla);
  const fin = partida.estado === 'terminada';
  const premio = partida.premio;
  const campeon = fin && partida.victorias >= 3;
  // Empate: la tanda la juega el jugador.
  const penalesPendientes = terminado && !!p?.pendiente && !!partida.tanda;

  return (
    <div className={`vd-escena${golAhora.some((g) => g.equipo === 'rival') ? ' vd-temblor' : ''}`}>
      {p && fase === 'previa' && (
        <div className="vd-previa">
          <div className="vd-escena-ronda">{p.ronda}</div>
          <div className="vd-vs">
            <div className="vd-vs-lado vd-vs-izq"><span>MI EQUIPO</span><b>{p.fuerza_propia}</b><em>fuerza</em></div>
            <div className="vd-vs-x">VS</div>
            <div className="vd-vs-lado vd-vs-der"><span>{p.rival.toUpperCase()}</span><b>{p.fuerza_rival}</b><em>Primera {p.division}</em></div>
          </div>
        </div>
      )}

      {p && fase !== 'previa' && (
        <>
          <div className="vd-escena-ronda">{p.ronda}</div>
          <div className="vd-marcador">
            <div><span>MI EQUIPO</span><b key={`p${gp}`} className="vd-salta">{gp}</b></div>
            <div className="vd-reloj">{terminado ? 'FINAL' : `${minuto}'`}</div>
            <div><span>{p.rival.toUpperCase()}</span><b key={`r${gr}`} className="vd-salta">{gr}</b></div>
          </div>
          <div className="vd-tiempo"><i style={{ width: `${(minuto / 40) * 100}%` }} /></div>
          <div className="vd-plana-caja">
            <CanchaPlana pelota={terminado ? null : pelota} gol={golAhora[0]?.equipo} />
            {golAhora.map((g, i) => (
              <div key={`${g.minuto}-${g.equipo}-${i}`}className={`vd-cartel vd-cartel-${g.equipo}`}>
                <b>{g.equipo === 'propio' ? '¡GOOOL!' : `GOL DE ${p.rival.toUpperCase()}`}</b>
                {g.equipo === 'propio' && <span>{g.autor}{g.asistencia ? ` · asist. ${g.asistencia}` : ''}</span>}
              </div>
            ))}
          </div>
          <div className="vd-goles">
            {vistos.map((g, i) => (
              <div key={i} className={`vd-gol vd-gol-${g.equipo}`}>
                <span style={{ fontFamily: MONO }}>{g.minuto}'</span>
                {g.equipo === 'propio'
                  ? <span>⚽ {g.autor}{g.asistencia ? <em> · asist. {g.asistencia}</em> : null}</span>
                  : <span>⚽ {p.rival}</span>}
              </div>
            ))}
          </div>
          {penalesPendientes && <Penales partida={partida} rival={p.rival} alDefinir={alDefinirPenales} />}
          {terminado && !penalesPendientes && p.penales && <div className="vd-penales">Empate · penales {p.penales}</div>}
          {terminado && !penalesPendientes && <div className={`vd-veredicto ${p.gano ? 'vd-si' : 'vd-no'}`}>{p.gano ? '¡GANASTE!' : 'PERDISTE'}</div>}
        </>
      )}

      {terminado && !penalesPendientes && p?.gano && !sinMovimiento && <Papelitos dorados={campeon} semilla={semilla} />}

      {terminado && fin && premio && (
        <div className={`vd-final${campeon ? ' vd-final-campeon' : ''}`}>
          {campeon && <div className="vd-copa">🏆</div>}
          <div className="vd-rotulo" style={{ color: '#9ca3af' }}>
            {partida.victorias >= 4 ? 'CAMPEÓN DE CAMPEONES' : partida.victorias === 3 ? 'CAMPEÓN' : 'FIN DEL TORNEO'} · {partida.victorias} {partida.victorias === 1 ? 'victoria' : 'victorias'}
          </div>
          <div className="vd-final-premio">{premio.vcoins ? `+${premio.vcoins} ${MONEDA}` : 'Sin premio esta vez'}</div>
          {premio.sobre && (
            <div style={{ color: '#fbbf24', fontWeight: 900, marginTop: 6 }}>
              + {NOMBRE_SOBRE[premio.sobre]} · <Link to={kiosco ? '/kiosco/sobres' : '/sobres'} style={{ color: '#fbbf24' }}>abrilo en Sobres</Link>
            </div>
          )}
        </div>
      )}

      <div className="vd-escena-pie">
        {penalesPendientes ? null : terminado
          ? <button className="vd-btn" onClick={onCerrar}>{fin ? 'LISTO' : 'SEGUIR'}</button>
          : <button className="vd-btn vd-btn-sec" onClick={saltar}>SALTAR</button>}
      </div>
    </div>
  );
}

const COLORES = ['#00ff88', '#ffffff', '#38bdf8', '#a7f3d0'];
const COLORES_ORO = ['#fbbf24', '#fde68a', '#f59e0b', '#ffffff', '#c084fc'];

function Papelitos({ dorados, semilla }) {
  const colores = dorados ? COLORES_ORO : COLORES;
  return (
    <div className="vd-papelitos" aria-hidden="true">
      {Array.from({ length: dorados ? 90 : 50 }, (_, i) => {
        const r = (k) => pseudoAzar(semilla * 31 + i * 5 + k);
        return (
          <i key={i} style={{
            left: `${r(0) * 100}%`, background: colores[i % colores.length], width: 6 + r(1) * 6,
            animationDuration: `${2.4 + r(2) * 2}s`, animationDelay: `${r(3) * 1.2}s`,
            '--dx': `${(r(4) - 0.5) * 160}px`, '--giro': `${360 + r(5) * 720}deg`,
          }} />
        );
      })}
    </div>
  );
}
