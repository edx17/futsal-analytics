import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CartaGiratoria from '../components/quinteto/CartaGiratoria';
import AperturaSobre from '../components/sobres/AperturaSobre';
import PanelGod from '../components/sobres/PanelGod';
import PanelClub from '../components/sobres/PanelClub';
import { useAuth } from '../context/AuthContext';
import { varianteDeApertura, EVENTOS } from '../analytics/aperturas';
import { prepararVideo, liberarVideos } from '../utils/videoApertura';
import { leerPreferencias, guardarPreferencias } from '../utils/preferenciasApertura';
import { prepararAudio, sonidoActivo, cargarMusica } from '../utils/sonidoApertura';
import { RAREZAS, COSTO_SOBRE_PUNTOS, COSTO_MEGA, MONEDA, RACHA_PARA_PREMIO, probabilidades, nombreDeCarta } from '../analytics/sobres';
import { sobreDelClub } from '../analytics/tiposSobre';
import { imagenDeSobre, repartirSobres, traeEspecial, filtrarAlbum, contarAlbum, POSICIONES } from '../analytics/sobresVista';
import { estadoSobres, abrirSobre, abrirSobreEvento, coleccionSobres, albumSobres, reiniciarPruebaSobres } from '../utils/sobres';
import { varianteDeEventoDb, varianteDeEscena } from '../analytics/eventos';
import { esModoKiosco, RUTA_KIOSCO } from '../utils/kiosco';
import { GameButton, Badge, ProgressBar, Countdown } from '../juegos/ui';
import useFeedback from '../juegos/useFeedback';
import '../components/quinteto/quinteto.css';
import './juegos.css';
import './sobres.css';

/* SOBRES
 *
 * Una sola pantalla para el jugador (Kiosco, /kiosco/sobres) y para el cuerpo
 * técnico (VirtualClub, /sobres), en dos pestañas:
 *   SOBRES     → los paquetes 3D: los que podés abrir hoy y los bloqueados
 *                (con la cuenta regresiva si vuelven a medianoche).
 *   COLECCIÓN  → el álbum: tus cartas y la silueta de las que faltan, con
 *                filtros por rareza y posición.
 * La apertura (cinemáticas incluidas) es components/sobres/AperturaSobre.
 * Las reglas y el sorteo viven en la base: acá sólo se pide y se muestra.
 */

const MONO = 'JetBrains Mono, monospace';

/* El color de cada sobre en la pantalla (brillo y botón). */
const ACENTO = {
  diario: '#00ff88', racha: '#22d3ee', wellness: '#34d399', puntos: '#60a5fa',
  mega: '#fbbf24', premio: '#c084fc', premio_especial: '#f472b6',
};

/* Una carta del catálogo en el formato que dibuja CartaJugador. */
const aCarta = (c) => ({ atributos: [], stats: {}, ...(c.carta || c) });

/* Sin la función del álbum (migración sin aplicar): sólo las que tenés. */
const albumDeColeccion = (col) => (col?.cartas || []).map((c) => ({ ...c, rol: c.carta?.rol, tengo: true }));

