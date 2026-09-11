import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useEsMovil } from '../utils/useEsMovil';
import { soloActivos } from '../utils/plantelActivo';
import { ejerciciosParaZona, REHAB_LIB } from '../utils/rehab';
import {
  ZONAS, TIPOS, LATERALIDADES, MECANISMOS, CONTEXTOS, GRAVEDADES, ESTADOS,
  hoyISO, soloFecha, sumarDias, diasDeBaja, altaVencida, estaAbierta,
  disponibilidadDe, resumenPlantel,
} from '../utils/disponibilidad';

/* ══════════════════════════════════════════════════════════════════════════
   ENFERMERÍA

   El registro de lesiones del plantel. Escribe acá, y todas las demás
   pantallas leen el resultado a través de utils/disponibilidad.js: la
   Citación no sugiere a un lesionado, Nuevo Partido avisa si lo convocás,
   el Presentismo deja de contarle las faltas y el Microciclo sabe quién no
   entrena ese día.

   El jugador entra a la misma pantalla pero ve sólo lo suyo: su lesión, su
   fecha estimada de vuelta y los ejercicios que le tocan.
   ══════════════════════════════════════════════════════════════════════════ */

const FORM_VACIO = {
  id: null,
  jugador_id: '',
  fecha_lesion: hoyISO(),
  zona: ZONAS[0],
  tipo: TIPOS[0],
  lateralidad: 'N/A',
  gravedad: 'Moderada',
  mecanismo: MECANISMOS[0],
  contexto: CONTEXTOS[0],
  partido_id: '',
  descripcion: '',
  fecha_alta_estimada: '',
  fecha_alta_real: '',
  estado: 'activa',
  tratamiento: '',
  profesional: '',
};

const input = {
  width: '100%', padding: '10px 12px', background: 'var(--panel)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: '6px', outline: 'none',
  fontSize: '0.85rem', fontFamily: 'inherit',
};
const etiqueta = {
  fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-dim)',
  marginBottom: '5px', display: 'block', textTransform: 'uppercase',
};

/* Fuera del componente: declarado adentro, React remonta el input en cada
   tecla y se pierde el foco. */
const Campo = ({ titulo, children, span }) => (
  <div style={span ? { gridColumn: `span ${span}` } : undefined}>
    <span style={etiqueta}>{titulo}</span>{children}
  </div>
);

const ListaEjercicios = ({ ejercicios, titulo, color = 'var(--accent)' }) => (
  <div>
    <div style={{ fontSize: '0.62rem', fontWeight: 800, color, letterSpacing: '0.05em', marginBottom: '8px' }}>{titulo}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {ejercicios.map(ej => (
        <a key={ej.t} href={ej.v} target="_blank" rel="noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none',
            background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '6px',
            padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)',
          }}>
          <span>▶</span>{ej.t}
        </a>
      ))}
    </div>
  </div>
);

/* En el módulo y no adentro del componente: tiene un input (el parte de
 evolución) y, declarada adentro, React la trata como un tipo nuevo en cada
 render y remonta el input, que pierde el foco a cada tecla. */
