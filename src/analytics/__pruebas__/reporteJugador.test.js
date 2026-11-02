import { describe, it, expect } from 'vitest';
import { compararConCategoria, compromisoDelJugador, reporteJugador, partidosDelJugador } from '../reporteJugador';

const fila = (id, extra = {}) => ({
  id, nombre: 'N' + id, apellido: 'A' + id, posicion: 'Ala', categoria: 'Primera', jugados: 10, titularidades: 8, minutos: 300, pctMin: 75,
  goles: 5, asistencias: 3, xg: 4, gPorPJ: 0.5, aPorPJ: 0.3, pasesClave: 10, rec: 20, defPct: 60, ofePct: 55, duelDefTot: 20, duelOfeTot: 20,
  ratingProm: 6.5, ratingCount: 10, pmProm: 0.5, amarillas: 1, rojas: 0, ...extra,
});

describe('reporte de jugador: comparación con la categoría', () => {
  const companeros = [fila(1, { gPorPJ: 1.2, ratingProm: 7.8 }), fila(2), fila(3, { gPorPJ: 0.1, ratingProm: 5.2 }), fila(4, { jugados: 1, gPorPJ: 5 })];

  it('el puesto y el percentil entre los que jugaron lo suficiente', () => {
    const c = compararConCategoria(companeros[0], companeros, 20);
    const goles = c.find((m) => m.id === 'goles');
    expect(goles.puesto).toBe(1);
    expect(goles.de).toBe(3); // el de 1 partido no cuenta
    expect(goles.percentil).toBe(100);
    expect(compararConCategoria(companeros[2], companeros, 20).find((m) => m.id === 'rating').puesto).toBe(3);
  });

  it('los arqueros se comparan con arqueros', () => {
    const arq = fila(9, { posicion: 'Arquero', pctAtajadas: 70, atajadas: 30, golesRecibidos: 12, golesEvitables: 2 });
    const c = compararConCategoria(arq, [...companeros, arq], 20);
    expect(c.map((m) => m.id)).toContain('atajadas');
    expect(c.find((m) => m.id === 'rating').de).toBe(1);
  });
});

describe('reporte de jugador: compromiso', () => {
  it('presentismo sin contar los días de lesión, wellness y lesiones', () => {
    const r = compromisoDelJugador({
      jugadorId: 7,
      asistencias: [{ jugador_id: 7, estado: 'presente' }, { jugador_id: 7, estado: 'tarde' }, { jugador_id: 7, estado: 'ausente' }, { jugador_id: 7, estado: 'lesionado' }, { jugador_id: 8, estado: 'presente' }],
      wellness: [{ jugador_id: 7, sueno: 4, fatiga: 2 }, { jugador_id: 7, sueno: 3, fatiga: 3 }],
      lesiones: [{ jugador_id: 7, fecha_lesion: '2026-05-01', fecha_alta_real: '2026-05-11', estado: 'alta' }],
      fila: { amarillas: 2, rojas: 1 }, hasta: '2026-12-31',
    });
    expect(r).toMatchObject({ entrenamientos: 3, presentes: 2, presentismo: 67, sueno: 3.5, lesiones: 1, amarillas: 2, rojas: 1 });
    expect(r.diasDeBaja).toBeGreaterThan(0);
  });
});

describe('reporte de jugador: armado', () => {
  const jugador = { id: 1, nombre: 'Juan', apellido: 'Pérez', dorsal: 10, posicion: 'Ala', categoria: 'Primera' };
  const base = { jugador, fila: fila(1), companeros: [fila(1), fila(2), fila(3, { ratingProm: 5 })], partidos: [], eventos: [], temporada: '2026', club: { nombre: 'Club' } };

  it('portada, números y cierre; el tono cambia con la audiencia', () => {
    const ct = reporteJugador({ ...base, audiencia: 'ct' });
    expect(ct.secciones[0].bloques[0]).toMatchObject({ tipo: 'portada', nombre: 'Juan Pérez', dorsal: 10 });
    expect(ct.secciones.map((s) => s.id)).toEqual(expect.arrayContaining(['numeros', 'comparacion', 'compromiso']));
    const dir = reporteJugador({ ...base, audiencia: 'directiva' });
    const cierre = dir.secciones.find((s) => s.id === 'cierre');
    expect(cierre?.bloques.every((b) => b.tono !== 'trabajo') ?? true).toBe(true);
  });

  it('sin partidos: lo dice en vez de mostrar ceros', () => {
    const r = reporteJugador({ ...base, fila: fila(1, { jugados: 0 }) });
    expect(r.secciones.map((s) => s.id)).toEqual(['portada', 'sin']);
  });

  it('partido a partido: sólo los que jugó', () => {
    const ev = (id, idPartido, extra) => ({ id, id_partido: idPartido, periodo: 'PT', minuto: id, equipo: 'Propio', quinteto_activo: JSON.stringify(['1', '2', '3', '4', '5']), ...extra });
    const partidos = [{ id: 'a', fecha: '2026-04-01', rival: 'X', goles_propios: 2, goles_rival: 1 }, { id: 'b', fecha: '2026-04-08', rival: 'Y', goles_propios: 0, goles_rival: 1 }];
    const eventos = [ev(1, 'a', { accion: 'Gol', id_jugador: 1 }), ev(2, 'a', { accion: 'Pase', id_jugador: 2 }),
      ev(3, 'b', { accion: 'Pase', id_jugador: 9, quinteto_activo: JSON.stringify(['6', '7', '8', '9', '10']) })];
    const pj = partidosDelJugador(jugador, partidos, eventos);
    expect(pj.map((p) => p.id)).toEqual(['a']);
    expect(pj[0]).toMatchObject({ goles: 1, resultado: 'G', marcador: '2-1' });
  });
});
