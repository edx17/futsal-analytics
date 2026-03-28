import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Registro() {
  const [searchParams] = useSearchParams();
  const planElegido = searchParams.get('plan') || 'trial'; 
  
  const [formData, setFormData] = useState({
    nombreClub: '',
    nombreAdmin: '',
    apellidoAdmin: '',
    email: '',
    password: ''
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegistro = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Calcular el vencimiento (Trial = hoy + 10 días. Pro = hoy, porque tiene que pagar para activar)
      const fechaVencimiento = planElegido === 'trial' 
        ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() 
        : new Date().toISOString(); 

      // 2. Crear el usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error("No se pudo crear el usuario. Intentá nuevamente.");

      // 3. Crear el Club en la base de datos
      const { data: clubData, error: clubError } = await supabase
        .from('clubes')
        .insert([{
          nombre: formData.nombreClub,
          plan_actual: planElegido,
          suscripcion_activa: planElegido === 'trial', // Si es trial arranca activo, si es pro arranca inactivo hasta que pague
          fecha_vencimiento: fechaVencimiento
        }])
        .select()
        .single();

      if (clubError) throw new Error("Error al crear el club: " + clubError.message);

      // 4. Actualizar el perfil del Admin para vincularlo a su nuevo club
      // Supabase suele crear el perfil automáticamente mediante un Trigger, así que lo actualizamos.
      // Si no usás trigger, cambialo por .insert()
      const { error: perfilError } = await supabase
        .from('perfiles')
        .upsert([{ 
          id: authData.user.id, 
          nombre: formData.nombreAdmin, 
          apellido: formData.apellidoAdmin, 
          rol: 'admin', 
          club_id: clubData.id,
          email: formData.email
        }]);

      if (perfilError) throw new Error("Error al configurar tu perfil: " + perfilError.message);

      // 5. Redirección final
      if (planElegido === 'trial') {
        navigate('/inicio'); // El trial entra a usarlo directo
      } else {
        navigate('/mi-suscripcion'); // El Pro va a pagar
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', width: '100%', background: 'var(--bg)', padding: '20px' }}>
      <div style={{ background: 'var(--panel)', padding: '40px', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', maxWidth: '450px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px', fontFamily: 'Outfit', fontWeight: 900 }}>
          CREAR <span style={{ color: 'var(--accent)' }}>CUENTA</span>
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '30px' }}>
          Estás a punto de dar de alta el plan <strong style={{color: '#fff', textTransform: 'uppercase'}}>{planElegido}</strong>
        </p>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '15px', fontSize: '0.8rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '4px' }}>{error}</div>}
        
        <form onSubmit={handleRegistro} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>NOMBRE DEL CLUB</label>
            <input type="text" placeholder="Ej: Boca Juniors Futsal" value={formData.nombreClub} onChange={(e) => setFormData({...formData, nombreClub: e.target.value})} style={inputStyle} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>TU NOMBRE</label>
              <input type="text" placeholder="Ej: Lionel" value={formData.nombreAdmin} onChange={(e) => setFormData({...formData, nombreAdmin: e.target.value})} style={inputStyle} required />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>TU APELLIDO</label>
              <input type="text" placeholder="Ej: Scaloni" value={formData.apellidoAdmin} onChange={(e) => setFormData({...formData, apellidoAdmin: e.target.value})} style={inputStyle} required />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>EMAIL DE ACCESO</label>
            <input type="email" placeholder="tu@email.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} style={inputStyle} required />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>CONTRASEÑA (Min. 6 caracteres)</label>
            <input type="password" placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} style={inputStyle} minLength="6" required />
          </div>

          <button type="submit" disabled={loading} style={{ padding: '15px', background: 'var(--accent)', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', borderRadius: '4px', marginTop: '10px', transition: 'opacity 0.2s', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'CREANDO ENTORNO...' : 'COMENZAR AHORA'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-dim)' }}>¿Ya tenés cuenta? </span>
            <button type="button" onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Iniciá Sesión</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle = { padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };