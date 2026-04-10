export function detectarTransiciones(eventos = [], ventanaSegundos = 15) {
  const transiciones = [];

  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i];

    if (ev.accion === 'Recuperación') {
      const equipo = ev.equipo;
      const tiempoEv = (ev.minuto * 60) + (ev.segundos || 0);

      for (let j = i + 1; j < eventos.length; j++) {
        const siguiente = eventos[j];
        
        if (siguiente.periodo !== ev.periodo) break;

        const tiempoSig = (siguiente.minuto * 60) + (siguiente.segundos || 0);
        const latencia = tiempoSig - tiempoEv;

        if (latencia > ventanaSegundos) break;

        if (
          siguiente.equipo === equipo &&
          siguiente.accion?.includes('Remate')
        ) {
          transiciones.push({
            recuperacion: ev,
            remate: siguiente,
            latenciaSegundos: latencia
          });
          break;
        }
      }
    }
  }

  return transiciones;
}