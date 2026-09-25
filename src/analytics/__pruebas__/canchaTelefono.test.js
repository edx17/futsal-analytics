import { describe, it, expect } from 'vitest';
import { toqueEnCancha, posicionEnCancha, esPantallaTelefono } from '../canchaTelefono';

describe('cancha del celular', () => {
  it('acostada: igual que la PC', () => {
    expect(toqueEnCancha(300, 50, 400, 200, false)).toEqual({ x: 75, y: 25 });
  });
  it('parada: arriba es el arco de ataque (x=100) y la izquierda la banda de arriba (y=0)', () => {
    // cancha 200 de ancho x 400 de alto
    expect(toqueEnCancha(100, 0, 200, 400, true)).toEqual({ x: 100, y: 50 }); // arco de arriba
    expect(toqueEnCancha(100, 400, 200, 400, true)).toEqual({ x: 0, y: 50 });  // arco de abajo
    expect(toqueEnCancha(0, 200, 200, 400, true)).toEqual({ x: 50, y: 0 });    // banda izquierda
    expect(toqueEnCancha(200, 200, 200, 400, true)).toEqual({ x: 50, y: 100 });
  });
  it('lo que se toca se dibuja en el mismo lugar', () => {
    for (const vertical of [false, true]) {
      const [W, H] = vertical ? [200, 400] : [400, 200];
      const { x, y } = toqueEnCancha(37, 91, W, H, vertical);
      const { left, top } = posicionEnCancha(x, y, vertical);
      expect(left).toBeCloseTo((37 / W) * 100);
      expect(top).toBeCloseTo((91 / H) * 100);
    }
  });
  it('fuera de la cancha se acota', () => {
    expect(toqueEnCancha(-10, 999, 200, 400, true)).toEqual({ x: 0, y: 0 });
  });
  it('teléfono vs tablet', () => {
    expect(esPantallaTelefono(390, 844)).toBe(true);
    expect(esPantallaTelefono(844, 390)).toBe(true);
    expect(esPantallaTelefono(768, 1024)).toBe(false);
    expect(esPantallaTelefono(1440, 900)).toBe(false);
  });
});
