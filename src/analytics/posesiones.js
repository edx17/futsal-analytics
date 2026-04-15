import { calcularXGEvento } from './xg';

const clasificarTipoPosesion = (eventos = []) => {
  if (eventos.length === 0) return 'Desconocido';
  
  const inicioEnDefensa = (eventos[0].zona_x_norm !== undefined ? eventos[0].zona_x_norm : eventos[0].zona_x) < 33;
  
  if (inicioEnDefensa && eventos.length <= 4) return 'SalidaRapida';
  if (eventos.length >= 6) return 'PosicionalLargo';
  if (eventos.length <= 3) return 'Directo';
  return 'Combinado';
};

export function generarPosesiones(eventos = [], jugadores = []) {
  const posesiones = [];
  let actual = null;

  eventos.forEach(ev => {
    const esRemate = ev.accion?.includes('Remate') || ev.accion === 'Gol';
    const finPosesion = esRemate || ev.accion === 'Pérdida';

    if (!actual) {
      actual = {
        equipo: ev.equipo,
        inicio: ev.minuto,
        eventos: [],
        xgGenerado: 0,
        jugadoresInvolucrados: new Set(),
        conexionArquero: false,
        tipoJugada: 'Desconocido'
      };
    }

    if (ev.equipo === actual.equipo) {
      actual.eventos.push(ev);
      if (ev.id_jugador) actual.jugadoresInvolucrados.add(ev.id_jugador);
      if (ev.id_asistencia) actual.jugadoresInvolucrados.add(ev.id_asistencia);
    }

    if (finPosesion) {
      actual.fin = ev.minuto;
      actual.resultado = ev.accion;
      actual.tipoJugada = clasificarTipoPosesion(actual.eventos);

      if (esRemate) {
        actual.xgGenerado = calcularXGEvento(ev);
        actual.rematadorId = ev.id_jugador;
        actual.asistidorId = ev.id_asistencia;

        if (actual.eventos.length > 0 && jugadores.length > 0) {
          const eventoInicio = actual.eventos[0];
          const jugInicio = jugadores.find(j => j.id === eventoInicio.id_jugador);
          
          if (jugInicio?.posicion?.toLowerCase().includes('arquero')) {
            const tInicio = (eventoInicio.minuto * 60) + (eventoInicio.segundos || 0);
            const tRemate = (ev.minuto * 60) + (ev.segundos || 0);
            actual.conexionArquero = (tRemate - tInicio) <= 8; // Tiempo levemente ampliado para salidas de arquero
          }
        }
      }

      posesiones.push({
        ...actual,
        jugadoresInvolucrados: Array.from(actual.jugadoresInvolucrados)
      });
      
      actual = null;
    }
  });

  return posesiones;
}

export function calcularCadenasValor(posesiones, idJugadorTarget) {
  let xgChain = 0;
  let xgBuildup = 0;

  posesiones.forEach(pos => {
    const participo = pos.jugadoresInvolucrados.includes(Number(idJugadorTarget)) || pos.jugadoresInvolucrados.includes(String(idJugadorTarget));
    
    if (participo) {
      xgChain += pos.xgGenerado;
      
      // xG Buildup: Participó en la jugada pero NO fue ni el que pateó ni el que asistió directo
      if (pos.rematadorId != idJugadorTarget && pos.asistidorId != idJugadorTarget) {
        xgBuildup += pos.xgGenerado;
      }
    }
  });

  return { xgChain, xgBuildup };
}