import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CartaJugador from '../components/quinteto/CartaJugador';
import { MONEDA } from '../analytics/sobres';
import {
  FORMACIONES_DUELO, APUESTAS, lugaresDe, lugarLibre, opcionesParaLugar, ponerCarta, fuerzaDuelo, equipoCompleto,
  mejorEquipo, venceEn, textoResultado,
} from '../analytics/duelos';
import { estadoDuelos, retar, responder, rechazar, marcarVisto } from '../utils/duelos';
import { coleccionSobres } from '../utils/sobres';
import { esModoKiosco, RUTA_KIOSCO } from '../utils/kiosco';
import { GameButton } from '../juegos/ui';
import useFeedback from '../juegos/useFeedback';
import '../components/quinteto/quinteto.css';
import './juegos.css';
import './duelos.css';

/* DUELO DE CARTAS
 *
 * Retás a otro del club con 5 cartas de tu colección (arquero + 4 de campo)
 * y, si querés, una apuesta. El otro arma su equipo sin ver el tuyo; al
 * aceptar se juega el partido (la misma simulación del V-Draft) y, si
 * empatan, penales. Todo se decide en la base (migración
 * 20261113120000_juegos_duelos.sql); acá se arma el equipo y se muestra.
 */

const SESION_VENCIDA = 'Tu sesión venció. Volvé al menú e ingresá con tu PIN.';
const aCarta = (c) => (c ? { atributos: [], stats: {}, ...(c.carta || c) } : null);
const NOMBRE_ROL = { ARQ: 'ARQUERO', CIE: 'CIERRE', ALA: 'ALA', PIV: 'PIVOT' };

