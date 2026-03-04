export function calcularXGEvento(ev, esTransicion = false, contextoAvanzado = {}) {
  // Si no hay coordenadas, el xG es 0 (ej: goles en contra sin taggear zona)
  if (ev.zona_x == null || ev.zona_y == null) return 0;

  const {
    arqueroAdelantado = false,
    bajoPresion = false,
    tipoRemate = 'normal'
  } = contextoAvanzado;

  // Escala Futsal: 40m largo x 20m ancho
  const dxMetros = (100 - ev.zona_x) * 0.4; 
  const dyMetros = Math.abs(50 - ev.zona_y) * 0.2; 
  const distMetros = Math.sqrt(Math.pow(dxMetros, 2) + Math.pow(dyMetros, 2));

  // 1. Curva de Distancia
  let xgBase = 0;
  if (distMetros < 4) xgBase = 0.45;       // Pivoteo
  else if (distMetros < 8) xgBase = 0.20;  // Media distancia
  else if (distMetros < 12) xgBase = 0.08; // Lejos / Tiro libre directo
  else if (distMetros < 20) xgBase = 0.02; // Propia cancha
  else xgBase = 0.005;

  // 2. Penalización por Ángulo
  const anguloRadianes = Math.atan2(dxMetros, dyMetros);
  const factorAngulo = Math.sin(anguloRadianes);
  let xgFinal = xgBase * Math.pow(factorAngulo, 2); 

  // 3. Contexto Táctico
  if (esTransicion) xgFinal *= 1.45; 
  if (tipoRemate === 'punteo') xgFinal *= 1.15; 
  if (bajoPresion) xgFinal *= 0.60; 
  
  if (arqueroAdelantado) xgFinal = Math.min(0.95, (xgFinal === 0 ? 0.2 : xgFinal * 5));

  return Math.min(0.99, xgFinal);
}

export function calcularXGPartido(eventosPropio) {
  if (!eventosPropio || !eventosPropio.length) return 0;
  return eventosPropio.reduce((acc, ev) => {
    if (ev.accion?.includes('Remate') || ev.accion === 'Gol') {
      return acc + calcularXGEvento(ev);
    }
    return acc;
  }, 0);
}