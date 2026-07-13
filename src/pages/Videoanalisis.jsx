import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';

const MONO = 'JetBrains Mono, monospace';
const PREROLL_DEFAULT = 8; // segundos de colchón hacia atrás al marcar un clip
const BUCKET = 'videos-analisis';

// Botonera por defecto: se usa hasta que el club guarde su propia configuración.
const ETIQUETAS_DEFAULT = [
  { t: 'GOL', c: '#00ff88' },
  { t: 'OCASIÓN CLARA', c: '#00ff88' },
  { t: 'PRESSING ALTO', c: '#3b82f6' },
  { t: 'TRANSICIÓN OFE', c: '#3b82f6' },
  { t: 'TRANSICIÓN DEF', c: '#ef4444' },
  { t: 'ERROR DEFENSIVO', c: '#ef4444' },
  { t: 'JUGADA ENSAYADA', c: '#f59e0b' },
  { t: 'BALÓN PARADO', c: '#f59e0b' },
  { t: 'ROTACIÓN', c: '#a855f7' },
  { t: 'OTRO', c: '#888' },
];

function extraerYoutubeId(url) {
  if (!url) return null;
  const limpio = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(limpio)) return limpio; // pegaron solo el ID
  const m = limpio.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function detectarFuente(url) {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/drive\.google\.com/.test(url)) return 'drive';
  return null;
}

