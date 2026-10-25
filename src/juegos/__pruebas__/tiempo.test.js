import { describe, it, expect } from 'vitest';
import { hoyAR, msHastaMedianocheAR, formatoCuenta } from '../tiempo';
import { accesosJuegos } from '../accesos';

describe('juegos: el día de Argentina', () => {
  it('a las 02:00 UTC todavía es el día anterior en Argentina', () => {
    expect(hoyAR(Date.UTC(2026, 9, 26, 2, 0))).toBe('2026-10-25');
    expect(hoyAR(Date.UTC(2026, 9, 26, 3, 0))).toBe('2026-10-26');
  });

  it('cuánto falta para la medianoche de Argentina', () => {
    expect(msHastaMedianocheAR(Date.UTC(2026, 9, 26, 2, 0))).toBe(3600 * 1000);
    expect(msHastaMedianocheAR(Date.UTC(2026, 9, 26, 3, 0))).toBe(24 * 3600 * 1000);
  });

  it('formatea la cuenta regresiva', () => {
    expect(formatoCuenta(3725000)).toBe('01:02:05');
    expect(formatoCuenta(-5)).toBe('00:00:00');
    expect(formatoCuenta((2 * 86400 + 3 * 3600) * 1000)).toBe('2d 03:00:00');
  });
});

describe('juegos: la barra de abajo', () => {
  it('jugadores y staff: Juegos, Sobres, V-Draft y Penales; en el kiosco, con /kiosco', () => {
    expect(accesosJuegos().map((a) => a[2])).toEqual(['/juegos', '/sobres', '/vdraft', '/penales']);
    expect(accesosJuegos({ kiosco: true }).map((a) => a[2])).toEqual(['/kiosco/juegos', '/kiosco/sobres', '/kiosco/vdraft', '/kiosco/penales']);
  });
  it('superusuario: Modo GOD y sin V-Draft', () => {
    expect(accesosJuegos({ esSuper: true }).map((a) => a[1])).toEqual(['JUEGOS', 'GOD', 'MYSQUAD', 'PENALES']);
  });
});