export default function Sobres() {
  const navigate = useNavigate();
  const kiosco = esModoKiosco();
  const { vibrate } = useFeedback();
  const [estado, setEstado] = useState(null);
  const [coleccion, setColeccion] = useState(null);
  const [album, setAlbum] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [abriendo, setAbriendo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [pestana, setPestana] = useState(() => (new URLSearchParams(window.location.search).get('ver') === 'coleccion' ? 'coleccion' : 'sobres'));
  const [verProbs, setVerProbs] = useState(false);
  const [prefs, setPrefs] = useState(leerPreferencias);
  const [eventoUrl] = useState(eventoDeLaDireccion); // ?evento=<id> (p. ej. la demo)
  const { perfil } = useAuth() || {};
  /* El evento: el de la dirección, o el que activó el superusuario para el club. */
  const evento = eventoUrl || (estado?.evento && Object.prototype.hasOwnProperty.call(EVENTOS, estado.evento) ? estado.evento : null);
  /* O una cinemática para todas las aperturas ('escena:<video>', elegida en el Modo GOD). Los sobres de eventos conservan la suya. */
  const escenaClub = !eventoUrl && String(estado?.evento || '').startsWith('escena:') ? estado.evento : null;
  /* El superusuario no tiene club propio ni colección: entra directo al Modo
     GOD del club elegido en la app (las funciones de sobres no lo atienden). */
  const soloGod = !kiosco && perfil?.rol === 'superuser';
  const esGod = soloGod || (!kiosco && !!estado?.es_superuser);
  const clubGod = localStorage.getItem('club_id') || perfil?.club_id || null;
  /* Una apertura de prueba del modo GOD: { resultado, forzar, evento }. No toca la base. */
  const [prueba, setPrueba] = useState(null);
  const cambiarPref = (clave, valor) => {
    const nuevas = { ...prefs, [clave]: valor };
    setPrefs(nuevas);
    guardarPreferencias(nuevas);
    if (clave === 'sonido') sonidoActivo(valor);
  };

  /* Lo que devuelve la base (estado, colección y álbum) en la pantalla. */
  const aplicar = useCallback(([e, c, a]) => {
    if (e.vencida || c.vencida) { setError('Tu sesión venció. Volvé al menú e ingresá con tu PIN.'); setCargando(false); return; }
    if (e.error || c.error) { setError((e.error || c.error).message); setCargando(false); return; }
    setError(null);
    setEstado(e.data);
    setColeccion(c.data);
    setAlbum(a.error ? albumDeColeccion(c.data) : a.data);
    setCargando(false);
  }, []);
  const cargar = useCallback(() => {
    if (soloGod) return; // Modo GOD: no hay colección propia
    Promise.all([estadoSobres(), coleccionSobres(), albumSobres()]).then(aplicar);
  }, [soloGod, aplicar]);

  useEffect(() => {
    if (soloGod) return undefined;
    let vivo = true;
    Promise.all([estadoSobres(), coleccionSobres(), albumSobres()]).then((r) => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [soloGod, aplicar]);
  useEffect(() => () => liberarVideos(), []); // al salir de la pantalla, nada queda bajando

  /* Lo que devuelve la base al abrir: si trae una especial, el celular vibra
     (el sonido de cada carta lo pone la apertura). */
  const mostrar = (r) => {
    if (r.vencida) { setError('Tu sesión venció. Volvé al menú e ingresá con tu PIN.'); return; }
    if (r.error) { setError(r.error.message); cargar(); return; }
    if (traeEspecial(r.data)) vibrate('especial');
    setResultado(r.data);
  };

  const abrir = async (tipo) => {
    if (abriendo || resultado) return; // nunca dos aperturas a la vez
    prepararAudio(prefs.sonido);       // en el toque: el navegador sólo deja sonar así
    precargarVideo(tipo, evento, escenaClub, estado?.tipos?.[tipo]?.escena); // el video baja mientras la base sortea las cartas
    setAbriendo(tipo);
    setError(null);
    const r = await abrirSobre(tipo);
    setAbriendo(null);
    mostrar(r);
  };

  /* El sobre de un evento (armado en el Modo GOD): sus cartas, sus reglas, su escena. */
  const abrirEvento = async (ev) => {
    if (abriendo || resultado) return;
    prepararAudio(prefs.sonido);
    precargarEvento(ev);
    setAbriendo(`evento:${ev.id}`);
    setError(null);
    const r = await abrirSobreEvento(ev.id);
    setAbriendo(null);
    mostrar(r);
  };

  const cerrarResultado = () => {
    if (resultado?.estado) setEstado(resultado.estado);
    setResultado(null);
    cargar();
  };

  const reiniciar = async () => {
    if (!window.confirm('Esto borra TU colección, tus V-Coins y tus sobres de hoy para volver a probar. ¿Seguro?')) return;
    const r = await reiniciarPruebaSobres();
    if (r.error) { setError(r.error.message); return; }
    cargar();
  };

  const { disponibles, bloqueados } = useMemo(() => repartirSobres(estado), [estado]);

  if (cargando && !soloGod) return <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}>Abriendo el paquete…</div>;

  if (soloGod) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 0 80px', animation: 'fadeIn 0.3s' }}>
        <div className="stat-label" style={{ color: '#fbbf24', fontSize: '1.2rem' }}>SOBRES · MODO GOD</div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 14 }}>
          Probá cualquier sobre y cualquier cinemática sin gastar nada, manejá las cartas del catálogo y los sobres del club.
        </div>
        {!clubGod ? (
          <div className="bento-card" style={{ padding: 24, color: 'var(--text-dim)' }}>Elegí un club en la app para administrar sus sobres.</div>
        ) : (
          <>
            <PreferenciasApertura prefs={prefs} cambiar={cambiarPref} />
            <PanelGod clubId={clubGod} estado={null} abiertoInicial alCambiar={cargar}
              alProbar={(p) => { prepararAudio(prefs.sonido); setPrueba(p); }} />
          </>
        )}
        {prueba && (
          <AperturaSobre key={prueba.resultado.sobre_id} resultado={prueba.resultado} prefs={{ ...prefs, cine: true }}
            evento={prueba.evento} forzar={prueba.forzar} escenaTipo={prueba.escenaTipo} onCerrar={() => setPrueba(null)} />
        )}
      </div>
    );
  }

  /* Cada sobre, normal o de evento, en el mismo formato para la tarjeta 3D. */
  const tarjeta = (s, i, disponible) => {
    if (s.tipo === 'evento') {
      const ev = s.evento;
      const col = ev.escena?.colores || {};
      return (
        <TarjetaSobre key={`ev-${ev.id}`} i={i} disponible={disponible} manana={s.manana}
          nombre={ev.nombre} cartas={ev.cartas} costo={ev.costo} imagen={imagenDeSobre('evento', { luz: col.luz || col.principal || '#fbbf24' })}
          acento={col.luz || '#fbbf24'} nota={notaEvento(ev, estado.puntos)} abriendo={abriendo === `evento:${ev.id}`}
          alAbrir={() => abrirEvento(ev)} alApuntar={() => precargarEvento(ev)} />
      );
    }
    const t = s.tipo;
    const sobre = sobreDelClub(t, estado.tipos?.[t]);
    const col = sobre.escena?.colores || {};
    const mega = t === 'mega';
    const costo = mega ? Number(sobre.costo) || 0 : 0;
    return (
      <TarjetaSobre key={t} i={i} disponible={disponible} manana={s.manana}
        nombre={sobre.nombre} cartas={sobre.cartas} queTrae={sobre.soloEspeciales ? 'ESPECIALES' : 'CARTAS'} costo={costo}
        imagen={imagenDeSobre(t, col)} acento={col.luz || ACENTO[t] || '#00ff88'}
        nota={notaDe(t, estado) || sobre.ayuda} abriendo={abriendo === t}
        avance={mega && costo > 0 ? { valor: (estado.puntos || 0) / costo, texto: `${Math.min(estado.puntos || 0, costo)} / ${costo} ${MONEDA}` } : null}
        alAbrir={() => abrir(t)} alApuntar={() => precargarVideo(t, evento, escenaClub, estado.tipos?.[t]?.escena)} />
    );
  };

  const cuenta = contarAlbum(album);

  return (
    <div className="jg-ui sb">
      <header className="sb-cab jg-entra">
        <div>
          <h1 className="sb-titulo">SOBRES</h1>
          <p className="sb-bajada">Entrá todos los días y juntá las cartas del plantel. Las repetidas te dan V-Coins.</p>
        </div>
        {estado && (
          <div className="jh-saldo">
            <div className="jh-dato"><span>V-COINS</span><b className="jh-oro">{estado.puntos}</b></div>
            <div className="jh-dato"><span>RACHA</span><b className="jh-neon">{estado.racha}/{RACHA_PARA_PREMIO}</b></div>
          </div>
        )}
      </header>

      <div className="sb-pestanas" role="tablist" aria-label="Sobres o colección">
        {[['sobres', 'SOBRES', disponibles.length || null], ['coleccion', 'COLECCIÓN', album ? `${cuenta.tengo}/${cuenta.total}` : null]].map(([id, texto, extra]) => (
          <button key={id} role="tab" aria-selected={pestana === id} className={pestana === id ? 'activa' : ''} onClick={() => setPestana(id)}>
            {texto}{extra != null && <span className="sb-pestana-extra">{extra}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="sb-error" role="alert">
          {error}
          {kiosco && error.includes('sesión') && <GameButton variante="secondary" onClick={() => navigate(RUTA_KIOSCO)}>IR AL MENÚ</GameButton>}
        </div>
      )}

      {pestana === 'sobres' && estado && (
        <>
          {estado.multiplicador && (
            <div className="sb-multi">
              ⚡ {estado.multiplicador.nombre} · todo lo que ganes vale x{estado.multiplicador.factor}
              <small> hasta el {new Date(estado.multiplicador.hasta).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</small>
            </div>
          )}

          <h2 className="sb-seccion">DISPONIBLES <span>{disponibles.length}</span></h2>
          {disponibles.length ? (
            <div className="sb-grilla">{disponibles.map((s, i) => tarjeta(s, i, true))}</div>
          ) : (
            <div className="sb-vacio">No tenés sobres para abrir ahora. Vuelven en <Countdown /></div>
          )}

          {bloqueados.length > 0 && (
            <>
              <h2 className="sb-seccion sb-seccion-gris">BLOQUEADOS <span>{bloqueados.length}</span></h2>
              <div className="sb-grilla">{bloqueados.map((s, i) => tarjeta(s, disponibles.length + i, false))}</div>
            </>
          )}

          <div className="sb-ajustes">
            <PreferenciasApertura prefs={prefs} cambiar={cambiarPref} />
            <GameButton variante="ghost" onClick={() => setVerProbs((v) => !v)}>{verProbs ? 'OCULTAR' : 'VER'} PROBABILIDADES</GameButton>
          </div>
          {verProbs && <Probabilidades catalogo={cartasDePorRareza(coleccion)} reglas={estado.tipos?.diario} />}
          {verProbs && <Probabilidades catalogo={cartasDePorRareza(coleccion)} soloEspeciales reglas={estado.tipos?.mega} />}
          <p className="sb-costos">{estado.costo_puntos ?? COSTO_SOBRE_PUNTOS} {MONEDA} = 1 sobre · {estado.costo_mega ?? COSTO_MEGA} {MONEDA} = 1 mega sobre</p>
        </>
      )}

      {pestana === 'coleccion' && <Album album={album} cuenta={cuenta} />}

      {!kiosco && estado?.es_staff && (
        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <GameButton variante="ghost" onClick={reiniciar} style={{ border: '1px dashed var(--jg-borde-fuerte)' }}>REINICIAR MI PRUEBA</GameButton>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 6 }}>
            Borra tu colección, tus V-Coins y tus sobres de hoy para volver a probar. No toca a los jugadores.
          </div>
        </div>
      )}

      {/* El manager: la vista simple de las cartas y los sobres de su club. */}
      {!kiosco && !esGod && ['manager', 'admin'].includes(perfil?.rol) && perfil?.club_id && (
        <PanelClub clubId={perfil.club_id} alCambiar={cargar} />
      )}

      {esGod && (
        <PanelGod clubId={clubGod} estado={estado} alCambiar={cargar}
          alProbar={(p) => { prepararAudio(prefs.sonido); setPrueba(p); }} />
      )}

      {resultado && <AperturaSobre key={resultado.sobre_id} resultado={resultado} prefs={prefs} evento={evento}
        forzar={resultado.evento ? null : escenaClub} escenaTipo={estado?.tipos?.[resultado.tipo]?.escena} onCerrar={cerrarResultado} />}
      {prueba && (
        <AperturaSobre key={prueba.resultado.sobre_id} resultado={prueba.resultado} prefs={{ ...prefs, cine: true }}
          evento={prueba.evento} forzar={prueba.forzar} escenaTipo={prueba.escenaTipo} onCerrar={() => setPrueba(null)} />
      )}
    </div>
  );
}

