import { describe, it, expect } from 'vitest';
import {
  premiosDelPartido, premiosDelMes, premioTemporada, registrosDefinitivos, armarQuinteto,
  minimoPartidosMes, minimoPartidosTemporada, ovrDeNota, ultimoPartido, mesesConPartidos,
} from '../premios';

const j = (id, rol, rating, extra = {}) => ({ id: String(id), rol, rating, participacion: 0.8, goles: 0, asistencias: 0, ...extra });

/* Un partido con un plantel de siete: dos arqueros y cinco de campo. */
const partido = (id, fecha, jugadores, gf = 3, gc = 1) => ({ id, fecha, rival: 'RIVAL', golesFavor: gf, golesContra: gc, jugadores });

describe('mínimos', () => {
  it('mes: la mitad más uno', () => {
    expect(minimoPartidosMes(5)).toBe(3);
    expect(minimoPartidosMes(4)).toBe(3);
    expect(minimoPartidosMes(2)).toBe(2);
    expect(minimoPartidosMes(1)).toBe(1);
    expect(minimoPartidosMes(0)).toBe(0);
  });
  it('temporada: 65% redondeado para arriba', () => {
    expect(minimoPartidosTemporada(20)).toBe(13);
    expect(minimoPartidosTemporada(10)).toBe(7);
    expect(minimoPartidosTemporada(3)).toBe(2);
  });
  it('la nota se pasa a la escala de las cartas', () => {
    expect(ovrDeNota(6)).toBe(65);
    expect(ovrDeNota(8)).toBe(90);
    expect(ovrDeNota(10)).toBe(99);
    expect(ovrDeNota(1)).toBe(40);
  });
});

describe('POTW y TOTW', () => {
  const p = partido('p1', '2026-10-01', [
    j(1, 'ARQ', 7.1), j(2, 'ARQ', 6.0),
    j(3, 'CIE', 7.4), j(4, 'CIE', 6.8), j(5, 'ALA', 8.0, { goles: 2 }), j(6, 'PIV', 7.9, { goles: 1, asistencias: 2 }), j(7, 'ALA', 6.1),
  ]);

  it('el POTW usa la misma regla que elegirMVP: a menos de 0,3, gana el de más goles+asistencias', () => {
    const r = premiosDelPartido(p);
    // 8.0 (2 goles = 2) vs 7.9 (1 gol + 2 asist = 3): quedan a 0,1 y gana el de 7.9
    expect(r.potw.id).toBe('6');
    expect(r.potw.nota).toBe(7.9);
  });

  it('el TOTW es arquero + cuatro de campo, y trae al POTW', () => {
    const r = premiosDelPartido(p);
    expect(r.totw.jugadores.length).toBe(5);
    expect(r.totw.jugadores[0].id).toBe('1');                       // el mejor arquero
    expect(r.totw.jugadores.map((c) => c.id)).toContain('6');
    expect(r.totw.jugadores.map((c) => c.id)).not.toContain('7');   // el peor de campo queda afuera
    expect(r.totw.sinArquero).toBe(false);
  });

  it('si el POTW es de campo pero quedaba fuera del corte, entra igual', () => {
    const muchos = partido('p2', '2026-10-02', [
      j(1, 'ARQ', 6.5),
      j(2, 'ALA', 8.0), j(3, 'ALA', 7.95), j(4, 'ALA', 7.9), j(5, 'ALA', 7.85),
      j(6, 'PIV', 7.8, { goles: 3 }),
    ]);
    const r = premiosDelPartido(muchos);
    expect(r.potw.id).toBe('6');
    expect(r.totw.jugadores.map((c) => c.id)).toContain('6');
    expect(r.totw.jugadores.length).toBe(5);
  });

  it('sin arquero, arma el quinteto con cinco de campo y lo avisa', () => {
    const sin = partido('p3', '2026-10-03', [j(1, 'ALA', 7), j(2, 'CIE', 6.9), j(3, 'PIV', 6.8), j(4, 'ALA', 6.7), j(5, 'ALA', 6.6), j(6, 'CIE', 6.0)]);
    const r = premiosDelPartido(sin);
    expect(r.totw.sinArquero).toBe(true);
    expect(r.totw.jugadores.length).toBe(5);
  });

  it('no elige a quien jugó un ratito aunque tenga una nota alta', () => {
    const cameo = partido('p4', '2026-10-04', [
      j(1, 'ARQ', 6.5), j(2, 'ALA', 7.0), j(3, 'ALA', 6.8),
      j(4, 'PIV', 9.5, { participacion: 0.05 }),
    ]);
    expect(premiosDelPartido(cameo).potw.id).toBe('2');
  });

  it('partido sin jugadores: null', () => {
    expect(premiosDelPartido(partido('x', '2026-10-05', []))).toBeNull();
  });
});

