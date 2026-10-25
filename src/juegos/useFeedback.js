import { useCallback, useEffect, useState } from 'react';
import { leerPreferencias, guardarPreferencias, alCambiarPreferencias, sonar, vibrar, puedeVibrar } from './feedback';

/**
 * Sonido y vibración de los juegos.
 *   const { sound, vibrate, feedback, prefs, setPrefs } = useFeedback();
 *   feedback('gol')  → suena y vibra
 * Ids: click, elegir, gol, especial, victoria, derrota, premio.
 */
export default function useFeedback() {
  const [prefs, setEstado] = useState(leerPreferencias);
  useEffect(() => alCambiarPreferencias(setEstado), []);

  const sound = useCallback((id) => sonar(id, prefs), [prefs]);
  const vibrate = useCallback((patron) => vibrar(patron, prefs), [prefs]);
  const feedback = useCallback((id) => { sonar(id, prefs); vibrar(id, prefs); }, [prefs]);
  const setPrefs = useCallback((cambio) => guardarPreferencias({ ...leerPreferencias(), ...cambio }), []);

  return { sound, vibrate, feedback, prefs, setPrefs, puedeVibrar: puedeVibrar() };
}
