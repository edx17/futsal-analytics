import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import InfoBox from '../components/InfoBox';
import { TablaResponsive } from '../components/TablaResponsive';

function Torneos() {
  const clubId = localStorage.getItem('club_id');
  // miClubGlobal se resuelve más abajo (useMemo self-healing), una vez cargado el fixture.
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { perfil } = useAuth();

  const misCategorias = perfil?.categorias_asignadas || [];
  const categoriaInicial = misCategorias.length > 0 ? misCategorias[0] : 'Primera';

  const [torneos, setTorneos] = useState([]);
  const [rivales, setRivales] = useState([]);
  
  const [filtroCategoria, setFiltroCategoria] = useState(categoriaInicial);
  const [torneoActivo, setTorneoActivo] = useState(null);
  const [fixture, setFixture] = useState([]);
  
  // SOLAPAS AMPLIADAS
  const [tabMisTorneos, setTabMisTorneos] = useState('posiciones'); // 'posiciones' | 'fixture' | 'reporte'
  
  // SELECTOR DE MODO DE TABLA
  const [modoTabla, setModoTabla] = useState('general'); // 'general' | 'local' | 'visitante'

  // FILTROS DE FIXTURE
  const [filtroJornada, setFiltroJornada] = useState('');
  const [filtroEquipo, setFiltroEquipo] = useState('');

  const [mostrarModalTorneo, setMostrarModalTorneo] = useState(false);
  const [mostrarModalFixture, setMostrarModalFixture] = useState(false);
  
  const [formTorneo, setFormTorneo] = useState({ nombre: '', categoria: categoriaInicial, tipo: 'Oficial' });
  
  const [formFixture, setFormFixture] = useState({
    tipo_partido: 'propio',
    jornada: '', 
    fecha_partido: '', 
    rival_id: '', condicion: 'Local', estado: 'Pendiente', goles_propios: 0, goles_rival: 0,
    partidos_multiples: [{ local_id: '', visitante_id: '', estado: 'Pendiente', goles_local: '', goles_visitante: '' }]
  });

  // 🏷️ NOMBRE DEL CLUB PROPIO — RESOLUCIÓN ROBUSTA (self-healing)
  // El CT no tiene 'mi_club' en localStorage (solo lo setea Visión Global del superusuario),
  // así que antes caía en 'TU CLUB', ningún partido matcheaba y el header/stats quedaban en cero.
  // Prioridad: el nombre real ya guardado en los partidos propios del fixture (fuente de verdad,
  // es exactamente contra lo que se comparan los partidos) -> sesión -> perfil -> fallback.
  // Así funciona idéntico para superusuario y CT, sin depender de que el string coincida entre orígenes.
  const miClubGlobal = useMemo(() => {
    const propio = fixture.find(f => f && f.condicion !== 'Neutral' && f.nombre_propio);
    return (
      propio?.nombre_propio ||
      localStorage.getItem('mi_club') ||
      perfil?.clubes?.nombre ||
      'TU CLUB'
    );
  }, [fixture, perfil]);

  useEffect(() => {
    if (clubId) {
      fetchTorneos();
      fetchRivales();
    }
  }, [clubId]);

  const fetchTorneos = async () => {
    let query = supabase.from('torneos').select('*').eq('club_id', clubId).order('id', { ascending: false });
    
    if (misCategorias.length > 0) {
      query = query.in('categoria', misCategorias);
    }

    const { data } = await query;
    if (data) {
      setTorneos(data);
      if (data.length > 0 && !torneoActivo) {
        setFiltroCategoria(data[0].categoria);
      }
    }
  };

  const fetchRivales = async () => {
    const { data } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
    if (data) setRivales(data);
  };

  const categoriasUnicas = useMemo(() => {
    const categoriasPorDefecto = ['Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava'];
    let base = Array.from(new Set([...categoriasPorDefecto, ...torneos.map(t => t.categoria)]));
    
    if (misCategorias.length > 0) {
      base = base.filter(c => misCategorias.includes(c));
    }
    return base;
  }, [torneos, misCategorias]);

  const torneosFiltrados = useMemo(() => {
    return torneos.filter(t => t.categoria === filtroCategoria);
  }, [torneos, filtroCategoria]);

  useEffect(() => {
    if (torneosFiltrados.length > 0) {
      if (!torneoActivo || !torneosFiltrados.some(t => t.id === torneoActivo.id)) {
        setTorneoActivo(torneosFiltrados[0]);
      }
    } else {
      setTorneoActivo(null);
      setFixture([]);
    }
  }, [torneosFiltrados]);

  const fetchFixture = async (idTorneo, categoriaTorneo) => {
    const { data: partidosData } = await supabase
      .from('partidos')
      .select('*, rivales(nombre, escudo)')
      .eq('torneo_id', idTorneo)
      .eq('categoria', categoriaTorneo);
      // Quitamos el order de SQL para usar Natural Sort en JavaScript
      
    if (!partidosData || partidosData.length === 0) {
      setFixture([]);
      return;
    }

    // ORDENAMIENTO NATURAL DE JORNADAS (1, 2, 3... 10, 11)
    partidosData.sort((a, b) => {
      const jA = a.jornada || '';
      const jB = b.jornada || '';
      return jA.localeCompare(jB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const partidosConStatus = await Promise.all(partidosData.map(async (p) => {
      const { count } = await supabase
        .from('eventos')
        .select('id', { count: 'exact', head: true })
        .eq('id_partido', p.id);

      return {
        ...p,
        esTrackeado: count > 0 
      };
    }));

    setFixture(partidosConStatus);
  };

  useEffect(() => {
    if (torneoActivo) fetchFixture(torneoActivo.id, torneoActivo.categoria);
  }, [torneoActivo]);

  const handleGuardarTorneo = async () => {
    if (!formTorneo.nombre) return showToast("El nombre del torneo es obligatorio", "warning");
    const { error } = await supabase.from('torneos').insert([{ ...formTorneo, club_id: clubId }]);
    if (!error) {
      setMostrarModalTorneo(false);
      setFiltroCategoria(formTorneo.categoria); 
      setFormTorneo({ nombre: '', categoria: categoriaInicial, tipo: 'Oficial' });
      fetchTorneos();
      showToast("¡Torneo guardado con éxito!", "success");
    } else showToast("Error al guardar: " + error.message, "error");
  };

  const agregarPartidoMultiple = () => {
    setFormFixture({
      ...formFixture,
      partidos_multiples: [...formFixture.partidos_multiples, { local_id: '', visitante_id: '', estado: 'Pendiente', goles_local: '', goles_visitante: '' }]
    });
  };

  const removerPartidoMultiple = (index) => {
    const nuevos = formFixture.partidos_multiples.filter((_, i) => i !== index);
    setFormFixture({ ...formFixture, partidos_multiples: nuevos });
  };

  const actualizarPartidoMultiple = (index, campo, valor) => {
    const nuevos = [...formFixture.partidos_multiples];
    nuevos[index][campo] = valor;
    if (campo === 'estado' && valor === 'Pendiente') {
      nuevos[index].goles_local = '';
      nuevos[index].goles_visitante = '';
    }
    setFormFixture({ ...formFixture, partidos_multiples: nuevos });
  };

  const handleGuardarFixture = async () => {
    const miEscudoGlobal = localStorage.getItem('escudo_url') || null;

    if (formFixture.tipo_partido === 'propio') {
      if (!formFixture.jornada) return showToast("La Jornada es obligatoria", "warning");
      if (!formFixture.rival_id) return showToast("Rival obligatorio", "warning");
      const rivalSeleccionado = rivales.find(r => r.id === formFixture.rival_id);
      
      const nuevoPartido = {
        club_id: clubId,
        torneo_id: torneoActivo.id,
        rival_id: formFixture.rival_id,
        rival: rivalSeleccionado ? rivalSeleccionado.nombre : '',
        escudo_rival: rivalSeleccionado ? rivalSeleccionado.escudo : null,
        nombre_propio: miClubGlobal,
        escudo_propio: miEscudoGlobal,
        jornada: formFixture.jornada,
        fecha: formFixture.fecha_partido, 
        condicion: formFixture.condicion,
        estado: formFixture.estado,
        goles_propios: formFixture.goles_propios,
        goles_rival: formFixture.goles_rival,
        categoria: torneoActivo.categoria, 
        competicion: torneoActivo.nombre 
      };

      const { error } = await supabase.from('partidos').insert([nuevoPartido]);
      if (!error) {
        cerrarModalYRefrescar();
        showToast("¡Fecha agregada al fixture!", "success");
      } else showToast("Error al agregar: " + error.message, "error");

    } else {
      if (!formFixture.jornada) return showToast("La Jornada es obligatoria para el bloque", "warning");
      
      const crucesValidos = formFixture.partidos_multiples.filter(p => p.local_id && p.visitante_id);
      
      if (crucesValidos.length === 0) return showToast("Debes configurar al menos un cruce válido", "warning");
      if (crucesValidos.some(p => p.local_id === p.visitante_id)) return showToast("Un equipo no puede jugar contra sí mismo", "warning");

      const arrayPartidosAInsertar = crucesValidos.map(p => {
        const eqLocal = rivales.find(r => r.id === p.local_id);
        const eqVisita = rivales.find(r => r.id === p.visitante_id);

        return {
          club_id: clubId,
          torneo_id: torneoActivo.id,
          rival_id: eqVisita.id, 
          rival: eqVisita.nombre,
          escudo_rival: eqVisita.escudo,
          nombre_propio: eqLocal.nombre, 
          escudo_propio: eqLocal.escudo,
          jornada: formFixture.jornada,
          fecha: formFixture.fecha_partido, 
          condicion: 'Neutral', // Por defecto los múltiples son neutrales o asumen que el 1ro es local
          estado: p.estado,
          goles_propios: p.estado === 'Finalizado' ? (Number(p.goles_local) || 0) : 0,
          goles_rival: p.estado === 'Finalizado' ? (Number(p.goles_visitante) || 0) : 0,
          categoria: torneoActivo.categoria, 
          competicion: torneoActivo.nombre 
        };
      });

      const { error } = await supabase.from('partidos').insert(arrayPartidosAInsertar); 
      
      if (!error) {
        cerrarModalYRefrescar();
        showToast(`¡Se agregaron ${arrayPartidosAInsertar.length} partidos al fixture!`, "success");
      } else showToast("Error al agregar cruces: " + error.message, "error");
    }
  };

  const cerrarModalYRefrescar = () => {
    setMostrarModalFixture(false);
    fetchFixture(torneoActivo.id, torneoActivo.categoria);
    setFormFixture({
      tipo_partido: 'propio', jornada: '', fecha_partido: '', rival_id: '', condicion: 'Local', estado: 'Pendiente', goles_propios: 0, goles_rival: 0,
      partidos_multiples: [{ local_id: '', visitante_id: '', estado: 'Pendiente', goles_local: '', goles_visitante: '' }]
    });
  };

  const actualizarResultado = async (id, goles_propios, goles_rival, estado) => {
    await supabase.from('partidos').update({ goles_propios, goles_rival, estado }).eq('id', id);
    fetchFixture(torneoActivo.id, torneoActivo.categoria);
    if(estado === 'Finalizado') showToast("Resultado actualizado", "success");
  };

  // ── COPA: definición por penales ──
  const actualizarPenales = async (id, penales_propios, penales_rival) => {
    const pp = (penales_propios === '' || penales_propios == null) ? null : Number(penales_propios);
    const pr = (penales_rival === '' || penales_rival == null) ? null : Number(penales_rival);
    const { error } = await supabase.from('partidos').update({ penales_propios: pp, penales_rival: pr }).eq('id', id);
    if (error) { showToast('No se pudieron guardar los penales: ' + error.message, 'error'); return; }
    fetchFixture(torneoActivo.id, torneoActivo.categoria);
    showToast('Penales guardados', 'success');
  };

  const esCopa = torneoActivo?.tipo === 'Copa';
  const ORDEN_RONDAS = ['64avos','32avos','treintaidosavos','16avos','dieciseisavos','octavos','cuartos','semi','final','definici'];
  const rondasLlave = useMemo(() => {
    const map = new Map();
    (fixture || []).forEach(p => { const j = p.jornada || 'Sin ronda'; if (!map.has(j)) map.set(j, []); map.get(j).push(p); });
    const idx = (name) => { const n = String(name).toLowerCase().trim(); const i = ORDEN_RONDAS.findIndex(o => n.includes(o)); return i === -1 ? 500 : i; };
    return [...map.entries()]
      .sort((a, b) => idx(a[0]) - idx(b[0]) || String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
      .map(([ronda, cruces]) => ({ ronda, cruces }));
  }, [fixture]);

  const eliminarPartido = async (idPartido) => {
    const { count, error: errorEventos } = await supabase
      .from('eventos')
      .select('*', { count: 'exact', head: true })
      .eq('id_partido', idPartido);

    if (errorEventos) return showToast("Error al verificar datos: " + errorEventos.message, "error");

    if (count > 0) {
      return showToast(`BLOQUEO: Este partido tiene ${count} acciones. No podés borrarlo desde acá.`, "error");
    }

    if (window.confirm("✅ Este partido está completamente vacío. ¿Estás seguro de que querés eliminarlo?")) {
      const { error } = await supabase.from('partidos').delete().eq('id', idPartido);
      if (!error) {
        fetchFixture(torneoActivo.id, torneoActivo.categoria);
        showToast("Partido eliminado", "info");
      } else {
        showToast("Error al eliminar: " + error.message, "error");
      }
    }
  };

  const irATrackear = (partido) => navigate('/toma-datos', { state: { partido } });

  // 1. MOTOR ANALÍTICO DE TU EQUIPO
  const { stats, local, visitante, racha, vallasInvictas, chartDataEvolucion, chartDataLocalia, ptsTotales, eficacia } = useMemo(() => {
    const partidosMios = fixture.filter(f => (f.nombre_propio === miClubGlobal || !f.nombre_propio) && (f.estado === 'Finalizado' || f.estado === 'Jugado')).sort((a,b) => {
      if(a.fecha && b.fecha) return new Date(a.fecha) - new Date(b.fecha);
      return a.id - b.id;
    });

    const s = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 };
    const l = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 };
    const v = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 };
    let rList = [];
    let vIn = 0;
    let chartEvol = [];

    partidosMios.forEach((f, index) => {
        s.pj++;
        const gp = Number(f.goles_propios) || 0;
        const gr = Number(f.goles_rival) || 0;
        s.gf += gp;
        s.gc += gr;
        
        let res = 'E';
        if (gp > gr) { s.pg++; res = 'V'; }
        else if (gp < gr) { s.pp++; res = 'D'; }
        else { s.pe++; }
        
        rList.push(res);
        if (gr === 0) vIn++;

        if (f.condicion === 'Local') {
            l.pj++; l.gf += gp; l.gc += gr;
            if (res === 'V') { l.pg++; l.pts+=3; }
            if (res === 'E') { l.pe++; l.pts+=1; }
            if (res === 'D') { l.pp++; }
        } else if (f.condicion === 'Visitante') {
            v.pj++; v.gf += gp; v.gc += gr;
            if (res === 'V') { v.pg++; v.pts+=3; }
            if (res === 'E') { v.pe++; v.pts+=1; }
            if (res === 'D') { v.pp++; }
        }

        chartEvol.push({
            name: f.jornada || `F${index+1}`,
            GF: gp,
            GC: gr,
            DIF: gp - gr
        });
    });

    const efi = s.pj > 0 ? (((s.pg * 3 + s.pe) / (s.pj * 3)) * 100).toFixed(1) : 0;
    const ptsTot = (s.pg * 3) + (s.pe * 1);

    const cLocalia = [
        { name: 'Local', Eficacia: l.pj > 0 ? Number(((l.pts / (l.pj * 3)) * 100).toFixed(0)) : 0, GF: l.gf, GC: l.gc },
        { name: 'Visitante', Eficacia: v.pj > 0 ? Number(((v.pts / (v.pj * 3)) * 100).toFixed(0)) : 0, GF: v.gf, GC: v.gc }
    ];

    return { stats: s, local: l, visitante: v, racha: rList, vallasInvictas: vIn, chartDataEvolucion: chartEvol, chartDataLocalia: cLocalia, ptsTotales: ptsTot, eficacia: efi };
  }, [fixture, miClubGlobal]);

  // 2. MOTOR TABLA DE POSICIONES DINÁMICA PREMIUM (General, Local, Visitante)
  const tablaPosiciones = useMemo(() => {
    const tabla = {};

    fixture.forEach(f => {
      const esMiPartido = (!f.nombre_propio || f.nombre_propio === miClubGlobal) || (f.rival === miClubGlobal);
      
      let equipoLocal = '';
      let equipoVisita = '';
      let escudoLocal = null;
      let escudoVisita = null;

      // Determinación estricta de local y visitante para separar las tablas
      if (esMiPartido) {
        if (f.condicion === 'Visitante') {
           equipoLocal = f.rival || 'Rival Desconocido';
           equipoVisita = miClubGlobal;
           escudoLocal = f.escudo_rival;
           escudoVisita = f.escudo_propio;
        } else {
           equipoLocal = miClubGlobal;
           equipoVisita = f.rival || 'Rival Desconocido';
           escudoLocal = f.escudo_propio;
           escudoVisita = f.escudo_rival;
        }
      } else {
        equipoLocal = f.nombre_propio || miClubGlobal;
        equipoVisita = f.rival || 'Rival Desconocido';
        escudoLocal = f.escudo_propio;
        escudoVisita = f.escudo_rival;
      }

      // Estructura base ampliada
      [equipoLocal, equipoVisita].forEach((eq, index) => {
        if (!tabla[eq]) {
          tabla[eq] = { 
            nombre: eq, escudo: index === 0 ? escudoLocal : escudoVisita, 
            pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0, rachaGeneral: [],
            pjL: 0, pgL: 0, peL: 0, ppL: 0, gfL: 0, gcL: 0, ptsL: 0, rachaLocal: [],
            pjV: 0, pgV: 0, peV: 0, ppV: 0, gfV: 0, gcV: 0, ptsV: 0, rachaVisita: []
          };
        }
      });

      if (f.estado === 'Finalizado' || f.estado === 'Jugado') {
        let golesLocal = 0; let golesVisita = 0;
        if (esMiPartido && f.condicion === 'Visitante') {
           golesLocal = Number(f.goles_rival) || 0;
           golesVisita = Number(f.goles_propios) || 0;
        } else {
           golesLocal = Number(f.goles_propios) || 0;
           golesVisita = Number(f.goles_rival) || 0;
        }

        const tLocal = tabla[equipoLocal];
        const tVisita = tabla[equipoVisita];

        // Sumar General
        tLocal.pj++; tVisita.pj++;
        tLocal.gf += golesLocal; tVisita.gf += golesVisita;
        tLocal.gc += golesVisita; tVisita.gc += golesLocal;

        // Sumar Local/Visitante
        tLocal.pjL++; tLocal.gfL += golesLocal; tLocal.gcL += golesVisita;
        tVisita.pjV++; tVisita.gfV += golesVisita; tVisita.gcV += golesLocal;

        if (golesLocal > golesVisita) {
          tLocal.pg++; tLocal.pts += 3; tLocal.pgL++; tLocal.ptsL += 3; tLocal.rachaGeneral.push('V'); tLocal.rachaLocal.push('V');
          tVisita.pp++; tVisita.ppV++; tVisita.rachaGeneral.push('D'); tVisita.rachaVisita.push('D');
        } else if (golesLocal < golesVisita) {
          tVisita.pg++; tVisita.pts += 3; tVisita.pgV++; tVisita.ptsV += 3; tVisita.rachaGeneral.push('V'); tVisita.rachaVisita.push('V');
          tLocal.pp++; tLocal.ppL++; tLocal.rachaGeneral.push('D'); tLocal.rachaLocal.push('D');
        } else {
          tLocal.pe++; tLocal.pts += 1; tLocal.peL++; tLocal.ptsL += 1; tLocal.rachaGeneral.push('E'); tLocal.rachaLocal.push('E');
          tVisita.pe++; tVisita.pts += 1; tVisita.peV++; tVisita.ptsV += 1; tVisita.rachaGeneral.push('E'); tVisita.rachaVisita.push('E');
        }
      }
    });

    return Object.values(tabla).map(t => {
      // Calculamos las diferencias según el modo
      t.difGeneral = t.gf - t.gc;
      t.difLocal = t.gfL - t.gcL;
      t.difVisita = t.gfV - t.gcV;
      return t;
    }).sort((a, b) => {
      // Ordenamiento Dinámico
      if (modoTabla === 'local') {
        if (b.ptsL !== a.ptsL) return b.ptsL - a.ptsL;
        if (b.difLocal !== a.difLocal) return b.difLocal - a.difLocal;
        return b.gfL - a.gfL;
      } else if (modoTabla === 'visitante') {
        if (b.ptsV !== a.ptsV) return b.ptsV - a.ptsV;
        if (b.difVisita !== a.difVisita) return b.difVisita - a.difVisita;
        return b.gfV - a.gfV;
      } else {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.difGeneral !== a.difGeneral) return b.difGeneral - a.difGeneral;
        return b.gf - a.gf;
      }
    });
  }, [fixture, miClubGlobal, modoTabla]);

  // 3. MOTOR NUEVO: REPORTE DE LA LIGA COMPLETA PREMIUM
  const reporteLiga = useMemo(() => {
    if (!fixture || fixture.length === 0) return null;
    
    let mayorGoleada = { dif: -1, text: '', equipoLocal: '', equipoVisita: '' };
    let partidosJugadosTotales = 0;
    let golesTotalesLiga = 0;
    let partidosOver3 = 0;
    let partidosOver5 = 0;

    fixture.filter(f => f.estado === 'Finalizado' || f.estado === 'Jugado').forEach(f => {
      const esMiPartido = (!f.nombre_propio || f.nombre_propio === miClubGlobal) || (f.rival === miClubGlobal);
      
      let equipoLocal = ''; let equipoVisita = '';
      let golesLocal = 0; let golesVisita = 0;

      if (esMiPartido) {
        if (f.condicion === 'Visitante') {
           equipoLocal = f.rival || 'Rival Desconocido'; equipoVisita = miClubGlobal;
           golesLocal = Number(f.goles_rival) || 0; golesVisita = Number(f.goles_propios) || 0;
        } else {
           equipoLocal = miClubGlobal; equipoVisita = f.rival || 'Rival Desconocido';
           golesLocal = Number(f.goles_propios) || 0; golesVisita = Number(f.goles_rival) || 0;
        }
      } else {
        equipoLocal = f.nombre_propio || miClubGlobal; equipoVisita = f.rival || 'Rival Desconocido';
        golesLocal = Number(f.goles_propios) || 0; golesVisita = Number(f.goles_rival) || 0;
      }

      // Analítica de Goles (Over/Under)
      partidosJugadosTotales++;
      const golesPartido = golesLocal + golesVisita;
      golesTotalesLiga += golesPartido;
      if (golesPartido > 3) partidosOver3++;
      if (golesPartido > 5) partidosOver5++;

      // Cálculo de Mayor Goleada conservando el formato estricto (Local X - Y Visita)
      const difGoles = Math.abs(golesLocal - golesVisita);
      if (difGoles > mayorGoleada.dif) {
        mayorGoleada = { dif: difGoles, text: `${equipoLocal} ${golesLocal} - ${golesVisita} ${equipoVisita}` };
      }
    });

    if (partidosJugadosTotales === 0) return null;

    // Tomamos la data ya procesada de tablaPosiciones (en modo general) para sacar rankings
    const rankings = [...tablaPosiciones].sort((a, b) => b.pts - a.pts);
    const masGoleador = [...rankings].sort((a,b) => b.gf - a.gf)[0];
    const mejorDefensa = [...rankings].filter(t => t.pj > 0).sort((a,b) => a.gc - b.gc)[0]; // Menos goles recibidos
    const mejorLocal = [...rankings].sort((a,b) => b.ptsL - a.ptsL)[0];
    const mejorVisita = [...rankings].sort((a,b) => b.ptsV - a.ptsV)[0];

    // Power Ranking (Indice de Dominio)
    // Formula Inventada: (Pts% * 50) + (DifGoles * 2) + (GF/PJ * 10) - (GC/PJ * 10)
    const powerRankingData = rankings.filter(t => t.pj > 0).map(t => {
      const pctPuntos = (t.pts / (t.pj * 3)) * 100;
      const gfProm = t.gf / t.pj;
      const gcProm = t.gc / t.pj;
      const dominioRaw = (pctPuntos * 0.5) + (t.difGeneral * 1.5) + (gfProm * 5) - (gcProm * 5);
      
      // Forma reciente (Ultimos 5)
      const ults5 = t.rachaGeneral.slice(-5);
      let ptsForma = 0;
      ults5.forEach(r => { if(r==='V') ptsForma+=3; if(r==='E') ptsForma+=1; });

      return {
         ...t,
         pctPuntos: pctPuntos.toFixed(1),
         gfPromedio: gfProm.toFixed(2),
         gcPromedio: gcProm.toFixed(2),
         ptsForma,
         dominioRaw
      };
    }).sort((a,b) => b.dominioRaw - a.dominioRaw);

    const equipoEnForma = [...powerRankingData].sort((a,b) => b.ptsForma - a.ptsForma)[0];

    return { 
      mayorGoleada, 
      masGoleador, 
      mejorDefensa, 
      mejorLocal, 
      mejorVisita, 
      equipoEnForma,
      powerRanking: powerRankingData,
      promedioGolLiga: (golesTotalesLiga / partidosJugadosTotales).toFixed(2),
      pctOver3: ((partidosOver3 / partidosJugadosTotales) * 100).toFixed(1),
      pctOver5: ((partidosOver5 / partidosJugadosTotales) * 100).toFixed(1)
    };
  }, [fixture, miClubGlobal, tablaPosiciones]);

  // 4. PRÓXIMO RIVAL: scouting rápido del próximo pendiente (su fila en la tabla)
  const proximoRival = useMemo(() => {
    if (!fixture || fixture.length === 0) return null;
    const pendientes = fixture
      .filter(f => {
        const esMiPartido = (!f.nombre_propio || f.nombre_propio === miClubGlobal) || (f.rival === miClubGlobal);
        return esMiPartido && f.estado === 'Pendiente';
      })
      .sort((a, b) => {
        if (a.fecha && b.fecha) return new Date(a.fecha) - new Date(b.fecha);
        if (a.fecha) return -1;
        if (b.fecha) return 1;
        return String(a.jornada || '').localeCompare(String(b.jornada || ''), undefined, { numeric: true });
      });
    const prox = pendientes[0];
    if (!prox) return null;

    const rivalNombre = prox.rival || 'Rival Desconocido';
    const fila = tablaPosiciones.find(t => t.nombre === rivalNombre) || null;

    const general = [...tablaPosiciones].sort((a, b) => (b.pts - a.pts) || (b.difGeneral - a.difGeneral) || (b.gf - a.gf));
    const idxRival = general.findIndex(t => t.nombre === rivalNombre);

    let dias = null;
    if (prox.fecha) {
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const fp = new Date(prox.fecha); fp.setHours(0, 0, 0, 0);
      if (!isNaN(fp.getTime())) dias = Math.ceil((fp - hoy) / 86400000);
    }

    return {
      partido: prox,
      rivalNombre,
      escudo: prox.escudo_rival || fila?.escudo || null,
      condicion: prox.condicion || 'Local',
      fecha: prox.fecha,
      jornada: prox.jornada,
      dias,
      fila,
      posRival: idxRival >= 0 ? idxRival + 1 : null,
      totalEquipos: general.length,
    };
  }, [fixture, miClubGlobal, tablaPosiciones]);

  // 5. PROYECCIÓN DE PUNTOS: run-rate, techo, posición y brecha con el líder
  const proyeccion = useMemo(() => {
    const pendientes = fixture.filter(f => {
      const esMiPartido = (!f.nombre_propio || f.nombre_propio === miClubGlobal) || (f.rival === miClubGlobal);
      return esMiPartido && f.estado === 'Pendiente';
    }).length;

    const pj = stats.pj;
    const ppp = pj > 0 ? (ptsTotales / pj) : 0; // puntos por partido (run-rate)
    const proyFinal = Math.round(ptsTotales + ppp * pendientes);
    const maxPosible = ptsTotales + pendientes * 3;

    const general = [...tablaPosiciones].sort((a, b) => (b.pts - a.pts) || (b.difGeneral - a.difGeneral) || (b.gf - a.gf));
    const idxYo = general.findIndex(t => t.nombre === miClubGlobal);
    const lider = general[0] || null;
    const yo = idxYo >= 0 ? general[idxYo] : null;
    const brechaLider = (lider && yo && lider.nombre !== miClubGlobal) ? (lider.pts - yo.pts) : 0;

    return {
      pj, ptsTotales, pendientes,
      ppp: ppp.toFixed(2),
      proyFinal, maxPosible,
      posicion: idxYo >= 0 ? idxYo + 1 : null,
      totalEquipos: general.length,
      lider, brechaLider,
    };
  }, [fixture, miClubGlobal, tablaPosiciones, stats, ptsTotales]);

  const calcularMejorRacha = (racha) => {
      let max = 0; let actual = 0;
      for (let r of racha) {
          if (r === 'V' || r === 'E') { actual++; if (actual > max) max = actual; }
          else { actual = 0; }
      }
      return max;
  };

  // DATOS PARA FILTROS DEL FIXTURE ORDENADOS
  const jornadasUnicas = useMemo(() => {
    const arr = [...new Set(fixture.map(f => f.jornada))].filter(Boolean);
    return arr.sort((a,b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [fixture]);

  const equiposUnicos = useMemo(() => {
    return [...new Set([
      ...fixture.map(f => f.nombre_propio || miClubGlobal),
      ...fixture.map(f => f.rival || 'Rival Desconocido')
    ])].filter(Boolean).sort();
  }, [fixture, miClubGlobal]);

  const fixtureFiltrado = useMemo(() => {
    return fixture.filter(f => {
      const jMatch = filtroJornada === '' || f.jornada === filtroJornada;
      const eMatch = filtroEquipo === '' || (
        (f.nombre_propio || miClubGlobal) === filtroEquipo || 
        (f.rival || 'Rival Desconocido') === filtroEquipo
      );
      return jMatch && eMatch;
    });
  }, [fixture, filtroJornada, filtroEquipo, miClubGlobal]);


  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club.</div>;

  const valPos = (e, g, l, v) => modoTabla === 'local' ? e[l] : (modoTabla === 'visitante' ? e[v] : e[g]);
  const GRUPOS_POS = { main: 'var(--accent)', wdl: 'var(--text-dim)', goles: '#fff' };
  const GRUPOS_POS_LABEL = { main: 'PUNTOS', wdl: 'G / E / P', goles: 'GOLES' };
  const colsPosiciones = [
    { k: 'pts', t: 'PTS', g: 'main', r: e => valPos(e, 'pts', 'ptsL', 'ptsV') },
    { k: 'pj', t: 'PJ', g: 'main', r: e => valPos(e, 'pj', 'pjL', 'pjV') },
    { k: 'pg', t: 'G', g: 'wdl', r: e => valPos(e, 'pg', 'pgL', 'pgV') },
    { k: 'pe', t: 'E', g: 'wdl', r: e => valPos(e, 'pe', 'peL', 'peV') },
    { k: 'pp', t: 'P', g: 'wdl', r: e => valPos(e, 'pp', 'ppL', 'ppV') },
    { k: 'gf', t: 'GF', g: 'goles', r: e => valPos(e, 'gf', 'gfL', 'gfV') },
    { k: 'gc', t: 'GC', g: 'goles', r: e => valPos(e, 'gc', 'gcL', 'gcV') },
    { k: 'dif', t: 'DIF', g: 'goles', r: e => { const d = valPos(e, 'difGeneral', 'difLocal', 'difVisita'); return d > 0 ? `+${d}` : d; } },
    { k: 'forma', t: 'ÚLT. 5', g: 'main', r: e => { const rc = valPos(e, 'rachaGeneral', 'rachaLocal', 'rachaVisita') || []; return <span style={{ display: 'inline-flex', gap: 3 }}>{rc.slice(-5).map((r, i) => { let col = '#555'; if (r === 'V') col = '#00ff88'; if (r === 'D') col = '#ef4444'; return <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />; })}</span>; } },
  ];

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ fontSize: '2.5rem' }}>🏆</div>
        <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>GESTOR DE COMPETICIÓN</div>
      </div>

      <div className="bento-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end', marginBottom: '30px', background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>CATEGORÍA</div>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectStyle}>
             {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>COMPETICIÓN (TORNEO)</div>
          <select value={torneoActivo?.id || ''} onChange={e => setTorneoActivo(torneos.find(t => t.id == e.target.value))} style={selectStyle}>
             {torneosFiltrados.length === 0 && <option value="">NO HAY TORNEOS REGISTRADOS...</option>}
             {torneosFiltrados.map(t => <option key={t.id} value={t.id}>{t.nombre.toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setMostrarModalTorneo(true)} className="btn-secondary" style={{ padding: '10px 20px', fontSize: '0.8rem', fontWeight: 800 }}>+ NUEVO TORNEO</button>
        </div>
      </div>

      {torneoActivo ? (
        <>
          <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '15px', marginBottom: '20px', textAlign: 'center' }}>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>{ptsTotales}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>PUNTOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{stats.pj}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>JUGADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#00ff88' }}>{stats.pg}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>GANADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fbbf24' }}>{stats.pe}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>EMPATADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>{stats.pp}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>PERDIDOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{stats.gf}:{stats.gc}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>GOLES (DIF {stats.gf - stats.gc})</div></div>
            
            <div style={{ borderLeft: '1px solid #333', paddingLeft: '15px' }}>
               <div style={{ fontSize: '1.5rem', fontWeight: 900, color: eficacia >= 50 ? '#0ea5e9' : '#fff' }}>{eficacia}%</div>
               <div className="stat-label" style={{ fontSize: '0.65rem' }}>EFICACIA</div>
            </div>
            <div>
               <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#a855f7' }}>{vallasInvictas}</div>
               <div className="stat-label" style={{ fontSize: '0.65rem' }}>VALLAS INVICTAS</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', borderTop: '2px solid var(--accent)' }}>
               <div className="stat-label">ESTADO DE FORMA <InfoBox texto="Últimos 5 partidos (de izquierda a derecha)."/></div>
               <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
                  {racha.slice(-5).map((r, i) => {
                     let bg = '#333'; let color = '#fff';
                     if(r === 'V') { bg = 'var(--accent)'; color = '#000'; }
                     else if(r === 'D') { bg = '#ef4444'; color = '#fff'; }
                     return <div key={i} style={{ width: '35px', height: '35px', borderRadius: '4px', background: bg, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.2rem' }}>{r}</div>
                  })}
                  {racha.length === 0 && <span style={{ color: 'var(--text-dim)' }}>Aún sin partidos finalizados</span>}
               </div>
               <div style={{ marginTop: '15px', fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                  Mejor Racha Invicta: <strong>{calcularMejorRacha(racha)} partidos</strong>
               </div>
            </div>

            <div className="bento-card">
               <div className="stat-label" style={{ marginBottom: '15px' }}>EFICACIA DE LOCALÍA <InfoBox texto="Rendimiento de puntos jugando de Local vs Visitante."/></div>
               <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartDataLocalia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                     <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 11, fontWeight: 700 }} />
                     <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} domain={[0, 100]} tickFormatter={val => `${val}%`} />
                     <RechartsTooltip cursor={{ fill: '#222' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                     <Bar dataKey="Eficacia" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={40} name="Eficacia (%)" />
                  </BarChart>
               </ResponsiveContainer>
            </div>

            <div className="bento-card">
               <div className="stat-label" style={{ marginBottom: '15px' }}>EVOLUCIÓN DE GOLES <InfoBox texto="Tendencia de goles anotados (GF) vs recibidos (GC) fecha a fecha."/></div>
               <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartDataEvolucion} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                     <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                     <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                     <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                     <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" />
                     <Line type="monotone" dataKey="GF" stroke="#00ff88" strokeWidth={3} dot={{ r: 4, fill: '#00ff88' }} />
                     <Line type="monotone" dataKey="GC" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444' }} />
                  </LineChart>
               </ResponsiveContainer>
            </div>
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div style={{ display: 'flex', gap: '5px', background: '#0a0a0a', padding: '5px', borderRadius: '8px', border: '1px solid #333' }}>
                  <button 
                    onClick={() => setTabMisTorneos('posiciones')} 
                    className="tab-btn" 
                    style={{ background: tabMisTorneos === 'posiciones' ? '#222' : 'transparent', color: tabMisTorneos === 'posiciones' ? 'var(--accent)' : 'var(--text-dim)', padding: '10px 20px', borderRadius: '4px', fontWeight: 800 }}
                  >
                    {esCopa ? 'LLAVE' : 'POSICIONES'}
                  </button>
                  <button 
                    onClick={() => setTabMisTorneos('fixture')} 
                    className="tab-btn" 
                    style={{ background: tabMisTorneos === 'fixture' ? '#222' : 'transparent', color: tabMisTorneos === 'fixture' ? 'var(--accent)' : 'var(--text-dim)', padding: '10px 20px', borderRadius: '4px', fontWeight: 800 }}
                  >
                    FIXTURE
                  </button>
                  <button 
                    onClick={() => setTabMisTorneos('reporte')} 
                    className="tab-btn" 
                    style={{ background: tabMisTorneos === 'reporte' ? '#222' : 'transparent', color: tabMisTorneos === 'reporte' ? '#a855f7' : 'var(--text-dim)', padding: '10px 20px', borderRadius: '4px', fontWeight: 800 }}
                  >
                    REPORTE
                  </button>
              </div>
              <button onClick={() => setMostrarModalFixture(true)} className="btn-action" style={{ background: 'var(--accent)', color: '#000', fontSize: '0.8rem', padding: '10px 20px', fontWeight: 800 }}>
                + AGREGAR FECHA
              </button>
            </div>

            {/* 🏆 TAB: LLAVE (COPA) */}
            {tabMisTorneos === 'posiciones' && esCopa && (
              <div style={{ animation: 'fadeIn 0.3s' }}>
                <div style={{ marginBottom: '15px' }}>
                  <span className="stat-label" style={{ color: 'var(--accent)' }}>🏆 CUADRO DE LA COPA</span>
                </div>
                {rondasLlave.length === 0 ? (
                  <div className="bento-card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
                    No hay cruces cargados. Agregá fechas desde el FIXTURE usando la Jornada como ronda (Octavos, Cuartos, Semi, Final).
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {rondasLlave.map(({ ronda, cruces }) => (
                      <div key={ronda} className="bento-card">
                        <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: '12px' }}>{String(ronda).toUpperCase()}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                          {cruces.map(cruce => {
                            const gp = Number(cruce.goles_propios) || 0;
                            const gr = Number(cruce.goles_rival) || 0;
                            const fin = cruce.estado === 'Finalizado';
                            const empate = fin && gp === gr;
                            const tienePen = cruce.penales_propios != null && cruce.penales_rival != null;
                            let ganaL = false, ganaV = false;
                            if (fin) {
                              if (gp > gr) ganaL = true;
                              else if (gr > gp) ganaV = true;
                              else if (tienePen) { if (Number(cruce.penales_propios) > Number(cruce.penales_rival)) ganaL = true; else if (Number(cruce.penales_rival) > Number(cruce.penales_propios)) ganaV = true; }
                            }
                            const filaEq = (nombre, escudo, goles, gana) => (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: gana ? 'rgba(0,255,136,0.08)' : 'transparent', borderRadius: '6px' }}>
                                {escudo ? <img src={escudo} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} /> : <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#333' }} />}
                                <span style={{ flex: 1, fontWeight: gana ? 900 : 700, color: gana ? 'var(--accent)' : (nombre === miClubGlobal ? '#fff' : '#ccc'), fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {(nombre || '—').toUpperCase()} {nombre === miClubGlobal && <span style={{ fontSize: '0.55rem', background: 'var(--accent)', color: '#000', padding: '1px 4px', borderRadius: '3px' }}>YO</span>}
                                </span>
                                {gana && <span style={{ color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 900 }}>✓</span>}
                                <span style={{ fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', color: gana ? 'var(--accent)' : '#fff', minWidth: '20px', textAlign: 'center' }}>{fin ? goles : '-'}</span>
                              </div>
                            );
                            return (
                              <div key={cruce.id} style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '10px', padding: '8px' }}>
                                {filaEq(cruce.nombre_propio, cruce.escudo_propio, gp, ganaL)}
                                <div style={{ height: '1px', background: '#1c1c1c', margin: '2px 8px' }} />
                                {filaEq(cruce.rival, cruce.escudo_rival, gr, ganaV)}
                                {empate && (
                                  <div style={{ marginTop: '8px', padding: '8px', background: '#111', borderRadius: '6px', border: '1px dashed #333' }}>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '6px', textAlign: 'center' }}>DEFINICIÓN POR PENALES</div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                      <input type="number" min="0" key={`pp-${cruce.id}-${cruce.penales_propios ?? ''}`} defaultValue={cruce.penales_propios ?? ''} onBlur={(e) => actualizarPenales(cruce.id, e.target.value, cruce.penales_rival ?? '')} style={{ width: '50px', textAlign: 'center', background: '#000', color: 'var(--accent)', border: '1px solid #333', padding: '6px', fontWeight: 900, borderRadius: '4px', fontSize: '1rem' }} />
                                      <span style={{ color: 'var(--text-dim)', fontWeight: 900, fontSize: '0.7rem' }}>PEN</span>
                                      <input type="number" min="0" key={`pr-${cruce.id}-${cruce.penales_rival ?? ''}`} defaultValue={cruce.penales_rival ?? ''} onBlur={(e) => actualizarPenales(cruce.id, cruce.penales_propios ?? '', e.target.value)} style={{ width: '50px', textAlign: 'center', background: '#000', color: '#fff', border: '1px solid #333', padding: '6px', fontWeight: 900, borderRadius: '4px', fontSize: '1rem' }} />
                                    </div>
                                  </div>
                                )}
                                {!fin && (
                                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <input type="number" min="0" value={cruce.goles_propios} onChange={(e) => actualizarResultado(cruce.id, e.target.value, cruce.goles_rival, 'Finalizado')} style={{ width: '46px', textAlign: 'center', background: '#000', color: '#fff', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                                    <span style={{ color: 'var(--text-dim)' }}>-</span>
                                    <input type="number" min="0" value={cruce.goles_rival} onChange={(e) => actualizarResultado(cruce.id, cruce.goles_propios, e.target.value, 'Finalizado')} style={{ width: '46px', textAlign: 'center', background: '#000', color: '#fff', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 🏆 TAB: POSICIONES */}
            {tabMisTorneos === 'posiciones' && !esCopa && (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select value={modoTabla} onChange={(e) => setModoTabla(e.target.value)} style={{ padding: '8px', background: '#000', color: '#fff', border: '1px solid #333', borderRadius: '4px', fontWeight: 800, outline: 'none', cursor: 'pointer' }}>
                      <option value="general">📊 TABLA GENERAL</option>
                      <option value="local">🏠 SOLO LOCAL</option>
                      <option value="visitante">✈️ SOLO VISITANTE</option>
                    </select>
                  </div>
                </div>

                <TablaResponsive
                  filas={tablaPosiciones.map((e, i) => ({ ...e, _pos: i + 1 }))}
                  columnas={colsPosiciones}
                  colsClave={['pts', 'pj', 'dif']}
                  grupos={GRUPOS_POS}
                  gruposLabel={GRUPOS_POS_LABEL}
                  titulo="TABLA DE POSICIONES"
                  getId={(e) => e.nombre}
                  getTitulo={(e) => `${e._pos}. ${e.nombre.toUpperCase()}`}
                  getSubtitulo={(e) => e.nombre === miClubGlobal ? 'TU CLUB' : ''}
                  colorCelda={(e, col) => {
                    if (col.k === 'pts') return 'var(--accent)';
                    if (col.k === 'dif') { const d = valPos(e, 'difGeneral', 'difLocal', 'difVisita'); return d > 0 ? '#00ff88' : (d < 0 ? '#ef4444' : '#fff'); }
                    if (col.k === 'pg') return '#00ff88';
                    if (col.k === 'pe') return '#fbbf24';
                    if (col.k === 'pp') return '#ef4444';
                    return '#fff';
                  }}
                  renderBadges={(e) => (e.escudo ? <img src={e.escudo} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} /> : null)}
                >
                <table style={{ width: '100%', textAlign: 'center', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #333', color: 'var(--text-dim)', fontSize: '0.75rem', backgroundColor: '#0a0a0a' }}>
                      <th style={{ padding: '12px', width: '40px' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '12px' }}>EQUIPO</th>
                      <th style={{ padding: '12px' }}>PTS</th>
                      <th style={{ padding: '12px' }}>PJ</th>
                      <th style={{ padding: '12px' }}>G</th>
                      <th style={{ padding: '12px' }}>E</th>
                      <th style={{ padding: '12px' }}>P</th>
                      <th style={{ padding: '12px' }}>GF</th>
                      <th style={{ padding: '12px' }}>GC</th>
                      <th style={{ padding: '12px' }}>DIF</th>
                      {modoTabla === 'general' && <th style={{ padding: '12px', textAlign: 'center' }}>FORMA (ÚLT 5)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tablaPosiciones.length === 0 ? (
                      <tr>
                        <td colSpan="11" style={{ padding: '30px', color: 'var(--text-dim)' }}>No hay datos suficientes para armar la tabla. Añadí resultados al fixture.</td>
                      </tr>
                    ) : (
                      tablaPosiciones.map((equipo, index) => {
                        const esMiEquipo = equipo.nombre === miClubGlobal;
                        
                        // Variables dinámicas según el modo de tabla seleccionado
                        let pts = equipo.pts; let pj = equipo.pj; let pg = equipo.pg; let pe = equipo.pe; let pp = equipo.pp; let gf = equipo.gf; let gc = equipo.gc; let dif = equipo.difGeneral; let racha = equipo.rachaGeneral;
                        
                        if (modoTabla === 'local') {
                          pts = equipo.ptsL; pj = equipo.pjL; pg = equipo.pgL; pe = equipo.peL; pp = equipo.ppL; gf = equipo.gfL; gc = equipo.gcL; dif = equipo.difLocal; racha = equipo.rachaLocal;
                        } else if (modoTabla === 'visitante') {
                          pts = equipo.ptsV; pj = equipo.pjV; pg = equipo.pgV; pe = equipo.peV; pp = equipo.ppV; gf = equipo.gfV; gc = equipo.gcV; dif = equipo.difVisita; racha = equipo.rachaVisita;
                        }

                        return (
                          <tr key={index} style={{ borderBottom: '1px solid #222', backgroundColor: esMiEquipo ? 'rgba(0, 255, 136, 0.05)' : 'transparent', transition: '0.2s' }}>
                            <td style={{ padding: '12px', fontWeight: 900, color: index < 4 ? 'var(--accent)' : '#fff' }}>{index + 1}</td>
                            <td style={{ textAlign: 'left', padding: '12px', fontWeight: 800, color: esMiEquipo ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {equipo.escudo ? (
                                <img src={equipo.escudo} alt={equipo.nombre} style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                              ) : (
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#333', border: `1px solid ${esMiEquipo ? 'var(--accent)' : '#555'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900 }}>
                                  {equipo.nombre.substring(0,2).toUpperCase()}
                                </div>
                              )}
                              {equipo.nombre.toUpperCase()} {esMiEquipo && <span style={{fontSize: '0.6rem', background: 'var(--accent)', color: '#000', padding: '2px 6px', borderRadius: '4px'}}>TU CLUB</span>}
                            </td>
                            <td style={{ padding: '12px', fontWeight: 900, fontSize: '1.1rem', color: '#fff' }}>{pts}</td>
                            <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{pj}</td>
                            <td style={{ padding: '12px', color: '#00ff88' }}>{pg}</td>
                            <td style={{ padding: '12px', color: '#fbbf24' }}>{pe}</td>
                            <td style={{ padding: '12px', color: '#ef4444' }}>{pp}</td>
                            <td style={{ padding: '12px', color: '#fff' }}>{gf}</td>
                            <td style={{ padding: '12px', color: '#fff' }}>{gc}</td>
                            <td style={{ padding: '12px', fontWeight: 800, color: dif > 0 ? '#00ff88' : (dif < 0 ? '#ef4444' : '#fff') }}>
                              {dif > 0 ? `+${dif}` : dif}
                            </td>
                            {modoTabla === 'general' && (
                              <td style={{ padding: '12px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                                {racha.slice(-5).map((r, i) => {
                                   let color = '#555';
                                   if(r === 'V') color = '#00ff88';
                                   if(r === 'D') color = '#ef4444';
                                   return <div key={i} style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} title={r}></div>
                                })}
                              </td>
                            )}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
                </TablaResponsive>
              </div>
            )}

            {/* 📅 TAB: FIXTURE */}
            {tabMisTorneos === 'fixture' && (
              <>
                {/* FILTROS DE FIXTURE */}
                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid #222' }}>
                  <div style={{ flex: 1 }}>
                    <div className="stat-label" style={{ marginBottom: '5px' }}>FILTRAR POR FECHA</div>
                    <select value={filtroJornada} onChange={e => setFiltroJornada(e.target.value)} style={{ ...inputIndustrial, padding: '8px' }}>
                      <option value="">TODAS LAS FECHAS...</option>
                      {jornadasUnicas.map(j => <option key={j} value={j}>{j.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="stat-label" style={{ marginBottom: '5px' }}>FILTRAR POR EQUIPO</div>
                    <select value={filtroEquipo} onChange={e => setFiltroEquipo(e.target.value)} style={{ ...inputIndustrial, padding: '8px' }}>
                      <option value="">TODOS LOS EQUIPOS...</option>
                      {equiposUnicos.map(eq => <option key={eq} value={eq}>{eq.toUpperCase()}</option>)}
                    </select>
                  </div>
                </div>

                {fixtureFiltrado.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>No hay partidos con esos filtros.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {fixtureFiltrado.map(f => {
                      const estaCompletado = f.estado === 'Finalizado' || f.estado === 'Jugado';
                      const esMiPartido = (!f.nombre_propio || f.nombre_propio === miClubGlobal) || (f.rival === miClubGlobal);
                      
                      return (
                        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: estaCompletado ? 'rgba(0, 255, 136, 0.05)' : '#111', padding: '15px', borderRadius: '6px', border: estaCompletado ? '1px solid var(--accent)' : '1px solid #333', flexWrap: 'wrap', gap: '10px' }}>
                          
                          <div style={{ minWidth: '150px' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800 }}>{f.jornada?.toUpperCase()} {esMiPartido ? `// ${f.condicion}` : '// EXTERNO'}</div>
                            
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {esMiPartido ? (
                                f.rivales?.nombre?.toUpperCase() || f.rival?.toUpperCase() || 'RIVAL DESCONOCIDO'
                              ) : (
                                <span style={{ color: '#a855f7' }}>{(f.nombre_propio || miClubGlobal).toUpperCase()} vs {f.rival?.toUpperCase()}</span>
                              )}
                            </div>

                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>📅 {f.fecha || 'A definir'}</span>
                              <span style={{
                                padding: '3px 6px', borderRadius: '4px',
                                background: f.esTrackeado ? 'rgba(0, 255, 136, 0.1)' : (f.estado === 'Pendiente' ? 'rgba(255,255,255,0.1)' : 'rgba(59, 130, 246, 0.1)'),
                                color: f.esTrackeado ? 'var(--accent)' : (f.estado === 'Pendiente' ? '#aaa' : '#3b82f6'),
                                fontWeight: 800, fontSize: '0.6rem', letterSpacing: '0.5px'
                              }}>
                                {f.esTrackeado ? 'TRACKEADO' : f.estado.toUpperCase()}
                              </span>
                            </div>
                          </div>

                          {!estaCompletado ? (
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              {esMiPartido && (
                                <>
                                  <button onClick={() => irATrackear(f)} className="btn-action" style={{ fontSize: '0.75rem', padding: '8px 15px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                    {f.esTrackeado ? '▶ CONTINUAR' : '⚡ TRACKEAR'}
                                  </button>
                                  <div style={{ height: '20px', width: '1px', background: '#333' }}></div>
                                </>
                              )}
                              <button onClick={() => actualizarResultado(f.id, 0, 0, 'Finalizado')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 10px' }}>
                                CARGA MANUAL
                              </button>
                              <button onClick={() => eliminarPartido(f.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', marginLeft: '5px' }} title="Eliminar partido duplicado">
                                🗑️
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {f.esTrackeado ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0, 255, 136, 0.1)', padding: '5px 15px', borderRadius: '4px', border: '1px solid var(--accent)' }}>
                                    <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '1.2rem' }}>{f.goles_propios}</span>
                                    <span style={{ color: '#fff', fontWeight: 900 }}>-</span>
                                    <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.2rem' }}>{f.goles_rival}</span>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--accent)', marginLeft: '10px', fontWeight: 800 }}>✓ FINALIZADO</span>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{esMiPartido ? 'MI EQUIPO' : 'LOCAL'}</span>
                                      <input type="number" value={f.goles_propios} onChange={(e) => actualizarResultado(f.id, e.target.value, f.goles_rival, 'Finalizado')} style={{ width: '40px', textAlign: 'center', background: '#000', color: esMiPartido ? 'var(--accent)' : '#fff', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                                    </div>
                                    <span style={{ fontWeight: 900 }}>-</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{esMiPartido ? 'RIVAL' : 'VISIT.'}</span>
                                      <input type="number" value={f.goles_rival} onChange={(e) => actualizarResultado(f.id, f.goles_propios, e.target.value, 'Finalizado')} style={{ width: '40px', textAlign: 'center', background: '#000', color: '#fff', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                                    </div>
                                    <button onClick={() => actualizarResultado(f.id, 0, 0, 'Pendiente')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.9rem', marginLeft: '5px' }}>↺</button>
                                  </>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: '5px' }}>
                                {esMiPartido && (
                                  <>
                                    <button onClick={() => irATrackear(f)} className="btn-action" style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '0.7rem', padding: '8px 10px', display: 'flex', gap: '5px' }}>
                                      ✏️ EDITAR
                                    </button>
                                    <button onClick={() => navigate(`/resumen/${f.id}`)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 10px', display: 'flex', gap: '5px' }}>
                                      📊 REPORTE
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* 📈 TAB: REPORTE DE LA LIGA (POWER RANKING & ANALYTICS) */}
            {tabMisTorneos === 'reporte' && (
              !reporteLiga ? (
                 <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '30px' }}>No hay suficientes datos procesados para generar el reporte premium. Asegurate de tener partidos finalizados.</p>
              ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* PRÓXIMO RIVAL + PROYECCIÓN */}
                    {(proximoRival || proyeccion.pendientes > 0 || proyeccion.pj > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>

                        {/* PRÓXIMO RIVAL */}
                        {proximoRival && (
                          <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', borderLeft: '4px solid #a855f7' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                              <div className="stat-label" style={{ color: '#a855f7' }}>PRÓXIMO RIVAL</div>
                              {proximoRival.dias != null && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', background: 'rgba(168,85,247,0.12)', padding: '3px 8px', borderRadius: '10px' }}>
                                  {proximoRival.dias <= 0 ? 'HOY' : `EN ${proximoRival.dias} DÍA${proximoRival.dias > 1 ? 'S' : ''}`}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                              {proximoRival.escudo ? (
                                <img src={proximoRival.escudo} alt={proximoRival.rivalNombre} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                              ) : (
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#222', border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.8rem' }}>
                                  {proximoRival.rivalNombre.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proximoRival.rivalNombre.toUpperCase()}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                  {proximoRival.jornada ? `${proximoRival.jornada} · ` : ''}{proximoRival.fecha || 'Fecha a definir'} · {proximoRival.condicion === 'Visitante' ? '✈️ Visitante' : '🏠 Local'}
                                </div>
                              </div>
                            </div>

                            {proximoRival.fila && proximoRival.fila.pj > 0 ? (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                                  <div style={{ textAlign: 'center', background: '#0a0a0a', borderRadius: '6px', padding: '8px 4px' }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{proximoRival.posRival ? `${proximoRival.posRival}º` : '-'}</div>
                                    <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>POSICIÓN</div>
                                  </div>
                                  <div style={{ textAlign: 'center', background: '#0a0a0a', borderRadius: '6px', padding: '8px 4px' }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent)' }}>{proximoRival.fila.pts}</div>
                                    <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>PTS · {proximoRival.fila.pj}PJ</div>
                                  </div>
                                  <div style={{ textAlign: 'center', background: '#0a0a0a', borderRadius: '6px', padding: '8px 4px' }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{proximoRival.fila.gf}:{proximoRival.fila.gc}</div>
                                    <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>GF:GC</div>
                                  </div>
                                  <div style={{ textAlign: 'center', background: '#0a0a0a', borderRadius: '6px', padding: '8px 4px' }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: proximoRival.condicion === 'Visitante' ? '#f97316' : '#3b82f6' }}>
                                      {proximoRival.condicion === 'Visitante' ? proximoRival.fila.ptsL : proximoRival.fila.ptsV}
                                    </div>
                                    <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>{proximoRival.condicion === 'Visitante' ? 'PTS LOCAL' : 'PTS VISIT.'}</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>FORMA:</span>
                                  {(proximoRival.fila.rachaGeneral || []).slice(-5).map((r, i) => {
                                    let color = '#555'; if (r === 'V') color = '#00ff88'; if (r === 'D') color = '#ef4444';
                                    return <div key={i} style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} title={r}></div>;
                                  })}
                                  {(!proximoRival.fila.rachaGeneral || proximoRival.fila.rachaGeneral.length === 0) && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Sin datos</span>}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                Todavía no hay datos cargados de este rival en la tabla. Cargá sus partidos para verlo.
                              </div>
                            )}

                            <button onClick={() => navigate('/scouting-rivales')} className="btn-secondary" style={{ marginTop: '14px', width: '100%', fontSize: '0.7rem', padding: '8px', fontWeight: 800 }}>
                              🕵️‍♂️ VER SCOUTING DEL RIVAL
                            </button>
                          </div>
                        )}

                        {/* PROYECCIÓN DE PUNTOS */}
                        {(proyeccion.pj > 0 || proyeccion.pendientes > 0) && (
                          <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', borderLeft: '4px solid #00ff88' }}>
                            <div className="stat-label" style={{ color: '#00ff88', marginBottom: '12px' }}>PROYECCIÓN DE PUNTOS</div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                              <div style={{ textAlign: 'center', background: '#0a0a0a', borderRadius: '6px', padding: '10px 4px' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{proyeccion.ptsTotales}</div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>PTS ({proyeccion.pj} PJ)</div>
                              </div>
                              <div style={{ textAlign: 'center', background: '#0a0a0a', borderRadius: '6px', padding: '10px 4px' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent)' }}>{proyeccion.ppp}</div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>PTS / PARTIDO</div>
                              </div>
                              <div style={{ textAlign: 'center', background: '#0a0a0a', borderRadius: '6px', padding: '10px 4px' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#a855f7' }}>{proyeccion.pendientes}</div>
                                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>FECHAS REST.</div>
                              </div>
                            </div>

                            {proyeccion.pendientes > 0 ? (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px', padding: '10px 12px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Proyección final (a este ritmo)</span>
                                  <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#00ff88' }}>{proyeccion.proyFinal} pts</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-dim)', padding: '0 4px' }}>
                                  <span>Techo si ganás todo</span>
                                  <span style={{ color: '#fff', fontWeight: 800 }}>{proyeccion.maxPosible} pts</span>
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No quedan fechas pendientes cargadas.</div>
                            )}

                            {proyeccion.posicion && (
                              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #222', fontSize: '0.78rem', color: '#fff' }}>
                                Vas <b style={{ color: 'var(--accent)' }}>{proyeccion.posicion}º</b> de {proyeccion.totalEquipos}.{' '}
                                {proyeccion.brechaLider > 0
                                  ? <>A <b style={{ color: '#f59e0b' }}>{proyeccion.brechaLider} pts</b> del líder ({proyeccion.lider?.nombre?.toUpperCase()}).</>
                                  : <span style={{ color: '#00ff88', fontWeight: 800 }}>¡Estás puntero! 🔝</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* DASHBOARD EJECUTIVO */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                      <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', borderLeft: '4px solid #00ff88' }}>
                         <div className="stat-label">MÁS GOLEADOR</div>
                         <div style={{ fontSize: '1.1rem', fontWeight: 900, marginTop: '8px', color: '#fff' }}>{reporteLiga.masGoleador?.nombre.toUpperCase()}</div>
                         <div style={{ color: '#00ff88', fontWeight: 800, fontSize: '0.8rem' }}>{reporteLiga.masGoleador?.gf} Goles a favor</div>
                      </div>

                      <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', borderLeft: '4px solid #ef4444' }}>
                         <div className="stat-label">MEJOR DEFENSA</div>
                         <div style={{ fontSize: '1.1rem', fontWeight: 900, marginTop: '8px', color: '#fff' }}>{reporteLiga.mejorDefensa?.nombre.toUpperCase()}</div>
                         <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.8rem' }}>Solo {reporteLiga.mejorDefensa?.gc} goles en contra</div>
                      </div>

                      <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', borderLeft: '4px solid #3b82f6' }}>
                         <div className="stat-label">MEJOR LOCAL</div>
                         <div style={{ fontSize: '1.1rem', fontWeight: 900, marginTop: '8px', color: '#fff' }}>{reporteLiga.mejorLocal?.nombre.toUpperCase()}</div>
                         <div style={{ color: '#3b82f6', fontWeight: 800, fontSize: '0.8rem' }}>{reporteLiga.mejorLocal?.ptsL} Puntos en casa</div>
                      </div>

                      <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', borderLeft: '4px solid #f97316' }}>
                         <div className="stat-label">MEJOR VISITANTE</div>
                         <div style={{ fontSize: '1.1rem', fontWeight: 900, marginTop: '8px', color: '#fff' }}>{reporteLiga.mejorVisita?.nombre.toUpperCase()}</div>
                         <div style={{ color: '#f97316', fontWeight: 800, fontSize: '0.8rem' }}>{reporteLiga.mejorVisita?.ptsV} Puntos fuera</div>
                      </div>
                    </div>

                    {/* TENDENCIAS DE GOLES (OVER/UNDER) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                      {reporteLiga.mayorGoleada.dif > 0 && (
                         <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                            <div className="stat-label">MAYOR GOLEADA</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: '10px', color: 'var(--accent)' }}>{reporteLiga.mayorGoleada.text.toUpperCase()}</div>
                            <div style={{ color: 'var(--text-dim)', fontWeight: 800, fontSize: '0.8rem', marginTop: '5px' }}>Diferencia de {reporteLiga.mayorGoleada.dif} goles</div>
                         </div>
                      )}
                      
                      <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                         <div className="stat-label">TENDENCIA DE GOLES</div>
                         <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                            <div>
                               <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{reporteLiga.promedioGolLiga}</div>
                               <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Goles/Partido</div>
                            </div>
                            <div>
                               <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0ea5e9' }}>{reporteLiga.pctOver3}%</div>
                               <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Partidos +3 Goles</div>
                            </div>
                            <div>
                               <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#a855f7' }}>{reporteLiga.pctOver5}%</div>
                               <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Partidos +5 Goles</div>
                            </div>
                         </div>
                      </div>
                    </div>

                    {/* KPI AVANZADOS - ESTILO SOFASCORE */}
                    <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #333', overflowX: 'auto' }}>
                       <div className="stat-label" style={{ marginBottom: '15px' }}>ESTADÍSTICAS AVANZADAS Y PODER OFENSIVO</div>
                       <table style={{ width: '100%', textAlign: 'center', borderCollapse: 'collapse', minWidth: '700px' }}>
                         <thead>
                           <tr style={{ color: 'var(--text-dim)', fontSize: '0.7rem', borderBottom: '1px solid #333' }}>
                             <th style={{ padding: '8px', textAlign: 'left' }}>EQUIPO</th>
                             <th style={{ padding: '8px' }} title="Puntos obtenidos sobre puntos posibles">% EFECTIVIDAD</th>
                             <th style={{ padding: '8px' }}>GF/PJ (Ataque)</th>
                             <th style={{ padding: '8px' }}>GC/PJ (Defensa)</th>
                             <th style={{ padding: '8px' }}>ÍNDICE DOMINIO</th>
                           </tr>
                         </thead>
                         <tbody>
                           {reporteLiga.powerRanking.map((eq, index) => (
                             <tr key={index} style={{ borderBottom: '1px solid #222' }}>
                               <td style={{ padding: '10px', textAlign: 'left', fontWeight: 800, color: eq.nombre === miClubGlobal ? 'var(--accent)' : '#fff' }}>{eq.nombre.toUpperCase()}</td>
                               <td style={{ padding: '10px', color: eq.pctPuntos > 60 ? '#00ff88' : '#fff', fontWeight: 900 }}>{eq.pctPuntos}%</td>
                               <td style={{ padding: '10px', color: '#0ea5e9', fontWeight: 800 }}>{eq.gfPromedio}</td>
                               <td style={{ padding: '10px', color: '#ef4444', fontWeight: 800 }}>{eq.gcPromedio}</td>
                               <td style={{ padding: '10px' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                                   <div style={{ width: '100px', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                                     <div style={{ height: '100%', width: `${Math.min(Math.max(eq.dominioRaw, 0), 100)}%`, background: 'linear-gradient(90deg, #3b82f6, #a855f7)' }}></div>
                                   </div>
                                   <span style={{ fontSize: '0.8rem', fontWeight: 900 }}>{Math.max(eq.dominioRaw, 0).toFixed(0)}</span>
                                 </div>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                    </div>
                 </div>
              )
            )}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>Creá tu primer torneo para empezar.</div>
      )}

      {/* --- MODALES --- */}
      {mostrarModalTorneo && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '400px' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>NUEVO TORNEO</div>
            
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title">NOMBRE</div>
              <input type="text" value={formTorneo.nombre} onChange={e => setFormTorneo({...formTorneo, nombre: e.target.value})} style={inputIndustrial} placeholder="Ej: Copa Argentina" />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title">TIPO DE COMPETICIÓN</div>
              <select value={formTorneo.tipo} onChange={e => setFormTorneo({...formTorneo, tipo: e.target.value})} style={inputIndustrial}>
                <option value="Oficial">Oficial / Liga</option>
                <option value="Copa">Copa</option>
                <option value="Amistoso">Amistoso</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div className="section-title">CATEGORÍA</div>
              <select value={formTorneo.categoria} onChange={e => setFormTorneo({...formTorneo, categoria: e.target.value})} style={inputIndustrial}>
                {categoriasUnicas.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setMostrarModalTorneo(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
              <button onClick={handleGuardarTorneo} className="btn-action" style={{ flex: 1 }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalFixture && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>AGREGAR FECHA AL FIXTURE</div>
            
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title">¿QUIÉNES JUEGAN?</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setFormFixture({...formFixture, tipo_partido: 'propio'})} 
                  style={{ flex: 1, padding: '10px', background: formFixture.tipo_partido === 'propio' ? 'rgba(0, 255, 136, 0.1)' : 'transparent', border: `1px solid ${formFixture.tipo_partido === 'propio' ? 'var(--accent)' : '#333'}`, color: formFixture.tipo_partido === 'propio' ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 800, borderRadius: '4px', cursor: 'pointer' }}
                >
                  TU CLUB (1 CRUCE)
                </button>
                <button 
                  onClick={() => setFormFixture({...formFixture, tipo_partido: 'multiple'})} 
                  style={{ flex: 1, padding: '10px', background: formFixture.tipo_partido === 'multiple' ? '#222' : 'transparent', border: `1px solid ${formFixture.tipo_partido === 'multiple' ? '#fff' : '#333'}`, color: formFixture.tipo_partido === 'multiple' ? '#fff' : 'var(--text-dim)', fontWeight: 800, borderRadius: '4px', cursor: 'pointer' }}
                >
                  CARGA MÚLTIPLE (FECHA)
                </button>
              </div>
            </div>

            {formFixture.tipo_partido === 'propio' ? (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <div className="section-title">RIVAL</div>
                  <select value={formFixture.rival_id} onChange={e => setFormFixture({...formFixture, rival_id: e.target.value})} style={inputIndustrial}>
                    <option value="">SELECCIONAR RIVAL...</option>
                    {rivales.map(r => <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '15px' }}><div className="section-title">JORNADA / FASE</div><input type="text" value={formFixture.jornada} onChange={e => setFormFixture({...formFixture, jornada: e.target.value})} style={inputIndustrial} placeholder="Ej: Fecha 1 o Semifinal" /></div>
                <div style={{ marginBottom: '15px' }}><div className="section-title">FECHA DEL PARTIDO</div><input type="date" value={formFixture.fecha_partido} onChange={e => setFormFixture({...formFixture, fecha_partido: e.target.value})} style={inputIndustrial} /></div>
                <div style={{ marginBottom: '20px' }}>
                  <div className="section-title">CONDICIÓN</div>
                  <select value={formFixture.condicion} onChange={e => setFormFixture({...formFixture, condicion: e.target.value})} style={inputIndustrial}>
                    <option value="Local">Local</option><option value="Visitante">Visitante</option><option value="Neutral">Neutral</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <div className="section-title">JORNADA (Para todos)</div>
                    <input type="text" value={formFixture.jornada} onChange={e => setFormFixture({...formFixture, jornada: e.target.value})} style={{...inputIndustrial, padding: '10px'}} placeholder="Ej: Fecha 1" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="section-title">DÍA (Opcional)</div>
                    <input type="date" value={formFixture.fecha_partido} onChange={e => setFormFixture({...formFixture, fecha_partido: e.target.value})} style={{...inputIndustrial, padding: '10px'}} />
                  </div>
                </div>

                <div className="section-title" style={{ marginBottom: '10px' }}>CRUCES DE LA FECHA</div>
                <div style={{ maxHeight: '35vh', overflowY: 'auto', paddingRight: '5px', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {formFixture.partidos_multiples.map((p, index) => (
                    <div key={index} style={{ background: '#111', padding: '12px', borderRadius: '6px', border: '1px solid #333' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 800 }}>PARTIDO #{index + 1}</span>
                         {formFixture.partidos_multiples.length > 1 && (
                           <button onClick={() => removerPartidoMultiple(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900 }}>ELIMINAR 🗑️</button>
                         )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <select value={p.local_id} onChange={e => actualizarPartidoMultiple(index, 'local_id', e.target.value)} style={{...inputIndustrial, padding: '8px', fontSize: '0.8rem', flex: 1}}>
                          <option value="">LOCAL...</option>
                          {rivales.map(r => <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>)}
                        </select>
                        <select value={p.visitante_id} onChange={e => actualizarPartidoMultiple(index, 'visitante_id', e.target.value)} style={{...inputIndustrial, padding: '8px', fontSize: '0.8rem', flex: 1}}>
                          <option value="">VISITANTE...</option>
                          {rivales.map(r => <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>)}
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <select value={p.estado} onChange={e => actualizarPartidoMultiple(index, 'estado', e.target.value)} style={{...inputIndustrial, padding: '8px', fontSize: '0.8rem', width: '110px'}}>
                          <option value="Pendiente">Pendiente</option>
                          <option value="Finalizado">Finalizado</option>
                        </select>
                        
                        {p.estado === 'Finalizado' ? (
                          <div style={{ display: 'flex', gap: '5px', flex: 1, alignItems: 'center', background: '#000', borderRadius: '4px', border: '1px solid #333', padding: '2px' }}>
                            <input type="number" value={p.goles_local} onChange={e => actualizarPartidoMultiple(index, 'goles_local', e.target.value)} placeholder="Goles L" style={{...inputIndustrial, padding: '6px', textAlign: 'center', border: 'none'}} />
                            <span style={{color: '#fff', fontWeight: 900}}>-</span>
                            <input type="number" value={p.goles_visitante} onChange={e => actualizarPartidoMultiple(index, 'goles_visitante', e.target.value)} placeholder="Goles V" style={{...inputIndustrial, padding: '6px', textAlign: 'center', border: 'none'}} />
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', flex: 1, textAlign: 'center' }}>Sin resultado (0-0)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <button onClick={agregarPartidoMultiple} className="btn-secondary" style={{ width: '100%', padding: '10px', fontSize: '0.8rem', borderStyle: 'dashed' }}>
                  + SUMAR OTRO CRUCE
                </button>
              </>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setMostrarModalFixture(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
              <button onClick={handleGuardarFixture} className="btn-action" style={{ flex: 1 }}>{formFixture.tipo_partido === 'multiple' ? 'GUARDAR FECHA COMPLETA' : 'AGREGAR FECHA'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-content { width: 100%; border: 1px solid var(--accent); }
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; }
        .tab-btn { border: none; background: transparent; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .tab-btn:hover { opacity: 0.85; }
      `}</style>
    </div>
  );
}

const selectStyle = { 
  padding: '10px 15px', 
  fontSize: '1rem', 
  background: '#111', 
  color: 'var(--accent)', 
  border: '1px solid var(--accent)', 
  borderRadius: '6px', 
  outline: 'none',
  fontWeight: 800,
  cursor: 'pointer',
  minWidth: '220px'
};

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };

export default Torneos;