describe('POTM y TOTM', () => {
  /* Septiembre con 5 partidos: el mínimo es 3. */
  const sept = [
    partido('s1', '2026-09-03', [j(1, 'ARQ', 7), j(2, 'ALA', 9.0), j(3, 'CIE', 6.5), j(4, 'PIV', 7.0), j(5, 'ALA', 6.0)]),
    partido('s2', '2026-09-10', [j(1, 'ARQ', 7), j(2, 'ALA', 9.0), j(3, 'CIE', 6.5), j(4, 'PIV', 7.2), j(5, 'ALA', 6.0)]),
    partido('s3', '2026-09-17', [j(1, 'ARQ', 7), j(3, 'CIE', 6.5), j(4, 'PIV', 7.4), j(5, 'ALA', 6.0), j(6, 'ALA', 7.9)]),
    partido('s4', '2026-09-24', [j(1, 'ARQ', 7), j(3, 'CIE', 6.5), j(4, 'PIV', 7.6), j(5, 'ALA', 6.0), j(6, 'ALA', 7.9)]),
    partido('s5', '2026-09-30', [j(1, 'ARQ', 7), j(3, 'CIE', 6.5), j(4, 'PIV', 7.8), j(5, 'ALA', 6.0), j(6, 'ALA', 7.9)]),
  ];

  it('con 5 partidos hay que haber jugado 3', () => {
    const r = premiosDelMes(sept, '2026-09');
    expect(r.partidos).toBe(5);
    expect(r.minimo).toBe(3);
  });

  it('el 2 tiene la mejor nota (9.0) pero jugó 2 de 5: no puede ser POTM', () => {
    const r = premiosDelMes(sept, '2026-09');
    expect(r.potm.id).not.toBe('2');
    // 6 jugó 3 partidos con 7.9; 4 jugó 5 con promedio 7.4
    expect(r.potm.id).toBe('6');
    expect(r.potm.pj).toBe(3);
    expect(r.potm.nota).toBe(7.9);
  });

  it('el TOTM trae al POTM y no trae a quien no llegó al mínimo', () => {
    const r = premiosDelMes(sept, '2026-09');
    const ids = r.totm.jugadores.map((c) => c.id);
    expect(ids.length).toBe(5);
    expect(ids[0]).toBe('1');
    expect(ids).toContain('6');
    expect(ids).not.toContain('2');
  });

  it('mes sin partidos: null', () => {
    expect(premiosDelMes(sept, '2026-08')).toBeNull();
  });

  it('un mes con un solo partido alcanza con haber jugado ese partido', () => {
    const uno = [partido('u1', '2026-11-05', [j(1, 'ARQ', 7), j(2, 'ALA', 7.5)])];
    expect(premiosDelMes(uno, '2026-11').potm.id).toBe('2');
  });
});

describe('TOTY', () => {
  const temporada = Array.from({ length: 10 }, (_, i) => partido(`t${i}`, `2026-0${(i % 9) + 1}-10`, [
    j(1, 'ARQ', 6.5),
    ...(i < 3 ? [j(2, 'ALA', 9.5)] : []),                 // 3 de 10: muy bueno pero no llega al 65%
    j(3, 'CIE', 7.0), j(4, 'PIV', 7.3),
  ]));

  it('pide haber jugado el 65% de los partidos', () => {
    const r = premioTemporada(temporada);
    expect(r.partidos).toBe(10);
    expect(r.minimo).toBe(7);
    expect(r.toty.id).toBe('4');
    expect(r.toty.pj).toBe(10);
  });

  it('sin partidos: null', () => {
    expect(premioTemporada([])).toBeNull();
  });
});

describe('historial definitivo', () => {
  const partidos = [
    partido('a', '2026-09-10', [j(1, 'ARQ', 7), j(2, 'ALA', 7.5)]),
    partido('b', '2026-10-02', [j(1, 'ARQ', 7), j(2, 'ALA', 7.5)]),
  ];

  it('congela el POTW/TOTW de cada partido y el mes cerrado, no el mes en curso', () => {
    const r = registrosDefinitivos(partidos, '2026-10-09');
    const tipos = r.map((x) => `${x.tipo}:${x.periodo}`).sort();
    expect(tipos).toEqual(['POTM:2026-09', 'POTW:a', 'POTW:b', 'TOTM:2026-09', 'TOTW:a', 'TOTW:b']);
  });

  it('cada registro lleva fecha de referencia y destacado', () => {
    const r = registrosDefinitivos(partidos, '2026-10-09');
    const potm = r.find((x) => x.tipo === 'POTM');
    expect(potm.fechaRef).toBe('2026-09-30');
    expect(potm.destacadoId).toBe('2');
  });

  it('ayudantes de período', () => {
    expect(ultimoPartido(partidos).id).toBe('b');
    expect(mesesConPartidos(partidos)).toEqual(['2026-09', '2026-10']);
    expect(armarQuinteto([]).ids).toEqual([]);
  });
});
