import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

// PANTALLAS
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

import './App.css';

// ==========================================
// ESTILOS AUXILIARES (AHORA ARRIBA DE TODO)
// ==========================================
// ==========================================
// ESTILOS AUXILIARES (AHORA ARRIBA DE TODO)
// ==========================================
const navMobileStyle = { 
  display: 'flex', 
  flexDirection: 'column', 
  alignItems: 'center', 
  justifyContent: 'center', 
  flex: 1, 
  height: '100%', 
  cursor: 'pointer', 
  color: 'var(--text-dim)', 
  textDecoration: 'none', 
  fontWeight: 800 
};

const sidebarLinkStyle = { 
  padding: '12px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '15px',
  textAlign: 'left'
};

const sidebarGroupTitle = { 
  padding: '20px 20px 5px 20px', 
  fontSize: '0.65rem', 
  color: '#555', 
  fontWeight: 900, 
  letterSpacing: '1px' 
};

function AppLayout() {
  const { perfil, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const isLogin = location.pathname === '/login';
  const isTomaDatos = location.pathname === '/toma-datos'; // Ocultamos menú acá para aprovechar la pantalla
  
  // Condición de permisos de escritura
  const esEscritura = perfil?.rol === 'admin' || perfil?.rol === 'superuser' || perfil?.rol === 'ct';

  // --- LÓGICA RESPONSIVA (PC vs MÓVIL) ---
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  const [sidebarAbierta, setSidebarAbierta] = useState(true);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Si es Login o Toma de Datos, mostramos solo el contenido sin menús
  if (isLogin || isTomaDatos) {
    return (
      <main className="app-content-fullscreen">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/toma-datos" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><TomaDatos /></ProtectedRoute>} />
        </Routes>
      </main>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      
      {/* =========================================
          1. SIDEBAR DESKTOP / TABLET 
      ========================================== */}
      {!esMovil && (
        <aside style={{ 
          width: sidebarAbierta ? '250px' : '70px', 
          backgroundColor: 'var(--panel)', 
          borderRight: '1px solid var(--border)', 
          transition: 'width 0.3s ease',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          zIndex: 10
        }}>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: sidebarAbierta ? 'space-between' : 'center', borderBottom: '1px solid var(--border)' }}>
            {sidebarAbierta && (
              <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '1px' }}>
                VIRTUAL<span style={{ color: 'var(--accent)' }}>.STATS</span>
              </div>
            )}
            <button onClick={() => setSidebarAbierta(!sidebarAbierta)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>
              {sidebarAbierta ? '◀' : '▶'}
            </button>
          </div>
          
          <nav style={{ display: 'flex', flexDirection: 'column', padding: '10px 0 20px 0', gap: '2px', overflowY: 'auto' }}>
            
            {/* --- BLOQUE 1: OPERACIONES EN VIVO --- */}
            {sidebarAbierta && <div style={sidebarGroupTitle}>OPERACIONES</div>}
            
            <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>🏠</span> {sidebarAbierta && <span>CENTRO DE MANDO</span>}
            </NavLink>
            
            {esEscritura && (
              <NavLink to="/nuevo-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
                <span style={{ fontSize: '1.2rem' }}>⚡</span> {sidebarAbierta && <span>NUEVO PARTIDO</span>}
              </NavLink>
            )}

            <NavLink to="/continuar-partido" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>⏯️</span> {sidebarAbierta && <span>CONTINUAR PARTIDO</span>}
            </NavLink>

            {/* --- BLOQUE 2: COMPETICIÓN Y SCOUTING --- */}
            {sidebarAbierta && <div style={sidebarGroupTitle}>COMPETICIÓN</div>}

            <NavLink to="/torneos" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>🏆</span> {sidebarAbierta && <span>MIS TORNEOS</span>}
            </NavLink>

            <NavLink to="/scouting-rivales" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>🕵️‍♂️</span> {sidebarAbierta && <span>RIVALES (SCOUTING)</span>}
            </NavLink>

            {/* --- BLOQUE 3: ANÁLISIS DE DATOS --- */}
            {sidebarAbierta && <div style={sidebarGroupTitle}>ANÁLISIS DE EQUIPO</div>}

            <NavLink to="/temporada" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>📈</span> {sidebarAbierta && <span>TEMPORADA GLOBAL</span>}
            </NavLink>

            <NavLink to="/resumen" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>📊</span> {sidebarAbierta && <span>PARTIDO MATCH</span>}
            </NavLink>

            <NavLink to="/perfil-jugador" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>👁️</span> {sidebarAbierta && <span>SCOUTING PROPIO</span>}
            </NavLink>

            <NavLink to="/rendimiento" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>🏃‍♂️</span> {sidebarAbierta && <span>RENDIMIENTO</span>}
            </NavLink>
            
            {/* --- BLOQUE 4: GESTIÓN Y CONFIGURACIÓN --- */}
            {sidebarAbierta && <div style={sidebarGroupTitle}>GESTIÓN</div>}

            <NavLink to="/plantel" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
              <span style={{ fontSize: '1.2rem' }}>👤</span> {sidebarAbierta && <span>MI PLANTEL</span>}
            </NavLink>

            {esEscritura && (
              <NavLink to="/configuracion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={sidebarLinkStyle}>
                <span style={{ fontSize: '1.2rem' }}>⚙️</span> {sidebarAbierta && <span>CONFIG. CLUB</span>}
              </NavLink>
            )}

<button
  onClick={handleLogout}
  className="nav-item"
  style={{
    marginTop: '20px',
    background: 'transparent',
    color: 'var(--text-dim)',
    borderTop: '1px solid var(--border)',
    textAlign: 'left',
    cursor: 'pointer',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '15px'
  }}
>
  <span style={{ fontSize: '1.2rem' }}>🚪</span> {sidebarAbierta && <span>CERRAR SESIÓN</span>}
</button>
          </nav>
        </aside>
      )}

      {/* =========================================
          2. CONTENIDO PRINCIPAL (RUTAS)
      ========================================== */}
      <main style={{ flex: 1, overflowY: 'auto', padding: esMovil ? '20px 15px' : '40px', paddingBottom: esMovil ? '90px' : '40px' }}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><Inicio /></ProtectedRoute>} />
          <Route path="/nuevo-partido" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><NuevoPartido /></ProtectedRoute>} />
          <Route path="/continuar-partido" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><ContinuarPartido /></ProtectedRoute>} />
          <Route path="/temporada" element={<ProtectedRoute><Temporada /></ProtectedRoute>} />
          <Route path="/resumen" element={<ProtectedRoute><Resumen /></ProtectedRoute>} />
          <Route path="/torneos" element={<ProtectedRoute><Torneos /></ProtectedRoute>} />
          <Route path="/scouting-rivales" element={<ProtectedRoute><ScoutingRivales /></ProtectedRoute>} />
          <Route path="/perfil-jugador" element={<ProtectedRoute><JugadorPerfil /></ProtectedRoute>} />
          <Route path="/plantel" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><Plantel /></ProtectedRoute>} />
          <Route path="/configuracion" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><Configuracion /></ProtectedRoute>} /> 
          <Route path="/rendimiento" element={<ProtectedRoute><Rendimiento /></ProtectedRoute>} />
        </Routes>
      </main>

      {/* =========================================
          3. BOTTOM NAV (SOLO MOBILE)
      ========================================== */}
      {esMovil && (
        <div style={{ 
          position: 'fixed', bottom: 0, left: 0, right: 0, 
          backgroundColor: 'var(--panel)', borderTop: '1px solid var(--border)', 
          display: 'flex', justifyContent: 'space-around', alignItems: 'center', 
          height: '70px', zIndex: 1000, paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          
          <NavLink to="/" className={({ isActive }) => isActive ? "nav-item-mobile active" : "nav-item-mobile"} style={navMobileStyle}>
            <span style={{ fontSize: '1.4rem' }}>🏠</span><span style={{ fontSize: '0.6rem' }}>INICIO</span>
          </NavLink>

          {esEscritura && (
            <NavLink to="/nuevo-partido" className={({ isActive }) => isActive ? "nav-item-mobile active" : "nav-item-mobile"} style={navMobileStyle}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span><span style={{ fontSize: '0.6rem' }}>MATCH</span>
            </NavLink>
          )}

          <NavLink to="/resumen" className={({ isActive }) => isActive ? "nav-item-mobile active" : "nav-item-mobile"} style={navMobileStyle}>
            <span style={{ fontSize: '1.4rem' }}>📊</span><span style={{ fontSize: '0.6rem' }}>PARTIDO</span>
          </NavLink>

          <NavLink to="/temporada" className={({ isActive }) => isActive ? "nav-item-mobile active" : "nav-item-mobile"} style={navMobileStyle}>
            <span style={{ fontSize: '1.4rem' }}>🏆</span><span style={{ fontSize: '0.6rem' }}>GLOBAL</span>
          </NavLink>

          <div onClick={handleLogout} style={{ ...navMobileStyle, color: 'var(--text-dim)' }}>
            <span style={{ fontSize: '1.4rem' }}>🚪</span><span style={{ fontSize: '0.6rem' }}>SALIR</span>
          </div>
          
        </div>
      )}

    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout />
      </Router>
    </AuthProvider>
  );
}

export default App;