/* Un sobre en 3D: flota, se inclina al apuntarlo y brilla con su color si está
   para abrir. Bloqueado: en gris, con un candado y la cuenta regresiva si
   vuelve a medianoche (si no, el motivo). */
function TarjetaSobre({ i, nombre, cartas, queTrae = 'CARTAS', costo = 0, imagen, acento, nota, disponible, manana, abriendo, avance, alAbrir, alApuntar }) {
  return (
    <article className={`sb-tarjeta jg-entra${disponible ? ' sb-disponible' : ' sb-bloqueado'}`} style={{ '--i': i, '--acento': acento }}>
      <button className="sb-paquete" onClick={alAbrir} disabled={!disponible || abriendo}
        onPointerEnter={alApuntar} onFocus={alApuntar} onTouchStart={alApuntar} aria-label={`Abrir ${nombre}`}>
        <span className="sb-halo" aria-hidden="true" />
        <span className="sb-flota">
          <img src={imagen.src} alt="" draggable={false} />
          {imagen.tinte && <span className="sb-tinte" style={{ '--tinte': imagen.tinte, '--img': `url(${imagen.src})` }} />}
          <span className="sb-reflejo" style={{ '--img': `url(${imagen.src})` }} />
        </span>
        {!disponible && (
          <span className="sb-candado" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
        )}
        <span className="sb-cantidad">{cartas} {queTrae}</span>
      </button>
      <div className="sb-info">
        <b className="sb-nombre">{nombre}</b>
        {manana && !disponible && <Badge className="sb-vuelve">VUELVE EN <Countdown /></Badge>}
        {nota && <small className="sb-nota">{nota}</small>}
        {avance && <><ProgressBar valor={avance.valor} tono="oro" /><small className="sb-avance">{avance.texto}</small></>}
        <GameButton ancho variante={disponible ? 'primary' : 'secondary'} disabled={!disponible || abriendo} onClick={alAbrir}
          style={disponible ? { background: 'var(--acento)', boxShadow: '0 0 18px color-mix(in srgb, var(--acento) 55%, transparent)' } : undefined}>
          {abriendo ? 'ABRIENDO…' : disponible ? `ABRIR${costo ? ` · ${costo} VC` : ''}` : 'BLOQUEADO'}
        </GameButton>
      </div>
    </article>
  );
}

