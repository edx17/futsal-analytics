import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Inicio from './pages/Inicio';
import TomaDatos from './pages/TomaDatos';
import Resumen from './pages/Resumen';
import JugadorPerfil from './pages/JugadorPerfil';
import Temporada from './pages/Temporada';
import Configuracion from './pages/Configuracion';
import Rendimiento from './pages/Rendimiento';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="brand-logo">
            VIRTUAL<span style={{ color: 'var(--accent)' }}>.STATS</span>
          </div>
          <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>INICIO</NavLink>
          <NavLink to="/temporada" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>DASHBOARD GLOBAL</NavLink>
          <NavLink to="/resumen" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>DASHBOARD PARTIDO</NavLink>
          <NavLink to="/perfil-jugador" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>SCOUTING INDIVIDUAL</NavLink>
          <NavLink to="/rendimiento" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>RENDIMIENTO</NavLink>
          <NavLink to="/configuracion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>MI CLUB</NavLink>
          
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
        </aside>

        <main className="app-content">
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/temporada" element={<Temporada />} />
            <Route path="/resumen" element={<Resumen />} />
            <Route path="/perfil-jugador" element={<JugadorPerfil />} />
            <Route path="/configuracion" element={<Configuracion />} /> {/* <-- RUTA NUEVA */}
            <Route path="/toma-datos" element={<TomaDatos />} />
            <Route path="/rendimiento" element={<Rendimiento />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;