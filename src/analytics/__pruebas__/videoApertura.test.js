import { describe, it, expect } from 'vitest';
import { elegirFuente } from '../../utils/videoApertura';
import { VIDEOS } from '../aperturas';

const navegador = (webm, mp4) => ({ canPlayType: (t) => (t.startsWith('video/webm') ? webm : t.startsWith('video/mp4') ? mp4 : '') });

describe('videos de apertura: qué formato se baja (uno solo)', () => {
  const fuentes = VIDEOS.vdraft.fuentes;
  it('WebM (VP9, más liviano) donde se reproduce seguro', () => {
    expect(elegirFuente(fuentes, navegador('probably', 'probably')).tipo).toBe('video/webm');
  });
  it('MP4 (H.264) si el WebM no es seguro', () => {
    expect(elegirFuente(fuentes, navegador('maybe', 'probably')).tipo).toBe('video/mp4');
    expect(elegirFuente(fuentes, navegador('', 'maybe')).tipo).toBe('video/mp4');
  });
  it('sin forma de preguntar, igual devuelve uno', () => {
    expect(elegirFuente(fuentes, null)).toBeTruthy();
  });
  it('los archivos de V-Draft existen en public/cine', async () => {
    const fs = await import('node:fs');
    fuentes.forEach((f) => expect(fs.existsSync(`public${f.src}`)).toBe(true));
    expect(fs.existsSync(`public${VIDEOS.vdraft.poster}`)).toBe(true);
  });
});