export default function Duelos() {
  const navigate = useNavigate();
  const kiosco = esModoKiosco();
  const { feedback, sound } = useFeedback();
  const [estado, setEstado] = useState(null);
  const [coleccion, setColeccion] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [pestana, setPestana] = useState('retar');
  const [armando, setArmando] = useState(null);     // { modo: 'retar' | 'responder', rival?, duelo? }
  const [viendo, setViendo] = useState(null);       // un duelo jugado

  const cargar = useCallback(async () => {
    const r = await estadoDuelos();
    if (r.vencida) { setError(SESION_VENCIDA); return; }
    if (r.error) { setError(r.error.message); return; }
    setError(null);
    setEstado(r.data);
  }, []);
  useEffect(() => {
    let vivo = true;
    estadoDuelos().then((r) => {
      if (!vivo) return;
      if (r.vencida) setError(SESION_VENCIDA);
      else if (r.error) setError(r.error.message);
      else { setEstado(r.data); if (r.data.recibidos?.length) setPestana('retos'); }
    });
    coleccionSobres().then((r) => { if (vivo) setColeccion(r.data?.cartas || []); });
    return () => { vivo = false; };
  }, []);

  const hacer = async (fn) => {
    setOcupado(true); setError(null);
    const r = await fn();
    setOcupado(false);
    if (r.vencida) { setError(SESION_VENCIDA); return null; }
    if (r.error) { setError(r.error.message); return null; }
    return r.data;
  };

  const confirmar = async (formacion, equipo, apuesta) => {
    const ids = equipo.map((c) => c.catalogo_id);
    if (armando.modo === 'retar') {
      const d = await hacer(() => retar(armando.rival.dueno, formacion, ids, apuesta));
      if (!d) return;
      feedback('elegir');
      setArmando(null); setPestana('retos');
      await cargar();
    } else {
      const d = await hacer(() => responder(armando.duelo.id, formacion, ids));
      if (!d) return;
      feedback(d.resultado?.gane ? 'victoria' : 'derrota');
      setArmando(null); setViendo(d);
      await cargar();
    }
  };

  const bajarse = async (d) => {
    const pregunta = d.soy === 'retador' ? '¿Cancelar el reto? Se te devuelve la apuesta.' : '¿Rechazar el duelo?';
    if (!window.confirm(pregunta)) return;
    if (await hacer(() => rechazar(d.id))) { sound('click'); cargar(); }
  };

  const ver = (d) => {
    setViendo(d);
    if (d.nuevo) { marcarVisto(d.id).then(cargar); }
  };

  if (!estado && !error) return <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}>Buscando rivales…</div>;

  return (
    <div className="jg-ui du">
      <header className="du-cabeza jg-entra">
        <div>
          <h1 className="du-titulo">DUELOS</h1>
          <p className="du-bajada">Retá a otro del club con 5 cartas de tu colección. El que arma mejor, gana.</p>
        </div>
        {estado && <div className="jh-dato"><span>V-COINS</span><b className="jh-oro">{estado.puntos}</b></div>}
      </header>

      {error && (
        <div className="du-error" role="alert">
          {error}
          {kiosco && error === SESION_VENCIDA && <GameButton variante="secondary" onClick={() => navigate(RUTA_KIOSCO)} style={{ marginLeft: 10 }}>IR AL MENÚ</GameButton>}
        </div>
      )}

      {estado && viendo && <Resultado d={viendo} onCerrar={() => setViendo(null)} />}

      {estado && !viendo && armando && (
        <Armado modo={armando.modo} rival={armando.rival?.nombre || armando.duelo?.otro} duelo={armando.duelo}
          coleccion={coleccion} puntos={estado.puntos} ocupado={ocupado} sonar={sound}
          onConfirmar={confirmar} onVolver={() => setArmando(null)} />
      )}

      {estado && !viendo && !armando && (
        <>
          <div className="du-pestanas" role="tablist">
            {[['retar', 'RETAR'], ['retos', `RETOS${estado.recibidos.length ? ` · ${estado.recibidos.length}` : ''}`], ['historial', 'HISTORIAL']].map(([id, t]) => (
              <button key={id} role="tab" aria-selected={pestana === id} className={`du-pestana${pestana === id ? ' du-on' : ''}`}
                onClick={() => { sound('click'); setPestana(id); }}>
                {t}{id === 'historial' && estado.historial.some((d) => d.nuevo) && <i className="du-punto" aria-label="hay resultados nuevos" />}
              </button>
            ))}
          </div>

          {estado.mis_cartas < 5 && (
            <div className="du-aviso">Necesitás al menos 5 cartas (y un arquero) para jugar duelos. Abrí sobres para conseguirlas.</div>
          )}

          {pestana === 'retar' && <Rivales estado={estado} onRetar={(rival) => { sound('elegir'); setArmando({ modo: 'retar', rival }); }} />}
          {pestana === 'retos' && (
            <Retos estado={estado} ocupado={ocupado} onAceptar={(duelo) => { sound('elegir'); setArmando({ modo: 'responder', duelo }); }} onBajarse={bajarse} />
          )}
          {pestana === 'historial' && <Historial estado={estado} onVer={ver} />}

          <p className="du-reglas">
            Apuesta opcional de hasta {estado.limites.apuesta_max} {MONEDA}: los dos ponen lo mismo y el ganador se lleva todo.
            Además, el ganador cobra {estado.limites.premio_ganador} {MONEDA} (hasta {estado.limites.premios_por_dia} duelos ganados por día;
            hoy llevás {estado.ganados_hoy}). Si no te contestan en {estado.limites.horas} horas, se te devuelve la apuesta.
          </p>
        </>
      )}
    </div>
  );
}

/* ── A QUIÉN RETAR ─────────────────────────────────────────────────────── */