/* El álbum: las cartas que tenés (se dan vuelta con un toque) y la silueta de
   las que faltan, con su rareza y su posición. */
function Album({ album, cuenta }) {
  const [rareza, setRareza] = useState('todas');
  const [rol, setRol] = useState('todas');
  const [soloFaltan, setSoloFaltan] = useState(false);
  const mostradas = useMemo(() => filtrarAlbum(album, { rareza, rol, soloFaltan }), [album, rareza, rol, soloFaltan]);
  if (!album) return <div className="sb-vacio">Cargando la colección…</div>;
  const chip = (clave, activo, onClick, texto, color) => (
    <button key={clave} className={`sb-chip${activo ? ' activo' : ''}`} onClick={onClick} aria-pressed={activo} style={color ? { '--chip': color } : undefined}>{texto}</button>
  );
  return (
    <section className="sb-album">
      <div className="sb-contador jg-entra">
        <div><b>{cuenta.tengo}</b><span> / {cuenta.total}</span></div>
        <ProgressBar valor={cuenta.total ? cuenta.tengo / cuenta.total : 0} alto={10} />
        <small>{cuenta.total - cuenta.tengo ? `Te faltan ${cuenta.total - cuenta.tengo} cartas.` : '¡Completaste el álbum!'}</small>
      </div>
      <div className="sb-filtros" aria-label="Filtrar por rareza">
        {chip('todas', rareza === 'todas', () => setRareza('todas'), 'TODAS')}
        {RAREZAS.filter((r) => cuenta.porRareza[r.id]).map((r) => chip(r.id, rareza === r.id, () => setRareza(r.id),
          <>{r.nombre} <em>{cuenta.porRareza[r.id].tengo}/{cuenta.porRareza[r.id].total}</em></>, `var(--jg-r-${r.id})`))}
      </div>
      <div className="sb-filtros" aria-label="Filtrar por posición">
        {chip('todas', rol === 'todas', () => setRol('todas'), 'TODAS')}
        {POSICIONES.map((p) => chip(p.id, rol === p.id, () => setRol(p.id), p.nombre))}
        {chip('faltan', soloFaltan, () => setSoloFaltan((v) => !v), 'SÓLO LAS QUE FALTAN')}
      </div>
      {mostradas.length === 0 ? (
        <div className="sb-vacio">{cuenta.tengo === 0 ? 'Todavía no tenés cartas. ¡Abrí tu primer sobre!' : 'No hay cartas con estos filtros.'}</div>
      ) : (
        <div className="sb-grilla sb-grilla-album">
          {mostradas.map((c) => (
            <div key={c.catalogo_id} className="sb-lugar">
              {c.tengo
                ? <CartaGiratoria carta={aCarta(c)} etiqueta={nombreDeCarta(c)} />
                : <Silueta c={c} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Silueta({ c }) {
  const nombre = RAREZAS.find((r) => r.id === c.rareza)?.nombre || c.rareza;
  return (
    <div className="sb-silueta" style={{ '--r': `var(--jg-r-${c.rareza}, #64748b)` }} aria-label={`Te falta una carta ${nombre}${c.rol ? ` (${c.rol})` : ''}`}>
      <svg viewBox="0 0 64 80" aria-hidden="true"><circle cx="32" cy="24" r="13" /><path d="M8 78c0-16 10-28 24-28s24 12 24 28z" /></svg>
      <b>?</b>
      <span>{nombre}{c.rol ? ` · ${c.rol}` : ''}</span>
    </div>
  );
}

/* Por qué no se puede abrir un sobre de evento (o qué trae). */
const notaEvento = (ev, monedas) => (
  ev.abiertos_hoy >= ev.por_dia ? `Ya abriste ${ev.por_dia === 1 ? 'el de hoy' : `los ${ev.por_dia} de hoy`}.`
    : ev.total_cartas === 0 ? (ev.permanente ? 'Este sobre todavía no tiene cartas.' : 'El evento todavía no tiene cartas.')
      : ev.costo > (monedas || 0) ? `Te faltan ${ev.costo - (monedas || 0)} ${MONEDA}.`
        // Un sobre creado por el club (sin fechas) no se anuncia como evento.
        : `${ev.permanente ? '' : 'Evento: '}${ev.total_cartas} cartas para juntar · ${ev.por_dia} por día${ev.hasta ? ` · hasta el ${String(ev.hasta).split('-').reverse().join('/')}` : ''}.`
);

/* Un evento se activa sólo a mano, desde la dirección (?evento=demo) y si
   está cargado en EVENTOS: cambia la puesta en escena, nunca las cartas. */
function eventoDeLaDireccion() {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('evento');
  return id && Object.prototype.hasOwnProperty.call(EVENTOS, id) ? id : null;
}

/* Cuando alguien apunta a un sobre con cinemática (o lo toca), el navegador
   empieza a bajar SU video (un solo formato, una sola vez): al abrirlo ya
   está o falta poco. Los demás videos no se bajan. */
function precargarVideo(tipo, evento, escena = null, escenaTipo = null) {
  const v = (escena && varianteDeEscena(escena)) || varianteDeApertura({ tipo, evento, escena: escenaTipo });
  if (v.video) {
    prepararVideo(v.video);
    if (v.video.musica) cargarMusica(v.video.musica);
  }
}

const notaDe = (tipo, e) => {
  if ((e.suspendidos || []).includes(tipo)) return 'Suspendido por el club por ahora.';
  if (tipo === 'premio') return `Ganado en el V-Draft. Tenés ${e.sobres_premio} para abrir.`;
  if (tipo === 'premio_especial') return `Ganado en el V-Draft: ${e.tipos?.premio_especial?.cartas ?? 5} especiales. Tenés ${e.sobres_especiales} para abrir.`;
  if (e.tipos?.[tipo] && e.tipos[tipo].total_cartas === 0) return 'Este sobre todavía no tiene cartas.';
  if (tipo === 'wellness' && !e.disponibles?.wellness) return e.wellness_hecho ? 'Ya lo abriste hoy.' : 'Completá el wellness de hoy.';
  if (tipo === 'racha' && !e.disponibles?.racha) return `Llevás ${e.racha} de ${RACHA_PARA_PREMIO} días seguidos.`;
  if (tipo === 'puntos' && !e.disponibles?.puntos) return e.cartas_total === 0 ? 'No hay cartas.' : `Te faltan ${Math.max(0, (e.costo_puntos ?? COSTO_SOBRE_PUNTOS) - e.puntos)} ${MONEDA}.`;
  if (tipo === 'mega' && !e.disponibles?.mega) {
    if (e.cartas_especiales === 0) return 'El club todavía no tiene cartas especiales.';
    return `Te faltan ${Math.max(0, (e.costo_mega ?? COSTO_MEGA) - e.puntos)} ${MONEDA}. Juntalas con las repetidas.`;
  }
  if (tipo === 'diario' && !e.disponibles?.diario) return 'Ya lo abriste hoy. Volvé mañana.';
  return '';
};

/* Para mostrar las probabilidades reales del club: cuántas cartas hay de cada rareza. */
const cartasDePorRareza = (coleccion) => Object.entries(coleccion?.por_rareza || {})
  .flatMap(([rareza, v]) => Array.from({ length: v.total }, () => ({ rareza })));

function precargarEvento(ev) {
  const v = varianteDeEventoDb(ev);
  if (v.video) {
    prepararVideo(v.video);
    if (v.video.musica) cargarMusica(v.video.musica);
  }
}

function Probabilidades({ catalogo, soloEspeciales = false, reglas = null }) {
  const filas = probabilidades(catalogo, { soloEspeciales, rarezas: reglas?.rarezas, pesos: reglas?.pesos });
  if (!filas.length) return null;
  return (
    <div className="bento-card" style={{ padding: 12, marginBottom: 6 }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 8 }}>
        {soloEspeciales
          ? 'MEGA SOBRE: chance de cada lugar (sólo especiales).'
          : `Chance de cada lugar del sobre. Una carta repetida da ${MONEDA} según su rareza.`}
      </div>
      {filas.map((r) => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 56px 64px', gap: 8, alignItems: 'center', fontSize: 11, fontWeight: 800, marginBottom: 5 }}>
          <span>{r.nombre}</span>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, r.porCiento * 2)}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <span style={{ fontFamily: MONO, textAlign: 'right' }}>{r.porCiento.toFixed(1)}%</span>
          <span style={{ color: 'var(--text-dim)', textAlign: 'right' }}>+{r.puntos} VC</span>
        </div>
      ))}
    </div>
  );
}

/* Las preferencias de la apertura: de quien mira, nunca cambian qué sale. */
function PreferenciasApertura({ prefs, cambiar }) {
  const opcion = (activo) => ({
    padding: '5px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`, color: activo ? 'var(--accent)' : 'var(--text-dim)',
    background: activo ? 'rgba(0,255,136,.08)' : 'transparent',
  });
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '6px 0 8px' }} aria-label="Cómo se abren los sobres">
      <span style={{ ...rotulo, marginBottom: 0, marginRight: 4 }}>APERTURA</span>
      <button style={opcion(prefs.cine !== false)} onClick={() => cambiar('cine', true)} aria-pressed={prefs.cine !== false}>DE CINE</button>
      <button style={opcion(prefs.cine === false)} onClick={() => cambiar('cine', false)} aria-pressed={prefs.cine === false}>SIMPLE</button>
      <span style={{ width: 8 }} />
      <button style={opcion(prefs.velocidad !== 'rapida')} onClick={() => cambiar('velocidad', 'normal')} aria-pressed={prefs.velocidad !== 'rapida'}>NORMAL</button>
      <button style={opcion(prefs.velocidad === 'rapida')} onClick={() => cambiar('velocidad', 'rapida')} aria-pressed={prefs.velocidad === 'rapida'}>RÁPIDA</button>
      <span style={{ width: 8 }} />
      <button style={opcion(prefs.sonido)} onClick={() => cambiar('sonido', !prefs.sonido)} aria-pressed={prefs.sonido}>
        {prefs.sonido ? 'SONIDO: SÍ' : 'SONIDO: NO'}
      </button>
    </div>
  );
}

const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)', marginBottom: 8 };

