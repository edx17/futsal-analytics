import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import axios from 'axios';

const VideoTracingIA = () => {
  const clubId = localStorage.getItem('club_id');

  const [partidos, setPartidos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [selectedPartido, setSelectedPartido] = useState('');
  
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [publicStorageUrl, setPublicStorageUrl] = useState('');
  const [points, setPoints] = useState([]);
  
  const [uploading, setUploading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  
  const [uniqueTrackerIds, setUniqueTrackerIds] = useState([]);
  const [idMapping, setIdMapping] = useState({});
  const [saving, setSaving] = useState(false);

  const [mappingMode, setMappingMode] = useState(false);
  const [hoveredTrackerId, setHoveredTrackerId] = useState(null);

  const videoRef = useRef(null);
  const radarRef = useRef(null);

  const COURT_WIDTH = 40;
  const COURT_HEIGHT = 20;
  const API_URL = import.meta.env.VITE_IA_API_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    if (!clubId) return;
    const fetchContextData = async () => {
      const { data: pData } = await supabase.from('partidos').select('id, rival, fecha, categoria').eq('club_id', clubId).order('created_at', { ascending: false });
      if (pData) setPartidos(pData);
      const { data: jData } = await supabase.from('jugadores').select('id, nombre, apellido, dorsal').eq('club_id', clubId);
      if (jData) setJugadores(jData);
    };
    fetchContextData();
  }, [clubId]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setPoints([]);
      setAnalysisData(null);
      setUniqueTrackerIds([]);
      setIdMapping({});
      setMappingMode(false);
    }
  };

  const handleVideoClick = (e) => {
    if (points.length >= 4 || mappingMode) return;
    const rect = videoRef.current.getBoundingClientRect();
    const scaleX = videoRef.current.videoWidth / rect.width;
    const scaleY = videoRef.current.videoHeight / rect.height;
    const renderX = e.clientX - rect.left;
    const renderY = e.clientY - rect.top;
    const actualX = renderX * scaleX;
    const actualY = renderY * scaleY;
    setPoints([...points, { renderX, renderY, actualX, actualY }]);
  };

  const processVideo = async () => {
    if (!selectedPartido || points.length !== 4) return;
    setUploading(true);

    try {
      const fileName = `${Date.now()}_${videoFile.name}`;
      const { error } = await supabase.storage.from('futsal_videos').upload(fileName, videoFile);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('futsal_videos').getPublicUrl(fileName);
      setPublicStorageUrl(publicUrl);

      const sourcePoints = points.map(p => [p.actualX, p.actualY]);

      const response = await axios.post(`${API_URL}/analyze`, {
        url: publicUrl,
        source_points: sourcePoints
      });

      const rawData = response.data.data;
      setAnalysisData(rawData);
      
      const ids = new Set();
      rawData.forEach(f => f.players.forEach(p => ids.add(p.id)));
      setUniqueTrackerIds(Array.from(ids).filter(id => id !== -1).sort((a,b) => a-b));

      setMappingMode(true);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }

    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const guardarAnalisisBD = async () => {
    setSaving(true);
    try {
      const finalData = analysisData.map(frame => ({
        ...frame,
        players: frame.players.map(p => ({
          ...p,
          jugador_id: idMapping[p.id] || null 
        }))
      }));

      const { error } = await supabase.from('tactical_analysis').insert({
        match_id: selectedPartido,
        video_url: publicStorageUrl,
        frame_data: finalData,
        metadata: { 
            calibracion: points.map(p => [p.actualX, p.actualY]),
            mapa_ids: idMapping
        }
      });

      if (error) throw error;
      setMappingMode(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!analysisData || !videoRef.current || !radarRef.current) return;
    
    const render = () => {
      const currentTime = mappingMode ? 0 : videoRef.current.currentTime;
      const frameIndex = Math.floor(currentTime * 30);
      const frameData = analysisData.find(f => f.frame === frameIndex) || analysisData[0];
      const ctx = radarRef.current.getContext('2d');
      const { width, height } = radarRef.current;
      
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 30, 0, Math.PI * 2);
      ctx.stroke();

      if (frameData) {
        frameData.players.forEach(p => {
          const x = (p.x / COURT_WIDTH) * width;
          const y = (p.y / COURT_HEIGHT) * height;

          const esIdentificado = idMapping[p.id];
          const isHovered = hoveredTrackerId === p.id;
          
          ctx.beginPath();
          ctx.arc(x, y, isHovered ? 18 : 12, 0, Math.PI * 2);
          ctx.fillStyle = esIdentificado ? 'rgba(0, 255, 136, 0.2)' : 'rgba(250, 204, 21, 0.2)'; 
          if (isHovered) ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = esIdentificado ? '#00ff88' : '#facc15'; 
          if (isHovered) ctx.fillStyle = '#ffffff';
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.font = 'bold 10px "Outfit"';
          
          let label = p.id !== -1 ? p.id : '?';
          if (esIdentificado) {
              const jug = jugadores.find(j => j.id === idMapping[p.id]);
              if (jug) label = jug.dorsal?.toString() || label;
          }
          ctx.fillText(label, x - 4, y + 3);
        });
      }
      requestAnimationFrame(render); 
    };
    const animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [analysisData, idMapping, jugadores, mappingMode, hoveredTrackerId]);

  return (
    <div className="responsive-layout">
      <div style={{ width: '100%', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900 }}>TRACKING IA</h1>
        <div className="stat-label">Motor de Visión Artificial YOLOv8</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px', width: '100%' }}>
        
        <section className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div className="stat-label" style={{ color: '#00ff88' }}>1. CONTEXTO Y CALIBRACIÓN</div>
          
          <select value={selectedPartido} onChange={(e) => setSelectedPartido(e.target.value)} disabled={mappingMode} style={{ background: '#000', border: '1px solid #222', padding: '10px', color: '#fff' }}>
            <option value="">Seleccionar Partido...</option>
            {partidos.map(p => <option key={p.id} value={p.id}>{p.fecha} - vs {p.rival}</option>)}
          </select>

          <input type="file" accept="video/mp4" onChange={handleFileChange} disabled={mappingMode} style={{ background: '#000', border: '1px solid #222', padding: '10px', color: '#fff' }} />
          
          {videoUrl && (
            <div style={{ position: 'relative', width: '100%', background: '#000', border: '1px solid #222' }}>
              <video ref={videoRef} src={videoUrl} onClick={handleVideoClick} controls={!mappingMode} style={{ width: '100%', display: 'block' }} />
              {!mappingMode && points.map((p, i) => (
                <div key={i} style={{ position: 'absolute', width: '12px', height: '12px', backgroundColor: 'red', borderRadius: '50%', left: `${p.renderX - 6}px`, top: `${p.renderY - 6}px` }} />
              ))}
            </div>
          )}

          {!mappingMode && (
             <button onClick={processVideo} disabled={uploading || points.length !== 4 || !selectedPartido} className="btn-action">
               {uploading ? 'PROCESANDO...' : 'INICIAR TRACKING'}
             </button>
          )}
        </section>

        {mappingMode && (
          <section className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="stat-label" style={{ color: '#00ff88' }}>2. CONGELAMIENTO E IDENTIFICACIÓN (FRAME 0)</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>El video ha sido pausado. Asigne las identidades observando las posiciones iniciales en el radar.</div>
            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {uniqueTrackerIds.map(tId => (
                <div 
                  key={tId} 
                  onMouseEnter={() => setHoveredTrackerId(tId)}
                  onMouseLeave={() => setHoveredTrackerId(null)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: hoveredTrackerId === tId ? '#222' : '#111', padding: '10px', border: '1px solid #333' }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: idMapping[tId] ? '#00ff88' : '#facc15' }}>ID IA: {tId}</span>
                  <select 
                    value={idMapping[tId] || ''}
                    onChange={(e) => setIdMapping(prev => ({ ...prev, [tId]: parseInt(e.target.value) }))}
                    style={{ background: '#000', border: '1px solid #333', padding: '6px', color: '#fff', fontSize: '0.8rem', width: '180px' }}
                  >
                    <option value="">Rival / Desconocido</option>
                    {jugadores.map(j => <option key={j.id} value={j.id}>#{j.dorsal} {j.apellido}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={guardarAnalisisBD} disabled={saving} className="btn-action" style={{ background: '#3b82f6' }}>
              CONFIRMAR IDENTIDADES Y GUARDAR
            </button>
          </section>
        )}

        <section className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', gridColumn: '1 / -1' }}>
          <div className="stat-label" style={{ color: '#00ff88' }}>RADAR TÁCTICO 2D</div>
          <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', aspectRatio: '2/1', backgroundColor: '#050505', position: 'relative' }}>
             <canvas ref={radarRef} width={800} height={400} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </section>

      </div>
    </div>
  );
};

export default VideoTracingIA;