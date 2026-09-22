import { describe, it, expect } from 'vitest';
import {
  ordenarAlertas, franjaDeHoy, cuandoEsElPartido,
  rankAccesos, leerUso, anotarUso,
  TOPE_TRIAGE, LS_USO_ACCESOS, ACCESOS_VISIBLES,
} from '../tablero.js';

const HOY = '2026-09-22';
const MANANA = '2026-09-23';

const ev = (tipo, fecha, extra = {}) => ({ id: `${tipo}-${fecha}-${extra.n || 0}`, tipo, fecha, hora: null, titulo: tipo, ...extra });

/* Un storage de mentira, para no depender del navegador ni ensuciar el real. */
const storageFalso = (inicial = {}) => {
  let datos = { ...inicial };
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    _datos: () => datos,
  };
};

describe('ordenarAlertas', () => {
  const dan = (n) => ({ nivel: 'danger', titulo: `grave ${n}` });
  const war = (n) => ({ nivel: 'warning', titulo: `aviso ${n}` });

  it('pone lo grave antes que lo que sólo avisa', () => {
    const r = ordenarAlertas([war(1), dan(1), war(2), dan(2)]);
    expect(r.map((a) => a.titulo)).toEqual(['grave 1', 'grave 2', 'aviso 1', 'aviso 2']);
  });

  it('dentro del mismo nivel respeta el orden de llegada', () => {
    const r = ordenarAlertas([war(1), war(2), war(3)]);
    expect(r.map((a) => a.titulo)).toEqual(['aviso 1', 'aviso 2', 'aviso 3']);
  });

  it('corta en 8, no en 6', () => {
    const muchas = Array.from({ length: 20 }, (_, i) => war(i));
    expect(ordenarAlertas(muchas)).toHaveLength(TOPE_TRIAGE);
    expect(TOPE_TRIAGE).toBe(8);
  });

  it('lo grave entra aunque haya llegado último', () => {
    // El caso real: siete suspendidos cargados primero y el aviso de carga en
    // riesgo agregado al final. Antes se perdía; ahora encabeza.
    const alertas = [...Array.from({ length: 7 }, (_, i) => war(i)), dan(99)];
    expect(ordenarAlertas(alertas)[0].titulo).toBe('grave 99');
  });

  it('no rompe con la lista vacía ni con niveles raros', () => {
    expect(ordenarAlertas([])).toEqual([]);
    expect(ordenarAlertas()).toEqual([]);
    const raras = ordenarAlertas([{ nivel: 'qué sé yo' }, { nivel: 'danger' }]);
    expect(raras[0].nivel).toBe('danger');
  });

  it('no toca el arreglo que le pasaron', () => {
    const original = [war(1), dan(1)];
    const copia = [...original];
    ordenarAlertas(original);
    expect(original).toEqual(copia);
  });
});

describe('franjaDeHoy', () => {
  const semana = [
    ev('entrenamiento', HOY, { hora: '19:30', titulo: 'Táctico' }),
    ev('partido', MANANA, { hora: '21:00', titulo: 'vs Racing' }),
    ev('cumple', '2026-09-25'),
  ];

  it('separa lo de hoy de lo de mañana', () => {
    const f = franjaDeHoy({ semana, triage: [], hoy: HOY });
    expect(f.hoy.map((e) => e.titulo)).toEqual(['Táctico']);
    expect(f.manana.map((e) => e.titulo)).toEqual(['vs Racing']);
  });

  it('encuentra el partido más cercano y a cuántos días está', () => {
    const f = franjaDeHoy({ semana, triage: [], hoy: HOY });
    expect(f.partido.titulo).toBe('vs Racing');
    expect(f.diasAlPartido).toBe(1);
  });

  it('el partido de hoy está a cero días, no a uno', () => {
    const f = franjaDeHoy({ semana: [ev('partido', HOY, { titulo: 'vs Boca' })], triage: [], hoy: HOY });
    expect(f.diasAlPartido).toBe(0);
  });

  it('cuenta los avisos y aparte los graves', () => {
    const triage = [{ nivel: 'danger' }, { nivel: 'warning' }, { nivel: 'warning' }];
    const f = franjaDeHoy({ semana, triage, hoy: HOY });
    expect(f.avisos).toBe(3);
    expect(f.graves).toBe(1);
  });

  it('se declara vacía cuando no hay nada que decir', () => {
    expect(franjaDeHoy({ semana: [], triage: [], hoy: HOY }).vacia).toBe(true);
  });

  it('no está vacía si hay avisos aunque no haya agenda', () => {
    expect(franjaDeHoy({ semana: [], triage: [{ nivel: 'warning' }], hoy: HOY }).vacia).toBe(false);
  });

  it('no está vacía si hay un partido más adelante aunque hoy no pase nada', () => {
    const f = franjaDeHoy({ semana: [ev('partido', '2026-09-27')], triage: [], hoy: HOY });
    expect(f.vacia).toBe(false);
    expect(f.hoy).toEqual([]);
  });

  it('no se cae sin argumentos', () => {
    expect(franjaDeHoy().vacia).toBe(true);
  });
});

