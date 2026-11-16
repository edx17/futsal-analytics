import { describe, it, expect } from 'vitest';
import { normalizarConfig, erroresConfig, sumarModelo, sinConfigurar, parecida, categoriaPorEdad, categoriasActivas, hayConfig } from '../configClub';
import { categoriasVisiblesPara } from '../../utils/categorias';

const base = () => normalizarConfig({ pais: 'AR', ramas: ['Masculino', 'Femenino'], ligas: [{ id: 'afa', nombre: 'AFA' }, { id: 'futsala', nombre: 'Futsala' }] });

describe('configurador del club', () => {
  it('normaliza lo que viene de la base y descarta ligas que no existen', () => {
    const c = normalizarConfig({ ramas: ['Masculino', 'Otra'], ligas: [{ id: 'afa', nombre: ' AFA ' }, { nombre: '' }],
      categorias: [{ nombre: ' Primera ', ligas: ['afa', 'inventada'] }, { nombre: '' }, { nombre: 'Sub-17', tipo: 'sub', edad_max: '17', activa: false }] });
    expect(c.ramas).toEqual(['Masculino']);
    expect(c.ligas).toEqual([{ id: 'afa', nombre: 'AFA' }]);
    expect(c.categorias).toHaveLength(2);
    expect(c.categorias[0]).toMatchObject({ nombre: 'Primera', rama: 'Masculino', ligas: ['afa'], tipo: 'division', activa: true });
    expect(c.categorias[1]).toMatchObject({ tipo: 'sub', edad_max: 17, activa: false });
    expect(hayConfig(normalizarConfig({}))).toBe(false);
  });

  it('suma modelos sin repetir nombres, con la rama y la liga elegidas (una categoría puede ir en varias ligas)', () => {
    let c = sumarModelo(base(), 'afa', { rama: 'Masculino', ligaId: 'afa' });
    expect(categoriasActivas(c)).toEqual(['Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava']);
    c = sumarModelo(c, 'reserva', { rama: 'Femenino', ligaId: 'futsala' });
    expect(categoriasActivas(c, 'Femenino')).toEqual(['Reserva', 'Única']);   // "Primera" ya estaba
    c.categorias[0].ligas.push('futsala');
    expect(c.categorias[0].ligas).toEqual(['afa', 'futsala']);
    c = sumarModelo(c, 'promocional', { anioJuego: 2026, desde: 8, hasta: 9 });
    expect(c.categorias.slice(-2).map((x) => [x.nombre, x.anio])).toEqual([['Promocional 2018', 2018], ['Promocional 2017', 2017]]);
  });

  it('valida nombres repetidos, edad de las Sub y año de las promocionales', () => {
    const c = base();
    c.categorias = [{ nombre: 'Primera', tipo: 'division' }, { nombre: 'primera', tipo: 'division' }, { nombre: 'Sub', tipo: 'sub' }, { nombre: 'Promo', tipo: 'promocional' }];
    expect(Object.keys(erroresConfig(c)).sort()).toEqual(['cat.1', 'cat.2', 'cat.3']);
  });

  it('encuentra lo que está en los datos y no en el configurador, y sugiere con qué unificar', () => {
    const c = sumarModelo(base(), 'afa', {});
    expect(sinConfigurar(c, ['Primera', 'tercera', '3ra', 'Reserva'])).toEqual(['3ra', 'Reserva']);
    expect(parecida(c, '3ra')).toBe('Tercera');
    expect(parecida(c, 'SEPTIMA')).toBe('Séptima');
    expect(parecida(c, 'Reserva')).toBeNull();
  });

  it('sugiere la categoría por fecha de nacimiento (promocional por año, o la Sub más chica que le corresponde)', () => {
    let c = sumarModelo(base(), 'sub', {});
    c = sumarModelo(c, 'promocional', { anioJuego: 2026, desde: 8, hasta: 9 });
    expect(categoriaPorEdad(c, '2018-03-01', 2026)).toBe('Promocional 2018');
    expect(categoriaPorEdad(c, '2010-05-05', 2026)).toBe('Sub-17');
    expect(categoriaPorEdad(c, '2000-01-01', 2026)).toBeNull();
  });

  it('con configurador, el orden del club se respeta al recortar por categorías asignadas', () => {
    expect(categoriasVisiblesPara(['Reserva', 'Primera', 'Única'], [], { mantenerOrden: true })).toEqual(['Reserva', 'Primera', 'Única']);
    expect(categoriasVisiblesPara(['Reserva', 'Primera', 'Única'], ['Única', 'Reserva'], { mantenerOrden: true })).toEqual(['Reserva', 'Única']);
    expect(categoriasVisiblesPara(['Tercera', 'Primera'], [])).toEqual(['Primera', 'Tercera']);
  });
});

describe('segunClub: la regla única de las listas de categorías', () => {
  it('sin configurador deja la lista como está; con configurador manda el club y no esconde datos', async () => {
    const { segunClub } = await import('../configClub');
    const sin = normalizarConfig({});
    expect(segunClub(['Tercera', 'Primera'], sin)).toEqual(['Tercera', 'Primera']);
    const c = normalizarConfig({ categorias: [{ nombre: 'Primera' }, { nombre: 'Tercera' }, { nombre: 'Cuarta' }, { nombre: 'Quinta', activa: false }] });
    expect(segunClub(['Cuarta', 'Primera', '3ra'], c)).toEqual(['Primera', 'Tercera', 'Cuarta', '3ra']);
    expect(segunClub(['Cuarta', 'Primera', 'Quinta', '3ra'], c, { soloLasDeDatos: true })).toEqual(['Primera', 'Cuarta', 'Quinta', '3ra']);
  });
});
