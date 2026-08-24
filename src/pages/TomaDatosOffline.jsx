import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import simpleheat from 'simpleheat';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import CanchaTactica from '../components/CanchaTactica';
import { FORMACIONES, FORMACION_POR_DEFECTO, fichaBalon, fichasPropias, tableroInicial } from '../offline/formaciones';
import * as db from '../offline/db';
import { fetchPaginado, fetchPorLotes } from '../utils/supaPaginado';
import { esPartidoPropio, nombreDelRival } from '../utils/partidosPropios';
import { descargarPartido, listarPartidosDescargados, sincronizarPartido, contarPendientes } from '../offline/sync';
import {
  ACCIONES, ACCIONES_POR_ID, BALON_ID, DURACION_PERIODO_MS, ETIQUETAS_TACTICAS, PERIODOS,
  crearEvento, crearRecorrido, crearSecuencia, crearSnapshot, crearStint,
  formatearTiempo, minSegAMs, msAbsoluto, tMsDeEvento, coordDeEvento, espejar, esGol, esPase,
  zonaDe,
} from '../offline/modelo';
import {
  rastrosPorFicha, rangoGrabado, posicionesEn, exportarVideo, descargarBlob, soportaExportar,
} from '../offline/video';
import {
  sembrarStints, dedupStints, minutosPorJugador, puntosDespliegue, grillaDespliegue, centroDespliegue,
  balanceLineaPelota, balonDe, contextoLineaGol, cadenaDeSecuencia, resumenCadena,
  enCanchaEn, stintActivo, resumenPases, indicePerdidas,
} from '../analytics/despliegue';

/* ═══════════════════════════════════════════════════════════════════════════
   ANÁLISIS OFFLINE

   La mesa de trabajo. Se baja el partido una vez —con todo lo que ya cargó
   el tracker en vivo— y a partir de ahí funciona sin una gota de red.

   CÓMO SE USA, en una línea: elegís qué marcar (equipo + acción), tocás la
   cancha, y cuando querés dejar una foto de cómo estaban parados los diez
   pasás el tablero a MOVER, acomodás las fichas y la pelota, y fijás.

   Nada se pierde: todo se escribe en IndexedDB apenas se registra, y se
   sincroniza cuando hay señal.
   ═══════════════════════════════════════════════════════════════════════════ */

const CONTEXTOS = ['5v5', '5v4', '4v5', '5v3', '3v5', '4v4'];

const tarjeta = { background: 'var(--panel)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: '6px', padding: '12px' };
const etiqueta = { fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' };
const inputStyle = { width: '100%', padding: '8px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', fontSize: '0.8rem' };
const boton = { padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 800, fontSize: '0.7rem', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)', background: 'transparent', color: 'var(--text-dim)' };
const botonActivo = (color) => ({ ...boton, borderColor: color, color, background: `${color}18` });

const nombreCorto = (j) => (j ? `${j.dorsal != null ? j.dorsal + ' · ' : ''}${j.apellido || j.nombre || 'Jugador'}` : '—');

/* Debajo de este ancho las dos columnas se apilan y la pantalla necesita
   scroll propio: forzar altura fija ahí esconde media pantalla. */
function useAnchoChico(limite = 1000) {
  const [chico, setChico] = useState(typeof window === 'undefined' ? false : window.innerWidth < limite);
  useEffect(() => {
    let t;
    const medir = () => { clearTimeout(t); t = setTimeout(() => setChico(window.innerWidth < limite), 150); };
    window.addEventListener('resize', medir);
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); };
  }, [limite]);
  return chico;
}

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const arriba = () => setEnLinea(true);
    const abajo = () => setEnLinea(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);
    return () => { window.removeEventListener('online', arriba); window.removeEventListener('offline', abajo); };
  }, []);
  return enLinea;
}

/* ══════════════════════════════════════════════════════════════════════════
   CRONÓMETRO

   Por anclaje, no por ticks: los intervalos se estrangulan en segundo plano
   y pierden tiempo real. Guardamos milisegundos acumulados y, mientras
   corre, un ancla con Date.now(). El transcurrido se CALCULA. Cero deriva.
   Acá además se puede mover a mano, que es lo que hace falta cuando estás
   analizando un partido ya jugado.
   ══════════════════════════════════════════════════════════════════════════ */
