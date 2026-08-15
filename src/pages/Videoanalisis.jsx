import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import { fetchPaginado } from '../utils/supaPaginado';

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
  const m = limpio.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
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
  const esModoJugador = perfil?.rol === 'jugador'; // kiosco: solo ve playlists compartidas

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
  const [formCategoria, setFormCategoria] = useState('');
  const [archivoElegido, setArchivoElegido] = useState(null);
  const [guardandoVideo, setGuardandoVideo] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState(0);
  const [errorForm, setErrorForm] = useState('');

  // ── Configuración del club: botonera y colchón personalizables ──
  const [etiquetas, setEtiquetas] = useState(ETIQUETAS_DEFAULT);
  const [configId, setConfigId] = useState(null);
  const [modalConfig, setModalConfig] = useState(false);
  const [prerollEdit, setPrerollEdit] = useState(PREROLL_DEFAULT);
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  // ── Presets de botonera: varias guardadas, se puede saltar entre ellas ──
  const [presets, setPresets] = useState([]); // [{ id, nombre, etiquetas: [{t,c}] }]
  const [presetActivoId, setPresetActivoId] = useState(null);
  const [presetsEdit, setPresetsEdit] = useState([]); // clon editable dentro del modal
  const [presetIdEdit, setPresetIdEdit] = useState(null); // cuál se está editando ahora en el modal

  // ── Pantalla grande y Modo Cine ──
  const [enPantallaCompleta, setEnPantallaCompleta] = useState(false);
  const [modoCine, setModoCine] = useState(false);
  const videoWrapRef = useRef(null);

  // ── Explorador de clips: cruza clips de TODOS los videos del club ──
  const [todosLosClips, setTodosLosClips] = useState([]);
  const [cargandoExplorador, setCargandoExplorador] = useState(false);
  const [explorCargado, setExplorCargado] = useState(false);
  const [filtroEtiquetasExplor, setFiltroEtiquetasExplor] = useState(() => new Set());
  const [filtroVideoExplor, setFiltroVideoExplor] = useState('');
  const [filtroPartidoExplor, setFiltroPartidoExplor] = useState('');
  const [filtroCategoriaExplor, setFiltroCategoriaExplor] = useState('');
  const [seleccionExplor, setSeleccionExplor] = useState([]); // array ORDENADO de clip ids
  const [playlistsGuardadas, setPlaylistsGuardadas] = useState([]);
  const [jugadoresClub, setJugadoresClub] = useState([]);
  const [modalCompartir, setModalCompartir] = useState(null); // playlist en edición
  const [catsCompartirEdit, setCatsCompartirEdit] = useState([]);
  const [jugsCompartirEdit, setJugsCompartirEdit] = useState([]);
  const [busquedaJugCompartir, setBusquedaJugCompartir] = useState('');
  const [guardandoCompartir, setGuardandoCompartir] = useState(false);
  const [nombreNuevaPlaylist, setNombreNuevaPlaylist] = useState('');
  const [guardandoPlaylist, setGuardandoPlaylist] = useState(false);

  const [playerListo, setPlayerListo] = useState(false); // YouTube
  const [videoNativoListo, setVideoNativoListo] = useState(false); // <video> subido o Drive
  const [signedUrl, setSignedUrl] = useState(null);
  const [errorReproduccion, setErrorReproduccion] = useState(false);
  const [tiempoActual, setTiempoActual] = useState(0);
  const [reproduciendoClipId, setReproduciendoClipId] = useState(null);
  const [clipActivo, setClipActivo] = useState(null); // clip completo (etiqueta + notas) que se está mostrando ahora
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
      // Todo paginado: PostgREST corta en 1000 filas sin avisar. El .order('id')
      // secundario es el desempate que .range() necesita para no repetir filas.
      const [v, p, rivalesClub, { data: cfg }] = await Promise.all([
        fetchPaginado(() =>
          supabase.from('video_analisis').select('*, video_clips(count)').eq('club_id', clubId)
            .order('created_at', { ascending: false }).order('id', { ascending: false })
        ).catch(() => []),
        fetchPaginado(() =>
          supabase.from('partidos')
            // Sin `local_rival_id`: si la migracion v2 todavia no se corrio,
            // pedir esa columna hace fallar la query ENTERA con un 400 y la
            // pantalla queda sin partidos. El nombre alcanza para clasificar.
            .select('id, rival, fecha, categoria, video_url, nombre_propio')
            .eq('club_id', clubId)
            .order('fecha', { ascending: false }).order('id', { ascending: false })
        ).catch(() => []),
        fetchPaginado(() =>
          supabase.from('rivales').select('id, nombre').eq('club_id', clubId).order('id')
        ).catch(() => []),
        supabase.from('video_config').select('*').eq('club_id', clubId).maybeSingle(),
      ]);
      setVideos(v || []);
      // Marcamos cuales son cruces entre terceros: en esos no hay eventos, asi
      // que no va a haber cortes automaticos y conviene que se note al elegir.
      const nombresRivales = new Set((rivalesClub || []).map(r => r.nombre).filter(Boolean));
      setPartidos((p || []).map(pt => ({
        ...pt,
        esAjeno: !!pt.nombre_propio && nombresRivales.has(pt.nombre_propio)
      })));
      if (cfg) {
        setConfigId(cfg.id);
        let lista = Array.isArray(cfg.presets) && cfg.presets.length > 0 ? cfg.presets : null;
        if (!lista) {
          // Club viejo: todavía no tiene "presets", solo la botonera plana de antes.
          // La envolvemos en un preset único para que nada se rompa.
          const etiquetasLegacy = Array.isArray(cfg.etiquetas) && cfg.etiquetas.length > 0 ? cfg.etiquetas : ETIQUETAS_DEFAULT;
          lista = [{ id: 'principal', nombre: 'PRINCIPAL', etiquetas: etiquetasLegacy }];
        }
        setPresets(lista);
        const activoId = cfg.preset_activo && lista.some(pr => pr.id === cfg.preset_activo) ? cfg.preset_activo : lista[0].id;
        setPresetActivoId(activoId);
        setEtiquetas(lista.find(pr => pr.id === activoId)?.etiquetas || ETIQUETAS_DEFAULT);
        if (cfg.preroll_default) setPreroll(cfg.preroll_default);
      } else {
        const inicial = [{ id: 'principal', nombre: 'PRINCIPAL', etiquetas: ETIQUETAS_DEFAULT }];
        setPresets(inicial);
        setPresetActivoId('principal');
      }
      setCargando(false);
    })();
  }, [clubId]);

  const fetchClips = useCallback(async (videoId) => {
    const data = await fetchPaginado(() =>
      supabase
        .from('video_clips')
        .select('*')
        .eq('video_id', videoId)
        .order('orden', { ascending: true, nullsFirst: false })
        .order('inicio', { ascending: true })
        .order('id', { ascending: true })
    ).catch(() => []);
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
      fetchPaginado(() =>
        supabase.from('video_analisis').select('*, video_clips(count)').eq('club_id', clubId)
          .order('created_at', { ascending: false }).order('id', { ascending: false })
      ).then(data => setVideos(data || [])).catch(() => {});
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
      categoria: categoriaDelAlta(),
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
        categoria: categoriaDelAlta(),
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
      categoria: categoriaDelAlta(),
    }]).select().single();
    setGuardandoVideo(false);
    if (error) { setErrorForm('Error al guardar: ' + error.message); return; }
    cerrarModalNuevo();
    setVideos(prev => [{ ...data, video_clips: [{ count: 0 }] }, ...prev]);
    abrirVideo(data);
  };

  // La categoria de un video sale del partido si esta asociado; si es un video
  // suelto (scouting de un rival contra terceros) se elige a mano. Sin esto el
  // dossier no puede separar el material de Primera del de Tercera.
  const categoriaDelAlta = () => {
    if (formPartido) {
      const pt = partidos.find(x => x.id === formPartido);
      if (pt?.categoria) return pt.categoria;
    }
    return formCategoria || null;
  };

  const cerrarModalNuevo = () => {
    setModalNuevo(false);
    setFormUrl(''); setFormTitulo(''); setFormPartido(''); setFormCategoria(''); setArchivoElegido(null); setErrorForm('');
  };

  // ── Configuración de botonera (presets + colchón) ──
  const abrirModalConfig = () => {
    setPresetsEdit(presets.map(pr => ({ ...pr, etiquetas: pr.etiquetas.map(e => ({ ...e })) })));
    setPresetIdEdit(presetActivoId || presets[0]?.id || null);
    setPrerollEdit(preroll);
    setModalConfig(true);
  };

  const presetEnEdicion = presetsEdit.find(pr => pr.id === presetIdEdit) || null;

  const agregarPreset = () => {
    const nuevo = { id: `preset_${Date.now()}`, nombre: 'NUEVA BOTONERA', etiquetas: [] };
    setPresetsEdit(prev => [...prev, nuevo]);
    setPresetIdEdit(nuevo.id);
  };

  const renombrarPresetEdit = (nombre) => {
    setPresetsEdit(prev => prev.map(pr => pr.id === presetIdEdit ? { ...pr, nombre } : pr));
  };

  const eliminarPresetEdit = (id) => {
    setPresetsEdit(prev => {
      const resto = prev.filter(pr => pr.id !== id);
      if (resto.length === 0) return prev; // no dejar la botonera sin ningún preset
      if (presetIdEdit === id) setPresetIdEdit(resto[0].id);
      return resto;
    });
  };

  const agregarEtiquetaEdit = () => {
    setPresetsEdit(prev => prev.map(pr => pr.id === presetIdEdit ? { ...pr, etiquetas: [...pr.etiquetas, { t: '', c: '#3b82f6' }] } : pr));
  };

  const actualizarEtiquetaEdit = (i, campo, valor) => {
    setPresetsEdit(prev => prev.map(pr => pr.id !== presetIdEdit ? pr : {
      ...pr,
      etiquetas: pr.etiquetas.map((e, idx) => idx === i ? { ...e, [campo]: valor } : e),
    }));
  };

  const eliminarEtiquetaEdit = (i) => {
    setPresetsEdit(prev => prev.map(pr => pr.id !== presetIdEdit ? pr : {
      ...pr,
      etiquetas: pr.etiquetas.filter((_, idx) => idx !== i),
    }));
  };

  const guardarConfig = async () => {
    const limpio = presetsEdit
      .map(pr => ({
        ...pr,
        nombre: (pr.nombre || 'BOTONERA').trim().toUpperCase(),
        etiquetas: pr.etiquetas.map(e => ({ ...e, t: e.t.trim().toUpperCase() })).filter(e => e.t),
      }))
      .filter(pr => pr.etiquetas.length > 0);
    if (limpio.length === 0) return;

    setGuardandoConfig(true);
    // Si el preset que estaba activo para taggear sigue existiendo, seguimos ahí.
    // Si lo borraste en el modal, caemos al primero que haya quedado.
    const activoId = limpio.some(pr => pr.id === presetActivoId) ? presetActivoId : limpio[0].id;
    const etiquetasActivas = limpio.find(pr => pr.id === activoId)?.etiquetas || limpio[0].etiquetas;
    const payload = {
      club_id: clubId,
      presets: limpio,
      preset_activo: activoId,
      etiquetas: etiquetasActivas, // se mantiene en paralelo por compatibilidad
      preroll_default: prerollEdit,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('video_config').upsert(payload, { onConflict: 'club_id' }).select().single();
    setGuardandoConfig(false);
    if (!error && data) {
      setConfigId(data.id);
      setPresets(limpio);
      setPresetActivoId(activoId);
      setEtiquetas(etiquetasActivas);
      setPreroll(prerollEdit);
      setModalConfig(false);
    }
  };

  // ── Cambio rápido de preset (mientras tagueás, sin abrir el modal completo) ──
  const cambiarPreset = async (id) => {
    const preset = presets.find(pr => pr.id === id);
    if (!preset) return;
    setPresetActivoId(id);
    setEtiquetas(preset.etiquetas);
    if (clubId) {
      await supabase.from('video_config').upsert(
        { club_id: clubId, presets, preset_activo: id, etiquetas: preset.etiquetas, preroll_default: preroll, updated_at: new Date().toISOString() },
        { onConflict: 'club_id' }
      );
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
  const marcarClip = useCallback(async (etiqueta) => {
    if (!listoActual) return;
    const fin = adaptador.getTiempo();
    const inicio = Math.max(0, fin - preroll);
    const { data, error } = await supabase.from('video_clips').insert([{
      video_id: videoActivo.id,
      club_id: clubId,
      inicio, fin, etiqueta,
      // La columna existia pero nunca se guardaba: sin esto los clips no se
      // pueden separar por categoria en el explorador ni en el dossier.
      categoria: videoActivo.categoria || null,
    }]).select().single();
    if (!error && data) {
      setClips(prev => [...prev, data].sort((a, b) => a.inicio - b.inicio));
    }
  }, [listoActual, adaptador, preroll, videoActivo, clubId]);

  // ── NUEVO: ATAJOS DE TECLADO PARA CLIPS ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Evitamos disparar los clips si estás tipeando el nombre de una playlist, nota del clip, etc.
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const idx = num - 1;
        if (etiquetas[idx]) { 
            e.preventDefault(); 
            marcarClip(etiquetas[idx].t); 
        }
      } else if (e.key === '0') {
        if (etiquetas[9]) { 
            e.preventDefault(); 
            marcarClip(etiquetas[9].t); 
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [etiquetas, marcarClip]);

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

  // Subtítulo/nota del clip: separado de la etiqueta a propósito — la etiqueta
  // es la categoría que se usa para filtrar, si mezclamos texto libre ahí se
  // rompe el filtrado. Se guarda solo al salir del campo (onBlur), no en cada
  // tecla, para no generar un update por letra tipeada.
  const editarNota = async (clip, nuevaNota) => {
    await supabase.from('video_clips').update({ notas: nuevaNota }).eq('id', clip.id);
  };

  const cambiarNotaLocal = (clip, nuevaNota) => {
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, notas: nuevaNota } : c));
  };

  // ── Pantalla grande: fullscreen nativo del contenedor del video ──
  useEffect(() => {
    const onFsChange = () => setEnPantallaCompleta(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const togglePantallaCompleta = () => {
    const el = videoWrapRef.current;
    if (!el) return;
    const yaEnFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (!yaEnFullscreen) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
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
    setClipActivo(clip);
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
      setClipActivo(null);
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
    // Este era el que primero iba a chocar contra el techo: ~30 clips por partido
    // por 30 partidos ya son 900, y a las 1000 se recortaba en silencio.
    const data = await fetchPaginado(() =>
      supabase
        .from('video_clips')
        .select('*, video_analisis(id, titulo, fuente, video_id, partido_id, rival_id, categoria, partidos(rival, rival_id, fecha, categoria))')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
    ).catch(() => []);
    const conVideo = (data || [])
      .filter(c => c.video_analisis) // por si algún clip quedó huérfano de un video borrado
      .map(c => ({ ...c, video: c.video_analisis }));
    setTodosLosClips(conVideo);
    setCargandoExplorador(false);
  }, [clubId]);

  const fetchPlaylists = useCallback(async () => {
    if (!clubId) return;
    const data = await fetchPaginado(() =>
      supabase.from('video_playlists').select('*').eq('club_id', clubId)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
    ).catch(() => []);
    setPlaylistsGuardadas(data || []);
  }, [clubId]);

  const fetchJugadoresClub = useCallback(async () => {
    if (!clubId) return;
    const data = await fetchPaginado(() =>
      supabase.from('jugadores').select('id, nombre, apellido, categoria').eq('club_id', clubId)
        .order('apellido').order('id')
    ).catch(() => []);
    setJugadoresClub(data || []);
  }, [clubId]);

  const categoriasClub = useMemo(() => [...new Set(jugadoresClub.map(j => j.categoria).filter(Boolean))].sort(), [jugadoresClub]);

  // Categorias que aparecen en el fixture: es la lista que se ofrece al cargar
  // un video suelto de scouting, que no hereda categoria de ningun partido.
  const categoriasPartidos = useMemo(
    () => [...new Set(partidos.map(p => p.categoria).filter(Boolean))].sort(),
    [partidos]
  );

  // ── Modal "compartir con jugadores" ──
  const abrirModalCompartir = (playlist, e) => {
    e.stopPropagation();
    if (jugadoresClub.length === 0) fetchJugadoresClub();
    setModalCompartir(playlist);
    setCatsCompartirEdit(playlist.compartida_categorias || []);
    setJugsCompartirEdit(playlist.compartida_jugadores || []);
    setBusquedaJugCompartir('');
  };

  const toggleCatCompartir = (cat) => {
    setCatsCompartirEdit(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const toggleJugCompartir = (jugadorId) => {
    setJugsCompartirEdit(prev => prev.includes(jugadorId) ? prev.filter(id => id !== jugadorId) : [...prev, jugadorId]);
  };

  const guardarCompartir = async () => {
    if (!modalCompartir) return;
    setGuardandoCompartir(true);
    const { error } = await supabase
      .from('video_playlists')
      .update({ compartida_categorias: catsCompartirEdit, compartida_jugadores: jugsCompartirEdit })
      .eq('id', modalCompartir.id);
    setGuardandoCompartir(false);
    if (!error) {
      setPlaylistsGuardadas(prev => prev.map(p => p.id === modalCompartir.id ? { ...p, compartida_categorias: catsCompartirEdit, compartida_jugadores: jugsCompartirEdit } : p));
      setModalCompartir(null);
    }
  };

  const jugadoresFiltradosCompartir = useMemo(() => {
    const q = busquedaJugCompartir.trim().toLowerCase();
    if (!q) return [];
    return jugadoresClub.filter(j => `${j.apellido} ${j.nombre}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busquedaJugCompartir, jugadoresClub]);

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
      const catClip = c.categoria || c.video?.categoria || c.video?.partidos?.categoria || null;
      const pasaCategoria = !filtroCategoriaExplor || catClip === filtroCategoriaExplor;
      return pasaEtiqueta && pasaVideo && pasaPartido && pasaCategoria;
    });
  }, [todosLosClips, filtroEtiquetasExplor, filtroVideoExplor, filtroPartidoExplor, filtroCategoriaExplor]);

  const categoriasExplor = useMemo(() => {
    const s = new Set();
    todosLosClips.forEach(c => {
      const cat = c.categoria || c.video?.categoria || c.video?.partidos?.categoria;
      if (cat) s.add(cat);
    });
    return [...s].sort();
  }, [todosLosClips]);

  const categorias = useMemo(() => ['TODAS', ...new Set(clips.map(c => c.etiqueta))], [clips]);
  const clipsFiltrados = useMemo(() => filtroCategoria === 'TODAS' ? clips : clips.filter(c => c.etiqueta === filtroCategoria), [clips, filtroCategoria]);
  const conteoPorEtiqueta = useMemo(() => {
    const m = new Map();
    clips.forEach(c => m.set(c.etiqueta, (m.get(c.etiqueta) || 0) + 1));
    return m;
  }, [clips]);
  const conteoPorEtiquetaExplor = useMemo(() => {
    const m = new Map();
    todosLosClips.forEach(c => m.set(c.etiqueta, (m.get(c.etiqueta) || 0) + 1));
    return m;
  }, [todosLosClips]);

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
  // Kiosco/jugador: pantalla de solo lectura, nada de tagueo ni configuración.
  if (esModoJugador) {
    return <VideoanalisisJugador clubId={clubId} jugadorId={perfil?.jugador_id} />;
  }

  if (vista === 'lista') {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '80px', animation: 'fadeIn 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label" style={{ color: 'var(--accent)' }}>VIDEO ANÁLISIS</div>
            <div style={{ fontSize: esMovil ? '1.4rem' : '1.8rem', fontWeight: 900 }}>Marcá momentos, armá tu playlist</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={abrirExplorador} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '44px' }}>
              🔍 EXPLORAR CLIPS
            </button>
            <button onClick={abrirModalConfig} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '44px' }}>
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
                  <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text)', marginBottom: '6px', paddingRight: '20px' }}>
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
            <div className="bento-card" style={{ width: '100%', maxWidth: '480px', boxSizing: 'border-box', border: '1px solid var(--accent)', borderRadius: esMovil ? '16px 16px 0 0' : '12px', maxHeight: '92dvh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>NUEVO ANÁLISIS DE VIDEO</div>
                <button onClick={cerrarModalNuevo} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
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
                    style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '14px', boxSizing: 'border-box' }}
                  />
                </>
              )}

              {tabFuente === 'upload' && (
                <>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>ARCHIVO DE VIDEO</label>
                  <input
                    type="file" accept="video/*"
                    onChange={(e) => { setArchivoElegido(e.target.files[0] || null); setErrorForm(''); }}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px dashed #333', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '0.85rem', marginBottom: '8px', boxSizing: 'border-box' }}
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
                    style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '8px', boxSizing: 'border-box' }}
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
                style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '14px', boxSizing: 'border-box' }}
              />

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>ASOCIAR A UN PARTIDO (opcional)</label>
              <select
                value={formPartido} onChange={(e) => setFormPartido(e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: partidoConVideo ? '8px' : '18px', boxSizing: 'border-box' }}
              >
                <option value="">— Sin asociar —</option>
                {partidos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.esAjeno ? `[SCOUTING] ${p.nombre_propio} vs ${p.rival}` : `vs ${p.rival}`} · {p.fecha} · {p.categoria} {p.video_url ? '🎬' : ''}
                  </option>
                ))}
              </select>

              {/* Sin partido asociado el video no hereda categoria de ningun lado,
                  asi que hay que elegirla: es lo que evita que el material de
                  Tercera aparezca mezclado con el de Primera. */}
              {!formPartido && (
                <>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>CATEGORÍA</label>
                  <select
                    value={formCategoria} onChange={(e) => setFormCategoria(e.target.value)}
                    style={{ width: '100%', padding: '12px', background: 'var(--bg)', border: `1px solid ${formCategoria ? 'var(--border)' : '#f59e0b'}`, color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '6px', boxSizing: 'border-box' }}
                  >
                    <option value="">— Sin categoría —</option>
                    {categoriasPartidos.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '18px' }}>
                    Sin categoría el video queda visible en todas, y se mezcla con el material del resto de las divisiones.
                  </div>
                </>
              )}

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
            <div className="bento-card" style={{ width: '100%', maxWidth: '520px', boxSizing: 'border-box', border: '1px solid var(--accent)', borderRadius: esMovil ? '16px 16px 0 0' : '12px', maxHeight: '90dvh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>CONFIGURAR BOTONERA</div>
                <button onClick={() => setModalConfig(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800 }}>BOTONERAS GUARDADAS</label>
                <button onClick={agregarPreset} style={{ background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', borderRadius: '6px', padding: '5px 10px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer' }}>
                  + NUEVA
                </button>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {presetsEdit.map(pr => (
                  <div
                    key={pr.id}
                    onClick={() => setPresetIdEdit(pr.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 6px 6px 12px', borderRadius: '20px', cursor: 'pointer',
                      border: `1px solid ${pr.id === presetIdEdit ? 'var(--accent)' : 'var(--border)'}`,
                      background: pr.id === presetIdEdit ? 'rgba(0,255,136,0.1)' : 'transparent',
                      color: pr.id === presetIdEdit ? 'var(--accent)' : 'var(--text-dim)',
                    }}
                  >
                    <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>{pr.nombre}</span>
                    {presetsEdit.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); eliminarPresetEdit(pr.id); }}
                        style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer', fontSize: '0.8rem', padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {presetEnEdicion && (
                <>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>NOMBRE DE ESTA BOTONERA</label>
                  <input
                    type="text" value={presetEnEdicion.nombre} onChange={(e) => renombrarPresetEdit(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '14px', boxSizing: 'border-box' }}
                  />

                  <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '10px' }}>ETIQUETAS RÁPIDAS</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {presetEnEdicion.etiquetas.map((et, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="color" value={et.c} onChange={(e) => actualizarEtiquetaEdit(i, 'c', e.target.value)}
                          style={{ width: '38px', height: '38px', padding: 0, border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <input
                          type="text" value={et.t} onChange={(e) => actualizarEtiquetaEdit(i, 't', e.target.value)}
                          placeholder="Nombre de la etiqueta"
                          style={{ flex: 1, minWidth: 0, padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', boxSizing: 'border-box' }}
                        />
                        <button onClick={() => eliminarEtiquetaEdit(i)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0, minWidth: '32px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={agregarEtiquetaEdit} style={{ width: '100%', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', marginBottom: '20px' }}>
                    + AGREGAR ETIQUETA
                  </button>
                </>
              )}

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>COLCHÓN POR DEFECTO (segundos hacia atrás al marcar)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <button onClick={() => setPrerollEdit(p => Math.max(2, p - 2))} style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>-</button>
                <span style={{ fontFamily: MONO, fontSize: '1.1rem', minWidth: '50px', textAlign: 'center' }}>{prerollEdit}s</span>
                <button onClick={() => setPrerollEdit(p => Math.min(30, p + 2))} style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', width: '36px', height: '36px', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>+</button>
              </div>

              <button onClick={guardarConfig} disabled={guardandoConfig} className="btn-action" style={{ width: '100%', padding: '15px', minHeight: '48px' }}>
                {guardandoConfig ? 'GUARDANDO...' : 'GUARDAR CONFIGURACIÓN'}
              </button>
            </div>
          </div>
        )}

        {modalCompartir && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: esMovil ? 'flex-end' : 'center', padding: esMovil ? 0 : '20px' }}>
            <div className="bento-card" style={{ width: '100%', maxWidth: '480px', boxSizing: 'border-box', border: '1px solid var(--accent)', borderRadius: esMovil ? '16px 16px 0 0' : '12px', maxHeight: '90dvh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 900 }}>COMPARTIR CON JUGADORES</div>
                <button onClick={() => setModalCompartir(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '18px' }}>
                "{modalCompartir.nombre}" — elegí quién la puede ver desde el kiosco. Podés combinar categorías enteras con jugadores puntuales (para análisis individual).
              </div>

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>CATEGORÍAS COMPLETAS</label>
              {categoriasClub.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '16px' }}>No hay categorías cargadas en el plantel.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '18px' }}>
                  {categoriasClub.map(cat => (
                    <button
                      key={cat}
                      onClick={() => toggleCatCompartir(cat)}
                      style={{
                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer',
                        border: `1px solid ${catsCompartirEdit.includes(cat) ? 'var(--accent)' : 'var(--border)'}`,
                        background: catsCompartirEdit.includes(cat) ? 'rgba(0,255,136,0.12)' : 'transparent',
                        color: catsCompartirEdit.includes(cat) ? 'var(--accent)' : 'var(--text-dim)',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>JUGADORES PUNTUALES (análisis individual)</label>
              <input
                type="text"
                value={busquedaJugCompartir}
                onChange={(e) => setBusquedaJugCompartir(e.target.value)}
                placeholder="Buscar por apellido o nombre..."
                style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', marginBottom: '8px', boxSizing: 'border-box' }}
              />
              {jugadoresFiltradosCompartir.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '10px', overflow: 'hidden' }}>
                  {jugadoresFiltradosCompartir.map(j => (
                    <div
                      key={j.id}
                      onClick={() => { toggleJugCompartir(j.id); setBusquedaJugCompartir(''); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {j.apellido}, {j.nombre} <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>· {j.categoria}</span>
                    </div>
                  ))}
                </div>
              )}
              {jugsCompartirEdit.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '18px' }}>
                  {jugsCompartirEdit.map(id => {
                    const j = jugadoresClub.find(x => x.id === id);
                    return (
                      <span key={id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 6px 5px 10px', borderRadius: '20px', border: '1px solid var(--accent)', background: 'rgba(0,255,136,0.1)', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 800 }}>
                        {j ? `${j.apellido}, ${j.nombre}` : `#${id}`}
                        <button onClick={() => toggleJugCompartir(id)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>✕</button>
                      </span>
                    );
                  })}
                </div>
              )}

              <button onClick={guardarCompartir} disabled={guardandoCompartir} className="btn-action" style={{ width: '100%', padding: '15px', minHeight: '48px' }}>
                {guardandoCompartir ? 'GUARDANDO...' : 'GUARDAR'}
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
            <button onClick={() => setVista('lista')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '40px', marginBottom: '10px' }}>
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
                      const n = conteoPorEtiquetaExplor.get(et) || 0;
                      return (
                        <button key={et} onClick={() => toggleEtiquetaExplor(et)} style={{ padding: '6px 12px', borderRadius: '20px', border: `1px solid ${activa ? 'var(--accent)' : '#333'}`, background: activa ? 'rgba(0,255,136,0.12)' : '#111', color: activa ? 'var(--accent)' : '#888', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}>
                          {et} ({n})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <select value={filtroVideoExplor} onChange={(e) => setFiltroVideoExplor(e.target.value)} style={{ padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '0.8rem' }}>
                  <option value="">— Todos los videos —</option>
                  {videosDisponiblesExplor.map(v => <option key={v.id} value={v.id}>{v.titulo || 'Video sin título'}</option>)}
                </select>
                <select value={filtroCategoriaExplor} onChange={(e) => setFiltroCategoriaExplor(e.target.value)} style={{ padding: '10px', background: 'var(--bg)', border: `1px solid ${filtroCategoriaExplor ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '0.8rem', fontWeight: filtroCategoriaExplor ? 800 : 400 }}>
                  <option value="">— Todas las categorías —</option>
                  {categoriasExplor.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <select value={filtroPartidoExplor} onChange={(e) => setFiltroPartidoExplor(e.target.value)} style={{ padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '0.8rem' }}>
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
                          <div style={{ fontWeight: 900, fontSize: '0.82rem', color: 'var(--text)' }}>{clip.etiqueta}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {clip.video.titulo || 'Video'} {clip.video.partidos && `· vs ${clip.video.partidos.rival}`} · {fmtTiempo(clip.inicio)}–{fmtTiempo(clip.fin)} ({Math.round(clip.fin - clip.inicio)}s)
                          </div>
                          {clip.notas && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              💬 {clip.notas}
                            </div>
                          )}
                        </div>
                        <button onClick={() => abrirVideo(clip.video)} title="Editar este clip" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>✎</button>
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
                {itemsSeleccionExplor.length > 0 && <button onClick={() => setSeleccionExplor([])} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.7rem' }}>vaciar</button>}
              </div>

              {itemsSeleccionExplor.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                  Marcá clips de la lista para armar tu playlist.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', maxHeight: '300px', overflowY: 'auto' }}>
                  {itemsSeleccionExplor.map((clip, i) => (
                    <div key={clip.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0a0a0a', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: MONO, minWidth: '18px' }}>{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.etiqueta}</span>
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
                  style={{ flex: 1, minWidth: 0, padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px' }}
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
                  {playlistsGuardadas.map(pl => {
                    const catsCount = (pl.compartida_categorias || []).length;
                    const jugsCount = (pl.compartida_jugadores || []).length;
                    const compartidaConAlguien = catsCount > 0 || jugsCount > 0;
                    return (
                    <div key={pl.id} onClick={() => cargarPlaylist(pl)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px', cursor: 'pointer', gap: '8px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.nombre}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: MONO }}>
                          {(pl.clip_ids || []).length} clips
                          {compartidaConAlguien && (
                            <span style={{ color: 'var(--accent)' }}> · {catsCount > 0 ? `${catsCount} cat.` : ''}{catsCount > 0 && jugsCount > 0 ? ' + ' : ''}{jugsCount > 0 ? `${jugsCount} jug.` : ''}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => abrirModalCompartir(pl, e)}
                        title="Elegir quién puede verla desde el kiosco"
                        style={{
                          background: compartidaConAlguien ? 'rgba(0,255,136,0.15)' : 'transparent',
                          border: `1px solid ${compartidaConAlguien ? 'var(--accent)' : 'var(--border)'}`,
                          color: compartidaConAlguien ? 'var(--accent)' : 'var(--text-dim)',
                          borderRadius: '6px', padding: '6px 8px', cursor: 'pointer', flexShrink: 0, fontSize: '0.85rem',
                        }}
                      >
                        📱
                      </button>
                      <button onClick={(e) => eliminarPlaylist(pl, e)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                    </div>
                    );
                  })}
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
        <button onClick={volverALista} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, minHeight: '40px' }}>
          ← Mis videos
        </button>
        <div style={{ fontWeight: 900, fontSize: esMovil ? '0.9rem' : '1.1rem', textAlign: 'right' }}>
          {videoActivo?.titulo || 'Video'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: (esMovil || modoCine) ? '1fr' : 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: '18px', alignItems: 'start' }}>

        {/* ── COLUMNA PRINCIPAL: reproductor + botonera ── */}
        <div style={{ minWidth: 0 }}>
          <div ref={videoWrapRef} style={{ position: 'relative', width: '100%', aspectRatio: enPantallaCompleta ? 'auto' : '16 / 9', height: enPantallaCompleta ? '100%' : 'auto', background: 'var(--bg)', borderRadius: enPantallaCompleta ? 0 : '10px', overflow: 'hidden', marginBottom: '14px' }}>
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
                  style={{ width: '100%', height: '100%', background: 'var(--bg)' }}
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
            {clipActivo && (
              <div
                style={{
                  position: 'absolute', top: '10px', left: '10px', right: '60px', maxWidth: '75%',
                  background: 'rgba(0,0,0,0.65)', borderRadius: '8px',
                  padding: enPantallaCompleta ? '12px 18px' : '8px 12px',
                  zIndex: 5, pointerEvents: 'none',
                }}
              >
                <div style={{ color: '#fff', fontWeight: 900, fontSize: enPantallaCompleta ? '1.6rem' : '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1.2 }}>
                  {clipActivo.etiqueta}
                </div>
                {clipActivo.notas && (
                  <div style={{ color: '#ddd', fontSize: enPantallaCompleta ? '1.1rem' : '0.72rem', marginTop: '4px', lineHeight: 1.3 }}>
                    {clipActivo.notas}
                  </div>
                )}
              </div>
            )}
            
            {/* BOTÓN MODO CINE */}
            <button
              onClick={() => setModoCine(!modoCine)}
              title={modoCine ? 'Salir de Modo Cine' : 'Modo Cine (Pantalla Ancha)'}
              style={{ position: 'absolute', top: '10px', right: '50px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: '6px', padding: '8px 10px', fontSize: '0.9rem', cursor: 'pointer', zIndex: 5 }}
            >
              {modoCine ? '🔳' : '🔲'}
            </button>

            <button
              onClick={togglePantallaCompleta}
              title={enPantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla grande (para mostrarle a los jugadores)'}
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: '6px', padding: '8px 10px', fontSize: '0.9rem', cursor: 'pointer', zIndex: 5 }}
            >
              {enPantallaCompleta ? '✕' : '⛶'}
            </button>
          </div>

          <div className="bento-card" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div className="stat-label" style={{ color: 'var(--accent)' }}>MARCAR MOMENTO</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                <span style={{ fontFamily: MONO }}>▶ {fmtTiempo(tiempoActual)}</span>
                <span>· colchón</span>
                <button onClick={() => setPreroll(p => Math.max(2, p - 2))} style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer' }}>-</button>
                <span style={{ fontFamily: MONO, minWidth: '28px', textAlign: 'center' }}>{preroll}s</span>
                <button onClick={() => setPreroll(p => Math.min(30, p + 2))} style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer' }}>+</button>
              </div>
            </div>
            {presets.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {presets.map(pr => (
                  <button
                    key={pr.id}
                    onClick={() => cambiarPreset(pr.id)}
                    style={{
                      padding: '6px 12px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer',
                      border: `1px solid ${pr.id === presetActivoId ? 'var(--accent)' : 'var(--border)'}`,
                      background: pr.id === presetActivoId ? 'rgba(0,255,136,0.12)' : 'transparent',
                      color: pr.id === presetActivoId ? 'var(--accent)' : 'var(--text-dim)',
                    }}
                  >
                    {pr.nombre}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
              {etiquetas.map((et, index) => {
                const n = conteoPorEtiqueta.get(et.t) || 0;
                // Para mostrar visualmente el atajo (1 al 9, 0 para el décimo)
                const shortcut = index < 9 ? index + 1 : index === 9 ? 0 : null;
                return (
                  <button
                    key={et.t}
                    onClick={() => marcarClip(et.t)}
                    disabled={!listoActual}
                    style={{
                      padding: '14px 8px', background: `${et.c}18`, border: `1px solid ${et.c}`, color: et.c,
                      borderRadius: '8px', fontWeight: 900, fontSize: '0.75rem', cursor: listoActual ? 'pointer' : 'not-allowed',
                      minHeight: '48px', opacity: listoActual ? 1 : 0.5,
                      position: 'relative'
                    }}
                  >
                    {shortcut !== null && (
                      <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '0.55rem', opacity: 0.6 }}>
                        [{shortcut}]
                      </span>
                    )}
                    {et.t}{n > 0 && <span style={{ opacity: 0.7 }}> ({n})</span>}
                  </button>
                );
              })}
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
              <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ width: '100%', padding: '8px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '0.75rem', marginBottom: '12px' }}>
                {categorias.map(c => <option key={c} value={c}>{c === 'TODAS' ? `TODAS (${clips.length})` : `${c} (${conteoPorEtiqueta.get(c) || 0})`}</option>)}
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
                          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 900, fontSize: '0.8rem', outline: 'none' }}
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

                      <input
                        value={clip.notas || ''}
                        onChange={(e) => cambiarNotaLocal(clip, e.target.value)}
                        onBlur={(e) => editarNota(clip, e.target.value)}
                        placeholder="Subtítulo / nota (opcional)..."
                        style={{ width: '100%', marginTop: '8px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '6px', padding: '6px 8px', color: 'var(--text-dim)', fontSize: '0.72rem', outline: 'none', boxSizing: 'border-box' }}
                      />

                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <button onClick={() => reproducirCola([{ clip, video: videoActivo }])} style={{ flex: 1, background: activo ? 'var(--accent)' : '#151515', color: activo ? '#000' : '#fff', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', minHeight: '36px' }}>
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

const btnAjuste = { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '4px', padding: '4px 7px', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 700, minHeight: '28px' };

// ============================================================================
// VISTA DE JUGADOR (kiosco): solo lectura. Lista las playlists que el CT marcó
// como "compartida" y las reproduce en secuencia. Nada de tagueo, config ni
// carga de video — por diseño no reusa la UI del editor, es una pantalla aparte.
// ============================================================================
function VideoanalisisJugador({ clubId, jugadorId }) {
  const [playlists, setPlaylists] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [playlistActiva, setPlaylistActiva] = useState(null);
  const [clipsCola, setClipsCola] = useState([]);
  const [indice, setIndice] = useState(0);
  const [ytListo, setYtListo] = useState(false);
  const videoElRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    if (!clubId) return;
    // CORRECCIÓN: flag para descartar el resultado si este efecto quedó obsoleto
    // (por ej. se disparó una vez con jugadorId todavía sin resolver del perfil del
    // kiosco, y esa corrida vieja tardó más en volver que la corrida nueva ya con el
    // jugadorId correcto — sin este guard, la respuesta vieja pisaba a la buena y
    // el jugador veía la lista vacía aunque la playlist sí estuviera compartida).
    let cancelado = false;

    (async () => {
      setCargando(true);

      // Obtenemos su categoría directo de la sesión del kiosco para más seguridad y rapidez,
      // y hacemos un fallback a la base de datos por las dudas.
      let miCategoria = localStorage.getItem('kiosco_categoria');
      if (!miCategoria && jugadorId) {
        const { data: yo } = await supabase.from('jugadores').select('categoria').eq('id', jugadorId).maybeSingle();
        miCategoria = yo?.categoria || null;
      }

      // RLS ya filtra a "compartida con alguien" (categorías o jugadores no vacío)
      // y acá filtramos del lado del cliente cuál de esas es PARA ESTE jugador.
      const { data } = await supabase
        .from('video_playlists')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false });

      if (cancelado) return;

      const visibles = (data || []).filter((pl) => {
        const cats = pl.compartida_categorias || [];
        const jugs = pl.compartida_jugadores || [];
        
        const matcheaCat = miCategoria && cats.includes(miCategoria);
        // SOLUCIÓN: pasamos ambos a String para comparar sin importar si el ID es INT o UUID.
        const matcheaJug = jugadorId && jugs.some(id => String(id) === String(jugadorId));
        
        return matcheaCat || matcheaJug;
      });

      setPlaylists(visibles);
      setCargando(false);
    })();

    return () => { cancelado = true; };
  }, [clubId, jugadorId]);

  // Carga la API de YouTube una sola vez (versión mínima, sin todo lo del editor)
  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtListo(true); return; }
    const yaExiste = document.getElementById('yt-iframe-api-script');
    if (!yaExiste) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { setYtListo(true); if (anterior) anterior(); };
  }, []);

  const abrirPlaylist = async (playlist) => {
    setCargando(true);
    const ids = playlist.clip_ids || [];
    const { data } = await supabase
      .from('video_clips')
      .select('*, video_analisis(id, titulo, fuente, video_id, video_url)')
      .in('id', ids.length > 0 ? ids : [-1]);
    // Respetamos el orden guardado en la playlist, no el que devuelva la query
    const ordenados = ids.map((id) => (data || []).find((c) => c.id === id)).filter(Boolean);
    setClipsCola(ordenados);
    setPlaylistActiva(playlist);
    setIndice(0);
    setCargando(false);
  };

  const volverALista = () => {
    if (playerRef.current) { try { playerRef.current.destroy(); } catch (e) {} playerRef.current = null; }
    setPlaylistActiva(null);
    setClipsCola([]);
  };

  const clipActual = clipsCola[indice] || null;
  const video = clipActual?.video_analisis;

  const avanzar = useCallback(() => {
    setIndice((i) => (i + 1 < clipsCola.length ? i + 1 : i));
  }, [clipsCola.length]);
  const retroceder = () => setIndice((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!clipActual || !video) return;

    if (video.fuente === 'youtube' && ytListo) {
      if (playerRef.current && playerRef.current.loadVideoById) {
        playerRef.current.loadVideoById({ videoId: video.video_id, startSeconds: clipActual.inicio });
      } else {
        playerRef.current = new window.YT.Player('yt-player-kiosco', {
          videoId: video.video_id,
          playerVars: { start: Math.floor(clipActual.inicio), autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: (e) => e.target.playVideo(),
            onStateChange: (e) => {
              if (e.data === window.YT.PlayerState.PLAYING) {
                const chequeo = setInterval(() => {
                  if (!playerRef.current) { clearInterval(chequeo); return; }
                  if (playerRef.current.getCurrentTime() >= clipActual.fin) {
                    clearInterval(chequeo);
                    avanzar();
                  }
                }, 300);
              }
            },
          },
        });
      }
    } else if (video.fuente !== 'youtube' && videoElRef.current) {
      videoElRef.current.currentTime = clipActual.inicio;
      videoElRef.current.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, clipActual?.id, ytListo]);

  if (cargando) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Cargando...</div>;
  }

  // ── Lista de playlists compartidas ──
  if (!playlistActiva) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '10px 0 40px' }}>
        <h2 style={{ color: 'var(--accent)', marginBottom: '20px', fontSize: '1.3rem' }}>🎬 VIDEOS PARA VOS</h2>
        {playlists.length === 0 ? (
          <div className="bento-card" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '30px' }}>
            Tu CT todavía no te compartió ninguna playlist.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => abrirPlaylist(pl)}
                className="bento-card"
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ fontWeight: 800, color: 'var(--text)' }}>{pl.nombre}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: MONO }}>{(pl.clip_ids || []).length} clips ▶</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Reproductor ──
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '10px 0 40px' }}>
      <button onClick={volverALista} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', marginBottom: '12px', fontSize: '0.85rem' }}>
        ← Volver a mis playlists
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontWeight: 900, color: 'var(--accent)' }}>{playlistActiva.nombre}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: MONO }}>{indice + 1} / {clipsCola.length}</div>
      </div>

      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: 'var(--bg)', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
        {video?.fuente === 'youtube' ? (
          <div id="yt-player-kiosco" style={{ width: '100%', height: '100%' }} />
        ) : (
          video && (
            <video
              ref={videoElRef}
              src={video.video_url}
              controls
              playsInline
              onEnded={avanzar}
              style={{ width: '100%', height: '100%', background: 'var(--bg)' }}
            />
          )
        )}
      </div>

      {clipActual?.notas && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          💬 {clipActual.notas}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={retroceder}
          disabled={indice === 0}
          style={{ flex: 1, padding: '14px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '8px', fontWeight: 800, cursor: indice === 0 ? 'not-allowed' : 'pointer', opacity: indice === 0 ? 0.4 : 1 }}
        >
          ◀ ANTERIOR
        </button>
        <button
          onClick={avanzar}
          disabled={indice >= clipsCola.length - 1}
          style={{ flex: 1, padding: '14px', background: 'var(--accent)', border: 'none', color: '#000', borderRadius: '8px', fontWeight: 900, cursor: indice >= clipsCola.length - 1 ? 'not-allowed' : 'pointer', opacity: indice >= clipsCola.length - 1 ? 0.4 : 1 }}
        >
          SIGUIENTE ▶
        </button>
      </div>
    </div>
  );
}