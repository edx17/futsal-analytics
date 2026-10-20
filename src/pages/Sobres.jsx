import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CartaGiratoria from '../components/quinteto/CartaGiratoria';
import AperturaSobre from '../components/sobres/AperturaSobre';
import PanelGod from '../components/sobres/PanelGod';
import { useAuth } from '../context/AuthContext';
import { varianteDeApertura, EVENTOS } from '../analytics/aperturas';
import { prepararVideo, liberarVideos } from '../utils/videoApertura';
import { leerPreferencias, guardarPreferencias } from '../utils/preferenciasApertura';
import { prepararAudio, sonidoActivo, cargarMusica } from '../utils/sonidoApertura';
import { RAREZAS, SOBRES, COSTO_SOBRE_PUNTOS, COSTO_MEGA, MONEDA, RACHA_PARA_PREMIO, probabilidades, nombreDeCarta } from '../analytics/sobres';
import { estadoSobres, abrirSobre, coleccionSobres, reiniciarPruebaSobres } from '../utils/sobres';
import { esModoKiosco, RUTA_KIOSCO } from '../utils/kiosco';
import '../components/quinteto/quinteto.css';
import './sobres.css';

/* SOBRES
 *
 * Una sola pantalla para el jugador (Kiosco, /kiosco/sobres) y para el cuerpo
 * técnico (VirtualClub, /sobres). Arriba, los sobres de hoy; abajo, la colección.
 * Las reglas y el sorteo viven en la base: acá sólo se pide y se muestra.
 */

const MONO = 'JetBrains Mono, monospace';
const ORDEN_SOBRES = ['premio_especial', 'premio', 'diario', 'wellness', 'racha', 'puntos', 'mega'];

/* Qué sobres se muestran: el de wellness no es para el staff, y los del V-Draft
   sólo si tenés alguno guardado. */
const seMuestra = (tipo, e) => {
  if (tipo === 'wellness') return !e.es_staff;
  if (tipo === 'premio') return (e.sobres_premio || 0) > 0;
  if (tipo === 'premio_especial') return (e.sobres_especiales || 0) > 0;
  return true;
};

/* Una carta del catálogo en el formato que dibuja CartaJugador. */
const aCarta = (c) => ({ atributos: [], stats: {}, ...(c.carta || c) });

