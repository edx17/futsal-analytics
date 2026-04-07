import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [userHandle, setUserHandle] = useState(''); // Username o mail
  const [password, setPassword] = useState('');
  const [otpToken, setOtpToken] = useState('');
  
  // Estados de la interfaz
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pasoOtp, setPasoOtp] = useState(false); // true = esperando que ponga el PIN
  
  const navigate = useNavigate();

  // Función auxiliar: descubre el mail real si el usuario puso un username
  const obtenerEmailReal = async (input) => {
    let email = input.trim();
    if (!email.includes('@')) {
      const { data } = await supabase.from('perfiles').select('email').eq('username', email).single();
      email = data ? data.email : `${email}@virtualstats.com`;
    }
    return email;
  };

  // 🔴 OPCIÓN A: LOGIN CON CONTRASEÑA CLÁSICO
  const handleLoginPassword = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const emailReal = await obtenerEmailReal(userHandle);
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: emailReal, password });
      if (authError) throw new Error('Credenciales incorrectas. Verificá tu usuario y contraseña.');
      if (data?.user) navigate('/'); 
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔵 OPCIÓN B.1: PEDIR PIN AL MAIL (OTP)
  const handlePedirPIN = async (e) => {
    e.preventDefault(); // Evitamos que intente loguear con contraseña vacía
    if (!userHandle) { setError('Ingresá tu usuario o email primero para pedir el PIN.'); return; }
    setLoading(true); setError('');
    try {
      const emailReal = await obtenerEmailReal(userHandle);
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: emailReal });
      if (otpError) throw new Error('Error al enviar el PIN. Asegurate de que el correo exista.');
      
      setPasoOtp(true); // Cambiamos la pantalla para que ingrese el PIN
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔵 OPCIÓN B.2: VERIFICAR EL PIN INGRESADO
  const handleVerificarPIN = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const emailReal = await obtenerEmailReal(userHandle);
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ email: emailReal, token: otpToken, type: 'email' });
      if (verifyError) throw new Error('PIN incorrecto o vencido.');
      if (data?.session) navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🟡 OPCIÓN C: LOGIN CON GOOGLE
  const handleGoogleLogin = async () => {
    setLoading(true); setError('');
    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({ 
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (googleError) throw new Error('No se pudo iniciar con Google.');
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', width: '100%', background: 'var(--bg)', padding: '20px' }}>
      <div style={{ background: 'var(--panel)', padding: '40px', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px', fontFamily: 'Outfit', fontWeight: 900 }}>
          VIRTUAL<span style={{ color: 'var(--accent)' }}>.CLUB</span>
        </h2>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '15px', fontSize: '0.8rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '4px' }}>{error}</div>}
        
        {!pasoOtp ? (
          // --- PANTALLA PRINCIPAL DE LOGIN ---
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <button type="button" onClick={handleGoogleLogin} disabled={loading} style={btnGoogle}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style={{ width: '20px' }}/>
              Ingresar con Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div> O CON TU CUENTA <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            </div>

            <form onSubmit={handleLoginPassword} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>USUARIO O EMAIL</label>
                <input type="text" placeholder="Ingresá tu usuario o mail" value={userHandle} onChange={(e) => setUserHandle(e.target.value)} style={inputStyle} required />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>CONTRASEÑA</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" disabled={loading} style={{ ...btnSubmit, flex: 1 }}>
                  {loading && password ? '...' : 'ENTRAR'}
                </button>
                <button type="button" onClick={handlePedirPIN} disabled={loading} style={{ ...btnSecundario, flex: 1, fontSize: '0.75rem', padding: '10px' }}>
                  PIN AL MAIL
                </button>
              </div>
            </form>
          </div>
        ) : (
          // --- PANTALLA DE INGRESO DE PIN AL MAIL ---
          <form onSubmit={handleVerificarPIN} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center', color: 'var(--accent)', fontSize: '2rem' }}>✉️</div>
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-dim)', margin: 0 }}>
              Te enviamos un código de 6 dígitos a tu correo asociado.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input type="text" placeholder="000000" value={otpToken} onChange={(e) => setOtpToken(e.target.value)} style={{ ...inputStyle, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '5px' }} required maxLength={6} />
            </div>
            <button type="submit" disabled={loading} style={btnSubmit}>
              {loading ? 'VALIDANDO...' : 'VERIFICAR Y ENTRAR'}
            </button>
            <button type="button" onClick={() => setPasoOtp(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>Volver atrás</button>
          </form>
        )}

        {/* --- BOTÓN PARA IR AL MODO KIOSCO DE VESTUARIO --- */}
        <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <button 
            type="button" 
            onClick={() => navigate('/kiosco')}
            style={{ 
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '12px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, width: '100%', transition: 'color 0.2s, borderColor 0.2s' 
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            📱 KIOSCO / VESTUARIO
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = { padding: '15px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };
const btnSubmit = { padding: '15px', background: 'var(--accent)', color: '#000', fontWeight: 900, border: 'none', cursor: 'pointer', borderRadius: '4px' };
const btnSecundario = { background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontWeight: 800, cursor: 'pointer', borderRadius: '4px' };
const btnGoogle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px', background: '#fff', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', borderRadius: '4px', fontSize: '0.9rem' };