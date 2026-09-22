import { describe, it, expect } from 'vitest';
import {
  edadDe, esMenor, permisosDe, estadoPermiso, estadoDeJugador, resumenClub,
  PERMISOS, MAYORIA_EDAD,
} from '../tutores.js';

const HOY = '2026-09-22';

const menor = {
  id: 1, nombre: 'Tato', apellido: 'Gómez', fechanac: '2012-05-10',
  autoriza_traslado: true, autoriza_imagen: true, autoriza_atencion_medica: true, retira_solo: false,
};
const mayor = {
  id: 2, nombre: 'Lucho', apellido: 'Pérez', fechanac: '1998-03-14',
  autoriza_imagen: true,
};
const sinFecha = { id: 3, nombre: 'Bisi', apellido: 'León', fechanac: null };

const TUT = [
  { id: 't1', jugador_id: 1, nombre: 'Ana Gómez', parentesco: 'Madre', telefono: '11-5555', principal: true, puede_retirar: true },
  { id: 't2', jugador_id: 1, nombre: 'Raúl Gómez', parentesco: 'Padre', telefono: '11-6666', principal: false, puede_retirar: true },
];

describe('edadDe', () => {
  it('calcula la edad al día de hoy', () => {
    expect(edadDe('2012-05-10', HOY)).toBe(14);
    expect(edadDe('1998-03-14', HOY)).toBe(28);
  });

  it('el día del cumpleaños ya suma el año', () => {
    expect(edadDe('2008-09-22', '2026-09-22')).toBe(18);
    expect(edadDe('2008-09-23', '2026-09-22')).toBe(17);
  });

  it('no se corre un día por el huso horario', () => {
    // new Date('2008-09-22') parsea a medianoche UTC; leído en UTC−3 da el 21
    // a la noche y devolvería 17 en vez de 18. Acá se compara el texto.
    expect(edadDe('2008-09-22', '2026-09-22')).toBe(18);
  });

  it('devuelve null si la fecha falta o está rota', () => {
    expect(edadDe(null, HOY)).toBe(null);
    expect(edadDe('', HOY)).toBe(null);
    expect(edadDe('el año pasado', HOY)).toBe(null);
  });

  it('aguanta una marca de tiempo completa', () => {
    expect(edadDe('2012-05-10T00:00:00+00:00', HOY)).toBe(14);
  });
});

describe('esMenor', () => {
  it('distingue menor de mayor', () => {
    expect(esMenor(menor, HOY)).toBe(true);
    expect(esMenor(mayor, HOY)).toBe(false);
  });

  it('justo en la mayoría de edad ya es mayor', () => {
    expect(esMenor({ fechanac: `${2026 - MAYORIA_EDAD}-09-22` }, HOY)).toBe(false);
  });

  it('sin fecha de nacimiento devuelve null, no false', () => {
    // Es la distinción que importa: "no sé" no es "es mayor".
    expect(esMenor(sinFecha, HOY)).toBe(null);
  });
});

describe('permisosDe', () => {
  it('al menor se le piden todos', () => {
    expect(permisosDe(menor, HOY)).toHaveLength(PERMISOS.length);
  });

  it('al mayor sólo los que le aplican', () => {
    const p = permisosDe(mayor, HOY).map((x) => x.k);
    expect(p).toEqual(['autoriza_imagen']);
  });

  it('sin fecha de nacimiento se piden todos: es cuando menos se sabe', () => {
    expect(permisosDe(sinFecha, HOY)).toHaveLength(PERMISOS.length);
  });
});

describe('estadoPermiso', () => {
  it('son tres estados, no dos', () => {
    expect(estadoPermiso(null)).toBe('pendiente');
    expect(estadoPermiso(undefined)).toBe('pendiente');
    expect(estadoPermiso(false)).toBe('no');
    expect(estadoPermiso(true)).toBe('si');
  });
});

