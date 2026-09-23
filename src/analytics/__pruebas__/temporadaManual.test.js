import { describe, it, expect } from 'vitest';
import { analizarTemporadaGlobal } from '../seasonEngine.js';

/* EL BUG QUE REPORTÓ EL CLUB
   Los resultados se cargaron a mano en el fixture de Torneos: el marcador
   está en `partidos`, no hay un solo evento. La tira de ESTADO DE FORMA
   mostraba E E E E E —puros empates— y el balance daba 0 a 0.
   Estos son los partidos de la captura de pantalla, tal cual. */
const FIXTURE = [
  { id: 22, fecha: '2026-08-23', rival: 'ASTURIANO',      condicion: 'Visitante', goles_propios: 4, goles_rival: 2, estado: 'Finalizado' },
  { id: 23, fecha: '2026-08-30', rival: 'E. MALDONADO',   condicion: 'Local',     goles_propios: 3, goles_rival: 3, estado: 'Finalizado' },
  { id: 24, fecha: '2026-09-06', rival: 'JUV. TAPIALES',  condicion: 'Visitante', goles_propios: 2, goles_rival: 4, estado: 'Finalizado' },
  { id: 25, fecha: '2026-09-13', rival: 'PRIMERA JUNTA',  condicion: 'Visitante', goles_propios: 0, goles_rival: 1, estado: 'Finalizado' },
  { id: 26, fecha: '2026-09-20', rival: 'ALMAFUERTE',     condicion: 'Local',     goles_propios: 2, goles_rival: 4, estado: 'Finalizado' },
];

const TODAS = { categoria: 'Todas', competicion: 'Todas' };
const analizar = (partidos, eventos = []) => analizarTemporadaGlobal(partidos, eventos, [], TODAS);

describe('una temporada CARGADA A MANO', () => {
  it('la tira de forma muestra los resultados reales, no cinco empates', () => {
    const r = analizar(FIXTURE);
    expect(r.historialPartidos.map((p) => p.resultado)).toEqual(['V', 'E', 'D', 'D', 'D']);
  });

  it('el balance V-E-D es el correcto', () => {
    const { statsEquipo } = analizar(FIXTURE);
    expect(statsEquipo.victorias).toBe(1);
    expect(statsEquipo.empates).toBe(1);
    expect(statsEquipo.derrotas).toBe(3);
  });

  it('los goles a favor y en contra ya no dan cero', () => {
    const { statsEquipo } = analizar(FIXTURE);
    expect(statsEquipo.golesFavor).toBe(11);    // 4+3+2+0+2
    expect(statsEquipo.golesContra).toBe(14);   // 2+3+4+1+4
  });

  it('cada partido conserva su marcador', () => {
    const r = analizar(FIXTURE);
    expect(r.historialPartidos.map((p) => `${p.golesPropio}-${p.golesRival}`))
      .toEqual(['4-2', '3-3', '2-4', '0-1', '2-4']);
  });

  it('deja anotado que el marcador salió de la tabla y no de los eventos', () => {
    const r = analizar(FIXTURE);
    expect(r.historialPartidos.every((p) => p.origenMarcador === 'marcador')).toBe(true);
    expect(r.historialPartidos.every((p) => p.capturado === false)).toBe(true);
  });

  it('cuenta los partidos sin captura, para poder avisarlo en pantalla', () => {
    expect(analizar(FIXTURE).partidosSinCaptura).toBe(5);
  });

  it('lo que necesita captura sigue en cero, que es la verdad', () => {
    // No se puede inventar el xG de un partido que nadie capturó.
    const { statsEquipo } = analizar(FIXTURE);
    expect(statsEquipo.xgTotal).toBe(0);
    expect(statsEquipo.golesFavorPT + statsEquipo.golesFavorST).toBe(0);
  });
});

describe('una temporada CAPTURADA sigue funcionando igual', () => {
  const gol = (id_partido, equipo, periodo = 'PT') => ({ id_partido, equipo, accion: 'Gol', periodo, zona_x: 80, zona_y: 50 });
  const capturados = [
    { id: 1, fecha: '2026-03-01', rival: 'A', condicion: 'Local', goles_propios: 2, goles_rival: 1, estado: 'Finalizado' },
    { id: 2, fecha: '2026-03-08', rival: 'B', condicion: 'Visitante', goles_propios: 0, goles_rival: 2, estado: 'Finalizado' },
  ];
  const eventos = [
    gol(1, 'Propio'), gol(1, 'Propio', 'ST'), gol(1, 'Rival'),
    gol(2, 'Rival'), gol(2, 'Rival', 'ST'),
  ];

  it('los goles NO se cuentan dos veces', () => {
    // El marcador se suma una vez desde `partidos`; el bucle de eventos ya no
    // vuelve a sumarlo, sólo reparte entre primer y segundo tiempo.
    const { statsEquipo } = analizar(capturados, eventos);
    expect(statsEquipo.golesFavor).toBe(2);
    expect(statsEquipo.golesContra).toBe(3);
  });

  it('el reparto por tiempo sigue saliendo de los eventos', () => {
    const { statsEquipo } = analizar(capturados, eventos);
    expect(statsEquipo.golesFavorPT).toBe(1);
    expect(statsEquipo.golesFavorST).toBe(1);
    expect(statsEquipo.golesContraPT + statsEquipo.golesContraST).toBe(3);
  });

  it('los resultados son los mismos que antes del cambio', () => {
    const r = analizar(capturados, eventos);
    expect(r.historialPartidos.map((p) => p.resultado)).toEqual(['V', 'D']);
    expect(r.partidosSinCaptura).toBe(0);
  });
});

describe('temporada mezclada: unos capturados y otros a mano', () => {
  const partidos = [
    { id: 1, fecha: '2026-03-01', rival: 'A', condicion: 'Local', goles_propios: 3, goles_rival: 0, estado: 'Finalizado' },
    { id: 2, fecha: '2026-03-08', rival: 'B', condicion: 'Local', goles_propios: 1, goles_rival: 2, estado: 'Finalizado' },
  ];
  const eventos = [{ id_partido: 1, equipo: 'Propio', accion: 'Gol', periodo: 'PT', zona_x: 80, zona_y: 50 }];

  it('cada partido se resuelve con lo que tiene', () => {
    const r = analizar(partidos, eventos);
    expect(r.historialPartidos.map((p) => p.resultado)).toEqual(['V', 'D']);
    expect(r.historialPartidos.map((p) => p.capturado)).toEqual([true, false]);
    expect(r.partidosSinCaptura).toBe(1);
  });

  it('el total de goles suma los dos, sin duplicar el capturado', () => {
    const { statsEquipo } = analizar(partidos, eventos);
    expect(statsEquipo.golesFavor).toBe(4);   // 3 + 1
    expect(statsEquipo.golesContra).toBe(2);  // 0 + 2
  });
});
