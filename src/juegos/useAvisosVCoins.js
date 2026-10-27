import { useEffect, useState } from 'react';
import { avisosJuegos } from '../utils/juegos';

/* Los eventos de V-Coins (en curso y el próximo), pedidos una vez cada 5
   minutos para todos los Juegos: el cartel de arriba y los premios de cada modo
   (que se muestran ya multiplicados) usan la misma respuesta. */

const VIGENCIA_MS = 5 * 60 * 1000;
let cache = null;

export function cargarAvisos(forzar = false) {
  if (forzar || !cache || Date.now() - cache.t > VIGENCIA_MS) {
    cache = { t: Date.now(), p: avisosJuegos().then((r) => r.data || null).catch(() => null) };
  }
  return cache.p;
}

/** `vuelta`: al cambiar (>0), se pide de nuevo aunque no haya vencido (p. ej. al terminar la cuenta regresiva). */
export default function useAvisosVCoins(activo = true, vuelta = 0) {
  const [avisos, setAvisos] = useState(null);
  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    cargarAvisos(vuelta > 0).then((a) => { if (vivo) setAvisos(a); });
    return () => { vivo = false; };
  }, [activo, vuelta]);
  return avisos;
}
