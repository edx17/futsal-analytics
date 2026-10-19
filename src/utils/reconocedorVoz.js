/* ══════════════════════════════════════════════════════════════════════════
   RECONOCEDOR DE VOZ (el del navegador)

   Usa la Web Speech API: Chrome en Android y en la compu (necesita conexión),
   Safari en iPhone desde iOS 14.5 (más limitado). Firefox no la tiene.

   Push-to-talk: se arranca con el toque en la cancha (tiene que ser en el
   mismo gesto, si no el navegador no deja usar el micrófono) y corta solo
   cuando dejás de hablar, o antes con detener().
   ══════════════════════════════════════════════════════════════════════════ */

const Clase = () => (typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

export const hayReconocimientoDeVoz = () => !!Clase();

const MENSAJES = {
  'not-allowed': 'No hay permiso para usar el micrófono. Habilitalo en el candado de la barra de direcciones.',
  'service-not-allowed': 'El navegador no deja usar el reconocimiento de voz. Probá con Chrome.',
  'no-speech': 'No se escuchó nada. Tocá la cancha y hablá apenas aparece el micrófono rojo.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'Sin conexión: el reconocimiento de voz necesita internet.',
};

/**
 * Empieza a escuchar.
 * @param {{ onParcial?: (texto) => void, onFinal: (alternativas: string[]) => void, onError: (mensaje) => void }} cb
 * @returns {{ detener: () => void, cancelar: () => void }}
 */
export function escuchar({ onParcial, onFinal, onError }) {
  const SR = Clase();
  if (!SR) {
    onError('Este navegador no reconoce voz. Probá con Chrome.');
    return { detener() {}, cancelar() {} };
  }

  const rec = new SR();
  rec.lang = 'es-AR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 4;

  let ultimoParcial = '';
  let terminado = false;
  let cancelado = false;

  rec.onresult = (e) => {
    const res = e.results[e.results.length - 1];
    if (!res) return;
    if (res.isFinal) {
      terminado = true;
      onFinal(Array.from(res).map((a) => a.transcript).filter(Boolean));
    } else {
      ultimoParcial = Array.from(e.results).map((r) => r[0]?.transcript || '').join(' ').trim();
      onParcial?.(ultimoParcial);
    }
  };
  rec.onerror = (e) => {
    if (cancelado || e.error === 'aborted') return;
    terminado = true;
    onError(MENSAJES[e.error] || `No se pudo escuchar (${e.error}).`);
  };
  rec.onend = () => {
    if (terminado || cancelado) return;
    terminado = true;
    // Cortó sin un resultado final: se usa lo último que se oyó.
    if (ultimoParcial) onFinal([ultimoParcial]);
    else onError(MENSAJES['no-speech']);
  };

  try {
    rec.start();
  } catch {
    terminado = true;
    onError('No se pudo encender el micrófono. Volvé a tocar la cancha.');
  }

  return {
    detener() { try { rec.stop(); } catch { /* ya terminó */ } },
    cancelar() { cancelado = true; try { rec.abort(); } catch { /* ya terminó */ } },
  };
}
