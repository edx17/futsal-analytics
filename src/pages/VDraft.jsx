import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CartaJugador from '../components/quinteto/CartaJugador';
import { FORMACIONES } from '../analytics/quinteto';
import { MONEDA } from '../analytics/sobres';
import {
  COSTO_PARTIDA, FORMACIONES_DRAFT, PREMIOS, NOMBRE_SOBRE, RONDAS, pasoDelDraft, marcador, puestoRival,
} from '../analytics/vdraft';
import { estadoVDraft, nuevaPartida, elegirCarta, hacerCambio, jugarPartido, abandonarPartida } from '../utils/vdraft';
import { esModoKiosco, RUTA_KIOSCO } from '../utils/kiosco';
import '../components/quinteto/quinteto.css';
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
const SESION_VENCIDA = 'Tu sesión venció. Volvé al menú e ingresá con tu PIN.';

export default function VDraft() {
  const navigate = useNavigate();
  const kiosco = esModoKiosco();
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

  const empezar = () => accion(() => nuevaPartida(formacion));
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
    <div className="vd" style={{ padding: kiosco ? '16px 16px 90px' : '0 0 80px' }}>
      <div className="vd-cabeza">
        <div>
          <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>V-DRAFT</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            Armá tu equipo con las cartas del club y salí campeón contra la liga.
          </div>
        </div>
        {estado && <div className="vd-monedas"><b>{estado.puntos}</b> {MONEDA}</div>}
      </div>

      {error && (
        <div className="vd-error">
          {error}
          {kiosco && error === SESION_VENCIDA && (
            <button onClick={() => navigate(RUTA_KIOSCO)} className="vd-btn vd-btn-sec" style={{ marginLeft: 10 }}>IR AL MENÚ</button>
          )}
        </div>
      )}

      {estado && !partida && (
        <Inicio estado={estado} formacion={formacion} setFormacion={setFormacion} empezar={empezar} ocupado={ocupado} />
      )}

      {partida?.estado === 'draft' && (
        <Draft partida={partida} elegir={elegir} ocupado={ocupado} abandonar={abandonar} />
      )}

      {partida?.estado === 'torneo' && (
        <Torneo partida={partida} jugar={jugar} ocupado={ocupado} abandonar={abandonar} cambio={cambio} tocarCambio={tocarCambio} />
      )}

      {vivo && <PartidoVivo partida={vivo} onCerrar={cerrarVivo} kiosco={kiosco} />}
    </div>
  );
}

/* ── INICIO: elegir formación, entrar, premios y ranking ─────────────────── */

