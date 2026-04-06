import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; 

// ==========================================
// 1. CATÁLOGO DE WIDGETS Y TAMAÑOS POR DEFECTO
// ==========================================
const CATÁLOGO_WIDGETS = [
  { id: 'w_proximo', tipo: 'data', spanDefecto: '1x1', titulo: 'Próximo Partido', icon: '📅', roles: ['superuser', 'manager', 'ct'] },
  { id: 'w_ultimo', tipo: 'data', spanDefecto: '1x1', titulo: 'Último Registro', icon: '⏱️', roles: ['superuser', 'manager', 'ct'] },
  { id: 'w_stats_base', tipo: 'data', spanDefecto: '2x1', titulo: 'Estado de la Base', icon: '📊', roles: ['superuser', 'manager', 'admin'] },
  { id: 'w_vep_anual', tipo: 'data', spanDefecto: '2x1', titulo: 'Balance Anual (V-E-D)', icon: '⚖️', roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'w_goles_cat', tipo: 'data', spanDefecto: '1x1', titulo: 'Goles Acumulados', icon: '⚽', roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'w_resultados_cat', tipo: 'data', spanDefecto: '2x2', titulo: 'Últimos Resultados', icon: '📈', roles: ['superuser', 'manager', 'ct', 'admin'] },
  
  // CT / MANAGER
  { id: 'nuevo_partido', tipo: 'link', spanDefecto: '1x1', titulo: 'Nuevo Partido', icon: '⚡', ruta: '/nuevo-partido', color: '#10b981', desc: 'Stats en vivo', roles: ['superuser', 'manager', 'ct'] },
  { id: 'planificador', tipo: 'link', spanDefecto: '1x1', titulo: 'Microciclo', icon: '🗓️', ruta: '/planificador-semanal', color: '#8b5cf6', desc: 'Cargas y sesiones', roles: ['superuser', 'manager', 'ct'] },
  { id: 'creador_tareas', tipo: 'link', spanDefecto: '1x1', titulo: 'Creador Tareas', icon: '🎨', ruta: '/creador-tareas', color: '#ec4899', desc: 'Pizarra gráfica', roles: ['superuser', 'manager', 'ct'] },
  { id: 'banco_tareas', tipo: 'link', spanDefecto: '1x1', titulo: 'Banco Tareas', icon: '📁', ruta: '/banco-tareas', color: '#f59e0b', desc: 'Archivo de ejercicios', roles: ['superuser', 'manager', 'ct'] },
  { id: 'libro_tactico', tipo: 'link', spanDefecto: '1x1', titulo: 'Libro Táctico', icon: '📋', ruta: '/libro-tactico', color: '#3b82f6', desc: 'Sistemas', roles: ['superuser', 'manager', 'ct'] },
  { id: 'scouting', tipo: 'link', spanDefecto: '1x1', titulo: 'Scouting', icon: '🕵️‍♂️', ruta: '/scouting-rivales', color: '#64748b', desc: 'Análisis rival', roles: ['superuser', 'manager', 'ct'] },
  { id: 'rendimiento', tipo: 'link', spanDefecto: '1x1', titulo: 'Sports Science', icon: '🧬', ruta: '/rendimiento', color: '#f43f5e', desc: 'Físico y Nutri', roles: ['superuser', 'manager', 'ct'] },
  { id: 'presentismo', tipo: 'link', spanDefecto: '1x1', titulo: 'Presentismo', icon: '✅', ruta: '/presentismo', color: '#14b8a6', desc: 'Asistencia', roles: ['superuser', 'manager', 'ct'] },
  { id: 'plantel', tipo: 'link', spanDefecto: '1x1', titulo: 'Mi Plantel', icon: '👥', ruta: '/plantel', color: '#0ea5e9', desc: 'Gestión', roles: ['superuser', 'manager', 'ct', 'admin'] },
  { id: 'wellness_ct', tipo: 'link', spanDefecto: '1x1', titulo: 'Monitor Wellness', icon: '🔋', ruta: '/carga-wellness', color: '#10b981', desc: 'Estado hoy', roles: ['superuser', 'manager', 'ct'] },

  // ADMIN / MANAGER
  { id: 'tesoreria', tipo: 'link', spanDefecto: '1x1', titulo: 'Tesorería', icon: '💰', ruta: '/tesoreria', color: '#eab308', desc: 'Caja y Cuotas', roles: ['superuser', 'manager', 'admin'] },
  { id: 'torneos', tipo: 'link', spanDefecto: '1x1', titulo: 'Torneos', icon: '🏆', ruta: '/torneos', color: '#fbbf24', desc: 'Gestión ligas', roles: ['superuser', 'manager', 'admin'] },
  { id: 'sponsors', tipo: 'link', spanDefecto: '1x1', titulo: 'Sponsors', icon: '🤝', ruta: '/sponsors', color: '#0284c7', desc: 'Patrocinadores', roles: ['superuser', 'manager', 'admin'] },
  { id: 'usuarios', tipo: 'link', spanDefecto: '1x1', titulo: 'Usuarios', icon: '👑', ruta: '/usuarios', color: '#c084fc', desc: 'Accesos', roles: ['superuser'] },
  
  // JUGADORES
  { id: 'mi_wellness', tipo: 'link', spanDefecto: '1x1', titulo: 'Cargar Wellness', icon: '🌡️', ruta: '/wellness', color: '#f59e0b', desc: 'Fatiga y sueño', roles: ['jugador'] },
  { id: 'mi_perfil', tipo: 'link', spanDefecto: '1x1', titulo: 'Mi Perfil', icon: '🏃‍♂️', ruta: '/jugador-perfil', color: '#3b82f6', desc: 'Tus métricas', roles: ['jugador'] },
  { id: 'mi_rendimiento', tipo: 'link', spanDefecto: '1x1', titulo: 'Mi Biomecánica', icon: '🧬', ruta: '/rendimiento', color: '#f43f5e', desc: 'Tu evolución', roles: ['jugador'] },
];

