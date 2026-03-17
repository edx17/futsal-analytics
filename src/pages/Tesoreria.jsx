import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

function Tesoreria() {
  const clubId = localStorage.getItem('club_id');
  const [movimientos, setMovimientos] = useState([]);
  const [form, setForm] = useState({ tipo: 'ingreso', monto: '', categoria: 'cuota', descripcion: '' });

  useEffect(() => { fetchMovimientos(); }, []);

  async function fetchMovimientos() {
    const { data } = await supabase.from('movimientos_caja').select('*').eq('club_id', clubId).order('fecha', { ascending: false });
    setMovimientos(data || []);
  }

  const registrar = async (e) => {
    e.preventDefault();
    await supabase.from('movimientos_caja').insert([{ ...form, club_id: clubId }]);
    setForm({ tipo: 'ingreso', monto: '', categoria: 'cuota', descripcion: '' });
    fetchMovimientos();
  };

  const balance = movimientos.reduce((acc, m) => m.tipo === 'ingreso' ? acc + Number(m.monto) : acc - Number(m.monto), 0);

  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px'}}>
      <div className="bento-card">
        <div className="stat-label">Nuevo Movimiento</div>
        <form onSubmit={registrar} style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px'}}>
          <select value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
            <option value="ingreso">🟢 INGRESO</option>
            <option value="egreso">🔴 EGRESO</option>
          </select>
          <input type="number" placeholder="Monto $" value={form.monto} onChange={e => setForm({...form, monto: e.target.value})} required />
          <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
            <option value="cuota">CUOTA SOCIAL</option>
            <option value="sueldo">SUELDOS</option>
            <option value="sponsor">SPONSOR</option>
            <option value="materiales">MATERIALES</option>
            <option value="alquiler">ALQUILER CANCHA</option>
          </select>
          <textarea placeholder="Descripción..." value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} />
          <button type="submit" className="btn-action">REGISTRAR</button>
        </form>
      </div>

      <div className="bento-card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
            <div className="stat-label">Historial de Caja</div>
            <div style={{fontSize: '1.5rem', fontWeight: 900, color: balance >= 0 ? 'var(--accent)' : '#ef4444'}}>
                SALDO: ${balance.toLocaleString()}
            </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>FECHA</th><th>TIPO</th><th>CATEGORÍA</th><th>MONTO</th></tr></thead>
            <tbody>
              {movimientos.map(m => (
                <tr key={m.id}>
                  <td>{m.fecha}</td>
                  <td style={{color: m.tipo === 'ingreso' ? '#00ff88' : '#ef4444'}}>{m.tipo.toUpperCase()}</td>
                  <td>{m.categoria.toUpperCase()}</td>
                  <td style={{fontWeight: 800}}>${Number(m.monto).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
export default Tesoreria;