export default function Sobres() {
  const navigate = useNavigate();
  const kiosco = esModoKiosco();
  const [estado, setEstado] = useState(null);
  const [coleccion, setColeccion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [abriendo, setAbriendo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [verProbs, setVerProbs] = useState(false);
  const [prefs, setPrefs] = useState(leerPreferencias);
  const [eventoUrl] = useState(eventoDeLaDireccion); // ?evento=<id> (p. ej. la demo)
  const { perfil } = useAuth() || {};
  /* El evento: el de la dirección, o el que activó el superusuario para el club. */
  const evento = eventoUrl || (estado?.evento && Object.prototype.hasOwnProperty.call(EVENTOS, estado.evento) ? estado.evento : null);
  const esGod = !kiosco && (!!estado?.es_superuser || perfil?.rol === 'superuser');
  /* Una apertura de prueba del modo GOD: { resultado, forzar, evento }. No toca la base. */
  const [prueba, setPrueba] = useState(null);
  const cambiarPref = (clave, valor) => {
    const nuevas = { ...prefs, [clave]: valor };
    setPrefs(nuevas);
    guardarPreferencias(nuevas);
    if (clave === 'sonido') sonidoActivo(valor);
  };

  const cargar = useCallback(async () => {
    const [e, c] = await Promise.all([estadoSobres(), coleccionSobres()]);
    if (e.vencida || c.vencida) { setError('Tu sesión venció. Volvé al menú e ingresá con tu PIN.'); setCargando(false); return; }
    if (e.error || c.error) { setError((e.error || c.error).message); setCargando(false); return; }
    setError(null);
    setEstado(e.data);
    setColeccion(c.data);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => () => liberarVideos(), []); // al salir de la pantalla, nada queda bajando

  const abrir = async (tipo) => {
    if (abriendo || resultado) return; // nunca dos aperturas a la vez
    prepararAudio(prefs.sonido);       // en el toque: el navegador sólo deja sonar así
    precargarVideo(tipo, evento);      // el video baja mientras la base sortea las cartas
    setAbriendo(tipo);
    setError(null);
    const r = await abrirSobre(tipo);
    setAbriendo(null);
    if (r.vencida) { setError('Tu sesión venció. Volvé al menú e ingresá con tu PIN.'); return; }
    if (r.error) { setError(r.error.message); cargar(); return; }
    setResultado(r.data);
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

  const cartas = useMemo(() => (coleccion?.cartas || []), [coleccion]);
  const mostradas = useMemo(
    () => cartas.filter((c) => filtro === 'todas' || c.rareza === filtro)
      .sort((a, b) => (b.carta?.ovr || 0) - (a.carta?.ovr || 0)),
    [cartas, filtro],
  );

  if (cargando) return <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}>Abriendo el paquete…</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: kiosco ? '16px 16px 90px' : '0 0 80px', animation: 'fadeIn 0.3s' }}>
      <div style={{ marginBottom: 16 }}>
        <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>SOBRES</div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
          Entrá todos los días y juntá las cartas del plantel. Las repetidas te dan V-Coins para más sobres.
        </div>
      </div>

      {error && (
        <div style={{ fontSize: '0.85rem', fontWeight: 700, padding: '10px 14px', borderRadius: 8, marginBottom: 14, color: '#ef4444',
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>
          {error}
          {kiosco && error.includes('sesión') && (
            <button onClick={() => navigate(RUTA_KIOSCO)} style={{ ...btn, marginLeft: 10, padding: '6px 10px' }}>IR AL MENÚ</button>
          )}
        </div>
      )}

      {estado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Dato rotulo="V-COINS" valor={estado.puntos} extra={`${COSTO_SOBRE_PUNTOS} = 1 sobre · ${COSTO_MEGA} = 1 mega`} />
            <Dato rotulo="RACHA" valor={`${estado.racha}/${RACHA_PARA_PREMIO}`} extra="días seguidos" />
            <Dato rotulo="COLECCIÓN" valor={`${estado.cartas_tengo}/${estado.cartas_total}`} extra="cartas" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 10 }}>
            {ORDEN_SOBRES.filter((t) => seMuestra(t, estado)).map((t) => (
              <Sobre key={t} sobre={SOBRES[t]} disponible={!!estado.disponibles?.[t]} abriendo={abriendo === t} alApuntar={() => precargarVideo(t, evento)}
                alAbrir={() => abrir(t)} nota={notaDe(t, estado)} monedas={estado.puntos} />
            ))}
          </div>
          <button onClick={() => setVerProbs((v) => !v)} style={{ ...btn, background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', marginBottom: 6 }}>
            {verProbs ? 'OCULTAR' : 'VER'} PROBABILIDADES
          </button>
          <PreferenciasApertura prefs={prefs} cambiar={cambiarPref} />
          {verProbs && <Probabilidades catalogo={cartasDePorRareza(coleccion)} />}
          {verProbs && <Probabilidades catalogo={cartasDePorRareza(coleccion)} soloEspeciales />}
        </>
      )}

      {/* ── colección ── */}
      <div style={{ marginTop: 22 }}>
        <div style={rotulo}>MI COLECCIÓN · {cartas.length}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[{ id: 'todas', nombre: 'TODAS' }, ...RAREZAS].map((r) => {
            const pr = coleccion?.por_rareza?.[r.id];
            return (
              <button key={r.id} onClick={() => setFiltro(r.id)} style={{
                padding: '5px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${filtro === r.id ? 'var(--accent)' : 'var(--border)'}`,
                color: filtro === r.id ? 'var(--accent)' : 'var(--text-dim)',
                background: filtro === r.id ? 'rgba(0,255,136,.08)' : 'transparent',
              }}>{r.nombre}{pr ? ` ${pr.tengo}/${pr.total}` : ''}</button>
            );
          })}
        </div>
        {mostradas.length === 0 ? (
          <div className="bento-card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            {cartas.length === 0 ? 'Todavía no tenés cartas. ¡Abrí tu primer sobre!' : 'No tenés cartas de este tipo.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '14px 10px', justifyItems: 'center' }}>
            {mostradas.map((c) => (
              <div key={c.catalogo_id} style={{ paddingBottom: 30 }}>
                <CartaGiratoria carta={aCarta(c)} etiqueta={nombreDeCarta(c)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {!kiosco && estado?.es_staff && (
        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <button onClick={reiniciar} style={{ ...btn, background: 'transparent', color: 'var(--text-dim)', border: '1px dashed var(--border)' }}>
            REINICIAR MI PRUEBA
          </button>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 6 }}>
            Borra tu colección, tus V-Coins y tus sobres de hoy para volver a probar. No toca a los jugadores.
          </div>
        </div>
      )}

      {esGod && (
        <PanelGod clubId={localStorage.getItem('club_id') || perfil?.club_id} estado={estado} alCambiar={cargar}
          alProbar={(p) => { prepararAudio(prefs.sonido); setPrueba(p); }} />
      )}

      {resultado && <AperturaSobre key={resultado.sobre_id} resultado={resultado} prefs={prefs} evento={evento} onCerrar={cerrarResultado} />}
      {prueba && (
        <AperturaSobre key={prueba.resultado.sobre_id} resultado={prueba.resultado} prefs={{ ...prefs, cine: true }}
          evento={prueba.evento} forzar={prueba.forzar} onCerrar={() => setPrueba(null)} />
      )}
    </div>
  );
}

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
function precargarVideo(tipo, evento) {
  const v = varianteDeApertura({ tipo, evento });
  if (v.video) {
    prepararVideo(v.video);
    if (v.video.musica) cargarMusica(v.video.musica);
  }
}

const notaDe = (tipo, e) => {
  if ((e.suspendidos || []).includes(tipo)) return 'Suspendido por el club por ahora.';
  if (tipo === 'premio') return `Ganado en el V-Draft. Tenés ${e.sobres_premio} para abrir.`;
  if (tipo === 'premio_especial') return `Ganado en el V-Draft: 5 especiales. Tenés ${e.sobres_especiales} para abrir.`;
  if (tipo === 'wellness' && !e.disponibles?.wellness) return e.wellness_hecho ? 'Ya lo abriste hoy.' : 'Completá el wellness de hoy.';
  if (tipo === 'racha' && !e.disponibles?.racha) return `Llevás ${e.racha} de ${RACHA_PARA_PREMIO} días seguidos.`;
  if (tipo === 'puntos' && !e.disponibles?.puntos) return e.cartas_total === 0 ? 'No hay cartas.' : `Te faltan ${Math.max(0, COSTO_SOBRE_PUNTOS - e.puntos)} ${MONEDA}.`;
  if (tipo === 'mega' && !e.disponibles?.mega) {
    if (e.cartas_especiales === 0) return 'El club todavía no tiene cartas especiales.';
    return `Te faltan ${Math.max(0, COSTO_MEGA - e.puntos)} ${MONEDA}. Juntalas con las repetidas.`;
  }
  if (tipo === 'diario' && !e.disponibles?.diario) return 'Ya lo abriste hoy. Volvé mañana.';
  return '';
};

/* Para mostrar las probabilidades reales del club: cuántas cartas hay de cada rareza. */
const cartasDePorRareza = (coleccion) => Object.entries(coleccion?.por_rareza || {})
  .flatMap(([rareza, v]) => Array.from({ length: v.total }, () => ({ rareza })));

function Sobre({ sobre, disponible, abriendo, alAbrir, nota, monedas, alApuntar }) {
  const mega = !!sobre.soloEspeciales && !sobre.premio;
  const dorado = mega;
  const violeta = sobre.id === 'premio' || sobre.id === 'premio_especial';
  const avance = mega ? Math.min(100, ((monedas || 0) / sobre.costo) * 100) : null;
  return (
    <div className={`bento-card${dorado ? ' sb-mega' : ''} sb-t-${sobre.id}`} style={{ padding: 14, opacity: disponible || mega ? 1 : 0.6, border: disponible ? `1px solid ${dorado ? '#fbbf24' : violeta ? '#c084fc' : 'var(--accent)'}` : undefined }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em', color: dorado ? '#fbbf24' : violeta ? '#c084fc' : disponible ? 'var(--accent)' : 'var(--text)' }}>
        {(dorado || violeta) && '★ '}{sobre.nombre}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '4px 0 10px', minHeight: '2.4em', lineHeight: 1.4 }}>{nota || sobre.ayuda}</div>
      {mega && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${avance}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #fde68a)' }} />
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', marginTop: 4, fontFamily: MONO }}>{Math.min(monedas || 0, sobre.costo)} / {sobre.costo} {MONEDA}</div>
        </div>
      )}
      <button disabled={!disponible || abriendo} onClick={alAbrir} onPointerEnter={alApuntar} onFocus={alApuntar} onTouchStart={alApuntar}
        style={{ ...btn, width: '100%', opacity: disponible ? 1 : 0.5, ...(dorado ? { background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' } : violeta ? { background: 'linear-gradient(90deg, #7c3aed, #c084fc)', color: '#fff' } : null) }}>
        {abriendo ? 'ABRIENDO…' : mega ? `ABRIR · ${sobre.cartas} ESPECIALES · ${sobre.costo} V-COINS`
          : sobre.soloEspeciales ? `ABRIR · ${sobre.cartas} ESPECIALES` : `ABRIR · ${sobre.cartas} CARTAS`}
      </button>
    </div>
  );
}

function Dato({ rotulo: r, valor, extra }) {
  return (
    <div className="bento-card" style={{ padding: 12 }}>
      <div style={rotulo}>{r}</div>
      <div style={{ fontSize: 28, fontWeight: 900, fontFamily: MONO, color: 'var(--accent)', lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 4 }}>{extra}</div>
    </div>
  );
}

function Probabilidades({ catalogo, soloEspeciales = false }) {
  const filas = probabilidades(catalogo, { soloEspeciales });
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
const btn = { padding: '10px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', minHeight: 40 };
