import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import { useAncho, columnasQueEntran } from '../utils/useAncho';
import Campanita from '../components/Campanita';

import { analizarPartido } from '../analytics/engine';
import { calcularRatingJugador } from '../analytics/rating';
import { calcularCadenasValor } from '../analytics/posesiones';
import { fetchPaginado } from '../utils/supaPaginado';
import { categoriaMasAlta } from '../utils/categorias';
import { cargaDelPlantel, zonaDe, DIAS_CRONICA } from '../analytics/carga';
import { construirAgenda, sumarDias, diasEntre, TIPOS } from '../analytics/agenda';
import { resumenClub } from '../analytics/tutores';
import { ordenarAlertas, franjaDeHoy, rankAccesos, leerUso, anotarUso, ACCESOS_VISIBLES } from '../analytics/tablero';
import FranjaHoy from '../components/FranjaHoy';
import { filtroNoVencidas } from '../utils/novedades';

/* ============================================================================
   CONFIG — Ajustá a tu realidad de datos.
   Escala wellness 1-5 (real, sale de CargaWellness): sueño alto = bueno;
   estrés/fatiga/dolor altos = malo. Tarjetas viven en `eventos`.
============================================================================ */
/* ============================================================================
   VERSIÓN Y NOVEDADES
   El popup se muestra una sola vez por versión: al aceptar se guarda
   VERSION_ACTUAL en localStorage y no vuelve hasta el próximo release.
   Para publicar novedades: subí VERSION_ACTUAL y editá NOVEDADES_VERSION.
============================================================================ */
const VERSION_ACTUAL = 'v0.00202609221730';
const LS_VERSION_VISTA = 'vc_version_novedades_vista';

const NOVEDADES_TITULO = 'La Semana en Una Pantalla';
const NOVEDADES_BAJADA = 'Todo lo que tiene fecha dejó de vivir en cinco pantallas distintas, la carga de entrenamiento avisa antes de que alguien se rompa, y por fin hay dónde anotar a quién llamar si a un chico le pasa algo.';

const NOVEDADES_VERSION = [
  {
    grupo: 'Agenda',
    color: '#00ff88',
    items: [
      { t: 'Todo lo que tiene fecha, junto', d: 'Pantalla nueva en Planificación. El partido, el entrenamiento, el apto que vence, la cuota que se vence, el alta del lesionado y los cumpleaños, en una sola lista ordenada por día y hora. Antes eso eran cinco pantallas, y por eso se pasaban las cosas.' },
      { t: 'Ves 7, 30 o 90 días', d: 'Con flechas para adelantar o volver. Filtrás por categoría y podés apagar los tipos que no te interesan; el número al lado de cada uno dice cuántos hay en el tramo que estás mirando.' },
      { t: 'Cada cosa te lleva a donde se resuelve', d: 'Tocás la cuota y vas a Tesorería, tocás el apto y vas a Plantel. La agenda te dice qué pasa, no te deja a mitad de camino.' },
      { t: 'Los próximos 7 días, en el tablón', d: 'Un bloque nuevo en el Inicio con lo que viene esta semana. Se acomoda y se saca como los demás módulos. Sale del mismo cálculo que la agenda, así que nunca te van a decir cosas distintas.' },
      { t: 'Lo que ya se pagó no molesta', d: 'La cuota saldada no aparece, y el alta del jugador que ya volvió tampoco. La agenda es de lo pendiente.' },
    ],
  },
  {
    grupo: 'Carga y riesgo de lesión',
    color: '#ef4444',
    items: [
      { t: 'El RPE que venís cargando por fin sirve para algo', d: 'Hace meses que se carga el esfuerzo percibido y los minutos de cada sesión, y no se usaban para nada. Con esos dos números sale la carga de cada entrenamiento (esfuerzo × minutos) y de ahí el indicador que más se asocia a las lesiones.' },
      { t: 'Qué es el ACWR, en criollo', d: 'Compara lo que el jugador cargó esta semana contra lo que su cuerpo viene tolerando en el último mes. Si esta semana hizo mucho más de lo que está acostumbrado, el riesgo sube. Entre 0,80 y 1,30 está la zona buena; arriba de 1,50 es donde más se rompe la gente.' },
      { t: 'La tabla del plantel, ordenada por riesgo', d: 'En Fisiología, sólo para el cuerpo técnico. El que está en riesgo va arriba de todo, con su barra, su zona y la monotonía (si entrena siempre igual de fuerte, sin días livianos, eso también suma riesgo).' },
      { t: 'No te inventa un número', d: 'Si el jugador no tiene al menos siete días cargados, no muestra un ACWR: te dice cuántos días le faltan. Un indicador armado sobre tres registros sueltos es peor que no tener ninguno.' },
      { t: 'Aviso en el tablón', d: 'Aparte del de wellness, y a propósito: el wellness dice cómo se siente el jugador hoy, el ACWR dice si la carga se le fue de las manos. Son dos cosas distintas.' },
    ],
  },
  {
    grupo: 'Tutores y autorizaciones',
    color: '#fbbf24',
    items: [
      { t: 'A quién llamar si pasa algo', d: 'Dentro de la ficha de cada jugador, en Plantel. Podés cargar varios tutores —madre, padre, el tío que lo lleva los martes— con su parentesco, teléfono y mail, y marcar cuál es el contacto principal. Cada uno tiene su botón de WhatsApp directo.' },
      { t: 'Quién lo puede retirar del club', d: 'Se marca tutor por tutor. Si un menor no tiene a nadie que lo pueda retirar y tampoco tiene permiso para irse solo, la ficha te lo avisa.' },
      { t: 'Los permisos de la familia', d: 'Viajar con el club, uso de imagen en las redes, atención médica de urgencia y retirarse solo. Queda registrado quién firmó y cuándo.' },
      { t: 'Sin responder no es lo mismo que "no"', d: 'Los permisos tienen tres estados, no un tilde: sin responder, no autoriza y autoriza. Que la familia todavía no haya contestado es trabajo pendiente del club; que haya dicho que no es una decisión tomada. Pintarlos igual esconde una de las dos cosas.' },
      { t: 'Aviso en el tablón', d: 'Si hay menores sin tutor a quién llamar, el Inicio te lo dice. Sólo lo grave: los permisos que faltan responder se ven en la ficha y no te ocupan el tablón.' },
    ],
  },
  {
    grupo: 'Comparar jugadores',
    color: '#a855f7',
    items: [
      { t: 'Dos jugadores, cara a cara', d: 'Pantalla nueva en Plantel. Elegís dos y salen las barras enfrentadas métrica por métrica, con el marcador de cuántas gana cada uno. Antes había que abrir dos pestañas y acordarse de los números de una mientras mirabas la otra.' },
      { t: 'No gana el que jugó más', d: 'Por defecto compara cada 40 minutos jugados. Si no, el titular le gana siempre al suplente aunque rinda peor. Se puede apagar con un tilde para ver los totales crudos.' },
      { t: 'Donde menos es mejor, se lee al revés', d: 'En pérdidas y faltas cometidas gana el número más bajo, como corresponde.' },
      { t: 'Los mismos números de Resumen Plantel', d: 'Usa el mismo cálculo, así que no puede darte un número distinto al de esa pantalla.' },
    ],
  },
  {
    grupo: 'Por dentro',
    color: '#22d3ee',
    items: [
      { t: 'La app ahora se prueba sola', d: 'Noventa y cuatro pruebas automáticas que corren antes de cada cambio y avisan si algo que funcionaba dejó de funcionar. Para mover el cálculo de Resumen Plantel se guardó una copia del código viejo y se exige que los dos den exactamente el mismo resultado: no se confía en la lectura, se compara contra lo que hacía antes.' },
      { t: 'Una parte rota ya no rompe la pantalla entera', d: 'Si una consulta falla, la agenda y el tablón muestran lo que sí pudieron leer y un aviso diciendo qué falta, en vez de quedar en blanco.' },
    ],
  },
];

const UMBRAL_AMARILLAS = 5;                                   // 5,10,15... => 1 fecha
const WELL = { suenoRojo: 2, fatigaRoja: 4, estresRojo: 4, dolorRojo: 4 };

/* Índice de readiness 1-5 (alto = mejor). Defaults 3 si falta el dato. */
const readinessDe = (w) => {
  const s = Number(w.sueno ?? 3), e = Number(w.estres ?? 3), f = Number(w.fatiga ?? 3), d = Number(w.dolor_muscular ?? 3);
  return (s + (6 - e) + (6 - f) + (6 - d)) / 4;
};
const enRojoWell = (w) =>
  Number(w.fatiga ?? 3) >= WELL.fatigaRoja ||
  Number(w.dolor_muscular ?? 3) >= WELL.dolorRojo ||
  Number(w.estres ?? 3) >= WELL.estresRojo ||
  Number(w.sueno ?? 3) <= WELL.suenoRojo;

/* ============================================================================
   MÓDULOS (rol-gateado) + DEFAULTS curados + ACCESOS
============================================================================ */
const MODULOS = [
  { id: 'm_estado',        titulo: 'Estado del equipo',    span: 3, roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'm_triage',        titulo: 'Requiere tu atención', span: 2, roles: ['superuser', 'manager', 'ct'] },
  { id: 'm_proximo',       titulo: 'Próximo partido',      span: 2, roles: ['superuser', 'manager', 'ct'] },
  { id: 'm_agenda',        titulo: 'Los próximos 7 días', span: 2, roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'm_plata',         titulo: 'La plata del mes',     span: 2, roles: ['superuser', 'manager', 'admin'] },
  { id: 'm_cumplimiento',  titulo: 'Qué falta cargar',     span: 1, roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'm_wellness_pend', titulo: 'Wellness sin cargar',  span: 1, roles: ['superuser', 'manager', 'ct'] },
  { id: 'm_carga',         titulo: 'Carga del plantel',    span: 1, roles: ['superuser', 'manager', 'ct'] },
  { id: 'm_forma',         titulo: 'Forma y xG',           span: 1, roles: ['superuser', 'manager', 'ct'] },
  { id: 'm_protagonistas', titulo: 'Figuras',              span: 1, roles: ['superuser', 'manager', 'ct'] },
  { id: 'm_pulso',         titulo: 'Pulso del plantel',    span: 1, roles: ['superuser', 'manager', 'ct'] },
  { id: 'm_ultimo',        titulo: 'Último resultado',     span: 1, roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'm_novedades',     titulo: 'Tablón',               span: 2, roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'm_accesos',       titulo: 'Accesos rápidos',      span: 3, roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'm_jug_wellness',  titulo: 'Mi wellness',          span: 2, roles: ['jugador'] },
  { id: 'm_jug_perfil',    titulo: 'Mi perfil',            span: 1, roles: ['jugador'] },
];

const SPAN_DEF = Object.fromEntries(MODULOS.map((m) => [m.id, m.span || 1]));

/* EL ORDEN IMPORTA MÁS QUE LA PERSONALIZACIÓN.
   Casi nadie abre el ⚙️, así que lo que decide la experiencia es esta lista.
   Antes los cuatro roles arrancaban con `m_estado`: el balance anual, que se
   mueve una vez por semana, ocupando el lugar más caro de la pantalla. Ahora
   arriba va lo accionable —lo que hay que resolver hoy— y el balance queda
   para cuando bajás. Cada rol abre con lo suyo: el DT con el equipo, el
   tesorero con la plata. */
