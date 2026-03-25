import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; 

// ==========================================
// 1. CATÁLOGO DE WIDGETS Y PERMISOS ESTRICTOS
// ==========================================
const CATÁLOGO_WIDGETS = [
  { id: 'w_proximo', tipo: 'data', titulo: 'Próximo Partido', icon: '📅', roles: ['superuser', 'ct'] },
  { id: 'w_ultimo', tipo: 'data', titulo: 'Último Registro', icon: '⏱️', roles: ['superuser', 'ct'] },
  { id: 'w_stats_base', tipo: 'data', titulo: 'Estado de la Base', icon: '📊', roles: ['superuser', 'admin'] },
  { id: 'w_vep_anual', tipo: 'data', titulo: 'Balance Anual (V-E-D)', icon: '⚖️', roles: ['superuser', 'ct', 'admin'] },
  { id: 'w_goles_cat', tipo: 'data', titulo: 'Goles Acumulados', icon: '⚽', roles: ['superuser', 'ct', 'admin'] },
  { id: 'w_resultados_cat', tipo: 'data', titulo: 'Últimos Resultados', icon: '📈', roles: ['superuser', 'ct', 'admin'] },
  
  // CT
  { id: 'nuevo_partido', tipo: 'link', titulo: 'Nuevo Partido', icon: '⚡', ruta: '/nuevo-partido', color: '#10b981', desc: 'Toma de stats en vivo', roles: ['superuser', 'ct'] },
  { id: 'planificador', tipo: 'link', titulo: 'Microciclo', icon: '🗓️', ruta: '/planificador-semanal', color: '#8b5cf6', desc: 'Cargas y sesiones', roles: ['superuser', 'ct'] },
  { id: 'creador_tareas', tipo: 'link', titulo: 'Creador Tareas', icon: '🎨', ruta: '/creador-tareas', color: '#ec4899', desc: 'Pizarra de ejercicios', roles: ['superuser', 'ct'] },
  { id: 'banco_tareas', tipo: 'link', titulo: 'Banco Tareas', icon: '📁', ruta: '/banco-tareas', color: '#f59e0b', desc: 'Archivo de ejercicios', roles: ['superuser', 'ct'] },
  { id: 'libro_tactico', tipo: 'link', titulo: 'Libro Táctico', icon: '📋', ruta: '/libro-tactico', color: '#3b82f6', desc: 'Pelota parada y sistemas', roles: ['superuser', 'ct'] },
  { id: 'scouting', tipo: 'link', titulo: 'Scouting Rivales', icon: '🕵️‍♂️', ruta: '/scouting-rivales', color: '#64748b', desc: 'Análisis del rival', roles: ['superuser', 'ct'] },
  { id: 'rendimiento', tipo: 'link', titulo: 'Sports Science', icon: '🧬', ruta: '/rendimiento', color: '#f43f5e', desc: 'Físico, Kine y Nutri', roles: ['superuser', 'ct'] },
  { id: 'presentismo', tipo: 'link', titulo: 'Presentismo', icon: '✅', ruta: '/presentismo', color: '#14b8a6', desc: 'Asistencia a entrenos', roles: ['superuser', 'ct'] },
  { id: 'plantel', tipo: 'link', titulo: 'Mi Plantel', icon: '👥', ruta: '/plantel', color: '#0ea5e9', desc: 'Gestión de jugadores', roles: ['superuser', 'ct', 'admin'] },
  { id: 'wellness_ct', tipo: 'link', titulo: 'Monitor Wellness', icon: '🔋', ruta: '/carga-wellness', color: '#10b981', desc: 'Estado del plantel hoy', roles: ['superuser', 'ct'] },

  // ADMIN
  { id: 'tesoreria', tipo: 'link', titulo: 'Tesorería', icon: '💰', ruta: '/tesoreria', color: '#eab308', desc: 'Caja y Cuotas', roles: ['superuser', 'admin'] },
  { id: 'torneos', tipo: 'link', titulo: 'Torneos', icon: '🏆', ruta: '/torneos', color: '#fbbf24', desc: 'Gestión de ligas', roles: ['superuser', 'admin'] },
  { id: 'sponsors', tipo: 'link', titulo: 'Sponsors', icon: '🤝', ruta: '/sponsors', color: '#0284c7', desc: 'Patrocinadores', roles: ['superuser', 'admin'] },
  { id: 'usuarios', tipo: 'link', titulo: 'Gestión de Usuarios', icon: '👑', ruta: '/usuarios', color: '#c084fc', desc: 'Accesos y permisos', roles: ['superuser'] },
  
  // JUGADORES
  { id: 'mi_wellness', tipo: 'link', titulo: 'Cargar Wellness', icon: '🌡️', ruta: '/wellness', color: '#f59e0b', desc: 'Fatiga y sueño diario', roles: ['jugador'] },
  { id: 'mi_perfil', tipo: 'link', titulo: 'Mi Perfil & Stats', icon: '🏃‍♂️', ruta: '/jugador-perfil', color: '#3b82f6', desc: 'Tus métricas en vivo', roles: ['jugador'] },
  { id: 'mi_rendimiento', tipo: 'link', titulo: 'Mi Biomecánica', icon: '🧬', ruta: '/rendimiento', color: '#f43f5e', desc: 'Tu evolución física', roles: ['jugador'] },
];

