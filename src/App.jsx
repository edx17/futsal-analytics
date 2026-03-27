import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import { ToastProvider } from './components/ToastContext';

// PANTALLAS ORIGINALES
import Landing from './pages/Landing'; // <-- NUEVO IMPORT DEL LANDING
import Inicio from './pages/Inicio';
import NuevoPartido from './pages/NuevoPartido';
import ContinuarPartido from './pages/ContinuarPartido';
import TomaDatos from './pages/TomaDatos';
import Resumen from './pages/Resumen';
import JugadorPerfil from './pages/JugadorPerfil';
import Temporada from './pages/Temporada';
import Configuracion from './pages/Configuracion';
import Rendimiento from './pages/Rendimiento';
import Login from './pages/Login';
import Plantel from './pages/Plantel';
import Torneos from './pages/Torneos';
import ScoutingRivales from './pages/ScoutingRivales';
import OrigenGoles from './pages/OrigenGoles'; 
import CreadorTareas from './pages/CreadorTareas';
import BancoTareas from './pages/BancoTareas';
import CargaWellness from './pages/CargaWellness';
import PlanificadorSemanal from './pages/PlanificadorSemanal';

// NUEVAS PANTALLAS
import Presentismo from './pages/Presentismo';
import Tesoreria from './pages/Tesoreria';
import Sponsors from './pages/Sponsors';
import Usuarios from './pages/Usuarios';
import LibroTactico from './pages/LibroTactico';
import LoginKiosco from './pages/LoginKiosco';

import './App.css';

const navMobileStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%', cursor: 'pointer', color: 'var(--text-dim)', textDecoration: 'none', fontWeight: 800 };
const sidebarLinkStyle = { padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '15px', textAlign: 'left' };
const sidebarGroupTitle = { padding: '20px 20px 5px 20px', fontSize: '0.65rem', color: '#888', fontWeight: 900, letterSpacing: '1px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };

function AppLayout() {
  const { perfil, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const isLanding = location.pathname === '/'; // <-- DETECTAMOS SI ESTÁ EN LA RAÍZ
  const isLogin = location.pathname === '/login';
  const isTomaDatos = location.pathname === '/toma-datos'; 
  const isKioscoAuth = location.pathname === '/kiosco';
  const isKioscoPath = location.pathname.startsWith('/kiosco/');

  const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
  const rol = (perfil?.rol || '').toLowerCase();

  const esSuperUser = rol === 'superuser';
  const esAdmin = rol === 'admin';
  const esCT = rol === 'ct';
  const esJugador = rol === 'jugador';

  const puedeEscribirDeportivo = esSuperUser || esCT;
  const puedeVerDeportivo = esSuperUser || esAdmin || esCT || esJugador;
  const puedeControlarAdmin = esSuperUser || esAdmin;
  const puedeConfigurar = esSuperUser || esAdmin;

  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  const [sidebarAbierta, setSidebarAbierta] = useState(true);

  const [menusAbiertos, setMenusAbiertos] = useState({
    operaciones: true,
    competicion: false,
    analisis: false,
    planificacion: false,
    gestion: false,
    sistema: false
  });

  const toggleMenu = (seccion) => {
    setMenusAbiertos(prev => ({ ...prev, [seccion]: !prev[seccion] }));
  };

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // <-- ACTUALIZADO: Agregamos isLanding para que no muestre el menú lateral en la Landing Page
  if (isLanding || isLogin || isTomaDatos || isKioscoAuth) {
    return (
      <main className="app-content-fullscreen">
        <Routes>
          {/* Si está logueado y entra a "/", lo mandamos a "/inicio". Si no, ve la Landing. */}
          <Route path="/" element={perfil ? <Navigate to="/inicio" replace /> : <Landing />} />
          
          {/* Si está logueado y entra a "/login", lo mandamos a "/inicio". */}
          <Route path="/login" element={perfil ? <Navigate to="/inicio" replace /> : <Login />} />
          
          <Route path="/kiosco" element={<LoginKiosco />} />
          <Route path="/toma-datos" element={<ProtectedRoute allowedRoles={['superuser', 'ct']}><TomaDatos /></ProtectedRoute>} />
        </Routes>
      </main>
    );
  }

  // Si está en el Kiosco logueado y va a la raíz, lo mandamos a su home.
  if (isKioscoMode && !isKioscoPath) {
    return <Navigate to="/kiosco/home" replace />;
  }

  // Rutas exclusivas del Kiosco (Ya protegidas por AuthContext)
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

  // Layout estándar de Staff
  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      {!esMovil && (
        <aside style={{ width: sidebarAbierta ? '250px' : '70px', backgroundColor: 'var(--panel)', borderRight: '1px solid var(--border)', transition: 'width 0.3s ease', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 10 }}>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: sidebarAbierta ? 'space-between' : 'center', borderBottom: '1px solid var(--border)' }}>
            {sidebarAbierta && <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '1px' }}>VIRTUAL<span style={{ color: 'var(--accent)' }}>.STATS</span></div>}
            <button onClick={() => setSidebarAbierta(!sidebarAbierta)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>{sidebarAbierta ? '◀' : '▶'}</button>
          </div>
          
          <nav style={{ display: 'flex', flexDirection: 'column', padding: '10px 0 20px 0', gap: '2px', overflowY: 'auto' }}>
            
            {/* --- OPERACIONES --- */}
            {puedeVerDeportivo && (
              <>
                {sidebarAbierta && (
                  <div style={sidebarGroupTitle} onClick={() => toggleMenu('operaciones')}>
                    <span>OPERACIONES</span> <span>{menusAbiertos.operaciones ? '▼' : '▶'}</span>
                  </div>
                )}
                {(menusAbiertos.operaciones || !sidebarAbierta) && (
                  <>
                    {/* <-- ACTUALIZADO: Apunta a /inicio en lugar de / --> */}
                    <NavLink to="/inicio" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🏠 {sidebarAbierta && <span>{esJugador ? 'MI INICIO' : 'CENTRO DE MANDO'}</span>}</NavLink>
                    {puedeEscribirDeportivo && (
                      <>
                        <NavLink to="/nuevo-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⚡ {sidebarAbierta && <span>NUEVO PARTIDO</span>}</NavLink>
                        <NavLink to="/continuar-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⏯️ {sidebarAbierta && <span>CONTINUAR PARTIDO</span>}</NavLink>
                        <NavLink to="/presentismo" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📅 {sidebarAbierta && <span>PRESENTISMO</span>}</NavLink>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* --- COMPETICIÓN (Solo Staff) --- */}
            {!esJugador && puedeVerDeportivo && (
              <>
                {sidebarAbierta && (
                  <div style={sidebarGroupTitle} onClick={() => toggleMenu('competicion')}>
                    <span>COMPETICIÓN</span> <span>{menusAbiertos.competicion ? '▼' : '▶'}</span>
                  </div>
                )}
                {(menusAbiertos.competicion || !sidebarAbierta) && (
                  <>
                    <NavLink to="/torneos" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🏆 {sidebarAbierta && <span>MIS TORNEOS</span>}</NavLink>
                    <NavLink to="/scouting-rivales" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🕵️‍♂️ {sidebarAbierta && <span>RIVALES (SCOUTING)</span>}</NavLink>
                  </>
                )}
              </>
            )}

            {/* --- ANÁLISIS --- */}
            {puedeVerDeportivo && (
              <>
                {sidebarAbierta && (
                  <div style={sidebarGroupTitle} onClick={() => toggleMenu('analisis')}>
                    <span>ANÁLISIS</span> <span>{menusAbiertos.analisis ? '▼' : '▶'}</span>
                  </div>
                )}
                {(menusAbiertos.analisis || !sidebarAbierta) && (
                  <>
                    {!esJugador && <NavLink to="/temporada" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📈 {sidebarAbierta && <span>TEMPORADA GLOBAL</span>}</NavLink>}
                    <NavLink to="/resumen" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📊 {sidebarAbierta && <span>{esJugador ? 'MIS PARTIDOS' : 'PARTIDO MATCH'}</span>}</NavLink>
                    <NavLink to="/perfil-jugador" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>👁️ {sidebarAbierta && <span>{esJugador ? 'MI RENDIMIENTO' : 'SCOUTING PROPIO'}</span>}</NavLink>
                    <NavLink to="/rendimiento" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🏃‍♂️ {sidebarAbierta && <span>FISIOLOGÍA</span>}</NavLink>
                    <NavLink to="/wellness" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🌡️ {sidebarAbierta && <span>{esJugador ? 'CARGAR WELLNESS' : 'CONTROL WELLNESS'}</span>}</NavLink>
                    {!esJugador && <NavLink to="/origen-goles" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⚽ {sidebarAbierta && <span>ORIGEN DE GOLES</span>}</NavLink>}
                  </>
                )}
              </>
            )}

            {/* --- PLANIFICACIÓN --- */}
            {puedeVerDeportivo && (
              <>
                {sidebarAbierta && (
                  <div style={sidebarGroupTitle} onClick={() => toggleMenu('planificacion')}>
                    <span>PLANIFICACIÓN</span> <span>{menusAbiertos.planificacion ? '▼' : '▶'}</span>
                  </div>
                )}
                {(menusAbiertos.planificacion || !sidebarAbierta) && (
                  <>
                    {puedeEscribirDeportivo && (
                      <>
                        <NavLink to="/microciclo" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🗓️ {sidebarAbierta && <span>MICROCICLO SEMANAL</span>}</NavLink>
                        <NavLink to="/creador-tareas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🎨 {sidebarAbierta && <span>CREADOR TÁCTICO</span>}</NavLink>
                      </>
                    )}
                    <NavLink to="/banco-tareas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🗃️ {sidebarAbierta && <span>BANCO DE TAREAS</span>}</NavLink>
                    <NavLink to="/libro-tactico" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📘 {sidebarAbierta && <span>LIBRO TÁCTICO</span>}</NavLink>
                  </>
                )}
              </>
            )}

            {/* --- GESTIÓN (Solo Staff) --- */}
            {!esJugador && (puedeControlarAdmin || puedeEscribirDeportivo) && (
              <>
                {sidebarAbierta && (
                  <div style={sidebarGroupTitle} onClick={() => toggleMenu('gestion')}>
                    <span>GESTIÓN</span> <span>{menusAbiertos.gestion ? '▼' : '▶'}</span>
                  </div>
                )}
                {(menusAbiertos.gestion || !sidebarAbierta) && (
                  <>
                    <NavLink to="/plantel" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>👤 {sidebarAbierta && <span>MI PLANTEL</span>}</NavLink>
                    {puedeControlarAdmin && (
                      <>
                        <NavLink to="/tesoreria" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>💰 {sidebarAbierta && <span>TESORERÍA</span>}</NavLink>
                        <NavLink to="/sponsors" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🤝 {sidebarAbierta && <span>SPONSORS</span>}</NavLink>
                      </>
                    )}
                    {puedeConfigurar && (
                      <NavLink to="/configuracion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⚙️ {sidebarAbierta && <span>CONFIG. CLUB</span>}</NavLink>
                    )}
                  </>
                )}
              </>
            )}

            {/* --- SISTEMA (Solo SuperUser) --- */}
            {esSuperUser && (
              <>
                {sidebarAbierta && (
                  <div style={sidebarGroupTitle} onClick={() => toggleMenu('sistema')}>
                    <span>SISTEMA</span> <span>{menusAbiertos.sistema ? '▼' : '▶'}</span>
                  </div>
                )}
                {(menusAbiertos.sistema || !sidebarAbierta) && (
                  <NavLink to="/usuarios" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>👑 {sidebarAbierta && <span>GESTIÓN MASTER</span>}</NavLink>
                )}
              </>
            )}

            <button onClick={logout} className="nav-item" style={{ marginTop: '20px', background: 'transparent', color: '#ef4444', borderTop: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '15px' }}>
              🚪 {sidebarAbierta && <span style={{fontWeight: 'bold'}}>CERRAR SESIÓN</span>}
            </button>
          </nav>
        </aside>
      )}

      <main style={{ flex: 1, overflowY: 'auto', padding: esMovil ? '20px 15px' : '40px', paddingBottom: esMovil ? '90px' : '40px' }}>
        <Routes>
          {/* <-- ACTUALIZADO: El dashboard ahora vive en /inicio --> */}
          <Route path="/inicio" element={<ProtectedRoute><Inicio /></ProtectedRoute>} />
          
          {/* DEPORTIVO */}
          <Route path="/nuevo-partido" element={<ProtectedRoute allowedRoles={['superuser', 'ct']}><NuevoPartido /></ProtectedRoute>} />
          <Route path="/continuar-partido" element={<ProtectedRoute allowedRoles={['superuser', 'ct']}><ContinuarPartido /></ProtectedRoute>} />
          <Route path="/presentismo" element={<ProtectedRoute allowedRoles={['superuser', 'ct']}><Presentismo /></ProtectedRoute>} />
          <Route path="/plantel" element={<ProtectedRoute allowedRoles={['superuser', 'admin', 'ct']}><Plantel /></ProtectedRoute>} />
          <Route path="/microciclo" element={<ProtectedRoute allowedRoles={['superuser', 'ct']}><PlanificadorSemanal /></ProtectedRoute>} />
          <Route path="/creador-tareas" element={<ProtectedRoute allowedRoles={['superuser', 'ct']}><CreadorTareas /></ProtectedRoute>} />
          
          {/* ADMINISTRATIVO */}
          <Route path="/tesoreria" element={<ProtectedRoute allowedRoles={['superuser', 'admin']}><Tesoreria /></ProtectedRoute>} />
          <Route path="/sponsors" element={<ProtectedRoute allowedRoles={['superuser', 'admin']}><Sponsors /></ProtectedRoute>} />
          <Route path="/configuracion" element={<ProtectedRoute allowedRoles={['superuser', 'admin']}><Configuracion /></ProtectedRoute>} /> 
          
          {/* MASTER */}
          <Route path="/usuarios" element={<ProtectedRoute allowedRoles={['superuser']}><Usuarios /></ProtectedRoute>} />

          {/* GENERALES */}
          <Route path="/temporada" element={<ProtectedRoute><Temporada /></ProtectedRoute>} />
          <Route path="/resumen" element={<ProtectedRoute><Resumen /></ProtectedRoute>} />
          <Route path="/resumen/:id" element={<ProtectedRoute><Resumen /></ProtectedRoute>} />
          <Route path="/torneos" element={<ProtectedRoute><Torneos /></ProtectedRoute>} />
          <Route path="/scouting-rivales" element={<ProtectedRoute><ScoutingRivales /></ProtectedRoute>} />
          <Route path="/jugador-perfil" element={<ProtectedRoute><JugadorPerfil /></ProtectedRoute>} />
          <Route path="/perfil-jugador" element={<ProtectedRoute><JugadorPerfil /></ProtectedRoute>} />
          <Route path="/rendimiento" element={<ProtectedRoute><Rendimiento /></ProtectedRoute>} />
          <Route path="/origen-goles" element={<ProtectedRoute><OrigenGoles /></ProtectedRoute>} />
          <Route path="/wellness" element={<ProtectedRoute><CargaWellness /></ProtectedRoute>} />
          <Route path="/banco-tareas" element={<ProtectedRoute><BancoTareas /></ProtectedRoute>} /> 
          <Route path="/libro-tactico" element={<ProtectedRoute><LibroTactico /></ProtectedRoute>} />

          {/* Fallback de seguridad: si entra a cualquier ruta que no existe, lo manda a /inicio */}
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </main>

      {esMovil && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: 'var(--panel)', borderTop: '1px solid var(--border)', display: 'flex', zIndex: 1000 }}>
          {/* <-- ACTUALIZADO: Apunta a /inicio --> */}
          <NavLink to="/inicio" style={navMobileStyle}>🏠<span style={{fontSize: '0.6rem'}}>INICIO</span></NavLink>
          {esJugador ? (
            <NavLink to="/wellness" style={navMobileStyle}>🌡️<span style={{fontSize: '0.6rem'}}>WELLNESS</span></NavLink>
          ) : (
            puedeEscribirDeportivo && <NavLink to="/nuevo-partido" style={navMobileStyle}>⚡<span style={{fontSize: '0.6rem'}}>NUEVO</span></NavLink>
          )}
          <NavLink to="/resumen" style={navMobileStyle}>📊<span style={{fontSize: '0.6rem'}}>STATS</span></NavLink>
          {puedeControlarAdmin && <NavLink to="/tesoreria" style={navMobileStyle}>💰<span style={{fontSize: '0.6rem'}}>ADMIN</span></NavLink>}
          <button onClick={logout} style={{...navMobileStyle, background: 'none', border: 'none'}}>🚪<span style={{fontSize: '0.6rem'}}>SALIR</span></button>
        </nav>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <AppLayout />
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;