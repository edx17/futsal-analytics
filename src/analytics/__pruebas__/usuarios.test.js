import { describe, it, expect } from 'vitest';
import { filtrarUsuarios, resumenUsuarios, multiplicadorVigente, erroresMultiplicador } from '../usuarios';

const lista = [
  { dueno: 'j:1', nombre: 'Pérez, Juan', tipo: 'jugador', detalle: 'Primera', puntos: 300, sobres: 4, vdraft: 1 },
  { dueno: 'j:2', nombre: 'Gómez, Ana', tipo: 'jugador', detalle: 'Tercera', puntos: 0, sobres: 0, vdraft: 0, bloqueado: true },
  { dueno: 'u:9', nombre: 'Staff Uno', tipo: 'staff', detalle: 'manager', puntos: 50, sobres: 1, vdraft: 0 },
];

describe('usuarios del Modo GOD', () => {
  it('busca sin tildes por nombre o categoría y filtra', () => {
    expect(filtrarUsuarios(lista, { texto: 'perez' }).map((u) => u.dueno)).toEqual(['j:1']);
    expect(filtrarUsuarios(lista, { texto: 'tercera' }).map((u) => u.dueno)).toEqual(['j:2']);
    expect(filtrarUsuarios(lista, { filtro: 'staff' })).toHaveLength(1);
    expect(filtrarUsuarios(lista, { filtro: 'activos' })).toHaveLength(2);
    expect(filtrarUsuarios(lista, { filtro: 'sin_jugar' }).map((u) => u.dueno)).toEqual(['j:2']);
    expect(filtrarUsuarios(lista, { filtro: 'bloqueados' }).map((u) => u.dueno)).toEqual(['j:2']);
  });

  it('el resumen', () => {
    expect(resumenUsuarios(lista)).toEqual({ total: 3, juegan: 2, vcoins: 350, bloqueados: 1 });
  });

  it('el evento de V-Coins que corre: el de mayor factor, prendido y en fecha', () => {
    const ahora = new Date('2026-12-20T12:00:00Z');
    const m = [
      { nombre: 'A', factor: 2, activo: true, desde: '2026-12-19T00:00:00Z', hasta: '2026-12-21T00:00:00Z' },
      { nombre: 'B', factor: 3, activo: false, desde: '2026-12-19T00:00:00Z', hasta: '2026-12-21T00:00:00Z' },
      { nombre: 'C', factor: 3, activo: true, desde: '2026-12-22T00:00:00Z', hasta: '2026-12-23T00:00:00Z' },
    ];
    expect(multiplicadorVigente(m, ahora).nombre).toBe('A');
    expect(multiplicadorVigente([], ahora)).toBeNull();
  });

  it('valida el evento', () => {
    expect(erroresMultiplicador({ nombre: 'X2', factor: 2, desde: '2026-12-01T00:00', hasta: '2026-12-02T00:00' })).toEqual([]);
    expect(erroresMultiplicador({ nombre: '', factor: 9, desde: '2026-12-02T00:00', hasta: '2026-12-01T00:00' })).toHaveLength(3);
  });
});
