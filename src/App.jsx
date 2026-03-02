import { BrowserRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Inicio from './pages/Inicio';
import TomaDatos from './pages/TomaDatos';
import Resumen from './pages/Resumen';
import JugadorPerfil from './pages/JugadorPerfil';
import Temporada from './pages/Temporada';
import Configuracion from './pages/Configuracion';
import Rendimiento from './pages/Rendimiento';
import Login from './pages/Login'; // <-- AGREGADO
import './App.css';

// <-- AGREGADO: Subcomponente requerido para usar los hooks
function AppLayout() {
  const { perfil, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate(); // <-- AGREGADO: Hook de navegación
  const isLogin = location.pathname === '/login';
  
  // Condición de permisos de escritura
  const esEscritura = perfil?.rol === 'admin' || perfil?.rol === 'superuser' || perfil?.rol === 'ct';

  // <-- AGREGADO: Función para forzar cierre y redirección limpia
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-layout">
      {/* <-- AGREGADO: Ocultar sidebar si el usuario está en la pantalla de Login */}
      {!isLogin && (
        <aside className="sidebar">
          <div className="brand-logo">
            VIRTUAL<span style={{ color: 'var(--accent)' }}>.STATS</span>
          </div>
          
          {/* <-- AGREGADO: Renderizado condicional de enlaces según el rol */}
          {esEscritura && <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>INICIO</NavLink>}
          
          <NavLink to="/temporada" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>DASHBOARD GLOBAL</NavLink>
          <NavLink to="/resumen" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>DASHBOARD PARTIDO</NavLink>
          <NavLink to="/perfil-jugador" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>SCOUTING INDIVIDUAL</NavLink>
          <NavLink to="/rendimiento" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>RENDIMIENTO</NavLink>
          
          {esEscritura && <NavLink to="/configuracion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>MI CLUB</NavLink>}
          
          {esEscritura && (
            <NavLink 
              to="/toma-datos" 
              className="nav-item" 
              style={{ 
                marginTop: 'auto', 
                backgroundColor: 'var(--accent)', 
                color: '#000', 
                fontWeight: 800, 
                textAlign: 'center',
                borderRadius: '4px',
                border: 'none'
              }}
            >
              TOMAR DATOS
            </NavLink>
          )}

          {/* <-- MODIFICADO: Uso de handleLogout en lugar de logout directo */}
          <button onClick={handleLogout} className="nav-item" style={{ marginTop: esEscritura ? '10px' : 'auto', background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', textAlign: 'center', cursor: 'pointer' }}>
            CERRAR SESIÓN
          </button>
        </aside>
      )}

      <main className="app-content">
        <Routes>
          {/* <-- AGREGADO: Ruta de Login */}
          <Route path="/login" element={<Login />} />
          
          {/* <-- AGREGADO: Rutas envueltas en ProtectedRoute con y sin restricción de roles */}
          <Route path="/" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><Inicio /></ProtectedRoute>} />
          <Route path="/temporada" element={<ProtectedRoute><Temporada /></ProtectedRoute>} />
          <Route path="/resumen" element={<ProtectedRoute><Resumen /></ProtectedRoute>} />
          <Route path="/perfil-jugador" element={<ProtectedRoute><JugadorPerfil /></ProtectedRoute>} />
          <Route path="/configuracion" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><Configuracion /></ProtectedRoute>} /> 
          <Route path="/toma-datos" element={<ProtectedRoute allowedRoles={['admin', 'superuser', 'ct']}><TomaDatos /></ProtectedRoute>} />
          <Route path="/rendimiento" element={<ProtectedRoute><Rendimiento /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    /* <-- AGREGADO: Envoltura de Autenticación */
    <AuthProvider>
      <Router>
        <AppLayout />
      </Router>
    </AuthProvider>
  );
}

export default App;