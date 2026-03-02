import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Intento de login directo con Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({ 
        email: email, 
        password: password 
      });

      if (authError) {
        throw new Error('Credenciales incorrectas o usuario no registrado.');
      }

      if (data?.user) {
        navigate('/temporada');
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
        <h2 style={{ textAlign: 'center', marginBottom: '30px', fontFamily: 'Outfit' }}>
          VIRTUAL<span style={{ color: 'var(--accent)' }}>.STATS</span>
        </h2>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '15px', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <input
            type="email"
            placeholder="Correo Electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '15px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '15px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' }}
            autoComplete="current-password"
            required
          />
          <button 
            type="submit" 
            disabled={loading}
            style={{ padding: '15px', background: 'var(--accent)', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          >
            {loading ? 'ACCEDIENDO...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  );
}