export default function Inicio() {
  const navigate = useNavigate();
  const { perfil } = useAuth(); 
  
  const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
  const kioscoJugadorId = localStorage.getItem('kiosco_jugador_id') || localStorage.getItem('kiosco_user_id') || '';
  const kioscoClubId = localStorage.getItem('kiosco_club_id') || perfil?.club_id || '';

  const rol = (isKioscoMode ? 'jugador' : (perfil?.rol || 'jugador')).toLowerCase();
  const esSuperUser = rol === 'superuser';
  const esAdmin = rol === 'admin';

  const [clubMaster, setClubMaster] = useState(localStorage.getItem('club_id') || '');
  const clubActivo = esSuperUser ? clubMaster : (perfil?.club_id || '');

  const [nombreClub, setNombreClub] = useState(esSuperUser ? (clubMaster ? (localStorage.getItem('mi_club') || 'CARGANDO...') : 'VISTA GLOBAL MASTER') : (perfil?.clubes?.nombre || localStorage.getItem('mi_club') || 'CARGANDO...'));
  const [escudoClub, setEscudoClub] = useState(localStorage.getItem('escudo_url') || '');

  // --- FILTRO GLOBAL DE CATEGORÍA ---
  const [categoriaActiva, setCategoriaActiva] = useState(localStorage.getItem('dash_categoria') || 'Todas');
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);

  const [cargando, setCargando] = useState(true);
  const [listaClubes, setListaClubes] = useState([]);

  const [kioscoJugador, setKioscoJugador] = useState(null);
  const [kioscoClub, setKioscoClub] = useState(null);
  const [kioscoCargando, setKioscoCargando] = useState(true);
  
  const [ultimoPartido, setUltimoPartido] = useState(null);
  const [proximoPartido, setProximoPartido] = useState(null); 
  const [estadisticas, setEstadisticas] = useState({ jugados: 0, plantel: 0 });
  
  const [vepAnual, setVepAnual] = useState({ v: 0, e: 0, d: 0 });
  const [golesPorCat, setGolesPorCat] = useState({});
  const [resultadosRecientesCat, setResultadosRecientesCat] = useState({});

  const [modoEdicion, setModoEdicion] = useState(false);
  const widgetsPermitidos = CATÁLOGO_WIDGETS.filter(w => w.roles.includes(rol));
  
  const defaultLayout = esSuperUser ? ['usuarios', 'w_vep_anual', 'w_resultados_cat', 'tesoreria', 'nuevo_partido'] : rol === 'ct' ? ['w_vep_anual', 'w_proximo', 'nuevo_partido', 'planificador', 'rendimiento', 'wellness_ct'] : esAdmin ? ['w_stats_base', 'tesoreria', 'torneos', 'sponsors', 'plantel'] : ['mi_wellness', 'mi_perfil', 'mi_rendimiento'];

  const [misWidgetsActivos, setMisWidgetsActivos] = useState(() => {
    const guardado = localStorage.getItem(`dashboard_${perfil?.id}`);
    if (guardado) {
      const idsValidos = JSON.parse(guardado).filter(id => widgetsPermitidos.some(w => w.id === id));
      return idsValidos.length > 0 ? idsValidos : defaultLayout;
    }
    return defaultLayout;
  });

  const toggleWidget = (id) => {
    setMisWidgetsActivos(prev => {
      const nuevo = prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id];
      localStorage.setItem(`dashboard_${perfil?.id}`, JSON.stringify(nuevo));
      return nuevo;
    });
  };

  const handleCambioCategoria = (e) => {
    const cat = e.target.value;
    setCategoriaActiva(cat);
    localStorage.setItem('dash_categoria', cat);
  };

  useEffect(() => {
    if (isKioscoMode) {
      const cargarKiosco = async () => {
        setKioscoCargando(true);

        if (!kioscoJugadorId || !kioscoClubId) {
          setKioscoJugador(null);
          setKioscoClub(null);
          setKioscoCargando(false);
          return;
        }

        const [resJugador, resClub] = await Promise.all([
          supabase
            .from('jugadores')
            .select('id, nombre, apellido, foto, club_id, username, pin_kiosco, user_id')
            .eq('id', kioscoJugadorId)
            .eq('club_id', kioscoClubId)
            .single(),
          supabase
            .from('clubes')
            .select('id, nombre, escudo_url')
            .eq('id', kioscoClubId)
            .single()
        ]);

        if (resJugador.data) setKioscoJugador(resJugador.data);
        else setKioscoJugador(null);

        if (resClub.data) setKioscoClub(resClub.data);
        else setKioscoClub(null);

        setKioscoCargando(false);
      };

      cargarKiosco();
      return;
    }

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
    if (isKioscoMode) {
      setCargando(false);
      return;
    }

    async function cargarDashboard() {
      setCargando(true);
      if (!clubActivo && !esSuperUser) { setCargando(false); return; }

      if (clubActivo) {
        const { data: clubData } = await supabase.from('clubes').select('nombre, escudo_url').eq('id', clubActivo).single();
        if (clubData) {
          if (clubData.nombre) { setNombreClub(clubData.nombre); localStorage.setItem('mi_club', clubData.nombre); }
          if (clubData.escudo_url) { setEscudoClub(clubData.escudo_url); localStorage.setItem('escudo_url', clubData.escudo_url); } 
          else { setEscudoClub(''); localStorage.removeItem('escudo_url'); }
        }
      } else if (esSuperUser) {
        setNombreClub('VISTA GLOBAL MASTER');
        setEscudoClub('');
      }

      // 1. Extraer categorías únicas para el filtro
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

        // 2. Armar consultas BASE
        let qUltimo = supabase.from('partidos').select('*').in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: false }).limit(1);
        let qProximo = supabase.from('partidos').select('*').eq('estado', 'Pendiente').gte('fecha', hoyStr).order('fecha', { ascending: true }).limit(1);
        let qAnual = supabase.from('partidos').select('*').gte('fecha', `${anioActual}-01-01`).in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: true });
        let qJugadores = supabase.from('jugadores').select('*', { count: 'exact', head: true });
        let qPartidosTot = supabase.from('partidos').select('*', { count: 'exact', head: true });

        // 3. Aplicar Filtro de Club
        if (clubActivo) {
          qUltimo = qUltimo.eq('club_id', clubActivo);
          qProximo = qProximo.eq('club_id', clubActivo);
          qAnual = qAnual.eq('club_id', clubActivo);
          qJugadores = qJugadores.eq('club_id', clubActivo);
          qPartidosTot = qPartidosTot.eq('club_id', clubActivo);
        }

        // 4. APLICAR FILTRO DE CATEGORÍA SI NO ES "Todas"
        if (categoriaActiva !== 'Todas') {
          qUltimo = qUltimo.eq('categoria', categoriaActiva);
          qProximo = qProximo.eq('categoria', categoriaActiva);
          qAnual = qAnual.eq('categoria', categoriaActiva);
          qJugadores = qJugadores.eq('categoria', categoriaActiva);
          qPartidosTot = qPartidosTot.eq('categoria', categoriaActiva);
        }

        const [resUltimo, resProximo, resAnual, resJugadores, resPartTot] = await Promise.all([
          qUltimo, qProximo, qAnual, qJugadores, qPartidosTot
        ]);

        setUltimoPartido(resUltimo.data?.[0] || null);
        setProximoPartido(resProximo.data?.[0] || null);
        setEstadisticas({ jugados: resPartTot.count || 0, plantel: resJugadores.count || 0 });

        // Procesar Data Analítica Anual
        if (resAnual.data && resAnual.data.length > 0) {
          let v = 0, e = 0, d = 0;
          let golesCat = {};
          let ultimosCat = {};

          resAnual.data.forEach(p => {
            const cat = p.categoria || 'Sin Categoría';
            let gf = parseInt(p.goles_propios) || 0;
            let gc = parseInt(p.goles_rival) || 0;

            if (gf > gc) v++;
            else if (gf === gc) e++;
            else d++;

            if (!golesCat[cat]) golesCat[cat] = { favor: 0, contra: 0 };
            golesCat[cat].favor += gf;
            golesCat[cat].contra += gc;

            // Agrupamos en un array para luego quedarnos con los últimos 2
            if (!ultimosCat[cat]) ultimosCat[cat] = [];
            ultimosCat[cat].push({ 
              id: p.id,
              rival: p.rival, 
              gf, 
              gc, 
              res: gf > gc ? 'V' : (gf === gc ? 'E' : 'D'),
              fecha: p.fecha?.split('-').reverse().join('/')
            });
          });

          // Filtramos para dejar solo los últimos 2 partidos por categoría y los invertimos (más nuevo primero)
          Object.keys(ultimosCat).forEach(cat => {
            ultimosCat[cat] = ultimosCat[cat].slice(-2).reverse();
          });

          setVepAnual({ v, e, d });
          setGolesPorCat(golesCat);
          setResultadosRecientesCat(ultimosCat);
        } else {
          // Reset si no hay partidos
          setVepAnual({ v: 0, e: 0, d: 0 });
          setGolesPorCat({});
          setResultadosRecientesCat({});
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


  if (isKioscoMode) {
    const nombreJugador = `${kioscoJugador?.apellido ? kioscoJugador.apellido.toUpperCase() + ' ' : ''}${kioscoJugador?.nombre ? kioscoJugador.nombre.toUpperCase() : (localStorage.getItem('kiosco_nombre') || 'JUGADOR').toUpperCase()}`.trim();
    const nombreClubK = kioscoClub?.nombre || localStorage.getItem('mi_club') || 'MI CLUB';
    const escudoK = kioscoClub?.escudo_url || localStorage.getItem('escudo_url') || '';
    const menuJugador = [
      { id: 'wellness', titulo: 'CARGA WELLNESS', icon: '🌡️', ruta: '/kiosco/wellness' },
      { id: 'rendimiento', titulo: 'RENDIMIENTO', icon: '🧬', ruta: '/kiosco/rendimiento' },
      { id: 'resumen', titulo: 'RESUMEN', icon: '📊', ruta: '/kiosco/resumen' },
      { id: 'temporada', titulo: 'TEMPORADA', icon: '📈', ruta: '/kiosco/temporada' },
      { id: 'perfil', titulo: 'JUGADOR PERFIL', icon: '🏃‍♂️', ruta: '/kiosco/jugador-perfil' },
      { id: 'libro', titulo: 'LIBRO TÁCTICO', icon: '📘', ruta: '/kiosco/libro-tactico' },
    ];

    return (
      <div style={{ animation: 'fadeIn 0.3s', padding: '20px', maxWidth: '1100px', margin: '0 auto', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: '1.5rem', overflow: 'hidden' }}>
              {escudoK ? <img src={escudoK} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : nombreClubK.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="stat-label" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>INGRESO JUGADOR</div>
              <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase' }}>{nombreClubK}</h1>
            </div>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem('kiosco_user_id');
              localStorage.removeItem('kiosco_jugador_id');
              localStorage.removeItem('kiosco_club_id');
              localStorage.removeItem('kiosco_nombre');
              localStorage.removeItem('kiosco_apellido');
              localStorage.removeItem('kiosco_username');
              localStorage.removeItem('kiosco_mode');
              navigate('/login', { replace: true });
            }}
            className="btn-action"
            style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)' }}
          >
            SALIR
          </button>
        </div>

        {kioscoCargando ? (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '60px 20px' }}>CARGANDO MI PANEL...</div>
        ) : !kioscoJugador ? (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '60px 20px' }}>
            <h2 style={{ color: '#ef4444' }}>No se pudo cargar tu sesión.</h2>
            <p>Volvé a ingresar desde el kiosco.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', flexWrap: 'wrap' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'var(--accent)' }}>
                {kioscoJugador.foto ? <img src={kioscoJugador.foto} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : `${(kioscoJugador.apellido || '').charAt(0)}${(kioscoJugador.nombre || '').charAt(0)}`}
              </div>
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 800 }}>HOLA</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, textTransform: 'uppercase', color: '#fff', lineHeight: 1 }}>{nombreJugador}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              {menuJugador.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.ruta)}
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '22px 18px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: '#fff',
                    minHeight: '120px'
                  }}
                >
                  <div style={{ fontSize: '1.6rem', marginBottom: '12px' }}>{item.icon}</div>
                  <div style={{ fontSize: '0.82rem', letterSpacing: '1px', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '6px' }}>{item.titulo}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{item.ruta}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (!cargando && !clubActivo && !esSuperUser) {
    if (esAdmin) {
      return (
        <div style={{ animation: 'fadeIn 0.3s', padding: '50px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🏟️</div>
          <h2 style={{ color: 'var(--accent)', fontWeight: 900 }}>¡BIENVENIDO A VIRTUAL.STATS!</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '30px', lineHeight: '1.6' }}>Para empezar a registrar estadísticas, primero necesitamos crear el perfil de tu equipo.</p>
          <button onClick={() => navigate('/configuracion')} className="btn-action" style={{ width: '100%', padding: '20px', fontSize: '1.1rem' }}>CONFIGURAR MI CLUB AHORA</button>
        </div>
      );
    } else {
      return (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>
          <h2>El club aún no está configurado.</h2><p>Contactá a la administración del club.</p>
        </div>
      );
    }
  }   

  return (
    <div style={{ animation: 'fadeIn 0.3s', paddingBottom: '80px', maxWidth: '1100px', margin: '0 auto', position: 'relative' }}>
      
      {/* HEADER DEL CLUB Y FILTROS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: '1.5rem', overflow: 'hidden' }}>
            {esSuperUser && !clubActivo ? '👑' : escudoClub ? <img src={escudoClub} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : nombreClub.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="stat-label" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>CENTRO DE MANDO • {rol?.toUpperCase()}</div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase' }}>{nombreClub}</h1>
          </div>
        </div>
        
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              
              {/* SELECTOR DE CATEGORÍA */}
              {rol !== 'jugador' && categoriasDisponibles.length > 0 && (
                <select value={categoriaActiva} onChange={handleCambioCategoria} style={{ padding: '6px 10px', background: '#111', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', outline: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '0.8rem' }}>
                  <option value="Todas">👉 TODAS LAS CATEGORÍAS</option>
                  {categoriasDisponibles.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
              )}

              <button onClick={() => setModoEdicion(!modoEdicion)} style={{ background: modoEdicion ? 'var(--accent)' : '#222', color: modoEdicion ? '#000' : '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                {modoEdicion ? '✅ Listo' : '⚙️ Personalizar'}
              </button>
            </div>
            
            {esSuperUser && (
              <select value={clubActivo} onChange={handleCambioClub} style={{ padding: '6px 10px', background: '#111', border: '1px solid #c084fc', color: '#c084fc', borderRadius: '4px', outline: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '0.8rem' }}>
                <option value="">🌍 VISIÓN GLOBAL (TODOS)</option>
                {listaClubes.map(c => <option key={c.id} value={c.id}>🏢 GESTIONAR: {c.nombre}</option>)}
              </select>
            )}
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '50px' }}>CARGANDO DASHBOARD...</div>
      ) : (
        <>
          {/* MODO EDICIÓN */}
          {modoEdicion && (
            <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px dashed #444', marginBottom: '25px', animation: 'fadeIn 0.2s' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: '#fff' }}>¿Qué querés ver en tu inicio?</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {widgetsPermitidos.map(w => {
                  const activo = misWidgetsActivos.includes(w.id);
                  return (
                    <button key={w.id} onClick={() => toggleWidget(w.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: activo ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${activo ? w.color || 'var(--accent)' : '#333'}`, color: activo ? '#fff' : '#666', padding: '8px 12px', borderRadius: '20px', cursor: 'pointer', transition: '0.2s' }}>
                      <span>{w.icon}</span> <span>{w.titulo}</span> {activo && <span style={{color: w.color || 'var(--accent)'}}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* RENDERIZADO DEL DASHBOARD */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', gridAutoFlow: 'dense' }}>
            
            {misWidgetsActivos.map(widgetId => {
              const config = widgetsPermitidos.find(w => w.id === widgetId);
              if (!config) return null;

              // --- WIDGET: V-E-P ANUAL ---
              if (config.id === 'w_vep_anual') {
                const total = vepAnual.v + vepAnual.e + vepAnual.d;
                const winRate = total > 0 ? ((vepAnual.v / total) * 100).toFixed(1) : 0;
                return (
                  <div key={config.id} className="bento-card" style={{ gridColumn: 'span 2', minWidth: '300px', borderTop: '2px solid #3b82f6' }}>
                    <div className="stat-label" style={{ marginBottom: '15px', color: '#3b82f6' }}>{config.titulo} {new Date().getFullYear()} ({categoriaActiva})</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', textAlign: 'center' }}>
                      <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ color: '#10b981', fontSize: '2rem', fontWeight: 900 }}>{vepAnual.v}</div>
                        <div style={{ color: '#aaa', fontSize: '0.7rem', fontWeight: 'bold' }}>VICTORIAS</div>
                      </div>
                      <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ color: '#f59e0b', fontSize: '2rem', fontWeight: 900 }}>{vepAnual.e}</div>
                        <div style={{ color: '#aaa', fontSize: '0.7rem', fontWeight: 'bold' }}>EMPATES</div>
                      </div>
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: 900 }}>{vepAnual.d}</div>
                        <div style={{ color: '#aaa', fontSize: '0.7rem', fontWeight: 'bold' }}>DERROTAS</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>Win Rate: <strong style={{ color: '#fff' }}>{winRate}%</strong> en {total} partidos.</div>
                  </div>
                );
              }

              // --- WIDGET: ÚLTIMOS RESULTADOS (Ahora muestra hasta 2) ---
              if (config.id === 'w_resultados_cat') {
                const cats = Object.keys(resultadosRecientesCat);
                return (
                  <div key={config.id} className="bento-card" style={{ borderTop: '2px solid #8b5cf6' }}>
                    <div className="stat-label" style={{ marginBottom: '15px', color: '#8b5cf6' }}>{config.titulo}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {cats.length > 0 ? cats.map(cat => (
                        <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', paddingLeft: '5px' }}>{cat}</div>
                          {resultadosRecientesCat[cat].map((d, idx) => {
                            const colorRes = d.res === 'V' ? '#10b981' : d.res === 'E' ? '#f59e0b' : '#ef4444';
                            return (
                              <div key={`${cat}-${idx}`} onClick={() => navigate(`/resumen/${d.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '10px 15px', borderRadius: '6px', border: '1px solid #333', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = colorRes} onMouseOut={(e) => e.currentTarget.style.borderColor = '#333'}>
                                <div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>{d.fecha}</div>
                                  <div style={{ fontSize: '0.85rem', color: '#fff' }}>vs {d.rival?.toUpperCase()}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <strong style={{ fontSize: '1.2rem', color: '#fff' }}>{d.gf} - {d.gc}</strong>
                                  <span style={{ background: colorRes, color: '#000', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 900, fontSize: '0.8rem' }}>{d.res}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )) : <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>Sin resultados registrados.</div>}
                    </div>
                  </div>
                );
              }

              // --- WIDGET: GOLES POR CATEGORÍA ---
              if (config.id === 'w_goles_cat') {
                const cats = Object.keys(golesPorCat);
                return (
                  <div key={config.id} className="bento-card" style={{ borderTop: '2px solid #0ea5e9' }}>
                    <div className="stat-label" style={{ marginBottom: '15px', color: '#0ea5e9' }}>{config.titulo} ({new Date().getFullYear()})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {cats.length > 0 ? cats.map(cat => (
                         <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '10px 15px', borderRadius: '6px', border: '1px solid #333' }}>
                           <span style={{ fontSize: '0.85rem', color: '#ccc', fontWeight: 'bold', textTransform: 'uppercase' }}>{cat}</span>
                           <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem' }}>
                             <span style={{ color: '#10b981' }}>GF: <strong>{golesPorCat[cat].favor}</strong></span>
                             <span style={{ color: '#ef4444' }}>GC: <strong>{golesPorCat[cat].contra}</strong></span>
                           </div>
                         </div>
                      )) : <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>Sin goles registrados.</div>}
                    </div>
                  </div>
                );
              }

              // --- WIDGET: PRÓXIMO PARTIDO ---
              if (config.id === 'w_proximo') {
                return (
                  <div key={config.id} className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '2px solid #10b981' }}>
                    <div className="stat-label" style={{ marginBottom: '15px', color: '#10b981' }}>{config.titulo}</div>
                    {proximoPartido ? (
                      <div style={{ background: '#111', padding: '20px', borderRadius: '6px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold' }}>📅 {proximoPartido.fecha?.split('-').reverse().join('/')}</span>
                          <span style={{ background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>{proximoPartido.competicion}</span>
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, textAlign: 'center', margin: '15px 0', color: '#fff' }}>vs {proximoPartido.rival?.toUpperCase()}</div>
                        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800 }}>📍 CONDICIÓN: {proximoPartido.condicion?.toUpperCase()}</div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px', background: '#111', borderRadius: '6px', border: '1px dashed #333' }}>No hay partidos programados.</div>
                    )}
                  </div>
                );
              }

              // --- WIDGET: ÚLTIMO PARTIDO ---
              if (config.id === 'w_ultimo') {
                return (
                  <div key={config.id} className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '2px solid var(--text-dim)' }}>
                    <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--text-dim)' }}>{config.titulo}</div>
                    {ultimoPartido ? (
                      <div style={{ background: '#111', padding: '20px', borderRadius: '6px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{ultimoPartido.fecha?.split('-').reverse().join('/')}</span>
                          <span style={{ background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>{ultimoPartido.competicion}</span>
                        </div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, textAlign: 'center', margin: '15px 0' }}>vs {ultimoPartido.rival?.toUpperCase()}</div>
                        <button onClick={() => navigate(`/resumen/${ultimoPartido.id}`)} className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>VER REPORTE DE PARTIDO</button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px', background: '#111', borderRadius: '6px', border: '1px dashed #333' }}>No hay partidos registrados aún.</div>
                    )}
                  </div>
                );
              }

              // --- WIDGET: ESTADO DE LA BASE ---
              if (config.id === 'w_stats_base') {
                return (
                  <div key={config.id} className="bento-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center', padding: '20px', background: '#111', borderRadius: '6px', border: '1px solid #333' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff' }}>{estadisticas.plantel}</div>
                      <div className="stat-label" style={{ fontSize: '0.65rem', marginTop: '5px' }}>JUGADORES ({categoriaActiva})</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '20px', background: '#111', borderRadius: '6px', border: '1px solid #333' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>{estadisticas.jugados}</div>
                      <div className="stat-label" style={{ fontSize: '0.65rem', marginTop: '5px' }}>PARTIDOS ({categoriaActiva})</div>
                    </div>
                  </div>
                );
              }

              // --- WIDGETS TIPO LINK (Accesos directos) ---
              if (config.tipo === 'link') {
                const bgSoft = config.color ? `rgba(${hexToRgb(config.color)}, 0.05)` : 'rgba(255,255,255,0.05)';
                return (
                  <div key={config.id} className="bento-card" style={{ textAlign: 'center', padding: '30px 20px', cursor: 'pointer', border: `1px solid ${config.color || '#333'}`, background: `linear-gradient(180deg, ${bgSoft} 0%, rgba(0,0,0,0) 100%)`, transition: 'transform 0.2s', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} onClick={() => navigate(config.ruta)}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>{config.icon}</div>
                    <div className="stat-label" style={{ color: config.color || '#fff', fontSize: '1rem' }}>{config.titulo}</div>
                    <p style={{ color: 'var(--text-dim)', marginTop: '8px', fontSize: '0.8rem', lineHeight: '1.4' }}>{config.desc}</p>
                  </div>
                );
              }
              return null;
            })}

          </div>
        </>
      )}
    </div>
  );
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255,255,255';
}