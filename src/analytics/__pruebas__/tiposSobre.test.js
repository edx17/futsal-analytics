import { describe, it, expect } from 'vitest';
import { normalizarTipo, reglasDeTipo, sobreDelClub, tipoParaEditar } from '../tiposSobre';
import { sortearSobre, probabilidades, SOBRES } from '../sobres';
import { resultadoDePrueba } from '../god';
import { varianteDeApertura, conEscena, VARIANTES } from '../aperturas';

const catalogo = [
  ...['bronce', 'plata', 'oro'].flatMap((r) => [1, 2, 3, 4].map((i) => ({ id: `${r}${i}`, clave: `BASE|${r}${i}`, rareza: r, tipo: 'BASE', carta: {} }))),
  { id: 't1', clave: 'TOTW|1|1', rareza: 'totw', tipo: 'TOTW', carta: {} },
  { id: 'g1', clave: 'SGOL|R1|1', rareza: 'totw', tipo: 'SGOL', carta: {}, exclusiva_evento: true },
];
const azar = (() => { let i = 0; return () => ((i++ * 0.37) % 1); })();

describe('normalizarTipo', () => {
  it('guarda sólo lo que cambia, dentro de rango', () => {
    expect(normalizarTipo({ nombre: 'SOBRE DIARIO', cartas: 3, rarezas: [] }, 'diario')).toEqual({});
    expect(normalizarTipo({ nombre: ' DIARIO DE ORO ', cartas: 99, rarezas: ['oro', 'nada'], pesos: { oro: 15, plata: -3 } }, 'diario'))
      .toEqual({ nombre: 'DIARIO DE ORO', cartas: 10, rarezas: ['oro'], pesos: { plata: 0 } });
    expect(normalizarTipo({ costo: 20 }, 'diario')).toEqual({});
    expect(normalizarTipo({ costo: 20 }, 'puntos')).toEqual({ costo: 20 });
    expect(normalizarTipo({ costo: 50 }, 'puntos')).toEqual({});
  });

  it('la escena: sólo colores válidos y lo que se puso', () => {
    expect(normalizarTipo({ escena: { video: 'elite', colores: { luz: '#ff0000', fondo: 'rojo' }, particulas: null } }, 'diario'))
      .toEqual({ escena: { video: 'elite', colores: { luz: '#ff0000' } } });
  });
});

describe('reglasDeTipo y sobreDelClub', () => {
  it('lo de siempre si no se tocó nada', () => {
    expect(reglasDeTipo('mega', {})).toMatchObject({ cartas: 10, costo: 500, rarezas: ['totw', 'potw', 'totm', 'potm', 'toty'], incluidas: [] });
    expect(reglasDeTipo('puntos', {}).costo).toBe(50);
    expect(sobreDelClub('diario', null)).toBe(SOBRES.diario);
  });

  it('el sobre con lo del club (de la base)', () => {
    const s = sobreDelClub('mega', { nombre: 'MEGA GOLEADORES', cartas: 5, costo: 300, rarezas: ['totw'], escena: { colores: { luz: '#f00' } } });
    expect(s).toMatchObject({ id: 'mega', nombre: 'MEGA GOLEADORES', cartas: 5, costo: 300, soloEspeciales: true });
    expect(s.ayuda).toContain('300');
    expect(sobreDelClub('diario', { cartas: 3, rarezas: ['bronce', 'oro'] }).soloEspeciales).toBe(false);
  });

  it('para editar: completo, con los pesos de siempre', () => {
    const t = tipoParaEditar('diario', { pesos: { oro: 40 } });
    expect(t.nombre).toBe('SOBRE DIARIO');
    expect(t.pesos).toMatchObject({ oro: 40, bronce: 42 });
    expect(t.rarezas).toHaveLength(8);
  });
});

describe('el sorteo con las reglas del club', () => {
  it('sólo las rarezas elegidas', () => {
    const { cartas } = sortearSobre({ catalogo, cantidad: 3, azar, rarezas: ['oro'] });
    expect(cartas.map((c) => c.rareza)).toEqual(['oro', 'oro', 'oro']);
  });

  it('peso 0 = no sale', () => {
    const { cartas } = sortearSobre({ catalogo, cantidad: 8, azar, pesos: { bronce: 0, plata: 0 } });
    expect(cartas.every((c) => !['bronce', 'plata'].includes(c.rareza))).toBe(true);
  });

  it('con lista, sólo esas', () => {
    const { cartas } = sortearSobre({ catalogo, cantidad: 5, azar, incluidas: ['BASE|oro1', 'TOTW|1|1'] });
    expect(cartas.map((c) => c.clave).sort()).toEqual(['BASE|oro1', 'TOTW|1|1']);
  });

  it('las probabilidades con pesos propios', () => {
    const p = probabilidades(catalogo, { rarezas: ['plata', 'oro'], pesos: { plata: 10, oro: 30 } });
    expect(p.map((r) => [r.id, r.porCiento])).toEqual([['plata', 25], ['oro', 75]]);
  });

  it('la prueba del Modo GOD usa la config y saltea las exclusivas de evento', () => {
    const r = resultadoDePrueba({ catalogo, tipo: 'mega', config: { cartas: 4 }, azar });
    expect(r.cartas.map((c) => c.catalogo_id)).toEqual(['t1']);
    const conLista = resultadoDePrueba({ catalogo, tipo: 'diario', config: { incluidas: ['SGOL|R1|1'] }, azar });
    expect(conLista.cartas.map((c) => c.catalogo_id)).toEqual(['g1']);
    expect(resultadoDePrueba({ catalogo, tipo: 'diario', config: { cartas: 5 }, azar }).cartas).toHaveLength(5);
  });
});

describe('la escena de un sobre', () => {
  it('cambia video, título y colores sobre la de siempre', () => {
    const v = conEscena(VARIANTES.diario, { video: 'elite', titulo: 'DIARIO', colores: { luz: '#ff0000' } });
    expect(v).toMatchObject({ modo: 'video', video: 'elite', nombre: 'DIARIO' });
    expect(v.colores.luz).toBe('#ff0000');
    expect(conEscena(VARIANTES.diario, null)).toBe(VARIANTES.diario);
  });

  it('la apertura la usa', () => {
    expect(varianteDeApertura({ tipo: 'diario', escena: { video: 'elite' } }).video.id).toBe('elite');
    expect(varianteDeApertura({ tipo: 'diario' }).modo).toBe('estandar');
  });
});
