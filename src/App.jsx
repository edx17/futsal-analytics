import React, { useState, useEffect, useMemo } from 'react';
import { useEsMovil } from './utils/useEsMovil';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastProvider } from './components/ToastContext';

// --- Pages ---
import Landing from './pages/Landing';
import Inicio from './pages/Inicio';
import NuevoPartido from './pages/NuevoPartido';
import ContinuarPartido from './pages/ContinuarPartido';
import TomaDatos from './pages/TomaDatos';
import Resumen from './pages/Resumen';
import JugadorPerfil from './pages/JugadorPerfil';
import Temporada from './pages/Temporada';
import Configuracion from './pages/Configuracion';
import MiSuscripcion from './pages/MiSuscripcion';
import Rendimiento from './pages/Rendimiento';
import Login from './pages/Login';
import Registro from './pages/Registro';
import Plantel from './pages/Plantel';
import Torneos from './pages/Torneos';
import ScoutingRivales from './pages/ScoutingRivales';
import OrigenGoles from './pages/OrigenGoles'; 
import CreadorTareas from './pages/CreadorTareas';
import CreadorFisico from './pages/CreadorFisico';
import BancoTareas from './pages/BancoTareas';
import CargaWellness from './pages/CargaWellness';
import PlanificadorSemanal from './pages/PlanificadorSemanal';
import Presentismo from './pages/Presentismo';
import Tesoreria from './pages/Tesoreria';
import Sponsors from './pages/Sponsors';
import Usuarios from './pages/Usuarios';
import AdmSuscripciones from './pages/AdmSuscripciones';
import LibroTactico from './pages/LibroTactico';
import LoginKiosco from './pages/LoginKiosco';
import Novedades from './pages/Novedades';
import MiStaff from './pages/MiStaff'; 
import AceptarTerminos from './pages/AceptarTerminos';
import Disciplina from './pages/Disciplina';
import Transferencias from './pages/Transferencias';
import ResumenPlantel from './pages/Resumenplantel';
import Videoanalisis from './pages/Videoanalisis';

import './App.css';

// ==========================================
// 🌍 CATÁLOGO OPERATIVO DE ACCIONES RÁPIDAS
// Desde acá el sistema sabe qué opciones mutables existen en la app
// ==========================================
const CATALOGO_ACCIONES_FAB = [
  { id: 'nuevo-partido', label: 'Nuevo Partido', path: '/nuevo-partido', icon: '⚡', roles: ['superuser', 'manager', 'ct'] },
  { id: 'presentismo', label: 'Tomar Presentismo', path: '/presentismo', icon: '📅', roles: ['superuser', 'manager', 'ct'] },
  { id: 'wellness', label: 'Estado Wellness', path: '/wellness', icon: '🔋', roles: ['superuser', 'manager', 'ct', 'jugador'] },
  { id: 'microciclo', label: 'Planificador Semanal', path: '/microciclo', icon: '🗓️', roles: ['superuser', 'manager', 'ct'] },
  { id: 'torneos', label: 'Mis Torneos', path: '/torneos', icon: '🏆', roles: ['superuser', 'manager', 'admin'] },
  { id: 'rivales', label: 'Scouting Rivales', path: '/scouting-rivales', icon: '🕵️‍♂️', roles: ['superuser', 'manager', 'ct'] },
  { id: 'plantel', label: 'Gestionar Plantel', path: '/plantel', icon: '👥', roles: ['superuser', 'manager', 'admin', 'ct'] },
  { id: 'tesoreria', label: 'Caja de Tesorería', path: '/tesoreria', icon: '💰', roles: ['superuser', 'manager', 'admin'] },
  { id: 'transferencias', label: 'Transferencias', path: '/transferencias', icon: '💸', roles: ['superuser', 'manager', 'admin', 'ct'] },
];

// ==========================================
// ESTILOS ESTÁTICOS
// ==========================================
const navMobileStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', flex: 1, height: '100%', cursor: 'pointer', color: 'var(--text-dim)', textDecoration: 'none', fontWeight: 800, padding: '8px 0', transition: 'color 0.2s' };

const getSidebarLinkStyle = (isCollapsed) => ({
  padding: '12px 20px', 
  display: 'flex', 
  alignItems: 'center', 
  justifyContent: isCollapsed ? 'center' : 'flex-start', 
  gap: isCollapsed ? '0' : '15px', 
  textAlign: 'left',
  transition: 'all 0.3s ease'
});

