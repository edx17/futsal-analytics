import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';

function Empleados() {
  const { perfil } = useAuth();
  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const { showToast } = useToast();

  const rol = perfil?.rol?.toLowerCase() || '';
  const puedeEditar = ['admin', 'tesorero', 'superuser'].includes(rol);

  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [form, setForm] = useState({
    id: null, nombre_completo: '', dni: '', telefono: '', direccion: '',
    cbu: '', alias: '', banco: '', rol: '', sueldo_base: '', fecha_ingreso: '', estado: 'Activo'
  });

  useEffect(() => {
    if (clubId) fetchEmpleados();
  }, [clubId]);

  const fetchEmpleados = async () => {
    setCargando(true);
    // Asumimos que la tabla se llama 'tesoreria_empleados' y filtraremos a los que NO son jugadores (staff puro)
    // O traemos a todos y mostramos un tag. Por ahora traemos a todos.
    const { data, error } = await supabase.from('tesoreria_empleados')
      .select('*').eq('club_id', clubId).order('nombre_completo');
    if (!error) setEmpleados(data || []);
    setCargando(false);
  };

  const guardarEmpleado = async () => {
    if (!form.nombre_completo || !form.rol || !form.sueldo_base) {
      return showToast("Nombre, rol y sueldo son obligatorios.", "error");
    }
    setCargando(true);
    try {
      const datosBD = {
        club_id: clubId, nombre_completo: form.nombre_completo, dni: form.dni, telefono: form.telefono,
        direccion: form.direccion, cbu: form.cbu, alias: form.alias, banco: form.banco,
        rol: form.rol, sueldo_base: parseFloat(form.sueldo_base), fecha_ingreso: form.fecha_ingreso || null, estado: form.estado
      };

      if (form.id) {
        await supabase.from('tesoreria_empleados').update(datosBD).eq('id', form.id);
        showToast("Ficha actualizada.", "success");
      } else {
        await supabase.from('tesoreria_empleados').insert([datosBD]);
        showToast("Empleado registrado.", "success");
      }
      setModalVisible(false);
      fetchEmpleados();
    } catch (error) {
      showToast("Error al guardar.", "error");
    } finally {
      setCargando(false);
    }
  };

  const abrirEdicion = (emp) => {
    setForm({
      id: emp.id, nombre_completo: emp.nombre_completo, dni: emp.dni || '', telefono: emp.telefono || '',
      direccion: emp.direccion || '', cbu: emp.cbu || '', alias: emp.alias || '', banco: emp.banco || '',
      rol: emp.rol, sueldo_base: emp.sueldo_base, fecha_ingreso: emp.fecha_ingreso || '', estado: emp.estado || 'Activo'
    });
    setModalVisible(true);
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', animation: 'fadeIn 0.3s', paddingBottom: '80px' }}>
      <div className="bento-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label" style={{ color: '#3b82f6' }}>Recursos Humanos</div>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>STAFF Y EMPLEADOS</h2>
          </div>
          {puedeEditar && (
            <button onClick={() => { setForm({ id: null, nombre_completo: '', dni: '', telefono: '', direccion: '', cbu: '', alias: '', banco: '', rol: '', sueldo_base: '', fecha_ingreso: '', estado: 'Activo' }); setModalVisible(true); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              + NUEVO EMPLEADO
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {empleados.map(emp => (
            <div key={emp.id} style={{ background: '#111', padding: '20px', borderRadius: '12px', border: `1px solid ${emp.estado === 'Activo' ? '#333' : '#ef4444'}`, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3 style={{ margin: '0 0 5px 0', color: '#fff' }}>{emp.nombre_completo}</h3>
                {puedeEditar && <button onClick={() => abrirEdicion(emp)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✏️</button>}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '15px' }}>{emp.rol.toUpperCase()}</div>
              
              <div style={{ fontSize: '0.8rem', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div>📱 {emp.telefono || 'Sin teléfono'} | 🪪 DNI: {emp.dni || 'S/D'}</div>
                <div>🏠 {emp.direccion || 'Sin dirección'}</div>
              </div>

              <div style={{ background: '#0a0a0a', padding: '10px', borderRadius: '8px', border: '1px solid #222', marginTop: '15px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>DATOS BANCARIOS</div>
                <div style={{ fontSize: '0.85rem', color: '#fff', marginTop: '5px' }}>🏦 {emp.banco || 'No registrado'}</div>
                <div style={{ fontSize: '0.85rem', color: '#fff' }}>🔄 CBU: <span style={{ fontFamily: 'monospace', color: '#00ff88' }}>{emp.cbu || 'N/A'}</span></div>
                <div style={{ fontSize: '0.85rem', color: '#fff' }}>🔤 Alias: <span style={{ fontFamily: 'monospace', color: '#a855f7' }}>{emp.alias || 'N/A'}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modalVisible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '600px', border: '1px solid #3b82f6', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, color: '#3b82f6' }}>{form.id ? 'Editar Ficha Laboral' : 'Alta de Personal'}</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lblStyle}>Nombre Completo</label><input type="text" value={form.nombre_completo} onChange={e => setForm({...form, nombre_completo: e.target.value})} style={inputStyle} /></div>
              
              <div><label style={lblStyle}>Rol / Cargo</label><input type="text" value={form.rol} onChange={e => setForm({...form, rol: e.target.value})} style={inputStyle} /></div>
              <div><label style={lblStyle}>Sueldo Base ($)</label><input type="number" value={form.sueldo_base} onChange={e => setForm({...form, sueldo_base: e.target.value})} style={inputStyle} /></div>
              
              <div><label style={lblStyle}>DNI</label><input type="text" value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} style={inputStyle} /></div>
              <div><label style={lblStyle}>Teléfono</label><input type="text" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} style={inputStyle} /></div>
              
              <div style={{ gridColumn: '1 / -1' }}><label style={lblStyle}>Dirección</label><input type="text" value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})} style={inputStyle} /></div>

              <div style={{ gridColumn: '1 / -1', background: '#111', padding: '10px', borderRadius: '6px', border: '1px solid #222', marginTop: '10px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '0.8rem' }}>DATOS BANCARIOS</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div><label style={lblStyle}>Banco</label><input type="text" value={form.banco} onChange={e => setForm({...form, banco: e.target.value})} style={inputStyle} placeholder="Ej: Galicia / MercadoPago" /></div>
                  <div><label style={lblStyle}>Alias</label><input type="text" value={form.alias} onChange={e => setForm({...form, alias: e.target.value})} style={inputStyle} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lblStyle}>CBU / CVU</label><input type="text" value={form.cbu} onChange={e => setForm({...form, cbu: e.target.value})} style={inputStyle} /></div>
                </div>
              </div>

              <div><label style={lblStyle}>Fecha de Ingreso</label><input type="date" value={form.fecha_ingreso} onChange={e => setForm({...form, fecha_ingreso: e.target.value})} style={inputStyle} /></div>
              <div>
                <label style={lblStyle}>Estado</label>
                <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} style={inputStyle}>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo / Baja</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button onClick={() => setModalVisible(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={guardarEmpleado} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>
                {cargando ? 'GUARDANDO...' : 'GUARDAR FICHA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lblStyle = { fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none' };

export default Empleados;