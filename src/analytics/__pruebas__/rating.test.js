import { describe, it, expect } from 'vitest';
import { calcularRatingDetallado } from '../rating.js';

/* Un gol de córner de Ayunta asistido por Wiemeyer, como lo guarda la toma
   de datos: la fila del gol (con id_asistencia) y una fila "Asistencia". */
const gol = { id: 1, periodo: 'PT', minuto: 5, equipo: 'Propio', accion: 'Remate - Gol', id_jugador: 9, id_asistencia: 6, zona_x: 93.3, zona_y: 53.2, origen_gol: 'Córner' };
const filaAsistencia = { id: 2, periodo: 'PT', minuto: 5, equipo: 'Propio', accion: 'Asistencia', id_jugador: 6, zona_x: 93.3, zona_y: 53.2 };
// La copia que arman las pantallas para quien asistió
const virtual = { ...gol, id_jugador: 6, tipoVirtual: 'Asistencia' };

const jugador = { id: 6, posicion: 'Ala' };

describe('rating: asistencias', () => {
  it('la copia virtual de un gol asistido cuenta como asistencia, no como gol ni remate', () => {
    const { desglose } = calcularRatingDetallado(jugador, [virtual], [], 0, 40);
    expect(desglose.conteo.goles).toBe(0);
    expect(desglose.conteo.remates).toBe(0);
    expect(desglose.conteo.asistencias).toBe(1);
    expect(desglose.familias.finalizacion).toBe(0);
    expect(desglose.familias.creacion).toBeGreaterThan(0);
  });

  it('la fila "Asistencia" del mismo gol no se suma otra vez', () => {
    const conFila = calcularRatingDetallado(jugador, [filaAsistencia, virtual], [], 0, 40);
    const sinFila = calcularRatingDetallado(jugador, [virtual], [], 0, 40);
    expect(conFila.desglose.conteo.asistencias).toBe(1);
    expect(conFila.rating).toBe(sinFila.rating);
  });

  it('sin copia virtual, la fila "Asistencia" sigue contando', () => {
    const { desglose } = calcularRatingDetallado(jugador, [filaAsistencia], [], 0, 40);
    expect(desglose.conteo.asistencias).toBe(1);
  });

  it('el que asiste no supera al goleador por la misma jugada', () => {
    const goleador = calcularRatingDetallado({ id: 9, posicion: 'Ala' }, [gol], [], 0, 40);
    const asistidor = calcularRatingDetallado(jugador, [filaAsistencia, virtual], [], 0, 40);
    expect(goleador.rating).toBeGreaterThan(asistidor.rating);
  });
});
