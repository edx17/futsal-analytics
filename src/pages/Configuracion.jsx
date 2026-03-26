import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase'; // IMPORTAMOS SUPABASE
import { useToast } from '../components/ToastContext';

function Configuracion() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [clubName, setClubName] = useState(localStorage.getItem('mi_club') || '');
  const [clubId, setClubId] = useState(localStorage.getItem('club_id') || '');
  const [escudoUrl, setEscudoUrl] = useState(localStorage.getItem('escudo_url') || '');
  const [subiendo, setSubiendo] = useState(false);

  // Al cargar, buscamos si ya existe el club en la base para traer su escudo
  useEffect(() => {
    if (clubId) {
      const fetchClub = async () => {
        const { data } = await supabase.from('clubes').select('nombre, escudo_url').eq('id', clubId).single();
        if (data) {
          if (data.nombre) setClubName(data.nombre);
          if (data.escudo_url) setEscudoUrl(data.escudo_url);
        }
      };
      fetchClub();
    }
  }, [clubId]);

  // FUNCIÓN PARA SUBIR ESCUDO AL STORAGE
  const handleSubirEscudo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSubiendo(true);
    try {
      // Si no hay ID, creamos uno provisorio para nombrar la imagen
      let tempClubId = clubId;
      if (!tempClubId.trim()) {
        tempClubId = `club_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        setClubId(tempClubId);
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `escudo_${tempClubId}_${Date.now()}.${fileExt}`;

      // Subimos al bucket "escudos"
      const { error: uploadError } = await supabase.storage
        .from('escudos')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      // Obtenemos la URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('escudos')
        .getPublicUrl(fileName);

      setEscudoUrl(publicUrl);
      showToast('Escudo cargado correctamente. ¡No te olvides de Guardar!', 'success');
    } catch (error) {
      showToast('Error al subir el escudo: ' + error.message, 'error');
    } finally {
      setSubiendo(false);
    }
  };

  const handleGuardarClub = async () => {
    if (!clubName.trim()) {
      showToast("El nombre del club es obligatorio.", "warning");
      return;
    }

    let finalClubId = clubId;
    if (!finalClubId.trim()) {
      finalClubId = `club_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }

    try {
      // Guardamos o actualizamos (UPSERT) en la base de datos
      const { error } = await supabase.from('clubes').upsert({
        id: finalClubId,
        nombre: clubName.toUpperCase(),
        escudo_url: escudoUrl
      }, { onConflict: 'id' });

      if (error) throw error;

      // Actualizamos Storage Local
      localStorage.setItem('mi_club', clubName.toUpperCase());
      localStorage.setItem('club_id', finalClubId);
      if (escudoUrl) localStorage.setItem('escudo_url', escudoUrl);
      
      setClubId(finalClubId);
      showToast('¡Club configurado con éxito!', 'success');
      navigate('/'); 
    } catch (error) {
      showToast('Error al guardar: ' + error.message, 'error');
    }
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
        
        {/* ESCUDO DEL CLUB */}
        <div style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#111', border: '2px dashed var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '15px' }}>
            {subiendo ? (
              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Subiendo...</span>
            ) : escudoUrl ? (
              <img src={escudoUrl} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '2.5rem' }}>🛡️</span>
            )}
          </div>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleSubirEscudo} 
            id="file-escudo" 
            style={{ display: 'none' }} 
          />
          <label htmlFor="file-escudo" className="btn-secondary" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
            {escudoUrl ? 'CAMBIAR ESCUDO' : 'SUBIR ESCUDO'}
          </label>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div className="section-title" style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 800, marginBottom: '10px' }}>NOMBRE DE MI CLUB</div>
          <input 
            type="text" 
            value={clubName} 
            onChange={(e) => setClubName(e.target.value)} 
            placeholder="Nombre de mi Club"
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
            *Si estás creando el club por primera vez, <strong>ingresá el ID que te informamos.</strong>. Si tenes problemas para vincular tu club, contactanos.
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