function extraerDriveId(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function fmtTiempo(seg) {
  if (seg == null || isNaN(seg)) return '00:00';
  const s = Math.max(0, Math.floor(seg));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function Videoanalisis() {
  const { perfil } = useAuth();
  const esMovil = useEsMovil();
  const clubId = perfil?.club_id || localStorage.getItem('club_id');

  const [vista, setVista] = useState('lista'); // 'lista' | 'trabajo' | 'explorador'
  const [videos, setVideos] = useState([]);
  const [videoActivo, setVideoActivo] = useState(null);
  const [clips, setClips] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [partidos, setPartidos] = useState([]);

  const [tabFuente, setTabFuente] = useState('youtube'); // 'youtube' | 'upload' | 'drive'
  const [modalNuevo, setModalNuevo] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formTitulo, setFormTitulo] = useState('');
  const [formPartido, setFormPartido] = useState('');
  const [archivoElegido, setArchivoElegido] = useState(null);
  const [guardandoVideo, setGuardandoVideo] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState(0);
  const [errorForm, setErrorForm] = useState('');

  // ── Configuración del club: botonera y colchón personalizables ──
  const [etiquetas, setEtiquetas] = useState(ETIQUETAS_DEFAULT);
  const [configId, setConfigId] = useState(null);
  const [modalConfig, setModalConfig] = useState(false);
  const [etiquetasEdit, setEtiquetasEdit] = useState([]);
  const [prerollEdit, setPrerollEdit] = useState(PREROLL_DEFAULT);
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  // ── Explorador de clips: cruza clips de TODOS los videos del club ──
  const [todosLosClips, setTodosLosClips] = useState([]);
  const [cargandoExplorador, setCargandoExplorador] = useState(false);
  const [explorCargado, setExplorCargado] = useState(false);
  const [filtroEtiquetasExplor, setFiltroEtiquetasExplor] = useState(() => new Set());
  const [filtroVideoExplor, setFiltroVideoExplor] = useState('');
  const [filtroPartidoExplor, setFiltroPartidoExplor] = useState('');
  const [seleccionExplor, setSeleccionExplor] = useState([]); // array ORDENADO de clip ids
  const [playlistsGuardadas, setPlaylistsGuardadas] = useState([]);
  const [nombreNuevaPlaylist, setNombreNuevaPlaylist] = useState('');
  const [guardandoPlaylist, setGuardandoPlaylist] = useState(false);

  const [playerListo, setPlayerListo] = useState(false); // YouTube
  const [videoNativoListo, setVideoNativoListo] = useState(false); // <video> subido o Drive
  const [signedUrl, setSignedUrl] = useState(null);
  const [errorReproduccion, setErrorReproduccion] = useState(false);
  const [tiempoActual, setTiempoActual] = useState(0);
  const [reproduciendoClipId, setReproduciendoClipId] = useState(null);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS');
  const [preroll, setPreroll] = useState(PREROLL_DEFAULT);

  const playerRef = useRef(null);   // YT.Player
  const videoElRef = useRef(null);  // <video> nativo
  const intervalRef = useRef(null);
  const colaRef = useRef([]);       // array de { clip, video } — puede mezclar distintos videos
  const colaIndexRef = useRef(0);
  const pendienteRef = useRef(null);      // clip a reproducir en cuanto el nuevo video esté listo
  const videoActivoIdRef = useRef(null);  // id del video realmente cargado (sin el lag de setState)
  const tickRef = useRef(null);

  const listoActual = videoActivo?.fuente === 'youtube' ? playerListo : videoNativoListo;

  // ── Adaptador: misma interfaz sin importar la fuente del video ──
  const adaptador = useMemo(() => ({
    getTiempo: () => {
      if (videoActivo?.fuente === 'youtube') return playerRef.current?.getCurrentTime?.() ?? 0;
      return videoElRef.current?.currentTime ?? 0;
    },
    seekTo: (t) => {
      if (videoActivo?.fuente === 'youtube') playerRef.current?.seekTo?.(t, true);
      else if (videoElRef.current) videoElRef.current.currentTime = t;
    },
    play: () => {
      if (videoActivo?.fuente === 'youtube') playerRef.current?.playVideo?.();
      else videoElRef.current?.play?.();
    },
    pause: () => {
      if (videoActivo?.fuente === 'youtube') playerRef.current?.pauseVideo?.();
      else videoElRef.current?.pause?.();
    },
  }), [videoActivo?.fuente]);

  // Fuente real del <video> nativo: signedUrl (subido, privado) o link directo (Drive, mejor esfuerzo)
  const srcActual = useMemo(() => {
    if (!videoActivo) return null;
    if (videoActivo.fuente === 'upload') return signedUrl;
    if (videoActivo.fuente === 'drive') return `https://drive.google.com/uc?id=${videoActivo.video_id}`;
    return null;
  }, [videoActivo, signedUrl]);

  // ── Carga inicial: mis videos + mis partidos + mi configuración de botonera ──
  useEffect(() => {
    if (!clubId) return;
    (async () => {
      setCargando(true);
      const [{ data: v }, { data: p }, { data: cfg }] = await Promise.all([
        supabase.from('video_analisis').select('*, video_clips(count)').eq('club_id', clubId).order('created_at', { ascending: false }),
        supabase.from('partidos').select('id, rival, fecha, categoria, video_url').eq('club_id', clubId).order('fecha', { ascending: false }).limit(100),
        supabase.from('video_config').select('*').eq('club_id', clubId).maybeSingle(),
      ]);
      setVideos(v || []);
      setPartidos(p || []);
      if (cfg) {
        setConfigId(cfg.id);
        if (Array.isArray(cfg.etiquetas) && cfg.etiquetas.length > 0) setEtiquetas(cfg.etiquetas);
        if (cfg.preroll_default) setPreroll(cfg.preroll_default);
      }
      setCargando(false);
    })();
  }, [clubId]);

  const fetchClips = useCallback(async (videoId) => {
    const { data } = await supabase
      .from('video_clips')
      .select('*')
      .eq('video_id', videoId)
      .order('orden', { ascending: true, nullsFirst: false })
      .order('inicio', { ascending: true });
    setClips(data || []);
  }, []);

  const abrirVideo = async (video) => {
    setVideoActivo(video);
    videoActivoIdRef.current = video.id;
    setVista('trabajo');
    setSeleccionados(new Set());
    setFiltroCategoria('TODAS');
    setSignedUrl(null);
    setErrorReproduccion(false);
    if (video.fuente === 'upload') {
      // El video_url guarda el PATH dentro del bucket (privado), no una URL pública.
      // Generamos una URL temporal para poder reproducirlo.
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(video.video_url, 3600);
      if (!error) setSignedUrl(data.signedUrl);
    }
    await fetchClips(video.id);
  };

  const volverALista = () => {
    detenerPolling();
    if (playerRef.current && playerRef.current.destroy) {
      try { playerRef.current.destroy(); } catch (_) {}
      playerRef.current = null;
    }
    setPlayerListo(false);
    setVideoNativoListo(false);
    setSignedUrl(null);
    setVideoActivo(null);
    setVista('lista');
    if (clubId) {
      supabase.from('video_analisis').select('*, video_clips(count)').eq('club_id', clubId).order('created_at', { ascending: false })
        .then(({ data }) => setVideos(data || []));
    }
  };

  // ── Alta de un video vía YouTube ──
  const crearVideoYoutube = async () => {
    setErrorForm('');
    const fuente = detectarFuente(formUrl);
    if (fuente === 'drive') {
      setErrorForm('Drive todavía no está soportado del todo (ver nota abajo). Probá con YouTube o subiendo el archivo.');
      return;
    }
    const videoId = extraerYoutubeId(formUrl);
    if (!videoId) {
      setErrorForm('No pude reconocer el link de YouTube. Revisá que esté completo.');
      return;
    }
    setGuardandoVideo(true);
    const { data, error } = await supabase.from('video_analisis').insert([{
      club_id: clubId,
      partido_id: formPartido || null,
      fuente: 'youtube',
      video_url: formUrl.trim(),
      video_id: videoId,
      titulo: formTitulo.trim() || null,
    }]).select().single();
    setGuardandoVideo(false);
    if (error) { setErrorForm('Error al guardar: ' + error.message); return; }

    // Si el partido asociado todavía no tenía video, se lo dejamos cargado también
    // (así el "saltar al evento" de Resumen empieza a funcionar de yapa, sin pedir nada más).
    if (formPartido) {
      const partidoActual = partidos.find(p => p.id === formPartido);
      if (partidoActual && !partidoActual.video_url) {
        const { error: errPartido } = await supabase.from('partidos').update({ video_url: formUrl.trim() }).eq('id', formPartido);
        if (!errPartido) {
          setPartidos(prev => prev.map(p => p.id === formPartido ? { ...p, video_url: formUrl.trim() } : p));
        }
      }
    }

    cerrarModalNuevo();
    setVideos(prev => [{ ...data, video_clips: [{ count: 0 }] }, ...prev]);
    abrirVideo(data);
  };

  // ── Alta de un video vía subida directa ──
  const crearVideoSubido = async () => {
    setErrorForm('');
    if (!archivoElegido) { setErrorForm('Elegí un archivo de video primero.'); return; }
    if (!archivoElegido.type.startsWith('video/')) { setErrorForm('El archivo elegido no parece ser un video.'); return; }

    setGuardandoVideo(true);
    setProgresoSubida(0);
    try {
      const extension = archivoElegido.name.split('.').pop();
      const path = `${clubId}/${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, archivoElegido, {
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.from('video_analisis').insert([{
        club_id: clubId,
        partido_id: formPartido || null,
        fuente: 'upload',
        video_url: path, // guardamos el path, no una URL pública (bucket privado)
        titulo: formTitulo.trim() || archivoElegido.name,
      }]).select().single();
      if (error) throw error;

      cerrarModalNuevo();
      setVideos(prev => [{ ...data, video_clips: [{ count: 0 }] }, ...prev]);
      abrirVideo(data);
    } catch (err) {
      setErrorForm('Error al subir: ' + err.message);
    } finally {
      setGuardandoVideo(false);
      setProgresoSubida(0);
    }
  };

  // ── Alta de un video vía Google Drive (mejor esfuerzo — ver aviso en el modal) ──
  const crearVideoDrive = async () => {
    setErrorForm('');
    const driveId = extraerDriveId(formUrl);
    if (!driveId) {
      setErrorForm('No pude reconocer el ID del archivo en ese link de Drive. Asegurate de compartirlo como "Cualquiera con el enlace".');
      return;
    }
    setGuardandoVideo(true);
    const { data, error } = await supabase.from('video_analisis').insert([{
      club_id: clubId,
      partido_id: formPartido || null,
      fuente: 'drive',
      video_url: formUrl.trim(),
      video_id: driveId,
      titulo: formTitulo.trim() || null,
    }]).select().single();
    setGuardandoVideo(false);
    if (error) { setErrorForm('Error al guardar: ' + error.message); return; }
    cerrarModalNuevo();
    setVideos(prev => [{ ...data, video_clips: [{ count: 0 }] }, ...prev]);
    abrirVideo(data);
  };

  const cerrarModalNuevo = () => {
    setModalNuevo(false);
    setFormUrl(''); setFormTitulo(''); setFormPartido(''); setArchivoElegido(null); setErrorForm('');
  };

  // ── Configuración de botonera (etiquetas + colchón) ──
  const abrirModalConfig = () => {
    setEtiquetasEdit(etiquetas.map(e => ({ ...e })));
    setPrerollEdit(preroll);
    setModalConfig(true);
  };

  const agregarEtiquetaEdit = () => {
    setEtiquetasEdit(prev => [...prev, { t: '', c: '#3b82f6' }]);
  };

  const actualizarEtiquetaEdit = (i, campo, valor) => {
    setEtiquetasEdit(prev => prev.map((e, idx) => idx === i ? { ...e, [campo]: valor } : e));
  };

  const eliminarEtiquetaEdit = (i) => {
    setEtiquetasEdit(prev => prev.filter((_, idx) => idx !== i));
  };

  const guardarConfig = async () => {
    const limpias = etiquetasEdit.map(e => ({ ...e, t: e.t.trim().toUpperCase() })).filter(e => e.t);
    if (limpias.length === 0) return;
    setGuardandoConfig(true);
    const payload = { club_id: clubId, etiquetas: limpias, preroll_default: prerollEdit, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('video_config').upsert(payload, { onConflict: 'club_id' }).select().single();
    setGuardandoConfig(false);
    if (!error && data) {
      setConfigId(data.id);
      setEtiquetas(limpias);
      setPreroll(prerollEdit);
      setModalConfig(false);
    }
  };

  const eliminarVideo = async (video, e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar "${video.titulo || 'este video'}" y todos sus clips?`)) return;
    if (video.fuente === 'upload' && video.video_url) {
      await supabase.storage.from(BUCKET).remove([video.video_url]);
    }
    await supabase.from('video_analisis').delete().eq('id', video.id);
    setVideos(prev => prev.filter(v => v.id !== video.id));
  };

  // ── YouTube IFrame API (solo cuando la fuente es youtube) ──
  useEffect(() => {
    if (!videoActivo || videoActivo.fuente !== 'youtube') return;
    setPlayerListo(false);

    const crearPlayer = () => {
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch (_) {}
      }
      playerRef.current = new window.YT.Player('yt-player-video-analisis', {
        videoId: videoActivo.video_id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            setPlayerListo(true);
            const dur = playerRef.current.getDuration ? playerRef.current.getDuration() : null;
            if (dur) supabase.from('video_analisis').update({ duracion_total: dur }).eq('id', videoActivo.id).then(() => {});
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      crearPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = crearPlayer;
    }

    return () => {
      detenerPolling();
      if (tickRef.current) clearInterval(tickRef.current);
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }
    };
  }, [videoActivo?.id]);

  // Reloj visual del tiempo actual (no controla nada, solo muestra dónde vamos)
  useEffect(() => {
    if (!listoActual) return;
    tickRef.current = setInterval(() => setTiempoActual(adaptador.getTiempo()), 400);
    return () => clearInterval(tickRef.current);
  }, [listoActual, adaptador]);

  const detenerPolling = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setReproduciendoClipId(null);
  };

  // ── Marcar un clip con la botonera (funciona igual para YouTube o video subido) ──
  const marcarClip = async (etiqueta) => {
    if (!listoActual) return;
    const fin = adaptador.getTiempo();
    const inicio = Math.max(0, fin - preroll);
    const { data, error } = await supabase.from('video_clips').insert([{
      video_id: videoActivo.id,
      club_id: clubId,
      inicio, fin, etiqueta,
    }]).select().single();
    if (!error && data) {
      setClips(prev => [...prev, data].sort((a, b) => a.inicio - b.inicio));
    }
  };

  // ── Editar duración de un clip (+/- 2s en cada punta) ──
  const ajustarClip = async (clip, campo, delta) => {
    let inicio = clip.inicio, fin = clip.fin;
    if (campo === 'inicio') inicio = Math.max(0, +(clip.inicio + delta).toFixed(1));
    if (campo === 'fin') fin = +(clip.fin + delta).toFixed(1);
    if (inicio >= fin - 0.5) return; // salvaguarda: no permitir invertir/aplastar el clip
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, inicio, fin } : c));
    await supabase.from('video_clips').update({ inicio, fin }).eq('id', clip.id);
  };

  const editarEtiqueta = async (clip, nuevaEtiqueta) => {
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, etiqueta: nuevaEtiqueta } : c));
    await supabase.from('video_clips').update({ etiqueta: nuevaEtiqueta }).eq('id', clip.id);
  };

  const eliminarClip = async (clip) => {
    setClips(prev => prev.filter(c => c.id !== clip.id));
    setSeleccionados(prev => { const n = new Set(prev); n.delete(clip.id); return n; });
    await supabase.from('video_clips').delete().eq('id', clip.id);
  };

  const moverClip = (clip, direccion) => {
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === clip.id);
      const nuevoIdx = idx + direccion;
      if (nuevoIdx < 0 || nuevoIdx >= prev.length) return prev;
      const copia = [...prev];
      [copia[idx], copia[nuevoIdx]] = [copia[nuevoIdx], copia[idx]];
      copia.forEach((c, i) => {
        supabase.from('video_clips').update({ orden: i }).eq('id', c.id).then(() => {});
      });
      return copia;
    });
  };

  // ── Reproducción: un clip solo (asume que el video correcto YA está cargado) ──
  const reproducirClipSolo = useCallback((clip) => {
    detenerPolling();
    setReproduciendoClipId(clip.id);
    adaptador.seekTo(clip.inicio);
    adaptador.play();
    intervalRef.current = setInterval(() => {
      const t = adaptador.getTiempo();
      if (t >= clip.fin) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        avanzarCola();
      }
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptador]);

  // ── Avanza al siguiente ítem de la cola, si hay ──
  const avanzarCola = useCallback(() => {
    const cola = colaRef.current;
    const idx = colaIndexRef.current;
    if (idx >= cola.length - 1) {
      adaptador.pause();
      setReproduciendoClipId(null);
      colaRef.current = [];
      return;
    }
    colaIndexRef.current = idx + 1;
    reproducirItemDeCola(colaIndexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptador]);

  // ── Reproduce el ítem N de la cola: si es de OTRO video, lo abre primero y difiere la reproducción ──
  const reproducirItemDeCola = useCallback(async (idx) => {
    const item = colaRef.current[idx];
    if (!item) return;
    if (videoActivoIdRef.current === item.video.id) {
      reproducirClipSolo(item.clip);
    } else {
      pendienteRef.current = item.clip;
      await abrirVideo(item.video);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reproducirClipSolo]);

  // En cuanto el video recién abierto está listo, si había una reproducción pendiente, la dispara.
  useEffect(() => {
    if (listoActual && pendienteRef.current) {
      const clip = pendienteRef.current;
      pendienteRef.current = null;
      reproducirClipSolo(clip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listoActual]);

  // ── Punto de entrada público: reproducir una cola de { clip, video } — mono-video o cruzada, da igual ──
  const reproducirCola = useCallback((items) => {
    if (!items || items.length === 0) return;
    colaRef.current = items;
    colaIndexRef.current = 0;
    reproducirItemDeCola(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reproducirItemDeCola]);

  const reproducirSeleccion = () => {
    const lista = clips.filter(c => seleccionados.has(c.id));
    if (lista.length === 0) return;
    reproducirCola(lista.map(clip => ({ clip, video: videoActivo })));
  };

  const toggleSeleccion = (clipId) => {
    setSeleccionados(prev => {
      const n = new Set(prev);
      n.has(clipId) ? n.delete(clipId) : n.add(clipId);
      return n;
    });
  };

  // ── Explorador: trae TODOS los clips del club, con su video (y partido si tiene) embebido ──
  const fetchTodosLosClips = useCallback(async () => {
    if (!clubId) return;
    setCargandoExplorador(true);
    const { data } = await supabase
      .from('video_clips')
      .select('*, video_analisis(id, titulo, fuente, video_id, partido_id, partidos(rival, fecha))')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });
    const conVideo = (data || [])
      .filter(c => c.video_analisis) // por si algún clip quedó huérfano de un video borrado
      .map(c => ({ ...c, video: c.video_analisis }));
    setTodosLosClips(conVideo);
    setCargandoExplorador(false);
  }, [clubId]);

  const fetchPlaylists = useCallback(async () => {
    if (!clubId) return;
    const { data } = await supabase.from('video_playlists').select('*').eq('club_id', clubId).order('created_at', { ascending: false });
    setPlaylistsGuardadas(data || []);
  }, [clubId]);

  const abrirExplorador = () => {
    setVista('explorador');
    if (!explorCargado) {
      fetchTodosLosClips();
      fetchPlaylists();
      setExplorCargado(true);
    }
  };

  const toggleEtiquetaExplor = (et) => {
    setFiltroEtiquetasExplor(prev => {
      const n = new Set(prev);
      n.has(et) ? n.delete(et) : n.add(et);
      return n;
    });
  };

  const toggleSeleccionExplor = (clipId) => {
    setSeleccionExplor(prev => prev.includes(clipId) ? prev.filter(id => id !== clipId) : [...prev, clipId]);
  };

  const moverSeleccionExplor = (clipId, direccion) => {
    setSeleccionExplor(prev => {
      const idx = prev.indexOf(clipId);
      const nuevoIdx = idx + direccion;
      if (idx === -1 || nuevoIdx < 0 || nuevoIdx >= prev.length) return prev;
      const copia = [...prev];
      [copia[idx], copia[nuevoIdx]] = [copia[nuevoIdx], copia[idx]];
      return copia;
    });
  };

  const itemsSeleccionExplor = useMemo(
    () => seleccionExplor.map(id => todosLosClips.find(c => c.id === id)).filter(Boolean),
    [seleccionExplor, todosLosClips]
  );

  const reproducirColaExplorador = () => {
    if (itemsSeleccionExplor.length === 0) return;
    videoActivoIdRef.current = null; // fuerza a abrir el primer video sí o sí, aunque ya estuviera cargado
    setVista('trabajo');
    reproducirCola(itemsSeleccionExplor.map(clip => ({ clip, video: clip.video })));
  };

  const guardarPlaylist = async () => {
    if (!nombreNuevaPlaylist.trim() || seleccionExplor.length === 0) return;
    setGuardandoPlaylist(true);
    const { data, error } = await supabase.from('video_playlists').insert([{
      club_id: clubId, nombre: nombreNuevaPlaylist.trim(), clip_ids: seleccionExplor,
    }]).select().single();
    setGuardandoPlaylist(false);
    if (!error && data) {
      setPlaylistsGuardadas(prev => [data, ...prev]);
      setNombreNuevaPlaylist('');
    }
  };

  const cargarPlaylist = (playlist) => {
    // Filtramos por si algún clip de la playlist ya fue borrado desde entonces
    const idsValidos = (playlist.clip_ids || []).filter(id => todosLosClips.some(c => c.id === id));
    setSeleccionExplor(idsValidos);
  };

  const eliminarPlaylist = async (playlist, e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar la playlist "${playlist.nombre}"?`)) return;
    await supabase.from('video_playlists').delete().eq('id', playlist.id);
    setPlaylistsGuardadas(prev => prev.filter(p => p.id !== playlist.id));
  };

  const etiquetasDisponiblesExplor = useMemo(() => [...new Set(todosLosClips.map(c => c.etiqueta))].sort(), [todosLosClips]);
  const videosDisponiblesExplor = useMemo(() => {
    const m = new Map();
    todosLosClips.forEach(c => { if (!m.has(c.video.id)) m.set(c.video.id, c.video); });
    return [...m.values()];
  }, [todosLosClips]);
  const partidosDisponiblesExplor = useMemo(() => {
    const m = new Map();
    todosLosClips.forEach(c => { if (c.video.partidos && c.video.partido_id) m.set(c.video.partido_id, c.video.partidos); });
    return [...m.entries()];
  }, [todosLosClips]);

  const clipsExplorFiltrados = useMemo(() => {
    return todosLosClips.filter(c => {
      const pasaEtiqueta = filtroEtiquetasExplor.size === 0 || filtroEtiquetasExplor.has(c.etiqueta);
      const pasaVideo = !filtroVideoExplor || c.video.id === filtroVideoExplor;
      const pasaPartido = !filtroPartidoExplor || c.video.partido_id === filtroPartidoExplor;
      return pasaEtiqueta && pasaVideo && pasaPartido;
    });
  }, [todosLosClips, filtroEtiquetasExplor, filtroVideoExplor, filtroPartidoExplor]);

  const categorias = useMemo(() => ['TODAS', ...new Set(clips.map(c => c.etiqueta))], [clips]);
  const clipsFiltrados = useMemo(() => filtroCategoria === 'TODAS' ? clips : clips.filter(c => c.etiqueta === filtroCategoria), [clips, filtroCategoria]);

  // ── Reutilizar el video ya cargado en el partido (mismo campo que usa Resumen) ──
  const partidoConVideo = useMemo(() => {
    if (!formPartido) return null;
    const p = partidos.find(x => x.id === formPartido);
    return p?.video_url ? p : null;
  }, [formPartido, partidos]);

  const usarVideoDelPartido = () => {
    if (!partidoConVideo) return;
    const fuente = detectarFuente(partidoConVideo.video_url);
    if (fuente === 'youtube' || fuente === 'drive') {
      setTabFuente(fuente);
      setFormUrl(partidoConVideo.video_url);
      setErrorForm('');
    } else {
      setErrorForm('No pude reconocer automáticamente el video de este partido. Pegalo manualmente en la pestaña que corresponda.');
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // VISTA: LISTA DE VIDEOS
  // ══════════════════════════════════════════════════════════════════════
  if (vista === 'lista') {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '80px', animation: 'fadeIn 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label" style={{ color: 'var(--accent)' }}>VIDEO ANÁLISIS</div>
            <div style={{ fontSize: esMovil ? '1.4rem' : '1.8rem', fontWeight: 900 }}>Marcá momentos, armá tu playlist</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={abrirExplorador} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '12px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '44px' }}>
              🔍 EXPLORAR CLIPS
            </button>
            <button onClick={abrirModalConfig} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '12px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '44px' }}>
              ⚙️ BOTONERA
            </button>
            <button onClick={() => setModalNuevo(true)} className="btn-action" style={{ padding: '12px 22px', minHeight: '44px' }}>
              + NUEVO ANÁLISIS
            </button>
          </div>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>Cargando...</div>
        ) : videos.length === 0 ? (
          <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
            Todavía no cargaste ningún video. Empezá con "+ NUEVO ANÁLISIS".
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '18px' }}>
            {videos.map(v => {
              const nClips = v.video_clips?.[0]?.count ?? 0;
              return (
                <div key={v.id} onClick={() => abrirVideo(v)} className="bento-card" style={{ cursor: 'pointer', position: 'relative', padding: '18px' }}>
                  <button onClick={(e) => eliminarVideo(v, e)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1rem', padding: '4px' }}>✕</button>
                  <div style={{ fontSize: '1.6rem', marginBottom: '10px' }}>{v.fuente === 'youtube' ? '▶️' : v.fuente === 'upload' ? '📱' : '📁'}</div>
                  <div style={{ fontWeight: 900, fontSize: '1rem', color: '#fff', marginBottom: '6px', paddingRight: '20px' }}>
                    {v.titulo || (v.fuente === 'youtube' ? 'Video de YouTube' : 'Video')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: MONO }}>
                    {nClips} clip{nClips !== 1 ? 's' : ''} · {new Date(v.created_at).toLocaleDateString('es-AR')}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modalNuevo && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: esMovil ? 'flex-end' : 'center', padding: esMovil ? 0 : '20px' }}>
            <div className="bento-card" style={{ width: '100%', maxWidth: '480px', border: '1px solid var(--accent)', borderRadius: esMovil ? '16px 16px 0 0' : '12px', maxHeight: '92dvh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>NUEVO ANÁLISIS DE VIDEO</div>
                <button onClick={cerrarModalNuevo} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                <button onClick={() => { setTabFuente('youtube'); setErrorForm(''); }} style={{ flex: 1, padding: '8px', textAlign: 'center', background: tabFuente === 'youtube' ? 'rgba(0,255,136,0.1)' : '#111', border: `1px solid ${tabFuente === 'youtube' ? 'var(--accent)' : '#333'}`, borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, color: tabFuente === 'youtube' ? 'var(--accent)' : '#888', cursor: 'pointer' }}>▶️ YOUTUBE</button>
                <button onClick={() => { setTabFuente('upload'); setErrorForm(''); }} style={{ flex: 1, padding: '8px', textAlign: 'center', background: tabFuente === 'upload' ? 'rgba(0,255,136,0.1)' : '#111', border: `1px solid ${tabFuente === 'upload' ? 'var(--accent)' : '#333'}`, borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, color: tabFuente === 'upload' ? 'var(--accent)' : '#888', cursor: 'pointer' }}>📱 SUBIR ARCHIVO</button>
                <button onClick={() => { setTabFuente('drive'); setErrorForm(''); }} style={{ flex: 1, padding: '8px', textAlign: 'center', background: tabFuente === 'drive' ? 'rgba(0,255,136,0.1)' : '#111', border: `1px solid ${tabFuente === 'drive' ? 'var(--accent)' : '#333'}`, borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, color: tabFuente === 'drive' ? 'var(--accent)' : '#888', cursor: 'pointer' }}>📁 DRIVE</button>
              </div>

              {tabFuente === 'youtube' && (
                <>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>LINK DE YOUTUBE</label>
                  <input
                    type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '14px', boxSizing: 'border-box' }}
                  />
                </>
              )}

              {tabFuente === 'upload' && (
                <>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>ARCHIVO DE VIDEO</label>
                  <input
                    type="file" accept="video/*"
                    onChange={(e) => { setArchivoElegido(e.target.files[0] || null); setErrorForm(''); }}
                    style={{ width: '100%', padding: '10px', background: '#000', border: '1px dashed #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '0.85rem', marginBottom: '8px', boxSizing: 'border-box' }}
                  />
                  {archivoElegido && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '14px', fontFamily: MONO }}>
                      {archivoElegido.name} · {fmtMB(archivoElegido.size)} MB
                    </div>
                  )}
                  <div style={{ fontSize: '0.68rem', color: '#facc15', marginBottom: '14px', background: 'rgba(250,204,21,0.08)', padding: '8px 10px', borderRadius: '6px' }}>
                    ⚠️ Archivos grandes (partido completo) pueden tardar bastante en subir según tu conexión. Para clips cortos va rápido.
                  </div>
                </>
              )}

              {tabFuente === 'drive' && (
                <>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>LINK DE GOOGLE DRIVE</label>
                  <input
                    type="text" value={formUrl} onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '8px', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: '0.68rem', color: '#facc15', marginBottom: '14px', background: 'rgba(250,204,21,0.08)', padding: '8px 10px', borderRadius: '6px' }}>
                    ⚠️ Compartilo como "Cualquiera con el enlace". Funciona bien para clips cortos; en partidos completos Drive a veces bloquea la reproducción directa por el tamaño del archivo — si falla, subilo directo o probá con YouTube.
                  </div>
                </>
              )}

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>TÍTULO (opcional)</label>
              <input
                type="text" value={formTitulo} onChange={(e) => setFormTitulo(e.target.value)}
                placeholder="Ej: vs Racing - Vuelta"
                style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '14px', boxSizing: 'border-box' }}
              />

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>ASOCIAR A UN PARTIDO (opcional)</label>
              <select
                value={formPartido} onChange={(e) => setFormPartido(e.target.value)}
                style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: partidoConVideo ? '8px' : '18px', boxSizing: 'border-box' }}
              >
                <option value="">— Sin asociar —</option>
                {partidos.map(p => (
                  <option key={p.id} value={p.id}>vs {p.rival} · {p.fecha} · {p.categoria} {p.video_url ? '🎬' : ''}</option>
                ))}
              </select>

              {partidoConVideo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'rgba(0,255,136,0.06)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '10px 12px', marginBottom: '18px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>🎬 Este partido ya tiene un video cargado</span>
                  <button onClick={usarVideoDelPartido} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '7px 12px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}>
                    USAR ESTE
                  </button>
                </div>
              )}

              {errorForm && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '14px', background: 'rgba(239,68,68,0.1)', padding: '10px', borderRadius: '6px' }}>{errorForm}</div>}

              <button
                onClick={tabFuente === 'youtube' ? crearVideoYoutube : tabFuente === 'upload' ? crearVideoSubido : crearVideoDrive}
                disabled={guardandoVideo}
                className="btn-action" style={{ width: '100%', padding: '15px', minHeight: '48px' }}
              >
                {guardandoVideo ? (tabFuente === 'upload' ? 'SUBIENDO...' : 'GUARDANDO...') : 'EMPEZAR A ANALIZAR'}
              </button>
            </div>
          </div>
        )}

        {modalConfig && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: esMovil ? 'flex-end' : 'center', padding: esMovil ? 0 : '20px' }}>
            <div className="bento-card" style={{ width: '100%', maxWidth: '520px', border: '1px solid var(--accent)', borderRadius: esMovil ? '16px 16px 0 0' : '12px', maxHeight: '90dvh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>CONFIGURAR BOTONERA</div>
                <button onClick={() => setModalConfig(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
              </div>

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '10px' }}>ETIQUETAS RÁPIDAS</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {etiquetasEdit.map((et, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="color" value={et.c} onChange={(e) => actualizarEtiquetaEdit(i, 'c', e.target.value)}
                      style={{ width: '38px', height: '38px', padding: 0, border: '1px solid #333', borderRadius: '6px', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <input
                      type="text" value={et.t} onChange={(e) => actualizarEtiquetaEdit(i, 't', e.target.value)}
                      placeholder="Nombre de la etiqueta"
                      style={{ flex: 1, minWidth: 0, padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '16px', boxSizing: 'border-box' }}
                    />
                    <button onClick={() => eliminarEtiquetaEdit(i)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0, minWidth: '32px' }}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={agregarEtiquetaEdit} style={{ width: '100%', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', marginBottom: '20px' }}>
                + AGREGAR ETIQUETA
              </button>

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>COLCHÓN POR DEFECTO (segundos hacia atrás al marcar)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <button onClick={() => setPrerollEdit(p => Math.max(2, p - 2))} style={{ background: '#111', border: '1px solid #333', color: '#fff', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>-</button>
                <span style={{ fontFamily: MONO, fontSize: '1.1rem', minWidth: '50px', textAlign: 'center' }}>{prerollEdit}s</span>
                <button onClick={() => setPrerollEdit(p => Math.min(30, p + 2))} style={{ background: '#111', border: '1px solid #333', color: '#fff', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>+</button>
              </div>

              <button onClick={guardarConfig} disabled={guardandoConfig} className="btn-action" style={{ width: '100%', padding: '15px', minHeight: '48px' }}>
                {guardandoConfig ? 'GUARDANDO...' : 'GUARDAR CONFIGURACIÓN'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VISTA: EXPLORADOR DE CLIPS (cruza clips de todos los videos, playlists)
  // ══════════════════════════════════════════════════════════════════════
  if (vista === 'explorador') {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '80px', animation: 'fadeIn 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <button onClick={() => setVista('lista')} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '40px', marginBottom: '10px' }}>
              ← Mis videos
            </button>
            <div className="stat-label" style={{ color: 'var(--accent)' }}>EXPLORADOR DE CLIPS</div>
            <div style={{ fontSize: esMovil ? '1.2rem' : '1.5rem', fontWeight: 900 }}>Cruzá clips de todos tus videos</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: '18px', alignItems: 'start' }}>

          {/* ── COLUMNA PRINCIPAL: filtros + resultados ── */}
          <div style={{ minWidth: 0 }}>
            <div className="bento-card" style={{ marginBottom: '14px' }}>
              <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: '12px' }}>FILTROS</div>

              {etiquetasDisponiblesExplor.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '6px' }}>ETIQUETA (tocá para sumar/sacar del filtro)</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {etiquetasDisponiblesExplor.map(et => {
                      const activa = filtroEtiquetasExplor.has(et);
                      return (
                        <button key={et} onClick={() => toggleEtiquetaExplor(et)} style={{ padding: '6px 12px', borderRadius: '20px', border: `1px solid ${activa ? 'var(--accent)' : '#333'}`, background: activa ? 'rgba(0,255,136,0.12)' : '#111', color: activa ? 'var(--accent)' : '#888', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>
                          {et}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <select value={filtroVideoExplor} onChange={(e) => setFiltroVideoExplor(e.target.value)} style={{ padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '0.8rem' }}>
                  <option value="">— Todos los videos —</option>
                  {videosDisponiblesExplor.map(v => <option key={v.id} value={v.id}>{v.titulo || 'Video sin título'}</option>)}
                </select>
                <select value={filtroPartidoExplor} onChange={(e) => setFiltroPartidoExplor(e.target.value)} style={{ padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '0.8rem' }}>
                  <option value="">— Todos los partidos —</option>
                  {partidosDisponiblesExplor.map(([id, p]) => <option key={id} value={id}>vs {p.rival} · {p.fecha}</option>)}
                </select>
              </div>
            </div>

            <div className="bento-card">
              <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: '12px' }}>
                RESULTADOS ({clipsExplorFiltrados.length})
              </div>

              {cargandoExplorador ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>Cargando clips...</div>
              ) : clipsExplorFiltrados.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
                  {todosLosClips.length === 0 ? 'Todavía no marcaste ningún clip en ningún video.' : 'Nada coincide con estos filtros.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '560px', overflowY: 'auto' }}>
                  {clipsExplorFiltrados.map(clip => {
                    const enSeleccion = seleccionExplor.includes(clip.id);
                    return (
                      <div key={clip.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: enSeleccion ? 'rgba(0,255,136,0.06)' : '#0a0a0a', border: `1px solid ${enSeleccion ? 'var(--accent)' : '#222'}`, borderRadius: '8px', padding: '10px' }}>
                        <input type="checkbox" checked={enSeleccion} onChange={() => toggleSeleccionExplor(clip.id)} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: '0.82rem', color: '#fff' }}>{clip.etiqueta}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {clip.video.titulo || 'Video'} {clip.video.partidos && `· vs ${clip.video.partidos.rival}`} · {fmtTiempo(clip.inicio)}–{fmtTiempo(clip.fin)} ({Math.round(clip.fin - clip.inicio)}s)
                          </div>
                        </div>
                        <button onClick={() => abrirVideo(clip.video)} title="Editar este clip" style={{ background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: '6px', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>✎</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── SIDEBAR: selección actual (playlist en armado) + playlists guardadas ── */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="bento-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div className="stat-label" style={{ color: 'var(--accent)' }}>TU PLAYLIST ({itemsSeleccionExplor.length})</div>
                {itemsSeleccionExplor.length > 0 && <button onClick={() => setSeleccionExplor([])} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.7rem' }}>vaciar</button>}
              </div>

              {itemsSeleccionExplor.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                  Marcá clips de la lista para armar tu playlist.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', maxHeight: '300px', overflowY: 'auto' }}>
                  {itemsSeleccionExplor.map((clip, i) => (
                    <div key={clip.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0a0a0a', border: '1px solid #222', borderRadius: '6px', padding: '8px' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: MONO, minWidth: '18px' }}>{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.etiqueta}</span>
                      <button onClick={() => moverSeleccionExplor(clip.id, -1)} disabled={i === 0} style={{ ...btnAjuste, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                      <button onClick={() => moverSeleccionExplor(clip.id, 1)} disabled={i === itemsSeleccionExplor.length - 1} style={{ ...btnAjuste, opacity: i === itemsSeleccionExplor.length - 1 ? 0.3 : 1 }}>↓</button>
                      <button onClick={() => toggleSeleccionExplor(clip.id)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={reproducirColaExplorador} disabled={itemsSeleccionExplor.length === 0} className="btn-action" style={{ width: '100%', padding: '13px', minHeight: '46px', opacity: itemsSeleccionExplor.length === 0 ? 0.5 : 1, marginBottom: '10px' }}>
                ▶ REPRODUCIR PLAYLIST
              </button>

              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  value={nombreNuevaPlaylist} onChange={(e) => setNombreNuevaPlaylist(e.target.value)}
                  placeholder="Nombre para guardar..."
                  style={{ flex: 1, minWidth: 0, padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '16px' }}
                />
                <button onClick={guardarPlaylist} disabled={guardandoPlaylist || !nombreNuevaPlaylist.trim() || itemsSeleccionExplor.length === 0} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '6px', padding: '10px 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0, opacity: (!nombreNuevaPlaylist.trim() || itemsSeleccionExplor.length === 0) ? 0.5 : 1 }}>
                  💾
                </button>
              </div>
            </div>

            {playlistsGuardadas.length > 0 && (
              <div className="bento-card">
                <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: '10px' }}>PLAYLISTS GUARDADAS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {playlistsGuardadas.map(pl => (
                    <div key={pl.id} onClick={() => cargarPlaylist(pl)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', border: '1px solid #222', borderRadius: '6px', padding: '10px', cursor: 'pointer' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.nombre}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: MONO }}>{(pl.clip_ids || []).length} clips</div>
                      </div>
                      <button onClick={(e) => eliminarPlaylist(pl, e)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VISTA: TRABAJO SOBRE UN VIDEO (reproductor + botonera + clips)
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', paddingBottom: '80px', animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <button onClick={volverALista} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '40px' }}>
          ← Mis videos
        </button>
        <div style={{ fontWeight: 900, fontSize: esMovil ? '0.9rem' : '1.1rem', textAlign: 'right' }}>
          {videoActivo?.titulo || 'Video'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: '18px', alignItems: 'start' }}>

        {/* ── COLUMNA PRINCIPAL: reproductor + botonera ── */}
        <div style={{ minWidth: 0 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
            {videoActivo?.fuente === 'youtube' ? (
              <div id="yt-player-video-analisis" style={{ width: '100%', height: '100%' }} />
            ) : (
              srcActual && (
                <video
                  ref={videoElRef}
                  src={srcActual}
                  controls
                  playsInline
                  onLoadedMetadata={() => {
                    setVideoNativoListo(true);
                    if (videoElRef.current?.duration) {
                      supabase.from('video_analisis').update({ duracion_total: videoElRef.current.duration }).eq('id', videoActivo.id).then(() => {});
                    }
                  }}
                  onError={() => setErrorReproduccion(true)}
                  style={{ width: '100%', height: '100%', background: '#000' }}
                />
              )
            )}
            {videoActivo?.fuente === 'drive' && errorReproduccion && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px', color: '#facc15', fontSize: '0.8rem', background: 'rgba(0,0,0,0.85)' }}>
                Drive no dejó reproducir este archivo directamente (pasa con videos grandes). Subilo desde tu dispositivo o probá con YouTube.
              </div>
            )}
            {!listoActual && !errorReproduccion && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                Cargando video...
              </div>
            )}
          </div>

          <div className="bento-card" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div className="stat-label" style={{ color: 'var(--accent)' }}>MARCAR MOMENTO</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                <span style={{ fontFamily: MONO }}>▶ {fmtTiempo(tiempoActual)}</span>
                <span>· colchón</span>
                <button onClick={() => setPreroll(p => Math.max(2, p - 2))} style={{ background: '#111', border: '1px solid #333', color: '#fff', width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer' }}>-</button>
                <span style={{ fontFamily: MONO, minWidth: '28px', textAlign: 'center' }}>{preroll}s</span>
                <button onClick={() => setPreroll(p => Math.min(30, p + 2))} style={{ background: '#111', border: '1px solid #333', color: '#fff', width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer' }}>+</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
              {etiquetas.map(et => (
                <button
                  key={et.t}
                  onClick={() => marcarClip(et.t)}
                  disabled={!listoActual}
                  style={{
                    padding: '14px 8px', background: `${et.c}18`, border: `1px solid ${et.c}`, color: et.c,
                    borderRadius: '8px', fontWeight: 900, fontSize: '0.75rem', cursor: listoActual ? 'pointer' : 'not-allowed',
                    minHeight: '48px', opacity: listoActual ? 1 : 0.5,
                  }}
                >
                  {et.t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── SIDEBAR: lista de clips ── */}
        <div style={{ minWidth: 0 }}>
          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div className="stat-label" style={{ color: 'var(--accent)' }}>CLIPS ({clipsFiltrados.length})</div>
              {seleccionados.size > 0 && (
                <button onClick={reproducirSeleccion} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer' }}>
                  ▶ REPRODUCIR ({seleccionados.size})
                </button>
              )}
            </div>

            {categorias.length > 2 && (
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ width: '100%', padding: '8px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '0.75rem', marginBottom: '12px' }}>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {clipsFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                Sin clips todavía. Usá la botonera mientras mirás el video.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: esMovil ? 'none' : '620px', overflowY: esMovil ? 'visible' : 'auto' }}>
                {clipsFiltrados.map((clip, i) => {
                  const activo = reproduciendoClipId === clip.id;
                  return (
                    <div key={clip.id} style={{ background: activo ? 'rgba(0,255,136,0.08)' : '#0a0a0a', border: `1px solid ${activo ? 'var(--accent)' : '#222'}`, borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <input type="checkbox" checked={seleccionados.has(clip.id)} onChange={() => toggleSeleccion(clip.id)} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                        <input
                          value={clip.etiqueta} onChange={(e) => editarEtiqueta(clip, e.target.value)}
                          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: '#fff', fontWeight: 900, fontSize: '0.8rem', outline: 'none' }}
                        />
                        <button onClick={() => eliminarClip(clip)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button onClick={() => ajustarClip(clip, 'inicio', -2)} style={btnAjuste}>◀-2</button>
                          <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-dim)' }}>{fmtTiempo(clip.inicio)}</span>
                          <button onClick={() => ajustarClip(clip, 'inicio', 2)} style={btnAjuste}>+2</button>
                        </div>
                        <span style={{ color: '#444', fontSize: '0.7rem' }}>a</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button onClick={() => ajustarClip(clip, 'fin', -2)} style={btnAjuste}>-2</button>
                          <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-dim)' }}>{fmtTiempo(clip.fin)}</span>
                          <button onClick={() => ajustarClip(clip, 'fin', 2)} style={btnAjuste}>+2▶</button>
                        </div>
                        <span style={{ fontSize: '0.65rem', color: '#555', fontFamily: MONO }}>({Math.round(clip.fin - clip.inicio)}s)</span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <button onClick={() => reproducirCola([{ clip, video: videoActivo }])} style={{ flex: 1, background: activo ? 'var(--accent)' : '#151515', color: activo ? '#000' : '#fff', border: '1px solid #333', borderRadius: '6px', padding: '8px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', minHeight: '36px' }}>
                          {activo ? '⏸ REPRODUCIENDO' : '▶ VER CLIP'}
                        </button>
                        <button onClick={() => moverClip(clip, -1)} disabled={i === 0 || filtroCategoria !== 'TODAS'} title={filtroCategoria !== 'TODAS' ? 'Reordenar solo con el filtro en TODAS' : ''} style={{ ...btnAjuste, opacity: (i === 0 || filtroCategoria !== 'TODAS') ? 0.3 : 1 }}>↑</button>
                        <button onClick={() => moverClip(clip, 1)} disabled={i === clipsFiltrados.length - 1 || filtroCategoria !== 'TODAS'} title={filtroCategoria !== 'TODAS' ? 'Reordenar solo con el filtro en TODAS' : ''} style={{ ...btnAjuste, opacity: (i === clipsFiltrados.length - 1 || filtroCategoria !== 'TODAS') ? 0.3 : 1 }}>↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const btnAjuste = { background: '#151515', border: '1px solid #333', color: '#aaa', borderRadius: '4px', padding: '4px 7px', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 700, minHeight: '28px' };