import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { analizarPartido } from '../analytics/engine';
import { calcularRatingJugador } from '../analytics/rating';
import { calcularCadenasValor } from '../analytics/posesiones';

/* ============================================================================
   CONFIG — Ajustá a tu realidad de datos.
   Escala wellness 1-5 (real, sale de CargaWellness): sueño alto = bueno;
   estrés/fatiga/dolor altos = malo. Tarjetas viven en `eventos`.
============================================================================ */
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

const DEFAULTS = {
  ct:        ['m_estado', 'm_triage', 'm_proximo', 'm_forma', 'm_protagonistas', 'm_pulso', 'm_ultimo', 'm_novedades', 'm_accesos'],
  manager:   ['m_estado', 'm_triage', 'm_proximo', 'm_forma', 'm_ultimo', 'm_novedades', 'm_accesos'],
  superuser: ['m_estado', 'm_triage', 'm_forma', 'm_protagonistas', 'm_ultimo', 'm_novedades', 'm_accesos'],
  admin:     ['m_estado', 'm_ultimo', 'm_novedades', 'm_accesos'],
  jugador:   ['m_jug_wellness', 'm_jug_perfil'],
};

const LINKS = [
  { titulo: 'Nuevo Partido', icon: '⚡',  ruta: '/nuevo-partido',    color: '#10b981', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Microciclo',    icon: '🗓️', ruta: '/microciclo',       color: '#8b5cf6', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Wellness',      icon: '🔋', ruta: '/wellness',         color: '#14b8a6', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Scouting',      icon: '🕵️‍♂️', ruta: '/scouting-rivales', color: '#64748b', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Disciplina',    icon: '🟨', ruta: '/disciplina',       color: '#facc15', roles: ['superuser', 'manager', 'ct'] },
  { titulo: 'Plantel',       icon: '👥', ruta: '/plantel',          color: '#0ea5e9', roles: ['superuser', 'manager', 'ct', 'admin'] },
  { titulo: 'Tesorería',     icon: '💰', ruta: '/tesoreria',        color: '#eab308', roles: ['superuser', 'manager', 'admin'] },
  { titulo: 'Torneos',       icon: '🏆', ruta: '/torneos',          color: '#fbbf24', roles: ['superuser', 'manager', 'admin'] },
  { titulo: 'Sponsors',      icon: '🤝', ruta: '/sponsors',         color: '#0284c7', roles: ['superuser', 'manager', 'admin'] },
  { titulo: 'Usuarios',      icon: '👑', ruta: '/usuarios',         color: '#c084fc', roles: ['superuser'] },
];

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

/* Jerarquía de categorías para elegir la categoría inicial (Primera arriba, promocionales al final). */
const normCat = (s) => (s || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const ORDEN_CATEGORIAS = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'septima', 'octava', 'novena', 'decima'];
const rankCategoria = (cat) => { const n = normCat(cat); const i = ORDEN_CATEGORIAS.findIndex((tok) => n.includes(tok)); return i === -1 ? 999 : i; };
/* La de mayor jerarquía disponible; las desconocidas (promocionales, etc.) van al final, alfabéticas. */
const categoriaInicial = (cats) => [...(cats || [])].sort((a, b) => (rankCategoria(a) - rankCategoria(b)) || String(a).localeCompare(String(b)))[0];

/* Corre el engine UNA vez sobre el último partido => xG + ranking (port de Resumen). */
function analizarUltimo(eventos, jugadores) {
  const vacio = { xgPropio: 0, xgRival: 0, ranking: [] };
  if (!eventos || eventos.length === 0) return vacio;
  let datos;
  try { datos = analizarPartido(eventos, 'Propio', false); } catch { return vacio; }

  const S = {};
  jugadores.forEach((j) => {
    let xgChain = 0, xgBuildup = 0;
    try { ({ xgChain, xgBuildup } = calcularCadenasValor(datos.posesiones, j.id)); } catch {}
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
      try { impacto = calcularRatingJugador(j, paraRating, rivalEnCancha, pm, mins); } catch {}
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

  /* ---- KIOSCO: menú simple ---- */
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
            <button key={a.ruta} onClick={() => navigate(a.ruta)} className="bento-card" style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--panel)', border: '1px solid var(--border)', padding: 20, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: '2.5rem' }}>{a.icon}</span>
              <div><strong style={{ display: 'block', fontSize: '1.2rem' }}>{a.t}</strong><span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{a.s}</span></div>
            </button>
          ))}
        </div>
        <button onClick={salirKiosco} style={{ marginTop: 50, background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '12px 25px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>SALIR DEL KIOSCO</button>
      </div>
    );
  }

  /* ---- ESTADO BASE ---- */
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const rol = (perfil?.rol || 'jugador').toLowerCase();
  const esSuperUser = rol === 'superuser';
  const esAdmin = rol === 'admin';
  const esManager = rol === 'manager';
  const esCT = rol === 'ct';

  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);

  const [clubMaster, setClubMaster] = useState(localStorage.getItem('club_id') || '');
  const clubActivo = esSuperUser ? clubMaster : (perfil?.club_id || '');

  const [nombreClub, setNombreClub] = useState('CARGANDO...');
  const [escudoClub, setEscudoClub] = useState(localStorage.getItem('escudo_url') || '');
  const [listaClubes, setListaClubes] = useState([]);

  const [categoriaActiva, setCategoriaActiva] = useState(localStorage.getItem('dash_categoria') || '');
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);

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
  const [datosWellness, setDatosWellness] = useState([]);

  /* ---- WIDGETS (editable, default fuerte) ---- */
  const widgetsPermitidos = useMemo(() => MODULOS.filter((m) => m.roles.includes(rol)), [rol]);
  const defaultLayout = DEFAULTS[rol] || DEFAULTS.jugador;
  const idRef = perfil?.id || 'anon';

  const [layout, setLayout] = useState(() => {
    const g = localStorage.getItem(`dash_v3_${idRef}`);
    if (g) {
      const ids = JSON.parse(g).filter((id) => widgetsPermitidos.some((m) => m.id === id));
      return ids.length ? ids : defaultLayout;
    }
    return defaultLayout;
  });
  const guardarLayout = (arr) => localStorage.setItem(`dash_v3_${idRef}`, JSON.stringify(arr));
  const toggleWidget = (id) => setLayout((prev) => { const n = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]; guardarLayout(n); return n; });
  const mover = (i, dir) => setLayout((prev) => { const n = [...prev]; const j = dir === 'up' ? i - 1 : i + 1; if (j < 0 || j >= n.length) return prev; [n[i], n[j]] = [n[j], n[i]]; guardarLayout(n); return n; });

  const [tamanos, setTamanos] = useState(() => { const g = localStorage.getItem(`dash_sizes_v3_${idRef}`); return g ? JSON.parse(g) : {}; });
  const cambiarTamano = (id, n) => setTamanos((prev) => { const x = { ...prev, [id]: n }; localStorage.setItem(`dash_sizes_v3_${idRef}`, JSON.stringify(x)); return x; });

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
            .eq('club_id', club).in('publico_objetivo', ['CT', 'Ambos']).order('fecha_creacion', { ascending: false }).limit(4);
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
        const anio = new Date().getFullYear().toString();

        let qUlt = supabase.from('partidos').select('*').in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: false }).limit(40);
        let qPro = supabase.from('partidos').select('*').eq('estado', 'Pendiente').gte('fecha', hoyStr).order('fecha', { ascending: true }).limit(15);
        let qAnual = supabase.from('partidos').select('id, categoria, goles_propios, goles_rival, fecha, nombre_propio, rival, condicion').gte('fecha', `${anio}-01-01`).in('estado', ['Finalizado', 'Jugado']);
        let qJug = supabase.from('jugadores').select('id, nombre, apellido, dorsal, posicion, categoria');
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

        // Engine sobre el último partido (xG + figuras)
        if (partidosJug[0]) {
          const { data: evs } = await supabase.from('eventos').select('*').eq('id_partido', partidosJug[0].id).order('minuto', { ascending: true });
          setUltAnalisis(analizarUltimo(evs || [], jugadores));
        } else setUltAnalisis({ xgPropio: 0, xgRival: 0, ranking: [] });

      if (club) {
      /* ===== DISCIPLINA (misma lógica que pantalla Disciplina) ===== */
        const catDePartido = {}; (rMapPar.data || []).forEach((p) => { catDePartido[p.id] = p.categoria || 'Sin categoría'; });
        // Las amarillas resetean por temporada (año calendario en curso), igual que el balance anual.
        const partidosTemporada = new Set((rMapPar.data || []).filter((p) => { const f = parseFecha(p.fecha); return f && f.getFullYear() === Number(anio); }).map((p) => p.id));
        const nombreJug = (id) => { const j = jugadores.find((x) => String(x.id) === String(id)); return j ? (j.apellido || j.nombre) : 'Jugador'; };
        const jugIdsCat = new Set(jugadores.map((j) => j.id));

        const { data: tarjetas } = await supabase.from('eventos')
          .select('id_jugador, accion, id_partido').eq('club_id', club).eq('equipo', 'Propio')
          .in('accion', ['Tarjeta Amarilla', 'Tarjeta Roja']);

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

        const { data: sanc } = await supabase.from('disciplina_sanciones').select('*').eq('club_id', club);
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
        let wHoy = [];
        if (club) {
          const { data: w } = await supabase.from('wellness').select('*').eq('club_id', club).eq('fecha', hoyStr);
          wHoy = (w || []).filter((r) => !catEq || jugIdsCat.has(r.jugador_id));
        }
        const enRojo = wHoy.filter(enRojoWell);
        if (enRojo.length > 0) alertas.unshift({ nivel: 'warning', ico: '🔋', titulo: `${enRojo.length} ${enRojo.length === 1 ? 'jugador' : 'jugadores'} en rojo hoy`, sub: 'Fatiga, dolor o sueño en zona de alerta', ruta: '/wellness' });
        setTriage(alertas.slice(0, 6));
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
      } else { setTriage([]); setPulso({ score: null, registros: 0, enRojo: 0 }); setPrep(null); }

        setCargando(false);
      } catch (err) { console.error('Error cargando dashboard:', err); setCargando(false); }
    }
    cargar();
  }, [clubActivo, esSuperUser, rol, categoriaActiva, esCT, misCategorias, perfil?.id, perfil?.jugador_id]);

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
  const Card = ({ children, id, accent, index, scroll }) => {
    const span = esMovil ? 3 : Math.min(3, tamanos[id] || SPAN_DEF[id] || 1);
    return (
      <div className="bento-card" style={{
        gridColumn: esMovil ? '1 / -1' : `span ${span}`, position: 'relative',
        background: 'var(--panel)', border: '1px solid var(--border)', borderTop: accent ? `2px solid ${accent}` : '1px solid var(--border)',
        borderRadius: 12, padding: 16, overflow: scroll ? 'auto' : 'hidden', maxHeight: scroll ? 320 : 'none', display: 'flex', flexDirection: 'column',
      }}>
        {modoEdicion && (
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, zIndex: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {[1, 2, 3].map((n) => (
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
        <Card key={id} id={id} accent="var(--accent)" index={index}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: enRacha ? '#10b981' : 'var(--text-dim)', background: enRacha ? 'rgba(16,185,129,0.1)' : '#111', border: `1px solid ${enRacha ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`, padding: '5px 12px', borderRadius: 20 }}>
              {enRacha ? `🔥 En racha · ${nInv} invicto` : forma.length ? 'Forma estable' : 'Sin partidos aún'}
            </span>
            {forma.length > 1 && <svg width="80" height="30" viewBox="0 0 80 30"><polyline points={poly} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
            {[{ n: pts, l: 'PTS', c: '#fff' }, { n: (dg > 0 ? '+' : '') + dg, l: 'DG', c: dg >= 0 ? '#10b981' : '#ef4444' }, { n: `${v}-${e}-${d}`, l: 'V-E-D', c: '#fff', sm: true }, { n: `${gf}/${gc}`, l: 'GF/GC', c: 'var(--accent)', sm: true }].map((b, i) => (
              <div key={i} style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center' }}>
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
        <Card key={id} id={id} accent="#ef4444" index={index}>
          <Label color="#ef4444">REQUIERE TU ATENCIÓN</Label>
          {triage.length === 0 ? <div style={{ textAlign: 'center', color: '#10b981', padding: 14, fontSize: '0.85rem' }}>✅ Todo en orden. Sin alertas.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {triage.map((a, i) => (
                <div key={i} onClick={() => !modoEdicion && a.ruta && navigate(a.ruta)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#111', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: modoEdicion ? 'default' : 'pointer' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: bg[a.nivel], color: col[a.nivel], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.ico}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</div>
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
    /* PROXIMO */
    if (id === 'm_proximo') {
      return (
        <Card key={id} id={id} accent="#10b981" index={index}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color="#10b981">PRÓXIMO PARTIDO</Label>
            {prep?.dias != null && <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 12 }}>{prep.dias <= 0 ? 'Hoy' : `en ${prep.dias} día${prep.dias > 1 ? 's' : ''}`}</span>}
          </div>
          {proximo ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>vs {proximo.rival?.toUpperCase()}</span>
                <span style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-dim)' }}>{proximo.fecha?.split('-').reverse().join('/')} · {proximo.competicion || proximo.torneo_id || ''}</span>
              </div>
              {prep && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[{ n: prep.disponibles, l: 'disponibles', c: '#10b981' }, { n: prep.susp, l: 'suspendidos', c: '#ef4444' }, { n: prep.enDuda, l: 'en duda', c: '#f59e0b' }].map((b, i) => (
                    <div key={i} style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
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
          ) : <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, background: '#111', borderRadius: 8, border: '1px dashed var(--border)', fontSize: '0.8rem' }}>Sin partidos pendientes</div>}
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
        <Card key={id} id={id} accent="#3b82f6" index={index}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label color="#3b82f6">FORMA · ÚLTIMOS 5</Label>
            <div style={{ display: 'flex', gap: 4 }}>
              {forma.length ? forma.map((f, i) => <span key={i} title={`vs ${f.rival} ${f.gf}-${f.gc}`} style={{ width: 22, height: 22, borderRadius: '50%', background: cBg[f.res], color: cR[f.res], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{f.res}</span>) : <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Sin datos</span>}
            </div>
          </div>
          {forma.length > 1 && <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>más reciente →</div>}
          {hayXg && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>xG últ. <span style={{ ...mono, color: '#fff' }}>{xgPropio.toFixed(1)}</span> a favor · <span style={{ ...mono, color: '#ef4444' }}>{xgRival.toFixed(1)}</span> en contra</span>
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
        <Card key={id} id={id} accent="var(--accent)" index={index}>
          <Label color="var(--accent)">FIGURAS · ÚLTIMO PARTIDO</Label>
          {top.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', padding: 10 }}>Sin análisis del último partido</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top.map((j, i) => (
                <div key={j.id} onClick={() => !modoEdicion && navigate('/jugador', { state: { jugadorId: j.id } })} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: modoEdicion ? 'default' : 'pointer' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? 'rgba(0,230,118,0.15)' : '#111', color: i === 0 ? 'var(--accent)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(j.nombre || '').toUpperCase()}</div>
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
        <Card key={id} id={id} accent="#10b981" index={index}>
          <Label color="#10b981">PULSO DEL PLANTEL · HOY</Label>
          {pulso.registros === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', padding: 10 }}>Sin cargas de wellness hoy</div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 900, color: pulso.score >= 3.5 ? '#10b981' : pulso.score >= 2.5 ? '#f59e0b' : '#ef4444' }}>{pulso.score}<span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>/5</span></div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 700 }}>READINESS</div>
                </div>
                <div style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 4px', textAlign: 'center' }}>
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
        <Card key={id} id={id} accent="var(--text-dim)" index={index}>
          <Label>ÚLTIMO RESULTADO</Label>
          {ultimo ? (
            <div style={{ background: '#111', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
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
          ) : <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, background: '#111', borderRadius: 8, border: '1px dashed var(--border)', fontSize: '0.8rem' }}>Sin registros</div>}
        </Card>
      );
    }
    /* NOVEDADES */
    if (id === 'm_novedades') {
      return (
        <Card key={id} id={id} accent="#facc15" index={index} scroll>
          <Label color="#facc15">TABLÓN DE ANUNCIOS</Label>
          {novedades.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 14, fontSize: '0.8rem' }}>Sin novedades recientes.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {novedades.map((n) => (
                <div key={n.id} style={{ background: '#111', borderLeft: '3px solid #facc15', padding: 10, borderRadius: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                    <strong>{n.perfiles?.nombre_completo || 'Administración'}</strong><span>{new Date(n.fecha_creacion).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#fff', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{n.mensaje}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      );
    }
    /* ACCESOS */
    if (id === 'm_accesos') {
      const links = LINKS.filter((l) => l.roles.includes(rol));
      return (
        <Card key={id} id={id} index={index}>
          <Label>ACCESOS RÁPIDOS</Label>
          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {links.map((l) => (
              <div key={l.ruta} onClick={() => !modoEdicion && navigate(l.ruta)} style={{ cursor: modoEdicion ? 'default' : 'pointer', border: `1px solid ${l.color}`, borderRadius: 10, padding: '12px 6px', textAlign: 'center', background: `linear-gradient(180deg, rgba(${hexToRgb(l.color)},0.06) 0%, rgba(0,0,0,0) 100%)` }}>
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
        <Card key={id} id={id} accent="#f59e0b" index={index}>
          <Label color="#f59e0b">MI WELLNESS</Label>
          {u ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[{ l: 'SUEÑO', v: u.sueno }, { l: 'FATIGA', v: u.fatiga }, { l: 'DOLOR', v: u.dolor_muscular }, { l: 'RPE', v: u.rpe }].map((m, i) => (
                <div key={i} style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 2px', textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: '1.3rem', fontWeight: 900, color: '#fff' }}>{m.v ?? '—'}</div>
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
        <Card key={id} id={id} accent="#3b82f6" index={index}>
          <Label color="#3b82f6">MI PERFIL</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#111', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>🏃‍♂️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{perfil?.nombre || 'Jugador'}</div>
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
  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
      {/* HEADER + SELECTORES (arriba de todo) */}
      <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'stretch' : 'center', marginBottom: 25, paddingBottom: 20, borderBottom: '1px solid var(--border)', gap: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ width: esMovil ? 50 : 60, height: esMovil ? 50 : 60, borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: esMovil ? '1rem' : '1.5rem', overflow: 'hidden', flexShrink: 0 }}>
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
          {!sinClub && <button onClick={() => setModoEdicion(!modoEdicion)} style={{ background: modoEdicion ? 'var(--accent)' : '#222', color: modoEdicion ? '#000' : '#fff', border: 'none', padding: esMovil ? 12 : '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: esMovil ? '1rem' : '0.85rem', fontWeight: 'bold' }}>{modoEdicion ? '✅ Guardar' : '⚙️ Editar'}</button>}
          {(esManager || esAdmin || esSuperUser) && clubActivo && (
            <button onClick={() => setMostrarQR(true)} style={{ background: '#10b981', color: '#000', border: 'none', padding: esMovil ? 12 : '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: esMovil ? '1rem' : '0.85rem', fontWeight: 'bold' }}>📷 QR</button>
          )}
        </div>
      </div>

      {/* PALETA EDICIÓN */}
      {modoEdicion && !sinClub && (
        <div style={{ background: '#111', padding: 15, borderRadius: 8, border: '1px dashed var(--border)', marginBottom: 20, animation: 'fadeIn 0.2s' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#fff' }}>Mostrá/ocultá módulos · usá ▲▼ para reordenar · 1·2·3 para el ancho</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {widgetsPermitidos.map((m) => {
              const on = layout.includes(m.id);
              return <button key={m.id} onClick={() => toggleWidget(m.id)} style={{ background: on ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : '#333'}`, color: on ? '#fff' : '#666', padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: on ? 'bold' : 'normal' }}>{m.titulo}{on && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓</span>}</button>;
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
          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(3, 1fr)', gap: esMovil ? 12 : 16, alignItems: 'stretch', gridAutoFlow: 'dense' }}>
            {layout.map((id, index) => { const m = widgetsPermitidos.find((w) => w.id === id); return m ? renderModulo(id, index) : null; })}
          </div>
          {layout.length === 0 && <div style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--text-dim)' }}>No hay módulos activos. Tocá <strong>⚙️ Editar</strong> y prendé los que quieras.</p></div>}
        </>
      )}

      {/* MODAL QR */}
      {mostrarQR && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, padding: 20 }}>
          <div style={{ background: '#111', border: '1px solid #10b981', borderRadius: 8, padding: 30, maxWidth: 400, width: '100%', textAlign: 'center', position: 'relative', animation: 'fadeIn 0.3s' }}>
            <h2 style={{ color: '#fff', marginTop: 0, marginBottom: 5, fontSize: '1.4rem' }}>INGRESO <span style={{ color: '#10b981' }}>RÁPIDO</span></h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 20 }}>Pegá este QR en el vestuario para que entren directo al Kiosco.</p>
            <div style={{ background: '#fff', padding: 15, borderRadius: 8, display: 'inline-block', marginBottom: 20 }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(linkKiosco)}`} alt="QR" style={{ width: 250, height: 250 }} />
            </div>
            <input type="text" readOnly value={linkKiosco} style={{ width: '100%', padding: 10, background: '#000', color: '#888', border: '1px solid #333', borderRadius: 4, fontSize: '0.7rem', textAlign: 'center', marginBottom: 15 }} />
            <button onClick={() => setMostrarQR(false)} className="btn-action" style={{ width: '100%', background: '#333', color: '#fff', fontWeight: 900, padding: 12, border: 'none', borderRadius: 4, cursor: 'pointer' }}>CERRAR</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- estilos sueltos ---- */
const editBtn = { background: 'rgba(0,0,0,0.85)', color: '#fff', border: '1px solid #555', borderRadius: 4, width: 26, height: 26, cursor: 'pointer', fontSize: '0.7rem' };
const sizeBtn = (active) => ({ background: active ? 'var(--accent)' : 'rgba(0,0,0,0.85)', color: active ? '#000' : '#fff', border: '1px solid #555', borderRadius: 4, width: 24, height: 26, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800 });
const selStyle = (m) => ({ padding: m ? 12 : '8px 10px', background: '#111', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, outline: 'none', fontWeight: 800, cursor: 'pointer', fontSize: m ? '1rem' : '0.85rem', width: '100%', WebkitAppearance: 'none' });