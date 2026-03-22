import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';

function Sponsors() {
  const { perfil } = useAuth();
  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const { showToast } = useToast();

  const rol = perfil?.rol?.toLowerCase() || '';
  const puedeEditar = ['admin', 'tesorero', 'superuser'].includes(rol);

  const [sponsors, setSponsors] = useState([]);
  const [jugadores, setJugadores] = useState([]); 
  const [cargando, setCargando] = useState(false);

  // Modales
  const [modalSponsor, setModalSponsor] = useState(false);
  const [formSponsor, setFormSponsor] = useState({ id: null, nombre: '', contacto_nombre: '', monto_aporte: '', periodicidad: 'mensual', estado: 'activo', fecha_vencimiento: '' });

  const [modalPago, setModalPago] = useState({ visible: false, sponsor: null });
  // Estados para la comisión (Añadido 'descripcion')
  const [formPago, setFormPago] = useState({ 
    monto: '', metodo_pago: 'Transferencia', fecha_pago: new Date().toISOString().split('T')[0], descripcion: '',
    aplicaComision: false, porcentajeComision: '', tipoReferido: 'jugador', jugadorReferidoId: '', nombreReferidoExterno: '' 
  });

  useEffect(() => {
    if (clubId) {
      fetchSponsors();
      fetchJugadores();
    }
  }, [clubId]);

  const fetchSponsors = async () => {
    const { data, error } = await supabase.from('sponsors').select('*').eq('club_id', clubId).order('nombre');
    if (!error) setSponsors(data || []);
  };

  const fetchJugadores = async () => {
    const { data } = await supabase.from('jugadores').select('id, nombre, apellido').eq('club_id', clubId).order('apellido');
    setJugadores(data || []);
  };

  const guardarSponsor = async () => {
    if (!formSponsor.nombre || !formSponsor.monto_aporte) return showToast("Nombre y monto son obligatorios.", "error");
    setCargando(true);
    try {
      const datosBD = { 
        club_id: clubId, nombre: formSponsor.nombre, contacto_nombre: formSponsor.contacto_nombre, 
        monto_aporte: parseFloat(formSponsor.monto_aporte), periodicidad: formSponsor.periodicidad, estado: formSponsor.estado, 
        fecha_vencimiento: formSponsor.fecha_vencimiento ? formSponsor.fecha_vencimiento : null 
      };

      let dbError;
      if (formSponsor.id) {
        const { error } = await supabase.from('sponsors').update(datosBD).eq('id', formSponsor.id); dbError = error;
      } else {
        const { error } = await supabase.from('sponsors').insert([datosBD]); dbError = error;
      }
      if (dbError) throw dbError;

      showToast(formSponsor.id ? "Sponsor actualizado." : "Sponsor registrado.", "success");
      setModalSponsor(false); fetchSponsors();
    } catch (error) { showToast(error.message || "Error al guardar.", "error"); } finally { setCargando(false); }
  };

  const registrarPago = async () => {
    const esEspecie = formPago.metodo_pago === 'Especie';
    const montoPagar = esEspecie ? 0 : parseFloat(formPago.monto);
    
    if (!esEspecie && (!montoPagar || montoPagar <= 0)) return showToast("Monto inválido.", "error");
    if (esEspecie && !formPago.descripcion) return showToast("Por favor, detallá en los comentarios qué entregó el sponsor.", "error");
    
    if (formPago.aplicaComision && !esEspecie) {
      if (!formPago.porcentajeComision || formPago.porcentajeComision <= 0) return showToast("Completá el porcentaje.", "error");
      if (formPago.tipoReferido === 'jugador' && !formPago.jugadorReferidoId) return showToast("Seleccioná un jugador.", "error");
      if (formPago.tipoReferido === 'externo' && !formPago.nombreReferidoExterno) return showToast("Ingresá el nombre del referido.", "error");
    }

    setCargando(true);
    try {
      // 1. Ingresa la totalidad del dinero (o el registro del canje) del Sponsor
      const { error: errSponsor } = await supabase.from('sponsors_pagos').insert([{
        club_id: clubId, sponsor_id: modalPago.sponsor.id, monto: montoPagar, 
        fecha_pago: formPago.fecha_pago, metodo_pago: formPago.metodo_pago, descripcion: formPago.descripcion
      }]);
      if (errSponsor) throw errSponsor;

      // 2. Si hay comisión y NO es en especie, crea un Egreso automático
      if (formPago.aplicaComision && !esEspecie) {
        const montoComision = (montoPagar * (parseFloat(formPago.porcentajeComision) / 100)).toFixed(2);
        let responsableNombre = '';
        let categoriaEgreso = '';

        if (formPago.tipoReferido === 'jugador') {
          const jug = jugadores.find(j => String(j.id) === String(formPago.jugadorReferidoId));
          responsableNombre = jug ? `${jug.apellido}, ${jug.nombre}` : 'Jugador Desconocido';
          categoriaEgreso = 'Sueldos y Viáticos'; 
        } else {
          responsableNombre = formPago.nombreReferidoExterno;
          categoriaEgreso = 'Comisiones / Terceros'; 
        }

        await supabase.from('tesoreria_egresos').insert([{
          club_id: clubId, categoria: categoriaEgreso, monto: montoComision, fecha: formPago.fecha_pago,
          responsable: responsableNombre, descripcion: `Comisión ${formPago.porcentajeComision}% por Sponsor: ${modalPago.sponsor.nombre}`
        }]);
      }

      showToast("Ingreso de sponsor registrado en Tesorería.", "success");
      setModalPago({ visible: false, sponsor: null });
    } catch (error) { showToast(error.message || "Error al registrar pago.", "error"); } finally { setCargando(false); }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', animation: 'fadeIn 0.3s', paddingBottom: '80px' }}>
      <div className="bento-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label" style={{ color: '#a855f7' }}>🤝 Alianzas Comerciales</div>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>SPONSORS Y SUBSIDIOS</h2>
          </div>
          {puedeEditar && (
            <button onClick={() => { setFormSponsor({ id: null, nombre: '', contacto_nombre: '', monto_aporte: '', periodicidad: 'mensual', estado: 'activo', fecha_vencimiento: '' }); setModalSponsor(true); }} style={{ background: '#a855f7', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              + AGREGAR SPONSOR
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {sponsors.map(s => {
            const estaVencido = s.fecha_vencimiento && new Date(s.fecha_vencimiento) < new Date();
            return (
              <div key={s.id} style={{ background: '#111', padding: '20px', borderRadius: '12px', border: `1px solid ${estaVencido ? '#ef4444' : '#333'}`, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ margin: '0 0 5px 0', color: '#fff' }}>{s.nombre.toUpperCase()}</h3>
                  {puedeEditar && <button onClick={() => { setFormSponsor(s); setModalSponsor(true); }} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1rem' }} title="Editar">✏️</button>}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '15px' }}>👤 {s.contacto_nombre || 'Sin contacto'}</div>
                <div style={{ background: '#0a0a0a', padding: '10px', borderRadius: '8px', border: '1px solid #222', marginBottom: '15px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>ACUERDO ({s.periodicidad.toUpperCase()})</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#a855f7' }}>${Number(s.monto_aporte).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '15px' }}>
                  <span style={{ color: s.estado === 'activo' ? '#00ff88' : '#f59e0b', fontWeight: 'bold', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>{s.estado.toUpperCase()}</span>
                  <span style={{ color: estaVencido ? '#ef4444' : '#888' }}>{s.fecha_vencimiento ? `Vence: ${s.fecha_vencimiento.split('-').reverse().join('/')}` : 'Sin vencimiento'}</span>
                </div>
                {puedeEditar && (
                  <button onClick={() => { setFormPago({ monto: s.monto_aporte, metodo_pago: 'Transferencia', fecha_pago: new Date().toISOString().split('T')[0], descripcion: '', aplicaComision: false, porcentajeComision: '', tipoReferido: 'jugador', jugadorReferidoId: '', nombreReferidoExterno: '' }); setModalPago({ visible: true, sponsor: s }); }} style={{ width: '100%', padding: '10px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', transition: '0.2s' }}>
                    💸 REGISTRAR COBRO
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL SPONSOR */}
      {puedeEditar && modalSponsor && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #a855f7' }}>
            <h3 style={{ marginTop: 0, color: '#a855f7' }}>{formSponsor.id ? 'Editar Sponsor' : 'Nuevo Sponsor'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
              <div><label style={lblStyle}>Empresa / Marca</label><input type="text" value={formSponsor.nombre} onChange={e => setFormSponsor({...formSponsor, nombre: e.target.value})} style={inputStyle} /></div>
              <div><label style={lblStyle}>Persona de Contacto</label><input type="text" value={formSponsor.contacto_nombre} onChange={e => setFormSponsor({...formSponsor, contacto_nombre: e.target.value})} style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}><label style={lblStyle}>Monto Acordado ($)</label><input type="number" value={formSponsor.monto_aporte} onChange={e => setFormSponsor({...formSponsor, monto_aporte: e.target.value})} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><label style={lblStyle}>Periodicidad</label><select value={formSponsor.periodicidad} onChange={e => setFormSponsor({...formSponsor, periodicidad: e.target.value})} style={inputStyle}><option value="mensual">Mensual</option><option value="anual">Anual</option><option value="unico">Pago Único</option><option value="especie">En Especie / Canje</option></select></div>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}><label style={lblStyle}>Estado</label><select value={formSponsor.estado} onChange={e => setFormSponsor({...formSponsor, estado: e.target.value})} style={inputStyle}><option value="activo">Activo</option><option value="inactivo">Inactivo / Pausado</option><option value="baja">Baja</option></select></div>
                <div style={{ flex: 1 }}><label style={lblStyle}>Fecha de Vencimiento</label><input type="date" value={formSponsor.fecha_vencimiento} onChange={e => setFormSponsor({...formSponsor, fecha_vencimiento: e.target.value})} style={inputStyle} /></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button onClick={() => setModalSponsor(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={guardarSponsor} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#a855f7', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>{cargando ? 'GUARDANDO...' : 'GUARDAR'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COBRO CON COMISIONES */}
      {puedeEditar && modalPago.visible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="bento-card" style={{ width: '450px', border: '1px solid #3b82f6', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, color: '#3b82f6' }}>Registrar Ingreso de Sponsor</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}><label style={lblStyle}>Fecha de Pago</label><input type="date" value={formPago.fecha_pago} onChange={e => setFormPago({...formPago, fecha_pago: e.target.value})} style={inputStyle} /></div>
                <div style={{ flex: 1 }}>
                  <label style={lblStyle}>Método de Recepción</label>
                  <select value={formPago.metodo_pago} onChange={e => setFormPago({...formPago, metodo_pago: e.target.value, aplicaComision: e.target.value === 'Especie' ? false : formPago.aplicaComision})} style={inputStyle}>
                    <option value="Transferencia">🏦 Transferencia</option>
                    <option value="Efectivo">💵 Efectivo</option>
                    <option value="Especie">📦 En Especies / Canje</option>
                  </select>
                </div>
              </div>

              {formPago.metodo_pago !== 'Especie' && (
                <div>
                  <label style={lblStyle}>Monto a ingresar en Caja ($)</label>
                  <input type="number" value={formPago.monto} onChange={e => setFormPago({...formPago, monto: e.target.value})} style={{...inputStyle, fontSize:'1.2rem', padding:'12px', borderColor:'#3b82f6'}} />
                </div>
              )}

              <div>
                <label style={lblStyle}>Comentarios / Detalle {formPago.metodo_pago === 'Especie' ? '(Ej: 10 pelotas, 5 pecheras)' : '(Opcional)'}</label>
                <textarea value={formPago.descripcion} onChange={e => setFormPago({...formPago, descripcion: e.target.value})} style={{...inputStyle, resize: 'none', height: '60px'}} placeholder={formPago.metodo_pago === 'Especie' ? "Describí qué entregó el sponsor..." : "Detalles adicionales..."} />
              </div>

              {/* SECCIÓN COMISIÓN (Oculta si es en especie porque no entra plata a repartir) */}
              {formPago.metodo_pago !== 'Especie' && (
                <div style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #333', marginTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: formPago.aplicaComision ? '#f59e0b' : '#fff' }}>
                    <input type="checkbox" checked={formPago.aplicaComision} onChange={(e) => setFormPago({...formPago, aplicaComision: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                    ¿Repartir comisión por este Sponsor?
                  </label>

                  {formPago.aplicaComision && (
                    <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fadeIn 0.3s' }}>
                      <div>
                        <label style={lblStyle}>Porcentaje de Comisión (%)</label>
                        <input type="number" placeholder="Ej: 10" value={formPago.porcentajeComision} onChange={e => setFormPago({...formPago, porcentajeComision: e.target.value})} style={inputStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>¿Quién trajo el Sponsor?</label>
                        <select value={formPago.tipoReferido} onChange={e => setFormPago({...formPago, tipoReferido: e.target.value})} style={inputStyle}>
                          <option value="jugador">Jugador del Club (Va como Viático)</option>
                          <option value="externo">Agente / Externo</option>
                        </select>
                      </div>

                      {formPago.tipoReferido === 'jugador' ? (
                        <div>
                          <label style={lblStyle}>Seleccionar Jugador</label>
                          <select value={formPago.jugadorReferidoId} onChange={e => setFormPago({...formPago, jugadorReferidoId: e.target.value})} style={inputStyle}>
                            <option value="">Seleccione un jugador...</option>
                            {jugadores.map(j => <option key={j.id} value={j.id}>{j.apellido}, {j.nombre}</option>)}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label style={lblStyle}>Nombre del Agente Externo</label>
                          <input type="text" placeholder="Nombre completo" value={formPago.nombreReferidoExterno} onChange={e => setFormPago({...formPago, nombreReferidoExterno: e.target.value})} style={inputStyle} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button onClick={() => setModalPago({visible: false, sponsor: null})} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={registrarPago} disabled={cargando} style={{ flex: 1, padding: '12px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>{cargando ? 'REGISTRANDO...' : 'CONFIRMAR COBRO'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lblStyle = { fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none' };

export default Sponsors;