import React, { useCallback, useEffect, useRef, useState } from 'react';
import Penales from '../components/vdraft/Penales';
import CartaJugador from '../components/quinteto/CartaJugador';
import { NIVELES, tandaNueva, tiroDePractica } from '../analytics/penales';
import {
  NIVELES_CARTAS, SEGUNDOS_POR_TIRO, PREMIOS_POR_DIA, valorPateador, valorArquero, cartasParaPenales,
} from '../analytics/penalesCartas';
import { estadoPenales, nuevaTanda, tirarPenal, abandonarTanda } from '../utils/penales';
import { GameButton, Badge, Countdown } from '../juegos/ui';
import useFeedback from '../juegos/useFeedback';
import Monedas from '../juegos/Monedas';
import { monedasQueCaen } from '../analytics/partidoVista';
import '../components/quinteto/quinteto.css';
import './juegos.css';
import './vdraft.css';
import './penales.css';

/* PENALES
 *
 * Con cartas (y premio): elegís un pateador y un arquero de TU colección, el
 * nivel y quién empieza, y jugás la tanda contra la CPU tiro por tiro: 9
 * cuadrantes para patear y 9 para atajar, 5 segundos por tiro. Tus cartas
 * pesan (TIR e IMP del pateador; ATA, SAL y EVI del arquero). Ganar da V-Coins
 * según el nivel, hasta 3 tandas premiadas por día. Todo se decide en la base
 * (utils/penales, migración 20261103120000_penales_cartas.sql).
 *
 * De práctica (sin premio): si no tenés pateador y arquero, para el
 * superusuario o si falta la migración. Se juega en el navegador, como antes.
 */

const aCarta = (c) => ({ atributos: [], stats: {}, ...(c?.carta || {}) });

export default function PenalesJuego() {
  const [estado, setEstado] = useState(null);
  const [motivo, setMotivo] = useState(null);       // por qué es de práctica
  const [cargando, setCargando] = useState(true);
  const aplicar = useCallback((r) => {
    setCargando(false);
    if (r.error || r.vencida) { setMotivo(r.faltaMigracion ? 'migracion' : r.vencida ? 'vencida' : 'error'); return; }
    const { pateadores, arqueros } = cartasParaPenales(r.data.cartas);
    if (!pateadores.length || !arqueros.length) { setMotivo('cartas'); setEstado(r.data); return; }
    setMotivo(null);
    setEstado(r.data);
  }, []);
  useEffect(() => { estadoPenales().then(aplicar); }, [aplicar]);
  const recargar = useCallback(() => estadoPenales().then(aplicar), [aplicar]);

  if (cargando) return <div className="pj-cargando">Preparando el arco…</div>;
  return (
    <div className="jg-ui pj">
      <header className="pj-cab jg-entra">
        <div>
          <h1 className="pj-titulo">PENALES</h1>
          <p className="pj-bajada">{motivo ? 'Modo práctica: sin premio.' : 'Tu pateador y tu arquero contra la CPU. Ganá y llevate V-Coins.'}</p>
        </div>
        {!motivo && estado && (
          <div className="jh-saldo">
            <div className="jh-dato"><span>V-COINS</span><b className="jh-oro">{estado.puntos}</b></div>
            <div className="jh-dato"><span>PREMIOS HOY</span><b className="jh-neon">{estado.premiadas_hoy}/{estado.limite ?? PREMIOS_POR_DIA}</b></div>
          </div>
        )}
      </header>
      {motivo ? <Practica motivo={motivo} /> : <ConCartas estado={estado} recargar={recargar} />}
    </div>
  );
}

/* ── CON CARTAS ─────────────────────────────────────────────────────────── */