describe('estadoDeJugador', () => {
  it('con todo cargado no queda nada pendiente', () => {
    const r = estadoDeJugador(menor, TUT, HOY);
    expect(r.completo).toBe(true);
    expect(r.faltantes).toEqual([]);
    expect(r.principal.nombre).toBe('Ana Gómez');
    expect(r.quienesRetiran).toHaveLength(2);
  });

  it('el principal va primero en la lista', () => {
    const alReves = [TUT[1], TUT[0]];
    expect(estadoDeJugador(menor, alReves, HOY).tutores[0].nombre).toBe('Ana Gómez');
  });

  it('marca como grave que un menor no tenga ningún tutor', () => {
    const r = estadoDeJugador(menor, [], HOY);
    expect(r.faltantes.some((f) => f.k === 'sin_tutor' && f.grave)).toBe(true);
  });

  it('a un mayor no le reclama tutor', () => {
    const r = estadoDeJugador(mayor, [], HOY);
    expect(r.faltantes.some((f) => f.k === 'sin_tutor')).toBe(false);
  });

  it('sin fecha de nacimiento sí le reclama tutor', () => {
    const r = estadoDeJugador(sinFecha, [], HOY);
    expect(r.faltantes.some((f) => f.k === 'sin_tutor')).toBe(true);
  });

  it('reclama que haya un principal cuando hay tutores pero ninguno lo es', () => {
    const sinPrincipal = TUT.map((t) => ({ ...t, principal: false }));
    const r = estadoDeJugador(menor, sinPrincipal, HOY);
    expect(r.faltantes.some((f) => f.k === 'sin_principal')).toBe(true);
  });

  it('reclama que algún tutor tenga teléfono', () => {
    const sinTel = TUT.map((t) => ({ ...t, telefono: null }));
    const r = estadoDeJugador(menor, sinTel, HOY);
    expect(r.faltantes.some((f) => f.k === 'sin_telefono' && f.grave)).toBe(true);
  });

  it('avisa si nadie puede retirar a un menor que tampoco se va solo', () => {
    const nadieRetira = TUT.map((t) => ({ ...t, puede_retirar: false }));
    const r = estadoDeJugador(menor, nadieRetira, HOY);
    expect(r.faltantes.some((f) => f.k === 'sin_quien_retire')).toBe(true);
  });

  it('no lo avisa si el menor tiene permiso para retirarse solo', () => {
    const nadieRetira = TUT.map((t) => ({ ...t, puede_retirar: false }));
    const r = estadoDeJugador({ ...menor, retira_solo: true }, nadieRetira, HOY);
    expect(r.faltantes.some((f) => f.k === 'sin_quien_retire')).toBe(false);
  });

  it('un permiso sin responder queda pendiente; uno en "no" no', () => {
    const conNo = { ...menor, autoriza_imagen: false, autoriza_traslado: null };
    const r = estadoDeJugador(conNo, TUT, HOY);
    expect(r.faltantes.map((f) => f.k)).toEqual(['autoriza_traslado']);
    expect(r.permisos.find((p) => p.k === 'autoriza_imagen').estado).toBe('no');
  });

  it('no mezcla tutores de otro jugador', () => {
    const r = estadoDeJugador(mayor, TUT, HOY);
    expect(r.tutores).toEqual([]);
  });

  it('compara los ids como texto, porque la base los devuelve como número', () => {
    const r = estadoDeJugador({ ...menor, id: '1' }, TUT, HOY);
    expect(r.tutores).toHaveLength(2);
  });
});

describe('resumenClub', () => {
  const jugadores = [menor, mayor, sinFecha];

  it('cuenta el plantel, los menores y los que no tienen fecha', () => {
    const r = resumenClub(jugadores, TUT, HOY);
    expect(r.total).toBe(3);
    expect(r.menores).toBe(1);
    expect(r.sinFechaNac).toBe(1);
  });

  it('pone primero al que tiene faltantes graves', () => {
    const r = resumenClub(jugadores, TUT, HOY);
    expect(r.filas[0].jugador.id).toBe(3);   // Bisi: sin fecha y sin tutor
    // Los dos completos quedan al final, desempatados por apellido.
    expect(r.filas.slice(1).map((f) => f.jugador.apellido)).toEqual(['Gómez', 'Pérez']);
  });

  it('cuenta cuántos tienen algo pendiente', () => {
    const r = resumenClub(jugadores, TUT, HOY);
    // Solo Bisi: a Lucho, mayor de edad, no se le pide tutor ni permisos de menor.
    expect(r.conPendientes).toBe(1);
    expect(r.sinTutor).toBe(1);
    expect(r.conGraves).toBe(1);
  });

  it('no se cae con el plantel vacío', () => {
    const r = resumenClub([], [], HOY);
    expect(r).toMatchObject({ total: 0, menores: 0, sinTutor: 0, conPendientes: 0 });
    expect(r.filas).toEqual([]);
  });
});
