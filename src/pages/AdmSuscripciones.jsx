import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';

function AdmSuscripciones() {
  const { perfil } = useAuth();
  const [clubes, setClubes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estado para el modal de edición
  const [clubSeleccionado, setClubSeleccionado] = useState(null);
  const [formData, setFormData] = useState({
    plan_actual: '',
    suscripcion_activa: false,
    fecha_vencimiento: ''
  });
  const [guardando, setGuardando] = useState(false);

  // Verificación de seguridad: Solo el SuperUser debería ver esto
  const esSuperUser = perfil?.rol === 'superuser';

  useEffect(() => {
    if (esSuperUser) {
      fetchClubes();
    }
  }, [perfil]);

  const fetchClubes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clubes')
      .select('id, nombre, plan_actual, suscripcion_activa, fecha_vencimiento')
      .order('nombre', { ascending: true });

    if (error) {
      console.error("Error cargando clubes:", error);
    } else {
      setClubes(data || []);
    }
    setLoading(false);
  };

  const abrirEdicion = (club) => {
    setClubSeleccionado(club);
    setFormData({
      plan_actual: club.plan_actual || 'trial',
      suscripcion_activa: club.suscripcion_activa || false,
      fecha_vencimiento: club.fecha_vencimiento || ''
    });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);

    const { error } = await supabase
      .from('clubes')
      .update({
        plan_actual: formData.plan_actual,
        suscripcion_activa: formData.suscripcion_activa,
        fecha_vencimiento: formData.fecha_vencimiento || null
      })
      .eq('id', clubSeleccionado.id);

    if (error) {
      alert("Error al actualizar: " + error.message);
    } else {
      alert("¡Suscripción actualizada con éxito!");
      setClubSeleccionado(null);
      fetchClubes(); // Recargar la tabla
    }
    setGuardando(false);
  };

  if (!esSuperUser) {
    return <div style={{ color: '#ef4444', textAlign: 'center', marginTop: '50px' }}>Acceso denegado. Solo para administradores del sistema.</div>;
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s', paddingBottom: '80px' }}>
      <div style={{ marginBottom: '30px' }}>
        <div className="stat-label" style={{ color: 'var(--text-dim)' }}>PANEL DE CONTROL MASTER</div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: '#c084fc' }}>ADMINISTRAR SUSCRIPCIONES</div>
      </div>

      <div className="bento-card">
        {loading ? (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Cargando clubes...</div>
        ) : (
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>CLUB</th>
                  <th style={{ padding: '10px' }}>PLAN</th>
                  <th style={{ padding: '10px' }}>ESTADO</th>
                  <th style={{ padding: '10px' }}>VENCIMIENTO</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {clubes.map(c => {
                  const diasRestantes = c.fecha_vencimiento 
                    ? Math.ceil((new Date(c.fecha_vencimiento) - new Date()) / (1000 * 60 * 60 * 24)) 
                    : 0;

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td style={{ padding: '15px 10px', fontWeight: 800, color: '#fff' }}>{c.nombre.toUpperCase()}</td>
                      <td style={{ padding: '15px 10px', color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase' }}>
                        {c.plan_actual || 'Básico'}
                      </td>
                      <td style={{ padding: '15px 10px' }}>
                        {c.suscripcion_activa ? (
                          <span style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '4px 8px', borderRadius: '4px', fontWeight: 800, fontSize: '0.7rem' }}>✅ ACTIVA</span>
                        ) : (
                          <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', fontWeight: 800, fontSize: '0.7rem' }}>🛑 SUSPENDIDA</span>
                        )}
                      </td>
                      <td style={{ padding: '15px 10px', color: 'var(--text-dim)' }}>
                        {c.fecha_vencimiento ? (
                          <>
                            {new Date(c.fecha_vencimiento).toLocaleDateString('es-AR')}
                            {c.suscripcion_activa && diasRestantes <= 5 && diasRestantes > 0 && <span style={{ color: '#facc15', marginLeft: '10px', fontSize: '0.7rem' }}>⚠️ ({diasRestantes}d)</span>}
                            {c.suscripcion_activa && diasRestantes <= 0 && <span style={{ color: '#ef4444', marginLeft: '10px', fontSize: '0.7rem' }}>❌ Vencida</span>}
                          </>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '15px 10px', textAlign: 'center' }}>
                        <button 
                          onClick={() => abrirEdicion(c)}
                          style={{ background: 'transparent', border: '1px solid #c084fc', color: '#c084fc', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', transition: '0.2s' }}
                          onMouseOver={(e) => { e.currentTarget.style.background = '#c084fc'; e.currentTarget.style.color = '#000'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#c084fc'; }}
                        >
                          ⚙️ GESTIONAR
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE EDICIÓN */}
      {clubSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ maxWidth: '500px', width: '100%', border: '1px solid #c084fc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>EDITAR CLUB: <span style={{ color: '#c084fc' }}>{clubSeleccionado.nombre}</span></div>
              <button onClick={() => setClubSeleccionado(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleGuardar} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '8px' }}>PLAN ASIGNADO</label>
                <select 
                  value={formData.plan_actual} 
                  onChange={(e) => setFormData({...formData, plan_actual: e.target.value})}
                  style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }}
                >
                  <option value="trial">Trial (Prueba)</option>
                  <option value="basico">Básico</option>
                  <option value="pro">Pro (Completo)</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '8px' }}>ESTADO DEL SERVICIO</label>
                <select 
                  value={formData.suscripcion_activa.toString()} 
                  onChange={(e) => setFormData({...formData, suscripcion_activa: e.target.value === 'true'})}
                  style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: formData.suscripcion_activa ? '#00ff88' : '#ef4444', borderRadius: '4px', outline: 'none', fontWeight: 800 }}
                >
                  <option value="true">✅ ACTIVO (Con Acceso)</option>
                  <option value="false">🛑 SUSPENDIDO (Sin Acceso)</option>
                </select>
                <p style={{ fontSize: '0.7rem', color: '#888', marginTop: '5px' }}>Si lo suspendés, los usuarios de este club no podrán cargar datos ni ver reportes.</p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '8px' }}>FECHA DE VENCIMIENTO</label>
                <input 
                  type="date" 
                  value={formData.fecha_vencimiento} 
                  onChange={(e) => setFormData({...formData, fecha_vencimiento: e.target.value})}
                  style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }}
                />
              </div>

              <button 
                type="submit" 
                disabled={guardando}
                style={{ background: '#c084fc', color: '#000', padding: '15px', fontWeight: 900, border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}
              >
                {guardando ? 'GUARDANDO CAMBIOS...' : '💾 APLICAR CAMBIOS'}
              </button>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdmSuscripciones;