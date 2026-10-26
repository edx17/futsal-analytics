import { useEffect, useRef, useState } from 'react';

/**
 * Un número que cuenta hasta su valor nuevo (química, fuerza, marcador…).
 *   const q = useCuenta(quimica);       // 0 → 60 → 80, de a poco
 * Con "reducir movimiento" o un valor que no es número, salta directo.
 */
export default function useCuenta(valor, ms = 700) {
  const objetivo = Number(valor);
  const [mostrado, setMostrado] = useState(Number.isFinite(objetivo) ? objetivo : 0);
  const desde = useRef(mostrado);

  useEffect(() => {
    if (!Number.isFinite(objetivo)) return undefined;
    const quieto = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const inicio = desde.current;
    if (quieto || inicio === objetivo) {
      desde.current = objetivo;
      const id = requestAnimationFrame(() => setMostrado(objetivo));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let id;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = inicio + (objetivo - inicio) * (1 - (1 - k) ** 3);
      desde.current = v;
      setMostrado(v);
      if (k < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [objetivo, ms]);

  return Number.isFinite(objetivo) ? mostrado : valor;
}
