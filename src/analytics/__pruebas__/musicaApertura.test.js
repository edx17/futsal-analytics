import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/* Un Web Audio de mentira: alcanza para ver que la música arranca en el
   segundo del video, se corta con fundido y nunca rompe la apertura. */
const iniciados = [];
const parados = [];
class ContextoFalso {
  constructor() { this.currentTime = 10; this.state = 'running'; this.destination = {}; this.sampleRate = 48000; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createBufferSource() {
    return { connect() {}, start: (cuando, desde) => iniciados.push(desde), stop: (t) => parados.push(t) };
  }
  resume() { return Promise.resolve(); }
  decodeAudioData(datos, ok) { const b = { duration: datos.byteLength }; ok(b); return Promise.resolve(b); }
}

let sonido;
beforeAll(async () => {
  vi.stubGlobal('window', { AudioContext: ContextoFalso, OfflineAudioContext: ContextoFalso });
  vi.stubGlobal('fetch', vi.fn(async (url) => (url.includes('falta')
    ? { ok: false }
    : { ok: true, arrayBuffer: async () => new ArrayBuffer(9) })));
  sonido = await import('../../utils/sonidoApertura');
});
afterAll(() => vi.unstubAllGlobals());

describe('música de las aperturas', () => {
  it('se baja una vez y queda lista', async () => {
    await sonido.cargarMusica('/cine/musica/x.m4a');
    await sonido.cargarMusica('/cine/musica/x.m4a');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sonido.musicaLista('/cine/musica/x.m4a')).toBe(true);
  });

  it('si no se pudo bajar, no suena (y la apertura usa los sonidos sintetizados)', async () => {
    expect(await sonido.cargarMusica('/cine/musica/falta.m4a')).toBeNull();
    sonido.prepararAudio(true);
    expect(sonido.tocarMusica('/cine/musica/falta.m4a', 0)).toBe(false);
  });

  it('arranca en el segundo en el que está el video y se corta con fundido', () => {
    sonido.prepararAudio(true);
    expect(sonido.tocarMusica('/cine/musica/x.m4a', 1.25)).toBe(true);
    expect(iniciados.at(-1)).toBe(1.25);
    sonido.pararMusica(0.3);
    expect(parados.at(-1)).toBeCloseTo(10.32);
  });

  it('con el sonido apagado no suena', () => {
    sonido.prepararAudio(false);
    expect(sonido.tocarMusica('/cine/musica/x.m4a', 0)).toBe(false);
  });
});
