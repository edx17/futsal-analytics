import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CartaJugador from '../components/quinteto/CartaJugador';
import { RAREZAS, SOBRES, COSTO_SOBRE_PUNTOS, RACHA_PARA_PREMIO, rarezaPorId, probabilidades } from '../analytics/sobres';
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

/* LA APERTURA
   1. el sobre tiembla cada vez más fuerte (suspenso),
   2. se rompe con un destello,
   3. caen papelitos y aparecen las cartas boca abajo,
   4. se dan vuelta de a una.
   Si en el sobre viene algo muy raro (oro o un premio), el temblor dura más y los
   papelitos son dorados. */
const MUY_RARAS = new Set(['oro', 'totw', 'potw', 'totm', 'potm', 'toty']);
const COLORES_COMUN = ['#00ff88', '#ffffff', '#38bdf8', '#a7f3d0'];
const COLORES_RARA = ['#fbbf24', '#fde68a', '#f59e0b', '#ffffff', '#c084fc', '#38bdf8'];
const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Papelitos({ rara }) {
  const papeles = useMemo(() => {
    const colores = rara ? COLORES_RARA : COLORES_COMUN;
    return Array.from({ length: rara ? 90 : 55 }, (_, i) => ({
      i, left: Math.random() * 100, delay: Math.random() * 1.2, dur: 2.4 + Math.random() * 2,
      dx: (Math.random() - 0.5) * 160, giro: 360 + Math.random() * 720, color: colores[i % colores.length],
      ancho: 6 + Math.random() * 6,
    }));
  }, [rara]);
  return papeles.map((p) => (
    <i key={p.i} className="sb-papel" style={{
      left: `${p.left}%`, background: p.color, width: p.ancho, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
      '--dx': `${p.dx}px`, '--giro': `${p.giro}deg`,
    }} />
  ));
}

function Apertura({ resultado, onCerrar }) {
  const rara = resultado.cartas.some((c) => MUY_RARAS.has(c.rareza));
  const sinMovimiento = reducido();
  const [fase, setFase] = useState(sinMovimiento ? 'cartas' : 'tiembla');
  const [dadas, setDadas] = useState({});
  const todas = resultado.cartas.every((_, i) => dadas[i]);

  useEffect(() => {
    if (fase === 'tiembla') {
      const t = setTimeout(() => setFase('abre'), rara ? 2700 : 1900);
      return () => clearTimeout(t);
    }
    if (fase === 'abre') {
      const t = setTimeout(() => setFase('cartas'), 650);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [fase, rara]);

  const nombreSobre = SOBRES[resultado.tipo]?.nombre || 'SOBRE';
  const enCartas = fase === 'cartas';

  return (
    <div className={`sb-escena sb-fase-${fase}${rara ? ' sb-rara' : ''}`}>
      <div className="sb-flash" />
      {(fase === 'abre' || enCartas) && !sinMovimiento && <Papelitos rara={rara} />}

      {!enCartas && (
        <>
          <div className="sb-sobre" style={{ animationDuration: rara && fase === 'tiembla' ? '2.7s' : undefined }}>
            <div className="sb-sobre-cuerpo" style={{ animationDuration: rara && fase === 'tiembla' ? '2.7s' : undefined }}>
              <span className="sb-sobre-estrella">★</span>
              <span className="sb-sobre-tipo">{nombreSobre}</span>
              <span className="sb-sobre-marca">MYSQUAD</span>
            </div>
          </div>
          <button onClick={() => setFase('cartas')} style={{ ...btn, background: 'transparent', color: '#9ca3af', border: '1px solid #374151', marginTop: 40 }}>SALTAR</button>
        </>
      )}

      {enCartas && (
        <>
          <div style={{ color: '#fff', fontWeight: 900, letterSpacing: '.1em', marginBottom: 6 }}>{nombreSobre}</div>
          <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 22 }}>{todas ? 'Listo.' : 'Tocá cada carta para darla vuelta.'}</div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 30 }}>
            {resultado.cartas.map((c, i) => (
              <div key={c.catalogo_id} className="sb-entra" style={{ width: 122, textAlign: 'center', animationDelay: `${i * 0.12}s` }}>
                {dadas[i] ? (
                  <>
                    <div className={`sb-gira${MUY_RARAS.has(c.rareza) ? ' sb-rara-carta' : ''}`}>
                      <CartaJugador carta={aCarta(c)} style={{ position: 'relative' }} etiqueta={rarezaPorId[c.rareza]?.nombre} />
                    </div>
                    <div style={{ marginTop: 30, fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: c.nueva ? '#00ff88' : '#fbbf24' }}>
                      {c.nueva ? 'NUEVA' : `REPETIDA · +${c.puntos} PTS`}
                    </div>
                  </>
                ) : (
                  <button className="sb-reverso" onClick={() => setDadas((d) => ({ ...d, [i]: true }))} aria-label="Dar vuelta la carta">?</button>
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
        </>
      )}
    </div>
  );
}

const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)', marginBottom: 8 };
const btn = { padding: '10px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', minHeight: 40 };
