import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import FichaEmpleado from '../components/FichaEmpleado';
import { manejaPlata, FICHA_VACIA, fichaDe } from '../analytics/tesoreria';
import { Icono } from '../iconos';

function Empleados() {
  const { perfil } = useAuth();
  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const { showToast } = useToast();

  const puedeEditar = manejaPlata(perfil?.rol);

  const [empleados, setEmpleados] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [ficha, setFicha] = useState(null); // null = cerrada; objeto = abierta

  useEffect(() => {
    if (clubId) fetchEmpleados();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  // Todos: staff y jugadores con viático (a estos se les pone una etiqueta).
  const fetchEmpleados = async () => {
    const [{ data, error }, { data: jubs }] = await Promise.all([
      supabase.from('tesoreria_empleados').select('*').eq('club_id', clubId).order('nombre_completo'),
      supabase.from('jugadores').select('id, nombre, apellido').eq('club_id', clubId).neq('activo', false).order('apellido'),
    ]);
    if (!error) setEmpleados(data || []);
    setJugadores(jubs || []);
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
            <button onClick={() => setFicha({ ...FICHA_VACIA })} style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              + NUEVO EMPLEADO
            </button>
          )}
        </div>

        {empleados.length === 0 && (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px 0' }}>Todavía no hay personal cargado.</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: '20px' }}>
          {empleados.map(emp => (
            <div key={emp.id} style={{ background: 'var(--panel)', padding: '20px', borderRadius: '12px', border: `1px solid ${emp.estado === 'Activo' ? 'var(--border)' : '#ef4444'}`, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3 style={{ margin: '0 0 5px 0', color: 'var(--text)' }}>{emp.nombre_completo}</h3>
                {puedeEditar && <button aria-label="Editar" onClick={() => setFicha(fichaDe(emp))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}><Icono nombre="editar" size="1.2em" relleno="propio" /></button>}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '15px' }}>
                {(emp.rol || '').toUpperCase()}
                {emp.jugador_id && <span style={{ marginLeft: '8px', color: '#a855f7', border: '1px solid #a855f7', borderRadius: '4px', padding: '1px 6px', fontSize: '0.65rem' }}>VIÁTICO · JUGADOR</span>}
                {emp.estado && emp.estado !== 'Activo' && <span style={{ marginLeft: '8px', color: '#ef4444', fontSize: '0.65rem' }}>BAJA</span>}
              </div>
              
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div><Icono nombre="celular" size="1.2em" relleno="propio" style={{ marginRight: 6 }} />{emp.telefono || 'Sin teléfono'} | <Icono nombre="identificacion" size="1.2em" relleno="propio" style={{ marginRight: 6 }} />DNI: {emp.dni || 'S/D'}</div>
                <div><Icono nombre="inicio" size="1.2em" relleno="propio" style={{ marginRight: 6 }} />{emp.direccion || 'Sin dirección'}</div>
              </div>

              <div style={{ background: 'var(--panel)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '15px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>DATOS BANCARIOS</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)', marginTop: '5px' }}><Icono nombre="banco" size="1.2em" relleno="propio" style={{ marginRight: 6 }} />{emp.banco || 'No registrado'}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}><Icono nombre="banco" size="1.2em" relleno="propio" style={{ marginRight: 6 }} />CBU: <span style={{ fontFamily: 'monospace', color: '#00ff88' }}>{emp.cbu || 'N/A'}</span></div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}><Icono nombre="texto" size="1.2em" relleno="propio" style={{ marginRight: 6 }} />Alias: <span style={{ fontFamily: 'monospace', color: '#a855f7' }}>{emp.alias || 'N/A'}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {ficha && (
        <FichaEmpleado
          inicial={ficha}
          clubId={clubId}
          jugadores={jugadores}
          onCerrar={() => setFicha(null)}
          onGuardado={() => { setFicha(null); fetchEmpleados(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}


export default Empleados;