function ConCartas({ estado, recargar }) {
  const { pateadores, arqueros } = cartasParaPenales(estado.cartas);
  const [pateador, setPateador] = useState(pateadores[0]?.catalogo_id);
  const [arquero, setArquero] = useState(arqueros[0]?.catalogo_id);
  const [nivel, setNivel] = useState(0);
  const [primero, setPrimero] = useState('sorteo');
  const [tanda, setTanda] = useState(estado.tanda);   // la que se está jugando (o la que quedó a medias)
  const [final, setFinal] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const { feedback, sound } = useFeedback();

  const pat = pateadores.find((c) => c.catalogo_id === pateador) || pateadores[0];
  const arq = arqueros.find((c) => c.catalogo_id === arquero) || arqueros[0];
  const premiosQuedan = Math.max(0, (estado.limite ?? PREMIOS_POR_DIA) - (estado.premiadas_hoy || 0));

  const empezar = async () => {
    setOcupado(true); setError(null); setFinal(null);
    feedback('elegir');
    const r = await nuevaTanda({ pateador: pat.catalogo_id, arquero: arq.catalogo_id, nivel, primero });
    setOcupado(false);
    if (r.error || r.vencida) { setError(r.error?.message || 'Tu sesión venció.'); return; }
    setTanda(r.data);
  };
  const abandonar = async () => {
    if (!window.confirm('Si dejás la tanda, cuenta como perdida. ¿Seguro?')) return;
    await abandonarTanda(tanda.id);
    setTanda(null);
    recargar();
  };
  const alDefinir = (d) => {
    const u = d.ultimo || {};
    feedback(u.gano ? 'victoria' : 'derrota');
    setFinal({ gano: !!u.gano, penales: u.penales, premio: d.premio || 0, nivel: tanda?.nivel ?? nivel });
    setTanda(null);
    recargar();
  };

  if (tanda) {
    const cartaDe = (t) => {
      const c = t === 'propio' ? tanda.pateador : tanda.arquero;
      return (
        <div className="pj-protagonista">
          <div className="pj-mini"><CartaJugador carta={aCarta(c)} /></div>
          <span>{t === 'propio' ? 'PATEA' : 'ATAJA'}<b>{c?.carta?.apellido}</b><em>{c?.valor}</em></span>
        </div>
      );
    };
    return (
      <div className="pj-juego">
        <Penales key={tanda.id} partida={{ id: tanda.id, tanda }} rival={`CPU · ${NIVELES_CARTAS[tanda.nivel]?.nombre || ''}`}
          nombre="VOS" patear={(e) => tirarPenal(tanda.id, e)} alDefinir={alDefinir}
          nueve segundos={SEGUNDOS_POR_TIRO} carta={cartaDe} />
        <GameButton variante="ghost" onClick={abandonar} className="pj-abandonar">ABANDONAR LA TANDA</GameButton>
      </div>
    );
  }

  return (
    <>
      {final && <Final final={final} />}
      {error && <div className="vd-error" role="alert">{error}</div>}

      <section className="jg-panel jg-entra" style={{ '--i': 1 }}>
        <h2 className="jg-panel-titulo">TU PATEADOR <small>TIR + IMP</small></h2>
        <Elegir cartas={pateadores} elegida={pat?.catalogo_id} valor={valorPateador} rotulo="PAT"
          alElegir={(id) => { sound('click'); setPateador(id); }} />
      </section>

      <section className="jg-panel jg-entra" style={{ '--i': 2 }}>
        <h2 className="jg-panel-titulo">TU ARQUERO <small>ATA + SAL + EVI</small></h2>
        <Elegir cartas={arqueros} elegida={arq?.catalogo_id} valor={valorArquero} rotulo="ARQ"
          alElegir={(id) => { sound('click'); setArquero(id); }} />
      </section>

      <section className="jg-panel jg-entra" style={{ '--i': 3 }}>
        <h2 className="jg-panel-titulo">NIVEL</h2>
        <div className="pj-niveles" role="radiogroup" aria-label="Nivel">
          {NIVELES_CARTAS.map((n) => (
            <button key={n.id} role="radio" aria-checked={nivel === n.id} className={`pj-nivel${nivel === n.id ? ' activo' : ''}`} onClick={() => setNivel(n.id)}>
              <b>{n.nombre}</b>
              <span className="pj-cpu">CPU {n.cpu}</span>
              <span className="pj-premio">{premiosQuedan ? `+${n.premio} VC` : 'sin premio'}</span>
              <small>{n.detalle}</small>
            </button>
          ))}
        </div>
        <p className="pj-duelo">
          Tu pateador <b className="jh-neon">{valorPateador(pat)}</b> contra su arquero <b>{NIVELES_CARTAS[nivel].cpu}</b> ·
          tu arquero <b className="jh-neon">{valorArquero(arq)}</b> contra su pateador <b>{NIVELES_CARTAS[nivel].cpu}</b>
        </p>
        <h3 className="vd-rotulo" style={{ marginTop: 12 }}>EMPIEZA</h3>
        <div className="pj-primero">
          {[['propio', 'PATEO YO'], ['rival', 'ATAJO YO'], ['sorteo', 'SORTEO']].map(([id, txt]) => (
            <button key={id} className={`pj-chip${primero === id ? ' activo' : ''}`} aria-pressed={primero === id} onClick={() => setPrimero(id)}>{txt}</button>
          ))}
        </div>
        <GameButton grande ancho onClick={empezar} disabled={ocupado || !pat || !arq} className="pj-empezar">
          {ocupado ? 'PREPARANDO…' : final ? 'JUGAR OTRA TANDA' : 'EMPEZAR LA TANDA'}
        </GameButton>
        <small className="vd-nota">
          {premiosQuedan
            ? `Te quedan ${premiosQuedan} ${premiosQuedan === 1 ? 'tanda premiada' : 'tandas premiadas'} hoy. 5 segundos por tiro.`
            : <>Ya cobraste las {estado.limite ?? PREMIOS_POR_DIA} tandas premiadas de hoy. Seguís jugando sin premio; vuelven en <Countdown />.</>}
        </small>
      </section>
      {estado.record?.jugadas > 0 && (
        <p className="vd-nota">Tus tandas: {estado.record.ganadas} ganadas de {estado.record.jugadas}.</p>
      )}
    </>
  );
}

