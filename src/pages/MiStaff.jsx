import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';

// --- Iconos ---
const IconEdit = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const IconUserCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="8.5" cy="7" r="4"></circle>
    <polyline points="17 11 19 13 23 9"></polyline>
  </svg>
);

export default function MiStaff() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  
  const [staff, setStaff] = useState([]);
  const [categoriasClub, setCategoriasClub] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🔥 REGLA DE ORO: Determinar el clubID objetivo
  const clubIdObjetivo = perfil?.rol === 'superuser' 
    ? (localStorage.getItem('club_id') || perfil?.club_id) 
    : perfil?.club_id;

  useEffect(() => {
    if (clubIdObjetivo) {
      fetchStaffYClubData();
    }
  }, [perfil, clubIdObjetivo]);

  const fetchStaffYClubData = async () => {
    setLoading(true);
    try {
      // 1. Fetch de perfiles del club (excluyendo jugadores)
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('perfiles')
        .select('*')
        .eq('club_id', clubIdObjetivo)
        .neq('rol', 'jugador')
        .order('rol', { ascending: true });

      if (usuariosError) throw usuariosError;

      // 2. Fetch de categorías existentes en el club (desde tabla jugadores)
      const { data: jugadoresData, error: jugadoresError } = await supabase
        .from('jugadores')
        .select('categoria')
        .eq('club_id', clubIdObjetivo);

      if (jugadoresError) throw jugadoresError;

      const categoriasUnicas = [...new Set(jugadoresData.map(j => j.categoria).filter(Boolean))].sort();
      
      setStaff(usuariosData || []);
      setCategoriasClub(categoriasUnicas);
    } catch (error) {
      console.error("Error cargando staff:", error);
      showToast("Error al cargar datos.", "error");
    } finally {
      setLoading(false);
    }
  };

  const abrirModalEdicion = (usuario) => {
    setUsuarioEditando(usuario);
    const catActuales = Array.isArray(usuario.categorias_asignadas) ? usuario.categorias_asignadas : [];
    setCategoriasSeleccionadas(catActuales);
    setModalAbierto(true);
  };

  const toggleCategoria = (cat) => {
    setCategoriasSeleccionadas(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const guardarCambios = async () => {
    if (!usuarioEditando) return;
    setGuardando(true);

    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ categorias_asignadas: categoriasSeleccionadas })
        .eq('id', usuarioEditando.id);

      if (error) throw error;

      showToast("Permisos actualizados", "success");
      setStaff(prev => prev.map(u => u.id === usuarioEditando.id ? { ...u, categorias_asignadas: categoriasSeleccionadas } : u));
      setModalAbierto(false);
    } catch (error) {
      showToast("Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)', padding: '20px' }}>Cargando staff...</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', margin: 0 }}>
          MI <span style={{ color: 'var(--accent)' }}>STAFF</span>
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Gestioná los accesos de tu cuerpo técnico.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {staff.map(usuario => {
          const esAdmin = ['superuser', 'manager', 'admin'].includes(usuario.rol);
          const cats = Array.isArray(usuario.categorias_asignadas) ? usuario.categorias_asignadas : [];

          return (
            <div key={usuario.id} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 900 }}>
                  {usuario.nombre_completo?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#fff' }}>{usuario.nombre_completo}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--accent)', textTransform: 'uppercase' }}>{usuario.rol}</div>
                </div>
              </div>

              <div style={{ minHeight: '60px' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', fontWeight: 800, marginBottom: '8px' }}>ACCESO A:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {esAdmin ? (
                    <span style={tagStyleAdmin}>TODAS</span>
                  ) : cats.length > 0 ? (
                    cats.map(c => <span key={c} style={tagStyle}>{c}</span>)
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>Sin categorías</span>
                  )}
                </div>
              </div>

              {!esAdmin && (
                <button onClick={() => abrirModalEdicion(usuario)} style={btnEdit}>
                  <IconEdit /> EDITAR PERMISOS
                </button>
              )}
            </div>
          );
        })}
      </div>

      {modalAbierto && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--accent)' }}>Permisos: {usuarioEditando?.nombre_completo}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {categoriasClub.map(cat => (
                <button key={cat} onClick={() => toggleCategoria(cat)} style={categoriasSeleccionadas.includes(cat) ? catActive : catInactive}>
                  {cat}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button onClick={() => setModalAbierto(false)} style={btnCancel}>CANCELAR</button>
              <button onClick={guardarCambios} disabled={guardando} style={btnSave}>{guardando ? '...' : 'GUARDAR'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Estilos ---
const tagStyle = { background: '#222', color: '#ccc', padding: '3px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, border: '1px solid #333' };
const tagStyleAdmin = { background: 'rgba(0,255,136,0.1)', color: 'var(--accent)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 900, border: '1px solid var(--accent)' };
const btnEdit = { marginTop: '15px', width: '100%', padding: '10px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 };
const modalContent = { background: '#111', border: '1px solid var(--accent)', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '400px' };
const catInactive = { padding: '12px', background: '#1a1a1a', border: '1px solid #333', color: '#666', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 };
const catActive = { padding: '12px', background: 'rgba(0,255,136,0.1)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 };
const btnSave = { flex: 1, padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' };
const btnCancel = { flex: 1, padding: '12px', background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '6px', cursor: 'pointer' };