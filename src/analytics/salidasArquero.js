// src/analytics/salidasArquero.js

export function evaluarDistribucionArquero(eventos = [], idArquero, ventanaSegundos = 5) {
  const salidasOfensivas = [];

  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i];

    if (ev.id_jugador === idArquero && (ev.accion === 'Pase Clave' || ev.accion === 'Asistencia' || ev.accion === 'Recuperación')) {
      const tiempoEv = (ev.minuto * 60) + (ev.segundos || 0);
      let decantoEnRemate = false;
      let eventoRemate = null;

      for (let j = i + 1; j < eventos.length; j++) {
        const siguiente = eventos[j];
        
        if (siguiente.periodo !== ev.periodo || siguiente.equipo !== ev.equipo) break;

        const tiempoSig = (siguiente.minuto * 60) + (siguiente.segundos || 0);
        const latencia = tiempoSig - tiempoEv;

        if (latencia > ventanaSegundos) break;

        if (siguiente.accion?.includes('Remate')) {
          decantoEnRemate = true;
          eventoRemate = siguiente;
          break;
        }
      }

      if (decantoEnRemate) {
        salidasOfensivas.push({
          inicio: ev,
          remateFinal: eventoRemate,
          tiempoTranscurrido: (eventoRemate.minuto * 60 + (eventoRemate.segundos || 0)) - tiempoEv
        });
      }
    }
  }

  return salidasOfensivas;
}