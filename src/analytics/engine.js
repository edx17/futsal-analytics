import { generarPosesiones } from './posesiones';
import { calcularXGPartido } from './xg';
import { detectarTransiciones } from './transiciones';
import { generarGrid } from './spatial';
import { generarInsights } from './insights';

export function analizarPartido(eventos = [], equipoPropio, huboCambioDeLado = false) {
  const evSeguros = Array.isArray(eventos) ? eventos : [];

  const diccionarios = {
    porEquipo: { propio: [], rival: [] },
    porJugador: {},
    porPeriodo: { PT: [], ST: [] },
    porTramo: { '0-10': [], '10-20': [], '20-30': [], '30-40+': [] }
  };

  evSeguros.forEach(ev => {
    if (huboCambioDeLado && ev.periodo === 'ST' && ev.zona_x != null) {
      ev.zona_x_norm = 100 - ev.zona_x;
      ev.zona_y_norm = ev.zona_y != null ? 100 - ev.zona_y : null; 
    } else {
      ev.zona_x_norm = ev.zona_x;
      ev.zona_y_norm = ev.zona_y;
    }

    const esPropio = ev.equipo === equipoPropio;
    if (esPropio) diccionarios.porEquipo.propio.push(ev);
    else diccionarios.porEquipo.rival.push(ev);

    if (esPropio && ev.id_jugador) {
      if (!diccionarios.porJugador[ev.id_jugador]) diccionarios.porJugador[ev.id_jugador] = [];
      diccionarios.porJugador[ev.id_jugador].push(ev);
    }

    if (ev.periodo === 'PT') diccionarios.porPeriodo.PT.push(ev);
    else if (ev.periodo === 'ST') diccionarios.porPeriodo.ST.push(ev);

    if (ev.minuto <= 10) diccionarios.porTramo['0-10'].push(ev);
    else if (ev.minuto <= 20) diccionarios.porTramo['10-20'].push(ev);
    else if (ev.minuto <= 30) diccionarios.porTramo['20-30'].push(ev);
    else diccionarios.porTramo['30-40+'].push(ev);
  });

  const eventosPropios = diccionarios.porEquipo.propio;
  const eventosRivales = diccionarios.porEquipo.rival;

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

  const statsQuintetos = {};
  const plusMinusJugador = {};
  const setsMinutos = {}; 
  const setsMinutosQuintetos = {}; // NUEVO: Para trackear minutos reales por quinteto

  evSeguros.forEach(ev => {
    if (!ev.quinteto_activo || ev.quinteto_activo.length === 0) return;

    const idQuinteto = [...ev.quinteto_activo].sort((a, b) => a - b).join('-');

    if (ev.minuto != null) {
      // Minutos por jugador
      ev.quinteto_activo.forEach(idJugador => {
        if (!setsMinutos[idJugador]) setsMinutos[idJugador] = new Set();
        setsMinutos[idJugador].add(ev.minuto);
      });
      // Minutos por quinteto
      if (!setsMinutosQuintetos[idQuinteto]) setsMinutosQuintetos[idQuinteto] = new Set();
      setsMinutosQuintetos[idQuinteto].add(ev.minuto);
    }

    if (!statsQuintetos[idQuinteto]) {
      statsQuintetos[idQuinteto] = {
        ids: ev.quinteto_activo, golesFavor: 0, golesContra: 0, 
        recuperaciones: 0, perdidas: 0, duelosGanados: 0, duelosPerdidos: 0,
        rematesFavor: 0, rematesContra: 0,
        faltasCometidas: 0, faltasRecibidas: 0,
        amarillas: 0, rojas: 0
      };
    }

    const esGol = (ev.accion === 'Gol' || ev.accion === 'Remate - Gol');
    const esFavor = ev.equipo === equipoPropio;
    
    if (esGol) {
      if (esFavor) statsQuintetos[idQuinteto].golesFavor++;
      else statsQuintetos[idQuinteto].golesContra++;

      ev.quinteto_activo.forEach(idJugador => {
        if (!plusMinusJugador[idJugador]) plusMinusJugador[idJugador] = 0;
        plusMinusJugador[idJugador] += esFavor ? 1 : -1;
      });
    }

    if (esFavor) {
      if (ev.accion?.includes('Remate')) statsQuintetos[idQuinteto].rematesFavor++;
      if (ev.accion === 'Recuperación') statsQuintetos[idQuinteto].recuperaciones++;
      if (ev.accion === 'Pérdida') statsQuintetos[idQuinteto].perdidas++;
      if (ev.accion === 'Duelo DEF Ganado' || ev.accion === 'Duelo OFE Ganado') statsQuintetos[idQuinteto].duelosGanados++;
      if (ev.accion === 'Duelo DEF Perdido' || ev.accion === 'Duelo OFE Perdido') statsQuintetos[idQuinteto].duelosPerdidos++;
      if (ev.accion === 'Falta cometida') statsQuintetos[idQuinteto].faltasCometidas++;
      if (ev.accion === 'Falta recibida') statsQuintetos[idQuinteto].faltasRecibidas++;
      
      // Capturamos tarjetas para el quinteto
      if (ev.accion === 'Tarjeta Amarilla') statsQuintetos[idQuinteto].amarillas++;
      if (ev.accion === 'Tarjeta Roja') statsQuintetos[idQuinteto].rojas++;
    } else {
      if (ev.accion?.includes('Remate')) statsQuintetos[idQuinteto].rematesContra++;
      if (ev.accion === 'Falta cometida') statsQuintetos[idQuinteto].faltasRecibidas++; 
    }
  });

  const minutosJugados = {};
  Object.keys(setsMinutos).forEach(id => {
    minutosJugados[id] = setsMinutos[id].size;
  });

  const quintetos = Object.values(statsQuintetos)
    .map(q => {
      const hash = [...q.ids].sort((a,b)=>a-b).join('-');
      q.minutos = setsMinutosQuintetos[hash] ? setsMinutosQuintetos[hash].size : 0;

      let pesoPositivo = (q.golesFavor * 2) + (q.rematesFavor * 1) + (q.recuperaciones * 0.5) + (q.faltasRecibidas * 1);
      let pesoNegativo = (q.golesContra * 2) + (q.rematesContra * 1) + (q.perdidas * 0.5) + (q.faltasCometidas * 1) + (q.amarillas * 1) + (q.rojas * 3);
      let neto = pesoPositivo - pesoNegativo;

      let volumenReal = q.golesFavor + q.golesContra + q.rematesFavor + q.rematesContra + q.recuperaciones + q.perdidas + q.faltasRecibidas + q.faltasCometidas + q.amarillas + q.rojas;
      let volumenSuavizado = volumenReal + 10;
      let eficiencia = neto / volumenSuavizado;

      let score = 6.0 + (eficiencia * 25); 
      q.balanceRating = Number(Math.max(1, Math.min(10, score)).toFixed(1));
      return q;
    })
    .sort((a, b) => b.balanceRating - a.balanceRating);

  const insights = generarInsights({ posesiones, transiciones, xg: xgPropio, goles });

  return {
    posesiones, xgPropio, xgRival, transiciones, gridPropio, gridRival, 
    duelos, insights, quintetos, plusMinusJugador, minutosJugados, diccionarios
  };
}

export function calcularStatsArquero(eventosArquero, eventosRivales) {
  const rematesAlArco = eventosRivales.filter(e => 
    e.accion === 'Remate - Gol' || e.accion === 'Remate - Atajado'
  );
  
  const goles = rematesAlArco.filter(e => e.accion === 'Remate - Gol').length;
  const atajadas = eventosArquero.filter(e => e.accion === 'Atajada').length;
  const xgRecibido = rematesAlArco.reduce((acc, e) => acc + (e.xg_ev || e.xg || 0.15), 0);

  return {
    tirosRecibidos: rematesAlArco.length,
    golesRecibidos: goles,
    atajadas: atajadas,
    porcentajeAtajadas: rematesAlArco.length > 0 ? ((atajadas / rematesAlArco.length) * 100).toFixed(1) : 0,
    xgRecibido: Number(xgRecibido.toFixed(2)),
    golesEvitables: Number((goles - xgRecibido).toFixed(2)) 
  };
}