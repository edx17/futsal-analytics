// src/reportes/hooks/useReportData.js
import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useAuth } from '../../context/AuthContext';
import { calcularMinutosPorJugador } from '../../analytics/engine';
import { calcularRatingJugador } from '../../analytics/rating';

const mismoId = (a, b) => String(a) === String(b);
const parseQuinteto = (qa) => {
  if (!qa) return [];
  if (Array.isArray(qa)) return qa.map(String);
  if (typeof qa === 'string') { try { return JSON.parse(qa).map(String); } catch { return qa.split(',').map(s => s.trim()); } }
  return [];
};

// Placeholder embebido: via.placeholder.com dejó de responder y devolvía
// una imagen rota en el PNG exportado.
const ESCUDO_PLACEHOLDER =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">
      <rect width="100%" height="100%" fill="none"/>
    </svg>`
  );

export default function useReportData() {
  const { perfil } = useAuth();
  const clubId = localStorage.getItem('club_id') || perfil?.club_id;

  const [club, setClub] = useState({
    nombre: '',
    logo: localStorage.getItem('escudo_url') || perfil?.clubes?.escudo_url || ESCUDO_PLACEHOLDER,
  });

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [jugadores, setJugadores] = useState([]);
  const [jugadorSeleccionadoId, setJugadorSeleccionadoId] = useState('');
  const [templateSeleccionado, setTemplateSeleccionado] = useState('verde');

  const [torneos, setTorneos] = useState([]);
  const [torneoSeleccionado, setTorneoSeleccionado] = useState('');

  const [stats, setStats] = useState({
    goles: 0, remates: 0, asistencias: 0, partidosJugados: 0,
    minutos: 0, titularidades: 0, recuperaciones: 0, perdidas: 0,
    faltasRecibidas: 0, faltasCometidas: 0, amarillas: 0, rojas: 0, rating: 0,
    atajadas: 0, golesRecibidos: 0
  });

  // Datos del club: hacen falta para que {club.nombre} deje de estar
  // hardcodeado dentro de las plantillas.
  useEffect(() => {
    if (!clubId) return;

    const cargarClub = async () => {
      try {
        const { data, error } = await supabase
          .from('clubes')
          .select('nombre, escudo_url')
          .eq('id', clubId)
          .maybeSingle();

        if (error) throw error;
        if (!data) return;

        setClub({
          nombre: data.nombre || '',
          // El escudo del localStorage gana: es el que el usuario ya vio
          // en el resto de la app y evita un parpadeo al cargar.
          logo: localStorage.getItem('escudo_url') || data.escudo_url || ESCUDO_PLACEHOLDER,
        });
      } catch (err) {
        console.error('Error cargando datos del club:', err);
      }
    };

    cargarClub();
  }, [clubId]);

  useEffect(() => {
    if (!clubId) {
      setError('Elegí un club para continuar.');
      setCargando(false);
      return;
    }

    const cargarJugadores = async () => {
      try {
        const { data, error } = await supabase
          .from('jugadores')
          .select('id, nombre, apellido, dorsal, posicion, categoria, foto')
          .eq('club_id', clubId)
          .order('dorsal', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          setJugadores(data);
          setJugadorSeleccionadoId(data[0].id);
        }
      } catch (err) {
        console.error('Error cargando jugadores:', err);
        setError('No se pudieron cargar los jugadores.');
      } finally {
        setCargando(false);
      }
    };

    cargarJugadores();
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;

    const cargarTorneos = async () => {
      try {
        const { data, error } = await supabase
          .from('torneos')
          .select('id, nombre')
          .eq('club_id', clubId);

        if (error) throw error;
        setTorneos(data || []);
      } catch (err) {
        console.error('Error cargando torneos:', err);
      }
    };

    cargarTorneos();
  }, [clubId]);

  useEffect(() => {
    if (!jugadorSeleccionadoId || !clubId || jugadores.length === 0) return;

    const procesarMetricas = async () => {
      try {
        let consultaPartidos = supabase
          .from('partidos').select('*')
          .eq('club_id', clubId)
          .or('condicion.is.null,condicion.neq.Neutral');

        if (torneoSeleccionado) {
          consultaPartidos = consultaPartidos.eq('torneo_id', torneoSeleccionado);
        }

        const { data: partidos } = await consultaPartidos;

        const idsPartidos = (partidos || []).map(p => p.id);

        let eventos = [];
        if (idsPartidos.length > 0) {
          const size = 1000; let page = 0;
          while (true) {
            const { data, error } = await supabase
              .from('eventos').select('*')
              .eq('club_id', clubId)
              .in('id_partido', idsPartidos)
              .order('id', { ascending: true })
              .range(page * size, page * size + size - 1);
            if (error || !data || data.length === 0) break;
            eventos = eventos.concat(data);
            if (data.length < size) break;
            page++;
            if (page > 50) break;
          }
        }

        const evPorPartido = new Map();
        eventos.forEach(ev => {
          if (!evPorPartido.has(ev.id_partido)) evPorPartido.set(ev.id_partido, []);
          evPorPartido.get(ev.id_partido).push(ev);
        });

        let g = 0, rem = 0, asis = 0, rec = 0, perd = 0, fr = 0, fc = 0, am = 0, roj = 0;
        let pj = 0, tit = 0, minsTotales = 0, ataj = 0, grec = 0;
        let pmAcum = 0, pmPartidos = 0;
        const ratingsJugador = [];

        const jugadorTarget = jugadores.find(j => mismoId(j.id, jugadorSeleccionadoId));
        if (!jugadorTarget) return;

        (partidos || []).forEach(p => {
          const evMatch = evPorPartido.get(p.id) || [];
          const evPropio = evMatch.filter(e => e.equipo === 'Propio');
          const evRival = evMatch.filter(e => e.equipo === 'Rival');

          const minsMap = evMatch.length ? calcularMinutosPorJugador(evMatch) : {};
          const minsJugador = minsMap[String(jugadorSeleccionadoId)] || 0;

          let pmPartido = 0;
          evMatch.forEach(ev => {
            if ((ev.accion === 'Gol' || ev.accion === 'Remate - Gol') && ev.quinteto_activo) {
              const ids = parseQuinteto(ev.quinteto_activo);
              const signo = ev.equipo === 'Propio' ? 1 : -1;
              if (ids.includes(String(jugadorSeleccionadoId))) {
                pmPartido += signo;
              }
            }
          });

          const primerQ = evMatch.find(e => e.quinteto_activo);
          const titulares = new Set(primerQ ? parseQuinteto(primerQ.quinteto_activo) : []);

          if (minsJugador > 0) {
            pj++;
            minsTotales += minsJugador;
            if (titulares.has(String(jugadorSeleccionadoId))) tit++;
            pmAcum += pmPartido;
            pmPartidos++;
          }

          const evJug = evPropio.filter(e => mismoId(e.id_jugador, jugadorSeleccionadoId));
          evJug.forEach(e => {
            const ac = e.accion || '';
            if (ac === 'Gol' || ac === 'Remate - Gol') g++;
            if (ac.includes('Remate')) rem++;
            if (ac === 'Recuperación') rec++;
            if (ac === 'Pérdida') perd++;
            if (ac === 'Falta cometida') fc++;
            if (ac === 'Falta recibida') fr++;
            if (ac === 'Tarjeta Amarilla') am++;
            if (ac === 'Tarjeta Roja') roj++;
          });

          asis += evPropio.filter(e => mismoId(e.id_asistencia, jugadorSeleccionadoId) && (e.accion === 'Gol' || e.accion === 'Remate - Gol')).length;

          if ((jugadorTarget.posicion || '').toLowerCase().includes('arquero')) {
            if (minsJugador > 0) {
              grec += evRival.filter(e => e.accion === 'Remate - Gol').length;
              ataj += evRival.filter(e => e.accion === 'Remate - Atajado').length;
            }
          }

          const paraRating = [...evJug];
          evPropio.forEach(e => {
            if (mismoId(e.id_asistencia, jugadorSeleccionadoId) && (e.accion === 'Gol' || e.accion === 'Remate - Gol')) {
              paraRating.push({ ...e, id_jugador: jugadorSeleccionadoId, tipoVirtual: 'Asistencia' });
            }
          });

          if (minsJugador > 0 || evJug.length > 0) {
            const rat = calcularRatingJugador(jugadorTarget, paraRating, evRival, pmPartido, minsJugador);
            if (rat && !Number.isNaN(Number(rat))) ratingsJugador.push(Number(rat));
          }
        });

        const ratingPromedio = ratingsJugador.length > 0 ? ratingsJugador.reduce((a, b) => a + b, 0) / ratingsJugador.length : 0;

        setStats({
          goles: g, remates: rem, asistencias: asis, partidosJugados: pj,
          minutos: minsTotales, titularidades: tit, recuperaciones: rec,
          perdidas: perd, faltasRecibidas: fr, faltasCometidas: fc,
          amarillas: am, rojas: roj, rating: ratingPromedio.toFixed(2),
          atajadas: ataj, golesRecibidos: grec
        });

      } catch (err) {
        console.error('Error calculando métricas:', err);
      }
    };

    procesarMetricas();
  }, [jugadorSeleccionadoId, clubId, jugadores, torneoSeleccionado]);

  const jugadorBase = jugadores.find(j => String(j.id) === String(jugadorSeleccionadoId)) || {};
  const jugadorParaReporte = { ...jugadorBase, dorsal: jugadorBase.dorsal || '00' };

  const nombreTorneo = torneos.find(t => String(t.id) === String(torneoSeleccionado))?.nombre || '';

  return {
    cargando, error, jugadores, clubId,
    jugadorSeleccionadoId, setJugadorSeleccionadoId,
    templateSeleccionado, setTemplateSeleccionado,
    torneos, torneoSeleccionado, setTorneoSeleccionado,
    dataReporte: {
      jugador: jugadorParaReporte,
      stats,
      club: { nombre: club.nombre, logo: club.logo, torneo: nombreTorneo },
    }
  };
}