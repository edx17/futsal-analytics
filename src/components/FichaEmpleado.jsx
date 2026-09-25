import React, { useState } from 'react';
import { supabase } from '../supabase';
import { FICHA_VACIA } from '../analytics/tesoreria';

/* ══════════════════════════════════════════════════════════════════════════
   FICHA DE EMPLEADO

   El único alta/edición de personal. La usan Empleados y las pestañas Staff
   y Viáticos de Tesorería, así la ficha tiene siempre los mismos datos (DNI,
   teléfono, banco) venga de donde venga.

   Si se elige un jugador, es un viático: aparece en la pestaña de viáticos.
   Si no, es staff.
   ══════════════════════════════════════════════════════════════════════════ */

export default function FichaEmpleado({ inicial, clubId, jugadores = [], color = '#3b82f6', onCerrar, onGuardado, showToast }) {
  const [form, setForm] = useState(() => ({ ...FICHA_VACIA, ...inicial }));
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const elegirJugador = (e) => {
    const id = e.target.value;
    const j = jugadores.find((x) => String(x.id) === id);
    setForm({
      ...form,
      jugador_id: id,
      nombre_completo: j ? `${j.nombre} ${j.apellido}` : form.nombre_completo,
      rol: j && !form.rol ? 'Jugador' : form.rol,
    });
  };

  const guardar = async () => {
    if (!form.nombre_completo.trim() || !form.rol.trim() || form.sueldo_base === '') {
      showToast?.('Nombre, rol y monto mensual son obligatorios.', 'error');
      return;
    }
    setGuardando(true);
    const datos = {
      club_id: clubId,
      nombre_completo: form.nombre_completo.trim(), rol: form.rol.trim(),
      sueldo_base: parseFloat(form.sueldo_base) || 0,
      jugador_id: form.jugador_id ? Number(form.jugador_id) : null,
      dni: form.dni || null, telefono: form.telefono || null, direccion: form.direccion || null,
      cbu: form.cbu || null, alias: form.alias || null, banco: form.banco || null,
      fecha_ingreso: form.fecha_ingreso || null, estado: form.estado || 'Activo',
    };
    const { error } = form.id
      ? await supabase.from('tesoreria_empleados').update(datos).eq('id', form.id)
      : await supabase.from('tesoreria_empleados').insert([datos]);
    setGuardando(false);
    if (error) {
      showToast?.(`No se pudo guardar: ${error.message}`, 'error');
      return;
    }
    showToast?.(form.id ? 'Ficha actualizada.' : 'Alta registrada.', 'success');
    onGuardado?.();
  };

  const esViatico = !!form.jugador_id;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '12px' }}>
      <div className="bento-card" style={{ width: '600px', maxWidth: '100%', border: `1px solid ${color}`, maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <h3 style={{ marginTop: 0, color }}>{form.id ? 'Editar ficha' : 'Alta de personal'}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '15px', marginTop: '15px' }}>
          <div style={{ gridColumn: '1 / -1', background: 'var(--panel)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <label style={{ ...lbl, color: '#3b82f6', fontWeight: 'bold' }}>¿Es jugador del club? (cobra viático)</label>
            <select value={form.jugador_id} onChange={elegirJugador} style={input}>
              <option value="">No, es staff / personal externo</option>
              {jugadores.map((j) => <option key={j.id} value={j.id}>{j.apellido}, {j.nombre}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Nombre completo</label><input type="text" value={form.nombre_completo} onChange={set('nombre_completo')} style={input} /></div>
          <div><label style={lbl}>Rol / cargo</label><input type="text" value={form.rol} onChange={set('rol')} style={input} placeholder={esViatico ? 'Jugador' : 'Ej: Preparador físico'} /></div>
          <div><label style={lbl}>{esViatico ? 'Viático mensual ($)' : 'Sueldo mensual ($)'}</label><input type="number" inputMode="decimal" value={form.sueldo_base} onChange={set('sueldo_base')} style={input} /></div>
          <div><label style={lbl}>DNI</label><input type="text" inputMode="numeric" value={form.dni} onChange={set('dni')} style={input} /></div>
          <div><label style={lbl}>Teléfono</label><input type="tel" value={form.telefono} onChange={set('telefono')} style={input} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Dirección</label><input type="text" value={form.direccion} onChange={set('direccion')} style={input} /></div>

          <div style={{ gridColumn: '1 / -1', background: 'var(--panel)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-dim)', fontSize: '0.8rem' }}>DATOS BANCARIOS</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: '10px' }}>
              <div><label style={lbl}>Banco</label><input type="text" value={form.banco} onChange={set('banco')} style={input} placeholder="Ej: Galicia / Mercado Pago" /></div>
              <div><label style={lbl}>Alias</label><input type="text" value={form.alias} onChange={set('alias')} style={input} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>CBU / CVU</label><input type="text" inputMode="numeric" value={form.cbu} onChange={set('cbu')} style={input} /></div>
            </div>
          </div>

          <div><label style={lbl}>Fecha de ingreso</label><input type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} style={input} /></div>
          <div>
            <label style={lbl}>Estado</label>
            <select value={form.estado} onChange={set('estado')} style={input}>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo / Baja</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
          <button onClick={onCerrar} disabled={guardando} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', cursor: 'pointer', minHeight: '44px' }}>CANCELAR</button>
          <button onClick={guardar} disabled={guardando} style={{ flex: 1, padding: '12px', background: color, border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', minHeight: '44px' }}>
            {guardando ? 'GUARDANDO…' : 'GUARDAR FICHA'}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl = { fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' };
const input = { width: '100%', padding: '10px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', boxSizing: 'border-box' };
