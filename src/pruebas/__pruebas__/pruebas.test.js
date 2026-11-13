import { describe, it, expect } from 'vitest';
import { BLOQUES, TRANSVERSALES, bloquesDeEtapa, bloquesParaCierre, VERSION_RUBRICA } from '../rubrica';
import { CONFIG_DEFAULT, resolverConfig, erroresDeConfig, distintosDelDefault, restaurar, aPaso } from '../configDefault';
import { edadRelativa } from '../edadRelativa';
import { evaluarCandidato, semaforo, simular, ejesRadar } from '../evaluacionPrueba';

/* Puntúa todos los criterios de los bloques pedidos con el mismo número, para un evaluador. */
const cargar = (ev, bloques, puntaje) => bloques.flatMap((id) => {
  const b = [...BLOQUES, ...TRANSVERSALES].find((x) => x.id === id);
  return b.criterios.map((c) => ({ evaluador_id: ev, bloque: id, criterio: c.id, puntaje: typeof puntaje === 'function' ? puntaje(id) : puntaje }));
});
const ETAPA1 = ['sin_pelota', 'con_pelota', 'finalizacion', 'transiciones', 'tarea_jugada', 'inteligencia_juego', 'actitud'];

describe('pruebas: la rúbrica', () => {
  it('cada criterio tiene descriptores 1/3/5 e ids únicos dentro del bloque', () => {
    expect(VERSION_RUBRICA).toBe(1);
    [...BLOQUES, ...TRANSVERSALES].forEach((b) => {
      expect(b.id).toMatch(/^[a-z_]+$/);
      const ids = b.criterios.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      b.criterios.forEach((c) => { expect(c.id).toMatch(/^[a-z_]+$/); expect(Object.keys(c.descriptores)).toEqual(['1', '3', '5']); });
    });
  });
  it('la etapa 1 no tiene juego real; la 2 sí; los transversales en las dos', () => {
    expect(bloquesDeEtapa(1).map((b) => b.id)).toEqual(ETAPA1);
    expect(bloquesDeEtapa(2).map((b) => b.id)).toEqual(['juego_real', 'inteligencia_juego', 'actitud']);
    expect(bloquesParaCierre(1).some((b) => b.id === 'juego_real')).toBe(false);
    expect(bloquesParaCierre(2)).toHaveLength(8);
  });
});

describe('pruebas: configuración', () => {
  it('categoría > club > defaults', () => {
    expect(resolverConfig([], 'Primera').fuente).toBe('default');
    const filas = [
      { categoria: null, version: 3, umbrales: { incorporar: 4 }, ponderaciones: { Ala: { finalizacion: 1.5 } }, bloques_clave: {} },
      { categoria: 'Primera', version: 2, umbrales: { divergencia_min: 1 }, ponderaciones: {}, bloques_clave: { Pivot: 'tarea_jugada' } },
    ];
    const deCat = resolverConfig(filas, 'Primera');
    expect(deCat.fuente).toBe('categoria');
    expect(deCat.config.umbrales).toMatchObject({ incorporar: 4, divergencia_min: 1, seguir_observando: 3 });
    expect(deCat.config.ponderaciones.Ala.finalizacion).toBe(1.5);
    expect(deCat.config.bloques_clave.Pivot).toBe('tarea_jugada');
    expect(resolverConfig(filas, 'Reserva')).toMatchObject({ fuente: 'club', fila: { version: 3 } });
  });
  it('valida pesos, umbrales y bloque clave', () => {
    expect(erroresDeConfig(CONFIG_DEFAULT)).toEqual({});
    const mal = restaurar(CONFIG_DEFAULT);
    mal.ponderaciones.Cierre.sin_pelota = 2.5;
    mal.umbrales.incorporar = 3;
    mal.bloques_clave.Ala = 'volar';
    expect(Object.keys(erroresDeConfig(mal)).sort()).toEqual(['Cierre.sin_pelota', 'clave.Ala', 'umbrales.incorporar']);
  });
  it('marca lo distinto al default y restaura por puesto o todo', () => {
    const c = restaurar(CONFIG_DEFAULT);
    c.ponderaciones.Pivot.finalizacion = 1.2; c.umbrales.divergencia_min = 3;
    expect([...distintosDelDefault(c)].sort()).toEqual(['Pivot.finalizacion', 'umbrales.divergencia_min']);
    expect(distintosDelDefault(restaurar(c, 'Pivot')).has('Pivot.finalizacion')).toBe(false);
    expect(distintosDelDefault(restaurar(c)).size).toBe(0);
    expect(aPaso(1.2500001)).toBe(1.3);
  });
});

describe('pruebas: edad relativa', () => {
  it('trimestre y edad decimal a la fecha de la prueba', () => {
    expect(edadRelativa('2010-02-15', '2026-11-13')).toMatchObject({ trimestre: 1, etiqueta: 'Q1', edad: 16.7 });
    expect(edadRelativa('2010-11-30', '2026-11-13')).toMatchObject({ trimestre: 4, edad: 15.9 });
    expect(edadRelativa(null)).toBeNull();
  });
});

