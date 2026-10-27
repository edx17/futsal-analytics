import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CartaJugador from '../components/quinteto/CartaJugador';
import { GameButton, Badge, ProgressBar, Countdown } from '../juegos/ui';
import useFeedback from '../juegos/useFeedback';
import { useEsMovil } from '../utils/useEsMovil';
import { estadoSobres, coleccionSobres } from '../utils/sobres';
import { estadoVDraft } from '../utils/vdraft';
import { misionesDelDia, cobrarMision } from '../utils/juegos';
import { mejorCarta, modosDelMenu, resumenMisiones } from '../analytics/juegosHub';
import '../components/quinteto/quinteto.css';
import './juegos.css';

/* JUEGOS · EL MENÚ
 *
 * Una sola fuente de datos (modosDelMenu) y dos vistas:
 *   PC / tablet → HUB: la mejor carta de tu colección girando en el centro y
 *                 los modos alrededor, con las misiones del día abajo.
 *   celular     → CARRUSEL: una tarjeta gigante por modo, que se pasa con el
 *                 dedo, y las misiones plegables.
 * Arriba: V-Coins y racha. Staff y kiosco usan la misma pantalla (en el kiosco
 * no está MySquad); el superusuario ve el Modo GOD y no compite.
 */

const aCarta = (c) => ({ atributos: [], stats: {}, ...(c?.carta || {}) });

export default function Juegos({ kiosco = false }) {
  const navigate = useNavigate();
  const { perfil } = useAuth() || {};
  const esSuper = !kiosco && String(perfil?.rol || '').toLowerCase() === 'superuser';
  const esMovil = useEsMovil();
  const { feedback, prefs, setPrefs, puedeVibrar } = useFeedback();

  const [sobres, setSobres] = useState(null);
  const [vdraft, setVDraft] = useState(null);
  const [protagonista, setProtagonista] = useState(null);
  const [misiones, setMisiones] = useState(null);
  const [cobrando, setCobrando] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (esSuper) return undefined;
    let vivo = true;
    estadoSobres().then((r) => { if (vivo && r.data) setSobres(r.data); });
    estadoVDraft().then((r) => { if (vivo && r.data) setVDraft(r.data); });
    coleccionSobres().then((r) => { if (vivo && r.data) setProtagonista(mejorCarta(r.data.cartas)); });
    misionesDelDia().then((r) => { if (vivo) setMisiones(r.data || []); });
    return () => { vivo = false; };
  }, [esSuper]);

  const modos = modosDelMenu({ sobres, vdraft, kiosco, esSuper });
  const ir = (m) => {
    if (m.bloqueado) return;
    feedback('elegir');
    navigate(kiosco ? `/kiosco/${m.id}` : `/${m.id}`);
  };

  const cobrar = useCallback(async (id) => {
    setCobrando(id);
    const r = await cobrarMision(id);
    setCobrando(null);
    if (r.error) { setAviso(r.error.message); return; }
    feedback('premio');
    setMisiones(r.data.misiones);
    setSobres((s) => (s ? { ...s, puntos: r.data.puntos } : s));
    setAviso(`+${r.data.premio} V-Coins`);
    setTimeout(() => setAviso(null), 2200);
  }, [feedback]);

  const puntos = sobres?.puntos ?? vdraft?.puntos;
  const barra = (
    <header className="jh-barra jg-entra">
      <div className="jh-saldo">
        {!esSuper && <Dato rotulo="V-COINS" valor={puntos ?? '—'} tono="oro" />}
        {!esSuper && <Dato rotulo="RACHA" valor={sobres ? `${sobres.racha ?? 0}/7` : '—'} tono="neon" />}
        {esSuper && <Dato rotulo="MODO" valor="SUPERUSUARIO" tono="oro" />}
      </div>
      <div className="jg-prefs">
        <button className="jg-pref" aria-pressed={prefs.sonido} onClick={() => setPrefs({ sonido: !prefs.sonido })} aria-label={prefs.sonido ? 'Apagar el sonido' : 'Prender el sonido'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H2v6h4l5 4z" />{prefs.sonido ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6m0-6 6 6" />}</svg>
        </button>
        {puedeVibrar && (
          <button className="jg-pref" aria-pressed={prefs.vibracion} onClick={() => setPrefs({ vibracion: !prefs.vibracion })} aria-label={prefs.vibracion ? 'Apagar la vibración' : 'Prender la vibración'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M3 8v8M21 8v8" /></svg>
          </button>
        )}
      </div>
    </header>
  );

  const panelMisiones = !esSuper && <Misiones misiones={misiones} cobrando={cobrando} cobrar={cobrar} plegable={esMovil} />;

  return (
    <div className="jg-ui jh">
      {barra}
      {aviso && <div className="jh-aviso" role="status">{aviso}</div>}
      {esMovil ? (
        <>
          {protagonista && (
            <div className="jh-mini jg-entra" style={{ '--i': 1 }}>
              <div className="jh-mini-carta"><CartaJugador carta={aCarta(protagonista)} /></div>
              <div><span className="jh-rotulo">TU MEJOR CARTA</span><b>{protagonista.carta.apellido}</b></div>
            </div>
          )}
          <Carrusel modos={modos} ir={ir} />
          {panelMisiones}
        </>
      ) : (
        <>
          <div className={`jh-hub jh-hub-${modos.length}`}>
            {modos.map((m, i) => <TarjetaModo key={m.clave || m.id} modo={m} ir={ir} style={{ gridArea: `m${i}`, '--i': i + 1 }} />)}
            <div className="jh-centro jg-entra" style={{ '--i': 0 }}>
              {protagonista ? (
                <>
                  <div className="jh-luz" aria-hidden="true" />
                  <div className="jh-protagonista"><CartaJugador carta={aCarta(protagonista)} /></div>
                  <span className="jh-rotulo">TU MEJOR CARTA</span>
                </>
              ) : (
                esSuper ? (
                  <div className="jh-god">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>
                    <b>MODO GOD</b>
                    <small>Probás todo sin competir.</small>
                  </div>
                ) : <div className="jh-sin-carta">Abrí tu primer sobre para tener tu carta acá.</div>
              )}
            </div>
          </div>
          {panelMisiones}
        </>
      )}
    </div>
  );
}

