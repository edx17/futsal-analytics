import { describe, it, expect } from 'vitest';
import { resultadoDePrueba, aplicarAjuste, aplicarAjustes, mediaDudosa, pendientesDePublicar } from '../god';
import { SOBRES, rarezaDeCarta, nombreDeCarta, catalogoDeCartas, ESPECIALES as RAREZAS_ESPECIALES } from '../sobres';
import { varianteForzada, VARIANTES } from '../aperturas';
import { ESPECIALES } from '../especialesCartas';
import { TODOS_LOS_TIPOS, TIPOS } from '../premios';
import { TIPOS_ESPECIALES } from '../especiales';

const k = (id, rareza, extra = {}) => ({ id, clave: `X|${id}`, rareza, tipo: 'BASE', activa: true, carta: { id, ovr: 70, apellido: id }, ...extra });

describe('god: sobre de prueba', () => {
  const catalogo = [k('a', 'bronce'), k('b', 'plata'), k('c', 'oro'), k('d', 'potm', { tipo: 'POTM' }), k('e', 'toty', { activa: false })];

  it('usa el sorteo de siempre sobre el catálogo ACTIVO y no gasta nada', () => {
    const r = resultadoDePrueba({ catalogo, tipo: 'diario', azar: () => 0.5 });
    expect(r.prueba).toBe(true);
    expect(r.cartas.length).toBe(SOBRES.diario.cartas);
    expect(r.cartas.every((c) => c.puntos === 0 && c.nueva)).toBe(true);
    expect(r.cartas.some((c) => c.catalogo_id === 'e')).toBe(false); // la de baja no sale
  });

  it('el mega de prueba trae sólo especiales activas', () => {
    const r = resultadoDePrueba({ catalogo, tipo: 'mega', azar: () => 0.1 });
    expect(r.cartas.map((c) => c.catalogo_id)).toEqual(['d']);
  });

  it('aplica la media corregida', () => {
    const r = resultadoDePrueba({ catalogo: [k('a', 'bronce')], tipo: 'diario', ajustes: new Map([['X|a', { ovr: 61, motivo: 'm' }]]), azar: () => 0 });
    expect(r.cartas[0].carta).toMatchObject({ ovr: 61, ovrCalculada: 70, ovrAjustada: true });
  });
});

describe('god: ajustes de media', () => {
  it('sin ajuste, la carta no cambia', () => {
    const c = { ovr: 80 };
    expect(aplicarAjuste(c, undefined)).toBe(c);
    expect(aplicarAjustes([c], new Map())).toEqual([c]);
  });
  it('con ajuste guarda la calculada', () => {
    expect(aplicarAjustes([{ clave: 'P', ovr: 99 }], new Map([['P', { ovr: 84 }]]))[0]).toMatchObject({ ovr: 84, ovrCalculada: 99 });
  });
  it('detecta medias que los datos no sostienen', () => {
    expect(mediaDudosa({ ovr: 99, pj: 1 })).toMatch(/1 partido/);
    expect(mediaDudosa({ ovr: 92, nota: 7.1, pj: 6 })).toMatch(/nota 7\.1/);
    expect(mediaDudosa({ ovr: 99, pj: 8, nota: 9 })).toMatch(/techo/);
    expect(mediaDudosa({ ovr: 86, pj: 10, nota: 7.7 })).toBeNull();
  });
});

describe('cartas especiales en los sobres', () => {
  it('cada tipo nuevo cae en una rareza que ya existe (pesos y V-Coins intactos)', () => {
    Object.values(ESPECIALES).forEach((e) => expect(RAREZAS_ESPECIALES.has(e.rareza)).toBe(true));
    expect(rarezaDeCarta({ premio: 'SGOL', ovr: 80 })).toBe('totw');
    expect(rarezaDeCarta({ premio: 'GOLR', ovr: 80 })).toBe('potm');
    expect(rarezaDeCarta({ premio: 'POTW', ovr: 80 })).toBe('potw');
  });
  it('se publican con lo que dibuja CartaEspecial', () => {
    const [fila] = catalogoDeCartas([], [{ id: '1', clave: 'SGOL|R1:t|1', premio: 'SGOL', ovr: 80, rec: 3, especial: { puesto: 2 }, titulo: 'T', pie: 'P' }]);
    expect(fila).toMatchObject({ tipo: 'SGOL', rareza: 'totw' });
    expect(fila.carta).toMatchObject({ rec: 3, especial: { puesto: 2 }, titulo: 'T', pie: 'P' });
  });
  it('se nombran por su premio (y su puesto en las series)', () => {
    expect(nombreDeCarta({ tipo: 'SGOL', rareza: 'totw', carta: { especial: { puesto: 3 } } })).toBe('GOLEADORES · 3º');
    expect(nombreDeCarta({ tipo: 'GOLM', rareza: 'totm', carta: {} })).toBe('GOL MES');
    expect(nombreDeCarta({ tipo: 'BASE', rareza: 'oro', carta: {} })).toBe('ORO');
  });
  it('la lista de tipos para filtros es la de siempre más las especiales', () => {
    expect(TODOS_LOS_TIPOS).toEqual([...TIPOS, ...TIPOS_ESPECIALES]);
  });
});

describe('god: forzar una escena', () => {
  it('una variante o un evento; null si no existe', () => {
    expect(varianteForzada('elite').id).toBe('elite');
    expect(varianteForzada('evento:demo').id).toBe('evento:demo');
    expect(varianteForzada('nada')).toBeNull();
    expect(varianteForzada(null)).toBeNull();
    Object.keys(VARIANTES).forEach((id) => expect(varianteForzada(id)).toBeTruthy());
  });
});

describe('god: premios guardados sin publicar', () => {
  const historial = [{ tipo: 'SGOL', periodo: 'R1:t', fechaRef: '2026-07-20', contexto: { torneo: 'T', partidos: 17 },
    cartas: [{ id: '1', apellido: 'A', nota: 7, pj: 10, goles: 5, puesto: 1, valor: 5 }, { id: '2', apellido: 'B', nota: 6.5, pj: 9, goles: 3, puesto: 2, valor: 3 }] }];
  const catalogo = [{ clave: 'BASE|1', tipo: 'BASE', jugador_id: '1', carta: { id: '1', apellido: 'A', atributos: [['TIR', 80]] } },
    { clave: 'SGOL|R1:t|2', tipo: 'SGOL', jugador_id: '2', carta: {} }];
  it('devuelve sólo las que faltan, listas para publicar y con los atributos de la base', () => {
    const p = pendientesDePublicar(historial, catalogo, new Map([['SGOL|R1:t|1', 'https://f/1.png']]));
    expect(p.map((f) => f.clave)).toEqual(['SGOL|R1:t|1']);
    expect(p[0]).toMatchObject({ tipo: 'SGOL', rareza: 'totw' });
    expect(p[0].carta).toMatchObject({ foto: 'https://f/1.png', atributos: [['TIR', 80]], especial: { puesto: 1 } });
  });
});
