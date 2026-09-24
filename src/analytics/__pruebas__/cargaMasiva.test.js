import { describe, it, expect } from 'vitest';
import {
  leerFecha, normalizarCelda, leerPlanilla, planDeCarga, matrizExportacion, parsearCSV, COLUMNAS,
} from '../cargaMasiva.js';

const col = (k) => COLUMNAS.find((c) => c.k === k);

const PLANTEL = [
  { id: 7, apellido: 'Pérez', nombre: 'Lucho', categoria: 'Primera', dni: 45123456, dorsal: 10, fechanac: '2001-09-24', obra_social: null, contacto: '1155555555' },
  { id: 8, apellido: 'Gómez', nombre: 'Tato', categoria: 'Cuarta', dni: null, dorsal: 5 },
];

describe('fechas', () => {
  it('entiende las formas en que se escribe una fecha', () => {
    expect(leerFecha('02/05/2009')).toBe('2009-05-02');
    expect(leerFecha('2/5/09')).toBe('2009-05-02');
    expect(leerFecha('2/5/98')).toBe('1998-05-02');
    expect(leerFecha('2009-05-02')).toBe('2009-05-02');
    expect(leerFecha('02-05-2009')).toBe('2009-05-02');
    expect(leerFecha(new Date(Date.UTC(2009, 4, 2)))).toBe('2009-05-02');
  });

  it('rechaza fechas que no existen', () => {
    expect(leerFecha('31/02/2009')).toBeNull();
    expect(leerFecha('mañana')).toBeNull();
  });
});

describe('celdas', () => {
  it('vacía es "no tocar"', () => {
    expect(normalizarCelda(col('obra_social'), '  ')).toEqual({ valor: undefined });
    expect(normalizarCelda(col('dorsal'), null)).toEqual({ valor: undefined });
  });

  it('limpia DNI, celular y grupo sanguíneo', () => {
    expect(normalizarCelda(col('dni'), '45.123.456').valor).toBe('45123456');
    expect(normalizarCelda(col('contacto'), 1155555555).valor).toBe('1155555555');
    expect(normalizarCelda(col('grupo_sanguineo'), 'o+').valor).toBe('0+');
    expect(normalizarCelda(col('grupo_sanguineo'), 'A negativo').valor).toBe('A-');
    expect(normalizarCelda(col('grupo_sanguineo'), 'Z').error).toMatch(/Grupo/);
  });

  it('acepta opciones sin importar mayúsculas ni acentos', () => {
    expect(normalizarCelda(col('posicion'), 'ala pivot').valor).toBe('Ala Pivot');
    expect(normalizarCelda(col('posicion'), 'Delantero').error).toMatch(/Posición/);
  });

  it('números con coma decimal', () => {
    expect(normalizarCelda(col('peso'), '62,5').valor).toBe(62.5);
    expect(normalizarCelda(col('dorsal'), '7.5').error).toBeTruthy();
  });
});

describe('leer la planilla', () => {
  it('encuentra el encabezado aunque haya un título arriba e ignora columnas extra', () => {
    const r = leerPlanilla([
      ['PLANTEL 2026'],
      ['ID (NO TOCAR)', 'Apellido', 'Nombre', 'Teléfono', 'Comentarios'],
      ['7', 'Pérez', 'Lucho', '11 4444-4444', 'x'],
      ['', '', '', '', ''],
    ]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].nroFila).toBe(3);
    expect(r.filas[0].crudos.contacto).toBe('11 4444-4444');
    expect(r.ignoradas).toEqual(['Comentarios']);
  });

  it('avisa si no hay encabezado', () => {
    expect(leerPlanilla([['a', 'b']]).error).toMatch(/encabezado/);
  });
});

