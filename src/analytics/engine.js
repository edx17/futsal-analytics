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

const trackingCancha = {};
  const plusMinusJugador = {};
  const trackingQuintetos = {};

  // 👉 1. INICIALIZAMOS LOS CRONÓMETROS PARA QUINTETOS
  let ultimoTiempoQuinteto = 0;
  let ultimoQuintetoIds = null;

  evSeguros.forEach(ev => {
    if (ev.quinteto_activo) {
      let idsEnCancha = [];
      if (typeof ev.quinteto_activo === 'string') {
        try {
          idsEnCancha = JSON.parse(ev.quinteto_activo).map(String);
        } catch (e) {
          idsEnCancha = ev.quinteto_activo.split(',').map(id => String(id).trim());
        }
      } else if (Array.isArray(ev.quinteto_activo)) {
        idsEnCancha = ev.quinteto_activo.map(String);
      }

      idsEnCancha.forEach(id => {
        if (!trackingCancha[id]) trackingCancha[id] = { pm: 0 };
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
        
        // 👉 2. LÓGICA DE TIEMPO DEL QUINTETO
        // Convertimos el minuto a formato decimal absoluto
        let m = ev.minuto + ((ev.segundos || 0) / 60);
        if (ev.periodo === 'ST' && ev.minuto < 20) m += 20;

        // Si el quinteto cambió, le adjudicamos los minutos jugados al quinteto que sale
        if (ultimoQuintetoIds && ultimoQuintetoIds !== idsOrdenados) {
           let delta = m - ultimoTiempoQuinteto;
           if (delta > 0 && trackingQuintetos[ultimoQuintetoIds]) {
              trackingQuintetos[ultimoQuintetoIds].minutos += delta;
           }
           ultimoTiempoQuinteto = m;
           ultimoQuintetoIds = idsOrdenados;
        } else if (!ultimoQuintetoIds) {
           // Primer evento detectado, arranca el reloj
           ultimoTiempoQuinteto = m;
           ultimoQuintetoIds = idsOrdenados;
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

      // Logica de plus/minus que ya tenías...
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
  });

  // 👉 3. CIERRE DE CRONÓMETRO AL FINALIZAR EL BUCLE
  // Tenemos que cerrar los minutos del último quinteto que quedó en cancha
  if (ultimoQuintetoIds && trackingQuintetos[ultimoQuintetoIds] && evSeguros.length > 0) {
      const ultimoEv = evSeguros[evSeguros.length - 1];
      let m = ultimoEv.minuto + ((ultimoEv.segundos || 0) / 60);
      if (ultimoEv.periodo === 'ST' && ultimoEv.minuto < 20) m += 20;
      
      // Asumimos el final del tiempo regular para cerrar la cuenta (20' o 40')
      const finAbsoluto = (ultimoEv.periodo === 'ST' || m > 20) ? Math.max(m, 40) : Math.max(m, 20);
      const delta = finAbsoluto - ultimoTiempoQuinteto;
      
      if (delta > 0) {
         trackingQuintetos[ultimoQuintetoIds].minutos += delta;
      }
  }

  // Calculo real del Plus/Minus
  Object.keys(trackingCancha).forEach(id => {
    plusMinusJugador[id] = trackingCancha[id].pm || 0;
  });

  // ✅ INYECCIÓN DEL CÁLCULO PERFECTO DE MINUTOS AQUI
  const minutosJugados = calcularMinutosPorJugador(evSeguros);

  const quintetos = Object.values(trackingQuintetos)
    .map(q => {
      let neto = (q.golesFavor * 5) - (q.golesContra * 4) + (q.rematesFavor * 0.5) - (q.rematesContra * 0.3) + (q.recuperaciones * 0.8) - (q.perdidas * 1.2);
      const volumenReal = q.golesFavor + q.golesContra + q.rematesFavor + q.rematesContra + q.recuperaciones + q.perdidas + q.faltasRecibidas + q.faltasCometidas + q.amarillas + q.rojas;
      const suavizadorPartido = Math.max(5, Math.round(evSeguros.length * 0.05));
      let volumenSuavizado = volumenReal + suavizadorPartido;
      
      let eficiencia = neto / volumenSuavizado;
      let score = 6.0 + (eficiencia * 25); 
      q.balanceRating = Number(Math.max(1, Math.min(10, score)).toFixed(1));
      return q;
    })
    .sort((a, b) => b.balanceRating - a.balanceRating);

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

// ✅ FUNCIÓN DE MINUTOS MEJORADA (Maneja "Cambio", "Cambio Sale" y "Cambio Entra")
export function calcularMinutosPorJugador(eventos = []) {
  const minJugados = {};
  const entradas = {};
  
  const primerEvento = eventos.find(e => e.quinteto_activo && e.quinteto_activo.length > 0);
  let titulares = [];
  
  if (primerEvento) {
    let qa = primerEvento.quinteto_activo;
    if (typeof qa === 'string') {
      try { qa = JSON.parse(qa); } catch(e) { qa = qa.split(',').map(id => id.trim()); }
    }
    if (Array.isArray(qa)) titulares = qa.map(String);
  }

  titulares.forEach(id => {
    entradas[id] = 0; 
    minJugados[id] = 0;
  });

  const getMinutoAbsoluto = (ev) => {
    let m = ev.minuto + ((ev.segundos || 0) / 60);
    if (ev.periodo === 'ST' && ev.minuto < 20) m += 20; 
    return m;
  };

  eventos.forEach(ev => {
    if (ev.equipo !== 'Propio') return;
    const minActual = getMinutoAbsoluto(ev);
    const accion = ev.accion || '';
    
    // Soporta tanto un cambio doble ("Cambio") como eventos individuales ("Cambio Sale", "Cambio Entra")
    if (accion === 'Cambio' || accion === 'Cambio Sale' || accion === 'Cambio Entra') {
      const idSale = (accion === 'Cambio' || accion === 'Cambio Sale') && ev.id_jugador ? String(ev.id_jugador) : null;
      const idEntra = (accion === 'Cambio') && ev.id_receptor ? String(ev.id_receptor) :
                      (accion === 'Cambio Entra') && ev.id_jugador ? String(ev.id_jugador) : null;

      if (idSale && entradas[idSale] !== undefined) {
         minJugados[idSale] = (minJugados[idSale] || 0) + Math.max(0, minActual - entradas[idSale]);
         delete entradas[idSale]; 
      }
      if (idEntra) {
         entradas[idEntra] = minActual;
         if (minJugados[idEntra] === undefined) minJugados[idEntra] = 0;
      }
    } else if (accion === 'Tarjeta Roja') {
       const idRojo = ev.id_jugador ? String(ev.id_jugador) : null;
       if (idRojo && entradas[idRojo] !== undefined) {
         minJugados[idRojo] = (minJugados[idRojo] || 0) + Math.max(0, minActual - entradas[idRojo]);
         delete entradas[idRojo];
       }
    } else {
      const idActor = ev.id_jugador ? String(ev.id_jugador) : null;
      if (idActor && entradas[idActor] === undefined && minJugados[idActor] === undefined) {
         entradas[idActor] = 0; 
         minJugados[idActor] = 0;
      }
    }
  });
  
  const ultimoEvento = eventos[eventos.length - 1];
  const finPartido = ultimoEvento ? getMinutoAbsoluto(ultimoEvento) : 40;
  
  Object.keys(entradas).forEach(id => {
    minJugados[id] = (minJugados[id] || 0) + Math.max(0, finPartido - entradas[id]);
  });
  
  Object.keys(minJugados).forEach(id => {
    minJugados[id] = Math.round(minJugados[id]);
    if (minJugados[id] === 0) {
       minJugados[id] = 1; 
    }
  });
  
  return minJugados;
}