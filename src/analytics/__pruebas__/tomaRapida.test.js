import { describe, it, expect } from 'vitest';
import {
  numerosEnPalabras, interpretarVoz, mejorInterpretacion, camisetasIniciales, camisetasRepetidas,
  jugadorPorCamiseta, accionSegunZona, eventosDeAccionRapida,
} from '../tomaRapida';

const CAMISETAS = { 101: '7', 102: '10', 103: '4', 104: '1', 105: '31' };

describe('camisetas', () => {
  it('lo del partido manda, después lo del club, después el dorsal', () => {
    const jug = [{ id: 1, dorsal: 5 }, { id: 2, dorsal: 8 }, { id: 3, dorsal: null }];
    expect(camisetasIniciales(jug, { 1: '9' }, { 2: '14' })).toEqual({ 1: '9', 2: '14' });
  });
  it('avisa los números repetidos y busca por número', () => {
    expect(camisetasRepetidas({ 1: '7', 2: '7', 3: '9' })).toEqual(['7']);
    expect(jugadorPorCamiseta(CAMISETAS, 10)).toBe('102');
    expect(jugadorPorCamiseta(CAMISETAS, 99)).toBeNull();
  });
});

describe('voz: números', () => {
  it('pasa las palabras a número', () => {
    expect(numerosEnPalabras('el Siete')).toBe('el 7');
    expect(numerosEnPalabras('treinta y uno')).toBe('31');
    expect(numerosEnPalabras('veintidós remate')).toBe('22 remate');
  });
});

describe('voz: interpretar', () => {
  it('"7 remate desviado"', () => {
    expect(interpretarVoz('7 remate desviado', CAMISETAS)).toMatchObject({ equipo: 'Propio', accion: 'Remate - Desviado', jugadorId: '101', completo: true });
  });
  it('"siete remate atajado" en palabras', () => {
    expect(interpretarVoz('siete remate atajado', CAMISETAS)).toMatchObject({ accion: 'Remate - Atajado', jugadorId: '101', completo: true });
  });
  it('"remate rival atajado": rival, sin jugador', () => {
    expect(interpretarVoz('remate rival atajado', CAMISETAS)).toMatchObject({ equipo: 'Rival', accion: 'Remate - Atajado', jugadorId: null, completo: true });
  });
  it('gol con asistencia', () => {
    expect(interpretarVoz('gol del 10 asistencia del 4', CAMISETAS)).toMatchObject({ accion: 'Remate - Gol', jugadorId: '102', asistenciaId: '103', completo: true });
    expect(interpretarVoz('diez gol pase de cuatro', CAMISETAS)).toMatchObject({ jugadorId: '102', asistenciaId: '103' });
  });
  it('la asistencia sólo cuenta en los goles', () => {
    expect(interpretarVoz('7 remate desviado pase del 4', CAMISETAS).asistenciaId).toBeNull();
  });
  it('faltas, recuperaciones y pérdidas', () => {
    expect(interpretarVoz('4 falta', CAMISETAS)).toMatchObject({ accion: 'Falta cometida', jugadorId: '103', completo: true });
    expect(interpretarVoz('4 falta recibida', CAMISETAS).accion).toBe('Falta recibida');
    expect(interpretarVoz('falta rival', CAMISETAS)).toMatchObject({ equipo: 'Rival', accion: 'Falta cometida', completo: true });
    expect(interpretarVoz('10 recupera', CAMISETAS).accion).toBe('Recuperación');
    expect(interpretarVoz('el 10 pierde la pelota', CAMISETAS).accion).toBe('Pérdida');
    expect(interpretarVoz('pérdida del 31', CAMISETAS)).toMatchObject({ accion: 'Pérdida', jugadorId: '105' });
  });
  it('dice qué le falta', () => {
    expect(interpretarVoz('7 remate', CAMISETAS).falta).toEqual(['resultado']);
    expect(interpretarVoz('remate desviado', CAMISETAS).falta).toEqual(['jugador']);
    expect(interpretarVoz('99 recupera', CAMISETAS).falta).toEqual(['jugador']);
    expect(interpretarVoz('hola', CAMISETAS).falta).toContain('accion');
  });
  it('entre alternativas, se queda con la que entiende completa', () => {
    const r = mejorInterpretacion(['siete remate', 'siete remate desviado'], CAMISETAS);
    expect(r).toMatchObject({ accion: 'Remate - Desviado', completo: true });
  });
});

describe('guardar', () => {
  const base = { club_id: 'c', id_partido: 'p', periodo: 'PT', minuto: 3, segundos: 10, quinteto_activo: ['101'], contexto_juego: '5v5' };

  it('falta en el área es penal', () => {
    expect(accionSegunZona('Falta cometida', 'Propio', 10, 50)).toBe('Penal en contra');
    expect(accionSegunZona('Falta recibida', 'Propio', 90, 50)).toBe('Penal a favor');
    expect(accionSegunZona('Falta cometida', 'Propio', 50, 50)).toBe('Falta cometida');
  });

  it('gol con asistencia: dos filas, como la toma tradicional', () => {
    const filas = eventosDeAccionRapida({ base, equipo: 'Propio', accion: 'Remate - Gol', jugadorId: '102', asistenciaId: '103', x: 80, y: 50 });
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ accion: 'Remate - Gol', id_jugador: 102, id_asistencia: 103, equipo: 'Propio', zona_x: 80, minuto: 3 });
    expect(filas[1]).toMatchObject({ accion: 'Asistencia', id_jugador: 103 });
  });

  it('acción del rival: sin jugador', () => {
    const [f] = eventosDeAccionRapida({ base, equipo: 'Rival', accion: 'Remate - Atajado', jugadorId: '101', x: 20, y: 50 });
    expect(f).toMatchObject({ equipo: 'Rival', id_jugador: null, accion: 'Remate - Atajado' });
  });
});