const FichaLesion = ({
lesion, esMovil, hoy, partidos, puedeEditar, nombreDe,
notaNueva, setNotaNueva, onEditar, onReadaptacion, onAlta, onAgregarNota,
}) => {
  const info = ESTADOS[lesion.estado] || ESTADOS.activa;
  const vencida = altaVencida(lesion, hoy);
  const evolucion = Array.isArray(lesion.evolucion) ? lesion.evolucion : [];
  const partido = lesion.partido_id ? partidos.find(p => p.id === lesion.partido_id) : null;

  return (
    <div className="bento-card" style={{ borderLeft: `4px solid ${info.color}`, padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase' }}>{nombreDe(lesion.jugador_id)}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '3px' }}>
            {lesion.zona}{lesion.lateralidad && lesion.lateralidad !== 'N/A' ? ` · ${lesion.lateralidad}` : ''} · {lesion.tipo} · {lesion.gravedad}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {vencida && (
            <span style={{ background: '#7f1d1d', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: 900 }}>
              ⚠️ ALTA VENCIDA
            </span>
          )}
          <span style={{ background: info.color, color: '#000', padding: '4px 9px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 900 }}>
            {info.label}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
        {[
          { l: 'LESIÓN', v: soloFecha(lesion.fecha_lesion).split('-').reverse().join('/') },
          { l: 'DÍAS', v: diasDeBaja(lesion, hoy) },
          { l: 'ALTA EST.', v: lesion.fecha_alta_estimada ? soloFecha(lesion.fecha_alta_estimada).split('-').reverse().join('/') : '—' },
          { l: 'CONTEXTO', v: lesion.contexto || '—' },
        ].map(k => (
          <div key={k.l} style={{ background: 'var(--panel)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', fontWeight: 800 }}>{k.l}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', marginTop: '3px' }}>{k.v}</div>
          </div>
        ))}
      </div>

      {partido && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '10px' }}>
          🩹 Se lesionó vs <strong>{partido.rival}</strong> ({soloFecha(partido.fecha).split('-').reverse().join('/')})
        </div>
      )}
      {lesion.tratamiento && (
        <div style={{ fontSize: '0.78rem', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
          <strong style={{ color: 'var(--text-dim)' }}>Tratamiento: </strong>{lesion.tratamiento}
          {lesion.profesional && <span style={{ color: 'var(--text-dim)' }}> · {lesion.profesional}</span>}
        </div>
      )}

      {evolucion.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginBottom: '10px' }}>
          <div style={{ ...etiqueta, marginBottom: '8px' }}>Evolución</div>
          {evolucion.slice().reverse().map((e, i) => (
            <div key={i} style={{ fontSize: '0.75rem', marginBottom: '6px', display: 'flex', gap: '8px' }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-dim)', flexShrink: 0 }}>
                {String(e.fecha).split('-').reverse().join('/')}
              </span>
              <span>{e.nota}</span>
            </div>
          ))}
        </div>
      )}

      {puedeEditar && estaAbierta(lesion) && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <input
              value={notaNueva[lesion.id] || ''}
              onChange={e => setNotaNueva(n => ({ ...n, [lesion.id]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') onAgregarNota(lesion); }}
              placeholder="Agregar un parte de evolución…"
              style={{ ...input, fontSize: '0.78rem' }} />
            <button onClick={() => onAgregarNota(lesion)} style={{ ...input, width: 'auto', cursor: 'pointer', fontWeight: 800, color: 'var(--accent)' }}>+</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => onEditar(lesion)} className="btn-secondary" style={{ fontSize: '0.68rem', padding: '7px 12px', cursor: 'pointer' }}>✏️ EDITAR</button>
            {lesion.estado !== 'readaptacion' && (
              <button onClick={() => onReadaptacion(lesion)} style={{ fontSize: '0.68rem', padding: '7px 12px', cursor: 'pointer', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 800 }}>
                🏃 READAPTACIÓN
              </button>
            )}
            <button onClick={() => onAlta(lesion)} style={{ fontSize: '0.68rem', padding: '7px 12px', cursor: 'pointer', background: '#10b981', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 800 }}>
              ✅ DAR DE ALTA
            </button>
          </div>
        </>
      )}
    </div>
  );
};

function Enfermeria() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const esMovil = useEsMovil();

  const isKiosco = localStorage.getItem('kiosco_mode') === 'true';
  const kioscoJugadorId = localStorage.getItem('kiosco_jugador_id');

  const rol = String(perfil?.rol || '').toLowerCase();
  const esJugador = rol === 'jugador' || isKiosco;
  /* La carga de lesiones queda en CT y superuser: es información médica y no
     tiene por qué editarla toda la estructura. El manager la ve, no la toca. */
  const puedeEditar = !esJugador && ['superuser', 'ct'].includes(rol);

  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const esCT = rol === 'ct';
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);
  const miJugadorId = isKiosco ? kioscoJugadorId : perfil?.jugador_id;

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [jugadores, setJugadores] = useState([]);
  const [lesiones, setLesiones] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [notaNueva, setNotaNueva] = useState({});

  const hoy = hoyISO();

  /* ── CARGA ────────────────────────────────────────────────────────────── */
  const cargar = async () => {
    if (!clubId) { setCargando(false); return; }
    setCargando(true);
    try {
      let qJug = supabase.from('jugadores').select('*').eq('club_id', clubId).order('apellido', { ascending: true });
      let qLes = supabase.from('lesiones').select('*').eq('club_id', clubId).order('fecha_lesion', { ascending: false });
      const qPar = supabase.from('partidos').select('id, fecha, rival, categoria')
        .eq('club_id', clubId).order('fecha', { ascending: false }).limit(40);

      if (esCT && misCategorias.length > 0) qJug = qJug.in('categoria', misCategorias);
      if (esJugador && miJugadorId) qLes = qLes.eq('jugador_id', miJugadorId);

      const [rJug, rLes, rPar] = await Promise.all([qJug, qLes, qPar]);

      if (rLes.error) {
        /* Sin la migración corrida la tabla no existe. Se avisa con el texto
           exacto en vez de dejar la pantalla en blanco sin explicación. */
        const faltaTabla = rLes.error.code === '42P01' || rLes.error.code === 'PGRST205'
          || /does not exist|schema cache/i.test(rLes.error.message || '');
        showToast(faltaTabla
          ? 'Falta crear la tabla de lesiones: corré la migración 20260911170000_lesiones.sql en Supabase.'
          : `No se pudieron leer las lesiones: ${rLes.error.message}`, 'error');
      }

      setJugadores(soloActivos(rJug.data || []));
      setLesiones(rLes.data || []);
      setPartidos(rPar.data || []);
    } catch (err) {
      console.error('Enfermería:', err);
      showToast('No se pudieron cargar los datos.', 'error');
    } finally {
      setCargando(false);
    }
  };

  /* `cargar` se redefine en cada render, así que no puede ir en las
     dependencias sin provocar un bucle. Lo que importa es que se recargue
     cuando cambia el club, el rol o el jugador mirado. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [clubId, esCT, misCategorias, esJugador, miJugadorId]);

  /* ── DERIVADOS ────────────────────────────────────────────────────────── */
  const nombreDe = (id) => {
    const j = jugadores.find(x => String(x.id) === String(id));
    return j ? `${j.apellido || ''}, ${j.nombre || ''}`.replace(/^, /, '') : 'Jugador';
  };

  const abiertas = useMemo(
    () => lesiones.filter(estaAbierta).sort((a, b) => String(b.fecha_lesion).localeCompare(String(a.fecha_lesion))),
    [lesiones]
  );
  const cerradas = useMemo(
    () => lesiones.filter(l => !estaAbierta(l)).sort((a, b) => String(b.fecha_lesion).localeCompare(String(a.fecha_lesion))),
    [lesiones]
  );

  const resumen = useMemo(() => resumenPlantel(lesiones, jugadores, hoy), [lesiones, jugadores, hoy]);

  /* ── ACCIONES ─────────────────────────────────────────────────────────── */
  const abrirNueva = () => {
    setForm({ ...FORM_VACIO, fecha_alta_estimada: sumarDias(hoyISO(), 21) });
    setEditando(true);
  };

  const abrirEdicion = (lesion) => {
    setForm({
      ...FORM_VACIO,
      ...lesion,
      fecha_lesion: soloFecha(lesion.fecha_lesion) || hoyISO(),
      fecha_alta_estimada: soloFecha(lesion.fecha_alta_estimada) || '',
      fecha_alta_real: soloFecha(lesion.fecha_alta_real) || '',
      partido_id: lesion.partido_id || '',
    });
    setEditando(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Al cambiar la gravedad, la fecha estimada de alta se recalcula sola desde
     la fecha de lesión. Es una propuesta: el CT la pisa cuando quiera. */
  const cambiarGravedad = (gravedad) => {
    const def = GRAVEDADES.find(g => g.id === gravedad);
    setForm(f => ({
      ...f,
      gravedad,
      fecha_alta_estimada: def ? sumarDias(f.fecha_lesion, def.dias) : f.fecha_alta_estimada,
    }));
  };

  const guardar = async () => {
    if (!form.jugador_id) return showToast('Elegí de qué jugador es la lesión.', 'warning');
    if (!form.fecha_lesion) return showToast('Falta la fecha de la lesión.', 'warning');

    setGuardando(true);
    const payload = {
      club_id: clubId,
      jugador_id: form.jugador_id,
      fecha_lesion: form.fecha_lesion,
      zona: form.zona,
      tipo: form.tipo,
      lateralidad: form.lateralidad,
      gravedad: form.gravedad,
      mecanismo: form.mecanismo,
      contexto: form.contexto,
      partido_id: form.contexto === 'Partido' && form.partido_id ? form.partido_id : null,
      descripcion: form.descripcion || null,
      fecha_alta_estimada: form.fecha_alta_estimada || null,
      fecha_alta_real: form.estado === 'alta' ? (form.fecha_alta_real || hoyISO()) : null,
      estado: form.estado,
      tratamiento: form.tratamiento || null,
      profesional: form.profesional || null,
      updated_at: new Date().toISOString(),
    };

    const res = form.id
      ? await supabase.from('lesiones').update(payload).eq('id', form.id).select()
      : await supabase.from('lesiones').insert([{ ...payload, creado_por: perfil?.id || null, evolucion: [] }]).select();

    setGuardando(false);
    if (res.error) return showToast(`No se pudo guardar: ${res.error.message}`, 'error');

    showToast(form.id ? 'Lesión actualizada ✅' : 'Lesión registrada ✅', 'success');
    setEditando(false);
    setForm(FORM_VACIO);
    cargar();
  };

  const darDeAlta = async (lesion) => {
    const { error } = await supabase.from('lesiones')
      .update({ estado: 'alta', fecha_alta_real: hoyISO(), updated_at: new Date().toISOString() })
      .eq('id', lesion.id);
    if (error) return showToast(`No se pudo dar el alta: ${error.message}`, 'error');
    showToast(`${nombreDe(lesion.jugador_id)} tiene el alta ✅`, 'success');
    cargar();
  };

  const pasarAReadaptacion = async (lesion) => {
    const { error } = await supabase.from('lesiones')
      .update({ estado: 'readaptacion', updated_at: new Date().toISOString() })
      .eq('id', lesion.id);
    if (error) return showToast(`No se pudo actualizar: ${error.message}`, 'error');
    showToast('Pasó a readaptación.', 'success');
    cargar();
  };

  const agregarNota = async (lesion) => {
    const texto = String(notaNueva[lesion.id] || '').trim();
    if (!texto) return;
    const evolucion = [
      ...(Array.isArray(lesion.evolucion) ? lesion.evolucion : []),
      { fecha: hoyISO(), nota: texto, autor: perfil?.nombre_completo || perfil?.email || 'CT' },
    ];
    const { error } = await supabase.from('lesiones')
      .update({ evolucion, updated_at: new Date().toISOString() }).eq('id', lesion.id);
    if (error) return showToast(`No se pudo guardar la nota: ${error.message}`, 'error');
    setNotaNueva(n => ({ ...n, [lesion.id]: '' }));
    cargar();
  };

  /* ── PARTE MÉDICO AL TABLÓN ───────────────────────────────────────────── */
  const publicarParte = async () => {
    if (!perfil?.id) return showToast('Error de sesión.', 'error');
    if (abiertas.length === 0) return showToast('No hay lesiones abiertas para informar.', 'warning');

    const lineas = abiertas.map(l => {
      const d = disponibilidadDe([l], l.jugador_id, hoy);
      return `• *${nombreDe(l.jugador_id)}* — ${l.zona || 'Lesión'} · ${ESTADOS[l.estado]?.label || l.estado}` +
        (l.fecha_alta_estimada ? ` · vuelta estimada ${soloFecha(l.fecha_alta_estimada).split('-').reverse().join('/')}` : '') +
        (d.diasRestantes !== null && d.diasRestantes <= 0 ? ' ⚠️' : '');
    });

    const mensaje = `🏥 *PARTE MÉDICO* — ${hoy.split('-').reverse().join('/')}\n\n${lineas.join('\n')}\n\n` +
      `Disponibles: ${resumen.disponibles}/${resumen.plantel}`;

    const { error } = await supabase.from('novedades').insert([{
      club_id: clubId,
      autor_id: perfil.id,
      publico_objetivo: 'CT',      // el parte completo es interno del cuerpo técnico
      categorias: [],
      mensaje,
      fecha_vencimiento: new Date(Date.now() + 7 * 86400000).toISOString(),
    }]);

    if (error) return showToast(`No se pudo publicar: ${error.message}`, 'error');
    showToast('Parte médico publicado en el Tablón ✅', 'success');
  };

  /* ══════════════════════════════════════════════════════════════════════
     VISTA DEL JUGADOR: sólo lo suyo
     ══════════════════════════════════════════════════════════════════════ */
  if (esJugador) {
    const mia = lesiones.filter(estaAbierta)[0] || null;
    const ejercicios = mia ? ejerciciosParaZona(mia.zona) : [];
    const preventivos = [...REHAB_LIB.pelvica, ...REHAB_LIB.movilidad].map(e => ({ ...e }));
    const estado = mia ? disponibilidadDe([mia], mia.jugador_id, hoy) : null;

    return (
      <div style={{ animation: 'fadeIn 0.3s', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <h1 style={{ margin: 0, fontSize: esMovil ? '1.4rem' : '1.8rem', fontWeight: 900 }}>🏥 MI ESTADO FÍSICO</h1>

        {cargando ? (
          <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>Cargando…</div>
        ) : mia ? (
          <div className="bento-card" style={{ borderLeft: `4px solid ${estado.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <span style={{ background: estado.color, color: '#000', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 900 }}>
                {estado.etiqueta}
              </span>
              <strong style={{ fontSize: '1.1rem' }}>{mia.zona}{mia.lateralidad && mia.lateralidad !== 'N/A' ? ` ${mia.lateralidad.toLowerCase()}` : ''}</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              {[
                { l: 'DESDE', v: soloFecha(mia.fecha_lesion).split('-').reverse().join('/') },
                { l: 'DÍAS', v: diasDeBaja(mia, hoy) },
                { l: 'VUELTA ESTIMADA', v: mia.fecha_alta_estimada ? soloFecha(mia.fecha_alta_estimada).split('-').reverse().join('/') : 'A definir' },
                { l: 'FALTAN', v: estado.diasRestantes !== null && estado.diasRestantes > 0 ? `${estado.diasRestantes} días` : '—' },
              ].map(k => (
                <div key={k.l} style={{ background: 'var(--panel)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '5px' }}>{k.l}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: 'monospace' }}>{k.v}</div>
                </div>
              ))}
            </div>
            {mia.tratamiento && (
              <div style={{ marginBottom: '16px' }}>
                <span style={etiqueta}>Indicaciones</span>
                <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{mia.tratamiento}</div>
              </div>
            )}
            {ejercicios.length > 0 && <ListaEjercicios ejercicios={ejercicios} titulo="🎯 TU TRABAJO DE REHAB" color={estado.color} />}
          </div>
        ) : (
          <div className="bento-card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '6px' }}>✅ Sin lesiones registradas</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Estás disponible para entrenar y jugar.</div>
          </div>
        )}

        <div className="bento-card">
          <ListaEjercicios ejercicios={preventivos} titulo="🛡️ TRABAJO PREVENTIVO — HACELO SIEMPRE" color="#3b82f6" />
          <div style={{ marginTop: '12px', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            Core y movilidad: son los que bajan el riesgo de lesión muscular. Diez minutos, todos los días.
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     VISTA DEL CUERPO TÉCNICO
     ══════════════════════════════════════════════════════════════════════ */
  const ejerciciosForm = ejerciciosParaZona(form.zona);

  return (
    <div style={{ animation: 'fadeIn 0.3s', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: esMovil ? '1.4rem' : '1.8rem', fontWeight: 900 }}>🏥 ENFERMERÍA</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Quién está disponible, quién no y hasta cuándo.
          </p>
        </div>
        {puedeEditar && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={publicarParte} style={{ padding: '10px 16px', borderRadius: '8px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none' }}>
              📌 PARTE AL TABLÓN
            </button>
            <button onClick={abrirNueva} className="btn-action" style={{ padding: '10px 16px', borderRadius: '8px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
              + NUEVA LESIÓN
            </button>
          </div>
        )}
      </div>

      {/* ── RESUMEN ── */}
      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { l: 'DISPONIBLES', v: resumen.disponibles, c: '#10b981' },
          { l: 'DE BAJA', v: resumen.deBaja, c: '#ef4444' },
          { l: 'READAPTACIÓN', v: resumen.enReadaptacion, c: '#f59e0b' },
          { l: 'ALTAS VENCIDAS', v: resumen.vencidas, c: resumen.vencidas > 0 ? '#ef4444' : 'var(--text-dim)' },
        ].map(k => (
          <div key={k.l} className="bento-card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '0.05em' }}>{k.l}</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, fontFamily: 'monospace', color: k.c, lineHeight: 1.2 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ── FORMULARIO ── */}
      {editando && puedeEditar && (
        <div className="bento-card" style={{ border: '1px solid var(--accent)' }}>
          <div className="stat-label" style={{ marginBottom: '14px' }}>{form.id ? 'EDITAR LESIÓN' : 'NUEVA LESIÓN'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
            <Campo titulo="Jugador" span={esMovil ? 1 : 2}>
              <select style={input} value={form.jugador_id} onChange={e => setForm(f => ({ ...f, jugador_id: e.target.value }))}>
                <option value="">— Elegir jugador —</option>
                {jugadores.map(j => <option key={j.id} value={j.id}>{j.apellido}, {j.nombre} {j.dorsal ? `(#${j.dorsal})` : ''}</option>)}
              </select>
            </Campo>
            <Campo titulo="Fecha de lesión">
              <input type="date" style={input} value={form.fecha_lesion} onChange={e => setForm(f => ({ ...f, fecha_lesion: e.target.value }))} />
            </Campo>
            <Campo titulo="Estado">
              <select style={input} value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                {Object.entries(ESTADOS).map(([id, e]) => <option key={id} value={id}>{e.label}</option>)}
              </select>
            </Campo>

            <Campo titulo="Zona">
              <select style={input} value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}>
                {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </Campo>
            <Campo titulo="Tipo">
              <select style={input} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo titulo="Lado">
              <select style={input} value={form.lateralidad} onChange={e => setForm(f => ({ ...f, lateralidad: e.target.value }))}>
                {LATERALIDADES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Campo>
            <Campo titulo="Gravedad">
              <select style={input} value={form.gravedad} onChange={e => cambiarGravedad(e.target.value)}>
                {GRAVEDADES.map(g => <option key={g.id} value={g.id}>{g.id} (~{g.dias} días)</option>)}
              </select>
            </Campo>

            <Campo titulo="Mecanismo">
              <select style={input} value={form.mecanismo} onChange={e => setForm(f => ({ ...f, mecanismo: e.target.value }))}>
                {MECANISMOS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Campo>
            <Campo titulo="Contexto">
              <select style={input} value={form.contexto} onChange={e => setForm(f => ({ ...f, contexto: e.target.value }))}>
                {CONTEXTOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Campo>
            {form.contexto === 'Partido' ? (
              <Campo titulo="¿En qué partido?" span={esMovil ? 1 : 2}>
                <select style={input} value={form.partido_id} onChange={e => setForm(f => ({ ...f, partido_id: e.target.value }))}>
                  <option value="">— Sin especificar —</option>
                  {partidos.map(p => (
                    <option key={p.id} value={p.id}>
                      {soloFecha(p.fecha)?.split('-').reverse().join('/')} · vs {p.rival}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : <div style={{ gridColumn: esMovil ? 'auto' : 'span 2' }} />}

            <Campo titulo="Alta estimada">
              <input type="date" style={input} value={form.fecha_alta_estimada || ''} onChange={e => setForm(f => ({ ...f, fecha_alta_estimada: e.target.value }))} />
            </Campo>
            {form.estado === 'alta' && (
              <Campo titulo="Alta real">
                <input type="date" style={input} value={form.fecha_alta_real || ''} onChange={e => setForm(f => ({ ...f, fecha_alta_real: e.target.value }))} />
              </Campo>
            )}
            <Campo titulo="Profesional a cargo" span={form.estado === 'alta' ? (esMovil ? 1 : 2) : (esMovil ? 1 : 3)}>
              <input style={input} value={form.profesional || ''} onChange={e => setForm(f => ({ ...f, profesional: e.target.value }))} placeholder="Kinesiólogo, médico…" />
            </Campo>

            <Campo titulo="Tratamiento e indicaciones" span={esMovil ? 1 : 4}>
              <textarea style={{ ...input, minHeight: '80px', resize: 'vertical' }} value={form.tratamiento || ''}
                onChange={e => setForm(f => ({ ...f, tratamiento: e.target.value }))}
                placeholder="Lo que ve el jugador en su pantalla." />
            </Campo>
            <Campo titulo="Notas internas" span={esMovil ? 1 : 4}>
              <textarea style={{ ...input, minHeight: '60px', resize: 'vertical' }} value={form.descripcion || ''}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </Campo>
          </div>

          {ejerciciosForm.length > 0 && (
            <div style={{ marginTop: '16px', padding: '14px', background: 'var(--panel)', borderRadius: '8px' }}>
              <ListaEjercicios ejercicios={ejerciciosForm} titulo={`🎯 REHAB SUGERIDO PARA ${form.zona.toUpperCase()}`} />
              <div style={{ marginTop: '10px', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                Sale de la biblioteca de FISIOLOGÍA. El jugador los ve en su pantalla.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button onClick={guardar} disabled={guardando} className="btn-action" style={{ padding: '12px 22px', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', cursor: guardando ? 'wait' : 'pointer' }}>
              {guardando ? 'GUARDANDO…' : '💾 GUARDAR'}
            </button>
            <button onClick={() => { setEditando(false); setForm(FORM_VACIO); }} style={{ padding: '12px 22px', borderRadius: '8px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
              CANCELAR
            </button>
          </div>
        </div>
      )}

      {/* ── ABIERTAS ── */}
      {cargando ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>Cargando…</div>
      ) : abiertas.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          ✅ No hay lesiones abiertas. Plantel completo.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(2, 1fr)', gap: '14px' }}>
          {abiertas.map(l => <FichaLesion key={l.id} lesion={l} esMovil={esMovil} hoy={hoy} partidos={partidos}
              puedeEditar={puedeEditar} nombreDe={nombreDe} notaNueva={notaNueva} setNotaNueva={setNotaNueva}
              onEditar={abrirEdicion} onReadaptacion={pasarAReadaptacion} onAlta={darDeAlta} onAgregarNota={agregarNota} />)}
        </div>
      )}

      {/* ── HISTORIAL ── */}
      {cerradas.length > 0 && (
        <div>
          <button onClick={() => setVerHistorial(v => !v)}
            style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--text-dim)', fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.05em', cursor: 'pointer' }}>
            {verHistorial ? '▲ OCULTAR HISTORIAL' : `▼ VER HISTORIAL (${cerradas.length} lesiones con alta)`}
          </button>
          {verHistorial && (
            <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(2, 1fr)', gap: '14px', marginTop: '14px' }}>
              {cerradas.map(l => <FichaLesion key={l.id} lesion={l} esMovil={esMovil} hoy={hoy} partidos={partidos}
              puedeEditar={puedeEditar} nombreDe={nombreDe} notaNueva={notaNueva} setNotaNueva={setNotaNueva}
              onEditar={abrirEdicion} onReadaptacion={pasarAReadaptacion} onAlta={darDeAlta} onAgregarNota={agregarNota} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Enfermeria;
