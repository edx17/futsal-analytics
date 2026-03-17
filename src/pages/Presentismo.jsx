import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

function Presentismo() {
  const clubId = localStorage.getItem('club_id');
  const [jugadores, setJugadores] = useState([]);
  const [categoria, setCategoria] = useState('');
  const [asistencias, setAsistencias] = useState({}); // { jugadorId: 'presente' }

  const cargarJugadores = async (cat) => {
    setCategoria(cat);
    const { data } = await supabase.from('jugadores').select('*').eq('club_id', clubId).eq('categoria', cat);
    setJugadores(data || []);
    // Inicializar todos como presentes por defecto
    const inicial = {};
    data?.forEach(j => inicial[j.id] = 'presente');
    setAsistencias(inicial);
  };

  const guardarAsistencia = async () => {
    const records = Object.keys(asistencias).map(jId => ({
      club_id: clubId,
      jugador_id: jId,
      estado: asistencias[jId],
      categoria: categoria,
      fecha: new Date().toISOString().split('T')[0]
    }));

    const { error } = await supabase.from('asistencias').insert(records);
    if (!error) alert("¡Asistencia guardada!");
  };

  return (
    <div className="bento-card">
      <div className="stat-label" style={{marginBottom: '20px'}}>📅 Control de Asistencia</div>
      <select onChange={(e) => cargarJugadores(e.target.value)} style={{marginBottom: '20px'}}>
        <option value="">Seleccionar Categoría...</option>
        <option value="Primera">Primera</option>
        <option value="Reserva">Reserva</option>
      </select>

      {jugadores.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>JUGADOR</th><th>ESTADO</th></tr>
            </thead>
            <tbody>
              {jugadores.map(j => (
                <tr key={j.id}>
                  <td>{j.apellido}, {j.nombre}</td>
                  <td>
                    <select 
                      value={asistencias[j.id]} 
                      onChange={(e) => setAsistencias({...asistencias, [j.id]: e.target.value})}
                      style={{padding: '5px', background: asistencias[j.id] === 'presente' ? '#004422' : '#440011'}}
                    >
                      <option value="presente">✅ PRESENTE</option>
                      <option value="ausente">❌ AUSENTE</option>
                      <option value="tarde">⏳ TARDE</option>
                      <option value="justificado">📝 JUSTIF.</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={guardarAsistencia} className="btn-action" style={{marginTop: '20px', width: '100%'}}>GUARDAR LISTA DE HOY</button>
        </div>
      )}
    </div>
  );
}
export default Presentismo;