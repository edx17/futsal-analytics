import { generarPosesiones } from './posesiones';
import { calcularXGPartido } from './xg';
import { detectarTransiciones } from './transiciones';
import { generarGrid } from './spatial';
import { generarInsights } from './insights';

export function analizarPartido(eventos = [], equipoPropio) {
  // 1. Normalización de seguridad
  const evSeguros = Array.isArray(eventos) ? eventos : [];
  
  const posesiones = generarPosesiones(evSeguros);
  const xg = calcularXGPartido(evSeguros);
  const transiciones = detectarTransiciones(evSeguros);

  const eventosPropios = evSeguros.filter(e => e.equipo === equipoPropio);
  const eventosRivales = evSeguros.filter(e => e.equipo !== equipoPropio);

  const gridPropio = generarGrid(eventosPropios);
  const gridRival = generarGrid(eventosRivales);

  const goles = evSeguros.filter(e => 
    (e.accion === 'Gol' || e.accion === 'Remate - Gol') && e.equipo === equipoPropio
  ).length;

  const duelos = {
    defensivos: { ganados: 0, total: 0, eficacia: 0 },
    ofensivos: { ganados: 0, total: 0, eficacia: 0 }
  };

  eventosPropios.forEach(e => {
    if (e.accion?.includes('Duelo DEF')) {
      duelos.defensivos.total++;
      if (e.accion.includes('Ganado')) duelos.defensivos.ganados++;
    }
    if (e.accion?.includes('Duelo OFE')) {
      duelos.ofensivos.total++;
      if (e.accion.includes('Ganado')) duelos.ofensivos.ganados++;
    }
  });

  duelos.defensivos.eficacia = duelos.defensivos.total > 0 ? (duelos.defensivos.ganados / duelos.defensivos.total) * 100 : 0;
  duelos.ofensivos.eficacia = duelos.ofensivos.total > 0 ? (duelos.ofensivos.ganados / duelos.ofensivos.total) * 100 : 0;

  const insights = generarInsights({ posesiones, transiciones, xg, goles });

  return { posesiones, xg, transiciones, gridPropio, gridRival, duelos, insights };
}