function Inicio({ estado, formacion, setFormacion, empezar, ocupado }) {
  const gratis = estado.gratis_hoy;
  const alcanza = gratis || estado.puntos >= estado.costo;
  return (
    <>
      <div className="bento-card vd-panel">
        <div className="vd-rotulo">1 · ELEGÍ LA FORMACIÓN</div>
        <div className="vd-formaciones">
          {FORMACIONES_DRAFT.map((f) => (
            <button key={f.id} onClick={() => setFormacion(f.id)} className={`vd-formacion${formacion === f.id ? ' vd-on' : ''}`}>
              <MiniCancha formacion={f} />
              <b>{f.id}</b><span>{f.nombre}</span>
            </button>
          ))}
        </div>
        <div className="vd-rotulo" style={{ marginTop: 16 }}>2 · ARMÁ EL EQUIPO Y JUGÁ</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.5 }}>
          Elegís el capitán entre 5 cartas especiales, después cada lugar entre 4 cartas de su puesto y 2 suplentes.
          Después, 4 partidos contra equipos de la liga: Primera D, C, B y A. Si perdés, se termina.
        </div>
        <button className="vd-btn" disabled={!alcanza || ocupado} onClick={empezar} style={{ width: '100%' }}>
          {ocupado ? 'ARMANDO…' : gratis ? 'EMPEZAR · GRATIS HOY' : `EMPEZAR · ${COSTO_PARTIDA} ${MONEDA.toUpperCase()}`}
        </button>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>
          {gratis ? 'Tenés 1 partida gratis por día.'
            : alcanza ? `Ya usaste la gratis de hoy. Las siguientes cuestan ${COSTO_PARTIDA} ${MONEDA}.`
              : `Ya usaste la gratis de hoy. Te faltan ${COSTO_PARTIDA - estado.puntos} ${MONEDA} para otra (o volvé mañana).`}
        </div>
      </div>

      <div className="vd-dos">
        <div className="bento-card vd-panel">
          <div className="vd-rotulo">PREMIOS</div>
          {PREMIOS.map((p) => (
            <div key={p.victorias} className="vd-premio">
              <span>{p.victorias} {p.victorias === 1 ? 'victoria' : 'victorias'}{p.victorias === 3 ? ' · CAMPEÓN' : p.victorias === 4 ? ' · CAMPEÓN DE CAMPEONES' : ''}</span>
              <b>+{p.vcoins} VC{p.sobre ? ' + sobre' : ''}</b>
            </div>
          ))}
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 6 }}>
            Los sobres que ganes se abren en <b>Sobres</b>.
          </div>
        </div>

        <div className="bento-card vd-panel">
          <div className="vd-rotulo">RANKING DE LA SEMANA</div>
          {estado.ranking?.length ? estado.ranking.map((r, i) => (
            <div key={r.dueno} className={`vd-ranking${r.yo ? ' vd-yo' : ''}`}>
              <span className="vd-pos">{i + 1}</span>
              <span className="vd-nombre">{r.nombre}</span>
              <span title="Campeonatos">🏆 {r.campeonatos}</span>
              <span title="Partidos ganados" style={{ fontFamily: MONO }}>{r.victorias}G</span>
            </div>
          )) : <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Nadie jugó esta semana. ¡Estrenalo!</div>}
        </div>
      </div>

      {estado.ultimas?.length > 0 && (
        <div className="bento-card vd-panel">
          <div className="vd-rotulo">MIS ÚLTIMAS PARTIDAS</div>
          {estado.ultimas.map((u, i) => (
            <div key={i} className="vd-premio">
              <span>{u.dia} · {u.formacion} · {u.victorias} {u.victorias === 1 ? 'victoria' : 'victorias'}</span>
              <b>{u.premio?.vcoins ? `+${u.premio.vcoins} VC` : '—'}{u.premio?.sobre ? ' + sobre' : ''}</b>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function MiniCancha({ formacion }) {
  return (
    <div className="vd-minicancha">
      {formacion.lugares.map((l, i) => (
        <i key={i} style={{ left: `${l.u * 100}%`, top: `${l.v * 88 + 4}%` }} />
      ))}
    </div>
  );
}

/* ── DRAFT ──────────────────────────────────────────────────────────────── */

function Draft({ partida, elegir, ocupado, abandonar }) {
  const paso = pasoDelDraft(partida);
  return (
    <>
      <Equipo partida={partida} />
      <div className="bento-card vd-panel">
        <div className="vd-paso">{paso?.titulo}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 14 }}>{paso?.ayuda}</div>
        <div className="vd-oferta">
          {(partida.oferta || []).map((c) => (
            <button key={c.catalogo_id} className="vd-opcion" disabled={ocupado} onClick={() => elegir(c)}>
              <div className="vd-carta-grande"><CartaJugador carta={aCarta(c)} /></div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <button className="vd-btn vd-btn-sec" onClick={abandonar} disabled={ocupado}>ABANDONAR</button>
      </div>
    </>
  );
}

/* La cancha con los cinco lugares y el banco. En el torneo, tocás un titular
   y un suplente para cambiarlos. */
function Equipo({ partida, cambio, tocarCambio }) {
  const forma = FORMACIONES[partida.formacion];
  const f = partida.fuerza || {};
  const enTorneo = partida.estado === 'torneo';
  return (
    <div className="bento-card vd-panel">
      <div className="vd-numeros">
        <Numero rotulo="FUERZA" valor={f.fuerza ?? '—'} />
        <Numero rotulo="MEDIA" valor={f.media ?? '—'} />
        <Numero rotulo="QUÍMICA" valor={`${f.quimica ?? 0}/100`} />
      </div>
      <div className="vd-cancha">
        {forma.lugares.map((l, i) => {
          const c = partida.equipo?.[i];
          const actual = partida.estado === 'draft' && partida.lugar_actual === i;
          const elegido = cambio && cambio.lugar === i;
          return (
            <div key={i} className="vd-lugar" style={{ left: `${l.u * 100}%`, top: `${14 + ((l.v - 0.27) / 0.72) * 72}%` }}>
              {c ? (
                <div className={`vd-envoltura${elegido ? ' vd-elegido' : ''}`}>
                  <CartaJugador carta={aCarta(c)} chica onClick={enTorneo ? () => tocarCambio({ lugar: i }) : undefined}
                    fueraDePuesto={!l.roles.includes(c.carta?.rol)} />
                  {c.catalogo_id === partida.capitan && <span className="vd-capitan">C</span>}
                  {!l.roles.includes(c.carta?.rol) && <span className="vd-fuera">FUERA DE PUESTO</span>}
                </div>
              ) : (
                <div className={`vd-vacio${actual ? ' vd-actual' : ''}`}>{l.roles.join('/')}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="vd-rotulo" style={{ marginTop: 10 }}>BANCO{enTorneo ? ' · tocá un titular y un suplente para cambiarlos' : ''}</div>
      <div className="vd-banco">
        {[0, 1].map((j) => {
          const c = partida.banco?.[j];
          return c ? (
            <div key={j} className={`vd-envoltura${cambio && cambio.banco === j ? ' vd-elegido' : ''}`}>
              <CartaJugador carta={aCarta(c)} chica onClick={enTorneo ? () => tocarCambio({ banco: j }) : undefined} />
            </div>
          ) : <div key={j} className={`vd-vacio vd-vacio-banco${partida.paso === 'banco' && (partida.banco?.length || 0) === j ? ' vd-actual' : ''}`}>SUP</div>;
        })}
      </div>
    </div>
  );
}

function Numero({ rotulo, valor }) {
  return (
    <div className="vd-numero">
      <div className="vd-rotulo">{rotulo}</div>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, color: 'var(--accent)' }}>{valor}</div>
    </div>
  );
}

/* ── TORNEO ─────────────────────────────────────────────────────────────── */

function Torneo({ partida, jugar, ocupado, abandonar, cambio, tocarCambio }) {
  const n = partida.partidos?.length || 0;
  const proximo = partida.rivales?.[n];
  return (
    <>
      <div className="bento-card vd-panel">
        <div className="vd-rotulo">EL CAMINO</div>
        <div className="vd-llave">
          {(partida.rivales || []).map((r, i) => {
            const jugado = partida.partidos?.[i];
            return (
              <div key={i} className={`vd-ronda${i === n ? ' vd-proxima' : ''}${jugado ? (jugado.gano ? ' vd-gano' : ' vd-perdio') : ''}`}>
                <div className="vd-ronda-nombre">{r.ronda || RONDAS[i]}</div>
                <div className="vd-ronda-rival">{r.equipo}</div>
                <div className="vd-ronda-dato">{puestoRival(r)} · fuerza {r.fuerza}</div>
                {jugado && <div className="vd-ronda-resultado">{jugado.gano ? 'GANASTE' : 'PERDISTE'} {marcador(jugado)}</div>}
              </div>
            );
          })}
        </div>
        {proximo && (
          <button className="vd-btn" onClick={jugar} disabled={ocupado} style={{ width: '100%', marginTop: 12 }}>
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

/* ── EL PARTIDO: el reloj corre y los goles van cayendo ─────────────────── */

const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function PartidoVivo({ partida, onCerrar, kiosco }) {
  const p = partida.ultimo;
  const [minuto, setMinuto] = useState(() => (!p || reducido() ? 40 : 0));

  useEffect(() => {
    if (minuto >= 40) return undefined;
    const t = setTimeout(() => setMinuto((m) => Math.min(40, m + 1)), 110);
    return () => clearTimeout(t);
  }, [minuto]);

  const terminado = minuto >= 40;
  const goles = (p?.goles || []).filter((g) => g.minuto <= minuto);
  const gp = goles.filter((g) => g.equipo === 'propio').length;
  const gr = goles.length - gp;
  const fin = partida.estado === 'terminada';
  const premio = partida.premio;

  return (
    <div className="vd-escena">
      {p && (
        <>
          <div className="vd-escena-ronda">{p.ronda}</div>
          <div className="vd-marcador">
            <div><span>MI EQUIPO</span><b>{gp}</b></div>
            <div className="vd-reloj">{terminado ? 'FINAL' : `${minuto}'`}</div>
            <div><span>{p.rival.toUpperCase()}</span><b>{gr}</b></div>
          </div>
          <div className="vd-goles">
            {goles.map((g, i) => (
              <div key={i} className={`vd-gol vd-gol-${g.equipo}`}>
                <span style={{ fontFamily: MONO }}>{g.minuto}'</span>
                {g.equipo === 'propio'
                  ? <span>⚽ {g.autor}{g.asistencia ? <em> · asist. {g.asistencia}</em> : null}</span>
                  : <span>⚽ {p.rival}</span>}
              </div>
            ))}
          </div>
          {terminado && p.penales && <div className="vd-penales">Empate · penales {p.penales}</div>}
          {terminado && <div className={`vd-veredicto ${p.gano ? 'vd-si' : 'vd-no'}`}>{p.gano ? '¡GANASTE!' : 'PERDISTE'}</div>}
        </>
      )}

      {terminado && fin && premio && (
        <div className="vd-final">
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

      {terminado && (
        <button className="vd-btn" onClick={onCerrar} style={{ marginTop: 22 }}>{fin ? 'LISTO' : 'SEGUIR'}</button>
      )}
      {!terminado && <button className="vd-btn vd-btn-sec" onClick={() => setMinuto(40)} style={{ marginTop: 22 }}>SALTAR</button>}
    </div>
  );
}
