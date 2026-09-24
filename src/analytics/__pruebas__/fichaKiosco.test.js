import { describe, it, expect } from 'vitest';
import {
  disciplinaDe, proximoPartidoDe, convocadosDe, wellnessDeHoy, historialWellness,
  colorWellness, esCumpleHoy, edadQueCumple, torneoDe,
} from '../fichaKiosco.js';

const am = (categoria = 'Primera') => ({ accion: 'Tarjeta Amarilla', categoria });

describe('disciplina', () => {
  it('sin tarjetas está todo en orden', () => {
    const d = disciplinaDe([], []);
    expect(d.estado).toBe('ok');
    expect(d.amarillas).toBe(0);
  });

  it('a una amarilla de la suspensión', () => {
    const d = disciplinaDe([am(), am(), am(), am()], []);
    expect(d.estado).toBe('alBorde');
    expect(d.categorias[0].faltanParaSuspension).toBe(1);
  });

  it('suspendido con 5 amarillas si todavía no cumplió la fecha', () => {
    const cinco = [am(), am(), am(), am(), am()];
    expect(disciplinaDe(cinco, []).estado).toBe('suspendido');
    // Ya cumplida: vuelve a estar habilitado, y le faltan 5 para la próxima.
    const d = disciplinaDe(cinco, [{ tipo: 'acumulacion', categoria: 'Primera' }]);
    expect(d.estado).toBe('ok');
    expect(d.categorias[0].faltanParaSuspension).toBe(5);
  });

  it('las amarillas se acumulan por categoría', () => {
    const d = disciplinaDe([am('Primera'), am('Primera'), am('Primera'), am('Reserva'), am('Reserva')], []);
    expect(d.amarillas).toBe(5);
    expect(d.estado).toBe('ok');
  });

  it('una roja con fechas pendientes lo suspende', () => {
    const d = disciplinaDe([{ accion: 'Tarjeta Roja', categoria: 'Primera' }],
      [{ tipo: 'roja', fechas_tribunal: 2, fechas_internas: 0, fechas_cumplidas: 1 }]);
    expect(d.suspendido).toBe(true);
    expect(d.fechasPendientes).toBe(1);
    expect(d.rojas).toBe(1);
  });
});

describe('próximo partido y citación', () => {
  const base = { estado: 'Pendiente', categoria: 'Primera', condicion: 'Local', nombre_propio: 'Juventud' };
  const partidos = [
    { ...base, id: 3, fecha: '2026-09-27', rival: 'Racing', plantilla: [{ id_jugador: 7 }], citacion: { publicada_at: '2026-09-24T10:00:00Z' }, hora_citacion: '19:00', lugar: 'Club X', direccion: 'Calle 123', horario: '20:30:00' },
    // Cruce entre terceros del mismo fixture: no es mío.
    { ...base, id: 2, fecha: '2026-09-26', rival: 'Boca', nombre_propio: 'River', condicion: 'Neutral' },
    // Ya pasó.
    { ...base, id: 1, fecha: '2026-09-20', rival: 'Viejo' },
  ];

  it('toma el primer partido propio desde hoy', () => {
    const r = proximoPartidoDe(partidos, { miClub: 'Juventud', jugadorId: 7, hoy: '2026-09-24' });
    expect(r.partido.id).toBe(3);
    expect(r.horario).toBe('20:30');
    expect(r.direccion).toBe('Calle 123');
  });

  it('citado sólo si la citación está publicada y figura', () => {
    expect(proximoPartidoDe(partidos, { miClub: 'Juventud', jugadorId: 7, hoy: '2026-09-24' }).citacion).toBe('citado');
    expect(proximoPartidoDe(partidos, { miClub: 'Juventud', jugadorId: 8, hoy: '2026-09-24' }).citacion).toBe('no-citado');
    const borrador = partidos.map((p) => ({ ...p, citacion: null }));
    expect(proximoPartidoDe(borrador, { miClub: 'Juventud', jugadorId: 7, hoy: '2026-09-24' }).citacion).toBe('sin-publicar');
  });

  it('entiende la plantilla guardada como texto', () => {
    expect(convocadosDe({ plantilla: '[{"id_jugador":7,"titular":true}]' })).toEqual(['7']);
    expect(convocadosDe({ plantilla: 'basura' })).toEqual([]);
  });

  it('sin partidos no inventa nada', () => {
    expect(proximoPartidoDe([], { hoy: '2026-09-24' })).toBeNull();
  });
});

describe('wellness', () => {
  const w = [
    { fecha: '2026-09-24', sueno: 4, estres: 2, fatiga: 2, dolor_muscular: 1 },
    { fecha: '2026-09-22', sueno: 1, estres: 2, fatiga: 2, dolor_muscular: 1 },
  ];

  it('sabe si hoy cargó', () => {
    expect(wellnessDeHoy(w, '2026-09-24').completo).toBe(true);
    expect(wellnessDeHoy(w, '2026-09-25').completo).toBe(false);
    // Sólo el post-entreno (rpe) no cuenta como wellness del día.
    expect(wellnessDeHoy([{ fecha: '2026-09-25', rpe: 7 }], '2026-09-25').completo).toBe(false);
  });

  it('arma los últimos días con huecos', () => {
    const h = historialWellness(w, '2026-09-24', 3);
    expect(h.map((x) => x.fecha)).toEqual(['2026-09-24', '2026-09-23', '2026-09-22']);
    expect(h[1].registro).toBeNull();
    expect(h[2].color).toBe('rojo');
    expect(h[0].color).toBe('verde');
  });

  it('cruza fin de mes', () => {
    expect(historialWellness([], '2026-10-01', 2).map((x) => x.fecha)).toEqual(['2026-10-01', '2026-09-30']);
  });

  it('sin registro no hay color', () => {
    expect(colorWellness(null)).toBeNull();
  });
});

describe('cumpleaños', () => {
  it('detecta el día', () => {
    expect(esCumpleHoy('2001-09-24', '2026-09-24')).toBe(true);
    expect(esCumpleHoy('2001-09-25', '2026-09-24')).toBe(false);
    expect(esCumpleHoy(null, '2026-09-24')).toBe(false);
  });

  it('el 29/2 se festeja el 28/2 en años no bisiestos', () => {
    expect(esCumpleHoy('2000-02-29', '2026-02-28')).toBe(true);
    expect(esCumpleHoy('2000-02-29', '2028-02-28')).toBe(false);
    expect(esCumpleHoy('2000-02-29', '2028-02-29')).toBe(true);
  });

  it('calcula los años que cumple', () => {
    expect(edadQueCumple('2001-09-24', '2026-09-24')).toBe(25);
  });
});

describe('torneo', () => {
  const fx = [
    { id: 1, jornada: '1', nombre_propio: 'Juventud', rival: 'Racing', condicion: 'Local', goles_propios: 3, goles_rival: 1, estado: 'Finalizado', fecha: '2026-08-01' },
    { id: 2, jornada: '1', nombre_propio: 'Boca', rival: 'River', condicion: 'Neutral', goles_propios: 0, goles_rival: 0, estado: 'Finalizado', fecha: '2026-08-01' },
    { id: 3, jornada: '2', nombre_propio: 'Juventud', rival: 'Boca', condicion: 'Visitante', goles_propios: null, goles_rival: null, estado: 'Pendiente', fecha: '2026-08-08' },
  ];

  it('arma la tabla y el puesto del club', () => {
    const t = torneoDe(fx, 'Juventud');
    expect(t.tabla[0].nombre).toBe('Juventud');
    expect(t.tabla[0].pts).toBe(3);
    expect(t.puesto).toBe(1);
    expect(t.misPartidos.map((p) => p.id)).toEqual([1, 3]);
    expect(t.jugados).toBe(1);
  });

  it('reconcilia el nombre del club escrito distinto', () => {
    const t = torneoDe(fx, 'JUVENTUD');
    expect(t.miClub).toBe('Juventud');
    expect(t.puesto).toBe(1);
    expect(torneoDe(fx, null).miClub).toBe('Juventud');
  });
});
