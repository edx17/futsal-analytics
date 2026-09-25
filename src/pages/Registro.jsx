import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DIAS_TRIAL, planPorId } from '../utils/planes';

export default function Registro() {
  const [searchParams] = useSearchParams();
  const planElegido = searchParams.get('plan') || 'trial';
  const planInteres = planPorId(planElegido);   // null si vino sin plan o con uno viejo
  
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

  const [pendienteConfirmar, setPendienteConfirmar] = useState(false);

  /* El club y el perfil los crea la base al crearse la cuenta (trigger
     zz_vc_registrar_club, migración 20260929120000), con los datos que van
     en vc_registro. Desde el navegador no se puede crear un club ni darse un
     rol a uno mismo: antes esta pantalla lo intentaba y el alta fallaba. */
  const handleRegistro = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            vc_registro: {
              club: formData.nombreClub.trim(),
              nombre_completo: `${formData.nombreAdmin} ${formData.apellidoAdmin}`.trim(),
              plan_interes: planInteres ? planInteres.id : null,
            },
          },
        },
      });

      if (authError) throw new Error(authError.message);
      if (!data.user) throw new Error("No se pudo crear el usuario. Intentá nuevamente.");

      // Con confirmación por mail no hay sesión todavía: el club ya quedó
      // creado y se entra después de confirmar.
      if (!data.session) { setPendienteConfirmar(true); return; }

      // A usarlo. Nadie paga antes de probar.
      navigate('/inicio');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (pendienteConfirmar) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', width: '100%', background: 'var(--bg)', padding: '20px' }}>
        <div style={{ background: 'var(--panel)', padding: 'clamp(24px, 6vw, 40px)', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', maxWidth: '450px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>📬</div>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 900 }}>REVISÁ TU MAIL</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Te mandamos un link a <strong style={{ color: 'var(--text)' }}>{formData.email}</strong> para confirmar la cuenta.
            Tu club <strong style={{ color: 'var(--text)' }}>{formData.nombreClub}</strong> ya está creado: confirmá y entrá con tu mail y contraseña.
          </p>
          <button type="button" onClick={() => navigate('/login')} style={{ padding: '15px', background: 'var(--accent)', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', borderRadius: '4px', marginTop: '10px', width: '100%' }}>
            IR A INICIAR SESIÓN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', width: '100%', background: 'var(--bg)', padding: '20px' }}>
      <div style={{ background: 'var(--panel)', padding: 'clamp(24px, 6vw, 40px)', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', maxWidth: '450px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px', fontFamily: 'Outfit', fontWeight: 900 }}>
          CREAR <span style={{ color: 'var(--accent)' }}>CUENTA</span>
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '30px' }}>
          {DIAS_TRIAL} días gratis con todo desbloqueado. Sin tarjeta.
          {planInteres && <><br />Después seguís con el plan <strong style={{ color: 'var(--text)' }}>{planInteres.nombre}</strong>, si te sirve.</>}
        </p>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '15px', fontSize: '0.8rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '4px' }}>{error}</div>}
        
        <form onSubmit={handleRegistro} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>NOMBRE DEL CLUB</label>
            <input type="text" placeholder="Ej: Club Atlético Ejemplo" value={formData.nombreClub} onChange={(e) => setFormData({...formData, nombreClub: e.target.value})} style={inputStyle} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>TU NOMBRE</label>
              <input type="text" placeholder="Ej: Juan" value={formData.nombreAdmin} onChange={(e) => setFormData({...formData, nombreAdmin: e.target.value})} style={inputStyle} required />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>TU APELLIDO</label>
              <input type="text" placeholder="Ej: Pérez" value={formData.apellidoAdmin} onChange={(e) => setFormData({...formData, apellidoAdmin: e.target.value})} style={inputStyle} required />
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

const inputStyle = { padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', outline: 'none', fontSize: '16px' };