describe('cuandoEsElPartido', () => {
  it('dice hoy, mañana o cuántos días', () => {
    expect(cuandoEsElPartido(0)).toBe('HOY');
    expect(cuandoEsElPartido(1)).toBe('MAÑANA');
    expect(cuandoEsElPartido(4)).toBe('EN 4 DÍAS');
  });

  it('no dice nada si no hay partido o ya pasó', () => {
    expect(cuandoEsElPartido(null)).toBe(null);
    expect(cuandoEsElPartido(-2)).toBe(null);
  });
});

describe('rankAccesos', () => {
  const links = [
    { titulo: 'Nuevo Partido', ruta: '/nuevo-partido' },
    { titulo: 'Microciclo', ruta: '/microciclo' },
    { titulo: 'Wellness', ruta: '/wellness' },
    { titulo: 'Plantel', ruta: '/plantel' },
  ];

  it('pone adelante lo más usado', () => {
    const r = rankAccesos(links, { '/wellness': 10, '/plantel': 3 });
    expect(r.map((l) => l.ruta)).toEqual(['/wellness', '/plantel', '/nuevo-partido', '/microciclo']);
  });

  it('los que nunca se usaron conservan su orden original entre ellos', () => {
    // Si no, una pantalla nueva quedaría enterrada para siempre por no tener
    // historial: la trampa clásica de ordenar por uso.
    const r = rankAccesos(links, { '/plantel': 1 });
    expect(r.map((l) => l.ruta)).toEqual(['/plantel', '/nuevo-partido', '/microciclo', '/wellness']);
  });

  it('sin historial devuelve la lista tal cual', () => {
    expect(rankAccesos(links, {}).map((l) => l.ruta)).toEqual(links.map((l) => l.ruta));
    expect(rankAccesos(links).map((l) => l.ruta)).toEqual(links.map((l) => l.ruta));
  });

  it('ignora un contador con basura adentro', () => {
    const r = rankAccesos(links, { '/wellness': 'muchas', '/plantel': 2 });
    expect(r[0].ruta).toBe('/plantel');
  });

  it('no toca la lista original', () => {
    const copia = [...links];
    rankAccesos(links, { '/wellness': 5 });
    expect(links).toEqual(copia);
  });

  it('muestra seis por defecto', () => {
    expect(ACCESOS_VISIBLES).toBe(6);
  });
});

describe('contador de uso', () => {
  it('arranca vacío y suma de a uno', () => {
    const s = storageFalso();
    expect(leerUso(s)).toEqual({});
    expect(anotarUso('/plantel', s)).toEqual({ '/plantel': 1 });
    expect(anotarUso('/plantel', s)).toEqual({ '/plantel': 2 });
  });

  it('lo guardado se puede volver a leer', () => {
    const s = storageFalso();
    anotarUso('/wellness', s);
    expect(leerUso(s)).toEqual({ '/wellness': 1 });
  });

  it('aguanta un storage con JSON roto', () => {
    const s = storageFalso({ [LS_USO_ACCESOS]: '{esto no es json' });
    expect(leerUso(s)).toEqual({});
    expect(anotarUso('/plantel', s)).toEqual({ '/plantel': 1 });
  });

  it('aguanta que adentro haya algo que no es un objeto', () => {
    expect(leerUso(storageFalso({ [LS_USO_ACCESOS]: '[1,2,3]' }))).toEqual({});
    expect(leerUso(storageFalso({ [LS_USO_ACCESOS]: '"hola"' }))).toEqual({});
  });

  it('si el storage está bloqueado no rompe y devuelve lo que había', () => {
    // Modo privado: getItem anda, setItem tira.
    const s = { getItem: () => '{"/plantel":4}', setItem: () => { throw new Error('bloqueado'); } };
    expect(anotarUso('/wellness', s)).toEqual({ '/plantel': 4 });
  });

  it('sin ruta no anota nada', () => {
    const s = storageFalso();
    expect(anotarUso(null, s)).toEqual({});
  });
});
