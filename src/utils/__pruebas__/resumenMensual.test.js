import { describe, it, expect } from 'vitest';
import { resumirMesPorDia } from '../resumenMensual';

const fila = (fecha, estado, jugador_id = Math.random()) => ({ fecha, estado, jugador_id });
const muchas = (fecha, estado, n) => Array.from({ length: n }, (_, i) => fila(fecha, estado, `${estado}-${i}`));

describe('resumirMesPorDia', () => {
  it('cuenta presentes y ausentes del día (caso real: 1/10 con 13P, 1A, 5 lesionados)', () => {
    const h = [...muchas('2026-10-01', 'presente', 13), ...muchas('2026-10-01', 'ausente', 1), ...muchas('2026-10-01', 'lesionado', 5)];
    const r = resumirMesPorDia(h, '2026-10');
    expect(r.mejor.presentes).toBe(13);
    expect(r.mejor.total).toBe(14);          // los lesionados salen del total
    expect(r.mejor.lesionados).toBe(5);
    expect(r.mejor.porcentaje).toBe(93);
  });

  it('no le importan las mayúsculas ni los espacios del estado', () => {
    const r = resumirMesPorDia([fila('2026-10-01', 'Presente'), fila('2026-10-01', ' presente '), fila('2026-10-01', 'TARDE')], '2026-10');
    expect(r.mejor.presentes).toBe(3);
    expect(r.mejor.porcentaje).toBe(100);
  });

  it('un día con todos lesionados no cuenta como día entrenado', () => {
    const h = [...muchas('2026-10-02', 'lesionado', 3), ...muchas('2026-10-03', 'presente', 2)];
    const r = resumirMesPorDia(h, '2026-10');
    expect(r.diasConDatos).toBe(1);
    expect(r.mejor.fecha).toBe('2026-10-03');
  });

  it('devuelve null si el mes solo tiene lesionados', () => {
    expect(resumirMesPorDia(muchas('2026-10-02', 'lesionado', 4), '2026-10')).toBeNull();
  });
});
