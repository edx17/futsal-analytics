import { describe, it, expect } from 'vitest';
import { imagenDeSobre, repartirSobres, traeEspecial, filtrarAlbum, contarAlbum } from '../sobresVista';

describe('sobres: disponibles y bloqueados', () => {
  const e = {
    es_staff: false, racha: 3, puntos: 20, costo_puntos: 50, wellness_hecho: true,
    disponibles: { puntos: false, diario: true, wellness: false, racha: false, mega: false },
    eventos: [{ id: 'x', disponible: false, abiertos_hoy: 1, por_dia: 1 }],
  };

  it('reparte en el orden de la pantalla y marca los que vuelven mañana', () => {
    const r = repartirSobres(e);
    expect(r.disponibles.map((s) => s.tipo)).toEqual(['diario']);
    expect(r.bloqueados.map((s) => [s.tipo, s.manana])).toEqual([
      ['wellness', true], ['racha', true], ['puntos', false], ['mega', false], ['evento', true],
    ]);
  });

  it('el staff no ve el wellness; los del V-Draft sólo si hay', () => {
    const r = repartirSobres({ ...e, es_staff: true, sobres_premio: 2, disponibles: { premio: true } });
    expect(r.disponibles.map((s) => s.tipo)).toEqual(['premio']);
    expect(r.bloqueados.some((s) => s.tipo === 'wellness')).toBe(false);
  });

  it('un sobre suspendido no tiene cuenta regresiva', () => {
    const r = repartirSobres({ ...e, suspendidos: ['diario'], disponibles: {} });
    expect(r.bloqueados.find((s) => s.tipo === 'diario').manana).toBe(false);
  });

  it('sin estado no hay sobres', () => {
    expect(repartirSobres(null)).toEqual({ disponibles: [], bloqueados: [] });
  });
});

describe('sobres: la imagen', () => {
  it('cada tipo con la suya; eventos y colores del club, el neutro teñido', () => {
    expect(imagenDeSobre('diario')).toEqual({ src: '/juegos/sobres/diario.webp', tinte: null });
    expect(imagenDeSobre('diario', { principal: '#123456' }).tinte).toBe('#123456');
    expect(imagenDeSobre('evento', { luz: '#ff0000' })).toEqual({ src: '/juegos/sobres/neutro.webp', tinte: '#ff0000' });
  });
});

describe('sobres: el álbum', () => {
  const album = [
    { catalogo_id: 1, rareza: 'bronce', rol: 'ALA', tengo: true, carta: { ovr: 60 } },
    { catalogo_id: 2, rareza: 'toty', rol: 'ARQ', tengo: false },
    { catalogo_id: 3, rareza: 'oro', rol: 'ALA', tengo: true, carta: { ovr: 80 } },
    { catalogo_id: 4, rareza: 'oro', rol: 'PIV', tengo: false },
  ];

  it('las que tenés primero, de la más rara a la más común', () => {
    expect(filtrarAlbum(album).map((c) => c.catalogo_id)).toEqual([3, 1, 2, 4]);
  });

  it('filtra por rareza, posición y las que faltan', () => {
    expect(filtrarAlbum(album, { rareza: 'oro' }).map((c) => c.catalogo_id)).toEqual([3, 4]);
    expect(filtrarAlbum(album, { rol: 'ALA' }).map((c) => c.catalogo_id)).toEqual([3, 1]);
    expect(filtrarAlbum(album, { soloFaltan: true }).map((c) => c.catalogo_id)).toEqual([2, 4]);
  });

  it('cuenta X / Total y por rareza', () => {
    const n = contarAlbum(album);
    expect(n.tengo).toBe(2);
    expect(n.total).toBe(4);
    expect(n.porRareza.oro).toEqual({ tengo: 1, total: 2 });
  });

  it('avisa si el sobre trae especiales', () => {
    expect(traeEspecial({ cartas: [{ rareza: 'oro' }, { rareza: 'totw' }] })).toBe(true);
    expect(traeEspecial({ cartas: [{ rareza: 'plata' }] })).toBe(false);
  });
});
