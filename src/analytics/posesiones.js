import { calcularXGEvento } from './xg';

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
        conexionArquero: false
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

      if (esRemate) {
        actual.xgGenerado = calcularXGEvento(ev);
        actual.rematadorId = ev.id_jugador;
        actual.asistidorId = ev.id_asistencia;

        if (actual.eventos.length > 0) {
          const eventoInicio = actual.eventos[0];
          const jugInicio = jugadores.find(j => j.id === eventoInicio.id_jugador);
          
          if (jugInicio?.posicion?.toLowerCase().includes('arquero')) {
            const tInicio = (eventoInicio.minuto * 60) + (eventoInicio.segundos || 0);
            const tRemate = (ev.minuto * 60) + (ev.segundos || 0);
            actual.conexionArquero = (tRemate - tInicio) <= 5;
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

export function calcularCadenasValor(posesiones, jugadorId) {
  let xgChain = 0;   
  let xgBuildup = 0; 

  posesiones.forEach(pos => {
    if (pos.xgGenerado > 0 && pos.jugadoresInvolucrados.includes(jugadorId)) {
      xgChain += pos.xgGenerado;
      if (pos.rematadorId !== jugadorId && pos.asistidorId !== jugadorId) {
        xgBuildup += pos.xgGenerado;
      }
    }
  });

  return { xgChain, xgBuildup };
}