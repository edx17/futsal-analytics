import { describe, it, expect } from 'vitest';
import {
  construirAgenda, cumpleEnRango, porDia, conteoPorTipo,
  sumarDias, diasEntre, soloDia,
} from '../agenda.js';

const JUGS = [
  { id: 1, nombre: 'Lucho', apellido: 'Pérez', categoria: 'Primera', fechanac: '1998-03-14', vencimiento_apto: '2026-04-10' },
  { id: 2, nombre: 'Tato',  apellido: 'Gómez', categoria: 'Sub 20',  fechanac: '2005-04-02', vencimiento_apto: null },
  { id: 3, nombre: 'Bisi',  apellido: 'León',  categoria: 'Primera', fechanac: '2000-02-29', vencimiento_apto: null },
];

const PARTIDOS = [
  { id: 10, fecha: '2026-04-04', horario: '21:30:00', rival: 'Racing', categoria: 'Primera', condicion: 'Local', competicion: 'Liga', jornada: 7, estado: 'Pendiente' },
  { id: 11, fecha: '2026-04-04', horario: '19:00',    rival: 'River',  categoria: 'Sub 20',  condicion: 'Visitante', estado: 'Pendiente' },
];

const SESIONES = [
  { id: 20, fecha: '2026-04-04', tipo_sesion: 'Activación', objetivo: 'Pelota parada', categoria_equipo: 'Primera', nivel_carga: 'Baja', tareas_ids: [1, 2] },
];

const DEUDAS = [
  { id: 30, jugador_id: 1, concepto: 'Cuota abril', monto_original: 20000, monto_pagado: 0,     fecha_vencimiento: '2026-04-05' },
  { id: 31, jugador_id: 2, concepto: 'Cuota abril', monto_original: 20000, monto_pagado: 20000, fecha_vencimiento: '2026-04-05' },
];

/* Las columnas son las de la migracion 20260911170000_lesiones.sql, tal cual.
   Un fixture que se inventa una columna no prueba nada: la primera version de
   esto pedia `diagnostico` y `tipo_lesion`, que no existen, y la prueba pasaba
   en verde mientras la pantalla se moria con un 400. */
const LESIONES = [
  { id: 40, jugador_id: 1, fecha_alta_estimada: '2026-04-06', estado: 'activa', zona: 'Isquiosurales', tipo: 'Muscular', gravedad: 'Leve' },
  { id: 41, jugador_id: 2, fecha_alta_estimada: '2026-04-06', estado: 'alta', fecha_alta_real: '2026-04-01' },
];

const todo = (extra = {}) => construirAgenda({
  partidos: PARTIDOS, sesiones: SESIONES, jugadores: JUGS, deudas: DEUDAS, lesiones: LESIONES,
  desde: '2026-04-01', hasta: '2026-04-30', ...extra,
});

