import { generarPosesiones } from './posesiones';
import { calcularXGPartido } from './xg';
import { detectarTransiciones } from './transiciones';
import { generarGrid } from './spatial';
import { generarInsights } from './insights';

export function analizarPartido(eventos = [], equipoPropio) {
  const evSeguros = Array.isArray(eventos) ? eventos : [];
  
  const posesiones = generarPosesiones(evSeguros);
  const transiciones = detectarTransiciones(evSeguros);

  const eventosPropios = evSeguros.filter(e => e.equipo === equipoPropio);
  const eventosRivales = evSeguros.filter(e => e.equipo !== equipoPropio);

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
  const setsMinutos = {}; // NUEVO: Registra minutos únicos por jugador

  evSeguros.forEach(ev => {
    if (!ev.quinteto_activo || ev.quinteto_activo.length === 0) return;

    // Registrar Minutos Jugados (Set evita duplicar si hay 3 eventos en el mismo minuto)
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

  // Convertir los Sets a cantidades enteras
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
    minutosJugados // NUEVO: Exportamos esto para la temporada
  };
}