const DEFAULTS = {
  ct:        ['m_triage', 'm_agenda', 'm_proximo', 'm_wellness_pend', 'm_pulso', 'm_carga', 'm_accesos', 'm_estado', 'm_forma', 'm_protagonistas', 'm_ultimo', 'm_novedades'],
  manager:   ['m_triage', 'm_agenda', 'm_proximo', 'm_plata', 'm_cumplimiento', 'm_accesos', 'm_estado', 'm_forma', 'm_ultimo', 'm_novedades'],
  superuser: ['m_triage', 'm_agenda', 'm_plata', 'm_cumplimiento', 'm_accesos', 'm_estado', 'm_forma', 'm_protagonistas', 'm_ultimo', 'm_novedades'],
  admin:     ['m_plata', 'm_agenda', 'm_cumplimiento', 'm_accesos', 'm_estado', 'm_ultimo', 'm_novedades'],
  jugador:   ['m_jug_wellness', 'm_jug_perfil'],
};

const LINKS = [
  { titulo: 'Nuevo Partido', icon: '⚡',  ruta: '/nuevo-partido',    color: '#10b981', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Microciclo',    icon: '🗓️', ruta: '/microciclo',       color: '#8b5cf6', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Wellness',      icon: '🔋', ruta: '/wellness',         color: '#14b8a6', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Scouting',      icon: '🕵️‍♂️', ruta: '/scouting-rivales', color: '#64748b', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Disciplina',    icon: '🟨', ruta: '/disciplina',       color: '#facc15', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Plantel',       icon: '👥', ruta: '/plantel',          color: '#0ea5e9', roles: ['superuser', 'manager', 'ct', 'admin'] },
  { titulo: 'Transferencias', icon: '💸', ruta: '/transferencias', color: '#f43f5e', roles: ['superuser', 'manager', 'admin', 'ct'] },
  { titulo: 'Tesorería',     icon: '💰', ruta: '/tesoreria',        color: '#eab308', roles: ['superuser', 'manager', 'admin'] },
  { titulo: 'Torneos',       icon: '🏆', ruta: '/torneos',          color: '#fbbf24', roles: ['superuser', 'manager', 'admin'] },
  { titulo: 'Sponsors',      icon: '🤝', ruta: '/sponsors',         color: '#0284c7', roles: ['superuser', 'manager', 'admin'] },
  { titulo: 'Usuarios',      icon: '👑', ruta: '/usuarios',         color: '#c084fc', roles: ['superuser'] },
];

/* ============================================================================
   LA TARJETA
   Vive acá, a nivel de módulo, y no adentro del componente: una función
   declarada adentro es una función NUEVA en cada render, y React la trata
   como otro tipo de componente. Resultado: las doce tarjetas se desmontaban y
   se volvían a montar ante cualquier cambio de estado.
============================================================================ */
const Card = ({ children, id, accent, index, scroll, ctx }) => {
  const { esMovil, tamanos, modoEdicion, cambiarTamano, mover, columnas } = ctx;
  /* El ancho pedido se recorta a las columnas que hay. Si no, una tarjeta que
     pide 3 fuerza tres columnas aunque no entren, y la última queda de 100px. */
  const span = esMovil ? 1 : Math.min(columnas, tamanos[id] || SPAN_DEF[id] || 1);
  return (
    <div className="bento-card" style={{
      gridColumn: esMovil ? '1 / -1' : `span ${span}`, position: 'relative',
      background: 'var(--panel)', border: '1px solid var(--border)', borderTop: accent ? `2px solid ${accent}` : '1px solid var(--border)',
      borderRadius: 12, padding: 16, overflow: scroll ? 'auto' : 'hidden', maxHeight: scroll ? 320 : 'none', display: 'flex', flexDirection: 'column',
    }}>
      {modoEdicion && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, zIndex: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {Array.from({ length: Math.max(1, columnas) }, (_, k) => k + 1).map((n) => (
            <button key={n} onClick={() => cambiarTamano(id, n)} style={sizeBtn(span === n)} title={`${n} columna${n > 1 ? 's' : ''}`}>{n}</button>
          ))}
          <button onClick={() => mover(index, 'up')} style={editBtn}>▲</button>
          <button onClick={() => mover(index, 'down')} style={editBtn}>▼</button>
        </div>
      )}
      {children}
    </div>
  );
};

/* ============================================================================
   HELPERS
============================================================================ */
function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '255,255,255';
}
function parseFecha(str) {
  if (!str) return null;
  try {
    const c = String(str).trim().split('T')[0];
    let p = c.split('-'); if (p.length < 3) p = c.split('/');
    if (p.length < 3) return null;
    if (p[0].length === 4) return new Date(+p[0], +p[1] - 1, +p[2]);
    if (p[2].length === 4) return new Date(+p[2], +p[1] - 1, +p[0]);
    return null;
  } catch { return null; }
}
const resultadoDe = (p) => {
  const gf = parseInt(p.goles_propios) || 0, gc = parseInt(p.goles_rival) || 0;
  return gf > gc ? 'V' : gf === gc ? 'E' : 'D';
};
const plantillaIds = (p) => {
  try {
    const pl = typeof p?.plantilla === 'string' ? JSON.parse(p.plantilla) : p?.plantilla;
    return Array.isArray(pl) ? pl.map((x) => x.id_jugador).filter((v) => v != null) : [];
  } catch { return []; }
};

/* Jerarquía de categorías: vive en utils/categorias.js, compartida con Scouting. */
const categoriaInicial = (cats) => categoriaMasAlta(cats);