describe('pruebas: el motor', () => {
  const config = restaurar(CONFIG_DEFAULT);
  it('promedia por criterio entre evaluadores, pondera por puesto y da el semáforo', () => {
    const ev = [...cargar('a', ETAPA1, 4), ...cargar('b', ETAPA1, 4)];
    const r = evaluarCandidato({ evaluaciones: ev, puesto: 'Ala', config, etapa: 1 });
    expect(r).toMatchObject({ evaluadores: 2, suficiente: true, puntaje: 4, recomendacion: 'incorporar', limitadoPorBloqueClave: false });
    expect(r.divergencias).toEqual([]);
    expect(r.bloques.find((b) => b.id === 'juego_real')).toBeUndefined();
  });
  it('el peso cambia el resultado: un pivot que no define cae más que un ala', () => {
    const p = (id) => (id === 'finalizacion' ? 1 : 4);
    const ev = [...cargar('a', ETAPA1, p), ...cargar('b', ETAPA1, p)];
    const ala = evaluarCandidato({ evaluaciones: ev, puesto: 'Ala', config, etapa: 1 });
    const pivot = evaluarCandidato({ evaluaciones: ev, puesto: 'Pivot', config, etapa: 1 });
    expect(pivot.puntaje).toBeLessThan(ala.puntaje);
    expect(pivot.limitadoPorBloqueClave).toBe(false); // ya no llega a "incorporar"
    expect(pivot.aMejorar[0]).toMatchObject({ id: 'finalizacion', puntaje: 1 });
  });
  it('el bloque clave flojo limita a "seguir observando"', () => {
    const p = (id) => (id === 'transiciones' ? 2 : 5);
    const ev = [...cargar('a', ETAPA1, p), ...cargar('b', ETAPA1, p)];
    const r = evaluarCandidato({ evaluaciones: ev, puesto: 'Cierre', config, etapa: 1 });
    expect(r.puntaje).toBeGreaterThanOrEqual(3.8);
    expect(r).toMatchObject({ recomendacion: 'observar', limitadoPorBloqueClave: true, bloqueClave: { id: 'transiciones', puntaje: 2 } });
  });
  it('marca divergencia y avisa si falta un evaluador', () => {
    const ev = [...cargar('a', ['con_pelota'], 5), ...cargar('b', ['con_pelota'], 2)];
    const r = evaluarCandidato({ evaluaciones: ev, puesto: 'Ala', config, etapa: 1 });
    expect(r.divergencias).toEqual([{ id: 'con_pelota', nombre: 'Activación con pelota', diferencia: 3 }]);
    expect(evaluarCandidato({ evaluaciones: cargar('a', ['con_pelota'], 5), puesto: 'Ala', config, etapa: 1 }).suficiente).toBe(false);
  });
  it('el mínimo de evaluadores es configurable: con 1 alcanza con el DT', () => {
    const solo = restaurar(config); solo.umbrales.evaluadores_min = 1;
    const r = evaluarCandidato({ evaluaciones: cargar('dt', ETAPA1, 4), puesto: 'Ala', config: solo, etapa: 1 });
    expect(r).toMatchObject({ evaluadores: 1, minimoEvaluadores: 1, suficiente: true, divergencias: [] });
    const mal = restaurar(config); mal.umbrales.evaluadores_min = 1.5;
    expect(Object.keys(erroresDeConfig(mal))).toEqual(['umbrales.evaluadores_min']);
    mal.umbrales.evaluadores_min = 0;
    expect(Object.keys(erroresDeConfig(mal))).toEqual(['umbrales.evaluadores_min']);
  });
  it('la etapa 2 suma el juego real; sin puntajes no hay recomendación', () => {
    const ev = [...cargar('a', [...ETAPA1, 'juego_real'], 3), ...cargar('b', [...ETAPA1, 'juego_real'], 3)];
    expect(evaluarCandidato({ evaluaciones: ev, puesto: 'Ala', config, etapa: 2 }).bloques.find((b) => b.id === 'juego_real').puntaje).toBe(3);
    expect(evaluarCandidato({ evaluaciones: [], puesto: 'Ala', config, etapa: 1 })).toMatchObject({ puntaje: null, recomendacion: null });
    expect(semaforo(2.99, config)).toEqual({ recomendacion: 'no_incorporar', limitadoPorBloqueClave: false });
    expect(semaforo(3, config).recomendacion).toBe('observar');
  });
  it('la simulación muestra quién cambia de recomendación', () => {
    const ev = [...cargar('a', ETAPA1, 4), ...cargar('b', ETAPA1, 4)];
    const mas = restaurar(config); mas.umbrales.incorporar = 4.5; mas.umbrales.seguir_observando = 3.5;
    const s = simular([{ candidato: { id: 'x', puesto_principal: 'Ala' }, evaluaciones: ev, etapa: 1 }], config, mas);
    expect(s[0]).toMatchObject({ actual: { recomendacion: 'incorporar' }, nueva: { recomendacion: 'observar' }, cambia: true });
    expect(ejesRadar(evaluarCandidato({ evaluaciones: ev, puesto: 'Ala', config, etapa: 1 })).map((e) => e.id))
      .toEqual(['sin_pelota', 'con_pelota', 'finalizacion', 'transiciones', 'tarea_jugada']);
  });
});
