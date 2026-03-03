// src/analytics/xg.js

export function calcularXGEvento(ev, esTransicion = false, contextoAvanzado = {}) {
  if (ev.zona_x == null || ev.zona_y == null) return 0;

  // Variables futuras (Si no se envían, toman falsos por defecto)
  const {
    arqueroAdelantado = false, // Portero-jugador o arco vacío
    bajoPresion = false,       // Tiro punteado o con bloqueo inminente
    tipoRemate = 'normal'      // 'punteo' aumenta la probabilidad en futsal
  } = contextoAvanzado;

  // Transformación a escala de Futsal (Cancha de 40x20m aprox)
  // X: 0 a 100% -> 0 a 40m. Y: 0 a 100% -> 0 a 20m.
  const dxMetros = (100 - ev.zona_x) * 0.4; // Distancia a la línea de meta
  const dyMetros = Math.abs(50 - ev.zona_y) * 0.2; // Desviación del eje central
  const distMetros = Math.sqrt(Math.pow(dxMetros, 2) + Math.pow(dyMetros, 2));

  // 1. Probabilidad Base por Distancia (Curva logarítmica adaptada a Futsal)
  let xgBase = 0;
  if (distMetros < 4) xgBase = 0.45;       // Zona de pivote / 2do palo
  else if (distMetros < 8) xgBase = 0.20;  // Zona de penal / media distancia
  else if (distMetros < 12) xgBase = 0.08; // Tiro libre directo / lejos
  else if (distMetros < 20) xgBase = 0.02; // Tiro desde propia cancha
  else xgBase = 0.005;

  // 2. Penalización Geométrica por Ángulo (Severa en Futsal)
  // Frente al arco dy=0 -> factor=1. 
  const anguloRadianes = Math.atan2(dxMetros, dyMetros);
  const factorAngulo = Math.sin(anguloRadianes);
  // Elevamos al cuadrado para castigar drásticamente los tiros sin ángulo (cerca de la banda)
  let xgFinal = xgBase * Math.pow(factorAngulo, 2); 

  // 3. Multiplicadores de Contexto Táctico
  if (esTransicion) xgFinal *= 1.45; // Superioridad numérica o defensa corriendo hacia atrás
  if (tipoRemate === 'punteo') xgFinal *= 1.15; // El punteo acorta tiempo de reacción del arquero
  if (bajoPresion) xgFinal *= 0.60; // Alta probabilidad de bloqueo por proximidad defensiva
  
  // Condición crítica: Arquero adelantado dispara el xG exponencialmente
  if (arqueroAdelantado) xgFinal = Math.min(0.95, (xgFinal === 0 ? 0.2 : xgFinal * 5));

  // Limitador matemático: Nunca puede ser superior a 99%
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