describe('fechas', () => {
  it('suma días cruzando el fin de mes', () => {
    expect(sumarDias('2026-04-28', 5)).toBe('2026-05-03');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('mide la distancia entre dos días', () => {
    expect(diasEntre('2026-04-01', '2026-04-08')).toBe(7);
    expect(diasEntre('2026-04-08', '2026-04-01')).toBe(-7);
    expect(diasEntre('2026-04-01', '2026-04-01')).toBe(0);
  });

  it('no se corre un día por el huso horario', () => {
    // El bug clásico: new Date('2026-03-14') en Argentina da el 13 a la noche.
    expect(soloDia('2026-03-14T00:00:00+00:00')).toBe('2026-03-14');
    expect(soloDia('2026-03-14')).toBe('2026-03-14');
  });
});

describe('cumpleaños', () => {
  it('proyecta el cumple al año de la ventana', () => {
    expect(cumpleEnRango('1998-03-14', '2026-03-01', '2026-03-31'))
      .toEqual([{ dia: '2026-03-14', anios: 28 }]);
  });

  it('no lo trae si cae fuera de la ventana', () => {
    expect(cumpleEnRango('1998-03-14', '2026-04-01', '2026-04-30')).toEqual([]);
  });

  it('aparece una vez por año cuando la ventana cruza el año', () => {
    const r = cumpleEnRango('1998-03-14', '2025-01-01', '2026-12-31');
    expect(r.map((x) => x.dia)).toEqual(['2025-03-14', '2026-03-14']);
  });

  it('el 29 de febrero se festeja el 28 en los años comunes', () => {
    expect(cumpleEnRango('2000-02-29', '2026-02-01', '2026-02-28'))
      .toEqual([{ dia: '2026-02-28', anios: 26 }]);
    expect(cumpleEnRango('2000-02-29', '2028-02-01', '2028-02-29'))
      .toEqual([{ dia: '2028-02-29', anios: 28 }]);
  });

  it('aguanta una fecha vacía o rota sin romperse', () => {
    expect(cumpleEnRango(null, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(cumpleEnRango('ayer', '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('construirAgenda', () => {
  it('junta las seis fuentes en una sola lista', () => {
    // Tato cumple el 2 de abril, asi que el cumple tambien cae en la ventana.
    const tipos = new Set(todo().map((e) => e.tipo));
    expect([...tipos].sort()).toEqual(['alta', 'apto', 'cumple', 'cuota', 'entrenamiento', 'partido']);
  });

  it('ordena por día, y dentro del día con hora primero y después por prioridad', () => {
    const delDia = todo().filter((e) => e.fecha === '2026-04-04');
    expect(delDia.map((e) => [e.tipo, e.hora])).toEqual([
      ['partido', '19:00'],        // el de Sub 20 es más temprano
      ['partido', '21:30'],
      ['entrenamiento', null],     // sin hora, va después
    ]);
  });

  it('respeta el filtro por categoría', () => {
    const r = todo({ categoria: 'Sub 20' });
    expect(r.every((e) => e.categoria === 'Sub 20')).toBe(true);
    expect(r.some((e) => e.id === 'partido-11')).toBe(true);
    expect(r.some((e) => e.id === 'partido-10')).toBe(false);
  });

  it('no trae la cuota que ya está paga', () => {
    const cuotas = todo().filter((e) => e.tipo === 'cuota');
    expect(cuotas.map((e) => e.id)).toEqual(['cuota-30']);
  });

  it('no trae el alta del que ya volvió', () => {
    const altas = todo().filter((e) => e.tipo === 'alta');
    expect(altas.map((e) => e.id)).toEqual(['alta-40']);
  });

  it('el alta describe la lesión con las columnas que existen', () => {
    const alta = todo().find((e) => e.tipo === 'alta');
    expect(alta.sub).toBe('Isquiosurales · Muscular · Leve');
  });

  it('si la lesión no tiene esos datos igual dice algo útil', () => {
    const pelada = [{ id: 42, jugador_id: 1, fecha_alta_estimada: '2026-04-06', estado: 'activa' }];
    const r = construirAgenda({ lesiones: pelada, jugadores: JUGS, desde: '2026-04-01', hasta: '2026-04-30' });
    expect(r.find((e) => e.tipo === 'alta').sub).toBe('Vuelve a estar disponible');
  });

  it('deja afuera lo que cae fuera de la ventana', () => {
    const r = construirAgenda({ partidos: PARTIDOS, desde: '2026-05-01', hasta: '2026-05-31' });
    expect(r).toEqual([]);
  });

  it('incluye los dos extremos de la ventana', () => {
    const r = construirAgenda({ partidos: PARTIDOS, desde: '2026-04-04', hasta: '2026-04-04' });
    expect(r).toHaveLength(2);
  });

  it('devuelve vacío si la ventana está al revés o rota', () => {
    expect(construirAgenda({ partidos: PARTIDOS, desde: '2026-04-30', hasta: '2026-04-01' })).toEqual([]);
    expect(construirAgenda({ partidos: PARTIDOS, desde: 'cuando sea', hasta: '2026-04-01' })).toEqual([]);
    expect(construirAgenda()).toEqual([]);
  });

  it('no se cae con las tablas vacías', () => {
    expect(construirAgenda({ desde: '2026-04-01', hasta: '2026-04-30' })).toEqual([]);
  });

  it('el apto vencido sale con nombre y apellido', () => {
    const apto = todo().find((e) => e.tipo === 'apto');
    expect(apto.titulo).toBe('Vence el apto de Lucho Pérez');
    expect(apto.fecha).toBe('2026-04-10');
  });

  it('cada evento trae la ruta de la pantalla donde se resuelve', () => {
    todo().forEach((e) => expect(e.ruta).toMatch(/^\//));
  });

  it('los ids son únicos, así React no se confunde al pintar', () => {
    const ids = todo({ hasta: '2026-12-31' }).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('porDia y conteoPorTipo', () => {
  it('agrupa sin perder ni reordenar eventos', () => {
    const lista = todo();
    const grupos = porDia(lista);
    expect(grupos.reduce((a, g) => a + g.eventos.length, 0)).toBe(lista.length);
    expect(grupos.map((g) => g.fecha)).toEqual([...grupos.map((g) => g.fecha)].sort());
  });

  it('cuenta cada tipo, y deja en cero los que no aparecen', () => {
    const c = conteoPorTipo(todo());
    expect(c.partido).toBe(2);
    expect(c.entrenamiento).toBe(1);
    expect(c.cumple).toBe(1);
    // Los tipos sin eventos igual vienen en cero, asi el filtro no parpadea.
    expect(conteoPorTipo([]).cuota).toBe(0);
  });
});