/* Corre el engine UNA vez sobre el último partido => xG + ranking (port de Resumen). */
function analizarUltimo(eventos, jugadores) {
  const vacio = { xgPropio: 0, xgRival: 0, ranking: [] };
  if (!eventos || eventos.length === 0) return vacio;
  let datos;
  try { datos = analizarPartido(eventos, 'Propio', false); } catch { return vacio; }

  const S = {};
  jugadores.forEach((j) => {
    let xgChain = 0, xgBuildup = 0;
    try { ({ xgChain, xgBuildup } = calcularCadenasValor(datos.posesiones, j.id)); } catch { /* dato opcional: si falla, se sigue sin él */ }
    S[j.id] = {
      id: j.id, nombre: j.apellido || j.nombre, apellido: j.apellido, dorsal: j.dorsal, posicion: j.posicion,
      eventos: [], remates: 0, goles: 0, asistencias: 0, perdidas: 0, rec: 0, faltas: 0,
      duelosDefGan: 0, duelosDefTot: 0, duelosOfeGan: 0, duelosOfeTot: 0, pasesIncompletos: 0,
      ocasionesFalladas: 0, xgChain, xgBuildup, golesRecibidos: 0, atajadas: 0, amarillas: 0, rojas: 0,
    };
  });
  const arqs = jugadores.filter((j) => j.posicion?.toLowerCase().includes('arquero')).map((j) => j.id);

  eventos.forEach((ev) => {
    if (ev.equipo === 'Propio' && ev.id_jugador && S[ev.id_jugador]) {
      const s = S[ev.id_jugador];
      s.eventos.push(ev);
      if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') s.goles++;
      if (ev.accion?.includes('Remate')) s.remates++;
      if (ev.accion === 'Pérdida') s.perdidas++;
      if (ev.accion === 'Recuperación') s.rec++;
      if (ev.accion?.toLowerCase().includes('pase incompleto')) s.pasesIncompletos++;
      if (ev.accion?.toLowerCase().includes('ocasión fallada')) s.ocasionesFalladas++;
      if (ev.accion === 'Falta cometida' || ev.accion === 'Falta cometida (Ventaja)' || ev.accion === 'Penal en contra') s.faltas++;
      if (ev.accion?.toLowerCase().includes('amarilla')) s.amarillas++;
      if (ev.accion?.toLowerCase().includes('roja')) s.rojas++;
      if (ev.accion === 'Duelo DEF Ganado') { s.duelosDefGan++; s.duelosDefTot++; }
      if (ev.accion === 'Duelo DEF Perdido') s.duelosDefTot++;
      if (ev.accion === 'Duelo OFE Ganado') { s.duelosOfeGan++; s.duelosOfeTot++; }
      if (ev.accion === 'Duelo OFE Perdido') s.duelosOfeTot++;
      if (ev.accion?.toLowerCase().includes('atajada')) s.atajadas++;
    }
    if (ev.equipo === 'Propio' && ev.id_asistencia && S[ev.id_asistencia]) {
      if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') S[ev.id_asistencia].asistencias++;
    }
    if (ev.equipo === 'Rival' && arqs.length === 1 && S[arqs[0]]) {
      if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') S[arqs[0]].golesRecibidos++;
      if (ev.accion === 'Remate - Atajado') S[arqs[0]].atajadas++;
    }
  });

  const ranking = Object.values(S)
    .filter((j) => j.eventos.length > 0)
    .map((j) => {
      const pm = datos.plusMinusJugador ? (datos.plusMinusJugador[j.id] || 0) : 0;
      const mins = datos.minutosJugados ? (datos.minutosJugados[j.id] || 0) : 0;
      const paraRating = [...j.eventos];
      eventos.forEach((ev) => {
        if (ev.id_asistencia == j.id && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol')) paraRating.push({ ...ev, id_jugador: j.id, tipoVirtual: 'Asistencia' });
      });
      const rivalEnCancha = eventos.filter((ev) => {
        if (ev.equipo !== 'Rival' || !ev.quinteto_activo) return false;
        try {
          const qa = typeof ev.quinteto_activo === 'string' ? JSON.parse(ev.quinteto_activo) : ev.quinteto_activo;
          return Array.isArray(qa) && qa.some((id) => String(id) === String(j.id));
        } catch { return false; }
      });
      let impacto = '-';
      try { impacto = calcularRatingJugador(j, paraRating, rivalEnCancha, pm, mins); } catch { /* dato opcional: si falla, se sigue sin él */ }
      return { ...j, impacto, minutos: mins };
    })
    .filter((j) => j.impacto !== '-' && !Number.isNaN(Number(j.impacto)))
    .sort((a, b) => Number(b.impacto) - Number(a.impacto));

  return { xgPropio: datos.xgPropio || 0, xgRival: datos.xgRival || 0, ranking };
}

/* ============================================================================
   COMPONENTE
============================================================================ */
export default function Inicio() {
  const navigate = useNavigate();
  const { perfil } = useAuth();

  const isKiosco = localStorage.getItem('kiosco_mode') === 'true';
  const kioscoNombre = localStorage.getItem('kiosco_nombre');

  const salirKiosco = async () => {
    ['kiosco_mode', 'kiosco_jugador_id', 'kiosco_nombre', 'kiosco_apellido'].forEach((k) => localStorage.removeItem(k));
    await supabase.auth.signOut();
    navigate('/login');
  };


  /* ---- ESTADO BASE ---- */
  const esMovil = useEsMovil();

  const rol = (perfil?.rol || 'jugador').toLowerCase();
  const esSuperUser = rol === 'superuser';
  const esAdmin = rol === 'admin';
  const esManager = rol === 'manager';
  const esCT = rol === 'ct';
  /* Quién ve la caja del club. Decide el módulo y también si se pide o no. */
  const verPlata = ['superuser', 'manager', 'admin'].includes(rol);

  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);

  const [clubMaster, setClubMaster] = useState(localStorage.getItem('club_id') || '');
  const clubActivo = esSuperUser ? clubMaster : (perfil?.club_id || '');

  const [nombreClub, setNombreClub] = useState('CARGANDO...');
  const [escudoClub, setEscudoClub] = useState(localStorage.getItem('escudo_url') || '');
  const [listaClubes, setListaClubes] = useState([]);

  const [categoriaActiva, setCategoriaActiva] = useState(localStorage.getItem('dash_categoria') || '');
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);

  /* ---- POPUP DE NOVEDADES DE VERSIÓN ---- */
  const [mostrarNovedadesVersion, setMostrarNovedadesVersion] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(LS_VERSION_VISTA) !== VERSION_ACTUAL) setMostrarNovedadesVersion(true);
    } catch { /* modo privado / storage bloqueado: no molestamos */ }
  }, []);

  const aceptarNovedadesVersion = () => {
    try { localStorage.setItem(LS_VERSION_VISTA, VERSION_ACTUAL); } catch { /* ignorado */ }
    setMostrarNovedadesVersion(false);
  };

  const [cargando, setCargando] = useState(true);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [mostrarQR, setMostrarQR] = useState(false);

  // CT: forzado a la categoría de mayor jerarquía entre sus asignadas (Primera antes que Tercera, etc.)
  // El CT no tiene opción "Todas" en el selector, así que siempre cae en una categoría concreta.
  useEffect(() => {
    if (esCT && misCategorias.length > 0 && (!categoriaActiva || categoriaActiva === 'Todas' || !misCategorias.includes(categoriaActiva))) {
      const top = categoriaInicial(misCategorias);
      if (top && top !== categoriaActiva) { setCategoriaActiva(top); localStorage.setItem('dash_categoria', top); }
    }
  }, [esCT, misCategorias, categoriaActiva]);

  // Resto de roles: NO arrancar en "Todas", pero respetarla si el usuario la elige a propósito.
  // Solo resolvemos a la categoría de mayor jerarquía cuando no hay una selección válida todavía
  // ('' = sin resolver, o una categoría que ya no existe). "Todas" cuenta como válida y se respeta.
  useEffect(() => {
    if (esCT || categoriasDisponibles.length === 0) return;
    const valida = categoriaActiva === 'Todas' || categoriasDisponibles.includes(categoriaActiva);
    if (!valida) {
      const top = categoriaInicial(categoriasDisponibles);
      if (top) { setCategoriaActiva(top); localStorage.setItem('dash_categoria', top); }
    }
  }, [categoriasDisponibles, categoriaActiva, esCT]);

  /* ---- DATOS ---- */
  const [novedades, setNovedades] = useState([]);
  const [proximo, setProximo] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [anual, setAnual] = useState({ v: 0, e: 0, d: 0, gf: 0, gc: 0 });
  const [forma, setForma] = useState([]);
  const [ultAnalisis, setUltAnalisis] = useState({ xgPropio: 0, xgRival: 0, ranking: [] });
  const [triage, setTriage] = useState([]);
  const [pulso, setPulso] = useState({ score: null, registros: 0, enRojo: 0 });
  const [prep, setPrep] = useState(null);
  const [semana, setSemana] = useState([]);
  const [jugadoresBD, setJugadoresBD] = useState([]);
  const [plata, setPlata] = useState(null);
  const [tutoresBD, setTutoresBD] = useState([]);
  const [wellnessVentana, setWellnessVentana] = useState([]);

  const [datosWellness, setDatosWellness] = useState([]);

  /* ---- WIDGETS (editable, default fuerte) ---- */
  const widgetsPermitidos = useMemo(() => MODULOS.filter((m) => m.roles.includes(rol)), [rol]);
  const defaultLayout = DEFAULTS[rol] || DEFAULTS.jugador;
  const idRef = perfil?.id || 'anon';
  /* La franja de hoy va siempre arriba, fuera de la grilla, pero se puede
     apagar. La preferencia vive en el dispositivo, igual que el layout. */
  const LS_FRANJA = `dash_franja_${idRef}`;
  const [franjaVisible, setFranjaVisible] = useState(() => {
    try { return localStorage.getItem(LS_FRANJA) !== 'off'; } catch { return true; }
  });
  const cambiarFranja = (on) => {
    setFranjaVisible(on);
    try { localStorage.setItem(LS_FRANJA, on ? 'on' : 'off'); } catch { /* storage bloqueado */ }
  };

  /* Cuántas veces se entró a cada acceso rápido desde acá. */
  const [usoAccesos, setUsoAccesos] = useState(() => leerUso());
  const [verTodosAccesos, setVerTodosAccesos] = useState(false);

  /* Cuántas columnas entran DE VERDAD en el espacio del tablero. Se mide el
     contenedor y no la ventana, porque entre las dos está la barra lateral
     —que además se pliega— y `window.innerWidth` miente. */
  const [anchoGrilla, refGrilla] = useAncho();
  const columnas = esMovil ? 1 : columnasQueEntran(anchoGrilla);

  /* La clave sube de v3 a v4 a propósito. El que ya usó la app tiene su orden
     viejo guardado y, sin esto, nunca vería el orden nuevo ni los módulos que
     se agregaron: se quedaría para siempre con el tablero de la versión
     anterior. Se resetea una vez al default bueno de su rol; lo que acomode
     de ahí en más se guarda igual que antes, en este dispositivo. */
  const [layout, setLayout] = useState(() => {
    const g = localStorage.getItem(`dash_v4_${idRef}`);
    if (g) {
      const ids = JSON.parse(g).filter((id) => widgetsPermitidos.some((m) => m.id === id));
      return ids.length ? ids : defaultLayout;
    }
    return defaultLayout;
  });
  const guardarLayout = (arr) => localStorage.setItem(`dash_v4_${idRef}`, JSON.stringify(arr));
  const toggleWidget = (id) => setLayout((prev) => { const n = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]; guardarLayout(n); return n; });
  const mover = (i, dir) => setLayout((prev) => { const n = [...prev]; const j = dir === 'up' ? i - 1 : i + 1; if (j < 0 || j >= n.length) return prev; [n[i], n[j]] = [n[j], n[i]]; guardarLayout(n); return n; });

  const [tamanos, setTamanos] = useState(() => { const g = localStorage.getItem(`dash_sizes_v4_${idRef}`); return g ? JSON.parse(g) : {}; });
  const cambiarTamano = (id, n) => setTamanos((prev) => { const x = { ...prev, [id]: n }; localStorage.setItem(`dash_sizes_v4_${idRef}`, JSON.stringify(x)); return x; });

  /* ---- Lista de clubes (superuser) ---- */
  useEffect(() => {
    if (!esSuperUser) return;
    (async () => {
      let { data, error } = await supabase.from('clubes').select('id, nombre, escudo_url').order('nombre');
      if (error) data = (await supabase.from('clubes').select('id, nombre').order('nombre')).data;
      if (data) setListaClubes(data);
    })();
  }, [esSuperUser]);

  /* ---- Carga principal ---- */
  useEffect(() => {
    async function cargar() {
      try {
        setCargando(true);
        const club = clubActivo;
        const miJug = perfil?.jugador_id;
        if (!club) {
          if (esSuperUser) { setNombreClub('VISIÓN GLOBAL'); setEscudoClub(''); }
          setCategoriasDisponibles([]);
          setCargando(false);
          return;
        }

        // Club / escudo
        let clubNombre = localStorage.getItem('mi_club') || '';
        if (club) {
          const { data: c } = await supabase.from('clubes').select('nombre, escudo_url').eq('id', club).maybeSingle();
          if (c) { setNombreClub(c.nombre); setEscudoClub(c.escudo_url); clubNombre = c.nombre || clubNombre; }
        } else if (esSuperUser) { setNombreClub('VISTA GLOBAL MASTER'); setEscudoClub(''); }

        // Categorías disponibles (siempre del club elegido)
        let catsClub = [];
        if (club) {
          if (esCT && misCategorias.length > 0) catsClub = misCategorias;
          else {
            const { data: cats } = await supabase.from('partidos').select('categoria').eq('club_id', club);
            catsClub = cats ? [...new Set(cats.map((x) => x.categoria).filter(Boolean))] : [];
          }
          setCategoriasDisponibles(catsClub);
        } else setCategoriasDisponibles([]);
        // Solo filtramos por categoría si esa categoría existe para ESTE club (club sin categorías => no filtra)
        const catEq = !!club && categoriaActiva !== 'Todas' && !!categoriaActiva && catsClub.includes(categoriaActiva);

        // Novedades
        if (club && rol !== 'jugador') {
          const { data: nov } = await supabase.from('novedades').select('*, perfiles(nombre_completo, rol)')
            .eq('club_id', club).in('publico_objetivo', ['CT', 'Ambos']).or(filtroNoVencidas()).order('fecha_creacion', { ascending: false }).limit(4);
          if (nov) setNovedades(catEq ? nov.filter((n) => (n.categorias || []).includes(categoriaActiva)) : nov);
        }

        /* ===== JUGADOR ===== */
        if (rol === 'jugador') {
          if (miJug) {
            const { data: w } = await supabase.from('wellness').select('*').eq('jugador_id', miJug).order('fecha', { ascending: false }).limit(7);
            if (w) setDatosWellness(w);
          }
          setCargando(false);
          return;
        }

        /* ===== STAFF ===== */
        const hoyStr = new Date().toISOString().split('T')[0];
        // Ventana del ACWR: 28 dias hacia atras, contando hoy.
        const desdeCarga = new Date(Date.now() - (DIAS_CRONICA - 1) * 86400000).toISOString().split('T')[0];
        // Ventana del bloque "lo que viene": hoy y los seis dias siguientes.
        const hastaSemana = sumarDias(hoyStr, 6);
        // El mes en curso, para la caja.
        const mesDesde = `${hoyStr.slice(0, 7)}-01`;
        const mesHasta = sumarDias(`${sumarDias(`${hoyStr.slice(0, 7)}-01`, 32).slice(0, 7)}-01`, -1);
        const anio = new Date().getFullYear().toString();

        let qUlt = supabase.from('partidos').select('*').in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: false }).limit(40);
        let qPro = supabase.from('partidos').select('*').eq('estado', 'Pendiente').gte('fecha', hoyStr).order('fecha', { ascending: true }).limit(15);
        let qAnual = supabase.from('partidos').select('id, categoria, goles_propios, goles_rival, fecha, nombre_propio, rival, condicion').gte('fecha', `${anio}-01-01`).in('estado', ['Finalizado', 'Jugado']);
        let qJug = supabase.from('jugadores').select('id, nombre, apellido, dorsal, posicion, categoria, fechanac, vencimiento_apto');
        let qMapPar = supabase.from('partidos').select('id, categoria, fecha');
        if (club) { qUlt = qUlt.eq('club_id', club); qPro = qPro.eq('club_id', club); qAnual = qAnual.eq('club_id', club); qJug = qJug.eq('club_id', club); qMapPar = qMapPar.eq('club_id', club); }
        if (catEq) { qUlt = qUlt.eq('categoria', categoriaActiva); qPro = qPro.eq('categoria', categoriaActiva); qAnual = qAnual.eq('categoria', categoriaActiva); qJug = qJug.eq('categoria', categoriaActiva); }

        const [rUlt, rPro, rAnual, rJug, rMapPar] = await Promise.all([qUlt, qPro, qAnual, qJug, qMapPar]);
        // Solo MIS partidos: descarto los cruces del fixture entre otros equipos
        // (mismo club_id, pero condicion 'Neutral' y nombre_propio = otro equipo).
        const _norm = (s) => String(s || '').trim().toLowerCase();
        const _nombresMios = new Set([_norm(clubNombre), _norm(localStorage.getItem('mi_club') || '')].filter(Boolean));
        // Cruce AJENO = SOLO los partidos entre otros equipos que Torneos inserta con mi club_id:
        // SIEMPRE condicion 'Neutral' y nombre_propio = otro equipo. Un partido Local/Visitante
        // (o sin condicion) es MÍO y se conserva siempre, sin importar el nombre_propio.
        const esCruceAjeno = (p) => p.condicion === 'Neutral' && _nombresMios.size > 0 && p.nombre_propio
          && !_nombresMios.has(_norm(p.nombre_propio)) && !_nombresMios.has(_norm(p.rival));
        const esMio = (p) => !esCruceAjeno(p);
        const partidosJug = (rUlt.data || []).filter(esMio).sort((a, b) => (parseFecha(b.fecha) || 0) - (parseFecha(a.fecha) || 0));
        const jugadores = rJug.data || [];
        const proximoP = (rPro.data || []).filter(esMio)[0] || null;
        setUltimo(partidosJug[0] || null);
        setProximo(proximoP);

        // Balance anual + forma
        let v = 0, e = 0, d = 0, gf = 0, gc = 0;
        (rAnual.data || []).filter(esMio).forEach((p) => { const a = parseInt(p.goles_propios) || 0, b = parseInt(p.goles_rival) || 0; if (a > b) v++; else if (a === b) e++; else d++; gf += a; gc += b; });
        setAnual({ v, e, d, gf, gc });
        setForma(partidosJug.slice(0, 5).reverse().map((p) => ({ id: p.id, res: resultadoDe(p), rival: p.rival, gf: parseInt(p.goles_propios) || 0, gc: parseInt(p.goles_rival) || 0 })));

        /* Las cuatro lecturas que siguen no dependen entre si, asi que van
           juntas en un solo Promise.all: antes eran cuatro viajes en serie
           antes de que el dashboard pudiera pintarse.

           Las dos de `eventos` van por fetchPaginado porque PostgREST corta
           en 1000 filas SIN avisar (200 OK con data recortada). La de tarjetas
           acumula historico completo, asi que es la que revienta primero: al
           pasar el techo dejarian de contarse amarillas y habria suspendidos
           que no salen en el triage, en silencio.

           .range() es un OFFSET, asi que el .order() tiene que ser determinista:
           por eso `id` como criterio de desempate. */
        const idUltimo = partidosJug[0] ? partidosJug[0].id : null;

        const [evsUltimo, tarjetas, sanciones, wellVentana, sesionesSem, deudasSem, lesionesSem, tutores, caja] = await Promise.all([
          idUltimo
            ? fetchPaginado(() => supabase.from('eventos').select('*')
                .eq('id_partido', idUltimo)
                .order('minuto', { ascending: true })
                .order('id', { ascending: true }))
            : Promise.resolve([]),

          club
            ? fetchPaginado(() => supabase.from('eventos')
                .select('id_jugador, accion, id_partido')
                .eq('club_id', club).eq('equipo', 'Propio')
                .in('accion', ['Tarjeta Amarilla', 'Tarjeta Roja'])
                .order('id', { ascending: true }))
            : Promise.resolve([]),

          club
            ? supabase.from('disciplina_sanciones').select('*').eq('club_id', club)
                .then((r) => r.data || [])
            : Promise.resolve([]),

          /* Antes se pedia solo el dia de hoy. El ACWR necesita mirar 28 dias
             hacia atras, asi que se pide la ventana entera de una: son las
             mismas columnas, el mismo viaje, y el "en rojo hoy" sale filtrando
             por fecha en memoria. Va por fetchPaginado porque 28 dias x plantel
             puede pasar las 1000 filas que PostgREST recorta sin avisar. */
          /* fetchPaginado tira excepcion si la consulta falla, y esta vive
             dentro del Promise.all que arma todo el tablero: una sola columna
             mal escrita dejaria el tablon entero en blanco. Se atrapa aca, el
             pulso y el ACWR quedan vacios y lo demas se pinta igual. */
          club
            ? fetchPaginado(() => supabase.from('wellness')
                .select('jugador_id, fecha, sueno, estres, fatiga, dolor_muscular, rpe, minutos_actividad')
                .eq('club_id', club)
                .gte('fecha', desdeCarga)
                .order('fecha', { ascending: true })
                .order('jugador_id', { ascending: true }))
                .catch((e) => { console.error('Tablon: fallo la lectura de wellness:', e); return []; })
            : Promise.resolve([]),

          /* Las tres que siguen son para el bloque de los proximos 7 dias.
             Van en la misma tanda: es una ventana de una semana, son pocas
             filas, y sumarlas aca no cuesta un viaje mas. */
          club
            ? supabase.from('sesiones')
                .select('id, fecha, tipo_sesion, objetivo, categoria_equipo, nivel_carga, tareas_ids')
                .eq('club_id', club).gte('fecha', hoyStr).lte('fecha', hastaSemana)
                .then((r) => r.data || [])
            : Promise.resolve([]),

          club
            ? supabase.from('tesoreria_deudas')
                .select('id, jugador_id, concepto, monto_original, monto_pagado, fecha_vencimiento')
                .eq('club_id', club).gte('fecha_vencimiento', hoyStr).lte('fecha_vencimiento', hastaSemana)
                .then((r) => r.data || [])
            : Promise.resolve([]),

          club
            ? supabase.from('lesiones')
                .select('id, jugador_id, fecha_alta_estimada, fecha_alta_real, estado, zona, tipo, gravedad')
                .eq('club_id', club).gte('fecha_alta_estimada', hoyStr).lte('fecha_alta_estimada', hastaSemana)
                .then((r) => r.data || [])
            : Promise.resolve([]),

          /* Tutores, para el aviso de menores sin contacto cargado. Si la
             migracion todavia no corrio, PostgREST devuelve error y no
             excepcion, asi que `r.data || []` deja el aviso en cero y el
             resto del tablon sigue funcionando. */
          club
            ? supabase.from('tutores')
                .select('id, jugador_id, telefono, principal, puede_retirar')
                .eq('club_id', club)
                .then((r) => r.data || [])
            : Promise.resolve([]),

          /* LA PLATA DEL MES. Cuatro lecturas chicas, acotadas al mes en
             curso salvo las deudas, que son el pendiente acumulado y no
             tienen mes. Sólo se piden si el rol puede ver el módulo: no tiene
             sentido bajarle la caja del club a un entrenador. */
          club && verPlata
            ? Promise.all([
                supabase.from('tesoreria_pagos').select('monto, fecha_pago')
                  .eq('club_id', club).gte('fecha_pago', mesDesde).lte('fecha_pago', mesHasta).then((r) => r.data || []),
                supabase.from('sponsors_pagos').select('monto, fecha_pago')
                  .eq('club_id', club).gte('fecha_pago', mesDesde).lte('fecha_pago', mesHasta).then((r) => r.data || []),
                supabase.from('tesoreria_ingresos_extra').select('monto, fecha')
                  .eq('club_id', club).gte('fecha', mesDesde).lte('fecha', mesHasta).then((r) => r.data || []),
                supabase.from('tesoreria_egresos').select('monto, fecha')
                  .eq('club_id', club).gte('fecha', mesDesde).lte('fecha', mesHasta).then((r) => r.data || []),
                supabase.from('tesoreria_deudas').select('jugador_id, monto_original, monto_pagado, fecha_vencimiento')
                  .eq('club_id', club).then((r) => r.data || []),
              ])
            : Promise.resolve(null),
        ]);

        // Engine sobre el último partido (xG + figuras)
        if (partidosJug[0]) {
          setUltAnalisis(analizarUltimo(evsUltimo, jugadores));
        } else setUltAnalisis({ xgPropio: 0, xgRival: 0, ranking: [] });

      if (club) {
      /* ===== DISCIPLINA (misma lógica que pantalla Disciplina) ===== */
        const catDePartido = {}; (rMapPar.data || []).forEach((p) => { catDePartido[p.id] = p.categoria || 'Sin categoría'; });
        // Las amarillas resetean por temporada (año calendario en curso), igual que el balance anual.
        const partidosTemporada = new Set((rMapPar.data || []).filter((p) => { const f = parseFecha(p.fecha); return f && f.getFullYear() === Number(anio); }).map((p) => p.id));
        const nombreJug = (id) => { const j = jugadores.find((x) => String(x.id) === String(id)); return j ? (j.apellido || j.nombre) : 'Jugador'; };
        const jugIdsCat = new Set(jugadores.map((j) => j.id));

        // Amarillas por jugador + categoría (la acumulación corre por categoría)
        const amarillasCat = {}; // key `${jid}|${cat}` => n
        (tarjetas || []).forEach((t) => {
          if (!t.id_jugador || t.accion !== 'Tarjeta Amarilla') return;
          if (!partidosTemporada.has(t.id_partido)) return; // solo amarillas de la temporada en curso
          const cat = catDePartido[t.id_partido] || 'Sin categoría';
          if (catEq && cat !== categoriaActiva) return;
          const key = `${t.id_jugador}|${cat}`;
          amarillasCat[key] = (amarillasCat[key] || 0) + 1;
        });

        const sanc = sanciones;
        // Bajas de acumulación ya cumplidas (tipo='acumulacion'), por jugador + categoría
        const bajasAcum = {}; // key `${jid}|${cat}` => n
        // Fechas de roja pendientes, TRANSVERSALES (NO incluye las de acumulación)
        const fechasRoja = {};
        (sanc || []).forEach((s) => {
          if (s.tipo === 'acumulacion') {
            const key = `${s.jugador_id}|${s.categoria || 'Sin categoría'}`;
            bajasAcum[key] = (bajasAcum[key] || 0) + 1;
            return;
          }
          if (catEq && !jugIdsCat.has(s.jugador_id)) return;
          const tot = (s.fechas_tribunal || 0) + (s.fechas_internas || 0);
          fechasRoja[s.jugador_id] = (fechasRoja[s.jugador_id] || 0) + Math.max(0, tot - (s.fechas_cumplidas || 0));
        });

        const alertas = [];
        const suspendidosIds = new Set();
        // Suspensión por acumulación de amarillas: ganadas − dadas de baja, POR CATEGORÍA
        Object.entries(amarillasCat).forEach(([key, n]) => {
          const [jid, cat] = key.split('|');
          const ganadas = Math.floor(n / UMBRAL_AMARILLAS);
          const cumplidas = bajasAcum[key] || 0;
          const pendientes = Math.max(0, ganadas - cumplidas);
          if (pendientes > 0) {
            suspendidosIds.add(jid);
            alertas.push({ nivel: 'danger', ico: '🟥', titulo: `${nombreJug(jid)}: suspendido por amarillas`, sub: `${n} amarillas en ${cat} · ${pendientes} fecha${pendientes > 1 ? 's' : ''} pendiente${pendientes > 1 ? 's' : ''}`, ruta: '/disciplina' });
          } else if (n % UMBRAL_AMARILLAS === UMBRAL_AMARILLAS - 1) {
            alertas.push({ nivel: 'warning', ico: '🟨', titulo: `${nombreJug(jid)}, a una del corte`, sub: `${n} amarillas en ${cat}`, ruta: '/disciplina' });
          }
        });
        Object.entries(fechasRoja).forEach(([jid, f]) => { if (f > 0) { suspendidosIds.add(jid); alertas.push({ nivel: 'danger', ico: '⛔', titulo: `${nombreJug(jid)}: ${f} fecha${f > 1 ? 's' : ''} de sanción`, sub: 'Tribunal de disciplina', ruta: '/disciplina' }); } });

        /* ===== WELLNESS HOY ===== */
        const wVentana = wellVentana.filter((r) => !catEq || jugIdsCat.has(r.jugador_id));
        const wHoy = wVentana.filter((r) => String(r.fecha).slice(0, 10) === hoyStr);
        const enRojo = wHoy.filter(enRojoWell);
        if (enRojo.length > 0) alertas.unshift({ nivel: 'warning', ico: '🔋', titulo: `${enRojo.length} ${enRojo.length === 1 ? 'jugador' : 'jugadores'} en rojo hoy`, sub: 'Fatiga, dolor o sueño en zona de alerta', ruta: '/wellness' });

        /* ===== CARGA: ACWR =====
           El wellness de hoy dice como se siente el jugador; el ACWR dice si la
           carga de esta semana se le fue de las manos contra lo que su cuerpo
           viene tolerando. Son cosas distintas y por eso son dos avisos.
           Solo se listan los que tienen historia suficiente (metricasDeCarga
           devuelve acwr en null si no la tienen): no se inventa un numero.
           Detalle jugador por jugador en Rendimiento. */
        const carga = cargaDelPlantel(wVentana, jugadores, hoyStr);
        const enRiesgo = carga.filter((c) => c.acwr != null && zonaDe(c.acwr).id === 'riesgo');
        const enPrecaucion = carga.filter((c) => c.acwr != null && zonaDe(c.acwr).id === 'precaucion');
        if (enRiesgo.length > 0) {
          const nombres = enRiesgo.slice(0, 3).map((c) => `${c.jugador.nombre || ''} ${c.jugador.apellido || ''}`.trim()).filter(Boolean).join(', ');
          alertas.unshift({
            nivel: 'danger',
            ico: '📈',
            titulo: `${enRiesgo.length} ${enRiesgo.length === 1 ? 'jugador' : 'jugadores'} con carga en riesgo`,
            sub: `ACWR sobre 1.50${nombres ? ` · ${nombres}${enRiesgo.length > 3 ? ' y más' : ''}` : ''}`,
            ruta: '/rendimiento',
          });
        } else if (enPrecaucion.length > 0) {
          alertas.push({
            nivel: 'warning',
            ico: '📈',
            titulo: `${enPrecaucion.length} ${enPrecaucion.length === 1 ? 'jugador' : 'jugadores'} con carga en precaución`,
            sub: 'ACWR entre 1.30 y 1.50 · subí la carga más despacio',
            ruta: '/rendimiento',
          });
        }
        /* ===== TUTORES: MENORES SIN CONTACTO =====
           No es un numero de rendimiento, es responsabilidad legal: si al
           chico le pasa algo en un entrenamiento y no hay a quien llamar, el
           problema es del club. Solo se avisa lo GRAVE (sin tutor, sin
           telefono, sin principal); los permisos que faltan responder se ven
           en la ficha del jugador y no merecen ocupar el triage. */
        setJugadoresBD(jugadores);
        setTutoresBD(tutores);
        setWellnessVentana(wVentana);

        /* La caja del mes: cobrado contra lo que falta cobrar. `caja` viene en
           null cuando el rol no la puede ver, y ahi el modulo no se muestra. */
        if (caja) {
          const [pagos, sponsors, extras, egresos, deudas] = caja;
          const sumar = (xs) => xs.reduce((a2, x) => a2 + (Number(x.monto) || 0), 0);
          const pendiente = deudas.reduce((a2, d) => a2 + Math.max(0, (Number(d.monto_original) || 0) - (Number(d.monto_pagado) || 0)), 0);
          const vencidas = deudas.filter((d) => {
            const saldo = (Number(d.monto_original) || 0) - (Number(d.monto_pagado) || 0);
            return saldo > 0 && d.fecha_vencimiento && String(d.fecha_vencimiento).slice(0, 10) < hoyStr;
          });
          const cobrado = sumar(pagos) + sumar(sponsors) + sumar(extras);
          const gastado = sumar(egresos);
          setPlata({
            cobrado, gastado, saldo: cobrado - gastado,
            pendiente,
            vencidas: vencidas.length,
            montoVencido: vencidas.reduce((a2, d) => a2 + Math.max(0, (Number(d.monto_original) || 0) - (Number(d.monto_pagado) || 0)), 0),
            deudores: new Set(deudas.filter((d) => (Number(d.monto_original) || 0) - (Number(d.monto_pagado) || 0) > 0).map((d) => String(d.jugador_id))).size,
          });
        } else setPlata(null);

        const tut = resumenClub(jugadores, tutores, hoyStr);
        if (tut.conGraves > 0) {
          alertas.push({
            nivel: 'warning',
            ico: '👨‍👩‍👦',
            titulo: `${tut.conGraves} ${tut.conGraves === 1 ? 'jugador' : 'jugadores'} sin tutor a quién llamar`,
            sub: tut.sinTutor > 0 ? `${tut.sinTutor} sin ningún tutor cargado` : 'Falta el teléfono o el contacto principal',
            ruta: '/plantel',
          });
        }

        /* ===== LO QUE VIENE (7 DIAS) =====
           Mismo armado que la pantalla Agenda, para que el tablon y la agenda
           no puedan decir cosas distintas. Las consultas ya vienen recortadas
           por club y por categoria activa, asi que aca no se vuelve a filtrar. */
        setSemana(construirAgenda({
          partidos: (rPro.data || []).filter(esMio),
          sesiones: sesionesSem,
          jugadores,
          deudas: deudasSem,
          lesiones: lesionesSem,
          desde: hoyStr,
          hasta: hastaSemana,
        }));

        setTriage(ordenarAlertas(alertas));
        setPulso(wHoy.length ? { score: (wHoy.reduce((a, r) => a + readinessDe(r), 0) / wHoy.length).toFixed(1), registros: wHoy.length, enRojo: enRojo.length } : { score: null, registros: 0, enRojo: 0 });

        /* ===== PREPARACIÓN PRÓXIMO ===== */
        if (proximoP) {
          const fp = parseFecha(proximoP.fecha);
          const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
          const dias = fp ? Math.ceil((fp.getTime() - hoy0.getTime()) / 86400000) : null;
          const conv = plantillaIds(proximoP);
          const plantel = conv.length || jugadores.length;
          const susp = conv.length ? conv.filter((id) => suspendidosIds.has(String(id))).length : suspendidosIds.size;
          const enDuda = enRojo.length;
          setPrep({ dias, plantel, susp, enDuda, disponibles: Math.max(0, plantel - susp - enDuda) });
        } else setPrep(null);
      } else { setTriage([]); setPulso({ score: null, registros: 0, enRojo: 0 }); setPrep(null); setSemana([]); setPlata(null); setTutoresBD([]); setWellnessVentana([]); setJugadoresBD([]); }

        setCargando(false);
      } catch (err) { console.error('Error cargando dashboard:', err); setCargando(false); }
    }
    cargar();
  }, [clubActivo, esSuperUser, rol, categoriaActiva, esCT, verPlata, misCategorias, perfil?.id, perfil?.jugador_id]);

  /* ---- Selectores ---- */
  const handleCambioCategoria = (e) => { setCategoriaActiva(e.target.value); localStorage.setItem('dash_categoria', e.target.value); };
  const handleCambioClub = (e) => {
    const id = e.target.value;
    if (!id) { ['club_id', 'mi_club', 'escudo_url'].forEach((k) => localStorage.removeItem(k)); setClubMaster(''); setNombreClub('VISTA GLOBAL MASTER'); setEscudoClub(''); }
    else {
      const club = listaClubes.find((c) => c.id === id); if (!club) return;
      localStorage.setItem('club_id', id); localStorage.setItem('mi_club', club.nombre);
      if (club.escudo_url) { localStorage.setItem('escudo_url', club.escudo_url); setEscudoClub(club.escudo_url); } else { localStorage.removeItem('escudo_url'); setEscudoClub(''); }
      setClubMaster(id); setNombreClub(club.nombre); setCategoriaActiva(''); localStorage.setItem('dash_categoria', '');
    }
  };
  const linkKiosco = `${window.location.origin}/kiosco?club=${clubActivo}`;
  const mostrarSelectorCat = rol !== 'jugador' && categoriasDisponibles.length > 1;
  const sinClub = esSuperUser && !clubActivo;

  /* ---- Guard: club sin configurar ---- */
  if (!cargando && !clubActivo && !esSuperUser) {
    if (esAdmin || esManager) return (
      <div style={{ animation: 'fadeIn 0.3s', padding: '50px 20px', textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ fontSize: '4rem', marginBottom: 20 }}>🏟️</div>
        <h2 style={{ color: 'var(--accent)', fontWeight: 900 }}>¡BIENVENIDO A VIRTUAL.CLUB!</h2>
        <p style={{ color: 'var(--text-dim)', marginBottom: 30, lineHeight: 1.6 }}>Para empezar, creá el perfil de tu equipo.</p>
        <button onClick={() => navigate('/configuracion')} className="btn-action" style={{ width: '100%', padding: 20, fontSize: '1.1rem' }}>CONFIGURAR MI CLUB AHORA</button>
      </div>
    );
    return <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}><h2>El club aún no está configurado.</h2><p>Contactá a la administración.</p></div>;
  }

  /* ========================================================================
     SUB-COMPONENTES DE RENDER
  ======================================================================== */
  /* `Card` vive AFUERA del componente (ver arriba del archivo). Estaba acá
     adentro, y eso hacía que React la viera como un tipo distinto en cada
     render: desmontaba y volvía a montar las doce tarjetas ante cualquier
     cambio de estado, perdiendo la posición de scroll de las scrolleables y
     repitiendo la animación de entrada. Lo que necesita del componente viaja
     en `ctx`. */
  const ctx = { esMovil, tamanos, modoEdicion, cambiarTamano, mover, columnas };
  const Label = ({ children, color }) => <div className="stat-label" style={{ color: color || 'var(--text-dim)', fontSize: '0.7rem', letterSpacing: '0.5px', marginBottom: 12 }}>{children}</div>;
  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  const renderModulo = (id, index) => {
    /* ESTADO */
    if (id === 'm_estado') {
      const { v, e, d, gf, gc } = anual; const dg = gf - gc; const pts = v * 3 + e;
      const invIdx = forma.slice().reverse().findIndex((f) => f.res === 'D');
      const nInv = invIdx === -1 ? forma.length : invIdx; const enRacha = nInv >= 3;
      const cum = []; let acc = 0; forma.forEach((f) => { acc += f.res === 'V' ? 3 : f.res === 'E' ? 1 : 0; cum.push(acc); });
      const maxC = Math.max(1, ...cum);
      const poly = cum.map((y, i) => `${forma.length > 1 ? (i / (forma.length - 1)) * 76 + 2 : 40},${26 - (y / maxC) * 22}`).join(' ');
      return (
        <Card key={id} id={id} accent="var(--accent)" index={index} ctx={ctx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: enRacha ? '#10b981' : 'var(--text-dim)', background: enRacha ? 'rgba(16,185,129,0.1)' : 'var(--panel)', border: `1px solid ${enRacha ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`, padding: '5px 12px', borderRadius: 20 }}>
              {enRacha ? `🔥 En racha · ${nInv} invicto` : forma.length ? 'Forma estable' : 'Sin partidos aún'}
            </span>
            {forma.length > 1 && <svg width="80" height="30" viewBox="0 0 80 30"><polyline points={poly} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
            {[{ n: pts, l: 'PTS', c: 'var(--text)' }, { n: (dg > 0 ? '+' : '') + dg, l: 'DG', c: dg >= 0 ? '#10b981' : '#ef4444' }, { n: `${v}-${e}-${d}`, l: 'V-E-D', c: 'var(--text)', sm: true }, { n: `${gf}/${gc}`, l: 'GF/GC', c: 'var(--accent)', sm: true }].map((b, i) => (
              <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center' }}>
                <div style={{ ...mono, fontSize: b.sm ? '0.95rem' : '1.4rem', fontWeight: 900, color: b.c }}>{b.n}</div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700, marginTop: 2 }}>{b.l}</div>
              </div>
            ))}
          </div>
        </Card>
      );
    }
    /* TRIAGE */
    if (id === 'm_triage') {
      const col = { danger: '#ef4444', warning: '#f59e0b' };
      const bg = { danger: 'rgba(239,68,68,0.12)', warning: 'rgba(245,158,11,0.12)' };
      return (
        <Card key={id} id={id} accent="#ef4444" index={index} ctx={ctx}>
          <Label color="#ef4444">REQUIERE TU ATENCIÓN</Label>
          {triage.length === 0 ? <div style={{ textAlign: 'center', color: '#10b981', padding: 14, fontSize: '0.85rem' }}>✅ Todo en orden. Sin alertas.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {triage.map((a, i) => (
                <div key={i} onClick={() => !modoEdicion && a.ruta && navigate(a.ruta)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: modoEdicion ? 'default' : 'pointer' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: bg[a.nivel], color: col[a.nivel], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.ico}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{a.sub}</div>
                  </div>
                  <span style={{ color: 'var(--text-dim)' }}>›</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      );
    }
    /* LO QUE VIENE */
    if (id === 'm_agenda') {
      /* Hasta seis renglones: el tablon es un vistazo, no la agenda entera.
         Si hay mas, el pie lleva a /agenda, que es donde estan todos. */
      const lista = semana.slice(0, 6);
      const restan = semana.length - lista.length;
      const rotuloDia = (f) => {
        const n = diasEntre(new Date().toISOString().split('T')[0], f);
        if (n <= 0) return 'HOY';
        if (n === 1) return 'MAÑ';
        const [, m, d] = f.split('-');
        return `${d}/${m}`;
      };
      return (
        <Card key={id} id={id} accent="#8b5cf6" index={index} ctx={ctx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color="#8b5cf6">LOS PRÓXIMOS 7 DÍAS</Label>
            {!modoEdicion && <span onClick={() => navigate('/agenda')} style={{ fontSize: '0.65rem', color: 'var(--text-dim)', cursor: 'pointer' }}>ver agenda ›</span>}
          </div>
          {lista.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, fontSize: '0.85rem' }}>Semana despejada. Nada agendado.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {lista.map((ev) => {
                const def = TIPOS[ev.tipo];
                return (
                  <div key={ev.id} onClick={() => !modoEdicion && navigate(ev.ruta)}
                       style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: modoEdicion ? 'default' : 'pointer' }}>
                    <span style={{ ...mono, fontSize: '0.6rem', fontWeight: 800, color: def.color, width: 34, flexShrink: 0 }}>{rotuloDia(ev.fecha)}</span>
                    <span style={{ flexShrink: 0 }}>{def.ico}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.hora ? <span style={{ ...mono, color: 'var(--text-dim)', marginRight: 6 }}>{ev.hora}</span> : null}
                        {ev.titulo}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', flexShrink: 0 }}>{ev.categoria}</span>
                  </div>
                );
              })}
              {restan > 0 && (
                <div onClick={() => !modoEdicion && navigate('/agenda')} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-dim)', cursor: modoEdicion ? 'default' : 'pointer', paddingTop: 4 }}>
                  y {restan} cosa{restan > 1 ? 's' : ''} más esta semana ›
                </div>
              )}
            </div>
          )}
        </Card>
      );
    }
    /* PROXIMO */
    if (id === 'm_proximo') {
      return (
        <Card key={id} id={id} accent="#10b981" index={index} ctx={ctx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color="#10b981">PRÓXIMO PARTIDO</Label>
            {prep?.dias != null && <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 12 }}>{prep.dias <= 0 ? 'Hoy' : `en ${prep.dias} día${prep.dias > 1 ? 's' : ''}`}</span>}
          </div>
          {proximo ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>vs {proximo.rival?.toUpperCase()}</span>
                <span style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-dim)' }}>{proximo.fecha?.split('-').reverse().join('/')} · {proximo.competicion || proximo.torneo_id || ''}</span>
              </div>
              {prep && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[{ n: prep.disponibles, l: 'disponibles', c: '#10b981' }, { n: prep.susp, l: 'suspendidos', c: '#ef4444' }, { n: prep.enDuda, l: 'en duda', c: '#f59e0b' }].map((b, i) => (
                    <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ ...mono, fontSize: '1.2rem', fontWeight: 900, color: b.c }}>{b.n}</div>
                      <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>{b.l}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => !modoEdicion && navigate('/scouting-rivales')} className="btn-secondary" style={{ fontSize: '0.75rem', padding: 10 }}>🕵️‍♂️ Scouting rival</button>
                <button onClick={() => !modoEdicion && navigate('/microciclo')} style={{ fontSize: '0.75rem', padding: 10, background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>🗓️ Planificar sesión</button>
              </div>
            </>
          ) : <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, background: 'var(--panel)', borderRadius: 8, border: '1px dashed var(--border)', fontSize: '0.8rem' }}>Sin partidos pendientes</div>}
        </Card>
      );
    }
    /* FORMA + xG */
    if (id === 'm_forma') {
      const cR = { V: '#10b981', E: '#f59e0b', D: '#ef4444' };
      const cBg = { V: 'rgba(16,185,129,0.15)', E: 'rgba(245,158,11,0.15)', D: 'rgba(239,68,68,0.15)' };
      const { xgPropio, xgRival } = ultAnalisis; const hayXg = xgPropio > 0 || xgRival > 0;
      const golF = ultimo ? (parseInt(ultimo.goles_propios) || 0) : 0; const delta = golF - xgPropio;
      const ver = !hayXg ? null : delta > 0.6 ? { t: 'Con eficacia', c: '#10b981' } : delta < -0.6 ? { t: 'Faltó pegada', c: '#ef4444' } : { t: 'Lo esperado', c: '#3b82f6' };
      return (
        <Card key={id} id={id} accent="#3b82f6" index={index} ctx={ctx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color="#3b82f6">FORMA · ÚLTIMOS 5</Label>
            <div style={{ display: 'flex', gap: 4 }}>
              {forma.length ? forma.map((f, i) => <span key={i} title={`vs ${f.rival} ${f.gf}-${f.gc}`} style={{ width: 22, height: 22, borderRadius: '50%', background: cBg[f.res], color: cR[f.res], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{f.res}</span>) : <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Sin datos</span>}
            </div>
          </div>
          {forma.length > 1 && <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>más reciente →</div>}
          {hayXg && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>xG últ. <span style={{ ...mono, color: 'var(--text)' }}>{xgPropio.toFixed(1)}</span> a favor · <span style={{ ...mono, color: '#ef4444' }}>{xgRival.toFixed(1)}</span> en contra</span>
              {ver && <span style={{ fontSize: '0.65rem', color: ver.c, background: `rgba(${hexToRgb(ver.c)},0.12)`, padding: '3px 8px', borderRadius: 8, fontWeight: 700 }}>{ver.t}</span>}
            </div>
          )}
        </Card>
      );
    }
    /* FIGURAS */
    if (id === 'm_protagonistas') {
      const top = ultAnalisis.ranking.slice(0, 3);
      return (
        <Card key={id} id={id} accent="var(--accent)" index={index} ctx={ctx}>
          <Label color="var(--accent)">FIGURAS · ÚLTIMO PARTIDO</Label>
          {top.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', padding: 10 }}>Sin análisis del último partido</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top.map((j, i) => (
                <div key={j.id} onClick={() => !modoEdicion && navigate('/jugador', { state: { jugadorId: j.id } })} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: modoEdicion ? 'default' : 'pointer' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? 'rgba(0,230,118,0.15)' : 'var(--panel)', color: i === 0 ? 'var(--accent)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(j.nombre || '').toUpperCase()}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{j.posicion || '—'}</div>
                  </div>
                  <span style={{ ...mono, fontWeight: 800, fontSize: '0.95rem', color: Number(j.impacto) >= 6 ? 'var(--accent)' : '#ef4444' }}>{Number(j.impacto).toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      );
    }
    /* PULSO */
    if (id === 'm_pulso') {
      return (
        <Card key={id} id={id} accent="#10b981" index={index} ctx={ctx}>
          <Label color="#10b981">PULSO DEL PLANTEL · HOY</Label>
          {pulso.registros === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', padding: 10 }}>Sin cargas de wellness hoy</div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 900, color: pulso.score >= 3.5 ? '#10b981' : pulso.score >= 2.5 ? '#f59e0b' : '#ef4444' }}>{pulso.score}<span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>/5</span></div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700 }}>READINESS</div>
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 900, color: pulso.enRojo > 0 ? '#ef4444' : '#10b981' }}>{pulso.enRojo}</div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700 }}>EN ROJO</div>
                </div>
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textAlign: 'right', marginTop: 8 }}>{pulso.registros} carga{pulso.registros !== 1 ? 's' : ''} hoy</div>
            </>
          )}
        </Card>
      );
    }
    /* ULTIMO */
    if (id === 'm_ultimo') {
      const res = ultimo ? resultadoDe(ultimo) : null;
      return (
        <Card key={id} id={id} accent="var(--text-dim)" index={index} ctx={ctx}>
          <Label>ÚLTIMO RESULTADO</Label>
          {ultimo ? (
            <div style={{ background: 'var(--panel)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: 6 }}>
                <span>{ultimo.fecha?.split('-').reverse().join('/')}</span><span>{ultimo.competicion || ''}</span>
              </div>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {ultimo.rival?.toUpperCase()}</div>
                <div style={{ ...mono, fontSize: '1.6rem', fontWeight: 900, color: res === 'V' ? '#10b981' : res === 'E' ? '#f59e0b' : '#ef4444' }}>{ultimo.goles_propios ?? 0} - {ultimo.goles_rival ?? 0}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => !modoEdicion && navigate(`/resumen/${ultimo.id}`)} className="btn-secondary" style={{ flex: 1, fontSize: '0.65rem', padding: 7 }}>RESUMEN</button>
                <button onClick={() => !modoEdicion && navigate(`/resumen/${ultimo.id}`)} style={{ flex: 1, fontSize: '0.65rem', padding: 7, background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer' }}>VIDEO</button>
              </div>
            </div>
          ) : <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, background: 'var(--panel)', borderRadius: 8, border: '1px dashed var(--border)', fontSize: '0.8rem' }}>Sin registros</div>}
        </Card>
      );
    }
    /* NOVEDADES */
    if (id === 'm_novedades') {
      return (
        <Card key={id} id={id} accent="#facc15" index={index} ctx={ctx} scroll>
          <Label color="#facc15">TABLÓN DE ANUNCIOS</Label>
          {novedades.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, fontSize: '0.8rem' }}>Sin novedades recientes.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {novedades.map((n) => (
                <div key={n.id} style={{ background: 'var(--panel)', borderLeft: '3px solid #facc15', padding: 10, borderRadius: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                    <strong>{n.perfiles?.nombre_completo || 'Administración'}</strong><span>{new Date(n.fecha_creacion).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{n.mensaje}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      );
    }
    /* LA PLATA DEL MES */
    if (id === 'm_plata') {
      if (!plata) return null;
      const money = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;
      const positivo = plata.saldo >= 0;
      return (
        <Card key={id} id={id} accent="#eab308" index={index} ctx={ctx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color="#eab308">LA PLATA DEL MES</Label>
            {!modoEdicion && <span onClick={() => navigate('/tesoreria')} style={{ fontSize: '0.65rem', color: 'var(--text-dim)', cursor: 'pointer' }}>tesorería ›</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { l: 'ENTRÓ', v: money(plata.cobrado), c: '#10b981' },
              { l: 'SALIÓ', v: money(plata.gastado), c: '#ef4444' },
              { l: 'SALDO', v: money(plata.saldo), c: positivo ? 'var(--accent)' : '#ef4444' },
            ].map((b2) => (
              <div key={b2.l} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center', minWidth: 0 }}>
                <div style={{ ...mono, fontSize: '0.95rem', fontWeight: 900, color: b2.c, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b2.v}</div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700, marginTop: 2 }}>{b2.l}</div>
              </div>
            ))}
          </div>

          {/* Lo pendiente no es del mes: es el acumulado que falta cobrar. */}
          <div onClick={() => !modoEdicion && navigate('/tesoreria')}
               style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, cursor: modoEdicion ? 'default' : 'pointer',
                        background: plata.vencidas > 0 ? 'rgba(239,68,68,0.10)' : 'var(--panel)',
                        border: `1px solid ${plata.vencidas > 0 ? 'rgba(239,68,68,0.35)' : 'var(--border)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Falta cobrar</span>
              <span style={{ ...mono, fontSize: '0.95rem', fontWeight: 900, color: plata.pendiente > 0 ? '#f59e0b' : 'var(--text-dim)' }}>{money(plata.pendiente)}</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 3 }}>
              {plata.deudores === 0
                ? 'Nadie debe nada. Al día.'
                : `${plata.deudores} ${plata.deudores === 1 ? 'jugador' : 'jugadores'}${plata.vencidas > 0 ? ` · ${plata.vencidas} cuota${plata.vencidas > 1 ? 's' : ''} vencida${plata.vencidas > 1 ? 's' : ''} por ${money(plata.montoVencido)}` : ''}`}
            </div>
          </div>
        </Card>
      );
    }

    /* QUÉ FALTA CARGAR */
    if (id === 'm_cumplimiento') {
      const hoyD = new Date().toISOString().slice(0, 10);
      const en30 = sumarDias(hoyD, 30);
      const tut = resumenClub(jugadoresBD, tutoresBD, hoyD);
      const aptoVencido = jugadoresBD.filter((j) => j.vencimiento_apto && String(j.vencimiento_apto).slice(0, 10) < hoyD).length;
      const aptoPorVencer = jugadoresBD.filter((j) => {
        const v = j.vencimiento_apto ? String(j.vencimiento_apto).slice(0, 10) : null;
        return v && v >= hoyD && v <= en30;
      }).length;
      const sinApto = jugadoresBD.filter((j) => !j.vencimiento_apto).length;

      const filas = [
        { k: 'apto_venc', ico: '🩺', t: 'Apto vencido', n: aptoVencido, grave: true, ruta: '/plantel' },
        { k: 'apto_prox', ico: '📅', t: 'Apto vence en 30 días', n: aptoPorVencer, grave: false, ruta: '/plantel' },
        { k: 'sin_apto', ico: '❔', t: 'Sin apto cargado', n: sinApto, grave: false, ruta: '/plantel' },
        { k: 'tutor', ico: '👨‍👩‍👦', t: 'Sin tutor a quién llamar', n: tut.conGraves, grave: true, ruta: '/plantel' },
      ].filter((f) => f.n > 0);

      return (
        <Card key={id} id={id} accent="#38bdf8" index={index} ctx={ctx}>
          <Label color="#38bdf8">QUÉ FALTA CARGAR</Label>
          {filas.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#10b981', padding: 14, fontSize: '0.85rem' }}>✅ Las fichas están completas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filas.map((f) => (
                <div key={f.k} onClick={() => !modoEdicion && navigate(f.ruta)}
                     style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: modoEdicion ? 'default' : 'pointer' }}>
                  <span style={{ flexShrink: 0 }}>{f.ico}</span>
                  <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text)', minWidth: 0 }}>{f.t}</span>
                  <span style={{ ...mono, fontSize: '1rem', fontWeight: 900, color: f.grave ? '#ef4444' : '#f59e0b' }}>{f.n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      );
    }

    /* WELLNESS SIN CARGAR HOY */
    if (id === 'm_wellness_pend') {
      const hoyD = new Date().toISOString().slice(0, 10);
      const cargaron = new Set(wellnessVentana.filter((w) => String(w.fecha).slice(0, 10) === hoyD).map((w) => String(w.jugador_id)));
      const faltan = jugadoresBD.filter((j) => !cargaron.has(String(j.id)));
      const total = jugadoresBD.length;
      const pct = total > 0 ? Math.round((cargaron.size / total) * 100) : 0;
      return (
        <Card key={id} id={id} accent="#14b8a6" index={index} ctx={ctx}>
          <Label color="#14b8a6">WELLNESS DE HOY</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...mono, fontSize: '1.6rem', fontWeight: 900, color: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }}>{pct}%</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{cargaron.size} de {total} cargaron</span>
          </div>
          <div style={{ height: 6, background: 'var(--panel)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }} />
          </div>
          {faltan.length > 0 && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}>
              Faltan: {faltan.slice(0, 4).map((j) => `${j.nombre} ${(j.apellido || '').charAt(0)}.`).join(', ')}
              {faltan.length > 4 ? ` y ${faltan.length - 4} más` : ''}
            </div>
          )}
          {!modoEdicion && (
            <button onClick={() => navigate('/wellness')} style={{ marginTop: 12, fontSize: '0.75rem', padding: 9, background: 'transparent', color: '#14b8a6', border: '1px solid #14b8a6', borderRadius: 6, fontWeight: 800, cursor: 'pointer' }}>
              VER WELLNESS
            </button>
          )}
        </Card>
      );
    }

    /* CARGA DEL PLANTEL (ACWR) */
    if (id === 'm_carga') {
      const hoyD = new Date().toISOString().slice(0, 10);
      const filas = cargaDelPlantel(wellnessVentana, jugadoresBD, hoyD).filter((c) => c.acwr != null);
      const riesgo = filas.filter((c) => zonaDe(c.acwr).id === 'riesgo');
      const precaucion = filas.filter((c) => zonaDe(c.acwr).id === 'precaucion');
      return (
        <Card key={id} id={id} accent="#f97316" index={index} ctx={ctx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color="#f97316">CARGA DEL PLANTEL</Label>
            {!modoEdicion && <span onClick={() => navigate('/rendimiento')} style={{ fontSize: '0.65rem', color: 'var(--text-dim)', cursor: 'pointer' }}>detalle ›</span>}
          </div>
          {filas.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, fontSize: '0.8rem' }}>
              Todavía no hay suficientes días de RPE cargados.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { l: 'EN ZONA', n: filas.length - riesgo.length - precaucion.length, c: '#10b981' },
                  { l: 'PRECAUCIÓN', n: precaucion.length, c: '#fbbf24' },
                  { l: 'RIESGO', n: riesgo.length, c: '#ef4444' },
                ].map((b2) => (
                  <div key={b2.l} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center' }}>
                    <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 900, color: b2.c }}>{b2.n}</div>
                    <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', fontWeight: 700, marginTop: 2 }}>{b2.l}</div>
                  </div>
                ))}
              </div>
              {riesgo.length > 0 && (
                <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 10, lineHeight: 1.5 }}>
                  {riesgo.slice(0, 3).map((c) => `${c.jugador.nombre} ${(c.jugador.apellido || '').charAt(0)}.`).join(', ')}
                  {riesgo.length > 3 ? ` y ${riesgo.length - 3} más` : ''}
                </div>
              )}
            </>
          )}
        </Card>
      );
    }

    /* ACCESOS */
    if (id === 'm_accesos') {
      /* Eran once iconos fijos e iguales para todos los del rol, compitiendo
         por el mismo espacio. Cada club entra siempre a las mismas tres o
         cuatro pantallas, así que ahora las más usadas van adelante y el
         resto queda detrás de "ver todos". El conteo es de este dispositivo,
         igual que el resto del tablero. */
      const todos = rankAccesos(LINKS.filter((l) => l.roles.includes(rol)), usoAccesos);
      const links = verTodosAccesos ? todos : todos.slice(0, ACCESOS_VISIBLES);
      const ocultos = todos.length - links.length;
      const irA = (l) => {
        if (modoEdicion) return;
        setUsoAccesos(anotarUso(l.ruta));
        navigate(l.ruta);
      };
      return (
        <Card key={id} id={id} index={index} ctx={ctx}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>ACCESOS RÁPIDOS</Label>
            {(ocultos > 0 || verTodosAccesos) && (
              <span onClick={() => setVerTodosAccesos((v) => !v)} style={{ fontSize: '0.65rem', color: 'var(--text-dim)', cursor: 'pointer' }}>
                {verTodosAccesos ? 'ver menos' : `ver los ${todos.length} ›`}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(min(96px, 100%), 1fr))', gap: 8 }}>
            {links.map((l) => (
              <div key={l.ruta} onClick={() => irA(l)} style={{ cursor: modoEdicion ? 'default' : 'pointer', border: `1px solid ${l.color}`, borderRadius: 10, padding: '12px 6px', textAlign: 'center', background: `linear-gradient(180deg, rgba(${hexToRgb(l.color)},0.06) 0%, rgba(0,0,0,0) 100%)` }}>
                <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>{l.icon}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: l.color, lineHeight: 1.1 }}>{l.titulo}</div>
              </div>
            ))}
          </div>
        </Card>
      );
    }
    /* JUGADOR: WELLNESS */
    if (id === 'm_jug_wellness') {
      const u = datosWellness[0];
      return (
        <Card key={id} id={id} accent="#f59e0b" index={index} ctx={ctx}>
          <Label color="#f59e0b">MI WELLNESS</Label>
          {u ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[{ l: 'SUEÑO', v: u.sueno }, { l: 'FATIGA', v: u.fatiga }, { l: 'DOLOR', v: u.dolor_muscular }, { l: 'RPE', v: u.rpe }].map((m, i) => (
                <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 2px', textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)' }}>{m.v ?? '—'}</div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700 }}>{m.l}</div>
                </div>
              ))}
            </div>
          ) : <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', padding: 10 }}>Todavía no cargaste wellness.</div>}
          <button onClick={() => navigate('/wellness')} style={{ marginTop: 12, fontSize: '0.8rem', padding: 11, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, fontWeight: 900, cursor: 'pointer' }}>🌡️ CARGAR WELLNESS DE HOY</button>
        </Card>
      );
    }
    /* JUGADOR: PERFIL */
    if (id === 'm_jug_perfil') {
      return (
        <Card key={id} id={id} accent="#3b82f6" index={index} ctx={ctx}>
          <Label color="#3b82f6">MI PERFIL</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--panel)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>🏃‍♂️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>{perfil?.nombre || 'Jugador'}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Tus métricas, videos y evolución.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button onClick={() => navigate('/jugador-perfil')} className="btn-secondary" style={{ fontSize: '0.8rem', padding: 10 }}>📊 Mi juego</button>
            <button onClick={() => navigate('/rendimiento')} style={{ fontSize: '0.8rem', padding: 10, background: '#f43f5e', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>🧬 Biomecánica</button>
          </div>
        </Card>
      );
    }
    return null;
  };

  /* ========================================================================
     LAYOUT
  ======================================================================== */
  /* ---- KIOSCO: menú simple ----
   *
   * Este retorno temprano VA ACÁ ABAJO, después de todos los hooks, y no
   * arriba donde estaba. React exige que en cada render se llamen los mismos
   * hooks y en el mismo orden: cortando arriba, el render en modo kiosco no
   * ejecutaba ninguno de los treinta que vienen después.
   *
   * Mientras `isKiosco` no cambiara, no se notaba. Pero cambia: "SALIR DEL
   * KIOSCO" borra la marca de localStorage y recién después navega, así que
   * entre el cierre de sesión y la navegación queda un render con `isKiosco`
   * ya en false. Ese render ejecuta treinta hooks que el anterior no tenía, y
   * eso React lo corta con "Rendered more hooks than during the previous
   * render": pantalla negra justo al salir. */
  if (isKiosco) {
    const accesos = [
      { ruta: '/wellness', icon: '⚖️', t: 'Cargar Wellness', s: 'Sueño, estrés, fatiga y dolor' },
      { ruta: '/rendimiento', icon: '🏋️‍♂️', t: 'Rendimiento / Prevención', s: 'Cargar RPE y kinesiología' },
      { ruta: '/perfil', icon: '📊', t: 'Mi Perfil de Juego', s: 'Estadísticas, videos y quintetos' },
    ];
    return (
      <div style={{ padding: '30px 20px', maxWidth: 600, margin: '0 auto', textAlign: 'center', animation: 'fadeIn 0.3s' }}>
        <h1 style={{ color: 'var(--accent)', fontSize: '2.2rem', marginBottom: 5, textTransform: 'uppercase' }}>¡Hola, {kioscoNombre}!</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: 40 }}>¿Qué necesitás hacer hoy?</p>
        <div style={{ display: 'grid', gap: 20 }}>
          {accesos.map((a) => (
            <button key={a.ruta} onClick={() => navigate(a.ruta)} className="bento-card" style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--panel)', border: '1px solid var(--border)', padding: 20, borderRadius: 12, color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: '2.5rem' }}>{a.icon}</span>
              <div><strong style={{ display: 'block', fontSize: '1.2rem' }}>{a.t}</strong><span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{a.s}</span></div>
            </button>
          ))}
        </div>
        <button onClick={salirKiosco} style={{ marginTop: 50, background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '12px 25px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>SALIR DEL KIOSCO</button>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
      {/* HEADER + SELECTORES (arriba de todo) */}
      <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'stretch' : 'center', marginBottom: 25, paddingBottom: 20, borderBottom: '1px solid var(--border)', gap: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ width: esMovil ? 50 : 60, height: esMovil ? 50 : 60, borderRadius: '50%', background: 'var(--panel)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: esMovil ? '1rem' : '1.5rem', overflow: 'hidden', flexShrink: 0 }}>
            {esSuperUser && !clubActivo ? '👑' : escudoClub ? <img src={escudoClub} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : nombreClub.substring(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-label" style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>CENTRO DE MANDO • {rol?.toUpperCase()}</div>
            <h1 style={{ margin: 0, fontSize: esMovil ? '1.5rem' : '1.8rem', fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreClub}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', gap: 10, width: esMovil ? '100%' : 'auto' }}>
          {mostrarSelectorCat && (
            <select value={categoriaActiva} onChange={handleCambioCategoria} style={selStyle(esMovil)}>
              {!(esCT && misCategorias.length > 0) && <option value="Todas">👉 TODAS LAS CATEGORÍAS</option>}
              {categoriasDisponibles.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          )}
          {esSuperUser && (
            <select value={clubActivo} onChange={handleCambioClub} style={{ ...selStyle(esMovil), borderColor: '#c084fc', color: '#c084fc' }}>
              <option value="">🌍 VISIÓN GLOBAL (TODOS)</option>
              {listaClubes.map((c) => <option key={c.id} value={c.id}>🏢 {c.nombre}</option>)}
            </select>
          )}
          {!sinClub && <Campanita clubId={clubActivo} misCategorias={misCategorias} perfilId={perfil?.id} />}
          {!sinClub && <button onClick={() => setModoEdicion(!modoEdicion)} style={{ background: modoEdicion ? 'var(--accent)' : 'var(--panel)', color: modoEdicion ? '#000' : 'var(--text)', border: 'none', padding: esMovil ? 12 : '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: esMovil ? '1rem' : '0.85rem', fontWeight: 'bold' }}>{modoEdicion ? '✅ Guardar' : '⚙️ Editar'}</button>}
          {(esManager || esAdmin || esSuperUser) && clubActivo && (
            <button onClick={() => setMostrarQR(true)} style={{ background: '#10b981', color: '#000', border: 'none', padding: esMovil ? 12 : '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: esMovil ? '1rem' : '0.85rem', fontWeight: 'bold' }}>📷 QR</button>
          )}
        </div>
      </div>

      {/* LA FRANJA DE HOY — fija arriba, fuera de la grilla. */}
      {!sinClub && !cargando && franjaVisible && (
        <FranjaHoy
          franja={franjaDeHoy({ semana, triage, hoy: new Date().toISOString().slice(0, 10) })}
          hoy={new Date().toISOString().slice(0, 10)}
          esMovil={esMovil}
          onIr={(ruta) => ruta && navigate(ruta)}
          onApagar={() => cambiarFranja(false)}
        />
      )}

      {/* PALETA EDICIÓN */}
      {modoEdicion && !sinClub && (
        <div style={{ background: 'var(--panel)', padding: 15, borderRadius: 8, border: '1px dashed var(--border)', marginBottom: 20, animation: 'fadeIn 0.2s' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text)' }}>Mostrá/ocultá módulos · usá ▲▼ para reordenar · 1·2·3 para el ancho</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {/* La franja no es un módulo de la grilla, pero se prende y apaga
                desde acá: es el único lugar donde alguien la va a buscar
                después de haberla cerrado con la ✕. */}
            <button onClick={() => cambiarFranja(!franjaVisible)}
                    style={{ background: franjaVisible ? 'var(--hover)' : 'transparent', border: `1px dashed ${franjaVisible ? 'var(--accent)' : 'var(--border)'}`, color: franjaVisible ? 'var(--text)' : 'var(--text-dim)', padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: franjaVisible ? 'bold' : 'normal' }}>
              📌 Franja de hoy (arriba de todo){franjaVisible && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓</span>}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {widgetsPermitidos.map((m) => {
              const on = layout.includes(m.id);
              return <button key={m.id} onClick={() => toggleWidget(m.id)} style={{ background: on ? 'var(--hover)' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--text)' : 'var(--text-dim)', padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: on ? 'bold' : 'normal' }}>{m.titulo}{on && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓</span>}</button>;
            })}
          </div>
        </div>
      )}

      {/* GRID */}
      {sinClub ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: '3.2rem', marginBottom: 14 }}>👑</div>
          <h2 style={{ color: 'var(--accent)', fontWeight: 900, margin: '0 0 8px' }}>VISIÓN MASTER</h2>
          <p style={{ maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>Elegí un club en el selector de arriba para ver su tablero. No se mezcla información entre clubes.</p>
        </div>
      ) : cargando ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 50 }}>CARGANDO DASHBOARD...</div> : (
        <>
          {/* La grilla se adapta sola al ancho en vez de ser tres columnas
              fijas. `esMovil` es true sólo en teléfonos (lado corto < 600px),
              así que una tablet en vertical recibía las tres columnas de
              escritorio en 768px: ilegible. Con auto-fit, 768px da dos
              columnas y 1400px da cuatro, sin tocar nada. El `minmax` usa
              min() para que en pantallas angostas la columna no fuerce
              desplazamiento horizontal. */}
          <div ref={refGrilla} style={{ display: 'grid', gridTemplateColumns: `repeat(${columnas}, 1fr)`, gap: esMovil ? 12 : 16, alignItems: 'stretch', gridAutoFlow: 'dense' }}>
            {layout.map((id, index) => { const m = widgetsPermitidos.find((w) => w.id === id); return m ? renderModulo(id, index) : null; })}
          </div>
          {layout.length === 0 && <div style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--text-dim)' }}>No hay módulos activos. Tocá <strong>⚙️ Editar</strong> y prendé los que quieras.</p></div>}
        </>
      )}

      {/* MODAL NOVEDADES DE VERSIÓN */}
      {mostrarNovedadesVersion && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3500, padding: esMovil ? 12 : 20 }}>
          <div style={{ background: '#0d0d0d', border: '1px solid var(--accent)', borderRadius: 10, maxWidth: 640, width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s', boxShadow: '0 10px 50px rgba(0,0,0,0.9)' }}>

            {/* Encabezado */}
            <div style={{ padding: esMovil ? '22px 20px 16px' : '30px 30px 20px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
              <span style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--accent)', padding: '6px 12px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(0,255,136,0.3)', fontFamily: 'JetBrains Mono, monospace' }}>
                {VERSION_ACTUAL.toUpperCase()}
              </span>
              <h2 style={{ color: '#fff', marginTop: 18, marginBottom: 6, fontSize: esMovil ? '1.25rem' : '1.6rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {NOVEDADES_TITULO}
              </h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
                {NOVEDADES_BAJADA}
              </p>
            </div>

            {/* Listado */}
            <div style={{ padding: esMovil ? '18px 18px 6px' : '22px 30px 10px', overflowY: 'auto', flex: 1 }}>
              {NOVEDADES_VERSION.map((bloque) => (
                <div key={bloque.grupo} style={{ marginBottom: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ width: 3, height: 14, background: bloque.color, borderRadius: 2 }} />
                    <span style={{ color: bloque.color, fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                      {bloque.grupo}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {bloque.items.map((it) => (
                      <div key={it.t} style={{ paddingLeft: 11, borderLeft: `1px solid ${bloque.color}33` }}>
                        <div style={{ color: 'var(--text)', fontSize: '0.85rem', fontWeight: 700, marginBottom: 2 }}>{it.t}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem', lineHeight: 1.5 }}>{it.d}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pie */}
            <div style={{ padding: esMovil ? '12px 18px 18px' : '16px 30px 24px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={aceptarNovedadesVersion}
                className="btn-action"
                style={{ width: '100%', background: 'var(--accent)', color: '#000', fontWeight: 900, padding: 14, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem', letterSpacing: '0.04em' }}
              >
                ENTENDIDO, A LA CANCHA
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL QR */}
      {mostrarQR && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, padding: 20 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid #10b981', borderRadius: 8, padding: 30, maxWidth: 400, width: '100%', textAlign: 'center', position: 'relative', animation: 'fadeIn 0.3s' }}>
            <h2 style={{ color: 'var(--text)', marginTop: 0, marginBottom: 5, fontSize: '1.4rem' }}>INGRESO <span style={{ color: '#10b981' }}>RÁPIDO</span></h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 20 }}>Pegá este QR en el vestuario para que entren directo al Kiosco.</p>
            <div style={{ background: '#fff', padding: 15, borderRadius: 8, display: 'inline-block', marginBottom: 20 }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(linkKiosco)}`} alt="QR" style={{ width: 250, height: 250 }} />
            </div>
            <input type="text" readOnly value={linkKiosco} style={{ width: '100%', padding: 10, background: 'var(--bg)', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.7rem', textAlign: 'center', marginBottom: 15 }} />
            <button onClick={() => setMostrarQR(false)} className="btn-action" style={{ width: '100%', background: 'var(--hover)', color: 'var(--text)', fontWeight: 900, padding: 12, border: 'none', borderRadius: 4, cursor: 'pointer' }}>CERRAR</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- estilos sueltos ---- */
const editBtn = { background: 'rgba(0,0,0,0.85)', color: '#fff', border: '1px solid #555', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', fontSize: '0.7rem' };
const sizeBtn = (active) => ({ background: active ? 'var(--accent)' : 'rgba(0,0,0,0.85)', color: active ? '#000' : '#fff', border: '1px solid #555', borderRadius: 4, width: 24, height: 26, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800 });
const selStyle = (m) => ({ padding: m ? 12 : '8px 10px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, outline: 'none', fontWeight: 800, cursor: 'pointer', fontSize: m ? '1rem' : '0.85rem', width: '100%', WebkitAppearance: 'none' });