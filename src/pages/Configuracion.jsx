import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// IMPORTAMOS EL HOOK DE NOTIFICACIONES
import { useToast } from '../components/ToastContext';

function Configuracion() {
  const navigate = useNavigate();
  const { showToast } = useToast(); // INICIALIZAMOS TOAST

  const [clubName, setClubName] = useState(localStorage.getItem('mi_club') || '');
  const [clubId, setClubId] = useState(localStorage.getItem('club_id') || '');

  const handleGuardarClub = () => {
    if (!clubName.trim()) {
      showToast("El nombre del club es obligatorio.", "warning");
      return;
    }

    // Si no tiene ID de club, le generamos uno único (simulado con timestamp y random)
    let finalClubId = clubId;
    if (!finalClubId.trim()) {
      finalClubId = `club_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }

    localStorage.setItem('mi_club', clubName.toUpperCase());
    localStorage.setItem('club_id', finalClubId);
    
    setClubId(finalClubId);
    showToast('¡Club configurado con éxito! Ya podés empezar a usar el sistema.', 'success');
    navigate('/'); // Lo mandamos al Centro de Mando
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '600px', margin: '0 auto', paddingBottom: '80px' }}>
      
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '10px' }}>🏟️</div>
        <h2 style={{ color: 'var(--accent)', fontWeight: 900, textTransform: 'uppercase' }}>Configuración Institucional</h2>
        <p style={{ color: 'var(--text-dim)' }}>Establecé los datos de tu equipo o vinculá este dispositivo a un club existente.</p>
      </div>

      <div className="bento-card" style={{ marginBottom: '30px' }}>
        <div className="stat-label" style={{ marginBottom: '20px' }}>DATOS PRINCIPALES</div>
        
        <div style={{ marginBottom: '20px' }}>
          <div className="section-title" style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 800, marginBottom: '10px' }}>NOMBRE DE MI EQUIPO</div>
          <input 
            type="text" 
            value={clubName} 
            onChange={(e) => setClubName(e.target.value)} 
            placeholder="Ej: BOCA JUNIORS"
            style={{ width: '100%', padding: '15px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none', fontSize: '1.2rem', fontWeight: 800 }}
          />
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div className="section-title" style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 800, marginBottom: '10px' }}>ID DE CLUB (SISTEMA MULTI-DISPOSITIVO)</div>
          <input 
            type="text" 
            value={clubId} 
            onChange={(e) => setClubId(e.target.value)} 
            placeholder="Dejar en blanco para generar uno nuevo"
            style={{ width: '100%', padding: '15px', background: '#111', border: '1px dashed var(--accent)', color: 'var(--accent)', borderRadius: '4px', outline: 'none' }}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '10px' }}>
            *Si sos el DT y estás creando el club por primera vez, <strong>dejá este campo en blanco</strong>. Si sos ayudante, pegá acá el ID que te pasó el DT.
          </p>
        </div>

        <button onClick={handleGuardarClub} className="btn-action" style={{ width: '100%', padding: '20px', fontSize: '1.1rem' }}>
          GUARDAR Y ENTRAR AL SISTEMA
        </button>
      </div>
    </div>
  );
}

export default Configuracion;