import { generarPosesiones } from './posesiones';
import { calcularXGPartido, calcularXGEvento } from './xg';
import { detectarTransiciones } from './transiciones';
import { generarGrid } from './spatial';
import { generarInsights } from './insights';

const obtenerMicroZona = (x, y) => {
  if (x == null || y == null) return null;
  let zX = x < 25 ? 'Z1' : x < 50 ? 'Z2' : x < 75 ? 'Z3' : 'Z4';
  let zY = y < 33.33 ? 'I' : y < 66.66 ? 'C' : 'D';
  return `${zX}-${zY}`;
};

export function analizarPartido(eventos = [], equipoPropio, huboCambioDeLado = false) {
  const evSeguros = Array.isArray(eventos) ? eventos : [];

  const diccionarios = {
    porEquipo: { propio: [], rival: [] },
    porJugador: {},
    porPeriodo: { PT: [], ST: [] },
    porTramo: { '0-10': [], '10-20': [], '20-30': [], '30-40+': [] }
  };

  const abpMicroZonas = {};

  evSeguros.forEach((ev, index) => {
    if (huboCambioDeLado && ev.periodo === 'ST' && ev.zona_x !== undefined) {
      ev.zona_x_norm = 100 - ev.zona_x;
      ev.zona_y_norm = 100 - ev.zona_y;
    } else {
      ev.zona_x_norm = ev.zona_x;
      ev.zona_y_norm = ev.zona_y;
    }

    const equipoKey = ev.equipo === equipoPropio ? 'propio' : 'rival';
    diccionarios.porEquipo[equipoKey].push(ev);

    if (ev.id_jugador) {
      if (!diccionarios.porJugador[ev.id_jugador]) diccionarios.porJugador[ev.id_jugador] = [];
      diccionarios.porJugador[ev.id_jugador].push(ev);
    }

    const perKey = ev.periodo || 'PT';
    if (!diccionarios.porPeriodo[perKey]) diccionarios.porPeriodo[perKey] = [];
    diccionarios.porPeriodo[perKey].push(ev);

    let tramo = '0-10';
    if (ev.minuto > 10 && ev.minuto <= 20) tramo = '10-20';
    else if (ev.minuto > 20 && ev.minuto <= 30) tramo = '20-30';
    else if (ev.minuto > 30) tramo = '30-40+';
    diccionarios.porTramo[tramo].push(ev);

    if (ev.accion?.includes('Falta') || ev.accion === 'Lateral' || ev.accion === 'Córner') {
      const isRival = equipoKey === 'rival';
      const sig1 = evSeguros[index + 1];
      const sig2 = evSeguros[index + 2];
      const sig3 = evSeguros[index + 3];
      
      const ventana = [sig1, sig2, sig3].filter(e => e && e.periodo === ev.periodo && ((e.minuto * 60 + (e.segundos||0)) - (ev.minuto * 60 + (ev.segundos||0))) <= 6);
      
      let xgGenerado = 0;
      let remateEncontrado = false;
      ventana.forEach(v => {
        if (!isRival && v.equipo === equipoPropio && v.accion?.includes('Remate')) {
          xgGenerado += calcularXGEvento(v);
          remateEncontrado = true;
        }
      });

      if (!isRival) {
        const mz = obtenerMicroZona(ev.zona_x_norm, ev.zona_y_norm);
        if (mz) {
          if (!abpMicroZonas[mz]) abpMicroZonas[mz] = { total: 0, rematesGenerados: 0, xGTotal: 0 };
          abpMicroZonas[mz].total++;
          if (remateEncontrado) abpMicroZonas[mz].rematesGenerados++;
          abpMicroZonas[mz].xGTotal += xgGenerado;
        }
      }
    }
  });

  const posesiones = generarPosesiones(diccionarios.porEquipo.propio);
  const transiciones = detectarTransiciones(diccionarios.porEquipo.propio);
  
  const gridPropio = generarGrid(diccionarios.porEquipo.propio);
  const gridRival = generarGrid(diccionarios.porEquipo.rival);

  const xgPropio = calcularXGPartido(diccionarios.porEquipo.propio);
  const xgRival = calcularXGPartido(diccionarios.porEquipo.rival);
  const goles = diccionarios.porEquipo.propio.filter(e => e.accion === 'Gol' || e.accion === 'Remate - Gol').length;

  const duelos = {
    defensivos: { total: 0, ganados: 0, perdidos: 0, eficacia: 0 },
    ofensivos: { total: 0, ganados: 0, perdidos: 0, eficacia: 0 }
  };

  diccionarios.porEquipo.propio.forEach(ev => {
    if (ev.accion === 'Duelo DEF Ganado') { duelos.defensivos.total++; duelos.defensivos.ganados++; }
    if (ev.accion === 'Duelo DEF Perdido') { duelos.defensivos.total++; duelos.defensivos.perdidos++; }
    if (ev.accion === 'Duelo OFE Ganado') { duelos.ofensivos.total++; duelos.ofensivos.ganados++; }
    if (ev.accion === 'Duelo OFE Perdido') { duelos.ofensivos.total++; duelos.ofensivos.perdidos++; }
  });

  if (duelos.defensivos.total > 0) duelos.defensivos.eficacia = (duelos.defensivos.ganados / duelos.defensivos.total) * 100;
  if (duelos.ofensivos.total > 0) duelos.ofensivos.eficacia = (duelos.ofensivos.ganados / duelos.ofensivos.total) * 100;

  // Calculo de Minutos y Plus/Minus Exacto
  const trackingCancha = {};
  const minutosJugados = {};
  const plusMinusJugador = {};
  const trackingQuintetos = {};

  evSeguros.forEach(ev => {
    if (ev.quinteto_activo) {
      let idsEnCancha = [];
      if (typeof ev.quinteto_activo === 'string') idsEnCancha = ev.quinteto_activo.split(',').map(id => id.trim());
      else if (Array.isArray(ev.quinteto_activo)) idsEnCancha = ev.quinteto_activo;

      idsEnCancha.forEach(id => {
        if (!trackingCancha[id]) trackingCancha[id] = { ultimoMinuto: 0, totalMinutos: 0, pm: 0 };
      });

      const idsOrdenados = [...idsEnCancha].sort().join('-');
      if (idsOrdenados.length > 0) {
        if (!trackingQuintetos[idsOrdenados]) {
          trackingQuintetos[idsOrdenados] = { 
            ids: idsEnCancha, minutos: 0, golesFavor: 0, golesContra: 0, 
            rematesFavor: 0, rematesContra: 0, recuperaciones: 0, perdidas: 0,
            faltasRecibidas: 0, faltasCometidas: 0, amarillas: 0, rojas: 0 
          };
        }
        
        const q = trackingQuintetos[idsOrdenados];
        const esPropio = ev.equipo === equipoPropio;
        const act = ev.accion || '';

        if (esPropio) {
          if (act === 'Gol' || act === 'Remate - Gol') q.golesFavor++;
          if (act.includes('Remate')) q.rematesFavor++;
          if (act === 'Recuperación' || act === 'Intercepción') q.recuperaciones++;
          if (act === 'Pérdida') q.perdidas++;
          if (act === 'Falta recibida') q.faltasRecibidas++;
          if (act === 'Falta cometida') q.faltasCometidas++;
          if (act === 'Tarjeta Amarilla') q.amarillas++;
          if (act === 'Tarjeta Roja') q.rojas++;
        } else {
          if (act === 'Gol' || act === 'Remate - Gol') q.golesContra++;
          if (act.includes('Remate')) q.rematesContra++;
        }
      }

      if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
        const esGolPropio = ev.equipo === equipoPropio;
        idsEnCancha.forEach(id => {
          if (trackingCancha[id]) {
            if (esGolPropio) trackingCancha[id].pm++;
            else trackingCancha[id].pm--;
          }
        });
      }
    }

    if (ev.accion === 'Cambio Sale' && ev.id_jugador) {
      if (trackingCancha[ev.id_jugador]) {
        let minActual = (ev.minuto || 0) + ((ev.segundos || 0) / 60);
        let m = minActual - trackingCancha[ev.id_jugador].ultimoMinuto;
        if (m > 0 && m < 40) trackingCancha[ev.id_jugador].totalMinutos += m;
      }
    }
    if (ev.accion === 'Cambio Entra' && ev.id_jugador) {
      if (!trackingCancha[ev.id_jugador]) trackingCancha[ev.id_jugador] = { ultimoMinuto: 0, totalMinutos: 0, pm: 0 };
      trackingCancha[ev.id_jugador].ultimoMinuto = (ev.minuto || 0) + ((ev.segundos || 0) / 60);
    }
  });

  Object.keys(trackingCancha).forEach(id => {
    minutosJugados[id] = Math.ceil(trackingCancha[id].totalMinutos) || 1;
    plusMinusJugador[id] = trackingCancha[id].pm || 0;
  });

  const quintetos = Object.values(trackingQuintetos)
    .map(q => {
      // Motor de Rating Avanzado para Quintetos
      let neto = (q.golesFavor * 5) - (q.golesContra * 4) + (q.rematesFavor * 0.5) - (q.rematesContra * 0.3) + (q.recuperaciones * 0.8) - (q.perdidas * 1.2);
      
      const volumenReal = q.golesFavor + q.golesContra + q.rematesFavor + q.rematesContra + q.recuperaciones + q.perdidas + q.faltasRecibidas + q.faltasCometidas + q.amarillas + q.rojas;
      
      // ✅ SUAVIZADO INTELIGENTE PROPORCIONAL AL PARTIDO
      const suavizadorPartido = Math.max(5, Math.round(evSeguros.length * 0.05));
      let volumenSuavizado = volumenReal + suavizadorPartido;
      
      let eficiencia = neto / volumenSuavizado;
      let score = 6.0 + (eficiencia * 25); 
      q.balanceRating = Number(Math.max(1, Math.min(10, score)).toFixed(1));
      return q;
    })
    .sort((a, b) => b.balanceRating - a.balanceRating);

  // Pasamos todos los diccionarios y contexto para los nuevos Insights Tácticos
  const insights = generarInsights({ posesiones, transiciones, xg: xgPropio, goles, diccionarios, duelos, abpMicroZonas });

  return {
    posesiones, xgPropio, xgRival, transiciones, gridPropio, gridRival, 
    duelos, insights, quintetos, plusMinusJugador, minutosJugados, diccionarios, abpMicroZonas
  };
}

export function calcularStatsArquero(eventosArquero, eventosRivales) {
  const rematesAlArco = eventosRivales.filter(e => 
    e.accion === 'Remate - Gol' || e.accion === 'Remate - Atajado'
  );
  
  const goles = rematesAlArco.filter(e => e.accion === 'Remate - Gol').length;
  const atajadas = eventosArquero.filter(e => e.accion === 'Atajada').length;
  const xgConcedido = calcularXGPartido(rematesAlArco);
  
  return {
    tirosRecibidos: rematesAlArco.length,
    golesRecibidos: goles,
    atajadas: atajadas,
    xgRecibido: Number(xgConcedido.toFixed(2)),
    golesEvitables: Number((xgConcedido - goles).toFixed(2)),
    porcentajeAtajadas: rematesAlArco.length > 0 ? ((atajadas / rematesAlArco.length) * 100).toFixed(1) : 0
  };
}