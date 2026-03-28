import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function MiSuscripcion() {
  const { perfil } = useAuth();
  const navigate = useNavigate();

  if (!perfil || !perfil.clubes) return <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>Cargando datos...</div>;

  const { nombre, plan_actual, suscripcion_activa, fecha_vencimiento } = perfil.clubes;

  // Formatear fecha (si existe)
  const fechaFormateada = fecha_vencimiento 
    ? new Date(fecha_vencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'No registrada';

  const diasRestantes = fecha_vencimiento 
    ? Math.ceil((new Date(fecha_vencimiento) - new Date()) / (1000 * 60 * 60 * 24))
    : 0;

  const esPrueba = plan_actual === 'trial';

  // --- FUNCIÓN PLACEHOLDER PARA MERCADO PAGO ---
  const handlePagarSuscripcion = () => {
    alert("Próximo paso: ¡Acá llamamos a la Edge Function de Supabase que abre Mercado Pago!");
    // Lógica de MP irá acá...
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px', margin: '0 auto', paddingBottom: '80px' }}>
      <div style={{ marginBottom: '30px' }}>
        <div className="stat-label" style={{ color: 'var(--text-dim)' }}>GESTIÓN ADMINISTRATIVA</div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>MI SUSCRIPCIÓN</div>
      </div>

      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* CABECERA DEL CLUB */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '1px' }}>CLUB ACTIVO</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>{nombre.toUpperCase()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '1px' }}>ESTADO DE CUENTA</div>
            {suscripcion_activa ? (
              <div style={{ color: '#00ff88', fontWeight: 900, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.5rem' }}>✅</span> AL DÍA
              </div>
            ) : (
              <div style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.5rem' }}>🛑</span> SUSPENDIDA
              </div>
            )}
          </div>
        </div>

        {/* DETALLES DEL PLAN */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '10px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '6px', border: '1px solid #333' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '5px' }}>PLAN ACTUAL</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: esPrueba ? '#facc15' : 'var(--accent)', textTransform: 'uppercase' }}>
              {plan_actual || 'Básico'}
            </div>
          </div>

          <div style={{ background: '#111', padding: '20px', borderRadius: '6px', border: '1px solid #333' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '5px' }}>PRÓXIMO VENCIMIENTO</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff' }}>
              {fechaFormateada}
            </div>
            {suscripcion_activa && diasRestantes > 0 && diasRestantes <= 5 && (
              <div style={{ color: '#facc15', fontSize: '0.8rem', marginTop: '5px', fontWeight: 'bold' }}>⚠️ Vence en {diasRestantes} días</div>
            )}
            {!suscripcion_activa && (
              <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '5px', fontWeight: 'bold' }}>⚠️ Pago atrasado</div>
            )}
          </div>
        </div>

        {/* ACCIONES DE PAGO */}
        <div style={{ background: 'rgba(0, 255, 136, 0.05)', padding: '25px', borderRadius: '6px', border: '1px solid var(--accent)', marginTop: '20px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>¿Querés renovar o mejorar tu plan?</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.5' }}>
            Mantené el acceso ininterrumpido a todas las herramientas de análisis, videotracking y gestión de tu club. El pago se procesa de forma 100% segura a través de Mercado Pago.
          </p>
          
          <button 
            onClick={handlePagarSuscripcion}
            style={{ 
              background: 'var(--accent)', color: '#000', padding: '15px 30px', fontSize: '1.1rem', 
              fontWeight: 900, border: 'none', borderRadius: '4px', cursor: 'pointer',
              boxShadow: '0 5px 15px rgba(0, 255, 136, 0.2)', transition: 'transform 0.2s'
            }}
            onMouseOver={(e) => e.target.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
          >
            💳 PAGAR SUSCRIPCIÓN CON MERCADO PAGO
          </button>
        </div>

      </div>
    </div>
  );
}

export default MiSuscripcion;