function Dato({ rotulo, valor, tono }) {
  return (
    <div className="jh-dato">
      <span>{rotulo}</span>
      <b className={`jh-${tono}`}>{valor}</b>
    </div>
  );
}

function BadgeModo({ badge }) {
  if (!badge) return null;
  return (
    <Badge tono={badge.tono} latido={badge.latido}>
      {badge.texto}{badge.cuenta && <> <Countdown /></>}
    </Badge>
  );
}

function TarjetaModo({ modo, ir, style }) {
  return (
    <button className={`jh-modo jg-entra${modo.bloqueado ? ' jh-bloqueado' : ''}`} style={{ ...style, '--acento': modo.acento, backgroundImage: `url(${modo.imagen})` }}
      onClick={() => ir(modo)} disabled={!!modo.bloqueado} aria-label={`${modo.titulo}: ${modo.bloqueado || modo.bajada}`}>
      <span className="jh-modo-sombra" />
      <span className="jh-modo-badge"><BadgeModo badge={modo.badge} /></span>
      <span className="jh-modo-texto">
        <b>{modo.titulo}</b>
        <small>{modo.bloqueado || modo.bajada}</small>
      </span>
    </button>
  );
}

/* El carrusel del celular: una tarjeta por modo, con scroll-snap y puntitos. */
function Carrusel({ modos, ir }) {
  const pista = useRef(null);
  const [actual, setActual] = useState(0);
  const alDeslizar = () => {
    const el = pista.current;
    if (!el) return;
    setActual(Math.round(el.scrollLeft / el.clientWidth));
  };
  const irA = (i) => pista.current?.scrollTo({ left: i * pista.current.clientWidth, behavior: 'smooth' });
  return (
    <section className="jh-carrusel jg-entra" style={{ '--i': 2 }} aria-label="Modos de juego">
      <div className="jh-pista" ref={pista} onScroll={alDeslizar}>
        {modos.map((m) => (
          <div key={m.clave || m.id} className="jh-slide">
            <div className={`jh-gigante${m.bloqueado ? ' jh-bloqueado' : ''}`} style={{ '--acento': m.acento, backgroundImage: `url(${m.imagen})` }}>
              <span className="jh-modo-sombra" />
              <span className="jh-modo-badge"><BadgeModo badge={m.badge} /></span>
              <span className="jh-gigante-texto">
                <b>{m.titulo}</b>
                <small>{m.bloqueado || m.bajada}</small>
                <GameButton grande ancho disabled={!!m.bloqueado} onClick={() => ir(m)} style={{ background: m.acento, boxShadow: `0 0 22px ${m.acento}88` }}>
                  {m.bloqueado ? 'NO DISPONIBLE' : 'JUGAR'}
                </GameButton>
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="jh-puntos">
        {modos.map((m, i) => (
          <button key={m.clave || m.id} className={i === actual ? 'activo' : ''} onClick={() => irA(i)} aria-label={`Ir a ${m.titulo}`} />
        ))}
      </div>
    </section>
  );
}

function Misiones({ misiones, cobrando, cobrar, plegable }) {
  const [abierta, setAbierta] = useState(!plegable);
  const r = resumenMisiones(misiones || []);
  if (misiones && !misiones.length) return null;
  return (
    <section className="jg-panel jh-misiones jg-entra" style={{ '--i': 5 }}>
      <button className="jh-misiones-cab" onClick={() => plegable && setAbierta((v) => !v)} aria-expanded={abierta}>
        <span>
          <span className="jg-panel-titulo" style={{ margin: 0 }}>MISIONES DEL DÍA</span>
          <small>{misiones ? `${r.cumplidas}/${r.total} cumplidas · se renuevan en ` : 'Cargando…'}{misiones && <Countdown />}</small>
        </span>
        {r.paraCobrar > 0 && <Badge tono="neon" latido>RECOMPENSA DISPONIBLE</Badge>}
        {plegable && <span className="jh-flecha">{abierta ? '▲' : '▼'}</span>}
      </button>
      {abierta && misiones && (
        <ul className="jh-lista">
          {misiones.map((m) => {
            const lista = m.progreso >= m.meta;
            return (
              <li key={m.id} className={m.cobrada ? 'cobrada' : ''}>
                <div className="jh-mision-texto">
                  <b>{m.titulo}</b>
                  <ProgressBar valor={m.progreso / m.meta} tono={lista ? undefined : 'oro'} />
                  <small>
                    {m.progreso}/{m.meta} · +{m.premio} V-Coins
                    {m.premio_base && m.premio > m.premio_base ? <em className="jg-x2">x{Math.round((m.premio / m.premio_base) * 10) / 10}</em> : null}
                  </small>
                </div>
                {m.cobrada ? <span className="jh-cobrada">✓ COBRADA</span>
                  : <GameButton variante={lista ? 'primary' : 'secondary'} disabled={!lista || cobrando === m.id} onClick={() => cobrar(m.id)}>
                    {cobrando === m.id ? '…' : lista ? 'COBRAR' : 'EN CURSO'}
                  </GameButton>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