export default function Inicio() {
  const navigate = useNavigate();
  const { perfil } = useAuth(); 
  
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
  const kioscoJugadorId = localStorage.getItem('kiosco_jugador_id') || localStorage.getItem('kiosco_user_id') || '';
  const kioscoClubId = localStorage.getItem('kiosco_club_id') || perfil?.club_id || '';

  const rol = (isKioscoMode ? 'jugador' : (perfil?.rol || 'jugador')).toLowerCase();
  const esSuperUser = rol === 'superuser';
  const esAdmin = rol === 'admin';
  const esManager = rol === 'manager';

  // NUEVO: PANTALLA DE NOVEDADES -----------------------
  // Definimos la versión actual. Cambiá este string en el futuro para forzar que el modal vuelva a aparecer.
  const VERSION_ACTUAL = 'v0.002604031832';
  const [mostrarNovedades, setMostrarNovedades] = useState(false);

  useEffect(() => {
    // Si no es jugador ni es modo kiosco, evaluamos si ya vio esta versión
    if (rol !== 'jugador' && !isKioscoMode) {
      const versionVista = localStorage.getItem(`novedades_vista_${VERSION_ACTUAL}`);
      if (!versionVista) {
        setMostrarNovedades(true);
      }
    }
  }, [rol, isKioscoMode]);

  const cerrarModalNovedades = () => {
    localStorage.setItem(`novedades_vista_${VERSION_ACTUAL}`, 'true');
    setMostrarNovedades(false);
  };
  // ---------------------------------------------------

  const [clubMaster, setClubMaster] = useState(localStorage.getItem('club_id') || '');
  const clubActivo = esSuperUser ? clubMaster : (perfil?.club_id || '');

  const [nombreClub, setNombreClub] = useState(esSuperUser ? (clubMaster ? (localStorage.getItem('mi_club') || 'CARGANDO...') : 'VISTA GLOBAL MASTER') : (perfil?.clubes?.nombre || localStorage.getItem('mi_club') || 'CARGANDO...'));
  const [escudoClub, setEscudoClub] = useState(localStorage.getItem('escudo_url') || '');

  const [categoriaActiva, setCategoriaActiva] = useState(localStorage.getItem('dash_categoria') || 'Todas');
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);

  const [cargando, setCargando] = useState(true);
  const [listaClubes, setListaClubes] = useState([]);

  const [ultimoPartido, setUltimoPartido] = useState(null);
  const [proximoPartido, setProximoPartido] = useState(null); 
  const [estadisticas, setEstadisticas] = useState({ jugados: 0, plantel: 0 });
  const [vepAnual, setVepAnual] = useState({ v: 0, e: 0, d: 0 });
  const [golesPorCat, setGolesPorCat] = useState({});
  const [resultadosRecientesCat, setResultadosRecientesCat] = useState({});

  const [modoEdicion, setModoEdicion] = useState(false);
  const widgetsPermitidos = CATÁLOGO_WIDGETS.filter(w => w.roles.includes(rol));
  
  const defaultLayout = esSuperUser 
    ? ['usuarios', 'w_vep_anual', 'w_resultados_cat', 'tesoreria', 'nuevo_partido'] 
    : esManager
    ? ['w_vep_anual', 'w_stats_base', 'nuevo_partido', 'planificador', 'plantel', 'tesoreria']
    : rol === 'ct' 
    ? ['w_vep_anual', 'w_proximo', 'nuevo_partido', 'planificador', 'rendimiento', 'wellness_ct'] 
    : esAdmin 
    ? ['w_stats_base', 'tesoreria', 'torneos', 'sponsors', 'plantel'] 
    : ['mi_wellness', 'mi_perfil', 'mi_rendimiento'];

  const [misWidgetsActivos, setMisWidgetsActivos] = useState(() => {
    const guardado = localStorage.getItem(`dashboard_${perfil?.id}`);
    if (guardado) {
      const idsValidos = JSON.parse(guardado).filter(id => widgetsPermitidos.some(w => w.id === id));
      return idsValidos.length > 0 ? idsValidos : defaultLayout;
    }
    return defaultLayout;
  });

  const [tamanosWidgets, setTamanosWidgets] = useState(() => {
    const defaultSizes = CATÁLOGO_WIDGETS.reduce((acc, w) => ({ ...acc, [w.id]: w.spanDefecto }), {});
    const guardadoSizes = localStorage.getItem(`dashboard_sizes_${perfil?.id}`);
    return guardadoSizes ? { ...defaultSizes, ...JSON.parse(guardadoSizes) } : defaultSizes;
  });

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const toggleWidget = (id) => {
    setMisWidgetsActivos(prev => {
      const nuevo = prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id];
      localStorage.setItem(`dashboard_${perfil?.id}`, JSON.stringify(nuevo));
      return nuevo;
    });
  };

  const cambiarTamano = (id, nuevoSpan) => {
    setTamanosWidgets(prev => {
      const nuevo = { ...prev, [id]: nuevoSpan };
      localStorage.setItem(`dashboard_sizes_${perfil?.id}`, JSON.stringify(nuevo));
      return nuevo;
    });
  };

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    let _misWidgetsActivos = [...misWidgetsActivos];
    const draggedItemContent = _misWidgetsActivos.splice(dragItem.current, 1)[0];
    _misWidgetsActivos.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setMisWidgetsActivos(_misWidgetsActivos);
    localStorage.setItem(`dashboard_${perfil?.id}`, JSON.stringify(_misWidgetsActivos));
  };

  const moverWidget = (index, direccion) => {
    const nuevos = [...misWidgetsActivos];
    if (direccion === 'prev' && index > 0) {
      [nuevos[index - 1], nuevos[index]] = [nuevos[index], nuevos[index - 1]];
    } else if (direccion === 'next' && index < nuevos.length - 1) {
      [nuevos[index + 1], nuevos[index]] = [nuevos[index], nuevos[index + 1]];
    }
    setMisWidgetsActivos(nuevos);
    localStorage.setItem(`dashboard_${perfil?.id}`, JSON.stringify(nuevos));
  };

  const handleCambioCategoria = (e) => {
    const cat = e.target.value;
    setCategoriaActiva(cat);
    localStorage.setItem('dash_categoria', cat);
  };

  useEffect(() => {
    if (esSuperUser) {
      async function fetchClubes() {
        let { data, error } = await supabase.from('clubes').select('id, nombre, escudo_url').order('nombre');
        if (error) data = (await supabase.from('clubes').select('id, nombre').order('nombre')).data;
        if (data) setListaClubes(data);
      }
      fetchClubes();
    }
  }, [esSuperUser, isKioscoMode, kioscoJugadorId, kioscoClubId]);

  useEffect(() => {
    if (isKioscoMode) { setCargando(false); return; }

    async function cargarDashboard() {
      setCargando(true);
      if (!clubActivo && !esSuperUser) { setCargando(false); return; }

      if (clubActivo) {
        const { data: clubData } = await supabase.from('clubes').select('nombre, escudo_url').eq('id', clubActivo).single();
        if (clubData) {
          if (clubData.nombre) { setNombreClub(clubData.nombre); localStorage.setItem('mi_club', clubData.nombre); }
          if (clubData.escudo_url) { setEscudoClub(clubData.escudo_url); localStorage.setItem('escudo_url', clubData.escudo_url); } 
        }
      } else if (esSuperUser) {
        setNombreClub('VISTA GLOBAL MASTER'); setEscudoClub('');
      }

      if (clubActivo) {
        const { data: cats } = await supabase.from('partidos').select('categoria').eq('club_id', clubActivo);
        if (cats) {
          const unicas = [...new Set(cats.map(c => c.categoria).filter(Boolean))];
          setCategoriasDisponibles(unicas);
        }
      }

      if (rol !== 'jugador') {
        const hoyStr = new Date().toISOString().split('T')[0];
        const anioActual = new Date().getFullYear().toString();

        let qUltimo = supabase.from('partidos').select('*').in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: false }).limit(1);
        let qProximo = supabase.from('partidos').select('*').eq('estado', 'Pendiente').gte('fecha', hoyStr).order('fecha', { ascending: true }).limit(1);
        let qAnual = supabase.from('partidos').select('*').gte('fecha', `${anioActual}-01-01`).in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: true });
        let qJugadores = supabase.from('jugadores').select('*', { count: 'exact', head: true });
        let qPartidosTot = supabase.from('partidos').select('*', { count: 'exact', head: true });

        if (clubActivo) {
          qUltimo = qUltimo.eq('club_id', clubActivo); qProximo = qProximo.eq('club_id', clubActivo);
          qAnual = qAnual.eq('club_id', clubActivo); qJugadores = qJugadores.eq('club_id', clubActivo);
          qPartidosTot = qPartidosTot.eq('club_id', clubActivo);
        }

        if (categoriaActiva !== 'Todas') {
          qUltimo = qUltimo.eq('categoria', categoriaActiva); qProximo = qProximo.eq('categoria', categoriaActiva);
          qAnual = qAnual.eq('categoria', categoriaActiva); qJugadores = qJugadores.eq('categoria', categoriaActiva);
          qPartidosTot = qPartidosTot.eq('categoria', categoriaActiva);
        }

        const [resUltimo, resProximo, resAnual, resJugadores, resPartTot] = await Promise.all([qUltimo, qProximo, qAnual, qJugadores, qPartidosTot]);

        setUltimoPartido(resUltimo.data?.[0] || null);
        setProximoPartido(resProximo.data?.[0] || null);
        setEstadisticas({ jugados: resPartTot.count || 0, plantel: resJugadores.count || 0 });

        if (resAnual.data && resAnual.data.length > 0) {
          let v = 0, e = 0, d = 0; let golesCat = {}; let ultimosCat = {};
          resAnual.data.forEach(p => {
            const cat = p.categoria || 'Sin Categoría';
            let gf = parseInt(p.goles_propios) || 0; let gc = parseInt(p.goles_rival) || 0;

            if (gf > gc) v++; else if (gf === gc) e++; else d++;

            if (!golesCat[cat]) golesCat[cat] = { favor: 0, contra: 0 };
            golesCat[cat].favor += gf; golesCat[cat].contra += gc;

            if (!ultimosCat[cat]) ultimosCat[cat] = [];
            ultimosCat[cat].push({ id: p.id, rival: p.rival, gf, gc, res: gf > gc ? 'V' : (gf === gc ? 'E' : 'D'), fecha: p.fecha?.split('-').reverse().join('/') });
          });

          Object.keys(ultimosCat).forEach(cat => { ultimosCat[cat] = ultimosCat[cat].slice(-2).reverse(); });
          setVepAnual({ v, e, d }); setGolesPorCat(golesCat); setResultadosRecientesCat(ultimosCat);
        } else {
          setVepAnual({ v: 0, e: 0, d: 0 }); setGolesPorCat({}); setResultadosRecientesCat({});
        }
      }
      setCargando(false);
    }
    cargarDashboard();
  }, [clubActivo, esSuperUser, rol, categoriaActiva]); 

  const handleCambioClub = (e) => {
    const nuevoId = e.target.value;
    if (nuevoId === '') {
      localStorage.removeItem('club_id'); localStorage.removeItem('mi_club'); localStorage.removeItem('escudo_url');
      setClubMaster(''); setNombreClub('VISTA GLOBAL MASTER'); setEscudoClub('');
    } else {
      const club = listaClubes.find(c => c.id === nuevoId);
      if (!club) return;
      localStorage.setItem('club_id', nuevoId); localStorage.setItem('mi_club', club.nombre);
      if (club.escudo_url) { localStorage.setItem('escudo_url', club.escudo_url); setEscudoClub(club.escudo_url); } 
      else { localStorage.removeItem('escudo_url'); setEscudoClub(''); }
      setClubMaster(nuevoId); setNombreClub(club.nombre);
    }
  };

  if (isKioscoMode) { return <div style={{padding:'20px', color:'#fff'}}>Kiosco Mode...</div>; }

  if (!cargando && !clubActivo && !esSuperUser) {
    if (esAdmin || esManager) {
      return (
        <div style={{ animation: 'fadeIn 0.3s', padding: '50px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🏟️</div>
          <h2 style={{ color: 'var(--accent)', fontWeight: 900 }}>¡BIENVENIDO A VIRTUAL.STATS!</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '30px', lineHeight: '1.6' }}>Para empezar a registrar estadísticas, primero necesitamos crear el perfil de tu equipo.</p>
          <button onClick={() => navigate('/configuracion')} className="btn-action" style={{ width: '100%', padding: '20px', fontSize: '1.1rem' }}>CONFIGURAR MI CLUB AHORA</button>
        </div>
      );
    } else {
      return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}><h2>El club aún no está configurado.</h2><p>Contactá a la administración del club.</p></div>;
    }
  }   

  const getGridStyle = (spanStr) => {
    const [cols, rows] = spanStr.split('x').map(Number);
    return { 
      gridColumn: `span ${Math.min(cols, 3)}`, 
      gridRow: `span ${rows}` 
    };
  };

  const ControlesEdicion = ({ id, spanActual, index }) => {
    if (!modoEdicion) return null; 
    const opcionesSpan = ['1x1', '2x1', '3x1', '2x2'];
    
    return (
      <div style={{ 
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
        background: 'rgba(0,0,0,0.3)', zIndex: 10, borderRadius: 'inherit',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '5px', 
        animation: 'fadeIn 0.2s'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); moverWidget(index, 'prev'); }} style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', border: '1px solid #555', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}>◀</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); moverWidget(index, 'next'); }} style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', border: '1px solid #555', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}>▶</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '3px' }}>
          {opcionesSpan.map(op => (
            <button 
              key={op} type="button"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); cambiarTamano(id, op); }}
              style={{ 
                background: spanActual === op ? 'var(--accent)' : 'rgba(0,0,0,0.8)', 
                color: spanActual === op ? '#000' : '#fff', 
                border: '1px solid #444', fontSize: '0.65rem', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' 
              }}
            >
              {op}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '1100px', margin: '0 auto', position: 'relative' }}>
      
      {/* HEADER Y FILTROS */}
      <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'stretch' : 'center', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid var(--border)', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: esMovil ? '50px' : '60px', height: esMovil ? '50px' : '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: esMovil ? '1rem' : '1.5rem', overflow: 'hidden', flexShrink: 0 }}>
            {esSuperUser && !clubActivo ? '👑' : escudoClub ? <img src={escudoClub} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : nombreClub.substring(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-label" style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>CENTRO DE MANDO • {rol?.toUpperCase()}</div>
            <h1 style={{ margin: 0, fontSize: esMovil ? '1.5rem' : '1.8rem', fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreClub}</h1>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', gap: '10px', width: esMovil ? '100%' : 'auto' }}>
            {rol !== 'jugador' && categoriasDisponibles.length > 0 && (
              <select value={categoriaActiva} onChange={handleCambioCategoria} style={{ padding: esMovil ? '12px' : '8px 10px', background: '#111', border: '1px solid var(--border)', color: '#fff', borderRadius: '8px', outline: 'none', fontWeight: 800, cursor: 'pointer', fontSize: esMovil ? '1rem' : '0.85rem', width: '100%', WebkitAppearance: 'none' }}>
                <option value="Todas">👉 TODAS LAS CATEGORÍAS</option>
                {categoriasDisponibles.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            )}
            {esSuperUser && (
              <select value={clubActivo} onChange={handleCambioClub} style={{ padding: esMovil ? '12px' : '8px 10px', background: '#111', border: '1px solid #c084fc', color: '#c084fc', borderRadius: '8px', outline: 'none', fontWeight: 800, cursor: 'pointer', fontSize: esMovil ? '1rem' : '0.85rem', width: '100%', WebkitAppearance: 'none' }}>
                <option value="">🌍 VISIÓN GLOBAL (TODOS)</option>
                {listaClubes.map(c => <option key={c.id} value={c.id}>🏢 GESTIONAR: {c.nombre}</option>)}
              </select>
            )}
            <button onClick={() => setModoEdicion(!modoEdicion)} style={{ background: modoEdicion ? 'var(--accent)' : '#222', color: modoEdicion ? '#000' : '#fff', border: 'none', padding: esMovil ? '12px' : '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: esMovil ? '1rem' : '0.85rem', fontWeight: 'bold', width: '100%' }}>
              {modoEdicion ? '✅ Guardar Diseño' : '⚙️ Editar Pantalla'}
            </button>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '50px' }}>CARGANDO DASHBOARD...</div>
      ) : (
        <>
          {/* BARRA MODO EDICIÓN */}
          {modoEdicion && (
            <div style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px dashed #444', marginBottom: '20px', animation: 'fadeIn 0.2s' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#fff' }}>Agregá/Quitá accesos de tu pantalla principal:</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {widgetsPermitidos.map(w => {
                  const activo = misWidgetsActivos.includes(w.id);
                  return (
                    <button key={w.id} onClick={() => toggleWidget(w.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: activo ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${activo ? w.color || 'var(--accent)' : '#333'}`, color: activo ? '#fff' : '#666', padding: '8px 12px', borderRadius: '20px', cursor: 'pointer', transition: '0.2s', fontSize: '0.85rem', fontWeight: activo ? 'bold' : 'normal' }}>
                      <span>{w.icon}</span> <span>{w.titulo}</span> {activo && <span style={{color: w.color || 'var(--accent)'}}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* GRID BENTO */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gridAutoRows: esMovil ? '110px' : '160px', 
            gap: esMovil ? '10px' : '15px', 
            gridAutoFlow: 'dense' 
          }}>
            
            {misWidgetsActivos.map((widgetId, index) => {
              const config = widgetsPermitidos.find(w => w.id === widgetId);
              if (!config) return null;
              
              const spanActual = tamanosWidgets[config.id] || config.spanDefecto;
              const gridConfig = getGridStyle(spanActual);
              const is1x1 = spanActual === '1x1';
              
              const dragEvents = !esMovil && modoEdicion ? {
                draggable: true,
                onDragStart: () => dragItem.current = index,
                onDragEnter: () => dragOverItem.current = index,
                onDragEnd: handleSort,
                onDragOver: (e) => e.preventDefault(),
              } : {};

              const cardBaseStyle = { 
                ...gridConfig, 
                position: 'relative', 
                border: modoEdicion ? '2px dashed #666' : 'none',
                cursor: modoEdicion && !esMovil ? 'grab' : 'default',
                opacity: modoEdicion ? 0.9 : 1,
                overflow: 'hidden'
              };

              // --- WIDGET: V-E-P ANUAL ---
              if (config.id === 'w_vep_anual') {
                return (
                  <div key={config.id} className="bento-card" {...dragEvents} style={{ ...cardBaseStyle, borderTop: modoEdicion ? cardBaseStyle.borderTop : '2px solid #3b82f6', padding: is1x1 ? '8px' : '15px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <ControlesEdicion id={config.id} spanActual={spanActual} index={index} />
                    <div className="stat-label" style={{ marginBottom: is1x1 ? '5px' : '10px', color: '#3b82f6', fontSize: is1x1 ? '0.6rem' : '0.7rem' }}>{config.titulo}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: is1x1 ? '2px' : '5px', textAlign: 'center' }}>
                      <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: is1x1 ? '2px' : '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#10b981', fontSize: is1x1 ? '1rem' : '1.2rem', fontWeight: 900 }}>{vepAnual.v}</div>
                        {!is1x1 && <div style={{ color: '#aaa', fontSize: '0.55rem', fontWeight: 'bold' }}>V</div>}
                      </div>
                      <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: is1x1 ? '2px' : '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#f59e0b', fontSize: is1x1 ? '1rem' : '1.2rem', fontWeight: 900 }}>{vepAnual.e}</div>
                        {!is1x1 && <div style={{ color: '#aaa', fontSize: '0.55rem', fontWeight: 'bold' }}>E</div>}
                      </div>
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: is1x1 ? '2px' : '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#ef4444', fontSize: is1x1 ? '1rem' : '1.2rem', fontWeight: 900 }}>{vepAnual.d}</div>
                        {!is1x1 && <div style={{ color: '#aaa', fontSize: '0.55rem', fontWeight: 'bold' }}>D</div>}
                      </div>
                    </div>
                  </div>
                );
              }

              // --- WIDGET: ÚLTIMOS RESULTADOS ---
              if (config.id === 'w_resultados_cat') {
                const cats = Object.keys(resultadosRecientesCat);
                return (
                  <div key={config.id} className="bento-card" {...dragEvents} style={{ ...cardBaseStyle, borderTop: modoEdicion ? cardBaseStyle.borderTop : '2px solid #8b5cf6', padding: is1x1 ? '8px' : '15px', overflowY: 'auto' }}>
                    <ControlesEdicion id={config.id} spanActual={spanActual} index={index} />
                    <div className="stat-label" style={{ marginBottom: is1x1 ? '5px' : '10px', color: '#8b5cf6', fontSize: is1x1 ? '0.6rem' : '0.7rem' }}>{config.titulo}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: is1x1 ? '4px' : '10px' }}>
                      {cats.length > 0 ? cats.map(cat => (
                        <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {!is1x1 && <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>{cat}</div>}
                          {resultadosRecientesCat[cat].slice(0, is1x1 ? 1 : 2).map((d, idx) => {
                            const colorRes = d.res === 'V' ? '#10b981' : d.res === 'E' ? '#f59e0b' : '#ef4444';
                            return (
                              <div key={`${cat}-${idx}`} onClick={() => !modoEdicion && navigate(`/resumen/${d.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: is1x1 ? '4px 6px' : '8px 10px', borderRadius: '6px', border: '1px solid #333', cursor: modoEdicion ? 'grab' : 'pointer' }}>
                                <div style={{ minWidth: 0 }}>
                                  {!is1x1 && <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>{d.fecha}</div>}
                                  <div style={{ fontSize: is1x1 ? '0.65rem' : '0.75rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{is1x1 ? d.rival.substring(0,6) : `vs ${d.rival}`?.toUpperCase()}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                                  <strong style={{ fontSize: is1x1 ? '0.7rem' : '0.9rem', color: '#fff' }}>{d.gf}-{d.gc}</strong>
                                  <span style={{ background: colorRes, color: '#000', width: is1x1 ? '16px' : '20px', height: is1x1 ? '16px' : '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 900, fontSize: is1x1 ? '0.6rem' : '0.7rem' }}>{d.res}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )) : <div style={{ textAlign: 'center', color: '#666', padding: '10px', fontSize:'0.7rem' }}>N/A</div>}
                    </div>
                  </div>
                );
              }

              // --- WIDGET: GOLES POR CATEGORÍA (SUMARIZADOS Y CON DIFERENCIA) ---
              if (config.id === 'w_goles_cat') {
                const totalGF = Object.values(golesPorCat).reduce((acc, cat) => acc + cat.favor, 0);
                const totalGC = Object.values(golesPorCat).reduce((acc, cat) => acc + cat.contra, 0);
                const dif = totalGF - totalGC;
                const difColor = dif > 0 ? '#10b981' : dif < 0 ? '#ef4444' : '#f59e0b';
                const difSigno = dif > 0 ? '+' : '';
                
                const difBg = dif > 0 ? 'rgba(16, 185, 129, 0.1)' : dif < 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
                const difBorder = dif > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : dif < 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)';

                return (
                  <div key={config.id} className="bento-card" {...dragEvents} style={{ ...cardBaseStyle, borderTop: modoEdicion ? cardBaseStyle.borderTop : '2px solid #0ea5e9', padding: is1x1 ? '8px' : '15px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <ControlesEdicion id={config.id} spanActual={spanActual} index={index} />
                    <div className="stat-label" style={{ marginBottom: is1x1 ? '5px' : '10px', color: '#0ea5e9', fontSize: is1x1 ? '0.6rem' : '0.7rem' }}>
                      {config.titulo} {categoriaActiva !== 'Todas' ? `(${categoriaActiva.substring(0,3)})` : ''}
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: is1x1 ? '2px' : '5px', textAlign: 'center' }}>
                      <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: is1x1 ? '2px' : '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#10b981', fontSize: is1x1 ? '1rem' : '1.2rem', fontWeight: 900 }}>{totalGF}</div>
                        {!is1x1 && <div style={{ color: '#aaa', fontSize: '0.50rem', fontWeight: 'bold' }}>A FAVOR</div>}
                      </div>
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: is1x1 ? '2px' : '10px', borderRadius: '6px' }}>
                        <div style={{ color: '#ef4444', fontSize: is1x1 ? '1rem' : '1.2rem', fontWeight: 900 }}>{totalGC}</div>
                        {!is1x1 && <div style={{ color: '#aaa', fontSize: '0.50rem', fontWeight: 'bold' }}>EN CONTRA</div>}
                      </div>
                      <div style={{ background: difBg, border: difBorder, padding: is1x1 ? '2px' : '10px', borderRadius: '6px' }}>
                        <div style={{ color: difColor, fontSize: is1x1 ? '1rem' : '1.2rem', fontWeight: 900 }}>{difSigno}{dif}</div>
                        {!is1x1 && <div style={{ color: '#aaa', fontSize: '0.50rem', fontWeight: 'bold' }}>DIFERENCIA</div>}
                      </div>
                    </div>
                  </div>
                );
              }

              // --- WIDGET: PRÓXIMO PARTIDO ---
              if (config.id === 'w_proximo') {
                return (
                  <div key={config.id} className="bento-card" {...dragEvents} style={{ ...cardBaseStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: modoEdicion ? cardBaseStyle.borderTop : '2px solid #10b981', padding: is1x1 ? '8px' : '15px' }}>
                    <ControlesEdicion id={config.id} spanActual={spanActual} index={index} />
                    <div className="stat-label" style={{ marginBottom: is1x1 ? '5px' : '10px', color: '#10b981', fontSize: is1x1 ? '0.6rem' : '0.7rem' }}>{config.titulo}</div>
                    {proximoPartido ? (
                      <div style={{ background: '#111', padding: is1x1 ? '6px' : '10px', borderRadius: '6px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', flexDirection: is1x1 ? 'column' : 'row', justifyContent: 'space-between', gap: is1x1 ? '4px' : '0', marginBottom: '4px' }}>
                          <span style={{ fontSize: is1x1 ? '0.55rem' : '0.65rem', color: '#10b981', fontWeight: 'bold' }}>📅 {proximoPartido.fecha?.split('-').reverse().join('/')}</span>
                          <span style={{ background: '#222', color: '#fff', padding: '2px 4px', borderRadius: '4px', fontSize: is1x1 ? '0.55rem' : '0.6rem', fontWeight: 800, alignSelf: 'flex-start' }}>{is1x1 ? proximoPartido.competicion.substring(0,8) : proximoPartido.competicion}</span>
                        </div>
                        <div style={{ fontSize: is1x1 ? '0.75rem' : '0.85rem', fontWeight: 900, textAlign: 'center', margin: '5px 0', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {proximoPartido.rival?.toUpperCase()}</div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '10px', background: '#111', borderRadius: '6px', border: '1px dashed #333', fontSize: '0.7rem' }}>Sin partidos</div>
                    )}
                  </div>
                );
              }

              // --- WIDGET: ÚLTIMO PARTIDO ---
              if (config.id === 'w_ultimo') {
                return (
                  <div key={config.id} className="bento-card" {...dragEvents} style={{ ...cardBaseStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: modoEdicion ? cardBaseStyle.borderTop : '2px solid var(--text-dim)', padding: is1x1 ? '8px' : '15px' }}>
                    <ControlesEdicion id={config.id} spanActual={spanActual} index={index} />
                    <div className="stat-label" style={{ marginBottom: is1x1 ? '5px' : '10px', color: 'var(--text-dim)', fontSize: is1x1 ? '0.6rem' : '0.7rem' }}>{config.titulo}</div>
                    {ultimoPartido ? (
                      <div style={{ background: '#111', padding: is1x1 ? '6px' : '10px', borderRadius: '6px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', flexDirection: is1x1 ? 'column' : 'row', justifyContent: 'space-between', gap: is1x1 ? '4px' : '0', marginBottom: '4px' }}>
                          <span style={{ fontSize: is1x1 ? '0.55rem' : '0.65rem', color: 'var(--text-dim)' }}>{ultimoPartido.fecha?.split('-').reverse().join('/')}</span>
                          <span style={{ background: '#222', color: '#fff', padding: '2px 4px', borderRadius: '4px', fontSize: is1x1 ? '0.55rem' : '0.6rem', fontWeight: 800, alignSelf: 'flex-start' }}>{is1x1 ? ultimoPartido.competicion.substring(0,8) : ultimoPartido.competicion}</span>
                        </div>
                        <div style={{ fontSize: is1x1 ? '0.75rem' : '0.85rem', fontWeight: 900, textAlign: 'center', margin: '5px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {ultimoPartido.rival?.toUpperCase()}</div>
                        {!is1x1 && <button onClick={() => !modoEdicion && navigate(`/resumen/${ultimoPartido.id}`)} className="btn-secondary" style={{ width: '100%', fontSize: '0.65rem', padding: '6px', cursor: modoEdicion ? 'grab' : 'pointer' }}>VER RESUMEN</button>}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '10px', background: '#111', borderRadius: '6px', border: '1px dashed #333', fontSize: '0.7rem' }}>Sin registros</div>
                    )}
                  </div>
                );
              }

              // --- WIDGET: ESTADO DE LA BASE ---
              if (config.id === 'w_stats_base') {
                return (
                  <div key={config.id} className="bento-card" {...dragEvents} style={{ ...cardBaseStyle, display: 'flex', flexDirection: 'column', padding: is1x1 ? '8px' : '15px' }}>
                    <ControlesEdicion id={config.id} spanActual={spanActual} index={index} />
                    <div className="stat-label" style={{ marginBottom: is1x1 ? '5px' : '10px', color: '#fff', fontSize: is1x1 ? '0.6rem' : '0.7rem' }}>{config.titulo}</div>
                    
                    <div style={{ display: 'flex', flexDirection: is1x1 ? 'column' : 'row', gap: is1x1 ? '4px' : '10px', flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: is1x1 ? 'row' : 'column', alignItems: 'center', justifyContent: is1x1 ? 'space-between' : 'center', padding: is1x1 ? '4px 8px' : '10px', background: is1x1 ? 'transparent' : '#111', border: is1x1 ? 'none' : '1px solid #333', borderBottom: is1x1 ? '1px dashed #333' : '1px solid #333', borderRadius: is1x1 ? '0' : '6px', flex: 1 }}>
                        <div style={{ fontSize: is1x1 ? '1.2rem' : '1.5rem', fontWeight: 900, color: '#fff' }}>{estadisticas.plantel}</div>
                        <div className="stat-label" style={{ fontSize: '0.55rem', marginTop: is1x1 ? '0' : '5px' }}>JUGADORES</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: is1x1 ? 'row' : 'column', alignItems: 'center', justifyContent: is1x1 ? 'space-between' : 'center', padding: is1x1 ? '4px 8px' : '10px', background: is1x1 ? 'transparent' : '#111', border: is1x1 ? 'none' : '1px solid #333', borderRadius: is1x1 ? '0' : '6px', flex: 1 }}>
                        <div style={{ fontSize: is1x1 ? '1.2rem' : '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>{estadisticas.jugados}</div>
                        <div className="stat-label" style={{ fontSize: '0.55rem', marginTop: is1x1 ? '0' : '5px' }}>PARTIDOS</div>
                      </div>
                    </div>
                  </div>
                );
              }

              // --- WIDGETS TIPO LINK (Accesos Directos) ---
              if (config.tipo === 'link') {
                const bgSoft = config.color ? `rgba(${hexToRgb(config.color)}, 0.05)` : 'rgba(255,255,255,0.05)';
                const isHorizontal = spanActual === '2x1' || spanActual === '3x1';

                return (
                  <div key={config.id} className="bento-card" {...dragEvents}
                    style={{ ...cardBaseStyle, textAlign: isHorizontal ? 'left' : 'center', padding: isHorizontal ? '10px 20px' : '10px', border: modoEdicion ? cardBaseStyle.border : `1px solid ${config.color || '#333'}`, background: `linear-gradient(${isHorizontal ? '90deg' : '180deg'}, ${bgSoft} 0%, rgba(0,0,0,0) 100%)`, transition: 'transform 0.2s', display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', justifyContent: 'center', alignItems: 'center', gap: isHorizontal ? '15px' : '0' }} 
                    onClick={() => !modoEdicion && navigate(config.ruta)}
                    onMouseOver={(e) => !esMovil && !modoEdicion && (e.currentTarget.style.transform = 'translateY(-5px)')}
                    onMouseOut={(e) => !esMovil && !modoEdicion && (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    <ControlesEdicion id={config.id} spanActual={spanActual} index={index} />
                    <div style={{ fontSize: is1x1 ? '2rem' : '2.5rem', marginBottom: isHorizontal ? '0' : '8px' }}>{config.icon}</div>
                    <div>
                      <div className="stat-label" style={{ color: config.color || '#fff', fontSize: is1x1 ? '0.7rem' : '0.85rem', lineHeight: '1.1' }}>{config.titulo}</div>
                      {(!is1x1 || config.desc.length < 15) && <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '0.65rem' }}>{config.desc}</p>}
                    </div>
                  </div>
                );
              }
              return null;
            })}

          </div>
        </>
      )}

      {/* NUEVO: RENDERIZADO DEL MODAL DE NOVEDADES */}
      {mostrarNovedades && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', 
          zIndex: 3000, padding: '20px' 
        }}>
          <div style={{ 
            background: '#111', border: '1px solid var(--accent)', borderRadius: '8px', 
            padding: '30px', maxWidth: '550px', width: '100%', position: 'relative', 
            animation: 'fadeIn 0.3s', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' 
          }}>
            
            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <span style={{ 
                background: 'rgba(0,255,136,0.1)', color: 'var(--accent)', padding: '6px 12px', 
                borderRadius: '20px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(0,255,136,0.3)' 
              }}>
                VERSIÓN 0.00202604052328
              </span>
              <h2 style={{ color: '#fff', marginTop: '20px', marginBottom: '5px', fontSize: '1.6rem', textTransform: 'uppercase' }}>
                ¡Evolución en el Match Center!
              </h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
                Optimizamos el tracking en vivo, automatizamos reglas y mejoramos la visualización.
              </p>
            </div>
            
            <div style={{ color: '#ddd', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '30px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '6px', border: '1px solid #222' }}>
              <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <li>
                  <strong style={{color: '#f59e0b'}}>Gestor de Quintetos y Contexto:</strong> 
                  <br/>Ahora podés hacer múltiples cambios simultáneos (Rolling Subs). Sumamos el selector táctico (5v5, 5v4, etc.) automatizado: si hay expulsión, saca al jugador, te pasa a 4v5 y bloquea los cambios hasta recibir un gol.
                </li>
                <li>
                  <strong style={{color: '#10b981'}}>Ocasión Fallada y Ley de Ventaja:</strong> 
                  <br/>Nuevo botón en "Finalización" para registrar esos "pases de la muerte" fallidos. En el marcador sumamos botones rápidos (+1) para agregar faltas por ley de ventaja sin salir de la pantalla táctil.
                </li>
                <li>
                  <strong style={{color: '#0ea5e9'}}>Canchas Proporcionales (Reportes):</strong> 
                  <br/>Rediseñamos el campo a escala real (40x20m). La misma precisión matemática y visual que tenés en la app, ahora se exporta directamente en los reportes de rendimiento.
                </li>
              </ul>
            </div>
            
            <button 
              onClick={cerrarModalNovedades}
              className="btn-action" 
              style={{ 
                width: '100%', background: 'var(--accent)', color: '#000', fontWeight: 900, 
                padding: '15px', fontSize: '1rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
                transition: 'transform 0.1s'
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              ¡ENTENDIDO, A DIRIGIR!
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255,255,255';
}