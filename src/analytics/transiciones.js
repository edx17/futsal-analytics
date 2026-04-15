const clasificarZonaTransicion = (x) => {
  if (x == null) return 'Desconocida';
  if (x < 33) return 'Baja';
  if (x < 66) return 'Media';
  return 'Alta';
};

export function detectarTransiciones(eventos = [], ventanaSegundos = 15) {
  const transiciones = [];

  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i];

    // Ahora la transición puede nacer tanto de un robo físico como de leer un pase
    if (ev.accion === 'Recuperación' || ev.accion === 'Intercepción') {
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
          (siguiente.accion?.includes('Remate') || siguiente.accion === 'Gol')
        ) {
          
          const coordX = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
          const peligrosidad = latencia < 5 ? 'Alta' : (latencia < 10 ? 'Media' : 'Normal');

          transiciones.push({
            recuperacion: ev,
            remate: siguiente,
            latenciaSegundos: latencia,
            tipoOrigen: ev.accion,
            zonaOrigen: clasificarZonaTransicion(coordX),
            peligrosidad: peligrosidad
          });
          break;
        }
      }
    }
  }

  return transiciones;
}