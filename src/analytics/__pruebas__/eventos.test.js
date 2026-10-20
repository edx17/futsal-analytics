import { describe, it, expect } from 'vitest';
import {
  normalizarEvento, erroresEvento, cambiosDeExclusivas, varianteDeEventoDb, eventoDePlantilla, clavesDeTipo, PLANTILLAS, REGLAS, ESCENAS_BASE,
} from '../eventos';
import { resultadoDePrueba } from '../god';

const k = (clave, tipo, rareza = 'totw', activa = true) => ({ id: clave, clave, tipo, rareza, activa, carta: { ovr: 80 } });
const catalogo = [k('SGOL|R1:t|1', 'SGOL'), k('SGOL|R1:t|2', 'SGOL'), k('SREC|R1:t|3', 'SREC'), k('BASE|4', 'BASE', 'oro'), k('SGOL|R1:t|5', 'SGOL', 'totw', false)];

describe('eventos: lo que se guarda', () => {
  it('las reglas del sobre quedan siempre dentro de rango', () => {
    const n = normalizarEvento({ nombre: ' X ', sobre: { cartas: 50, costo: -3, por_dia: 'abc' } });
    expect(n.nombre).toBe('X');
    expect(n.sobre).toEqual({ cartas: REGLAS.cartas.max, costo: 0, por_dia: REGLAS.por_dia.def, exclusivas: true });
  });
  it('colores inválidos y escenas que no existen se descartan', () => {
    const n = normalizarEvento({ nombre: 'E', escena: { video: 'inventada', colores: { luz: '#ff0000', acento: 'rojo' } } });
    expect(n.escena.video).toBe('');
    expect(n.escena.colores).toEqual({ luz: '#ff0000' });
  });
  it('cartas sin repetir', () => {
    expect(normalizarEvento({ nombre: 'E', cartas: ['a', 'a', 'b', ''] }).cartas).toEqual(['a', 'b']);
  });
  it('avisa lo que falta', () => {
    expect(erroresEvento({ nombre: '', cartas: [] }).length).toBe(2);
    expect(erroresEvento({ nombre: 'E', cartas: ['a'], desde: '2026-11-02', hasta: '2026-11-01' })).toHaveLength(1);
    expect(erroresEvento({ nombre: 'E', cartas: ['a'] })).toEqual([]);
  });
});

describe('eventos: Goleadores y Recuperadores', () => {
  it('las plantillas toman sus series del catálogo (sólo las activas)', () => {
    expect(clavesDeTipo(catalogo, ['SGOL'])).toEqual(['SGOL|R1:t|1', 'SGOL|R1:t|2']);
    const g = eventoDePlantilla('goleadores', catalogo);
    expect(g).toMatchObject({ nombre: PLANTILLAS.goleadores.nombre, activo: true, cartas: ['SGOL|R1:t|1', 'SGOL|R1:t|2'] });
    expect(eventoDePlantilla('recuperadores', catalogo).cartas).toEqual(['SREC|R1:t|3']);
  });
  it('el sobre de prueba de un evento trae sólo sus cartas', () => {
    const ev = { ...eventoDePlantilla('goleadores', catalogo), id: 'e1' };
    const r = resultadoDePrueba({ catalogo, evento: ev, azar: () => 0.3 });
    expect(r.cartas.length).toBe(2); // pide 3 pero el evento tiene 2 activas
    expect(r.cartas.every((c) => c.tipo === 'SGOL')).toBe(true);
    expect(r.evento.id).toBe('e1');
  });
});

describe('eventos: cartas exclusivas', () => {
  it('las del evento quedan exclusivas; las que sacó, no (salvo que otro evento las pida)', () => {
    const ev = { id: 'e1', cartas: ['a', 'b'], sobre: { exclusivas: true } };
    const otros = [{ id: 'e2', cartas: ['c'], sobre: { exclusivas: true } }];
    expect(cambiosDeExclusivas(ev, otros, ['a', 'c', 'd'])).toEqual({ si: ['a', 'b'], no: ['d'] });
  });
  it('si el evento no las quiere exclusivas, se liberan', () => {
    expect(cambiosDeExclusivas({ id: 'e1', cartas: ['a'], sobre: { exclusivas: false } }, [], [])).toEqual({ si: [], no: ['a'] });
  });
});

describe('eventos: la escena', () => {
  const videos = { elite: { fuentes: [], duracion: 7 }, vdraft: { fuentes: [], duracion: 6.5 } };
  it('con su video si existe; si no, el alternativo; nombre y colores del evento', () => {
    const v = varianteDeEventoDb({ id: 'e1', nombre: 'EVENTO X', escena: { video: 'evento_goleadores', titulo: 'GOLES', colores: { luz: '#ef4444' } } }, videos);
    expect(v).toMatchObject({ id: 'evento:e1', nombre: 'GOLES', modo: 'video' });
    expect(v.video.id).toBe('elite');
    expect(v.colores.luz).toBe('#ef4444');
  });
  it('sin video elegido, apertura estándar', () => {
    expect(varianteDeEventoDb({ id: 'e', nombre: 'E', escena: { video: '' } }, videos).modo).toBe('estandar');
  });
  it('todas las escenas base tienen nombre', () => {
    ESCENAS_BASE.forEach((e) => expect(e.nombre).toBeTruthy());
  });
});