const getSidebarGroupTitle = (isCollapsed) => ({ 
  padding: isCollapsed ? '20px 0 5px 0' : '20px 20px 5px 20px', 
  fontSize: '0.65rem', 
  color: 'var(--text-dim)', 
  fontWeight: 900, 
  letterSpacing: '1px', 
  cursor: 'pointer', 
  display: 'flex', 
  justifyContent: isCollapsed ? 'center' : 'space-between', 
  alignItems: 'center',
  textAlign: 'center'
});

const fabStyle = { position: 'absolute', top: '0px', left: '50%', transform: 'translateX(-50%)', width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)', color: '#000', border: 'none', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContext: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(0,255,136,0.3)', zIndex: 1002, transition: 'transform 0.2s' };

// ==========================================
// COMPONENTES DE ENRUTAMIENTO Y LAYOUT
// ==========================================

function AppRoutes() {
  return (
    <Routes>
      <Route path="/inicio" element={<ProtectedRoute><Inicio /></ProtectedRoute>} />
      <Route path="/nuevo-partido" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><NuevoPartido /></ProtectedRoute>} />
      <Route path="/continuar-partido" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><ContinuarPartido /></ProtectedRoute>} />
      <Route path="/presentismo" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><Presentismo /></ProtectedRoute>} />
      <Route path="/plantel" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin', 'ct']}><Plantel /></ProtectedRoute>} />
      <Route path="/transferencias" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin', 'ct']}><Transferencias /></ProtectedRoute>} />
      <Route path="/microciclo" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><PlanificadorSemanal /></ProtectedRoute>} />
      <Route path="/creador-tareas" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><CreadorTareas /></ProtectedRoute>} />
      <Route path="/creador-fisico" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><CreadorFisico /></ProtectedRoute>} />
      <Route path="/novedades" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin', 'ct']}><Novedades /></ProtectedRoute>} />
      <Route path="/videoanalisis" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin', 'ct']}><Videoanalisis /></ProtectedRoute>} />

      <Route path="/tesoreria" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><Tesoreria /></ProtectedRoute>} />
      <Route path="/sponsors" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><Sponsors /></ProtectedRoute>} />
      <Route path="/configuracion" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><Configuracion /></ProtectedRoute>} /> 
      <Route path="/mi-suscripcion" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><MiSuscripcion /></ProtectedRoute>} />
      <Route path="/mi-staff" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><MiStaff /></ProtectedRoute>} />
      
      <Route path="/usuarios" element={<ProtectedRoute allowedRoles={['superuser']}><Usuarios /></ProtectedRoute>} />
      <Route path="/admin/suscripciones" element={<ProtectedRoute allowedRoles={['superuser']}><AdmSuscripciones /></ProtectedRoute>} />
      
      <Route path="/plantel-resumen" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin', 'ct']}><ResumenPlantel /></ProtectedRoute>} />
      <Route path="/temporada" element={<ProtectedRoute><Temporada /></ProtectedRoute>} />
      <Route path="/resumen" element={<ProtectedRoute><Resumen /></ProtectedRoute>} />
      <Route path="/resumen/:id" element={<ProtectedRoute><Resumen /></ProtectedRoute>} />
      <Route path="/torneos" element={<ProtectedRoute><Torneos /></ProtectedRoute>} />
      <Route path="/scouting-rivales" element={<ProtectedRoute><ScoutingRivales /></ProtectedRoute>} />
      
      <Route path="/jugador" element={<ProtectedRoute><JugadorPerfil /></ProtectedRoute>} />
      <Route path="/jugador-perfil" element={<ProtectedRoute><JugadorPerfil /></ProtectedRoute>} />
      <Route path="/perfil-jugador" element={<ProtectedRoute><JugadorPerfil /></ProtectedRoute>} />
      
      <Route path="/rendimiento" element={<ProtectedRoute><Rendimiento /></ProtectedRoute>} />
      <Route path="/origen-goles" element={<ProtectedRoute><OrigenGoles /></ProtectedRoute>} />
      <Route path="/disciplina" element={<ProtectedRoute><Disciplina /></ProtectedRoute>} />
      <Route path="/wellness" element={<ProtectedRoute><CargaWellness /></ProtectedRoute>} />
      <Route path="/banco-tareas" element={<ProtectedRoute><BancoTareas /></ProtectedRoute>} /> 
      <Route path="/libro-tactico" element={<ProtectedRoute><LibroTactico /></ProtectedRoute>} />
      <Route path="/aceptar-terminos" element={<ProtectedRoute><AceptarTerminos /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/inicio" replace />} />
    </Routes>
  );
}