describe('plan de carga', () => {
  const plan = (matriz) => planDeCarga(leerPlanilla(matriz).filas, PLANTEL);
  const ENC = ['ID (NO TOCAR)', 'Apellido', 'Nombre', 'Categoría', 'DNI', 'Obra social', 'Dorsal'];

  it('detecta cambios y no toca lo que viene vacío', () => {
    const r = plan([ENC, ['7', 'Pérez', 'Lucho', 'Primera', '', 'OSDE', '10']]);
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0].diffs).toEqual([{ k: 'obra_social', t: 'Obra social', antes: null, despues: 'OSDE' }]);
    expect(r.cambios[0].datos).toEqual({ obra_social: 'OSDE' });
  });

  it('una fila igual a lo guardado no es un cambio', () => {
    const r = plan([ENC, ['7', 'Pérez', 'Lucho', 'Primera', '45123456', '', 10]]);
    expect(r.sinCambios).toBe(1);
    expect(r.cambios).toHaveLength(0);
  });

  it('da de alta los nuevos', () => {
    const r = plan([ENC, ['', 'Ruiz', 'Nico', 'Tercera', '46000000', '', '9']]);
    expect(r.nuevos).toEqual([{ nroFila: 2, datos: { apellido: 'Ruiz', nombre: 'Nico', categoria: 'Tercera', dni: '46000000', dorsal: 9 } }]);
  });

  it('frena un nuevo que parece un duplicado', () => {
    const porNombre = plan([ENC, ['', 'PEREZ', 'lucho', 'Primera', '', '', '']]);
    expect(porNombre.nuevos).toHaveLength(0);
    expect(porNombre.errores[0].problemas[0]).toMatch(/ya existe.*ID 7/);
    const porDni = plan([ENC, ['', 'Otro', 'Nombre', 'Primera', '45.123.456', '', '']]);
    expect(porDni.errores[0].problemas[0]).toMatch(/ya existe/);
  });

  it('un nuevo sin categoría no pasa', () => {
    const r = plan([ENC, ['', 'Ruiz', 'Nico', '', '', '', '']]);
    expect(r.errores[0].problemas).toContain('Para un jugador nuevo hace falta la Categoría');
  });

  it('un ID ajeno o repetido es un error de la fila entera', () => {
    const r = plan([ENC, ['99', 'X', 'Y', 'Primera', '', '', ''], ['7', 'Pérez', 'Lucho', '', '', 'OSDE', ''], ['7', 'Pérez', 'Lucho', '', '', 'IOMA', '']]);
    expect(r.errores.map((e) => e.nroFila)).toEqual([2, 4]);
    expect(r.cambios).toHaveLength(1);
  });

  it('no deja poner un DNI que ya tiene otro jugador', () => {
    const r = plan([ENC, ['8', 'Gómez', 'Tato', '', '45123456', '', '']]);
    expect(r.errores[0].problemas[0]).toMatch(/ya lo tiene Pérez/);
  });

  it('una fila con un dato mal no se guarda a medias', () => {
    const r = plan([['ID (NO TOCAR)', 'Apellido', 'Nombre', 'Obra social', 'Fecha de nacimiento'], ['7', 'Pérez', 'Lucho', 'OSDE', '31/02/2001']]);
    expect(r.cambios).toHaveLength(0);
    expect(r.errores[0].problemas[0]).toMatch(/Fecha de nacimiento/);
  });
});

describe('ida y vuelta', () => {
  it('lo que se exporta, subido sin tocar, no cambia nada', () => {
    const matriz = matrizExportacion(PLANTEL);
    expect(matriz[0][0]).toBe('ID (NO TOCAR)');
    const r = planDeCarga(leerPlanilla(matriz).filas, PLANTEL);
    expect(r).toMatchObject({ nuevos: [], cambios: [], errores: [], sinCambios: 2 });
  });

  it('exporta las fechas como las escribe el club', () => {
    const fila = matrizExportacion(PLANTEL).find((f) => f[0] === '7');
    expect(fila).toContain('24/09/2001');
  });
});

describe('CSV', () => {
  it('Excel en castellano (;) con comillas y BOM', () => {
    expect(parsearCSV('﻿Apellido;Nombre\r\n"Pérez; hijo";Lucho\r\n')).toEqual([['Apellido', 'Nombre'], ['Pérez; hijo', 'Lucho']]);
  });

  it('Google Sheets (,) con comillas escapadas y salto de línea adentro', () => {
    expect(parsearCSV('a,b\n"dijo ""hola""","x\ny"')).toEqual([['a', 'b'], ['dijo "hola"', 'x\ny']]);
  });
});
