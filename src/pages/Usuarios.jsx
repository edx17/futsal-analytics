import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { createClient } from '@supabase/supabase-js'; 

function Usuarios() {
  const { perfil } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [clubes, setClubes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const esSuperUser = perfil?.rol === 'superuser';

  // Estado del formulario
  const [nuevoUser, setNuevoUser] = useState({
    username: '',
    password: '',
    email: '',
    nombre_completo: '',
    rol: 'jugador',
    club_id: esSuperUser ? '' : (perfil?.club_id || '')
  });

  useEffect(() => {
    fetchUsuarios();
    if (esSuperUser) fetchClubes();
  }, [perfil]);

  async function fetchUsuarios() {
    setLoading(true);
    let query = supabase.from('perfiles').select(`
      id, username, nombre_completo, email, rol, club_id,
      clubes ( nombre )
    `);
    
    // Si NO es superuser, solo ve los de su club
    if (!esSuperUser) {
      query = query.eq('club_id', perfil.club_id);
    }

    const { data, error } = await query.order('rol', { ascending: true });
    if (!error) setUsuarios(data || []);
    setLoading(false);
  }

  async function fetchClubes() {
    const { data } = await supabase.from('clubes').select('id, nombre').order('nombre');
    setClubes(data || []);
  }

  const crearUsuario = async (e) => {
    e.preventDefault();
    setProcesando(true);

    const emailFicticio = `${nuevoUser.username.trim()}@virtualstats.com`;

    // --- EL TRUCO PARA NO DESLOGUEARTE ---
    const tempSupabase = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
      auth: { persistSession: false }
    });

    // 1. Usamos el cliente fantasma para crear la credencial en Auth
    const { data: authData, error: authError } = await tempSupabase.auth.signUp({
      email: emailFicticio,
      password: nuevoUser.password,
    });

    if (authError) {
      alert("Error al crear credenciales: " + authError.message);
      setProcesando(false);
      return;
    }

    // 2. Insertar en nuestra tabla de perfiles (Usamos el supabase ORIGINAL)
    const { error: profileError } = await supabase.from('perfiles').insert([
      {
        id: authData.user.id,
        username: nuevoUser.username.trim(),
        nombre_completo: nuevoUser.nombre_completo,
        email: nuevoUser.email, 
        rol: nuevoUser.rol,
        club_id: nuevoUser.club_id || null
      }
    ]);

    if (profileError) {
      alert("Error al guardar el perfil: " + profileError.message);
    } else {
      alert("¡Usuario creado con éxito!");
      setNuevoUser({ 
        username: '', password: '', email: '', nombre_completo: '', 
        rol: 'jugador', club_id: esSuperUser ? '' : (perfil?.club_id || '') 
      });
      fetchUsuarios();
    }
    setProcesando(false);
  };

  // --- NUEVA FUNCIÓN PARA ELIMINAR USUARIOS ---
  const eliminarUsuario = async (idAEliminar, username) => {
    // Evitar que el usuario se elimine a sí mismo
    if (idAEliminar === perfil.id) {
      alert("No podés eliminar tu propia cuenta mientras estás logueado.");
      return;
    }

    // Confirmación de seguridad
    const confirmar = window.confirm(`¿Estás seguro que querés eliminar el acceso del usuario "${username}"?\n\nEsto le quitará el acceso a la plataforma.`);
    if (!confirmar) return;

    setLoading(true);

    // Eliminamos el registro de la tabla 'perfiles'
    const { error } = await supabase
      .from('perfiles')
      .delete()
      .eq('id', idAEliminar);

    if (error) {
      alert("Error al eliminar el usuario: " + error.message);
    } else {
      // Si salió bien, volvemos a cargar la lista
      fetchUsuarios();
    }
    
    setLoading(false);
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>CONFIGURACIÓN DEL SISTEMA</div>
          <h2 style={{ margin: 0, fontWeight: 900, color: esSuperUser ? '#c084fc' : 'var(--accent)' }}>
            {esSuperUser ? '👑 GESTIÓN MASTER DE USUARIOS' : '👥 GESTIÓN DE PLANTEL Y STAFF'}
          </h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px' }}>
        
        {/* FORMULARIO DE CREACIÓN */}
        <div className="bento-card" style={{ height: 'fit-content' }}>
          <div className="stat-label" style={{ marginBottom: '20px' }}>Crear Nuevo Acceso</div>
          
          <form onSubmit={crearUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="input-field">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>USUARIO (LOGIN)</label>
                <input type="text" required value={nuevoUser.username} onChange={e => setNuevoUser({...nuevoUser, username: e.target.value})} placeholder="ej: jperez" style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
              </div>
              <div className="input-field">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>CONTRASEÑA</label>
                <input type="text" required value={nuevoUser.password} onChange={e => setNuevoUser({...nuevoUser, password: e.target.value})} placeholder="Mínimo 6 letras/números" style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
              </div>
            </div>

            <div className="input-field">
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>NOMBRE COMPLETO</label>
              <input type="text" required value={nuevoUser.nombre_completo} onChange={e => setNuevoUser({...nuevoUser, nombre_completo: e.target.value})} placeholder="Juan Perez" style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
            </div>
            
            <div className="input-field">
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>EMAIL (CONTACTO)</label>
              <input type="email" value={nuevoUser.email} onChange={e => setNuevoUser({...nuevoUser, email: e.target.value})} placeholder="juan@ejemplo.com" style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: esSuperUser ? '1fr 1fr' : '1fr', gap: '15px' }}>
              <div className="input-field">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>ROL EN EL SISTEMA</label>
                <select value={nuevoUser.rol} onChange={e => setNuevoUser({...nuevoUser, rol: e.target.value})} style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }}>
                  <option value="jugador">Jugador</option>
                  <option value="ct">Cuerpo Técnico</option>
                  <option value="manager">Manager / Coordinador</option>
                  {esSuperUser && <option value="admin">Administrativo (Dirigente)</option>}
                  <option value="tesorero">Tesorero</option>
                  {esSuperUser && <option value="superuser">Super User</option>}
                </select>
              </div>

              {esSuperUser && (
                <div className="input-field">
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>ASIGNAR A CLUB</label>
                  <select required={nuevoUser.rol !== 'superuser'} value={nuevoUser.club_id} onChange={e => setNuevoUser({...nuevoUser, club_id: e.target.value})} style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }}>
                    <option value="">Ninguno / Seleccionar...</option>
                    {clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}
            </div>

            <button type="submit" className="btn-action" disabled={procesando} style={{ marginTop: '15px', padding: '15px' }}>
              {procesando ? 'CREANDO CREDENCIALES...' : 'CREAR USUARIO'}
            </button>
          </form>
        </div>

        {/* LISTADO DE USUARIOS */}
        <div className="bento-card" style={{ gridColumn: esSuperUser ? 'span 2' : 'span 1' }}>
          <div className="stat-label" style={{ marginBottom: '20px' }}>Cuentas Activas ({usuarios.length})</div>
          
          {loading ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Cargando usuarios...</div>
          ) : (
            <div className="table-wrapper">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>USUARIO (LOGIN)</th>
                    <th style={{ padding: '10px' }}>NOMBRE</th>
                    <th style={{ padding: '10px' }}>ROL</th>
                    {esSuperUser && <th style={{ padding: '10px' }}>CLUB</th>}
                    <th style={{ padding: '10px' }}>CONTACTO</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 800, color: 'var(--accent)' }}>{u.username}</td>
                      <td style={{ padding: '12px 10px', fontWeight: 600 }}>{u.nombre_completo?.toUpperCase()}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ 
                          fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 800,
                          background: u.rol === 'superuser' ? '#c084fc' : u.rol === 'manager' ? '#f97316' : u.rol === 'admin' ? '#3b82f6' : u.rol === 'ct' ? '#10b981' : '#222',
                          color: u.rol === 'jugador' ? 'var(--text-dim)' : '#000'
                        }}>
                          {u.rol.toUpperCase()}
                        </span>
                      </td>
                      {esSuperUser && (
                        <td style={{ padding: '12px 10px', color: 'var(--text-dim)' }}>
                          {u.clubes?.nombre || <span style={{color: '#888', fontStyle: 'italic'}}>Sin club asignado</span>}
                        </td>
                      )}
                      <td style={{ padding: '12px 10px', color: 'var(--text-dim)' }}>{u.email || '-'}</td>
                      
                      {/* BOTÓN DE ELIMINAR */}
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <button 
                          onClick={() => eliminarUsuario(u.id, u.username)}
                          style={{
                            background: 'transparent',
                            border: '1px solid #ef4444',
                            color: '#ef4444',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: u.id === perfil.id ? 'not-allowed' : 'pointer',
                            opacity: u.id === perfil.id ? 0.3 : 1,
                            fontSize: '0.8rem',
                            transition: '0.2s'
                          }}
                          onMouseOver={(e) => { 
                            if(u.id !== perfil.id) {
                              e.currentTarget.style.background = '#ef4444'; 
                              e.currentTarget.style.color = '#fff'; 
                            }
                          }}
                          onMouseOut={(e) => { 
                            if(u.id !== perfil.id) {
                              e.currentTarget.style.background = 'transparent'; 
                              e.currentTarget.style.color = '#ef4444'; 
                            }
                          }}
                          title={u.id === perfil.id ? "No podés eliminarte a vos mismo" : "Eliminar usuario"}
                        >
                          🗑️
                        </button>
                      </td>

                    </tr>
                  ))}
                  {usuarios.length === 0 && (
                    <tr>
                      <td colSpan={esSuperUser ? "6" : "5"} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
                        No hay usuarios registrados en este club.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default Usuarios;