function Rivales({ estado, onRetar }) {
  const [buscar, setBuscar] = useState('');
  const abiertos = estado.enviados.length;
  const lista = estado.rivales.filter((r) => r.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));
  const lleno = abiertos >= estado.limites.abiertos_max;
  return (
    <section className="jg-panel jg-entra">
      <h2 className="jg-panel-titulo">¿A QUIÉN RETÁS?</h2>
      <input className="du-buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar rival" />
      {lleno && <div className="du-nota">Ya tenés {abiertos} retos esperando respuesta: esperá a que contesten.</div>}
      {!lista.length && <div className="du-nota">{estado.rivales.length ? 'Nadie con ese nombre.' : 'Todavía no hay nadie más con 5 cartas.'}</div>}
      <ul className="du-lista">
        {lista.map((r) => (
          <li key={r.dueno}>
            <span className="du-avatar">{(r.nombre || '?')[0].toUpperCase()}</span>
            <span className="du-nombre"><b>{r.nombre}</b><small>{r.cartas} cartas</small></span>
            <GameButton variante={r.pendiente ? 'ghost' : 'primary'} disabled={r.pendiente || lleno || estado.mis_cartas < 5} onClick={() => onRetar(r)}>
              {r.pendiente ? 'PENDIENTE' : 'RETAR'}
            </GameButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── LOS RETOS: los que me hicieron y los que hice ─────────────────────── */

function Retos({ estado, ocupado, onAceptar, onBajarse }) {
  return (
    <>
      <section className="jg-panel jg-entra">
        <h2 className="jg-panel-titulo">TE RETARON</h2>
        {!estado.recibidos.length && <div className="du-nota">Nadie te retó todavía.</div>}
        <ul className="du-lista">
          {estado.recibidos.map((d) => (
            <li key={d.id} className="du-reto">
              <span className="du-avatar du-avatar-rojo">{(d.otro || '?')[0].toUpperCase()}</span>
              <span className="du-nombre">
                <b>{d.otro} te retó</b>
                <small>{d.apuesta ? `Apuesta ${d.apuesta} ${MONEDA} (ponés lo mismo)` : 'Sin apuesta'} · {venceEn(d.vence_at)}</small>
              </span>
              <span className="du-botones">
                <GameButton onClick={() => onAceptar(d)} disabled={ocupado || estado.mis_cartas < 5 || estado.puntos < d.apuesta}>ACEPTAR</GameButton>
                <GameButton variante="ghost" onClick={() => onBajarse(d)} disabled={ocupado}>NO</GameButton>
              </span>
            </li>
          ))}
        </ul>
        {estado.recibidos.some((d) => estado.puntos < d.apuesta) && <div className="du-nota">Para aceptar uno con apuesta tenés que tener esas V-Coins.</div>}
      </section>
      <section className="jg-panel jg-entra">
        <h2 className="jg-panel-titulo">ESPERANDO RESPUESTA</h2>
        {!estado.enviados.length && <div className="du-nota">No tenés retos abiertos.</div>}
        <ul className="du-lista">
          {estado.enviados.map((d) => (
            <li key={d.id}>
              <span className="du-avatar">{(d.otro || '?')[0].toUpperCase()}</span>
              <span className="du-nombre"><b>Retaste a {d.otro}</b><small>{d.apuesta ? `Apuesta ${d.apuesta} ${MONEDA}` : 'Sin apuesta'} · {venceEn(d.vence_at)}</small></span>
              <GameButton variante="ghost" onClick={() => onBajarse(d)} disabled={ocupado}>CANCELAR</GameButton>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Historial({ estado, onVer }) {
  return (
    <section className="jg-panel jg-entra">
      <h2 className="jg-panel-titulo">ÚLTIMOS DUELOS</h2>
      {!estado.historial.length && <div className="du-nota">Todavía no jugaste duelos.</div>}
      <ul className="du-lista">
        {estado.historial.map((d) => (
          <li key={d.id} className={`du-hist${d.resultado?.gane ? ' du-gano' : d.resultado ? ' du-perdio' : ''}`}>
            <span className="du-avatar">{(d.otro || '?')[0].toUpperCase()}</span>
            <span className="du-nombre">
              <b>{d.soy === 'retador' ? 'Vos vs ' : ''}{d.otro}{d.soy === 'rival' ? ' vs vos' : ''}{d.nuevo && <em className="du-nuevo">NUEVO</em>}</b>
              <small>{textoResultado(d)}{d.resultado?.mi_premio ? ` · +${d.resultado.mi_premio} ${MONEDA}` : ''}</small>
            </span>
            {d.estado === 'jugado' && <GameButton variante="secondary" onClick={() => onVer(d)}>VER</GameButton>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── EL ARMADO: formación, 5 lugares y las cartas para cada uno ─────────── */

function Armado({ modo, rival, duelo, coleccion, puntos, ocupado, sonar, onConfirmar, onVolver }) {
  const [formacion, setFormacion] = useState('1-2-1');
  const [equipo, setEquipo] = useState([null, null, null, null, null]);
  const [lugar, setLugar] = useState(0);
  const [apuesta, setApuesta] = useState(0);
  const lugares = lugaresDe(formacion);
  const opciones = useMemo(() => opcionesParaLugar(coleccion || [], equipo, lugar, formacion), [coleccion, equipo, lugar, formacion]);
  const f = fuerzaDuelo(equipo, formacion);
  const completo = equipoCompleto(equipo);

  const elegir = (c) => {
    sonar('elegir');
    const nuevo = ponerCarta(equipo, lugar, c);
    setEquipo(nuevo);
    const sig = lugarLibre(nuevo);
    if (sig !== null) setLugar(sig);
  };
  const armarSolo = () => { sonar('elegir'); setEquipo(mejorEquipo(coleccion || [], formacion)); };

  if (!coleccion) return <div className="du-nota">Cargando tu colección…</div>;
  return (
    <div className="du-armado jg-entra">
      <div className="du-armado-cab">
        <button className="du-volver" onClick={onVolver}>← VOLVER</button>
        <div>
          <b>{modo === 'retar' ? `RETÁS A ${String(rival || '').toUpperCase()}` : `${String(rival || '').toUpperCase()} TE RETÓ`}</b>
          <small>{modo === 'retar' ? 'Él no va a ver tu equipo hasta que se juegue.' : `Su equipo está oculto.${duelo?.apuesta ? ` Apuesta: ${duelo.apuesta} ${MONEDA} cada uno.` : ''}`}</small>
        </div>
      </div>

      <section className="jg-panel">
        <div className="du-formaciones" role="radiogroup" aria-label="Formación">
          {FORMACIONES_DUELO.map((id) => (
            <button key={id} role="radio" aria-checked={formacion === id} className={`du-chip${formacion === id ? ' du-on' : ''}`}
              onClick={() => { sonar('click'); setFormacion(id); }}>{id}</button>
          ))}
          <GameButton variante="secondary" onClick={armarSolo} className="du-solo">ARMÁ POR MÍ</GameButton>
        </div>

        <div className="du-lugares">
          {lugares.map((l, i) => (
            <button key={i} className={`du-lugar${lugar === i ? ' du-on' : ''}${equipo[i] ? ' du-lleno' : ''}`} onClick={() => setLugar(i)}
              aria-label={`Lugar ${i + 1}: ${l.roles.map((r) => NOMBRE_ROL[r]).join(' o ')}`}>
              {equipo[i] ? <CartaJugador carta={aCarta(equipo[i])} chica /> : <span className="du-lugar-vacio">{l.roles.join('/')}</span>}
              <small>{l.roles.map((r) => NOMBRE_ROL[r]).join(' / ')}</small>
            </button>
          ))}
        </div>

        <div className="du-numeros">
          <span>FUERZA <b>{completo ? f.fuerza : '—'}</b></span>
          <span>MEDIA <b>{f.media || '—'}</b></span>
          <span>QUÍMICA <b>{f.quimica}/100</b></span>
        </div>
      </section>

      <section className="jg-panel">
        <h2 className="jg-panel-titulo">{lugar === 0 ? 'ELEGÍ TU ARQUERO' : `ELEGÍ ${lugares[lugar]?.roles.map((r) => NOMBRE_ROL[r]).join(' O ')}`}</h2>
        {!opciones.length && <div className="du-nota">{lugar === 0 ? 'No tenés arqueros en tu colección.' : 'No te quedan cartas para este lugar.'}</div>}
        <div className="du-opciones">
          {opciones.slice(0, 60).map((c) => (
            <div key={c.catalogo_id} className={`du-opcion${c.enSuPuesto ? '' : ' du-fuera'}`}>
              <CartaJugador carta={aCarta(c)} chica onClick={() => elegir(c)} seleccionada={equipo[lugar]?.catalogo_id === c.catalogo_id} />
            </div>
          ))}
        </div>
        {opciones.some((c) => !c.enSuPuesto) && <div className="du-nota">Las más apagadas juegan fuera de su puesto (menos química).</div>}
      </section>

      <section className="jg-panel du-confirmar">
        {modo === 'retar' && (
          <div className="du-apuesta" role="radiogroup" aria-label="Apuesta">
            <span>APUESTA</span>
            {APUESTAS.map((a) => (
              <button key={a} role="radio" aria-checked={apuesta === a} disabled={a > puntos}
                className={`du-chip${apuesta === a ? ' du-on' : ''}`} onClick={() => setApuesta(a)}>{a ? a : 'SIN'}</button>
            ))}
          </div>
        )}
        <GameButton grande ancho disabled={!completo || ocupado} onClick={() => onConfirmar(formacion, equipo, apuesta)}>
          {ocupado ? 'UN MOMENTO…' : modo === 'retar' ? `RETAR${apuesta ? ` · ${apuesta} ${MONEDA}` : ''}` : `¡A JUGAR!${duelo?.apuesta ? ` · ${duelo.apuesta} ${MONEDA}` : ''}`}
        </GameButton>
        {!completo && <div className="du-nota">Te faltan {equipo.filter((c) => !c).length} lugares.</div>}
      </section>
    </div>
  );
}

/* ── EL RESULTADO ──────────────────────────────────────────────────────── */

function Resultado({ d, onCerrar }) {
  const r = d.resultado || {};
  const mio = d.soy === 'retador' ? 'retador' : 'rival';
  const pen = r.penales ? (d.soy === 'retador' ? `${r.penales.r}-${r.penales.v}` : `${r.penales.v}-${r.penales.r}`) : null;
  return (
    <div className={`du-resultado jg-entra ${r.gane ? 'du-gano' : 'du-perdio'}`}>
      <div className="du-veredicto">{r.gane ? '¡GANASTE EL DUELO!' : 'PERDISTE EL DUELO'}</div>
      <div className="du-marcador">
        <div><span>VOS</span><b>{r.mis_goles}</b></div>
        <i>–</i>
        <div><span>{String(d.otro || '').toUpperCase()}</span><b>{r.sus_goles}</b></div>
      </div>
      {pen && <div className="du-penales">Empate · penales {pen}</div>}
      {r.mi_premio > 0 && <div className="du-premio">+{r.mi_premio} {MONEDA}</div>}

      {r.goles?.length > 0 && (
        <ol className="du-goles">
          {r.goles.map((g, i) => (
            <li key={i} className={g.equipo === mio ? 'du-gol-mio' : 'du-gol-suyo'}>
              <span>{g.minuto}'</span><span>⚽ {g.autor}{g.asistencia ? <em> · asist. {g.asistencia}</em> : null}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="du-equipos">
        {[['TU EQUIPO', d.mio], [`EL DE ${String(d.otro || '').toUpperCase()}`, d.suyo]].map(([t, e]) => e && (
          <div key={t}>
            <h3>{t} · {e.formacion}</h3>
            <div className="du-equipo">{(e.equipo || []).map((c, i) => <CartaJugador key={i} carta={aCarta(c)} chica />)}</div>
          </div>
        ))}
      </div>
      <GameButton grande onClick={onCerrar}>LISTO</GameButton>
    </div>
  );
}