function useCronometro(claveGuardado) {
  const [tMs, setTMs] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const anclaRef = useRef(null);
  const acumRef = useRef(0);

  useEffect(() => {
    if (!corriendo) return;
    anclaRef.current = Date.now();
    acumRef.current = tMs;
    const id = setInterval(() => {
      setTMs(acumRef.current + (Date.now() - anclaRef.current));
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corriendo]);

  const fijar = useCallback((ms) => {
    const v = Math.max(0, ms);
    acumRef.current = v;
    anclaRef.current = Date.now();
    setTMs(v);
  }, []);

  /* Se guarda por partido: cerrar la app en el entretiempo no borra el reloj. */
  useEffect(() => {
    if (!claveGuardado) return;
    try { localStorage.setItem(claveGuardado, String(Math.round(tMs))); } catch { /* cuota llena */ }
  }, [claveGuardado, tMs]);

  const restaurar = useCallback(() => {
    if (!claveGuardado) return;
    const crudo = Number(localStorage.getItem(claveGuardado));
    if (Number.isFinite(crudo) && crudo > 0) fijar(crudo);
  }, [claveGuardado, fijar]);

  return { tMs, corriendo, alternar: () => setCorriendo(v => !v), pausar: () => setCorriendo(false), fijar, restaurar };
}

/* ══════════════════════════════════════════════════════════════════════════
   FASE 1: elegir partido

   La lista del club entero es larga, así que lo primero es poder achicarla:
   torneo, categoría, condición y búsqueda por rival. Y cada fila tiene que
   decir de un vistazo cuándo se jugó, dónde y si tiene datos cargados —
   sin eso no se sabe cuál sirve para analizar.

   Los descargados se listan siempre, con o sin red.
   ══════════════════════════════════════════════════════════════════════════ */

const CONDICIONES = { Local: '#00ff88', Visitante: '#f59e0b', Neutral: '#94a3b8' };

/* La fecha viene como texto y no siempre en el mismo formato. */
function fechaLegible(fecha) {
  if (!fecha) return null;
  const iso = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return String(fecha);
}

/* Para ordenar: lo que no tiene fecha va al final. */
const claveFecha = (p) => {
  const iso = String(p?.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}${iso[2]}${iso[3]}` : '00000000';
};

const nombreRival = (p) => p?.rivales?.nombre || p?.rival || 'Rival';

function FichaPartido({ partido, eventos, children }) {
  const cond = partido?.condicion || null;
  const colorCond = CONDICIONES[cond] || 'var(--text-dim)';
  const fecha = fechaLegible(partido?.fecha);

  return (
    <div style={{ ...tarjeta, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>vs {nombreRival(partido).toUpperCase()}</span>
          {cond && (
            <span style={{
              fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.5px', padding: '2px 7px',
              borderRadius: '3px', color: colorCond,
              borderWidth: '1px', borderStyle: 'solid', borderColor: colorCond,
            }}>
              {cond.toUpperCase()}
            </span>
          )}
          {partido?.estado && (
            <span style={{ fontSize: '0.55rem', fontWeight: 900, color: 'var(--text-dim)' }}>
              {partido.estado.toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '3px' }}>
          {[
            fecha || 'sin fecha',
            partido?.horario,
            partido?.categoria,
            partido?.competicion,
            partido?.jornada,
          ].filter(Boolean).join(' · ')}
        </div>

        {(partido?.lugar || eventos != null) && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px' }}>
            {partido?.lugar ? `📍 ${partido.lugar}` : ''}
            {partido?.lugar && eventos != null ? ' · ' : ''}
            {eventos != null && (
              <span style={{ color: eventos > 0 ? 'var(--accent)' : '#f59e0b' }}>
                {eventos > 0 ? `${eventos} evento(s) cargados` : 'sin eventos cargados'}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>{children}</div>
    </div>
  );
}

function SelectorPartido({ clubId, onAbrir, onVolver, showToast }) {
  const [descargados, setDescargados] = useState([]);
  const [remotos, setRemotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [bajando, setBajando] = useState(null);
  const [espacio, setEspacio] = useState(null);
  const enLinea = useEnLinea();

  const [torneos, setTorneos] = useState([]);
  const [fTorneo, setFTorneo] = useState('TODOS');
  const [fCategoria, setFCategoria] = useState('TODAS');
  const [fCondicion, setFCondicion] = useState('TODAS');
  const [soloConEventos, setSoloConEventos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  /* Arranca prendido: lo normal es querer ver los partidos de tu equipo, no
     los cruces entre terceros que trae el fixture del torneo. */
  const [soloMiEquipo, setSoloMiEquipo] = useState(true);

  const refrescarLocales = useCallback(async () => {
    setDescargados(await listarPartidosDescargados());
    setEspacio(await db.espacioDisponible());
  }, []);

  useEffect(() => {
    (async () => {
      await db.pedirPersistencia();
      await refrescarLocales();

      if (!navigator.onLine || !clubId) { setCargando(false); return; }

      try {
        /* Nada de embeds: `partidos` tiene dos claves foráneas hacia
           `rivales` y PostgREST no puede resolver cuál usar. Los nombres se
           cruzan en JS, como en el resto del proyecto. Y va paginado porque
           un torneo largo pasa las 1000 filas que devuelve PostgREST. */
        const [partidos, rivalesData, torneosData] = await Promise.all([
          fetchPaginado(() => supabase
            .from('partidos').select('*').eq('club_id', clubId)
            .order('created_at', { ascending: false }).order('id', { ascending: false })),
          supabase.from('rivales').select('id, nombre').eq('club_id', clubId)
            .then(r => r.data || []),
          supabase.from('torneos').select('id, nombre, categoria').eq('club_id', clubId)
            .order('nombre').then(r => r.data || []),
        ]);

        const mapaRivales = new Map(rivalesData.map(r => [r.id, r]));
        const nombresRivales = new Set(rivalesData.map(r => r.nombre).filter(Boolean));
        const miClub = localStorage.getItem('mi_club') || null;

        const marcados = partidos.map(p => ({
          ...p,
          rivales: { nombre: nombreDelRival(p, mapaRivales) },
          _propio: esPartidoPropio(p, { miClub, nombresRivales }),
        }));

        /* La cuenta de eventos se pide sólo para los partidos propios: un
           cruce entre terceros nunca tiene nada trackeado. Una lectura de
           id_partido por lotes, no un count por partido. */
        const idsPropios = marcados.filter(p => p._propio).map(p => p.id);
        let porPartido = new Map();
        if (idsPropios.length > 0) {
          const filas = await fetchPorLotes(idsPropios, (lote) =>
            supabase.from('eventos').select('id_partido').in('id_partido', lote).order('id_partido')
          ).catch(e => { console.error('[Offline] no se pudieron contar los eventos:', e?.message || e); return []; });
          filas.forEach(f => porPartido.set(f.id_partido, (porPartido.get(f.id_partido) || 0) + 1));
        }

        setTorneos(torneosData);
        setRemotos(marcados.map(p => ({ ...p, _eventos: p._propio ? (porPartido.get(p.id) || 0) : null })));
      } catch (e) {
        console.error('[Offline] no se pudo cargar la lista de partidos:', e?.message || e);
        showToast('No se pudo cargar la lista de partidos. Mirá la consola.', 'error');
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, refrescarLocales]);

  const bajar = async (partido) => {
    setBajando(partido.id);
    try {
      const r = await descargarPartido(partido, clubId);
      await refrescarLocales();
      showToast(`Partido descargado: ${r.eventos} eventos, ${r.jugadores} jugadores.`, 'success');
    } catch (e) {
      showToast(`No se pudo descargar: ${e.message}`, 'error');
    } finally {
      setBajando(null);
    }
  };

  const borrarLocal = async (id) => {
    await db.borrarPartidoCompleto(id);
    await refrescarLocales();
    showToast('Partido borrado del dispositivo.', 'info');
  };

  const idsDescargados = useMemo(() => new Set(descargados.map(d => d.id)), [descargados]);

  /* Los torneos salen de la tabla `torneos`, no del texto libre de
     `competicion`, así el filtro coincide con lo que ves en Torneos.
     `Sin torneo` sólo aparece si de verdad hay partidos sueltos. */
  const haySueltos = useMemo(() => remotos.some(p => !p.torneo_id), [remotos]);
  const categorias = useMemo(
    () => [...new Set(remotos.map(p => p.categoria).filter(Boolean))].sort(),
    [remotos]
  );
  const cantidadPropios = useMemo(() => remotos.filter(p => p._propio).length, [remotos]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return remotos
      .filter(p => !idsDescargados.has(p.id))
      .filter(p => !soloMiEquipo || p._propio)
      .filter(p => fTorneo === 'TODOS'
                || (fTorneo === 'SUELTOS' ? !p.torneo_id : p.torneo_id === fTorneo))
      .filter(p => fCategoria === 'TODAS' || p.categoria === fCategoria)
      .filter(p => fCondicion === 'TODAS' || (p.condicion || 'Local') === fCondicion)
      .filter(p => !soloConEventos || (p._eventos ?? 0) > 0)
      .filter(p => !texto || nombreRival(p).toLowerCase().includes(texto))
      .sort((a, b) => claveFecha(b).localeCompare(claveFecha(a)));
  }, [remotos, idsDescargados, soloMiEquipo, fTorneo, fCategoria, fCondicion, soloConEventos, busqueda]);

  const hayFiltro = fTorneo !== 'TODOS' || fCategoria !== 'TODAS' || fCondicion !== 'TODAS'
                 || soloConEventos || !soloMiEquipo || busqueda.trim();

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', background: 'var(--bg)' }}>
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', paddingBottom: '60px', animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onVolver} style={boton}>⬅ VOLVER</button>
          <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>ANÁLISIS OFFLINE</div>
        </div>
        <div style={{ ...etiqueta, color: enLinea ? 'var(--accent)' : '#f59e0b' }}>
          {enLinea ? '● CONECTADO' : '○ SIN CONEXIÓN'}
          {espacio && ` · ${espacio.usadoMB.toFixed(1)} MB usados`}
        </div>
      </div>

      <div style={{ ...tarjeta, marginBottom: '20px', borderColor: 'var(--accent)' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Descargá el partido una vez y trabajalo sin conexión: cadenas de pases enganchadas
          a los goles que ya cargó el tracker, seguimiento de cada jugador por el campo,
          pases completados e incompletos, pérdidas forzadas y no forzadas, y la línea de la
          pelota para ver cuándo quedamos en inferioridad. Sube solo cuando vuelva la señal.
        </div>
      </div>

      <div style={etiqueta}>EN ESTE DISPOSITIVO</div>
      <div style={{ display: 'grid', gap: '10px', margin: '10px 0 25px' }}>
        {descargados.length === 0 && (
          <div style={{ ...tarjeta, color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            Todavía no descargaste ningún partido.
          </div>
        )}
        {descargados.map(d => (
          <FichaPartido key={d.id} partido={d.partido} eventos={null}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => onAbrir(d.id)} style={botonActivo('var(--accent)')}>ABRIR</button>
                <button onClick={() => borrarLocal(d.id)} style={{ ...boton, borderColor: '#ef4444', color: '#ef4444' }}>BORRAR</button>
              </div>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-dim)' }}>
                {(d.jugadores?.length || 0)} jugadores · bajado {new Date(d.descargado_en).toLocaleDateString()}
              </span>
            </div>
          </FichaPartido>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <div style={etiqueta}>DESCARGAR DEL SERVIDOR</div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
          {filtrados.length} de {remotos.length} partidos de tu club
        </div>
      </div>

      {/* FILTROS */}
      <div style={{ ...tarjeta, margin: '10px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
        <label>
          <div style={{ ...etiqueta, marginBottom: '4px' }}>TORNEO</div>
          <select value={fTorneo} onChange={e => setFTorneo(e.target.value)} style={inputStyle}>
            <option value="TODOS">Todos los torneos</option>
            {torneos.map(t => (
              <option key={t.id} value={t.id}>
                {t.nombre}{t.categoria ? ` · ${t.categoria}` : ''}
              </option>
            ))}
            {haySueltos && <option value="SUELTOS">Sin torneo (amistosos)</option>}
          </select>
        </label>
        <label>
          <div style={{ ...etiqueta, marginBottom: '4px' }}>CATEGORÍA</div>
          <select value={fCategoria} onChange={e => setFCategoria(e.target.value)} style={inputStyle}>
            <option value="TODAS">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <div style={{ ...etiqueta, marginBottom: '4px' }}>CANCHA</div>
          <select value={fCondicion} onChange={e => setFCondicion(e.target.value)} style={inputStyle}>
            <option value="TODAS">Local, visitante y neutral</option>
            {Object.keys(CONDICIONES).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <div style={{ ...etiqueta, marginBottom: '4px' }}>RIVAL</div>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar…" style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setSoloMiEquipo(v => !v)}
                  style={{ ...(soloMiEquipo ? botonActivo('var(--accent)') : boton), padding: '8px 10px' }}
                  title="El fixture de un torneo trae también los cruces entre otros equipos. Con esto ves sólo los tuyos.">
            {soloMiEquipo ? '✓ ' : ''}MI EQUIPO ({cantidadPropios})
          </button>
          <button onClick={() => setSoloConEventos(v => !v)}
                  style={{ ...(soloConEventos ? botonActivo('var(--accent)') : boton), padding: '8px 10px' }}
                  title="Los partidos sin eventos no tienen nada para analizar todavía">
            {soloConEventos ? '✓ ' : ''}CON DATOS
          </button>
          {hayFiltro && (
            <button onClick={() => { setFTorneo('TODOS'); setFCategoria('TODAS'); setFCondicion('TODAS'); setSoloConEventos(false); setSoloMiEquipo(true); setBusqueda(''); }}
                    style={{ ...boton, padding: '8px 10px' }}>
              LIMPIAR
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        {cargando && <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Cargando…</div>}
        {!cargando && !enLinea && (
          <div style={{ ...tarjeta, color: '#f59e0b', fontSize: '0.8rem' }}>
            Sin conexión: sólo podés abrir lo que ya está descargado.
          </div>
        )}
        {!cargando && enLinea && filtrados.length === 0 && (
          <div style={{ ...tarjeta, color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            {remotos.length === 0
              ? 'No hay partidos cargados para tu club.'
              : soloMiEquipo && cantidadPropios === 0
                ? 'Ninguno de los partidos cargados es de tu equipo. Si esperabas verlos, apagá MI EQUIPO para ver el fixture completo.'
                : 'Ningún partido coincide con los filtros.'}
          </div>
        )}
        {filtrados.map(p => (
          <FichaPartido key={p.id} partido={p} eventos={p._eventos}>
            <button onClick={() => bajar(p)} disabled={bajando === p.id} style={botonActivo('var(--accent)')}>
              {bajando === p.id ? 'BAJANDO…' : '↓ DESCARGAR'}
            </button>
          </FichaPartido>
        ))}
      </div>
    </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAPA DE CALOR
   ══════════════════════════════════════════════════════════════════════════ */
function MapaCalor({ puntos, alto = 200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.parentElement?.clientWidth || 400;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!puntos.length) return;

    const heat = simpleheat(canvas);
    heat.data(puntos.map(p => [(p.x / 100) * canvas.width, (p.y / 100) * canvas.height, p.peso ?? 1]));
    heat.radius(Math.max(18, canvas.width / 14), Math.max(12, canvas.width / 22));
    heat.gradient({ 0.2: '#1e3a8a', 0.4: '#0891b2', 0.6: '#22c55e', 0.8: '#facc15', 1.0: '#ef4444' });
    heat.max(Math.max(3, puntos.length / 8));
    heat.draw();
  }, [puntos, alto]);

  return (
    <div className="pitch-container" style={{ position: 'relative', width: '100%', height: `${alto}px`, background: '#060a08' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: '#1f3a2c55' }} />
      <div style={{ position: 'absolute', bottom: '4px', right: '6px', fontSize: '0.55rem', color: '#2f6b4f', fontWeight: 900 }}>ATACAMOS ▶</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FASE 2: la mesa de trabajo
   ══════════════════════════════════════════════════════════════════════════ */
function MesaTrabajo({ idPartido, onSalir, showToast }) {
  const [cargando, setCargando] = useState(true);
  const [cabecera, setCabecera] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [recorridos, setRecorridos] = useState([]);
  const [stints, setStints] = useState([]);
  const [secuencias, setSecuencias] = useState([]);

  const [periodo, setPeriodo] = useState('PT');
  const [invertida, setInvertida] = useState(false);
  const crono = useCronometro(`vc_off_crono_${idPartido}_${periodo}`);
  const tMs = crono.tMs;

  const [tablero, setTablero] = useState('marcar');   // marcar | mover
  const [equipoSel, setEquipoSel] = useState('Propio');
  const [accionSel, setAccionSel] = useState('Pase');
  const [jugadorSel, setJugadorSel] = useState(null);
  const [contextoJuego, setContextoJuego] = useState('5v5');
  const [etiquetaTactica, setEtiquetaTactica] = useState('—');
  const [seguirAuto, setSeguirAuto] = useState(true);

  const [puntoOrigen, setPuntoOrigen] = useState(null);
  const [pendiente, setPendiente] = useState(null);      // pregunta de resultado / pérdida
  const [secuenciaActiva, setSecuenciaActiva] = useState(null);
  const [golObjetivo, setGolObjetivo] = useState(null);

  const [posiciones, setPosiciones] = useState([]);
  const [fichaSel, setFichaSel] = useState(null);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [etiquetas, setEtiquetas] = useState('dorsal');   // dorsal | apellido | ninguna
  const [mostrarZonas, setMostrarZonas] = useState(true);

  /* Reproducción y exportación del movimiento grabado */
  const [reproduciendo, setReproduciendo] = useState(false);
  const [duracionVideo, setDuracionVideo] = useState(20);
  const [exportando, setExportando] = useState(0);
  const puedeExportar = useMemo(() => soportaExportar(), []);

  const [tab, setTab] = useState('eventos');
  const [jugadorFoco, setJugadorFoco] = useState(null);
  const [pendientes, setPendientes] = useState({ total: 0 });
  const [sincronizando, setSincronizando] = useState(false);

  const enLinea = useEnLinea();
  const anchoChico = useAnchoChico();
  const clubId = cabecera?.club_id || localStorage.getItem('club_id');
  const recorridosRef = useRef({});   // clave ficha → local_id del rastro abierto
  const sembradoRef = useRef(false);  // freno al doble montaje en modo estricto

  /* ── Carga ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const datos = await db.cargarPartidoCompleto(idPartido);
      if (!datos.cabecera) { showToast('Ese partido no está descargado.', 'error'); onSalir(); return; }
      setCabecera(datos.cabecera);
      setEventos(datos.eventos);
      setSnapshots(datos.snapshots);
      setRecorridos(datos.recorridos);
      setSecuencias(datos.secuencias);

      /* Sin stints guardados, los sembramos de los cambios del tracker. Es
         una propuesta: el analista después la corrige.

         El ref frena el doble montaje: React en modo estricto corre este
         efecto dos veces en desarrollo, y sin el freno sembraba los tramos
         dos veces (cada jugador terminaba repetido en la botonera). */
      let stintsIniciales = datos.stints;
      if (stintsIniciales.length === 0 && !sembradoRef.current) {
        sembradoRef.current = true;
        const recheck = await db.leerPorPartido('stints', idPartido);
        if (recheck.length === 0) {
          stintsIniciales = sembrarStints({
            eventos: datos.eventos,
            titulares: datos.cabecera.titulares || [],
            clubId: datos.cabecera.club_id,
            idPartido,
          });
          await db.guardarVarios('stints', stintsIniciales);
        } else {
          stintsIniciales = recheck;
        }
      }

      /* Y si ya quedaron duplicados de antes, se limpian al abrir. */
      const { stints: limpios, descartados } = dedupStints(stintsIniciales);
      if (descartados.length > 0) {
        for (const s of descartados) await db.borrar('stints', s.local_id);
        showToast(`Se limpiaron ${descartados.length} tramo(s) duplicado(s).`, 'info');
      }
      setStints(limpios);

      const enCancha = (datos.cabecera.jugadores || []).filter(j =>
        (datos.cabecera.titulares || []).includes(String(j.id)));
      setPosiciones(tableroInicial(enCancha.length ? enCancha : (datos.cabecera.jugadores || []).slice(0, 5)));
      setCargando(false);
      crono.restaurar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPartido]);

  const refrescarPendientes = useCallback(async () => {
    setPendientes(await contarPendientes(idPartido));
  }, [idPartido]);

  useEffect(() => { if (!cargando) refrescarPendientes(); },
    [cargando, eventos, snapshots, recorridos, stints, secuencias, refrescarPendientes]);

  const jugadores = useMemo(() => cabecera?.jugadores || [], [cabecera]);
  const jugadorPorId = useMemo(() => Object.fromEntries(jugadores.map(j => [String(j.id), j])), [jugadores]);
  const idArquero = useMemo(() => {
    const a = jugadores.find(j => /arquero|portero/i.test(j.posicion || ''));
    return a ? String(a.id) : null;
  }, [jugadores]);

  const quintetoActual = useMemo(() => {
    const desdeStints = enCanchaEn(stints, periodo, tMs);
    return desdeStints.length ? desdeStints : (cabecera?.titulares || []);
  }, [stints, periodo, tMs, cabecera]);

  const eventosOrdenados = useMemo(
    () => [...eventos].sort((a, b) => msAbsoluto(a.periodo, tMsDeEvento(a)) - msAbsoluto(b.periodo, tMsDeEvento(b))),
    [eventos]
  );

  const eventosCercanos = useMemo(() => {
    const ahora = msAbsoluto(periodo, tMs);
    return eventosOrdenados.filter(ev => Math.abs(msAbsoluto(ev.periodo, tMsDeEvento(ev)) - ahora) <= 90000);
  }, [eventosOrdenados, periodo, tMs]);

  /* ── Reproducción del movimiento grabado ───────────────────────────────
     Durante la reproducción el tablero no se edita: las fichas se calculan
     interpolando los puntos que se fueron marcando. */
  const rastros = useMemo(() => rastrosPorFicha(recorridos, periodo), [recorridos, periodo]);
  const rango = useMemo(() => rangoGrabado(recorridos, periodo), [recorridos, periodo]);
  const posicionesVista = useMemo(
    () => (reproduciendo ? posicionesEn(posiciones, rastros, tMs) : posiciones),
    [reproduciendo, posiciones, rastros, tMs]
  );

  useEffect(() => {
    if (!reproduciendo) return;
    if (!rango) { setReproduciendo(false); return; }
    crono.pausar();
    crono.fijar(rango.desde);
    const paso = 40;
    const avancePorTick = (rango.duracionMs / (duracionVideo * 1000)) * paso;
    let t = rango.desde;
    const id = setInterval(() => {
      t += avancePorTick;
      if (t >= rango.hasta) { crono.fijar(rango.hasta); setReproduciendo(false); return; }
      crono.fijar(t);
    }, paso);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reproduciendo]);

  const exportar = async () => {
    if (!rango) { showToast('Todavía no hay movimiento grabado en este período. Movés las fichas y se graba solo.', 'warning'); return; }
    try {
      setExportando(1);
      const blob = await exportarVideo({
        base: posiciones, recorridos, periodo,
        desdeMs: rango.desde, hastaMs: rango.hasta,
        invertida, etiquetas: etiquetas === 'ninguna' ? 'dorsal' : etiquetas,
        zonas: mostrarZonas, duracionSegundos: duracionVideo,
        titulo: `vs ${cabecera?.partido?.rivales?.nombre || cabecera?.partido?.rival || 'Rival'}`,
        onProgreso: (pct) => setExportando(Math.max(1, pct)),
      });
      descargarBlob(blob, `despliegue_${periodo}_${new Date().toISOString().slice(0, 10)}.webm`);
      showToast('Video descargado.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setExportando(0);
    }
  };

  /* ── La línea de la pelota, en vivo ────────────────────────────────────── */
  const balon = useMemo(() => balonDe(posicionesVista), [posicionesVista]);
  const fase = equipoSel === 'Propio' ? 'ofensiva' : 'defensiva';
  const linea = useMemo(
    () => balanceLineaPelota({ posiciones: posicionesVista, balon, fase, idArquero }),
    [posicionesVista, balon, fase, idArquero]
  );

  /* ── Persistencia ──────────────────────────────────────────────────────── */
  const guardarEvento = async (evento) => {
    await db.guardar('eventos', evento);
    setEventos(prev => [...prev, evento]);
    return evento;
  };

  const actualizarEvento = async (evento) => {
    /* Un evento que ya vive en el servidor pasa a 'editado': el
       sincronizador lo actualiza por id en vez de insertarlo. */
    const actualizado = { ...evento, _estado: evento.id != null ? 'editado' : 'local' };
    await db.guardar('eventos', actualizado);
    setEventos(prev => prev.map(e => (e.local_id === actualizado.local_id ? actualizado : e)));
    return actualizado;
  };

  const borrarEvento = async (ev) => {
    if (ev._estado === 'sincronizado' && ev.id != null) {
      showToast('Ese evento vino del tracker en vivo. Se edita, no se borra desde acá.', 'warning');
      return;
    }
    await db.borrar('eventos', ev.local_id);
    setEventos(prev => prev.filter(e => e.local_id !== ev.local_id));
    showToast('Evento borrado.', 'info');
  };

  /* ── SEGUIMIENTO POSICIONAL ────────────────────────────────────────────────
     Cada vez que soltás una ficha queda un punto con su minuto. El rastro se
     cuelga del tramo en cancha: empieza cuando el jugador entra y se cierra
     cuando sale. Eso es "seguir a cada jugador hasta que entra o sale". */
  const registrarPosicion = useCallback(async (clave, x, y) => {
    if (!seguirAuto || clave === BALON_ID || !clubId) return;

    const esRival = String(clave).startsWith('r');
    const ficha = posiciones.find(p => String(p.id_jugador) === String(clave));
    const stint = esRival ? null : stintActivo(stints, clave, periodo, tMs);
    const claveRastro = `${periodo}_${clave}_${stint?.local_id || 'libre'}`;

    const existenteId = recorridosRef.current[claveRastro];
    const existente = existenteId ? recorridos.find(r => r.local_id === existenteId) : null;

    if (existente) {
      const actualizado = {
        ...existente,
        puntos: [...existente.puntos, { x, y, t_ms: tMs }],
        t_fin_ms: tMs,
        _estado: existente.id != null ? 'editado' : 'local',
      };
      await db.guardar('recorridos', actualizado);
      setRecorridos(prev => prev.map(r => (r.local_id === actualizado.local_id ? actualizado : r)));
      return;
    }

    const nuevo = crearRecorrido({
      clubId, idPartido,
      idJugador: esRival ? null : clave,
      equipo: esRival ? 'Rival' : 'Propio',
      dorsalRival: esRival ? ficha?.dorsal : null,
      stintLocalId: stint?.local_id || null,
      periodo, tInicioMs: tMs, tFinMs: tMs,
      puntos: [{ x, y, t_ms: tMs }],
    });
    recorridosRef.current[claveRastro] = nuevo.local_id;
    await db.guardar('recorridos', nuevo);
    setRecorridos(prev => [...prev, nuevo]);
  }, [seguirAuto, clubId, idPartido, posiciones, stints, periodo, tMs, recorridos]);

  const moverFicha = useCallback((clave, x, y, opciones = {}) => {
    setPosiciones(prev => prev.map(p => (String(p.id_jugador) === String(clave) ? { ...p, x, y } : p)));
    if (opciones.soltado) registrarPosicion(clave, x, y);
  }, [registrarPosicion]);

  /* ── Registrar acciones ────────────────────────────────────────────────── */
  const fotoActual = () => posiciones.map(p => ({
    id_jugador: p.id_jugador, equipo: p.equipo, dorsal: p.dorsal ?? null,
    x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)),
  }));

  const tocarCancha = (p) => {
    const def = ACCIONES_POR_ID[accionSel];
    if (def?.destino && !puntoOrigen) { setPuntoOrigen(p); return; }

    const origen = def?.destino ? puntoOrigen : p;
    const destino = def?.destino ? p : null;

    /* Acciones que piden una respuesta más: el pase pregunta si llegó, la
       pérdida si fue forzada. Un toque más, y el dato deja de ser opinión. */
    if (def?.resultado || def?.perdida) { setPendiente({ origen, destino, def }); return; }

    registrarAccion({ origen, destino });
    setPuntoOrigen(null);
  };

  const registrarAccion = async ({ origen, destino, paseCompletado = null, tipoPerdida = null, idReceptor = null }) => {
    const def = ACCIONES_POR_ID[accionSel];
    let secuencia = secuenciaActiva;
    let orden = null;

    /* Toda acción abre o continúa una cadena. Así la secuencia se arma sola
       mientras cargás, sin un modo aparte. */
    if (!secuencia) {
      secuencia = crearSecuencia({
        clubId, idPartido, equipo: equipoSel, periodo, tInicioMs: tMs,
        etiquetaTactica: etiquetaTactica === '—' ? null : etiquetaTactica,
      });
      await db.guardar('secuencias', secuencia);
      setSecuencias(prev => [...prev, secuencia]);
      setSecuenciaActiva(secuencia);
    }
    orden = cadenaDeSecuencia(eventos, secuencia.id).length + 1;

    const evento = crearEvento({
      clubId, idPartido, accion: accionSel, equipo: equipoSel, periodo, tMs,
      idJugador: equipoSel === 'Propio' ? jugadorSel : null,
      idReceptor,
      x: origen?.x, y: origen?.y,
      xFin: destino?.x, yFin: destino?.y,
      quinteto: quintetoActual,
      contextoJuego,
      secuenciaId: secuencia.id,
      ordenSecuencia: orden,
      etiquetaTactica: etiquetaTactica === '—' ? null : etiquetaTactica,
      paseCompletado, tipoPerdida,
      bajoPresion: tipoPerdida === 'forzada' ? true : null,
      posiciones: fotoActual(),
      linea,
    });

    await guardarEvento(evento);

    /* La pelota sigue a la jugada: queda donde terminó la acción. */
    const finPelota = destino || origen;
    if (finPelota) moverFicha(BALON_ID, finPelota.x, finPelota.y);

    if (def?.cierra) await cerrarSecuencia(secuencia, evento);
    else {
      const sec = { ...secuencia, cantidad_pases: (secuencia.cantidad_pases || 0) + (esPase(accionSel) ? 1 : 0), _estado: 'local' };
      await db.guardar('secuencias', sec);
      setSecuencias(prev => prev.map(s => (s.id === sec.id ? sec : s)));
      setSecuenciaActiva(sec);
    }

    /* Si el pase llegó a un compañero, el que sigue con la pelota es él. */
    if (idReceptor) setJugadorSel(String(idReceptor));
    showToast(`${accionSel}${paseCompletado === false ? ' (no llegó)' : ''} registrado`, 'success');
  };

  const responderPendiente = async (respuesta, idReceptor = null) => {
    const p = pendiente;
    setPendiente(null);
    setPuntoOrigen(null);
    if (!p) return;
    if (p.def.resultado) await registrarAccion({ origen: p.origen, destino: p.destino, paseCompletado: respuesta, idReceptor });
    else await registrarAccion({ origen: p.origen, destino: p.destino, tipoPerdida: respuesta });
  };

  /* Cierra la cadena. Si hay un gol apuntado (uno que YA existe, cargado por
     el tracker en vivo), la cadena se le engancha: ése es el punto de todo
     esto, que la secuencia y el gol sean la misma jugada. */
  const cerrarSecuencia = async (secuencia, eventoFinal = null) => {
    if (!secuencia) return;
    const cadena = cadenaDeSecuencia([...eventos, eventoFinal].filter(Boolean), secuencia.id);
    const pases = cadena.filter(e => esPase(e.accion));

    const sec = {
      ...secuencia,
      t_fin_ms: tMs,
      resultado: eventoFinal?.accion || golObjetivo?.accion || 'Sin cierre',
      id_evento_final: golObjetivo?.id ?? null,
      _local_id_evento_final: eventoFinal?.local_id ?? null,
      cantidad_pases: pases.length,
      pases_completados: pases.filter(e => e.pase_completado === true).length,
      pases_incompletos: pases.filter(e => e.pase_completado === false).length,
      _estado: 'local',
    };
    await db.guardar('secuencias', sec);
    setSecuencias(prev => prev.map(s => (s.id === sec.id ? sec : s)));

    if (golObjetivo) {
      /* El gol cierra la cadena, así que va último. Sin orden explícito
         caería en 0 y el resumen quedaría al revés. */
      const golActualizado = {
        ...golObjetivo,
        secuencia_id: sec.id,
        orden_secuencia: cadena.length + 1,
      };
      await actualizarEvento(golActualizado);
      showToast(`Cadena enganchada al ${golObjetivo.accion} del ${golObjetivo.minuto}'`, 'success');
      setGolObjetivo(null);
    }

    setSecuenciaActiva(null);
    setPuntoOrigen(null);
  };

  /* EL ARRANQUE DEL PERÍODO. Poner el reloj en cero no alcanza: queda
     registrado como evento, así después se sabe en qué momento del video o
     del partido empezó cada tiempo. Marcarlo de nuevo pisa el anterior. */
  const marcarInicioPeriodo = async () => {
    const accion = `Inicio ${periodo}`;
    const previos = eventos.filter(e => e.accion === accion && e.periodo === periodo);
    for (const viejo of previos) {
      if (viejo._estado !== 'sincronizado') {
        await db.borrar('eventos', viejo.local_id);
        setEventos(prev => prev.filter(e => e.local_id !== viejo.local_id));
      }
    }

    const marca = crearEvento({
      clubId, idPartido, accion, equipo: 'Propio', periodo, tMs: 0,
      quinteto: quintetoActual, contextoJuego,
    });
    await guardarEvento(marca);

    crono.fijar(0);
    if (!crono.corriendo) crono.alternar();
    showToast(`${periodo} arrancado. Reloj en 0:00 y corriendo.`, 'success');
  };

  const inicioMarcado = useMemo(
    () => eventos.some(e => e.accion === `Inicio ${periodo}` && e.periodo === periodo),
    [eventos, periodo]
  );

  const fijarSnapshot = async (eventoVinculado = null) => {
    const snap = crearSnapshot({
      clubId, idPartido, periodo, tMs,
      posiciones: fotoActual(),
      balon: balon ? { x: balon.x, y: balon.y } : null,
      contextoJuego,
      etiquetaTactica: etiquetaTactica === '—' ? null : etiquetaTactica,
      linea,
      localIdEvento: eventoVinculado?.local_id ?? null,
      idEvento: eventoVinculado?.id ?? null,
    });
    await db.guardar('snapshots', snap);
    setSnapshots(prev => [...prev, snap]);
    showToast(`Foto fijada en ${periodo} ${formatearTiempo(tMs)}${linea ? ` · ${linea.marcador}` : ''}`, 'success');
    return snap;
  };

  /* Le pega la foto y el balance al gol que ya estaba cargado. */
  const aplicarFotoAlGol = async (gol) => {
    if (!linea) { showToast('Poné la pelota en el tablero para calcular la línea.', 'warning'); return; }
    await actualizarEvento({
      ...gol,
      posiciones: fotoActual(),
      defensores_linea: linea.defensores,
      atacantes_linea: linea.atacantes,
      balance_linea: linea.balance,
    });
    showToast(`Guardado en el gol: ${linea.marcador} (${linea.etiqueta.toLowerCase()})`, 'success');
  };

  const aplicarFormacion = (nombre, equipo) => {
    const base = FORMACIONES[nombre] || FORMACIONES[FORMACION_POR_DEFECTO];
    setPosiciones(prev => {
      let i = -1;
      return prev.map(p => {
        if (p.id_jugador === BALON_ID) return p;
        if ((equipo === 'Rival') !== (p.equipo === 'Rival')) return p;
        i += 1;
        const b = base[i % base.length];
        return equipo === 'Rival' ? { ...p, x: 100 - b.x, y: 100 - b.y } : { ...p, x: b.x, y: b.y };
      });
    });
  };

  /* Trae al tablero el quinteto que estaba en cancha en este momento. */
  const alinearConQuinteto = () => {
    const enCancha = quintetoActual.map(id => jugadorPorId[String(id)]).filter(Boolean);
    if (enCancha.length === 0) { showToast('No hay quinteto para este momento.', 'warning'); return; }
    const previas = Object.fromEntries(posiciones.map(p => [String(p.id_jugador), p]));
    setPosiciones([
      ...fichasPropias(enCancha).map(p => (previas[p.id_jugador] ? { ...p, x: previas[p.id_jugador].x, y: previas[p.id_jugador].y } : p)),
      ...posiciones.filter(p => p.equipo === 'Rival'),
      balon || fichaBalon(),
    ]);
    showToast('Tablero alineado con el quinteto de este minuto.', 'info');
  };

  const cambiarDorsalRival = (clave, dorsal) =>
    setPosiciones(prev => prev.map(p => (String(p.id_jugador) === String(clave) ? { ...p, dorsal } : p)));

  /* ── Stints ────────────────────────────────────────────────────────────── */
  const editarStint = async (stint, campo, valorMs) => {
    const actualizado = { ...stint, [campo]: valorMs, ajustado: true, _estado: stint.id != null ? 'editado' : 'local' };
    await db.guardar('stints', actualizado);
    setStints(prev => prev.map(s => (s.local_id === actualizado.local_id ? actualizado : s)));
  };

  const agregarStint = async (idJugador) => {
    const nuevo = crearStint({ clubId, idPartido, idJugador, periodo, entradaMs: tMs, salidaMs: DURACION_PERIODO_MS, ajustado: true });
    await db.guardar('stints', nuevo);
    setStints(prev => [...prev, nuevo]);
  };

  const borrarStint = async (stint) => {
    await db.borrar('stints', stint.local_id);
    setStints(prev => prev.filter(s => s.local_id !== stint.local_id));
  };

  const minutos = useMemo(() => minutosPorJugador(stints), [stints]);
  const pases = useMemo(() => resumenPases(eventos), [eventos]);
  const perdidas = useMemo(() => indicePerdidas(eventos), [eventos]);
  const goles = useMemo(
    () => eventosOrdenados.filter(ev => esGol(ev.accion))
      .map(gol => ({ gol, linea: contextoLineaGol(gol, snapshots, { idArquero }) })),
    [eventosOrdenados, snapshots, idArquero]
  );

  const puntosFoco = useMemo(
    () => (jugadorFoco ? puntosDespliegue({ idJugador: jugadorFoco, recorridos, snapshots, eventos }) : []),
    [jugadorFoco, recorridos, snapshots, eventos]
  );
  const centroFoco = useMemo(() => centroDespliegue(puntosFoco), [puntosFoco]);
  const grillaFoco = useMemo(() => grillaDespliegue(puntosFoco), [puntosFoco]);

  /* ── Sincronización ────────────────────────────────────────────────────── */
  const sincronizar = async () => {
    if (!enLinea) { showToast('Sin conexión. Todo queda guardado en el dispositivo.', 'warning'); return; }
    setSincronizando(true);
    try {
      const r = await sincronizarPartido(idPartido);
      const total = r.eventos + r.snapshots + r.recorridos + r.stints + r.secuencias;
      showToast(`${total} registro(s) sincronizado(s).`, 'success');
      if (r.sinTabla.length) {
        showToast(`Falta correr la migración: no existen ${r.sinTabla.join(', ')}. Eso quedó en el dispositivo.`, 'warning');
      } else if (r.omitidas.length) {
        showToast(`Columnas que tu base todavía no tiene: ${r.omitidas.join(', ')}. Corré la migración para no perderlas.`, 'warning');
      }
      const datos = await db.cargarPartidoCompleto(idPartido);
      setEventos(datos.eventos);
      setSnapshots(datos.snapshots);
      setRecorridos(datos.recorridos);
      setStints(datos.stints);
      setSecuencias(datos.secuencias);
    } catch (e) {
      showToast(`No se pudo sincronizar: ${e.message}`, 'error');
    } finally {
      setSincronizando(false);
      refrescarPendientes();
    }
  };

  /* Sube solo cuando vuelve la señal, sin que nadie apriete nada. */
  useEffect(() => {
    if (!enLinea || pendientes.total === 0 || sincronizando) return;
    const id = setTimeout(() => sincronizar(), 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea]);

  /* ── Atajos de teclado ─────────────────────────────────────────────────── */
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey) return;
      if (e.code === 'Space') { e.preventDefault(); crono.alternar(); return; }
      if (e.key === 'Tab') { e.preventDefault(); setTablero(v => (v === 'marcar' ? 'mover' : 'marcar')); return; }
      if (e.key === 'Escape') { setPuntoOrigen(null); setPendiente(null); return; }
      const acc = ACCIONES.find(a => a.tecla?.toLowerCase() === e.key.toLowerCase());
      if (acc) { setAccionSel(acc.id); setPuntoOrigen(null); }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) return <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: '60px' }}>Abriendo partido…</div>;

  const cadenaActiva = secuenciaActiva ? cadenaDeSecuencia(eventos, secuenciaActiva.id) : [];
  const def = ACCIONES_POR_ID[accionSel];
  const rival = cabecera.partido?.rivales?.nombre || cabecera.partido?.rival || 'Rival';
  const colorEquipo = equipoSel === 'Propio' ? 'var(--accent)' : '#ef4444';

  /* Capa de eventos cercanos sobre la cancha grande */
  const capaEventos = (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
      {eventosCercanos.map(ev => {
        const c = coordDeEvento(ev);
        if (c.x == null) return null;
        const p = espejar(c, invertida);
        const fin = ev.zona_x_fin != null ? espejar({ x: ev.zona_x_fin, y: ev.zona_y_fin }, invertida) : null;
        const color = ACCIONES_POR_ID[ev.accion]?.color || (esGol(ev.accion) ? '#00ff88' : '#64748b');
        const enCadena = secuenciaActiva && ev.secuencia_id === secuenciaActiva.id;
        const fallado = ev.pase_completado === false;
        return (
          <g key={ev.local_id} opacity={enCadena ? 1 : 0.45}>
            {fin && (
              <line x1={`${p.x}%`} y1={`${p.y}%`} x2={`${fin.x}%`} y2={`${fin.y}%`}
                    stroke={fallado ? '#ef4444' : color} strokeWidth={enCadena ? 2.5 : 1.5}
                    strokeDasharray={fallado || ev.accion === 'Conducción' ? '5 4' : 'none'} />
            )}
            <circle cx={`${p.x}%`} cy={`${p.y}%`} r={enCadena ? 6 : 4} fill={color} />
            {enCadena && ev.orden_secuencia != null && (
              <text x={`${p.x}%`} y={`${p.y}%`} dy="-9" fill={color} fontSize="10" fontWeight="900" textAnchor="middle">
                {ev.orden_secuencia}
              </text>
            )}
          </g>
        );
      })}
      {puntoOrigen && (() => {
        const v = espejar(puntoOrigen, invertida);
        return <circle cx={`${v.x}%`} cy={`${v.y}%`} r="8" fill="none" stroke="var(--accent)" strokeWidth="2" />;
      })()}
    </svg>
  );

  return (
    /* Altura fija y sin scroll: lo único que se desliza es la caja de la
       derecha. En pantallas angostas se permite scroll, porque las dos
       columnas se apilan y no entran. */
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)',
      overflowY: anchoChico ? 'auto' : 'hidden', overflowX: 'hidden',
    }}>

      {/* ══ BARRA SUPERIOR: cronómetro y sincronización ══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={onSalir} style={boton}>⬅ SALIR</button>
        <div className="stat-label" style={{ fontSize: '0.72rem' }}>OFFLINE // vs {rival.toUpperCase()}</div>

        <select value={periodo} onChange={e => { setPeriodo(e.target.value); crono.pausar(); }} style={{ ...inputStyle, width: 'auto' }}>
          {PERIODOS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* CRONÓMETRO */}
        <button onClick={crono.alternar}
                title="Espacio"
                style={{ ...boton, padding: '8px 14px', borderColor: crono.corriendo ? '#f59e0b' : 'var(--accent)', color: crono.corriendo ? '#f59e0b' : 'var(--accent)', fontSize: '0.85rem' }}>
          {crono.corriendo ? '⏸ PAUSA' : '▶ CORRER'}
        </button>
        <input
          value={formatearTiempo(tMs)}
          onChange={e => {
            const [m, s] = e.target.value.split(':');
            crono.fijar(minSegAMs(Number(m) || 0, Number(s) || 0));
          }}
          style={{ ...inputStyle, width: '78px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', color: crono.corriendo ? '#f59e0b' : 'var(--accent)', fontWeight: 900 }}
        />
        <div style={{ display: 'flex', gap: '3px' }}>
          {[-60000, -10000, -1000, 1000, 10000, 60000].map(d => (
            <button key={d} onClick={() => crono.fijar(tMs + d)} style={{ ...boton, padding: '6px 7px', fontSize: '0.62rem' }}>
              {d > 0 ? '+' : ''}{d / 1000}
            </button>
          ))}
        </div>
        <input type="range" min={0} max={DURACION_PERIODO_MS} step={1000} value={Math.min(tMs, DURACION_PERIODO_MS)}
               onChange={e => crono.fijar(Number(e.target.value))}
               style={{ flex: '1 1 140px', minWidth: '110px', accentColor: 'var(--accent)' }} />

        <button onClick={marcarInicioPeriodo}
                title={`Pone el reloj en 0:00, lo arranca y deja registrado el comienzo del ${periodo}`}
                style={inicioMarcado ? botonActivo('#22d3ee') : { ...boton, borderColor: '#22d3ee', color: '#22d3ee' }}>
          ⚑ {inicioMarcado ? `${periodo} MARCADO` : `INICIO ${periodo}`}
        </button>

        <button onClick={() => setInvertida(v => !v)} style={boton} title="Invertir la cancha">⇄</button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...etiqueta, color: enLinea ? 'var(--accent)' : '#f59e0b' }}>
            {enLinea ? '● ONLINE' : '○ OFFLINE'} · {pendientes.total} SIN SUBIR
          </span>
          <button onClick={sincronizar} disabled={sincronizando || !enLinea}
                  style={{ ...botonActivo('var(--accent)'), opacity: enLinea ? 1 : 0.4 }}>
            {sincronizando ? 'SUBIENDO…' : '↑ SINCRONIZAR'}
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex', flex: 1, minHeight: 0, flexWrap: 'wrap',
        overflow: anchoChico ? 'visible' : 'hidden',
      }}>

        {/* ══ COLUMNA IZQUIERDA: la cancha ══ */}
        <div style={{
          flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column',
          minHeight: anchoChico ? '70vh' : 0, overflow: 'hidden',
        }}>

          {/* Modo del tablero + estado de lo que se va a marcar */}
          <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setTablero('marcar')} title="Tab"
                      style={tablero === 'marcar' ? botonActivo('#22d3ee') : boton}>⚡ MARCAR</button>
              <button onClick={() => { setTablero('mover'); setPuntoOrigen(null); }} title="Tab"
                      style={tablero === 'mover' ? botonActivo('#facc15') : boton}>✋ MOVER FICHAS</button>
            </div>

            <div style={{
              padding: '6px 12px', borderRadius: '4px', border: `2px solid ${colorEquipo}`,
              color: colorEquipo, fontWeight: 900, fontSize: '0.72rem', background: `${colorEquipo}18`,
            }}>
              {equipoSel === 'Propio' ? '● NUESTRO' : '● RIVAL'} · {def?.label || accionSel}
            </div>

            {puntoOrigen && zonaDe(puntoOrigen.x, puntoOrigen.y) && (
              <div style={{
                padding: '6px 10px', borderRadius: '4px', border: '1px solid #a78bfa',
                color: '#a78bfa', fontWeight: 900, fontSize: '0.7rem',
              }} title={zonaDe(puntoOrigen.x, puntoOrigen.y).nombre}>
                ORIGEN {zonaDe(puntoOrigen.x, puntoOrigen.y).etiqueta}
              </div>
            )}

            {linea && (
              <div style={{
                padding: '6px 12px', borderRadius: '4px',
                border: `1px solid ${linea.critico ? '#ef4444' : '#22d3ee'}`,
                color: linea.critico ? '#ef4444' : '#22d3ee', fontWeight: 900, fontSize: '0.72rem',
              }}
                   title="Rivales a la altura de la pelota o por delante, contra los nuestros que quedaron entre la pelota y el arco">
                LÍNEA DE LA PELOTA {linea.marcador} · {linea.etiqueta.toUpperCase()}
              </div>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button onClick={() => setReproduciendo(v => !v)} disabled={!rango}
                      title={rango ? 'Volver a pasar el movimiento grabado' : 'Todavía no hay movimiento grabado en este período'}
                      style={{ ...(reproduciendo ? botonActivo('#facc15') : boton), opacity: rango ? 1 : 0.4 }}>
                {reproduciendo ? '⏹ PARAR' : '▶ REPRODUCIR'}
              </button>
              <button onClick={exportar} disabled={!rango || exportando > 0 || !puedeExportar}
                      title={puedeExportar
                        ? 'Descarga un .webm con el movimiento de las fichas'
                        : 'Este navegador no puede grabar video desde la app. Probá con Chrome o Edge.'}
                      style={{ ...boton, opacity: rango && !exportando && puedeExportar ? 1 : 0.4 }}>
                {exportando > 0 ? `EXPORTANDO ${exportando}%` : '⬇ EXPORTAR VIDEO'}
              </button>
              <select value={duracionVideo} onChange={e => setDuracionVideo(Number(e.target.value))}
                      title="Cuánto dura el video" style={{ ...inputStyle, width: 'auto', padding: '5px', fontSize: '0.62rem' }}>
                {[10, 20, 30, 60].map(d => <option key={d} value={d}>{d}s</option>)}
              </select>
              <button onClick={() => setAyudaAbierta(v => !v)} style={boton}>? CÓMO SE USA</button>
            </div>
          </div>

          {ayudaAbierta && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--panel)', fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
              <b style={{ color: 'var(--text)' }}>⚡ MARCAR</b> — tocás la cancha y se registra la acción elegida en el panel de la derecha.
              Las acciones con dos toques (pase, recepción, conducción) piden primero el origen y después el destino;
              abajo a la izquierda de la cancha dice siempre cuál toque estás dando.<br />
              <b style={{ color: 'var(--text)' }}>✋ MOVER FICHAS</b> — arrastrás a los jugadores y la pelota. Cada vez que soltás
              una ficha queda guardada su posición en ese minuto: así se arma el seguimiento y el mapa de calor de cada uno.<br />
              <b style={{ color: 'var(--text)' }}>Mío o del rival</b> — el botón NUESTRO/RIVAL de la derecha. Verde = nuestro,
              rojo = rival, y el cartel de arriba te lo repite. Las fichas siguen el mismo código de color.<br />
              <b style={{ color: 'var(--text)' }}>La pelota</b> — es la ficha blanca. Su posición dibuja la línea vertical: todo lo
              sombreado es lo que queda entre la pelota y nuestro arco. Ahí se cuenta el 3v2.<br />
              <b style={{ color: 'var(--text)' }}>Zonas</b> — la cancha se lee en cuatro zonas de 10 metros desde nuestro arco
              (Z1, Z2, Z3, Z4) por tres carriles: Izquierdo, Centro y Derecho, nombrados desde el que ataca.
              Doce cuadrados. Cada evento guarda su zona solo, así que después podés pedir "las pérdidas no forzadas en Z2-C".<br />
              <b style={{ color: 'var(--text)' }}>▶ Reproducir / ⬇ Exportar</b> — vuelve a pasar todo el movimiento que grabaste
              moviendo fichas, y lo baja como archivo de video. Con APELLIDO puesto, cada ficha lleva el nombre encima.<br />
              <b style={{ color: 'var(--text)' }}>Atajos</b> — Espacio: cronómetro · Tab: cambiar de modo · Esc: cancelar ·
              {ACCIONES.filter(a => a.tecla).map(a => ` ${a.tecla}: ${a.label}`).join(' ·')}
            </div>
          )}

          {/* CANCHA GRANDE */}
          <div style={{ flex: 1, minHeight: '280px', padding: '8px 10px', position: 'relative' }}>
            <CanchaTactica
              posiciones={posicionesVista}
              onMover={moverFicha}
              onTocarCancha={tocarCancha}
              /* Durante la reproducción el tablero es de sólo lectura: lo que
                 se ve sale de los rastros, no se edita. */
              modo={reproduciendo ? 'ver' : tablero}
              invertida={invertida}
              seleccionada={fichaSel}
              onSeleccionar={setFichaSel}
              linea={linea}
              etiquetas={etiquetas}
              mostrarZonas={mostrarZonas}
              tamFicha={30}
            >
              {capaEventos}

              {/* Guía del próximo toque, dentro de la cancha */}
              {!reproduciendo && tablero === 'marcar' && def?.guia && !pendiente && (
                <div style={{ position: 'absolute', left: '10px', bottom: '8px', fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 800, pointerEvents: 'none', zIndex: 16 }}>
                  {def.destino
                    ? (puntoOrigen ? `2 de 2 · ${def.guia[1]}` : `1 de 2 · ${def.guia[0]}`)
                    : `1 de 1 · ${def.guia[0]}`}
                </div>
              )}
              {!reproduciendo && tablero === 'mover' && (
                <div style={{ position: 'absolute', left: '10px', bottom: '8px', fontSize: '0.7rem', color: '#facc15', fontWeight: 800, pointerEvents: 'none', zIndex: 16 }}>
                  Arrastrá jugadores y pelota. Al soltar queda guardada la posición del minuto {formatearTiempo(tMs)}.
                </div>
              )}
              {reproduciendo && (
                <div style={{ position: 'absolute', left: '10px', bottom: '8px', fontSize: '0.7rem', color: '#facc15', fontWeight: 800, pointerEvents: 'none', zIndex: 16 }}>
                  ▶ Reproduciendo el movimiento grabado · {periodo} {formatearTiempo(tMs)}
                </div>
              )}
            </CanchaTactica>

            {/* PREGUNTA DE UN TOQUE: ¿llegó el pase? ¿fue forzada la pérdida? */}
            {pendiente && (
              <div style={{
                position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.72)', zIndex: 20, padding: '20px',
              }}>
                <div style={{ ...tarjeta, maxWidth: '440px', width: '100%', borderColor: 'var(--accent)' }}>
                  <div style={{ ...etiqueta, marginBottom: '10px' }}>
                    {pendiente.def.resultado ? '¿El pase llegó?' : '¿Por qué se perdió?'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {pendiente.def.resultado ? (
                      <>
                        <button onClick={() => responderPendiente(true)} style={{ ...botonActivo('var(--accent)'), flex: 1, padding: '14px' }}>✓ COMPLETADO</button>
                        <button onClick={() => responderPendiente(false)} style={{ ...botonActivo('#ef4444'), flex: 1, padding: '14px' }}>✗ INCOMPLETO</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => responderPendiente('forzada')} style={{ ...botonActivo('#f59e0b'), flex: 1, padding: '14px' }}>
                          FORZADA<br /><span style={{ fontSize: '0.6rem', opacity: 0.8 }}>te presionaron</span>
                        </button>
                        <button onClick={() => responderPendiente('no_forzada')} style={{ ...botonActivo('#ef4444'), flex: 1, padding: '14px' }}>
                          NO FORZADA<br /><span style={{ fontSize: '0.6rem', opacity: 0.8 }}>error técnico</span>
                        </button>
                      </>
                    )}
                  </div>

                  {pendiente.def.resultado && equipoSel === 'Propio' && (
                    <>
                      <div style={{ ...etiqueta, margin: '12px 0 5px' }}>¿A quién? (opcional)</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {quintetoActual.filter(id => String(id) !== String(jugadorSel)).map(id => {
                          const j = jugadorPorId[String(id)];
                          if (!j) return null;
                          return (
                            <button key={id} onClick={() => responderPendiente(true, id)} style={{ ...boton, padding: '6px 8px' }}>
                              {nombreCorto(j)}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <button onClick={() => { setPendiente(null); setPuntoOrigen(null); }}
                          style={{ ...boton, width: '100%', marginTop: '12px' }}>CANCELAR (Esc)</button>
                </div>
              </div>
            )}
          </div>

          {/* ══ BARRA DEL TABLERO: todo lo que antes vivía en el mapita ══ */}
          <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--panel)', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
            <select onChange={e => e.target.value && aplicarFormacion(e.target.value, 'Propio')} value=""
                    style={{ ...inputStyle, width: 'auto', padding: '4px 6px', fontSize: '0.62rem' }}>
              <option value="">Nuestra parada…</option>
              {Object.keys(FORMACIONES).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select onChange={e => e.target.value && aplicarFormacion(e.target.value, 'Rival')} value=""
                    style={{ ...inputStyle, width: 'auto', padding: '4px 6px', fontSize: '0.62rem' }}>
              <option value="">Parada rival…</option>
              {Object.keys(FORMACIONES).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button onClick={alinearConQuinteto} style={{ ...boton, padding: '5px 8px' }}>QUINTETO DE ESTE MINUTO</button>
            <button onClick={() => fijarSnapshot()} style={{ ...botonActivo('var(--accent)'), padding: '5px 10px' }}>📸 FIJAR FOTO</button>

            {/* Cómo se ven las fichas */}
            <div style={{ display: 'flex', gap: '3px' }}>
              {[['dorsal', 'DORSAL'], ['apellido', 'APELLIDO'], ['ninguna', 'SIN NOMBRE']].map(([id, l]) => (
                <button key={id} onClick={() => setEtiquetas(id)}
                        style={{ ...(etiquetas === id ? botonActivo('#22d3ee') : boton), padding: '4px 7px', fontSize: '0.58rem' }}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={() => setMostrarZonas(v => !v)}
                    style={{ ...(mostrarZonas ? botonActivo('#22d3ee') : boton), padding: '4px 7px', fontSize: '0.58rem' }}
                    title="Z1 a Z4 desde nuestro arco, por carril Izquierdo / Centro / Derecho">
              ZONAS
            </button>

            <label style={{ ...etiqueta, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={seguirAuto} onChange={e => setSeguirAuto(e.target.checked)} />
              GRABAR AL MOVER
            </label>

            {/* Dorsal del rival elegido: así identificás quién es quién */}
            {fichaSel && String(fichaSel).startsWith('r') && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.62rem', color: '#ef4444', fontWeight: 800 }}>
                DORSAL RIVAL
                <input type="number" min="1" max="99"
                       value={posiciones.find(p => String(p.id_jugador) === fichaSel)?.dorsal ?? ''}
                       onChange={e => cambiarDorsalRival(fichaSel, Number(e.target.value))}
                       style={{ ...inputStyle, width: '54px', padding: '3px', textAlign: 'center' }} />
              </span>
            )}

            <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: 'var(--text-dim)' }}>
              {snapshots.filter(s => s.periodo === periodo).length} foto(s) · {recorridos.length} rastro(s)
              {rango ? ` · grabado ${formatearTiempo(rango.desde)}–${formatearTiempo(rango.hasta)}` : ''}
            </span>
          </div>
        </div>

        {/* ══ PANEL DERECHO ══ */}
        <div style={{
          flex: '0 1 370px', minWidth: '300px', borderLeft: '1px solid var(--border)',
          background: 'var(--panel)', display: 'flex', flexDirection: 'column',
          minHeight: 0, overflow: 'hidden',
        }}>

          {/* La botonera no puede comerse toda la altura: se le pone techo y,
              si no entra, scrollea ella sola. */}
          <div style={{
            padding: '10px', borderBottom: '1px solid var(--border)',
            flexShrink: 0, maxHeight: anchoChico ? 'none' : '58%', overflowY: 'auto',
          }}>
            {/* DE QUIÉN ES LO QUE MARCO */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {['Propio', 'Rival'].map(eq => {
                const c = eq === 'Propio' ? 'var(--accent)' : '#ef4444';
                const activo = equipoSel === eq;
                return (
                  <button key={eq} onClick={() => { setEquipoSel(eq); if (eq === 'Rival') setJugadorSel(null); }}
                          style={{ ...(activo ? botonActivo(c) : boton), flex: 1, padding: '11px', fontSize: '0.78rem' }}>
                    {activo ? '● ' : '○ '}{eq === 'Propio' ? 'NUESTRO' : 'RIVAL'}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '8px' }}>
              {ACCIONES.map(a => (
                <button key={a.id} onClick={() => { setAccionSel(a.id); setPuntoOrigen(null); }}
                        title={a.tecla ? `Tecla ${a.tecla}` : ''}
                        style={{ ...(accionSel === a.id ? botonActivo(a.color) : boton), padding: '7px 3px', fontSize: '0.6rem' }}>
                  {a.label}{a.tecla ? <span style={{ opacity: 0.45 }}> {a.tecla}</span> : null}
                </button>
              ))}
            </div>

            <div style={{ ...etiqueta, marginBottom: '4px' }}>
              JUGADOR CON LA PELOTA {equipoSel === 'Rival' ? '(no aplica al rival)' : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', opacity: equipoSel === 'Rival' ? 0.35 : 1, pointerEvents: equipoSel === 'Rival' ? 'none' : 'auto' }}>
              {quintetoActual.map(id => {
                const j = jugadorPorId[String(id)];
                if (!j) return null;
                const activo = String(jugadorSel) === String(id);
                return (
                  <button key={id} onClick={() => setJugadorSel(activo ? null : id)}
                          style={{ ...(activo ? botonActivo('var(--accent)') : boton), padding: '6px 8px' }}>
                    {nombreCorto(j)}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <label style={{ flex: 1 }}>
                <div style={{ ...etiqueta, marginBottom: '3px' }}>TIPO DE JUGADA (opcional)</div>
                <select value={etiquetaTactica} onChange={e => setEtiquetaTactica(e.target.value)}
                        title="Cómo nació la jugada. Queda pegado a todo lo que marques hasta que lo cambies."
                        style={{ ...inputStyle, fontSize: '0.68rem' }}>
                  {ETIQUETAS_TACTICAS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ width: '92px' }}>
                <div style={{ ...etiqueta, marginBottom: '3px' }}>EN CANCHA</div>
                <select value={contextoJuego} onChange={e => setContextoJuego(e.target.value)}
                        title="Cuántos somos contra cuántos son, por expulsados o portero-jugador"
                        style={{ ...inputStyle, fontSize: '0.68rem' }}>
                  {CONTEXTOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            {/* Cadena en curso */}
            <div style={{ marginTop: '10px', padding: '8px', border: `1px dashed ${secuenciaActiva ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '4px' }}>
              {secuenciaActiva ? (
                <>
                  <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 800 }}>
                    CADENA ABIERTA · {cadenaActiva.length} acción(es)
                    {golObjetivo && ` → ${golObjetivo.accion} del ${golObjetivo.minuto}'`}
                  </div>
                  <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)', margin: '4px 0' }}>
                    {cadenaActiva.map(e => `${e.orden_secuencia}. ${e.accion}${e.pase_completado === false ? '✗' : ''}`).join('  →  ') || 'Tocá la cancha.'}
                  </div>
                  <button onClick={() => cerrarSecuencia(secuenciaActiva)} style={{ ...botonActivo('var(--accent)'), width: '100%' }}>
                    CERRAR CADENA{golObjetivo ? ' Y ENGANCHAR AL GOL' : ''}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                  {golObjetivo
                    ? `Apuntado: ${golObjetivo.accion} del ${golObjetivo.minuto}'. Cargá la jugada y se le engancha sola.`
                    : 'La cadena se abre sola al marcar la primera acción. Para colgarla de un gol ya cargado, buscalo en EVENTOS y tocá ⛓.'}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {[
              { id: 'eventos', label: 'EVENTOS' },
              { id: 'goles', label: 'GOLES' },
              { id: 'balance', label: 'BALANCE' },
              { id: 'minutos', label: 'MINUTOS' },
              { id: 'calor', label: 'CALOR' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                      style={{ ...boton, flex: 1, borderWidth: 0, borderBottomWidth: '2px', borderBottomColor: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? 'var(--accent)' : 'var(--text-dim)', borderRadius: 0, fontSize: '0.58rem', padding: '9px 2px' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* LA CAJA. Todo lo de las pestañas vive acá adentro y se desliza
              acá adentro, nunca la pantalla entera. */}
          <div style={{
            flex: '1 1 0', minHeight: anchoChico ? '260px' : '150px',
            overflowY: 'auto', overflowX: 'hidden', padding: '10px',
          }}>
            {tab === 'eventos' && (
              <ListaEventos
                eventos={eventosOrdenados} jugadorPorId={jugadorPorId} secuencias={secuencias}
                golObjetivo={golObjetivo}
                onApuntarGol={(ev) => { setGolObjetivo(ev); setPeriodo(ev.periodo || 'PT'); crono.fijar(tMsDeEvento(ev)); }}
                onIrA={(ev) => { setPeriodo(ev.periodo || 'PT'); crono.fijar(tMsDeEvento(ev)); }}
                onBorrar={borrarEvento}
              />
            )}
            {tab === 'goles' && (
              <TabGoles goles={goles} jugadorPorId={jugadorPorId} secuencias={secuencias} eventos={eventos}
                        onAplicarFoto={aplicarFotoAlGol}
                        onIrA={(ev) => { setPeriodo(ev.periodo || 'PT'); crono.fijar(tMsDeEvento(ev)); }} />
            )}
            {tab === 'balance' && <TabBalance pases={pases} perdidas={perdidas} jugadorPorId={jugadorPorId} snapshots={snapshots} />}
            {tab === 'minutos' && (
              <TabMinutos jugadores={jugadores} stints={stints} minutos={minutos}
                          onEditar={editarStint} onAgregar={agregarStint} onBorrar={borrarStint} />
            )}
            {tab === 'calor' && (
              <TabCalor jugadores={jugadores} jugadorFoco={jugadorFoco} setJugadorFoco={setJugadorFoco}
                        puntos={puntosFoco} centro={centroFoco} grilla={grillaFoco}
                        recorridos={recorridos} snapshots={snapshots} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PANELES
   ══════════════════════════════════════════════════════════════════════════ */

function ListaEventos({ eventos, jugadorPorId, secuencias, golObjetivo, onApuntarGol, onIrA, onBorrar }) {
  const [filtro, setFiltro] = useState('todos');

  const visibles = eventos.filter(ev => {
    if (filtro === 'goles') return esGol(ev.accion);
    if (filtro === 'offline') return ev.origen_captura === 'offline';
    if (filtro === 'cadenas') return ev.secuencia_id != null;
    return true;
  });

  return (
    <>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {[['todos', 'TODOS'], ['goles', 'GOLES'], ['cadenas', 'EN CADENA'], ['offline', 'OFFLINE']].map(([id, l]) => (
          <button key={id} onClick={() => setFiltro(id)}
                  style={{ ...(filtro === id ? botonActivo('var(--accent)') : boton), flex: 1, padding: '5px 2px', fontSize: '0.56rem' }}>
            {l}
          </button>
        ))}
      </div>

      {visibles.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Nada para mostrar.</div>}

      {visibles.slice().reverse().map(ev => {
        const color = ACCIONES_POR_ID[ev.accion]?.color || (esGol(ev.accion) ? '#00ff88' : '#64748b');
        const sec = secuencias.find(s => s.id === ev.secuencia_id);
        const apuntado = golObjetivo?.local_id === ev.local_id;
        return (
          <div key={ev.local_id} style={{
            display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', marginBottom: '4px',
            background: apuntado ? 'rgba(0,255,136,0.08)' : 'var(--bg)',
            border: `1px solid ${apuntado ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '4px', fontSize: '0.68rem',
          }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)', cursor: 'pointer' }} onClick={() => onIrA(ev)}>
              {ev.periodo} {formatearTiempo(tMsDeEvento(ev))}
            </span>
            {ev.zona_tactica && (
              <span title="Zona y carril" style={{ color: '#a78bfa', fontWeight: 900, fontSize: '0.6rem' }}>
                {ev.zona_tactica}{ev.zona_tactica_fin && ev.zona_tactica_fin !== ev.zona_tactica ? `→${ev.zona_tactica_fin}` : ''}
              </span>
            )}
            <span style={{ color, fontWeight: 800, flex: 1 }}>
              {ev.accion}
              {ev.pase_completado === false ? ' ✗' : ev.pase_completado === true ? ' ✓' : ''}
              {ev.tipo_perdida ? ` (${ev.tipo_perdida.replace('_', ' ')})` : ''}
              {ev.id_jugador ? ` · ${nombreCorto(jugadorPorId[String(ev.id_jugador)])}` : ''}
              {ev.equipo === 'Rival' ? ' (riv)' : ''}
            </span>
            {sec && <span title="Pertenece a una cadena" style={{ color: 'var(--accent)' }}>🔗</span>}
            {ev._estado !== 'sincronizado' && <span title="Sin subir" style={{ color: '#f59e0b' }}>●</span>}
            {esGol(ev.accion) && (
              <button onClick={() => onApuntarGol(ev)} title="Colgarle una cadena de pases a este gol"
                      style={{ ...(apuntado ? botonActivo('var(--accent)') : boton), padding: '3px 6px' }}>⛓</button>
            )}
            {ev._estado !== 'sincronizado' && (
              <button onClick={() => onBorrar(ev)} style={{ ...boton, padding: '3px 6px', borderColor: '#ef4444', color: '#ef4444' }}>×</button>
            )}
          </div>
        );
      })}
    </>
  );
}

function TabGoles({ goles, jugadorPorId, secuencias, eventos, onAplicarFoto, onIrA }) {
  if (goles.length === 0) return <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Todavía no hay goles cargados en este partido.</div>;

  return goles.map(({ gol, linea }) => {
    const sec = secuencias.find(s => s.id === gol.secuencia_id);
    const cadena = sec ? cadenaDeSecuencia(eventos, sec.id) : [];
    const resumen = resumenCadena(cadena);
    const aFavor = gol.equipo === 'Propio';
    const critico = linea && linea.etiqueta === 'Inferioridad';

    return (
      <div key={gol.local_id} style={{ ...tarjeta, marginBottom: '10px', borderColor: aFavor ? 'var(--accent)' : '#ef4444' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontWeight: 900, color: aFavor ? 'var(--accent)' : '#ef4444', fontSize: '0.78rem' }}>
            {aFavor ? 'GOL A FAVOR' : 'GOL EN CONTRA'} · {gol.periodo} {formatearTiempo(tMsDeEvento(gol))}
          </div>
          <button onClick={() => onIrA(gol)} style={{ ...boton, padding: '3px 6px' }}>IR</button>
        </div>
        {gol.id_jugador && (
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '2px' }}>
            {nombreCorto(jugadorPorId[String(gol.id_jugador)])}
            {gol.id_asistencia ? ` · asiste ${nombreCorto(jugadorPorId[String(gol.id_asistencia)])}` : ''}
          </div>
        )}

        <div style={{ marginTop: '10px' }}>
          <div style={etiqueta}>LÍNEA DE LA PELOTA</div>
          {linea ? (
            <>
              <div style={{ color: critico ? '#ef4444' : 'var(--accent)', fontWeight: 900, fontSize: '1.15rem' }}>
                {linea.marcador} <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>{linea.etiqueta.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>
                {linea.atacantes} atacando · {linea.defensores} {aFavor ? 'defendiendo ellos' : 'nuestros por detrás de la pelota'}
                {linea.guardado ? ' · guardado' : linea.desfaseMs ? ` · foto a ${(linea.desfaseMs / 1000).toFixed(0)}s` : ''}
              </div>
              {!linea.guardado && (
                <button onClick={() => onAplicarFoto(gol)} style={{ ...botonActivo('var(--accent)'), width: '100%', marginTop: '7px' }}>
                  GUARDAR ESTA FOTO EN EL GOL
                </button>
              )}
            </>
          ) : (
            <div style={{ fontSize: '0.65rem', color: '#f59e0b' }}>
              Sin foto. Poné el reloj en el gol, acomodá las fichas y la pelota, y tocá &ldquo;GUARDAR ESTA FOTO EN EL GOL&rdquo;.
              <button onClick={() => onAplicarFoto(gol)} style={{ ...botonActivo('#f59e0b'), width: '100%', marginTop: '7px' }}>
                GUARDAR ESTA FOTO EN EL GOL
              </button>
            </div>
          )}
        </div>

        {resumen && (
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <div style={etiqueta}>CADENA PREVIA</div>
            <div style={{ fontSize: '0.68rem' }}>
              {resumen.pases} pase(s) · {resumen.completados}✓ {resumen.incompletos}✗ · {(resumen.duracionMs / 1000).toFixed(1)}s ·
              avanzó {resumen.avanceCampo} de campo{resumen.inicioEnCampoPropio ? ' · arrancó en campo propio' : ''}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '3px' }}>
              {cadena.map(e => `${e.accion}${e.id_jugador ? ` (${nombreCorto(jugadorPorId[String(e.id_jugador)])})` : ''}`).join(' → ')}
            </div>
          </div>
        )}
      </div>
    );
  });
}

function TabBalance({ pases, perdidas, jugadorPorId, snapshots }) {
  const inferioridades = snapshots.filter(s => s.balance_linea != null && s.balance_linea < 0);

  return (
    <>
      <div style={{ ...tarjeta, marginBottom: '10px' }}>
        <div style={etiqueta}>PASES</div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'baseline', marginTop: '4px' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>
            {pases.precision != null ? `${pases.precision}%` : '—'}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            {pases.completados} completados · {pases.incompletos} incompletos
          </span>
        </div>
        {pases.sinMarcar > 0 && (
          <div style={{ fontSize: '0.6rem', color: '#f59e0b', marginTop: '3px' }}>
            {pases.sinMarcar} pase(s) del tracker en vivo sin resultado marcado: no cuentan en la precisión.
          </div>
        )}
        <div style={{ marginTop: '8px' }}>
          {Object.entries(pases.porJugador)
            .filter(([, o]) => o.completados + o.incompletos > 0)
            .sort((a, b) => (b[1].precision ?? 0) - (a[1].precision ?? 0))
            .map(([id, o]) => (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', padding: '2px 0' }}>
                <span>{nombreCorto(jugadorPorId[id]) || 'Sin jugador'}</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {o.completados}/{o.completados + o.incompletos}
                  <b style={{ color: 'var(--accent)', marginLeft: '6px' }}>{o.precision != null ? `${o.precision}%` : '—'}</b>
                </span>
              </div>
            ))}
        </div>
      </div>

      <div style={{ ...tarjeta, marginBottom: '10px' }}>
        <div style={etiqueta}>PÉRDIDAS</div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'baseline', marginTop: '4px' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>{perdidas.total}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            {perdidas.forzadas} forzadas · {perdidas.noForzadas} no forzadas
            {perdidas.pctNoForzadas != null && ` (${perdidas.pctNoForzadas}% evitables)`}
          </span>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '6px' }}>
          Por zona: {perdidas.porZona.defensivo} defensivo · {perdidas.porZona.medio} medio · {perdidas.porZona.ofensivo} ofensivo
        </div>
        {perdidas.noForzadasEnSalida > 0 && (
          <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: '4px', fontWeight: 800 }}>
            ⚠ {perdidas.noForzadasEnSalida} pérdida(s) no forzada(s) en zona de salida
          </div>
        )}
      </div>

      <div style={tarjeta}>
        <div style={etiqueta}>FOTOS EN INFERIORIDAD</div>
        {inferioridades.length === 0 ? (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Ninguna todavía. Cada vez que fijás una foto con la pelota puesta, si quedamos con menos
            gente por detrás de la línea aparece acá.
          </div>
        ) : inferioridades.map(s => (
          <div key={s.local_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', padding: '3px 0' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>
              {s.periodo} {formatearTiempo(s.t_ms)}
            </span>
            <span style={{ color: '#ef4444', fontWeight: 900 }}>
              {s.atacantes_linea}v{s.defensores_linea}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function TabMinutos({ jugadores, stints, minutos, onEditar, onAgregar, onBorrar }) {
  const editarCampo = (stint, campo) => (e) => {
    const [m, s] = e.target.value.split(':');
    onEditar(stint, campo, minSegAMs(Number(m) || 0, Number(s) || 0));
  };

  return (
    <>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
        Los tramos salen de los cambios que cargó el tracker. Corregilos: acá es donde el
        minutaje deja de ser una estimación.
      </div>
      {jugadores.map(j => {
        const suyos = stints.filter(s => String(s.id_jugador) === String(j.id));
        return (
          <div key={j.id} style={{ ...tarjeta, marginBottom: '8px', padding: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.73rem' }}>{nombreCorto(j)}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '0.78rem' }}>
                {(minutos[String(j.id)] || 0).toFixed(1)}′
              </span>
            </div>
            {suyos.map(s => (
              <div key={s.local_id} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px', fontSize: '0.63rem' }}>
                <span style={{ color: 'var(--text-dim)', width: '22px' }}>{s.periodo}</span>
                <input value={formatearTiempo(s.entrada_ms)} onChange={editarCampo(s, 'entrada_ms')}
                       style={{ ...inputStyle, width: '58px', padding: '3px', textAlign: 'center', fontSize: '0.63rem' }} />
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <input value={formatearTiempo(s.salida_ms ?? DURACION_PERIODO_MS)} onChange={editarCampo(s, 'salida_ms')}
                       style={{ ...inputStyle, width: '58px', padding: '3px', textAlign: 'center', fontSize: '0.63rem' }} />
                {s.ajustado && <span title="Corregido a mano" style={{ color: 'var(--accent)' }}>✎</span>}
                <button onClick={() => onBorrar(s)} style={{ ...boton, padding: '2px 5px', borderColor: '#ef4444', color: '#ef4444', marginLeft: 'auto' }}>×</button>
              </div>
            ))}
            <button onClick={() => onAgregar(j.id)} style={{ ...boton, padding: '3px 6px', marginTop: '6px', fontSize: '0.58rem' }}>+ TRAMO EN ESTE MINUTO</button>
          </div>
        );
      })}
    </>
  );
}

function TabCalor({ jugadores, jugadorFoco, setJugadorFoco, puntos, centro, grilla, recorridos, snapshots }) {
  return (
    <>
      <select value={jugadorFoco || ''} onChange={e => setJugadorFoco(e.target.value || null)} style={{ ...inputStyle, marginBottom: '10px' }}>
        <option value="">Elegí un jugador…</option>
        {jugadores.map(j => <option key={j.id} value={j.id}>{nombreCorto(j)}</option>)}
      </select>

      {!jugadorFoco && (
        <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
          El mapa junta tres fuentes: dónde lo fuiste moviendo en el tablero, las fotos
          posicionales y sus propios eventos. Cuanto más lo movés, más real es el calor.
        </div>
      )}

      {jugadorFoco && (
        <>
          <MapaCalor puntos={puntos} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '10px' }}>
            <div style={tarjeta}>
              <div style={etiqueta}>MUESTRAS</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent)' }}>{puntos.length}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)' }}>
                {recorridos.filter(r => String(r.id_jugador) === String(jugadorFoco)).length} rastro(s) · {snapshots.length} foto(s)
              </div>
            </div>
            <div style={tarjeta}>
              <div style={etiqueta}>CENTRO DE GRAVEDAD</div>
              {centro ? (
                <>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent)' }}>{centro.x}% campo</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)' }}>
                    amplitud {centro.amplitud} · profundidad {centro.profundidad}
                  </div>
                </>
              ) : <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>—</div>}
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <div style={etiqueta}>OCUPACIÓN POR ZONA</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${grilla.grid[0]?.length || 6}, 1fr)`, gap: '2px', marginTop: '5px' }}>
              {grilla.normalizada.flatMap((fila, r) => fila.map((v, c) => (
                <div key={`${r}-${c}`} style={{ paddingBottom: '60%', background: `rgba(0,255,136,${v.toFixed(2)})`, border: '1px solid var(--border)' }} />
              )))}
            </div>
            <div style={{ fontSize: '0.56rem', color: 'var(--text-dim)', marginTop: '3px' }}>Izquierda = arco propio · derecha = arco rival</div>
          </div>
        </>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function TomaDatosOffline() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const clubId = localStorage.getItem('club_id');
  const [idPartido, setIdPartido] = useState(null);

  if (!clubId) {
    return <div style={{ color: '#ef4444', textAlign: 'center', marginTop: '50px' }}>Configurá tu club primero.</div>;
  }
  if (idPartido == null) {
    return (
      <SelectorPartido clubId={clubId} onAbrir={setIdPartido}
                       onVolver={() => navigate('/inicio')} showToast={showToast} />
    );
  }
  return <MesaTrabajo idPartido={idPartido} onSalir={() => setIdPartido(null)} showToast={showToast} />;
}
