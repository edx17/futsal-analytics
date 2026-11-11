import { describe, it, expect } from 'vitest';
import { premioDesafio, repartoTorneo, etiquetaDeModo, cierreDeModo, botonDeModo } from '../vdraftModos';

describe('desafío del día', () => {
  it('premia 1000 / 750 / 500 y 150 al resto que jugó', () => {
    expect([1, 2, 3, 4, 9].map((p) => premioDesafio(p))).toEqual([1000, 750, 500, 150, 150]);
    expect(premioDesafio(5, 0)).toBe(0);
  });
  it('se juega una sola vez por día', () => {
    expect(botonDeModo('desafio', { desafio: { jugado: false } }).habilitado).toBe(true);
    expect(botonDeModo('desafio', { desafio: { jugado: true } }).habilitado).toBe(false);
  });
  it('muestra la regla en el cartel y deja el premio para mañana', () => {
    const p = { modo: 'desafio', regla: { nombre: 'SIN CAPITÁN' }, estado: 'terminada', victorias: 2 };
    expect(etiquetaDeModo(p)).toBe('DESAFÍO DEL DÍA · SIN CAPITÁN');
    expect(cierreDeModo(p).titulo).toMatch(/2 partidos ganados/);
    expect(cierreDeModo(p).detalle).toMatch(/mañana/);
    expect(etiquetaDeModo({ modo: 'normal' })).toBeNull();
    expect(cierreDeModo({ modo: 'normal', estado: 'terminada' })).toBeNull();
  });
});

describe('torneo semanal', () => {
  it('reparte el pozo 50/30/20, 60/40 con dos y nada con uno', () => {
    expect(repartoTorneo(5, 5000)).toEqual([2500, 1500, 1000]);
    expect(repartoTorneo(3, 3001)).toEqual([1501, 900, 600]);
    expect(repartoTorneo(2, 2000)).toEqual([1200, 800]);
    expect(repartoTorneo(1, 1000)).toEqual([]);
  });
  it('el botón: anotarse, jugar las que quedan o esperar', () => {
    const base = { puntos: 1500, torneo: { activo: true, entrada: 1000, partidas: 5, yo: null } };
    expect(botonDeModo('torneo', base)).toMatchObject({ anotarse: true, habilitado: true });
    expect(botonDeModo('torneo', { ...base, puntos: 300 }).habilitado).toBe(false);
    expect(botonDeModo('torneo', { ...base, torneo: { ...base.torneo, yo: { restantes: 2 } } }).texto).toMatch(/QUEDAN 2/);
    expect(botonDeModo('torneo', { ...base, torneo: { ...base.torneo, yo: { restantes: 0 } } }).habilitado).toBe(false);
    expect(botonDeModo('torneo', { ...base, torneo: { activo: false } }).habilitado).toBe(false);
  });
});