function AppLayout() {
  const { perfil, logout, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const esMovil = useEsMovil();
  const [sidebarAbierta, setSidebarAbierta] = useState(true);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [fabAbierto, setFabAbierto] = useState(false);
  
  // Estado para controlar el modo edición de los atajos desde el celular
  const [modoEdicionFab, setModoEdicionFab] = useState(false);

  const [menusAbiertos, setMenusAbiertos] = useState({
    operaciones: true,
    competicion: false,
    analisis: false,
    planificacion: false,
    plantel: false,
    administracion: false,
    sistema: false
  });

// Minimiza la barra lateral al entrar al dashboard, para que el resumen luzca mejor.
useEffect(() => {
  if (!esMovil && location.pathname === '/inicio') setSidebarAbierta(false);
}, [location.pathname, esMovil]);

  useEffect(() => {
    if (esMovil) {
      setDrawerAbierto(false);
      setFabAbierto(false);
      setModoEdicionFab(false);
    }
  }, [location.pathname, esMovil]);

  const permisos = useMemo(() => {
    const rol = (perfil?.rol || '').toLowerCase();
    return {
      rolActual: rol,
      esSuperUser: rol === 'superuser',
      esJugador: rol === 'jugador',
      puedeEscribirDeportivo: ['superuser', 'manager', 'ct'].includes(rol),
      puedeVerDeportivo: ['superuser', 'manager', 'admin', 'ct', 'jugador'].includes(rol),
      puedeControlarAdmin: ['superuser', 'manager', 'admin'].includes(rol),
      puedeConfigurar: ['superuser', 'manager', 'admin'].includes(rol),
    };
  }, [perfil]);

  // 1. Obtener todas las acciones que este rol tiene permitido usar del catálogo global
  const accionesPermitidasDelCatalogo = useMemo(() => {
    return CATALOGO_ACCIONES_FAB.filter(acc => acc.roles.includes(permisos.rolActual));
  }, [permisos.rolActual]);

  // 2. Cargar del localStorage las acciones específicas que el usuario eligió mostrar
  const [misAccionesIds, setMisAccionesIds] = useState([]);

  useEffect(() => {
    if (perfil?.id) {
      const guardado = localStorage.getItem(`acciones_fab_${perfil.id}`);
      if (guardado) {
        setMisAccionesIds(JSON.parse(guardado));
      } else {
        // Configuraciones iniciales por defecto si no guardó nada todavía
        const iniciales = permisos.esJugador 
          ? ['wellness'] 
          : ['nuevo-partido', 'presentismo', 'wellness'];
        setMisAccionesIds(iniciales);
      }
    }
  }, [perfil, permisos.esJugador]);

  // 3. Cruzar los datos para obtener los objetos completos de las acciones activas
  const accionesActivasUsuario = useMemo(() => {
    return accionesPermitidasDelCatalogo.filter(acc => misAccionesIds.includes(acc.id));
  }, [accionesPermitidasDelCatalogo, misAccionesIds]);

  // 4. Función operativa para guardar o sacar atajos con un toque
  const toggleAccionFab = (id) => {
    setMisAccionesIds(prev => {
      const nuevo = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(`acciones_fab_${perfil.id}`, JSON.stringify(nuevo));
      return nuevo;
    });
  };

  if (loading) return null;

  const isLanding = location.pathname === '/'; 
  const isLogin = location.pathname === '/login';
  const isRegistro = location.pathname === '/registro'; 
  const isTomaDatos = location.pathname === '/toma-datos'; 
  const isKioscoAuth = location.pathname === '/kiosco';
  const isKioscoPath = location.pathname.startsWith('/kiosco/');
  const isSuscripcionPath = location.pathname === '/mi-suscripcion'; 
  const isAceptarTerminosPath = location.pathname === '/aceptar-terminos';

  const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
  const club = perfil?.clubes;
  const isVencido = club?.fecha_vencimiento ? new Date(club.fecha_vencimiento) < new Date() : false;

  if (perfil && !permisos.esSuperUser && club && (club.suscripcion_activa === false || isVencido) && !isSuscripcionPath) {
    return <Navigate to="/mi-suscripcion" replace />;
  }

  if (perfil && perfil.terminos_aceptados === false && !isAceptarTerminosPath && !isLanding && !isLogin && !isRegistro && !isKioscoMode && !isKioscoAuth) {
    return <Navigate to="/aceptar-terminos" replace />;
  }

  if (isLanding || isLogin || isRegistro || isTomaDatos || isKioscoAuth) {
    return (
      <main className="app-content-fullscreen">
        <Routes>
          <Route path="/" element={perfil ? <Navigate to="/inicio" replace /> : <Landing />} />
          <Route path="/login" element={perfil ? <Navigate to="/inicio" replace /> : <Login />} />
          <Route path="/registro" element={perfil ? <Navigate to="/inicio" replace /> : <Registro />} />
          <Route path="/kiosco" element={<LoginKiosco />} />
          <Route path="/toma-datos" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><TomaDatos /></ProtectedRoute>} />
        </Routes>
      </main>
    );
  }

  if (isKioscoMode && !isKioscoPath) return <Navigate to="/kiosco/home" replace />;
  if (isKioscoMode && isKioscoPath) {
    return (
      <main className="app-content-fullscreen">
        <Routes>
          <Route path="/kiosco/home" element={<Inicio />} />
          <Route path="/kiosco/wellness" element={<CargaWellness />} />
          <Route path="/kiosco/rendimiento" element={<Rendimiento />} />
          <Route path="/kiosco/resumen" element={<Resumen />} />
          <Route path="/kiosco/resumen/:id" element={<Resumen />} />
          <Route path="/kiosco/temporada" element={<Temporada />} />
          <Route path="/kiosco/jugador-perfil" element={<JugadorPerfil />} />
          <Route path="/kiosco/perfil-jugador" element={<JugadorPerfil />} />
          <Route path="/kiosco/libro-tactico" element={<LibroTactico />} />
          <Route path="/kiosco/*" element={<Navigate to="/kiosco/home" replace />} />
        </Routes>
      </main>
    );
  }

  const toggleMenu = (seccion) => {
    if (!sidebarAbierta && !esMovil) {
      setSidebarAbierta(true);
    }
    setMenusAbiertos(prev => ({ ...prev, [seccion]: !prev[seccion] }));
  };

  const renderNavLinks = (isCollapsed = false) => {
    const linkStyle = getSidebarLinkStyle(isCollapsed);
    const titleStyle = getSidebarGroupTitle(isCollapsed);

    return (
      <>
        <NavLink to="/inicio" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle} title={isCollapsed ? "Inicio" : ""}>
          <span style={{ fontSize: '1.2rem' }}>🏠</span> {!isCollapsed && <span>{permisos.esJugador ? 'MI INICIO' : 'CENTRO DE MANDO'}</span>}
        </NavLink>

        {permisos.puedeEscribirDeportivo && (
          <>
            <div style={titleStyle} onClick={() => toggleMenu('operaciones')} title={isCollapsed ? "Operaciones" : ""}>
              {isCollapsed ? <span style={{ fontSize: '1.2rem' }}>⚙️</span> : <><span>OPERACIONES</span> <span>{menusAbiertos.operaciones ? '▼' : '▶'}</span></>}
            </div>
            {menusAbiertos.operaciones && !isCollapsed && (
              <>
                <NavLink to="/nuevo-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>⚡ <span>NUEVO PARTIDO</span></NavLink>
                <NavLink to="/continuar-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>⏯️ <span>CONTINUAR PARTIDO</span></NavLink>
              </>
            )}
          </>
        )}

        {!permisos.esJugador && permisos.puedeVerDeportivo && (
          <>
            <div style={titleStyle} onClick={() => toggleMenu('competicion')} title={isCollapsed ? "Competición" : ""}>
              {isCollapsed ? <span style={{ fontSize: '1.2rem' }}>🏆</span> : <><span>COMPETICIÓN</span> <span>{menusAbiertos.competicion ? '▼' : '▶'}</span></>}
            </div>
            {menusAbiertos.competicion && !isCollapsed && (
              <>
                <NavLink to="/torneos" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🏆 <span>MIS TORNEOS</span></NavLink>
                <NavLink to="/scouting-rivales" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🕵️‍♂️ <span>RIVALES</span></NavLink>
              </>
            )}
          </>
        )}

        {permisos.puedeVerDeportivo && (
          <>
            <div style={titleStyle} onClick={() => toggleMenu('analisis')} title={isCollapsed ? "Análisis" : ""}>
               {isCollapsed ? <span style={{ fontSize: '1.2rem' }}>📊</span> : <><span>ANÁLISIS</span> <span>{menusAbiertos.analisis ? '▼' : '▶'}</span></>}
            </div>
            {menusAbiertos.analisis && !isCollapsed && (
              <>
                {!permisos.esJugador && <NavLink to="/temporada" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>📈 <span>RESUMEN TEMPORADA</span></NavLink>}
                <NavLink to="/resumen" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>📊 <span>RESUMEN POR PARTIDO</span></NavLink>
                <NavLink to="/jugador" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>👁️ <span>{permisos.esJugador ? 'MI PERFIL' : 'RESUMEN POR JUGADOR'}</span></NavLink>
                {!permisos.esJugador && <NavLink to="/origen-goles" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>⚽ <span>ORIGEN DE GOLES</span></NavLink>}
                {!permisos.esJugador && <NavLink to="/disciplina" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🟨 <span>DISCIPLINA</span></NavLink>}
              </>
            )}
          </>
        )}

        {permisos.puedeVerDeportivo && !permisos.esJugador && (
          <>
            <div style={titleStyle} onClick={() => toggleMenu('planificacion')} title={isCollapsed ? "Planificación" : ""}>
               {isCollapsed ? <span style={{ fontSize: '1.2rem' }}>🗓️</span> : <><span>PLANIFICACIÓN</span> <span>{menusAbiertos.planificacion ? '▼' : '▶'}</span></>}
            </div>
            {menusAbiertos.planificacion && !isCollapsed && (
              <>
                {permisos.puedeEscribirDeportivo && (
                  <>
                    <NavLink to="/microciclo" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🗓️ <span>MICROCICLO</span></NavLink>
                    <NavLink to="/creador-tareas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🎨 <span>CREADOR TÁCTICO</span></NavLink>
                    <NavLink to="/creador-fisico" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🏋️‍♂️ <span>CREADOR FÍSICO</span></NavLink>
                  </>
                )}
                <NavLink to="/banco-tareas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🗃️ <span>BANCO DE TAREAS</span></NavLink>
                <NavLink to="/libro-tactico" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>📘 <span>LIBRO TÁCTICO</span></NavLink>
                <NavLink to="/videoanalisis" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🎬 <span>VIDEOANÁLISIS</span></NavLink>
              </>
            )}
          </>
        )}

        {permisos.puedeVerDeportivo && (
          <>
            <div style={titleStyle} onClick={() => toggleMenu('plantel')} title={isCollapsed ? "Plantel" : ""}>
               {isCollapsed ? <span style={{ fontSize: '1.2rem' }}>👥</span> : <><span>PLANTEL</span> <span>{menusAbiertos.plantel ? '▼' : '▶'}</span></>}
            </div>
            {menusAbiertos.plantel && !isCollapsed && (
              <>
                {!permisos.esJugador && <NavLink to="/plantel" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>👤 <span>MI PLANTEL</span></NavLink>}
                {!permisos.esJugador && <NavLink to="/plantel-resumen" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>📋 <span>RESUMEN PLANTEL</span></NavLink>}
                {!permisos.esJugador && <NavLink to="/transferencias" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>💸 <span>TRANSFERENCIAS</span></NavLink>}
                {permisos.puedeEscribirDeportivo && <NavLink to="/presentismo" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>📅 <span>PRESENTISMO</span></NavLink>}
                <NavLink to="/wellness" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🌡️ <span>WELLNESS</span></NavLink>
                <NavLink to="/rendimiento" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🏃‍♂️ <span>FISIOLOGÍA</span></NavLink>
                <NavLink to="/novedades" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>📢 <span>NOVEDADES</span></NavLink>
              </>
            )}
          </>
        )}

        {!permisos.esJugador && permisos.puedeControlarAdmin && (
          <>
            <div style={titleStyle} onClick={() => toggleMenu('administracion')} title={isCollapsed ? "Administración" : ""}>
               {isCollapsed ? <span style={{ fontSize: '1.2rem' }}>💰</span> : <><span>ADMINISTRACIÓN</span> <span>{menusAbiertos.administracion ? '▼' : '▶'}</span></>}
            </div>
            {menusAbiertos.administracion && !isCollapsed && (
              <>
                <NavLink to="/mi-staff" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>👥 <span>MI STAFF</span></NavLink>
                <NavLink to="/tesoreria" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>💰 <span>TESORERÍA</span></NavLink>
                <NavLink to="/sponsors" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>🤝 <span>SPONSORS</span></NavLink>
                {permisos.puedeConfigurar && (
                  <>
                    <NavLink to="/mi-suscripcion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>💳 <span>MI SUSCRIPCIÓN</span></NavLink>
                    <NavLink to="/configuracion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>⚙️ <span>CONFIG. DE CLUB</span></NavLink>
                  </>
                )}
              </>
            )}
          </>
        )}

        {permisos.esSuperUser && (
          <>
            <div style={titleStyle} onClick={() => toggleMenu('sistema')} title={isCollapsed ? "Sistema" : ""}>
               {isCollapsed ? <span style={{ fontSize: '1.2rem' }}>👑</span> : <><span>SISTEMA</span> <span>{menusAbiertos.sistema ? '▼' : '▶'}</span></>}
            </div>
            {menusAbiertos.sistema && !isCollapsed && (
              <>
                <NavLink to="/usuarios" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>👑 <span>GESTIÓN MASTER</span></NavLink>
                <NavLink to="/admin/suscripciones" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={linkStyle}>💳 <span>SUSCRIPCIONES</span></NavLink>
              </>
            )}
          </>
        )}

        <button 
          onClick={logout} 
          className="nav-item" 
          title={isCollapsed ? "Cerrar Sesión" : ""}
          style={{ 
            marginTop: 'auto', 
            background: 'transparent', 
            color: '#ef4444', 
            borderTop: '1px solid var(--border)', 
            borderBottom: 'none',
            borderRight: 'none',
            borderLeft: 'none',
            textAlign: 'left', 
            cursor: 'pointer', 
            padding: isCollapsed ? '20px 0' : '20px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: isCollapsed ? 'center' : 'flex-start', 
            gap: isCollapsed ? '0' : '15px' 
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🚪</span> {!isCollapsed && <span style={{fontWeight: 'bold'}}>CERRAR SESIÓN</span>}
        </button>
      </>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      
      {/* DESKTOP SIDEBAR */}
      {!esMovil && (
        <aside style={{ width: sidebarAbierta ? '250px' : '70px', backgroundColor: 'var(--panel)', borderRight: '1px solid var(--border)', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 10 }}>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: sidebarAbierta ? 'space-between' : 'center', borderBottom: '1px solid var(--border)' }}>
            {sidebarAbierta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <img src="/favicon-32x32.png" alt="VS" style={{ height: '26px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none' }} />
                <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '1px', color: 'var(--text)' }}>VIRTUAL<span style={{ color: 'var(--accent)' }}>.CLUB</span></div>
              </div>
            )}
            <button onClick={() => setSidebarAbierta(!sidebarAbierta)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}>
              {sidebarAbierta ? '◀' : '▶'}
            </button>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', padding: '10px 0 0 0', gap: '2px', overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
             {renderNavLinks(!sidebarAbierta)}
          </nav>
        </aside>
      )}

      {/* ÁREA PRINCIPAL DE CONTENIDO */}
      <main style={{ flex: 1, overflowY: 'auto', padding: esMovil ? '0px 0px 85px 0px' : '40px', position: 'relative' }}>
        <div style={{ padding: esMovil ? '20px 15px' : '0' }}>
          <AppRoutes />
        </div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      {esMovil && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: 'var(--panel)', borderTop: '1px solid var(--border)', display: 'flex', zIndex: 1000, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <NavLink to="/inicio" style={({isActive}) => ({...navMobileStyle, color: isActive ? 'var(--accent)' : 'var(--text-dim)'})}>
            <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>🏠</span>
            <span style={{fontSize: '0.65rem'}}>Inicio</span>
          </NavLink>
          
          {permisos.puedeVerDeportivo && !permisos.esJugador && (
            <NavLink to="/microciclo" style={({isActive}) => ({...navMobileStyle, color: isActive ? 'var(--accent)' : 'var(--text-dim)'})}>
              <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>🗓️</span>
              <span style={{fontSize: '0.65rem'}}>Hoy</span>
            </NavLink>
          )}

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', position: 'relative' }}>
             <button 
               onClick={() => { setFabAbierto(!fabAbierto); setDrawerAbierto(false); setModoEdicionFab(false); }}
               style={fabStyle}
             >
               {fabAbierto ? '×' : '+'}
             </button>
          </div>

          <NavLink to="/resumen" style={({isActive}) => ({...navMobileStyle, color: isActive ? 'var(--accent)' : 'var(--text-dim)'})}>
            <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>📊</span>
            <span style={{fontSize: '0.65rem'}}>Stats</span>
          </NavLink>

          <div onClick={() => { setDrawerAbierto(true); setFabAbierto(false); }} style={{...navMobileStyle, color: drawerAbierto ? 'var(--accent)' : 'var(--text-dim)'}}>
            <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>☰</span>
            <span style={{fontSize: '0.65rem'}}>Menú</span>
          </div>
        </nav>
      )}

      {/* MOBILE FAB ACCIONES RÁPIDAS WITH BACKDROP BLUR & DESIRED DESIGN */}
      {esMovil && fabAbierto && (
        <>
          <div 
            onClick={() => { setFabAbierto(false); setModoEdicionFab(false); }} 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(0,0,0,0.7)', 
              backdropFilter: 'blur(6px)', 
              WebkitBackdropFilter: 'blur(6px)', 
              zIndex: 1000 
            }} 
          />
          <div style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 1001, width: '240px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s' }}>
            
            {/* INTERFAZ EN MODO VISTA NORMAL */}
            {!modoEdicionFab ? (
              <>
                <div style={{fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center', fontWeight: 'bold', marginBottom: '5px'}}>ACCIONES RÁPIDAS</div>
                
                {accionesActivasUsuario.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center', padding: '10px' }}>No tenés atajos activos.</div>
                ) : (
                  accionesActivasUsuario.map((acc) => (
                    <button 
                      key={acc.id} 
                      onClick={() => { navigate(acc.path); setFabAbierto(false); }} 
                      style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold', display: 'flex', gap: '10px', alignItems: 'center' }}
                    >
                      <span>{acc.icon}</span> {acc.label}
                    </button>
                  ))
                )}
                
                <button 
                  onClick={() => setModoEdicionFab(true)}
                  style={{ background: 'transparent', color: 'var(--accent)', border: '1px dashed var(--accent)', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.75rem', marginTop: '5px', cursor: 'pointer' }}
                >
                  ⚙️ Personalizar Atajos
                </button>
              </>
            ) : (
              /* INTERFAZ DINÁMICA EN MODO EDICIÓN */
              <>
                <div style={{fontSize: '0.7rem', color: 'var(--accent)', textAlign: 'center', fontWeight: 'bold', marginBottom: '5px'}}>SELECCIONÁ TUS ATAJOS</div>
                
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }} className="custom-scroll">
                  {accionesPermitidasDelCatalogo.map((acc) => {
                    const isActive = misAccionesIds.includes(acc.id);
                    return (
                      <div 
                        key={acc.id}
                        onClick={() => toggleAccionFab(acc.id)}
                        style={{ background: isActive ? 'rgba(0, 255, 136, 0.05)' : 'var(--bg)', color: isActive ? 'var(--text)' : 'var(--text-dim)', border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, padding: '10px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span>{acc.icon}</span> <span>{acc.label}</span>
                        </div>
                        <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-dim)', fontSize: '0.9rem' }}>
                          {isActive ? '●' : '○'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button 
                  onClick={() => setModoEdicionFab(false)}
                  style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '900', fontSize: '0.75rem', marginTop: '5px', cursor: 'pointer' }}
                >
                  ✅ Listo, Guardar
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* MOBILE DRAWER LATERAL */}
      {esMovil && (
        <>
          {drawerAbierto && <div onClick={() => setDrawerAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1005, animation: 'fadeIn 0.3s' }} />}
          
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: '70px', width: '80%', maxWidth: '300px',
            background: 'var(--panel)', borderLeft: '1px solid var(--border)', zIndex: 1010,
            transform: drawerAbierto ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
            paddingBottom: 'env(safe-area-inset-bottom)'
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 900, color: 'var(--accent)', letterSpacing: '1px' }}>VIRTUAL.CLUB</span>
              <button onClick={() => setDrawerAbierto(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: '1.5rem', padding: 0 }}>×</button>
            </div>
            <nav style={{ flex: 1, paddingBottom: '20px', display: 'flex', flexDirection: 'column' }}>
              {renderNavLinks(false)}
            </nav>
          </div>
        </>
      )}

    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <AppLayout />
          </Router>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;