/* Una fila deslizable de cartas para elegir, con lo que vale cada una. */
function Elegir({ cartas, elegida, valor, rotulo, alElegir }) {
  return (
    <div className="pj-fila">
      {cartas.map((c) => (
        <button key={c.catalogo_id} className={`pj-opcion${elegida === c.catalogo_id ? ' activa' : ''}`} onClick={() => alElegir(c.catalogo_id)}
          aria-pressed={elegida === c.catalogo_id} aria-label={`${c.carta.apellido}: ${rotulo} ${valor(c)}`}>
          <div className="pj-mini"><CartaJugador carta={aCarta(c)} /></div>
          <span className="pj-valor">{rotulo} <b>{valor(c)}</b></span>
        </button>
      ))}
    </div>
  );
}

function Final({ final }) {
  return (
    <section className={`pj-final${final.gano ? ' pj-gano' : ''}`} role="status">
      <b className="pj-veredicto">{final.gano ? '¡GANASTE LA TANDA!' : 'PERDISTE LA TANDA'}</b>
      <span className="pj-penales">{final.penales}</span>
      {final.gano && (final.premio
        ? <span className="pj-premio-grande">+{final.premio} V-Coins</span>
        : <small>Ganada, pero ya cobraste las tandas premiadas de hoy.</small>)}
      {final.premio > 0 && <Monedas n={monedasQueCaen(final.premio * 3)} semilla={final.premio + (final.penales?.length || 0)} />}
    </section>
  );
}

/* ── PRÁCTICA (sin premio, en el navegador) ─────────────────────────────── */

const CLAVE = 'penales_record';
const leerRecord = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
};
const guardarRecord = (r) => { try { localStorage.setItem(CLAVE, JSON.stringify(r)); } catch { /* sin storage */ } };

