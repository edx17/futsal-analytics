import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { useEsMovil } from '../utils/useEsMovil';
import { soloActivos } from '../utils/plantelActivo';
import { disponibilidadDe, cuentaParaPresentismo, cuentaComoPresente } from '../utils/disponibilidad';
import { analizarPartido, calcularMinutosPorJugador } from '../analytics/engine';
import { calcularRatingJugador } from '../analytics/rating';
import {
  PLANTILLA_DEFAULT, INDUMENTARIA_DEFAULT, MINUTOS_ANTES_DEFAULT, PLACEHOLDERS,
  resolverPlantilla, restarMinutos, partesDeFecha,
  sugerirConvocatoria, limiteConvocados, esArquero,
} from '../utils/citacion';

/* ══════════════════════════════════════════════════════════════════════════
   CITACIÓN AL PRÓXIMO PARTIDO

   Arma el mensaje que hoy se escribe a mano en el grupo de WhatsApp: elige el
   partido, sugiere a quién citar, deja tildar a mano y arma el texto final
   listo para copiar o para abrir WhatsApp con todo escrito.

   La convocatoria se guarda en `partidos.plantilla`, la misma que llena NUEVO
   PARTIDO, así lo que se cita acá cuenta en las estadísticas de citados.
   ══════════════════════════════════════════════════════════════════════════ */

/* Mismo criterio de "wellness en rojo" que usa el Centro de Mando. */
const enRojoWell = (w) =>
  Number(w.fatiga ?? 3) >= 4 || Number(w.dolor_muscular ?? 3) >= 4 ||
  Number(w.estres ?? 3) >= 4 || Number(w.sueno ?? 3) <= 2;

const UMBRAL_AMARILLAS = 5;   // cada 5 amarillas, una fecha (igual que Disciplina)
const PARTIDOS_PARA_RATING = 8;
const SEMANAS_PRESENTISMO = 6;

const hoyISO = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
};

const diasAtrasISO = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parsePlantilla = (p) => {
  try {
    const pl = typeof p?.plantilla === 'string' ? JSON.parse(p.plantilla) : p?.plantilla;
    return Array.isArray(pl) ? pl : [];
  } catch { return []; }
};

/* PostgREST devuelve varios códigos distintos para "esa columna no existe".
   Si la migración de la citación todavía no se corrió, guardamos lo que sí
   entra y avisamos, en vez de perder el trabajo del técnico. */
const faltaLaColumna = (error) =>
  error?.code === '42703' || error?.code === 'PGRST204' || error?.code === 'PGRST202'
  || /column .* does not exist|schema cache/i.test(error?.message || '');

/* Trae de a 1000 filas: PostgREST corta ahí sin importar el .limit() que pidas. */
const traerPaginado = async (armarQuery) => {
  const PAGINA = 1000;
  let acumulado = [];
  for (let p = 0; ; p++) {
    const { data, error } = await armarQuery().range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) { console.error('Citación, paginando:', error.message); break; }
    acumulado = acumulado.concat(data || []);
    if (!data || data.length < PAGINA) break;
    if (p > 50) break;
  }
  return acumulado;
};

const input = {
  width: '100%', padding: '10px 12px', background: 'var(--panel)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: '6px', outline: 'none',
  fontSize: '0.85rem', fontFamily: 'inherit',
};

const label = {
  fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-dim)',
  marginBottom: '6px', display: 'block', textTransform: 'uppercase',
};

/* Fuera del componente a propósito: declarado adentro, React lo ve como un tipo
   distinto en cada render y remonta el input, que pierde el foco a cada tecla. */
const Campo = ({ titulo, children }) => (
  <div><span style={label}>{titulo}</span>{children}</div>
);

