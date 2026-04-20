import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import axios from 'axios';

const VideoTracingIA = () => {
  const clubId = localStorage.getItem('club_id');

  const [partidos, setPartidos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [selectedCategoria, setSelectedCategoria] = useState('Todas');
  const [selectedPartido, setSelectedPartido] = useState('');

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [publicStorageUrl, setPublicStorageUrl] = useState('');
  const [points, setPoints] = useState([]); 
  const [renderPoints, setRenderPoints] = useState([]); 

  const [uploading, setUploading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [mappingMode, setMappingMode] = useState(false);
  const [uniqueTrackerIds, setUniqueTrackerIds] = useState([]);
  const [idMapping, setIdMapping] = useState({});
  const [saving, setSaving] = useState(false);
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
      const { data: jData } = await supabase.from('jugadores').select('id, nombre, apellido, dorsal, categoria').eq('club_id', clubId);
      if (jData) setJugadores(jData);
    };
    fetchContextData();
  }, [clubId]);

  const categoriasUnicas = ['Todas', ...new Set(partidos.map(p => p.categoria).filter(Boolean))];
  const partidosFiltrados = selectedCategoria === 'Todas' ? partidos : partidos.filter(p => p.categoria === selectedCategoria);

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
    if (points.length >= 4 || mappingMode || !videoRef.current) return;
    const rect = videoRef.current.getBoundingClientRect();
    const scaleX = videoRef.current.videoWidth / rect.width;
    const scaleY = videoRef.current.videoHeight / rect.height;
    
    const actualX = (e.clientX - rect.left) * scaleX;
    const actualY = (e.clientY - rect.top) * scaleY;
    
    setPoints([...points, { x: actualX, y: actualY }]);
  };

  useEffect(() => {
    if (!videoRef.current || points.length === 0) {
      setRenderPoints([]);
      return;
    }
    const updateRenderPoints = () => {
      const rect = videoRef.current.getBoundingClientRect();
      const scaleX = rect.width / videoRef.current.videoWidth;
      const scaleY = rect.height / videoRef.current.videoHeight;
      setRenderPoints(points.map(p => ({ rx: p.x * scaleX, ry: p.y * scaleY })));
    };
    updateRenderPoints();
    window.addEventListener('resize', updateRenderPoints);
    return () => window.removeEventListener('resize', updateRenderPoints);
  }, [points, videoUrl]);

  const processVideo = async () => {
    if (!selectedPartido || points.length !== 4) {
      alert("Faltan datos: Elegí partido y marcá las 4 esquinas.");
      return;
    }
    setUploading(true);

    try {
      const fileName = `${Date.now()}_${videoFile.name}`;
      const { error: uploadError } = await supabase.storage.from('futsal_videos').upload(fileName, videoFile);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('futsal_videos').getPublicUrl(fileName);
      setPublicStorageUrl(publicUrl);

      const startTime = videoRef.current.currentTime;

      const response = await axios.post(`${API_URL}/analyze`, {
        url: publicUrl,
        source_points: points.map(p => [p.x, p.y]),
        start_time: startTime
      }, {
        headers: { 'ngrok-skip-browser-warning': 'true' } 
      });

      const rawData = response.data.data;
      setAnalysisData(rawData);
      
      const frameInicial = rawData.find(f => f.players && f.players.length > 0) || rawData[0];
      const idsIniciales = new Set();
      if (frameInicial && frameInicial.players) {
        frameInicial.players.forEach(p => idsIniciales.add(p.id));
      }
      setUniqueTrackerIds(Array.from(idsIniciales).filter(id => id !== -1).sort((a,b) => a-b));

      setMappingMode(true);
      if (videoRef.current) {
        videoRef.current.pause();
      }
    } catch (err) {
      console.error("Fallo en IA:", err);
      alert("Error en el servidor de IA. Revisá la consola de Python y Ngrok.");
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
            calibracion: points.map(p => [p.x, p.y]),
            mapa_ids: idMapping
        }
      });

      if (error) throw error;
      alert("¡Análisis guardado con éxito!");
      setMappingMode(false);
    } catch (err) {
      console.error(err);
      alert("Error al guardar en la base de datos.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!analysisData || !radarRef.current) return;
    
    const render = () => {
      if (!radarRef.current) return;

      const currentTime = videoRef.current?.currentTime || 0;
      const frameIndex = Math.floor(currentTime * 30);
      const frameData = analysisData.find(f => f.frame === frameIndex) || analysisData[0];
      
      const ctx = radarRef.current.getContext('2d');
      const { width, height } = radarRef.current;
      
      ctx.clearRect(0, 0, width, height);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height);
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
          ctx.font = 'bold 11px Outfit';
          let label = p.id.toString();
          if (esIdentificado) {
              const jug = jugadores.find(j => j.id === idMapping[p.id]);
              if (jug) label = jug.dorsal?.toString() || label;
          }
          ctx.fillText(label, x - 5, y + 4);
        });
      }
      requestAnimationFrame(render); 
    };
    const animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [analysisData, idMapping, jugadores, hoveredTrackerId]);

  return (
    <div className="responsive-layout">
      <div style={{ width: '100%', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase' }}>TRACKING IA</h1>
        <div className="stat-label">Análisis de Video y Radar Táctico</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px', width: '100%' }}>
        
        <section className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', gridColumn: '1 / -1' }}>
          <div className="stat-label" style={{ color: '#00ff88' }}>1. CONTEXTO Y CALIBRACIÓN (Órden: Sup Izq, Sup Der, Inf Der, Inf Izq)</div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select 
              value={selectedCategoria} 
              onChange={(e) => { setSelectedCategoria(e.target.value); setSelectedPartido(''); }} 
              disabled={mappingMode}
              style={{ flex: 1, minWidth: '150px', background: '#000', border: '1px solid #222', padding: '10px', color: '#fff' }}
            >
              {categoriasUnicas.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            <select 
              value={selectedPartido} 
              onChange={(e) => setSelectedPartido(e.target.value)} 
              disabled={mappingMode}
              style={{ flex: 2, minWidth: '200px', background: '#000', border: '1px solid #222', padding: '10px', color: '#fff' }}
            >
              <option value="">Seleccionar Partido...</option>
              {partidosFiltrados.map(p => <option key={p.id} value={p.id}>{p.fecha} - vs {p.rival}</option>)}
            </select>
          </div>

          <input type="file" accept="video/mp4" onChange={handleFileChange} disabled={mappingMode} style={{ background: '#000', border: '1px solid #222', padding: '10px', color: '#fff' }} />
          
          {videoUrl && (
            <div style={{ position: 'relative', width: '100%', background: '#000', border: '1px solid #222', overflow: 'hidden', borderRadius: '4px' }}>
              <video 
                ref={videoRef} 
                src={videoUrl} 
                onClick={handleVideoClick} 
                controls={!mappingMode} 
                style={{ width: '100%', display: 'block', cursor: points.length < 4 ? 'crosshair' : 'default' }} 
              />
              {!mappingMode && renderPoints.map((p, i) => (
                <div key={i} style={{ position: 'absolute', width: '16px', height: '16px', backgroundColor: '#00ff88', border: '2px solid #000', borderRadius: '50%', left: `${p.rx - 8}px`, top: `${p.ry - 8}px`, pointerEvents: 'none', zIndex: 10 }} />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span style={{ fontSize: '0.8rem', color: points.length === 4 ? '#00ff88' : '#888' }}>
               Puntos marcados: {points.length}/4 {points.length === 4 && '✓'}
             </span>
             {points.length > 0 && !mappingMode && <button onClick={() => setPoints([])} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.7rem' }}>BORRAR CALIBRACIÓN</button>}
          </div>

          {!mappingMode && (
             <button onClick={processVideo} disabled={uploading || points.length !== 4 || !selectedPartido} className="btn-action">
               {uploading ? 'PROCESANDO EN SERVIDOR LOCAL...' : 'INICIAR TRACKING'}
             </button>
          )}
        </section>

        {mappingMode && (
          <section className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', gridColumn: '1 / -1', animation: 'fadeIn 0.5s' }}>
            <div className="stat-label" style={{ color: '#00ff88' }}>2. MAPEO DE IDENTIDADES (CONGELADO EN FRAME INICIAL)</div>
            <div style={{ fontSize: '0.85rem', color: '#888' }}>Asigná los dorsales a los puntos amarillos que ves en el radar para que el seguimiento sea preciso.</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
              {uniqueTrackerIds.map(tId => (
                <div 
                  key={tId} 
                  onMouseEnter={() => setHoveredTrackerId(tId)}
                  onMouseLeave={() => setHoveredTrackerId(null)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: hoveredTrackerId === tId ? '#222' : '#111', padding: '12px', border: '1px solid #333', borderRadius: '6px', transition: '0.2s' }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: idMapping[tId] ? '#00ff88' : '#facc15' }}>IA #{tId}</span>
                  <select 
                    value={idMapping[tId] || ''}
                    onChange={(e) => setIdMapping(prev => ({ ...prev, [tId]: parseInt(e.target.value) }))}
                    style={{ background: '#000', border: '1px solid #444', padding: '6px', color: '#fff', fontSize: '0.8rem', width: '140px', borderRadius: '4px' }}
                  >
                    <option value="">Rival / Desconocido</option>
                    {jugadores.filter(j => selectedCategoria === 'Todas' || j.categoria === selectedCategoria).map(j => (
                      <option key={j.id} value={j.id}>#{j.dorsal} {j.apellido}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                <button onClick={guardarAnalisisBD} disabled={saving} className="btn-action" style={{ background: '#3b82f6', flex: 2 }}>
                  {saving ? 'GUARDANDO...' : 'CONFIRMAR Y GUARDAR EN NUBE'}
                </button>
                <button onClick={() => setMappingMode(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
            </div>
          </section>
        )}

        <section className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', gridColumn: '1 / -1' }}>
          <div className="stat-label" style={{ color: '#00ff88' }}>RADAR TÁCTICO 2D (40x20m)</div>
          <div style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', aspectRatio: '2/1', backgroundColor: '#050505', border: '1px solid #222', borderRadius: '8px', position: 'relative', overflow: 'hidden' }}>
             <canvas ref={radarRef} width={1000} height={500} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          {analysisData && !mappingMode && (
            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#888' }}>
              Dale Play al video para ver el movimiento sincronizado.
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default VideoTracingIA;