const MOTIVOS = {
  cartas: 'Para jugar con premio necesitás al menos un jugador de campo y un arquero en tu colección: abrí sobres.',
  migracion: 'Los penales con premio todavía no están en la base de tu club.',
  vencida: 'Tu sesión venció: volvé al menú e ingresá con tu PIN para jugar con premio.',
  error: 'Los penales con premio no son para esta cuenta (el superusuario prueba sin premio).',
};

function Practica({ motivo }) {
  const [nivel, setNivel] = useState(0);
  const [primero, setPrimero] = useState('propio');
  const [jugando, setJugando] = useState(null);
  const [final, setFinal] = useState(null);
  const [record, setRecord] = useState(leerRecord);
  const tanda = useRef(null);

  const empezar = () => {
    const quien = primero === 'sorteo' ? (Math.random() < 0.5 ? 'propio' : 'rival') : primero;
    const t = tandaNueva(nivel, quien);
    tanda.current = t;
    setFinal(null);
    setJugando({ n: (jugando?.n || 0) + 1, tanda: t });
  };
  const patear = async (eleccion) => {
    const d = tiroDePractica(tanda.current, eleccion < 0 ? Math.floor(Math.random() * (tanda.current.turno === 'propio' ? 9 : 3)) : eleccion);
    if (d.tanda) tanda.current = d.tanda;
    return { data: d };
  };
  const alDefinir = (d) => {
    const r = { ...record };
    const k = String(nivel);
    const prev = r[k] || { jugadas: 0, ganadas: 0, racha: 0, mejorRacha: 0 };
    const gano = !!d.ultimo?.gano;
    const racha = gano ? prev.racha + 1 : 0;
    r[k] = { jugadas: prev.jugadas + 1, ganadas: prev.ganadas + (gano ? 1 : 0), racha, mejorRacha: Math.max(prev.mejorRacha, racha) };
    guardarRecord(r);
    setRecord(r);
    setFinal({ gano, penales: d.ultimo?.penales });
  };
  const rec = record[String(nivel)];

  if (jugando && !final) {
    return (
      <div className="pj-juego">
        <Penales key={jugando.n} partida={{ id: null, tanda: jugando.tanda }} rival={`Arquero · ${NIVELES[nivel].nombre}`}
          nombre="VOS" patear={patear} alDefinir={alDefinir} />
      </div>
    );
  }
  return (
    <>
      <div className="pj-aviso"><Badge tono="oro">PRÁCTICA</Badge> {MOTIVOS[motivo] || MOTIVOS.error}</div>
      {final && <Final final={final} />}
      <section className="jg-panel">
        <h2 className="jg-panel-titulo">NIVEL</h2>
        <div className="pj-niveles">
          {NIVELES.map((n) => (
            <button key={n.id} className={`pj-nivel${nivel === n.id ? ' activo' : ''}`} onClick={() => setNivel(n.id)} aria-pressed={nivel === n.id}>
              <b>{n.nombre}</b><small>{n.detalle}</small>
            </button>
          ))}
        </div>
        <h3 className="vd-rotulo" style={{ marginTop: 12 }}>EMPIEZA</h3>
        <div className="pj-primero">
          {[['propio', 'PATEO YO'], ['rival', 'ATAJO YO'], ['sorteo', 'SORTEO']].map(([id, txt]) => (
            <button key={id} className={`pj-chip${primero === id ? ' activo' : ''}`} aria-pressed={primero === id} onClick={() => setPrimero(id)}>{txt}</button>
          ))}
        </div>
        <GameButton grande ancho onClick={empezar} className="pj-empezar">{final ? 'JUGAR OTRA TANDA' : 'EMPEZAR LA TANDA'}</GameButton>
        <small className="vd-nota">
          {rec ? `En ${NIVELES[nivel].nombre}: ${rec.ganadas} ganadas de ${rec.jugadas} · racha ${rec.racha} · mejor racha ${rec.mejorRacha}` : 'Modo práctica: no da V-Coins.'}
        </small>
      </section>
    </>
  );
}
