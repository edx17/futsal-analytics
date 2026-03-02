// src/analytics/xg.js

export function calcularXGEvento(ev, esTransicion = false) {
  if (ev.zona_x == null || ev.zona_y == null) return 0;

  const dx = 100 - ev.zona_x; // Distancia a la línea de meta rival
  const dy = Math.abs(50 - ev.zona_y); // Desviación respecto al eje central
  const distancia = Math.sqrt(dx * dx + dy * dy);

  // 1. Cálculo del xG Base por distancia
  let xgBase = 0;
  if (distancia < 15) xgBase = 0.35; 
  else if (distancia < 25) xgBase = 0.15;
  else if (distancia < 40) xgBase = 0.07;
  else xgBase = 0.02;

  // 2. Penalización por Ángulo de Tiro
  // Math.atan2(dx, dy) nos da el ángulo en radianes. 
  // Frente al arco (dy=0), el factor es 1. Cerca de la línea de banda, el factor se acerca a 0.
  const anguloRadianes = Math.atan2(dx, dy);
  const factorAngulo = Math.sin(anguloRadianes);

  let xgFinal = xgBase * factorAngulo;

  // 3. Multiplicador Táctico: Fase de Transición
  if (esTransicion) {
    xgFinal *= 1.45; // Incremento del 45% en la probabilidad por defensa desorganizada
  }

  // Tope máximo lógico para evitar valores irreales
  return Math.min(xgFinal, 0.99);
}

export function calcularXGPartido(eventos = [], transiciones = []) {
  // Extraemos los IDs de los remates que ocurrieron en transición
  const idsRematesTransicion = transiciones.map(t => t.remate.id);

  return eventos
    .filter(e => e.accion?.includes('Remate') || e.accion === 'Gol')
    .reduce((acc, ev) => {
      const enTransicion = idsRematesTransicion.includes(ev.id);
      return acc + calcularXGEvento(ev, enTransicion);
    }, 0);
}