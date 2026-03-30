import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [userHandle, setUserHandle] = useState(''); // Aquí guardamos el username o mail
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let emailParaLogin = userHandle.trim();

    try {
      // 1. Si el usuario NO escribió un @, asumimos que es un username.
      // Vamos a buscar su email real a la tabla de perfiles.
      if (!emailParaLogin.includes('@')) {
        const { data: perfilData, error: perfilError } = await supabase
          .from('perfiles')
          .select('email')
          .eq('username', emailParaLogin)
          .single();

        if (perfilError || !perfilData) {
          // Si no lo encuentra, probamos con el truco del mail ficticio por si fue creado por el panel de Usuarios
          emailParaLogin = `${emailParaLogin}@virtualstats.com`;
        } else {
          // Si lo encuentra, usamos el mail real que tiene cargado en su perfil
          emailParaLogin = perfilData.email;
        }
      }

      // 2. Ahora sí, hacemos el login en Supabase Auth con el email correcto
      const { data, error: authError } = await supabase.auth.signInWithPassword({ 
        email: emailParaLogin, 
        password: password 
      });

      if (authError) {
        throw new Error('Credenciales incorrectas. Verificá tu usuario y contraseña.');
      }

      if (data?.user) {
        navigate('/'); 
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100%', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--panel)', padding: '40px', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px', fontFamily: 'Outfit', fontWeight: 900 }}>
          VIRTUAL<span style={{ color: 'var(--accent)' }}>.CLUB</span>
        </h2>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '15px', fontSize: '0.8rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '4px' }}>{error}</div>}
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>USUARIO O EMAIL</label>
            <input
              type="text" 
              placeholder="Ingresá tu usuario o mail"
              value={userHandle}
              onChange={(e) => setUserHandle(e.target.value)}
              style={{ padding: '15px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>CONTRASEÑA</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: '15px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }}
              autoComplete="current-password"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              padding: '15px', 
              background: 'var(--accent)', 
              color: '#000', 
              fontWeight: 800, 
              border: 'none', 
              cursor: 'pointer', 
              borderRadius: '4px',
              marginTop: '10px',
              transition: 'opacity 0.2s'
            }}
          >
            {loading ? 'VALIDANDO...' : 'INGRESAR AL CLUB'}
          </button>
        </form>

        {/* --- NUEVO BOTÓN PARA IR AL MODO KIOSCO --- */}
        <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <button 
            type="button" // Importante para que no haga submit del form
            onClick={() => navigate('/kiosco')}
            style={{ 
              background: 'transparent', 
              border: '1px solid var(--border)', 
              color: 'var(--text-dim)', 
              padding: '12px 20px', 
              borderRadius: '4px', 
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 800,
              width: '100%',
              transition: 'color 0.2s, borderColor 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            📱 INGRESO RÁPIDO JUGADORES
          </button>
        </div>
      </div>
    </div>
  );
}