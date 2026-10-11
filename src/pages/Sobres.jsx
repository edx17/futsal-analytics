import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CartaJugador from '../components/quinteto/CartaJugador';
import { RAREZAS, SOBRES, COSTO_SOBRE_PUNTOS, RACHA_PARA_PREMIO, rarezaPorId, probabilidades } from '../analytics/sobres';
import { estadoSobres, abrirSobre, coleccionSobres, reiniciarPruebaSobres } from '../utils/sobres';
import { esModoKiosco, RUTA_KIOSCO } from '../utils/kiosco';
import '../components/quinteto/quinteto.css';

/* SOBRES
 *
 * Una sola pantalla para el jugador (Kiosco, /kiosco/sobres) y para el cuerpo
 * técnico (VirtualClub, /sobres). Arriba, los sobres de hoy; abajo, la colección.
 * Las reglas y el sorteo viven en la base: acá sólo se pide y se muestra.
 */

const MONO = 'JetBrains Mono, monospace';
const ORDEN_SOBRES = ['diario', 'wellness', 'racha', 'puntos'];

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

  const abrir = async (tipo) => {
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
    if (!window.confirm('Esto borra TU colección, tus puntos y tus sobres de hoy para volver a probar. ¿Seguro?')) return;
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
          Entrá todos los días y juntá las cartas del plantel. Las repetidas te dan puntos para más sobres.
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
            <Dato rotulo="PUNTOS" valor={estado.puntos} extra={`${COSTO_SOBRE_PUNTOS} = 1 sobre`} />
            <Dato rotulo="RACHA" valor={`${estado.racha}/${RACHA_PARA_PREMIO}`} extra="días seguidos" />
            <Dato rotulo="COLECCIÓN" valor={`${estado.cartas_tengo}/${estado.cartas_total}`} extra="cartas" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 10 }}>
            {ORDEN_SOBRES.filter((t) => t !== 'wellness' || !estado.es_staff).map((t) => (
              <Sobre key={t} sobre={SOBRES[t]} disponible={!!estado.disponibles?.[t]} abriendo={abriendo === t}
                alAbrir={() => abrir(t)} nota={notaDe(t, estado)} />
            ))}
          </div>
          <button onClick={() => setVerProbs((v) => !v)} style={{ ...btn, background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', marginBottom: 6 }}>
            {verProbs ? 'OCULTAR' : 'VER'} PROBABILIDADES
          </button>
          {verProbs && <Probabilidades catalogo={cartasDePorRareza(coleccion)} />}
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
              <div key={c.catalogo_id} style={{ paddingBottom: 6 }}>
                <CartaJugador carta={aCarta(c)} style={{ position: 'relative' }} etiqueta={rarezaPorId[c.rareza]?.nombre} />
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
            Borra tu colección, tus puntos y tus sobres de hoy para volver a probar. No toca a los jugadores.
          </div>
        </div>
      )}

      {resultado && <Apertura resultado={resultado} onCerrar={cerrarResultado} />}
    </div>
  );
}

const notaDe = (tipo, e) => {
  if (tipo === 'wellness' && !e.disponibles?.wellness) return e.wellness_hecho ? 'Ya lo abriste hoy.' : 'Completá el wellness de hoy.';
  if (tipo === 'racha' && !e.disponibles?.racha) return `Llevás ${e.racha} de ${RACHA_PARA_PREMIO} días seguidos.`;
  if (tipo === 'puntos' && !e.disponibles?.puntos) return e.cartas_total === 0 ? 'No hay cartas.' : `Te faltan ${Math.max(0, COSTO_SOBRE_PUNTOS - e.puntos)} puntos.`;
  if (tipo === 'diario' && !e.disponibles?.diario) return 'Ya lo abriste hoy. Volvé mañana.';
  return '';
};

/* Para mostrar las probabilidades reales del club: cuántas cartas hay de cada rareza. */
const cartasDePorRareza = (coleccion) => Object.entries(coleccion?.por_rareza || {})
  .flatMap(([rareza, v]) => Array.from({ length: v.total }, () => ({ rareza })));

