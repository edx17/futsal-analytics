import { describe, it, expect } from 'vitest';
import { minutoVideo, etiquetaVinculo, ordenarNotas, filtrarNotas, cuando } from '../notas';

describe('anotador', () => {
  it('el minuto del video', () => {
    expect(minutoVideo(83)).toBe('1:23');
    expect(minutoVideo(3725)).toBe('1:02:05');
    expect(minutoVideo(-4)).toBe('0:00');
  });
  it('a qué está vinculada', () => {
    expect(etiquetaVinculo({ vinculo_tipo: 'rival', vinculo_nombre: 'Dep. Merlo' })).toBe('Rival · Dep. Merlo');
    expect(etiquetaVinculo({ vinculo_tipo: 'general' })).toBe('General');
    expect(etiquetaVinculo({ tipo: 'sesion', nombre: 'Martes 12/11' })).toBe('Sesión · Martes 12/11');
  });
  it('fijadas primero y, en un video, por minuto', () => {
    const n = [
      { id: 'a', video_seg: 300, created_at: '2026-11-10' }, { id: 'b', video_seg: 30, created_at: '2026-11-11' },
      { id: 'c', fijada: true, video_seg: 900, created_at: '2026-11-09' },
    ];
    expect(ordenarNotas(n, { porMinuto: true }).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(ordenarNotas(n).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('filtra por tipo, texto y mías', () => {
    const n = [{ autor: 'yo', vinculo_tipo: 'rival', texto: 'Presionan alto', vinculo_nombre: 'Merlo' },
      { autor: 'otro', vinculo_tipo: 'video', texto: 'Salida por izquierda' }];
    expect(filtrarNotas(n, { tipo: 'rival' })).toHaveLength(1);
    expect(filtrarNotas(n, { texto: 'merlo' })).toHaveLength(1);
    expect(filtrarNotas(n, { soloMias: true, yo: 'yo' })).toHaveLength(1);
  });
  it('cuándo', () => {
    const ahora = Date.parse('2026-11-12T12:00:00Z');
    expect(cuando('2026-11-12T11:55:00Z', ahora)).toBe('hace 5 min');
    expect(cuando('2026-11-12T09:00:00Z', ahora)).toBe('hace 3 h');
  });
});
