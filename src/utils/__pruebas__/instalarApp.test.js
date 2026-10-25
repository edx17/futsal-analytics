import { describe, it, expect, beforeEach } from 'vitest';
import { linkAlJuego, recordarDestino, tomarDestino, esIphone, esCelular } from '../instalarApp';

describe('el juego en el celular', () => {
  beforeEach(() => { try { sessionStorage.clear(); } catch { /* sin storage */ } });

  it('el link lleva al kiosco del club y después al juego', () => {
    const u = new URL(linkAlJuego('https://app.ejemplo.com', 'club-1', 'vdraft'));
    expect(u.pathname).toBe('/kiosco');
    expect(u.searchParams.get('club')).toBe('club-1');
    expect(u.searchParams.get('ir')).toBe('vdraft');
    expect(new URL(linkAlJuego('https://app.ejemplo.com', 'c', 'cualquiera')).searchParams.get('ir')).toBeNull();
  });

  it('el destino se usa una sola vez y sólo si es del juego', () => {
    if (typeof sessionStorage === 'undefined') return;
    recordarDestino('sobres');
    expect(tomarDestino()).toBe('/kiosco/sobres');
    expect(tomarDestino()).toBeNull();
    recordarDestino('../admin');
    expect(tomarDestino()).toBeNull();
  });

  it('reconoce iPhone y celulares', () => {
    expect(esIphone('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(esCelular('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')).toBe(true);
    expect(esCelular('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});