function Sobre({ sobre, disponible, abriendo, alAbrir, nota }) {
  return (
    <div className="bento-card" style={{ padding: 14, opacity: disponible ? 1 : 0.6, border: disponible ? '1px solid var(--accent)' : undefined }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em', color: disponible ? 'var(--accent)' : 'var(--text)' }}>{sobre.nombre}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '4px 0 10px', minHeight: '2.4em', lineHeight: 1.4 }}>{nota || sobre.ayuda}</div>
      <button disabled={!disponible || abriendo} onClick={alAbrir} style={{ ...btn, width: '100%', opacity: disponible ? 1 : 0.5 }}>
        {abriendo ? 'ABRIENDO…' : `ABRIR · ${sobre.cartas} CARTAS`}
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

function Probabilidades({ catalogo }) {
  const filas = probabilidades(catalogo);
  return (
    <div className="bento-card" style={{ padding: 12, marginBottom: 6 }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 8 }}>
        Chance de cada lugar del sobre. Una carta repetida da puntos según su rareza.
      </div>
      {filas.map((r) => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 56px 64px', gap: 8, alignItems: 'center', fontSize: 11, fontWeight: 800, marginBottom: 5 }}>
          <span>{r.nombre}</span>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, r.porCiento * 2)}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <span style={{ fontFamily: MONO, textAlign: 'right' }}>{r.porCiento.toFixed(1)}%</span>
          <span style={{ color: 'var(--text-dim)', textAlign: 'right' }}>+{r.puntos} pts</span>
        </div>
      ))}
    </div>
  );
}

/* La apertura: las cartas boca abajo, una por una. */
function Apertura({ resultado, onCerrar }) {
  const [dadas, setDadas] = useState({});
  const todas = resultado.cartas.every((_, i) => dadas[i]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.88)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ color: '#fff', fontWeight: 900, letterSpacing: '.1em', marginBottom: 6 }}>{SOBRES[resultado.tipo]?.nombre}</div>
      <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 22 }}>{todas ? 'Listo.' : 'Tocá cada carta para darla vuelta.'}</div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 30 }}>
        {resultado.cartas.map((c, i) => (
          <div key={c.catalogo_id} style={{ width: 122, textAlign: 'center' }}>
            {dadas[i] ? (
              <>
                <CartaJugador carta={aCarta(c)} style={{ position: 'relative' }} etiqueta={rarezaPorId[c.rareza]?.nombre} />
                <div style={{ marginTop: 30, fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: c.nueva ? '#00ff88' : '#fbbf24' }}>
                  {c.nueva ? 'NUEVA' : `REPETIDA · +${c.puntos} PTS`}
                </div>
              </>
            ) : (
              <button onClick={() => setDadas((d) => ({ ...d, [i]: true }))} aria-label="Dar vuelta la carta" style={{
                width: 122, height: 184, border: '2px solid #00ff88', borderRadius: 10, cursor: 'pointer', fontSize: 40, fontWeight: 900, color: '#00ff88',
                background: 'linear-gradient(160deg, #0a3b26, #04120c)', boxShadow: '0 0 18px rgba(0,255,136,.4)',
              }}>?</button>
            )}
          </div>
        ))}
      </div>
      {todas && resultado.puntos_ganados > 0 && (
        <div style={{ color: '#fbbf24', fontWeight: 900, marginBottom: 14 }}>+{resultado.puntos_ganados} puntos por repetidas</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        {!todas && <button onClick={() => setDadas(Object.fromEntries(resultado.cartas.map((_, i) => [i, true])))} style={{ ...btn, background: 'transparent', color: '#fff', border: '1px solid #4b5563' }}>DAR VUELTA TODAS</button>}
        {todas && <button onClick={onCerrar} style={btn}>LISTO</button>}
      </div>
    </div>
  );
}

const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)', marginBottom: 8 };
const btn = { padding: '10px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', minHeight: 40 };
