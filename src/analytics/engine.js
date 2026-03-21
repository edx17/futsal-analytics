import { generarPosesiones } from './posesiones';
import { calcularXGPartido } from './xg';
import { detectarTransiciones } from './transiciones';
import { generarGrid } from './spatial';
import { generarInsights } from './insights';

export function analizarPartido(eventos = [], equipoPropio, huboCambioDeLado = false) {
  const evSeguros = Array.isArray(eventos) ? eventos : [];

  // ==========================================
  // FASE 1: PRE-PROCESAMIENTO Y OPTIMIZACIÓN
  // ==========================================

  // Diccionarios para acceso rápido O(1)
  const diccionarios = {
    porEquipo: { propio: [], rival: [] },
    porJugador: {},
    porPeriodo: { PT: [], ST: [] },
    porTramo: { '0-10': [], '10-20': [], '20-30': [], '30-40+': [] }
  };

  // 1. Normalización y Pre-indexación en un solo bucle O(n)
  evSeguros.forEach(ev => {
    // A. Normalización Espacial (El gran fix para el xG)
    // Si hubo cambio de lado y estamos en el ST, invertimos la cancha
    // para que x=100 SIEMPRE sea el arco atacado, y x=0 el defendido.
    if (huboCambioDeLado && ev.periodo === 'ST' && ev.zona_x != null) {
      ev.zona_x_norm = 100 - ev.zona_x;
      // Invertimos Y para que la banda izquierda siga siendo izquierda en nuestra mente
      ev.zona_y_norm = ev.zona_y != null ? 100 - ev.zona_y : null; 
    } else {
      ev.zona_x_norm = ev.zona_x;
      ev.zona_y_norm = ev.zona_y;
    }

    // B. Indexación por Equipo
    const esPropio = ev.equipo === equipoPropio;
    if (esPropio) diccionarios.porEquipo.propio.push(ev);
    else diccionarios.porEquipo.rival.push(ev);

    // C. Indexación por Jugador (Solo propios para agilizar)
    if (esPropio && ev.id_jugador) {
      if (!diccionarios.porJugador[ev.id_jugador]) diccionarios.porJugador[ev.id_jugador] = [];
      diccionarios.porJugador[ev.id_jugador].push(ev);
    }

    // D. Indexación por Periodo
    if (ev.periodo === 'PT') diccionarios.porPeriodo.PT.push(ev);
    else if (ev.periodo === 'ST') diccionarios.porPeriodo.ST.push(ev);

    // E. Indexación por Tramo Temporal (Buckets)
    if (ev.minuto <= 10) diccionarios.porTramo['0-10'].push(ev);
    else if (ev.minuto <= 20) diccionarios.porTramo['10-20'].push(ev);
    else if (ev.minuto <= 30) diccionarios.porTramo['20-30'].push(ev);
    else diccionarios.porTramo['30-40+'].push(ev);
  });

  const eventosPropios = diccionarios.porEquipo.propio;
  const eventosRivales = diccionarios.porEquipo.rival;

  // ==========================================
  // CÁLCULOS BASE (Usando la data limpia)
  // ==========================================

  // Le mandamos a generarPosesiones los eventos ya con las coordenadas normalizadas
  const posesiones = generarPosesiones(evSeguros);
  const transiciones = detectarTransiciones(evSeguros);

  const xgPropio = calcularXGPartido(eventosPropios, transiciones.filter(t => t.remate.equipo === equipoPropio));
  const xgRival = calcularXGPartido(eventosRivales, transiciones.filter(t => t.remate.equipo !== equipoPropio));

  const gridPropio = generarGrid(eventosPropios);
  const gridRival = generarGrid(eventosRivales);

  const goles = eventosPropios.filter(e => e.accion === 'Gol' || e.accion === 'Remate - Gol').length;

  const duelos = {
    defensivos: { ganados: 0, perdidos: 0, total: 0, eficacia: 0 },
    ofensivos: { ganados: 0, perdidos: 0, total: 0, eficacia: 0 }
  };

  eventosPropios.forEach(e => {
    if (e.accion === 'Duelo DEF Ganado') { duelos.defensivos.ganados++; duelos.defensivos.total++; }
    if (e.accion === 'Duelo DEF Perdido') { duelos.defensivos.perdidos++; duelos.defensivos.total++; }
    if (e.accion === 'Duelo OFE Ganado') { duelos.ofensivos.ganados++; duelos.ofensivos.total++; }
    if (e.accion === 'Duelo OFE Perdido') { duelos.ofensivos.perdidos++; duelos.ofensivos.total++; }
  });

  if (duelos.defensivos.total > 0) duelos.defensivos.eficacia = (duelos.defensivos.ganados / duelos.defensivos.total) * 100;
  if (duelos.ofensivos.total > 0) duelos.ofensivos.eficacia = (duelos.ofensivos.ganados / duelos.ofensivos.total) * 100;

  // 🧠 ANÁLISIS DE QUINTETOS, PLUS/MINUS Y MINUTOS REALES
  const statsQuintetos = {};
  const plusMinusJugador = {};
  const setsMinutos = {}; 

  evSeguros.forEach(ev => {
    if (!ev.quinteto_activo || ev.quinteto_activo.length === 0) return;

    if (ev.minuto != null) {
      ev.quinteto_activo.forEach(idJugador => {
        if (!setsMinutos[idJugador]) setsMinutos[idJugador] = new Set();
        setsMinutos[idJugador].add(ev.minuto);
      });
    }

    const idQuinteto = [...ev.quinteto_activo].sort((a, b) => a - b).join('-');
    
    if (!statsQuintetos[idQuinteto]) {
      statsQuintetos[idQuinteto] = {
        ids: ev.quinteto_activo, golesFavor: 0, golesContra: 0, 
        recuperaciones: 0, perdidas: 0, duelosGanados: 0, duelosPerdidos: 0
      };
    }

    const esGol = (ev.accion === 'Gol' || ev.accion === 'Remate - Gol');
    
    if (esGol) {
      const esFavor = ev.equipo === equipoPropio;
      if (esFavor) statsQuintetos[idQuinteto].golesFavor++;
      else statsQuintetos[idQuinteto].golesContra++;

      ev.quinteto_activo.forEach(idJugador => {
        if (!plusMinusJugador[idJugador]) plusMinusJugador[idJugador] = 0;
        plusMinusJugador[idJugador] += esFavor ? 1 : -1;
      });
    }

    if (ev.equipo === equipoPropio) {
      if (ev.accion === 'Recuperación') statsQuintetos[idQuinteto].recuperaciones++;
      if (ev.accion === 'Pérdida') statsQuintetos[idQuinteto].perdidas++;
      if (ev.accion === 'Duelo DEF Ganado' || ev.accion === 'Duelo OFE Ganado') statsQuintetos[idQuinteto].duelosGanados++;
      if (ev.accion === 'Duelo DEF Perdido' || ev.accion === 'Duelo OFE Perdido') statsQuintetos[idQuinteto].duelosPerdidos++;
    }
  });

  const minutosJugados = {};
  Object.keys(setsMinutos).forEach(id => {
    minutosJugados[id] = setsMinutos[id].size;
  });

  const quintetos = Object.values(statsQuintetos).filter(q => 
    (q.golesFavor + q.golesContra + q.recuperaciones + q.perdidas + q.duelosGanados + q.duelosPerdidos) > 0
  );

  const insights = generarInsights({ posesiones, transiciones, xg: xgPropio, goles });

  return {
    posesiones, 
    xgPropio, 
    xgRival, 
    transiciones, 
    gridPropio, 
    gridRival, 
    duelos, 
    insights,
    quintetos, 
    plusMinusJugador,
    minutosJugados,
    diccionarios // Exportamos esto para no tener que recalcular en otras métricas
  };
}

export function calcularStatsArquero(eventosArquero, eventosRivales) {
  const rematesAlArco = eventosRivales.filter(e => 
    e.accion === 'Remate - Gol' || e.accion === 'Remate - Atajado'
  );
  
  const goles = rematesAlArco.filter(e => e.accion === 'Remate - Gol').length;
  // Ahora sí podemos contar esto porque TomaDatos lo inyecta
  const atajadas = eventosArquero.filter(e => e.accion === 'Atajada').length;

  const xgRecibido = rematesAlArco.reduce((acc, e) => acc + (e.xg_ev || e.xg || 0.15), 0);

  return {
    tirosRecibidos: rematesAlArco.length,
    golesRecibidos: goles,
    atajadas: atajadas,
    porcentajeAtajadas: rematesAlArco.length > 0 ? ((atajadas / rematesAlArco.length) * 100).toFixed(1) : 0,
    xgRecibido: Number(xgRecibido.toFixed(2)),
    // LA MÉTRICA REINA: Goles Evitables (Delta)
    // Si es negativo: atajó más de lo esperado. Si es positivo: le hicieron goles "tontos"
    golesEvitables: Number((goles - xgRecibido).toFixed(2)) 
  };
}