function Citacion() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const esMovil = useEsMovil();

  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const esCT = String(perfil?.rol || '').toLowerCase() === 'ct';
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);
  const miClub = localStorage.getItem('mi_club') || perfil?.clubes?.nombre || 'MI EQUIPO';

  const [cargando, setCargando] = useState(true);
  const [calculandoRatings, setCalculandoRatings] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const [partidos, setPartidos] = useState([]);
  const [partidoId, setPartidoId] = useState('');
  const [jugadores, setJugadores] = useState([]);
  const [asistencias, setAsistencias] = useState([]);
  const [sanciones, setSanciones] = useState([]);
  const [amarillasPorJugador, setAmarillasPorJugador] = useState({});
  const [wellnessHoy, setWellnessHoy] = useState([]);
  const [lesiones, setLesiones] = useState([]);
  const [ratings, setRatings] = useState({});

  const [seleccion, setSeleccion] = useState({});
  const [form, setForm] = useState({ sede: '', direccion: '', horario: '', horaCitacion: '', entrada: '', indumentaria: '' });
  const [plantilla, setPlantilla] = useState(PLANTILLA_DEFAULT);
  const [minutosAntes, setMinutosAntes] = useState(MINUTOS_ANTES_DEFAULT);
  const [mensajeManual, setMensajeManual] = useState(null);   // si el técnico edita el texto final
  const [verPlantilla, setVerPlantilla] = useState(false);
  /* Categorías de más que el técnico quiere ver además de la del partido:
     bajar dos de 1ra para que jueguen en 3ra, subir uno de 4ta, etc. */
  const [categoriasExtra, setCategoriasExtra] = useState([]);

  const partido = useMemo(() => partidos.find(p => String(p.id) === String(partidoId)) || null, [partidos, partidoId]);

  /* ── 1. CATÁLOGOS ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!clubId) { setCargando(false); return; }

    async function cargar() {
      setCargando(true);
      try {
        const hoy = hoyISO();

        let qPartidos = supabase.from('partidos').select('*')
          .eq('club_id', clubId).eq('estado', 'Pendiente').gte('fecha', hoy)
          .order('fecha', { ascending: true }).limit(20);
        let qJugadores = supabase.from('jugadores').select('*').eq('club_id', clubId).order('apellido', { ascending: true });
        let qAsistencias = supabase.from('asistencias').select('*').eq('club_id', clubId).gte('fecha', diasAtrasISO(SEMANAS_PRESENTISMO * 7));
        const qSanciones = supabase.from('disciplina_sanciones').select('*').eq('club_id', clubId);
        const qLesiones = supabase.from('lesiones').select('*').eq('club_id', clubId);
        const qWellness = supabase.from('wellness').select('*').eq('club_id', clubId).eq('fecha', hoy);
        const qClub = supabase.from('clubes').select('*').eq('id', clubId).maybeSingle();

        if (esCT && misCategorias.length > 0) {
          qPartidos = qPartidos.in('categoria', misCategorias);
          qJugadores = qJugadores.in('categoria', misCategorias);
          qAsistencias = qAsistencias.in('categoria', misCategorias);
        }

        const [rPar, rJug, rAsi, rSan, rWel, rClub, rLes] = await Promise.all([
          qPartidos, qJugadores, qAsistencias, qSanciones, qWellness, qClub, qLesiones,
        ]);

        /* Si la tabla de lesiones todavía no existe (migración sin correr), la
           citación sigue funcionando: simplemente no bloquea por lesión. */
        if (rLes.error) console.warn('Citación sin datos de lesiones:', rLes.error.message);

        /* El fixture guarda con mi club_id los cruces entre OTROS equipos del
           torneo. Se reconocen porque van como 'Neutral' Y el nombre propio no
           es el mío. Un partido mío en cancha neutral SÍ cuenta: por eso no
           alcanza con mirar la condición. Mismo criterio que el Centro de Mando. */
        const norm = (t) => String(t || '').trim().toLowerCase();
        const nombresMios = new Set([norm(miClub), norm(localStorage.getItem('mi_club') || '')].filter(Boolean));
        const esCruceAjeno = (p) => p.condicion === 'Neutral' && nombresMios.size > 0 && p.nombre_propio
          && !nombresMios.has(norm(p.nombre_propio)) && !nombresMios.has(norm(p.rival));
        const propios = (rPar.data || []).filter(p => !esCruceAjeno(p));
        setPartidos(propios);
        setJugadores(soloActivos(rJug.data || []));
        setAsistencias(rAsi.data || []);
        setSanciones(rSan.data || []);
        setWellnessHoy(rWel.data || []);
        setLesiones(rLes.data || []);

        /* La plantilla del mensaje: primero la del club, si no la última que
           se usó en este navegador, si no la que viene de fábrica. */
        const cfgClub = rClub.data?.citacion_config || null;
        let cfgLocal = null;
        try { cfgLocal = JSON.parse(localStorage.getItem(`citacion_cfg_${clubId}`) || 'null'); } catch { cfgLocal = null; }
        const cfg = cfgClub || cfgLocal || {};
        setPlantilla(cfg.plantilla || PLANTILLA_DEFAULT);
        setMinutosAntes(Number.isFinite(Number(cfg.minutos_antes)) ? Number(cfg.minutos_antes) : MINUTOS_ANTES_DEFAULT);
        setForm(f => ({
          ...f,
          indumentaria: cfg.indumentaria || INDUMENTARIA_DEFAULT,
          entrada: cfg.entrada || '',
        }));

        if (propios.length > 0) setPartidoId(String(propios[0].id));
      } catch (err) {
        console.error('Citación, carga inicial:', err);
        showToast('No se pudieron cargar los datos.', 'error');
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [clubId, esCT, misCategorias, miClub, showToast]);

  /* ── 2. AL ELEGIR PARTIDO: AUTOCOMPLETAR ──────────────────────────────── */
  useEffect(() => {
    if (!partido) return;

    const citacionGuardada = partido.citacion || {};

    setForm(f => ({
      ...f,
      sede: partido.lugar || '',
      direccion: partido.direccion || '',
      horario: partido.horario || '',
      horaCitacion: partido.hora_citacion || restarMinutos(partido.horario, minutosAntes),
      indumentaria: citacionGuardada.indumentaria || f.indumentaria || INDUMENTARIA_DEFAULT,
      entrada: citacionGuardada.entrada || f.entrada || '',
    }));

    // Si el partido ya tenía convocatoria cargada, la respetamos.
    const previos = parsePlantilla(partido);
    setSeleccion(previos.length
      ? Object.fromEntries(previos.map(x => [String(x.id_jugador), true]))
      : {});

    setMensajeManual(citacionGuardada.mensaje || null);
    setCategoriasExtra([]);

    /* La dirección del rival, si ya la anotamos alguna vez, se recuerda. */
    if (!partido.direccion && partido.rival_id) {
      supabase.from('rivales').select('sede, direccion').eq('id', partido.rival_id).maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setForm(f => ({
            ...f,
            sede: f.sede || data.sede || '',
            direccion: f.direccion || data.direccion || '',
          }));
        });
    }
  }, [partido, minutosAntes]);

  /* ── 3. RATINGS RECIENTES DE LA CATEGORÍA ─────────────────────────────── */
  useEffect(() => {
    if (!clubId || !partido?.categoria) { setRatings({}); return; }
    let cancelado = false;

    async function calcular() {
      setCalculandoRatings(true);
      try {
        const anio = new Date().getFullYear();
        const { data: recientes } = await supabase.from('partidos')
          .select('id, fecha, categoria')
          .eq('club_id', clubId).eq('categoria', partido.categoria)
          .in('estado', ['Finalizado', 'Jugado'])
          .order('fecha', { ascending: false }).limit(PARTIDOS_PARA_RATING);

        const ids = (recientes || []).map(p => p.id);
        if (ids.length === 0) { if (!cancelado) { setRatings({}); setAmarillasPorJugador({}); } return; }

        const eventos = await traerPaginado(() => supabase.from('eventos').select('*')
          .in('id_partido', ids)
          .order('id_partido', { ascending: false })
          .order('created_at', { ascending: true }));

        /* Amarillas del año para la suspensión por acumulación. Consulta
           aparte y acotada: sólo las tarjetas, no todos los eventos del año. */
        const { data: partidosAnio } = await supabase.from('partidos')
          .select('id').eq('club_id', clubId).eq('categoria', partido.categoria)
          .gte('fecha', `${anio}-01-01`).in('estado', ['Finalizado', 'Jugado']);
        const idsAnio = (partidosAnio || []).map(p => p.id);
        let amarillas = {};
        if (idsAnio.length) {
          const tarjetas = await traerPaginado(() => supabase.from('eventos')
            .select('id_jugador').in('id_partido', idsAnio).eq('accion', 'Tarjeta Amarilla'));
          tarjetas.forEach(t => {
            if (t.id_jugador == null) return;
            const k = String(t.id_jugador);
            amarillas[k] = (amarillas[k] || 0) + 1;
          });
        }

        const porPartido = {};
        eventos.forEach(e => {
          if (!porPartido[e.id_partido]) porPartido[e.id_partido] = [];
          porPartido[e.id_partido].push(e);
        });

        const acumulado = {};
        Object.values(porPartido).forEach(evs => {
          const analisis = analizarPartido(evs, 'Propio', false);
          const minutos = calcularMinutosPorJugador(evs);
          const evsRival = evs.filter(e => e.equipo === 'Rival' || e.is_rival);

          jugadores.forEach(j => {
            const sid = String(j.id);
            const propios = evs.filter(e => String(e.id_jugador) === sid);
            // El asistidor también suma para su rating, como en Resumen Plantel.
            const asistidos = evs
              .filter(e => String(e.id_asistencia) === sid && (e.accion === 'Gol' || e.accion === 'Remate - Gol'))
              .map(e => ({ ...e, id_jugador: j.id, tipoVirtual: 'Asistencia' }));
            if (propios.length === 0 && asistidos.length === 0) return;

            const mins = minutos[j.id] || minutos[sid] || 0;
            const pm = analisis?.plusMinusJugador?.[j.id] ?? analisis?.plusMinusJugador?.[sid] ?? 0;
            const rat = Number(calcularRatingJugador(j, [...propios, ...asistidos], evsRival, pm, mins));
            if (Number.isFinite(rat)) {
              if (!acumulado[sid]) acumulado[sid] = [];
              acumulado[sid].push(rat);
            }
          });
        });

        if (!cancelado) { setRatings(acumulado); setAmarillasPorJugador(amarillas); }
      } catch (err) {
        console.error('Citación, ratings:', err);
      } finally {
        if (!cancelado) setCalculandoRatings(false);
      }
    }

    if (jugadores.length > 0) calcular();
    return () => { cancelado = true; };
  }, [clubId, partido?.categoria, jugadores]);

  /* ── 4. PLANTEL DE LA CATEGORÍA + EVALUACIÓN ──────────────────────────── */
  const mismaCategoria = (j) =>
    !partido?.categoria || String(j.categoria || '').trim() === String(partido.categoria).trim();

  /* Las otras categorías del club, para poder traer refuerzos. */
  const otrasCategorias = useMemo(() => {
    const cats = new Set(jugadores.map(j => String(j.categoria || '').trim()).filter(Boolean));
    if (partido?.categoria) cats.delete(String(partido.categoria).trim());
    return [...cats].sort((a, b) => a.localeCompare(b, 'es'));
  }, [jugadores, partido?.categoria]);

  /* Se ven: los de la categoría del partido, los de las categorías que el
     técnico haya sumado, y SIEMPRE los que ya están tildados — si no, apagar
     un filtro los sacaría de la lista sin que se note. */
  const jugadoresVisibles = useMemo(() => jugadores.filter(j =>
    mismaCategoria(j)
    || categoriasExtra.includes(String(j.categoria || '').trim())
    || seleccion[String(j.id)]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [jugadores, partido?.categoria, categoriasExtra, seleccion]);

  /* Sólo los de la categoría del partido entran en la SUGERENCIA automática:
     que el motor proponga solo a un jugador de 1ra para un partido de 3ra
     sería pasarle por encima al técnico. Los de otras categorías se ven, se
     puntúan y se pueden tildar a mano, que es de lo que se trata. */
  const jugadoresPropios = useMemo(
    () => jugadores.filter(mismaCategoria),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jugadores, partido?.categoria]
  );

  const evaluacion = useMemo(() => {
    /* Los días que el jugador estuvo lesionado no entran en la cuenta: no son
       una falta suya. Antes, dos meses de lesión le hundían el porcentaje y,
       como el presentismo pesa 45% acá, lo dejaban sin convocatorias durante
       meses por algo que no eligió. */
    const presentismo = {};
    asistencias.forEach(a => {
      if (!cuentaParaPresentismo(a.estado)) return;
      const k = String(a.jugador_id);
      if (!presentismo[k]) presentismo[k] = { presentes: 0, total: 0 };
      presentismo[k].total++;
      if (cuentaComoPresente(a.estado)) presentismo[k].presentes++;
    });

    /* BLOQUEOS: el que no puede jugar no se sugiere. Igual queda en la lista y
       se puede tildar a mano: el técnico sabe cosas que la base no. */
    const bloqueos = {};
    const avisos = {};
    const fechasPendientes = {};
    const acumulacionesCumplidas = {};
    sanciones.forEach(s => {
      const k = String(s.jugador_id);
      if (s.tipo === 'acumulacion') {
        acumulacionesCumplidas[k] = (acumulacionesCumplidas[k] || 0) + 1;
        return;
      }
      const total = (s.fechas_tribunal || 0) + (s.fechas_internas || 0);
      fechasPendientes[k] = (fechasPendientes[k] || 0) + Math.max(0, total - (s.fechas_cumplidas || 0));
    });
    Object.entries(fechasPendientes).forEach(([k, f]) => {
      if (f > 0) bloqueos[k] = `Suspendido: ${f} fecha${f > 1 ? 's' : ''} pendiente${f > 1 ? 's' : ''}`;
    });
    Object.entries(amarillasPorJugador).forEach(([k, n]) => {
      const ganadas = Math.floor(n / UMBRAL_AMARILLAS);
      const pendientes = Math.max(0, ganadas - (acumulacionesCumplidas[k] || 0));
      if (pendientes > 0) bloqueos[k] = `Suspendido por ${n} amarillas`;
    });

    /* Lesionados: bloqueo duro en la sugerencia, igual que un suspendido. El
       CT lo puede tildar igual si sabe algo que la base no sabe. Se evalúa a
       la FECHA DEL PARTIDO, no a hoy: al que le dan el alta el sábado se lo
       puede citar para el domingo. */
    const fechaPartido = partido?.fecha ? String(partido.fecha).split('T')[0] : hoyISO();
    jugadoresVisibles.forEach(j => {
      const estado = disponibilidadDe(lesiones, j.id, fechaPartido);
      if (!estado.lesion) return;
      const k = String(j.id);
      if (estado.nivel === 'baja') bloqueos[k] = `${estado.etiqueta}: ${estado.detalle}`;
      else if (estado.nivel === 'readaptacion' && !bloqueos[k]) avisos[k] = `En readaptación: ${estado.detalle}`;
    });

    const hoy = hoyISO();
    jugadoresVisibles.forEach(j => {
      const vto = j.vencimiento_apto ? String(j.vencimiento_apto).split('T')[0] : null;
      if (vto && vto < hoy && !bloqueos[String(j.id)]) {
        bloqueos[String(j.id)] = `Apto médico vencido el ${partesDeFecha(vto).larga}`;
      }
    });

    wellnessHoy.forEach(w => {
      const k = String(w.jugador_id);
      if (enRojoWell(w) && !avisos[k]) avisos[k] = 'Wellness en rojo hoy';
    });

    const comun = { presentismo, ratings, bloqueos, avisos, limite: limiteConvocados(partido?.competicion) };

    // Se puntúa a todos los que están a la vista…
    const { evaluados } = sugerirConvocatoria({ ...comun, jugadores: jugadoresVisibles });
    // …pero la tilde automática sale sólo de la categoría del partido.
    const { sugeridos } = sugerirConvocatoria({ ...comun, jugadores: jugadoresPropios });

    return { evaluados, sugeridos };
  }, [jugadoresVisibles, jugadoresPropios, asistencias, sanciones, amarillasPorJugador, wellnessHoy, ratings, lesiones, partido?.competicion, partido?.fecha]);

  /* ── 5. MENSAJE ───────────────────────────────────────────────────────── */
  /* Del plantel completo y no de la lista visible: si el técnico tilda a dos
     de 1ra y después apaga ese filtro, tienen que seguir en la citación. */
  const convocados = useMemo(
    () => jugadores.filter(j => seleccion[String(j.id)]),
    [jugadores, seleccion]
  );

  const textoGenerado = useMemo(() => {
    if (!partido) return '';
    return resolverPlantilla(plantilla, {
      partido, convocados, miClub,
      horaCitacion: form.horaCitacion,
      sede: form.sede, direccion: form.direccion,
      indumentaria: form.indumentaria, entrada: form.entrada,
    });
  }, [plantilla, partido, convocados, miClub, form]);

  const textoFinal = mensajeManual ?? textoGenerado;

  const limite = limiteConvocados(partido?.competicion);
  const arquerosCitados = convocados.filter(esArquero).length;
  const refuerzos = convocados.filter(j => !mismaCategoria(j)).length;
  const excedido = convocados.length > limite;

  /* ── 6. ACCIONES ──────────────────────────────────────────────────────── */
  const toggle = (id) => setSeleccion(s => ({ ...s, [String(id)]: !s[String(id)] }));

  const aplicarSugerencia = () => {
    /* La sugerencia cubre la categoría del partido y pisa lo que haya tildado
       ahí. A los refuerzos de otra categoría no los toca: el motor no los
       evalúa para sugerir, así que tampoco tiene por qué borrarlos. */
    const refuerzosTildados = jugadores
      .filter(j => seleccion[String(j.id)] && !mismaCategoria(j))
      .map(j => [String(j.id), true]);

    setSeleccion(Object.fromEntries([
      ...[...evaluacion.sugeridos].map(id => [id, true]),
      ...refuerzosTildados,
    ]));
    setMensajeManual(null);

    const extra = refuerzosTildados.length > 0
      ? ` (se mantienen ${refuerzosTildados.length} de otra categoría)`
      : '';
    showToast(`${evaluacion.sugeridos.size} jugadores sugeridos${extra}. Tildá o destildá lo que quieras.`, 'success');
  };

  const limpiar = () => { setSeleccion({}); setMensajeManual(null); };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoFinal);
      showToast('Mensaje copiado ✅ Pegalo en el grupo.', 'success');
    } catch {
      showToast('El navegador no dejó copiar. Seleccioná el texto del preview a mano.', 'warning');
    }
  };

  /* Exportar = abrir WhatsApp con el mensaje ya escrito y que el técnico elija
     el grupo. No hay envío automático: la API de Meta no soporta grupos. */
  const exportarWhatsApp = () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textoFinal)}`, '_blank');
  };

  /* El Tablón es el único canal que llega solo al teléfono del jugador: la
     novedad se ve en la app, y el cron de push (smart-service) manda el aviso
     en su próxima corrida. WhatsApp, en cambio, siempre necesita que alguien
     apriete enviar. */
  const publicarEnTablon = async () => {
    if (!partido) return;
    if (convocados.length === 0) return showToast('Todavía no tildaste a ningún convocado.', 'warning');
    if (!perfil?.id) return showToast('Error de sesión. Volvé a iniciar sesión.', 'error');

    setPublicando(true);

    // La citación deja de tener sentido al día siguiente del partido.
    const vence = new Date(`${String(partido.fecha).split('T')[0]}T23:59:59`);
    vence.setDate(vence.getDate() + 1);

    const { error } = await supabase.from('novedades').insert([{
      club_id: clubId,
      autor_id: perfil.id,
      publico_objetivo: 'Ambos',
      categorias: partido.categoria ? [partido.categoria] : [],
      mensaje: textoFinal,
      fecha_vencimiento: vence.toISOString(),
    }]);

    if (error) {
      setPublicando(false);
      console.error('INSERT novedades:', error);
      return showToast(error.code === '42501'
        ? 'Sin permiso para publicar en el Tablón. Verificá tu rol.'
        : `No se pudo publicar: ${error.message}`, 'error');
    }

    /* Marcamos el partido como "citación publicada": es lo que mira el cron
       para mandar el push una sola vez. Si la migración todavía no se corrió
       esto falla, pero la novedad ya quedó publicada igual. */
    const citacionActualizada = {
      ...(partido.citacion || {}),
      mensaje: textoFinal,
      indumentaria: form.indumentaria,
      entrada: form.entrada,
      publicada_at: new Date().toISOString(),
    };
    const { error: errorMarca } = await supabase.from('partidos')
      .update({ citacion: citacionActualizada }).eq('id', partido.id);

    setPublicando(false);

    if (errorMarca) {
      return showToast(faltaLaColumna(errorMarca)
        ? 'Publicado en el Tablón ✅ El push automático necesita la migración corrida.'
        : 'Publicado en el Tablón ✅ (no se pudo marcar el partido para el push)', 'warning');
    }

    setPartidos(ps => ps.map(p => p.id === partido.id ? { ...p, citacion: citacionActualizada } : p));
    showToast('Publicado en el Tablón ✅ El push sale en la próxima corrida del cron.', 'success');
  };

  const guardarCitacion = async () => {
    if (!partido) return;
    setGuardando(true);

    // Respetamos los titulares que ya estuvieran marcados desde NUEVO PARTIDO.
    const previos = parsePlantilla(partido);
    const titularDe = Object.fromEntries(previos.map(x => [String(x.id_jugador), !!x.titular]));
    const plantillaNueva = convocados.map(j => ({ id_jugador: j.id, titular: titularDe[String(j.id)] || false }));

    const completo = {
      plantilla: plantillaNueva,
      lugar: form.sede,
      horario: form.horario,
      hora_citacion: form.horaCitacion,
      direccion: form.direccion,
      citacion: {
        mensaje: textoFinal,
        indumentaria: form.indumentaria,
        entrada: form.entrada,
        guardada_at: new Date().toISOString(),
      },
    };

    let { error } = await supabase.from('partidos').update(completo).eq('id', partido.id);

    if (error && faltaLaColumna(error)) {
      // Sin la migración corrida guardamos al menos la convocatoria.
      const { error: error2 } = await supabase.from('partidos')
        .update({ plantilla: plantillaNueva, lugar: form.sede, horario: form.horario })
        .eq('id', partido.id);
      setGuardando(false);
      if (error2) return showToast(`No se pudo guardar: ${error2.message}`, 'error');
      setPartidos(ps => ps.map(p => p.id === partido.id ? { ...p, plantilla: plantillaNueva, lugar: form.sede, horario: form.horario } : p));
      return showToast('Convocatoria guardada. Para guardar también el mensaje y la hora de citación hay que correr la migración 20260911120000.', 'warning');
    }

    setGuardando(false);
    if (error) return showToast(`No se pudo guardar: ${error.message}`, 'error');

    setPartidos(ps => ps.map(p => p.id === partido.id ? { ...p, ...completo } : p));
    showToast('Citación guardada y convocatoria cargada al partido ✅', 'success');

    // La dirección del rival queda recordada para la próxima visita.
    if (partido.rival_id && form.direccion) {
      supabase.from('rivales').update({ sede: form.sede, direccion: form.direccion })
        .eq('id', partido.rival_id).then(({ error: e }) => { if (e) console.warn('No se pudo recordar la cancha del rival:', e.message); });
    }
  };

  const guardarPlantillaClub = async () => {
    const cfg = {
      plantilla,
      indumentaria: form.indumentaria,
      entrada: form.entrada,
      minutos_antes: minutosAntes,
    };
    try { localStorage.setItem(`citacion_cfg_${clubId}`, JSON.stringify(cfg)); } catch { /* modo incógnito */ }

    const { error } = await supabase.from('clubes').update({ citacion_config: cfg }).eq('id', clubId);
    if (error) {
      return showToast(faltaLaColumna(error)
        ? 'Plantilla guardada en este dispositivo. Para compartirla con todo el cuerpo técnico hay que correr la migración.'
        : `Guardada en este dispositivo (la base rechazó: ${error.message})`, 'warning');
    }
    showToast('Plantilla guardada para todo el club ✅', 'success');
  };

  /* ── 7. RENDER ────────────────────────────────────────────────────────── */
  if (cargando) {
    return <div className="bento-card" style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>Cargando…</div>;
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <style>{`
        .cit-jug { transition: border-color .15s, background .15s; }
        .cit-jug:hover { border-color: var(--accent); }
      `}</style>

      <div>
        <h1 style={{ margin: 0, fontSize: esMovil ? '1.4rem' : '1.8rem', fontWeight: 900 }}>📣 CITACIÓN</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Armá la convocatoria del próximo partido y mandá el mensaje al grupo.
        </p>
      </div>

      {partidos.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          No hay partidos pendientes cargados.<br />
          <span style={{ fontSize: '0.8rem' }}>Cargá el fixture desde MIS TORNEOS o creá el partido desde NUEVO PARTIDO.</span>
        </div>
      ) : (
        <>
          {/* ───── PARTIDO ───── */}
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '12px' }}>1 · ¿QUÉ PARTIDO?</div>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
              {partidos.map(p => {
                const f = partesDeFecha(p.fecha);
                const activo = String(p.id) === String(partidoId);
                return (
                  <button key={p.id} onClick={() => { setPartidoId(String(p.id)); setMensajeManual(null); }}
                    style={{
                      flex: '0 0 auto', minWidth: '170px', textAlign: 'left', cursor: 'pointer',
                      padding: '12px', borderRadius: '8px', fontFamily: 'inherit',
                      background: activo ? 'var(--accent)' : 'var(--panel)',
                      color: activo ? '#000' : 'var(--text)',
                      border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 800, opacity: 0.7 }}>{f.dia} {f.corta} · {p.categoria || 'S/C'}</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 900, textTransform: 'uppercase', margin: '4px 0' }}>{p.rival || 'RIVAL'}</div>
                    <div style={{ fontSize: '0.6rem', opacity: 0.7 }}>{p.condicion || 'Local'} · {p.competicion || 'Amistoso'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ───── DATOS ───── */}
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '12px' }}>2 · DATOS DE LA CITACIÓN</div>
            <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(3, 1fr)', gap: '14px' }}>
              <Campo titulo="Sede (nombre de la cancha)">
                <input style={input} value={form.sede} onChange={e => { setForm(f => ({ ...f, sede: e.target.value })); setMensajeManual(null); }} placeholder="Juventud de Tapiales" />
              </Campo>
              <Campo titulo="Hora de inicio">
                <input style={input} value={form.horario} onChange={e => { setForm(f => ({ ...f, horario: e.target.value })); setMensajeManual(null); }} placeholder="20:30" />
              </Campo>
              <Campo titulo="Hora de citación">
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input style={input} value={form.horaCitacion} onChange={e => { setForm(f => ({ ...f, horaCitacion: e.target.value })); setMensajeManual(null); }} placeholder="19:00" />
                  <button onClick={() => { setForm(f => ({ ...f, horaCitacion: restarMinutos(f.horario, minutosAntes) })); setMensajeManual(null); }}
                    title={`Poner ${minutosAntes} minutos antes del inicio`}
                    style={{ ...input, width: 'auto', whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: 800, color: 'var(--accent)' }}>
                    −{minutosAntes}′
                  </button>
                </div>
              </Campo>
              <div style={{ gridColumn: esMovil ? 'auto' : 'span 2' }}>
                <Campo titulo="Dirección">
                  <input style={input} value={form.direccion} onChange={e => { setForm(f => ({ ...f, direccion: e.target.value })); setMensajeManual(null); }} placeholder="Curapaligüe 1260, Tapiales" />
                </Campo>
              </div>
              <Campo titulo="Entrada">
                <input style={input} value={form.entrada} onChange={e => { setForm(f => ({ ...f, entrada: e.target.value })); setMensajeManual(null); }} placeholder="$8000." />
              </Campo>
              <div style={{ gridColumn: esMovil ? 'auto' : 'span 3' }}>
                <Campo titulo="Indumentaria">
                  <textarea style={{ ...input, minHeight: '90px', resize: 'vertical' }} value={form.indumentaria}
                    onChange={e => { setForm(f => ({ ...f, indumentaria: e.target.value })); setMensajeManual(null); }} />
                </Campo>
              </div>
            </div>
          </div>

          {/* ───── CONVOCATORIA ───── */}
          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div className="stat-label" style={{ margin: 0 }}>3 · CONVOCATORIA</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={aplicarSugerencia} className="btn-action" style={{ fontSize: '0.72rem', padding: '8px 14px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>
                  ✨ SUGERIR {calculandoRatings && '…'}
                </button>
                <button onClick={limpiar} style={{ fontSize: '0.72rem', padding: '8px 14px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                  LIMPIAR
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '0.7rem', fontWeight: 800 }}>
              <span style={{ color: excedido ? '#ef4444' : 'var(--accent)' }}>
                {convocados.length}/{limite} CONVOCADOS {excedido && '· TE PASASTE DEL LÍMITE'}
              </span>
              <span style={{ color: arquerosCitados === 0 ? '#fbbf24' : 'var(--text-dim)' }}>
                {arquerosCitados} ARQUERO{arquerosCitados === 1 ? '' : 'S'} {arquerosCitados === 0 && '· ¡FALTA ARQUERO!'}
              </span>
              {refuerzos > 0 && (
                <span style={{ color: '#3b82f6' }}>
                  {refuerzos} DE OTRA CATEGORÍA
                </span>
              )}
              {calculandoRatings && <span style={{ color: 'var(--text-dim)' }}>CALCULANDO RENDIMIENTOS…</span>}
            </div>

            {otrasCategorias.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', padding: '10px 12px', background: 'var(--panel)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Sumar de otra categoría:
                </span>
                {partido?.categoria && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '5px 10px', borderRadius: '999px', background: 'var(--accent)', color: '#000' }}>
                    {String(partido.categoria).toUpperCase()}
                  </span>
                )}
                {otrasCategorias.map(cat => {
                  const activa = categoriasExtra.includes(cat);
                  return (
                    <button key={cat}
                      onClick={() => setCategoriasExtra(cs => activa ? cs.filter(c => c !== cat) : [...cs, cat])}
                      style={{
                        fontSize: '0.65rem', fontWeight: 800, padding: '5px 10px', borderRadius: '999px', cursor: 'pointer',
                        background: activa ? '#3b82f6' : 'transparent',
                        color: activa ? '#fff' : 'var(--text-dim)',
                        border: `1px solid ${activa ? '#3b82f6' : 'var(--border)'}`,
                      }}>
                      {activa ? '✓ ' : '+ '}{cat.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(2, 1fr)', gap: '8px' }}>
              {evaluacion.evaluados.map(ev => {
                const tildado = !!seleccion[ev.id];
                return (
                  <div key={ev.id} className="cit-jug" onClick={() => { toggle(ev.id); setMensajeManual(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      borderRadius: '8px', cursor: 'pointer',
                      background: tildado ? 'var(--panel)' : 'transparent',
                      border: `1px solid ${tildado ? 'var(--accent)' : 'var(--border)'}`,
                      opacity: ev.bloqueo && !tildado ? 0.5 : 1,
                    }}>
                    <input type="checkbox" checked={tildado} readOnly style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', flexShrink: 0, pointerEvents: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.esArquero && '🥅 '}
                        {ev.jugador.apellido}, {ev.jugador.nombre}
                        <span style={{ color: 'var(--text-dim)', fontWeight: 600, marginLeft: '6px', fontFamily: 'monospace', fontSize: '0.7rem' }}>#{ev.jugador.dorsal}</span>
                        {/* El refuerzo de otra categoría se marca, para que no
                            se cuele en la lista sin que el técnico lo note. */}
                        {!mismaCategoria(ev.jugador) && (
                          <span style={{ marginLeft: '7px', fontSize: '0.55rem', fontWeight: 900, padding: '2px 6px', borderRadius: '4px', background: '#3b82f6', color: '#fff', verticalAlign: 'middle' }}>
                            {String(ev.jugador.categoria || '').toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.motivos.join(' · ')}
                      </div>
                      {ev.bloqueo && <div style={{ fontSize: '0.62rem', color: '#ef4444', fontWeight: 800, marginTop: '3px' }}>⛔ {ev.bloqueo}</div>}
                      {ev.aviso && !ev.bloqueo && <div style={{ fontSize: '0.62rem', color: '#fbbf24', fontWeight: 800, marginTop: '3px' }}>⚠️ {ev.aviso}</div>}
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1rem', color: ev.score >= 70 ? 'var(--accent)' : ev.score >= 50 ? 'var(--text)' : 'var(--text-dim)' }}>{ev.score}</div>
                      <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>SCORE</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ───── MENSAJE ───── */}
          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div className="stat-label" style={{ margin: 0 }}>4 · EL MENSAJE</div>
              <button onClick={() => setVerPlantilla(v => !v)} style={{ fontSize: '0.68rem', fontWeight: 800, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}>
                {verPlantilla ? 'OCULTAR PLANTILLA' : '✏️ EDITAR PLANTILLA'}
              </button>
            </div>

            {verPlantilla && (
              <div style={{ marginBottom: '16px' }}>
                <textarea style={{ ...input, minHeight: '260px', fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical' }}
                  value={plantilla} onChange={e => { setPlantilla(e.target.value); setMensajeManual(null); }} />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '10px 0' }}>
                  {PLACEHOLDERS.map(([clave, ayuda]) => (
                    <button key={clave} title={ayuda}
                      onClick={() => { setPlantilla(p => p + clave); setMensajeManual(null); }}
                      style={{ fontSize: '0.6rem', fontFamily: 'monospace', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--accent)', borderRadius: '4px', padding: '4px 7px', cursor: 'pointer' }}>
                      {clave}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={guardarPlantillaClub} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 14px', cursor: 'pointer' }}>
                    💾 GUARDAR COMO PLANTILLA DEL CLUB
                  </button>
                  <button onClick={() => { setPlantilla(PLANTILLA_DEFAULT); setMensajeManual(null); }}
                    style={{ fontSize: '0.7rem', padding: '8px 14px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '6px' }}>
                    RESTAURAR
                  </button>
                </div>
              </div>
            )}

            <span style={label}>
              Vista previa {mensajeManual !== null && '· editado a mano'}
            </span>
            <textarea
              value={textoFinal}
              onChange={e => setMensajeManual(e.target.value)}
              style={{ ...input, minHeight: '380px', fontFamily: 'inherit', fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', resize: 'vertical' }}
            />
            {mensajeManual !== null && (
              <button onClick={() => setMensajeManual(null)}
                style={{ marginTop: '8px', fontSize: '0.65rem', background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 800 }}>
                ↺ Volver al mensaje automático
              </button>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(2, 1fr)', gap: '10px', marginTop: '16px' }}>
              <button onClick={copiar} className="btn-action" style={{ padding: '14px', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer' }}>
                📋 COPIAR MENSAJE
              </button>
              <button onClick={exportarWhatsApp}
                style={{ padding: '14px', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', background: '#25D366', color: '#fff', border: 'none' }}>
                📤 EXPORTAR PARA WHATSAPP
              </button>
              <button onClick={publicarEnTablon} disabled={publicando}
                style={{ padding: '14px', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', cursor: publicando ? 'wait' : 'pointer', background: '#3b82f6', color: '#fff', border: 'none' }}>
                {publicando ? 'PUBLICANDO…' : '📌 PUBLICAR EN EL TABLÓN'}
              </button>
              <button onClick={guardarCitacion} disabled={guardando} className="btn-secondary" style={{ padding: '14px', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', cursor: guardando ? 'wait' : 'pointer' }}>
                {guardando ? 'GUARDANDO…' : '💾 GUARDAR CONVOCATORIA'}
              </button>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.65rem', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
              <strong>Exportar</strong> abre WhatsApp con el mensaje escrito y vos elegís el grupo ·
              <strong> Tablón</strong> lo publica dentro de la app y dispara el push ·
              <strong> Guardar</strong> deja los convocados precargados en NUEVO PARTIDO
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Citacion;
