export function calcularXGEvento(ev) {
  if (ev.zona_x == null) return 0;

  const dx = 100 - ev.zona_x;
  const dy = Math.abs(50 - ev.zona_y);
  const distancia = Math.sqrt(dx * dx + dy * dy);

  // El xG en Futsal es más alto que en fútbol 11 por dimensiones
  if (distancia < 15) return 0.35; 
  if (distancia < 25) return 0.15;
  if (distancia < 40) return 0.07;
  return 0.02;
}

export function calcularXGPartido(eventos = []) {
  return eventos
    .filter(e => e.accion?.includes('Remate') || e.accion === 'Gol')
    .reduce((acc, ev) => acc + calcularXGEvento(ev), 0);
}