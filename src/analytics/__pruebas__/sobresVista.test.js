import { describe, it, expect } from 'vitest';
import { completarAtributos, pendientesDePublicar } from '../god';
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
    // el evento de Halloween tiene su sobre
    expect(imagenDeSobre('evento', { luz: '#ff8a1f' }, 'evento_halloween')).toEqual({ src: '/juegos/sobres/halloween.webp', tinte: null });
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

describe('catálogo: cartas sin atributos', () => {
  const atr = [['TIR', 90], ['PAS', 80]];
  const catalogo = [
    { clave: 'TOTY|2026|41', jugador_id: '41', tipo: 'TOTY', rareza: 'toty', carta: { id: '41', apellido: 'X', atributos: [] } },
    { clave: 'TOTW|1|7', jugador_id: '7', tipo: 'TOTW', rareza: 'totw', carta: { id: '7', apellido: 'Y', atributos: atr } },
    { clave: 'HERO|1|99', jugador_id: '99', tipo: 'HERO', rareza: 'toty', carta: { id: '99', apellido: 'Z' } },
  ];
  const calculadas = [{ id: 41, atributos: atr, pie: 'Zurdo' }, { id: 99, atributos: atr }, { id: 7, atributos: [['TIR', 1]] }];

  it('completa sólo las que no tienen, con la carta calculada del jugador (no los Héroes)', () => {
    const r = completarAtributos(catalogo, calculadas);
    expect(r.map((f) => f.clave)).toEqual(['TOTY|2026|41']);
    expect(r[0].carta.atributos).toEqual(atr);
    expect(r[0].carta.pie).toBe('Zurdo');
    expect(r[0].carta.apellido).toBe('X');
  });

  it('sin carta calculada con atributos, no hay nada que completar', () => {
    expect(completarAtributos(catalogo, [{ id: 41, atributos: [], enEvaluacion: true }])).toEqual([]);
  });

  it('sin historial no hay pendientes', () => {
    expect(pendientesDePublicar([], catalogo, new Map(), calculadas)).toEqual([]);
  });
});
