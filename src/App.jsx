import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import { ToastProvider } from './components/ToastContext';

// PANTALLAS ORIGINALES
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
import CreadorFisico from './pages/CreadorFisico'; // <-- AGREGADO: Importamos el creador del profe
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

// --- ESTILOS INLINE MÓVILES ---
const navMobileStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', flex: 1, height: '100%', cursor: 'pointer', color: 'var(--text-dim)', textDecoration: 'none', fontWeight: 800, padding: '8px 0', transition: 'color 0.2s' };
const sidebarLinkStyle = { padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '15px', textAlign: 'left' };
const sidebarGroupTitle = { padding: '20px 20px 5px 20px', fontSize: '0.65rem', color: '#888', fontWeight: 900, letterSpacing: '1px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };

function AppLayout() {
  const { perfil, logout, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  const [sidebarAbierta, setSidebarAbierta] = useState(true);
  
  // --- NUEVO ESTADO PARA EL DRAWER Y EL FAB (MÓVIL) ---
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [fabAbierto, setFabAbierto] = useState(false);

  const [menusAbiertos, setMenusAbiertos] = useState({
    operaciones: true,
    competicion: false,
    analisis: false,
    planificacion: false,
    plantel: false,
    administracion: false,
    sistema: false
  });

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cerrar menús al cambiar de ruta en móvil
  useEffect(() => {
    if (esMovil) {
      setDrawerAbierto(false);
      setFabAbierto(false);
    }
  }, [location.pathname, esMovil]);

  if (loading) return null;

  const isLanding = location.pathname === '/'; 
  const isLogin = location.pathname === '/login';
  const isRegistro = location.pathname === '/registro'; 
  const isTomaDatos = location.pathname === '/toma-datos'; 
  const isKioscoAuth = location.pathname === '/kiosco';
  const isKioscoPath = location.pathname.startsWith('/kiosco/');
  const isSuscripcionPath = location.pathname === '/mi-suscripcion'; 

  const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
  
  const rol = (perfil?.rol || '').toLowerCase();
  const esSuperUser = rol === 'superuser';
  const esAdmin = rol === 'admin';
  const esManager = rol === 'manager';
  const esCT = rol === 'ct';
  const esJugador = rol === 'jugador';

  const puedeEscribirDeportivo = esSuperUser || esManager || esCT;
  const puedeVerDeportivo = esSuperUser || esManager || esAdmin || esCT || esJugador;
  const puedeControlarAdmin = esSuperUser || esManager || esAdmin;
  const puedeConfigurar = esSuperUser || esManager || esAdmin;

  const toggleMenu = (seccion) => setMenusAbiertos(prev => ({ ...prev, [seccion]: !prev[seccion] }));

  const club = perfil?.clubes;
  const isVencido = club?.fecha_vencimiento ? new Date(club.fecha_vencimiento) < new Date() : false;

  if (perfil && !esSuperUser && club && (club.suscripcion_activa === false || isVencido) && !isSuscripcionPath) {
    return <Navigate to="/mi-suscripcion" replace />;
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

  // --- RENDERIZADO DEL MENÚ ---
  const renderNavLinks = () => (
    <>
      <NavLink to="/inicio" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
        🏠 <span>{esJugador ? 'MI INICIO' : 'CENTRO DE MANDO'}</span>
      </NavLink>

      {puedeEscribirDeportivo && (
        <>
          <div style={sidebarGroupTitle} onClick={() => toggleMenu('operaciones')}>
            <span>OPERACIONES</span> <span>{menusAbiertos.operaciones ? '▼' : '▶'}</span>
          </div>
          {menusAbiertos.operaciones && (
            <>
              <NavLink to="/nuevo-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⚡ <span>NUEVO PARTIDO</span></NavLink>
              <NavLink to="/continuar-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⏯️ <span>CONTINUAR PARTIDO</span></NavLink>
            </>
          )}
        </>
      )}

      {!esJugador && puedeVerDeportivo && (
        <>
          <div style={sidebarGroupTitle} onClick={() => toggleMenu('competicion')}>
            <span>COMPETICIÓN</span> <span>{menusAbiertos.competicion ? '▼' : '▶'}</span>
          </div>
          {menusAbiertos.competicion && (
            <>
              <NavLink to="/torneos" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🏆 <span>MIS TORNEOS</span></NavLink>
              <NavLink to="/scouting-rivales" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🕵️‍♂️ <span>RIVALES</span></NavLink>
            </>
          )}
        </>
      )}

      {puedeVerDeportivo && (
        <>
          <div style={sidebarGroupTitle} onClick={() => toggleMenu('analisis')}>
            <span>ANÁLISIS</span> <span>{menusAbiertos.analisis ? '▼' : '▶'}</span>
          </div>
          {menusAbiertos.analisis && (
            <>
              {!esJugador && <NavLink to="/temporada" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📈 <span>RESUMEN TEMPORADA</span></NavLink>}
              <NavLink to="/resumen" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📊 <span>RESUMEN POR PARTIDO</span></NavLink>
              <NavLink to="/perfil-jugador" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>👁️ <span>{esJugador ? 'MI PERFIL' : 'RESUMEN POR JUGADOR'}</span></NavLink>
              {!esJugador && <NavLink to="/origen-goles" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⚽ <span>ORIGEN DE GOLES</span></NavLink>}
            </>
          )}
        </>
      )}

      {puedeVerDeportivo && !esJugador && (
        <>
          <div style={sidebarGroupTitle} onClick={() => toggleMenu('planificacion')}>
            <span>PLANIFICACIÓN</span> <span>{menusAbiertos.planificacion ? '▼' : '▶'}</span>
          </div>
          {menusAbiertos.planificacion && (
            <>
              {puedeEscribirDeportivo && (
                <>
                  <NavLink to="/microciclo" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🗓️ <span>MICROCICLO</span></NavLink>
                  <NavLink to="/creador-tareas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🎨 <span>CREADOR TÁCTICO</span></NavLink>
                  {/* AGREGADO: Enlace al Creador Físico */}
                  <NavLink to="/creador-fisico" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🏋️‍♂️ <span>CREADOR FÍSICO</span></NavLink>
                </>
              )}
              <NavLink to="/banco-tareas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🗃️ <span>BANCO DE TAREAS</span></NavLink>
              <NavLink to="/libro-tactico" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📘 <span>LIBRO TÁCTICO</span></NavLink>
            </>
          )}
        </>
      )}

      {puedeVerDeportivo && (
        <>
          <div style={sidebarGroupTitle} onClick={() => toggleMenu('plantel')}>
            <span>PLANTEL</span> <span>{menusAbiertos.plantel ? '▼' : '▶'}</span>
          </div>
          {menusAbiertos.plantel && (
            <>
              {!esJugador && <NavLink to="/plantel" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>👤 <span>MI PLANTEL</span></NavLink>}
              {puedeEscribirDeportivo && <NavLink to="/presentismo" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>📅 <span>PRESENTISMO</span></NavLink>}
              <NavLink to="/wellness" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🌡️ <span>WELLNESS</span></NavLink>
              <NavLink to="/rendimiento" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🏃‍♂️ <span>FISIOLOGÍA</span></NavLink>
            </>
          )}
        </>
      )}

      {!esJugador && puedeControlarAdmin && (
        <>
          <div style={sidebarGroupTitle} onClick={() => toggleMenu('administracion')}>
            <span>ADMINISTRACIÓN</span> <span>{menusAbiertos.administracion ? '▼' : '▶'}</span>
          </div>
          {menusAbiertos.administracion && (
            <>
              <NavLink to="/tesoreria" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>💰 <span>TESORERÍA</span></NavLink>
              <NavLink to="/sponsors" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>🤝 <span>SPONSORS</span></NavLink>
              {puedeConfigurar && (
                <>
                  <NavLink to="/mi-suscripcion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>💳 <span>MI SUSCRIPCIÓN</span></NavLink>
                  <NavLink to="/configuracion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>⚙️ <span>CONFIG. DE CLUB</span></NavLink>
                </>
              )}
            </>
          )}
        </>
      )}

      {esSuperUser && (
        <>
          <div style={sidebarGroupTitle} onClick={() => toggleMenu('sistema')}>
            <span>SISTEMA</span> <span>{menusAbiertos.sistema ? '▼' : '▶'}</span>
          </div>
          {menusAbiertos.sistema && (
            <NavLink to="/usuarios" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>👑 <span>GESTIÓN MASTER</span></NavLink>
          )}
        </>
      )}

      <button onClick={logout} className="nav-item" style={{ marginTop: '20px', background: 'transparent', color: '#ef4444', borderTop: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '15px' }}>
        🚪 <span style={{fontWeight: 'bold'}}>CERRAR SESIÓN</span>
      </button>
    </>
  );

  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      
      {/* SIDEBAR DESKTOP */}
      {!esMovil && (
        <aside style={{ width: sidebarAbierta ? '250px' : '70px', backgroundColor: 'var(--panel)', borderRight: '1px solid var(--border)', transition: 'width 0.3s ease', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 10 }}>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: sidebarAbierta ? 'space-between' : 'center', borderBottom: '1px solid var(--border)' }}>
            {sidebarAbierta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src="/favicon-32x32.png" alt="VS" style={{ height: '26px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none' }} />
                <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '1px' }}>VIRTUAL<span style={{ color: 'var(--accent)' }}>.CLUB</span></div>
              </div>
            )}
            <button onClick={() => setSidebarAbierta(!sidebarAbierta)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>{sidebarAbierta ? '◀' : '▶'}</button>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', padding: '10px 0 20px 0', gap: '2px', overflowY: 'auto' }}>
             {sidebarAbierta ? renderNavLinks() : <div style={{textAlign: 'center', color: '#666', fontSize: '0.8rem', marginTop: '20px'}}>Menú<br/>Oculto</div>}
          </nav>
        </aside>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ flex: 1, overflowY: 'auto', padding: esMovil ? '0px 0px 85px 0px' : '40px', position: 'relative' }}>
        <div style={{ padding: esMovil ? '20px 15px' : '0' }}>
          <Routes>
            <Route path="/inicio" element={<ProtectedRoute><Inicio /></ProtectedRoute>} />
            <Route path="/nuevo-partido" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><NuevoPartido /></ProtectedRoute>} />
            <Route path="/continuar-partido" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><ContinuarPartido /></ProtectedRoute>} />
            <Route path="/presentismo" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><Presentismo /></ProtectedRoute>} />
            <Route path="/plantel" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin', 'ct']}><Plantel /></ProtectedRoute>} />
            <Route path="/microciclo" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><PlanificadorSemanal /></ProtectedRoute>} />
            <Route path="/creador-tareas" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><CreadorTareas /></ProtectedRoute>} />
            {/* AGREGADO: Ruta del Creador Físico protegida para el cuerpo técnico */}
            <Route path="/creador-fisico" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'ct']}><CreadorFisico /></ProtectedRoute>} />
            <Route path="/tesoreria" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><Tesoreria /></ProtectedRoute>} />
            <Route path="/sponsors" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><Sponsors /></ProtectedRoute>} />
            <Route path="/configuracion" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><Configuracion /></ProtectedRoute>} /> 
            <Route path="/mi-suscripcion" element={<ProtectedRoute allowedRoles={['superuser', 'manager', 'admin']}><MiSuscripcion /></ProtectedRoute>} />
            <Route path="/usuarios" element={<ProtectedRoute allowedRoles={['superuser']}><Usuarios /></ProtectedRoute>} />
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
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Routes>
        </div>
      </main>

      {/* --- BOTTOM NAVIGATION (MÓVIL) --- */}
      {esMovil && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: 'var(--panel)', borderTop: '1px solid var(--border)', display: 'flex', zIndex: 1000, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <NavLink to="/inicio" style={({isActive}) => ({...navMobileStyle, color: isActive ? 'var(--accent)' : 'var(--text-dim)'})}>
            <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>🏠</span>
            <span style={{fontSize: '0.65rem'}}>Inicio</span>
          </NavLink>
          
          {puedeVerDeportivo && !esJugador && (
            <NavLink to="/microciclo" style={({isActive}) => ({...navMobileStyle, color: isActive ? 'var(--accent)' : 'var(--text-dim)'})}>
              <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>🗓️</span>
              <span style={{fontSize: '0.65rem'}}>Hoy</span>
            </NavLink>
          )}

          {/* BOTÓN FLOTANTE CENTRAL (FAB) */}
          {puedeEscribirDeportivo && (
             <div style={{ flex: 1, display: 'flex', justifyContent: 'center', position: 'relative' }}>
                <button 
                  onClick={() => { setFabAbierto(!fabAbierto); setDrawerAbierto(false); }}
                  style={{ 
                    position: 'absolute',
                    top: '0px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 15px rgba(0,255,136,0.3)',
                    zIndex: 1002,
                    transition: 'transform 0.2s'
                  }}
                >
                  {fabAbierto ? '×' : '+'}
                </button>
             </div>
          )}

          {/* Si es jugador mostramos otra cosa en lugar de Tareas */}
          {esJugador && (
            <NavLink to="/wellness" style={({isActive}) => ({...navMobileStyle, color: isActive ? 'var(--accent)' : 'var(--text-dim)'})}>
              <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>🌡️</span>
              <span style={{fontSize: '0.65rem'}}>Wellness</span>
            </NavLink>
          )}

          <NavLink to="/resumen" style={({isActive}) => ({...navMobileStyle, color: isActive ? 'var(--accent)' : 'var(--text-dim)'})}>
            <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>📊</span>
            <span style={{fontSize: '0.65rem'}}>Stats</span>
          </NavLink>

          {/* BOTÓN DRAWER */}
          <div onClick={() => { setDrawerAbierto(true); setFabAbierto(false); }} style={{...navMobileStyle, color: drawerAbierto ? 'var(--accent)' : 'var(--text-dim)'}}>
            <span style={{fontSize: '1.4rem', marginBottom: '2px'}}>☰</span>
            <span style={{fontSize: '0.65rem'}}>Menú</span>
          </div>
        </nav>
      )}

      {/* --- MODAL DEL FAB (Carga Rápida) --- */}
      {esMovil && fabAbierto && (
        <>
          <div onClick={() => setFabAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 1001, width: '220px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s' }}>
            <div style={{fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center', fontWeight: 'bold', marginBottom: '5px'}}>ACCIONES RÁPIDAS</div>
            <button onClick={() => navigate('/nuevo-partido')} style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '12px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold' }}>⚡ Nuevo Partido</button>
            <button onClick={() => navigate('/presentismo')} style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '12px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold' }}>📅 Presentismo</button>
            <button onClick={() => navigate('/carga-wellness')} style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '12px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold' }}>🔋 Estado Wellness</button>
          </div>
        </>
      )}

      {/* --- OFF-CANVAS DRAWER (Menú lateral móvil) --- */}
      {esMovil && (
        <>
          {/* Overlay oscuro de fondo */}
          {drawerAbierto && <div onClick={() => setDrawerAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1005, animation: 'fadeIn 0.3s' }} />}
          
          {/* Panel Lateral */}
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
              <button onClick={() => setDrawerAbierto(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', padding: 0 }}>×</button>
            </div>
            <nav style={{ flex: 1, paddingBottom: '20px' }}>
              {renderNavLinks()}
            </nav>
          </div>
        </>
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