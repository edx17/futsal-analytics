import { describe, it, expect } from 'vitest';
import { calcularRatingDetallado, elegirMVP } from '../rating.js';

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

describe('rating: remates', () => {
  const remate = (accion) => ({ periodo: 'PT', minuto: 3, equipo: 'Propio', accion, id_jugador: 6, zona_x: 85, zona_y: 50 });
  it('el remate que tapa un defensor resta menos que el que se va afuera', () => {
    const tapado = calcularRatingDetallado(jugador, [remate('Remate - Rebatido')], [], 0, 40);
    const afuera = calcularRatingDetallado(jugador, [remate('Remate - Desviado')], [], 0, 40);
    expect(tapado.desglose.familias.finalizacion).toBeLessThan(0);
    expect(tapado.desglose.familias.finalizacion).toBeGreaterThan(afuera.desglose.familias.finalizacion);
  });
});

describe('elegirMVP', () => {
  const c = (id, rating, goles = 0, asistencias = 0, participacion = 0.5) => ({ id, rating, goles, asistencias, participacion });

  it('con notas parejas gana el que más goles y asistencias tuvo', () => {
    // El caso de Morón: 2 asistencias con 8.6 contra un hat-trick con 8.6
    const mvp = elegirMVP([c('asiste', 8.6, 0, 2), c('arquero', 8.6), c('hat-trick', 8.5, 3)], { golesFavor: 3, golesContra: 2 });
    expect(mvp.id).toBe('hat-trick');
  });

  it('a igual goles más asistencias, pesan más los goles', () => {
    expect(elegirMVP([c('a', 8.8, 0, 2), c('b', 8.7, 2, 0)]).id).toBe('b');
  });

  it('si la diferencia de nota es clara, gana la nota', () => {
    expect(elegirMVP([c('nota', 8.9), c('goles', 8.4, 2)]).id).toBe('nota');
  });

  it('no elige a quien casi no jugó', () => {
    expect(elegirMVP([c('suplente', 9.5, 1, 0, 0.1), c('titular', 8.0, 0, 0, 0.6)]).id).toBe('titular');
  });

  it('en las derrotas no dice "figura del partido"', () => {
    expect(elegirMVP([c('a', 7)], { golesFavor: 4, golesContra: 1 }).etiqueta).toBe('FIGURA DEL PARTIDO');
    expect(elegirMVP([c('a', 7)], { golesFavor: 1, golesContra: 2 }).etiqueta).toBe('EL MEJOR DE LOS NUESTROS');
    expect(elegirMVP([c('a', 7)], { golesFavor: 1, golesContra: 4 }).etiqueta).toBe('LO MÁS RESCATABLE');
  });

  it('sin candidatos no hay figura', () => {
    expect(elegirMVP([])).toBeNull();
  });
});
