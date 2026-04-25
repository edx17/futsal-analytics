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

  // Estado del formulario de CREACIÓN
  const [nuevoUser, setNuevoUser] = useState({
    username: '',
    password: '',
    email: '',
    nombre_completo: '',
    rol: 'jugador',
    club_id: esSuperUser ? '' : (perfil?.club_id || '')
  });

  // Estado del formulario de EDICIÓN
  const [usuarioEnEdicion, setUsuarioEnEdicion] = useState(null);

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

  // --- CREAR USUARIO ---
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
      email: nuevoUser.email || emailFicticio, // Usa el email real si lo puso, sino el ficticio
      password: nuevoUser.password,
    });

    if (authError) {
      alert("Error al crear credenciales: " + authError.message);
      setProcesando(false);
      return;
    }

    // 2. Insertar en nuestra tabla de perfiles (Usamos el supabase ORIGINAL)
const { error: profileError } = await supabase.from('perfiles').upsert([
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

  // --- ELIMINAR USUARIO ---
  const eliminarUsuario = async (idAEliminar, username) => {
    if (idAEliminar === perfil.id) {
      alert("No podés eliminar tu propia cuenta mientras estás logueado.");
      return;
    }

    const confirmar = window.confirm(`¿Estás seguro que querés eliminar el acceso del usuario "${username}"?\n\nEsto le quitará el acceso a la plataforma.`);
    if (!confirmar) return;

    setLoading(true);

    const { error } = await supabase
      .from('perfiles')
      .delete()
      .eq('id', idAEliminar);

    if (error) {
      alert("Error al eliminar el usuario: " + error.message);
    } else {
      fetchUsuarios();
    }
    setLoading(false);
  };

  // --- ABRIR MODAL DE EDICIÓN ---
  const abrirEdicion = (usuario) => {
    setUsuarioEnEdicion({
      id: usuario.id,
      username: usuario.username || '',
      email: usuario.email || '',
      nombre_completo: usuario.nombre_completo || '',
      rol: usuario.rol || 'jugador',
      club_id: usuario.club_id || ''
    });
  };

  // --- GUARDAR EDICIÓN ---
  const guardarEdicion = async (e) => {
    e.preventDefault();
    setProcesando(true);

    // Evitamos que el superuser se quite a sí mismo el rol por accidente
    if (usuarioEnEdicion.id === perfil.id && usuarioEnEdicion.rol !== 'superuser' && esSuperUser) {
      alert("Por seguridad, no podés quitarte el rol de SuperUser a vos mismo.");
      setProcesando(false);
      return;
    }

    const { error } = await supabase
      .from('perfiles')
      .update({
        nombre_completo: usuarioEnEdicion.nombre_completo,
        rol: usuarioEnEdicion.rol,
        club_id: usuarioEnEdicion.club_id || null
      })
      .eq('id', usuarioEnEdicion.id);

    if (error) {
      alert("Error al actualizar perfil: " + error.message);
    } else {
      alert("¡Usuario actualizado con éxito!");
      setUsuarioEnEdicion(null);
      fetchUsuarios();
    }
    
    setProcesando(false);
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
                <input type="text" required value={nuevoUser.username} onChange={e => setNuevoUser({...nuevoUser, username: e.target.value})} placeholder="ej: jperez" style={inputStyle} />
              </div>
              <div className="input-field">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>CONTRASEÑA</label>
                <input type="text" required value={nuevoUser.password} onChange={e => setNuevoUser({...nuevoUser, password: e.target.value})} placeholder="Mínimo 6 letras/números" style={inputStyle} />
              </div>
            </div>

            <div className="input-field">
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>NOMBRE COMPLETO</label>
              <input type="text" required value={nuevoUser.nombre_completo} onChange={e => setNuevoUser({...nuevoUser, nombre_completo: e.target.value})} placeholder="Juan Perez" style={inputStyle} />
            </div>
            
            <div className="input-field">
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>EMAIL (OPCIONAL)</label>
              <input type="email" value={nuevoUser.email} onChange={e => setNuevoUser({...nuevoUser, email: e.target.value})} placeholder="juan@ejemplo.com" style={inputStyle} />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: esSuperUser ? '1fr 1fr' : '1fr', gap: '15px' }}>
              <div className="input-field">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>ROL EN EL SISTEMA</label>
                <select value={nuevoUser.rol} onChange={e => setNuevoUser({...nuevoUser, rol: e.target.value})} style={inputStyle}>
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
                  <select required={nuevoUser.rol !== 'superuser'} value={nuevoUser.club_id} onChange={e => setNuevoUser({...nuevoUser, club_id: e.target.value})} style={inputStyle}>
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
                    <th style={{ padding: '10px' }}>USUARIO / EMAIL</th>
                    <th style={{ padding: '10px' }}>NOMBRE</th>
                    <th style={{ padding: '10px' }}>ROL</th>
                    {esSuperUser && <th style={{ padding: '10px' }}>CLUB</th>}
                    <th style={{ padding: '10px', textAlign: 'center' }}>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--accent)' }}>{u.username || 'Sin Username'}</div>
                        {u.email && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{u.email}</div>}
                      </td>
                      <td style={{ padding: '12px 10px', fontWeight: 600 }}>{u.nombre_completo?.toUpperCase() || '-'}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ 
                          fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 800,
                          background: u.rol === 'superuser' ? '#c084fc' : u.rol === 'manager' ? '#f97316' : u.rol === 'admin' ? '#3b82f6' : u.rol === 'ct' ? '#10b981' : '#222',
                          color: u.rol === 'jugador' ? 'var(--text-dim)' : '#000'
                        }}>
                          {u.rol?.toUpperCase()}
                        </span>
                      </td>
                      {esSuperUser && (
                        <td style={{ padding: '12px 10px', color: 'var(--text-dim)' }}>
                          {u.clubes?.nombre || <span style={{color: '#888', fontStyle: 'italic'}}>Sin club asignado</span>}
                        </td>
                      )}
                      
                      {/* BOTONES DE ACCIÓN: EDITAR Y ELIMINAR */}
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button 
                            onClick={() => abrirEdicion(u)}
                            style={btnIconoClaro}
                            title="Editar permisos y perfil"
                          >
                            ✏️
                          </button>
                          
                          <button 
                            onClick={() => eliminarUsuario(u.id, u.username || u.email)}
                            style={{ ...btnIconoRojo, opacity: u.id === perfil.id ? 0.3 : 1, cursor: u.id === perfil.id ? 'not-allowed' : 'pointer' }}
                            title={u.id === perfil.id ? "No podés eliminarte a vos mismo" : "Eliminar usuario"}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                  {usuarios.length === 0 && (
                    <tr>
                      <td colSpan={esSuperUser ? "5" : "4"} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
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

      {/* =========================================================
          MODAL DE EDICIÓN DE USUARIO (FLOTANTE)
      ========================================================= */}
      {usuarioEnEdicion && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', animation: 'fadeIn 0.2s' }}>
          <div className="bento-card" style={{ maxWidth: '500px', width: '100%', border: '1px solid var(--accent)', position: 'relative' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>EDITAR USUARIO</div>
              <button onClick={() => setUsuarioEnEdicion(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={guardarEdicion} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              {/* Campos de solo lectura para información */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', background: '#0a0a0a', padding: '15px', borderRadius: '4px', border: '1px dashed #333' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block' }}>USERNAME</label>
                  <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '0.9rem' }}>{usuarioEnEdicion.username || '-'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block' }}>EMAIL REGISTRADO</label>
                  <div style={{ color: '#fff', fontSize: '0.8rem', wordBreak: 'break-all' }}>{usuarioEnEdicion.email || '-'}</div>
                </div>
                <div style={{ gridColumn: 'span 2', fontSize: '0.65rem', color: '#888', fontStyle: 'italic', marginTop: '-5px' }}>
                  * El usuario y email no se pueden modificar por seguridad.
                </div>
              </div>

              <div className="input-field">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>NOMBRE COMPLETO</label>
                <input 
                  type="text" 
                  required 
                  value={usuarioEnEdicion.nombre_completo} 
                  onChange={e => setUsuarioEnEdicion({...usuarioEnEdicion, nombre_completo: e.target.value})} 
                  style={inputStyle} 
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: esSuperUser ? '1fr 1fr' : '1fr', gap: '15px' }}>
                <div className="input-field">
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>NUEVO ROL</label>
                  <select 
                    value={usuarioEnEdicion.rol} 
                    onChange={e => setUsuarioEnEdicion({...usuarioEnEdicion, rol: e.target.value})} 
                    style={inputStyle}
                  >
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
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block' }}>MOVER DE CLUB</label>
                    <select 
                      value={usuarioEnEdicion.club_id} 
                      onChange={e => setUsuarioEnEdicion({...usuarioEnEdicion, club_id: e.target.value})} 
                      style={inputStyle}
                    >
                      <option value="">Ninguno / Quitar Club</option>
                      {clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <button 
                type="submit" 
                disabled={procesando} 
                style={{ background: 'var(--accent)', color: '#000', padding: '15px', fontWeight: 900, border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}
              >
                {procesando ? 'GUARDANDO CAMBIOS...' : '💾 APLICAR CAMBIOS'}
              </button>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Estilos reutilizables
const inputStyle = { width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };
const btnIconoClaro = { background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s' };
const btnIconoRojo = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s' };

export default Usuarios;