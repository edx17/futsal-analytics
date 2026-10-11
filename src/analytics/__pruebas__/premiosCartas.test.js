import { describe, it, expect } from 'vitest';
import {
  PREMIOS, etiquetaMes, fechaCorta, indicePorId, cartaDeFicha, cartasDeRegistro,
  registroAFila, filaARegistro, datosDePlaca, descripcionRegistro, rankingDestacados,
  etiquetaCorta, registrosDeTodo, cartasDePremios, armarBanco, claveCarta,
} from '../premiosCartas';
import { premiosDelPartido, premiosDelMes, premioTemporada, registrosDePartido, registrosDeMes, registroTemporada } from '../premios';

const jugadores = [
  { id: 1, nombre: 'Ana', apellido: 'Paz', dorsal: 1, foto: 'a.jpg', categoria: 'Tercera', posicion: 'Arquero' },
  { id: 2, nombre: 'Bruno', apellido: 'Gil', dorsal: 7, foto: null, categoria: 'Tercera', posicion: 'Ala' },
  { id: 3, nombre: 'Carlos', apellido: 'Lopez', dorsal: 9, foto: 'c.jpg', categoria: 'Tercera', posicion: 'Pivot' },
];
const porId = indicePorId(jugadores);
const c = (id, rol, rating, extra = {}) => ({ id: String(id), rol, rating, participacion: 0.8, goles: 0, asistencias: 0, ...extra });
const partido = { id: 'p1', fecha: '2026-10-08', rival: 'Los Pibes', golesFavor: 4, golesContra: 2,
  jugadores: [c(1, 'ARQ', 7), c(2, 'ALA', 7.5, { goles: 1 }), c(3, 'PIV', 7.6, { goles: 2, asistencias: 1 })] };

describe('textos', () => {
  it('cinco premios con sigla y título', () => {
    expect(Object.keys(PREMIOS)).toEqual(['POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY']);
    expect(PREMIOS.TOTM.quinteto).toBe(true);
    expect(PREMIOS.POTM.quinteto).toBe(false);
  });
  it('mes y fecha sin pasar por Date', () => {
    expect(etiquetaMes('2026-10')).toBe('Octubre 2026');
    expect(etiquetaMes('')).toBe('');
    expect(fechaCorta('2026-10-08')).toBe('08/10/2026');
    expect(fechaCorta(null)).toBe('');
  });
});

describe('cartaDeFicha', () => {
  it('completa la ficha con la del plantel y pasa la nota a la escala de las cartas', () => {
    const carta = cartaDeFicha({ id: '3', rol: 'PIV', nota: 8, goles: 2, asistencias: 1, pj: 5 }, porId);
    expect(carta.apellido).toBe('Lopez');
    expect(carta.foto).toBe('c.jpg');
    expect(carta.ovr).toBe(90);
    expect(carta.pj).toBe(5);
    expect(carta.destacado).toBe(false);
  });
  it('marca al destacado', () => {
    expect(cartaDeFicha({ id: '3', rol: 'PIV', nota: 8 }, porId, { destacadoId: 3 }).destacado).toBe(true);
  });
  it('un id que no está en el plantel no rompe: queda sin nombre', () => {
    const carta = cartaDeFicha({ id: '99', rol: 'ALA', nota: 7 }, porId);
    expect(carta.nombre).toBe('');
    expect(carta.foto).toBeNull();
    expect(carta.ovr).toBe(78);
  });
});

describe('del premio a la base y de vuelta', () => {
  const pr = premiosDelPartido(partido);
  const [potw, totw] = registrosDePartido(pr);

  it('la fila lleva la foto de las cartas y el id del destacado', () => {
    const fila = registroAFila(totw, porId, { clubId: 'club-1', categoria: 'Tercera' });
    expect(fila.club_id).toBe('club-1');
    expect(fila.tipo).toBe('TOTW');
    expect(fila.periodo).toBe('p1');
    expect(fila.torneo_id).toBe('Todos');
    expect(fila.destacado_id).toBe(3);
    expect(fila.jugadores).toHaveLength(3);
    expect(fila.jugadores[0].apellido).toBe('Paz');
    expect(fila.fecha_ref).toBe('2026-10-08');
  });

  it('el POTW es un registro de una sola carta', () => {
    expect(cartasDeRegistro(potw, porId)).toHaveLength(1);
  });

  it('al leerla, vuelve el mismo registro y el destacado queda marcado', () => {
    const fila = registroAFila(totw, porId, { clubId: 'club-1' });
    const r = filaARegistro({ ...fila, id: 'x' });
    expect(r.tipo).toBe('TOTW');
    expect(r.cartas.find((k) => k.destacado).id).toBe('3');
    expect(r.cartas.filter((k) => k.destacado)).toHaveLength(1);
  });
});

describe('datosDePlaca', () => {
  it('partido: rival, marcador y fecha', () => {
    const [potw] = registrosDePartido(premiosDelPartido(partido));
    const d = datosDePlaca({ ...potw, cartas: cartasDeRegistro(potw, porId) });
    expect(d.sigla).toBe('POTW');
    expect(d.subtitulo).toBe('VS LOS PIBES · 4-2');
    expect(d.derecha).toBe('08/10/2026');
    expect(d.quinteto).toBe(false);
  });

  it('mes: el nombre del mes y el mínimo', () => {
    const partidos = [partido, { ...partido, id: 'p2', fecha: '2026-10-15' }, { ...partido, id: 'p3', fecha: '2026-10-22' }];
    const [potm, totm] = registrosDeMes(premiosDelMes(partidos, '2026-10'));
    const d = datosDePlaca({ ...totm, cartas: cartasDeRegistro(totm, porId), categoria: 'Tercera' });
    expect(potm.tipo).toBe('POTM');
    expect(d.subtitulo).toBe('OCTUBRE 2026');
    expect(d.quinteto).toBe(true);
    expect(d.derecha).toBe('TERCERA');
    expect(d.detalle).toBe('Se jugaron 3 partidos · mínimo 2 para entrar');
  });

  it('temporada: el año y el 65%', () => {
    const partidos = Array.from({ length: 10 }, (_, i) => ({ ...partido, id: `t${i}`, fecha: `2026-0${(i % 9) + 1}-10` }));
    const toty = registroTemporada(premioTemporada(partidos), partidos);
    const d = datosDePlaca({ ...toty, cartas: cartasDeRegistro(toty, porId) });
    expect(d.sigla).toBe('TOTY');
    expect(d.subtitulo).toBe('TEMPORADA 2026');
    expect(d.detalle).toBe('Jugó al menos 7 de 10 partidos del equipo');
  });
});

describe('historial', () => {
  const carta = (id, destacado = false) => ({ id, nombre: 'N' + id, apellido: 'A' + id, destacado });

  it('describe cada tipo de registro', () => {
    expect(descripcionRegistro({ tipo: 'POTW', contexto: { rival: 'Sur', golesFavor: 3, golesContra: 1, fecha: '2026-10-01' }, categoria: 'Todas' }))
      .toBe('vs SUR 3-1 · 01/10/2026');
    expect(descripcionRegistro({ tipo: 'TOTM', periodo: '2026-09', contexto: { mes: '2026-09' }, categoria: 'Tercera' }))
      .toBe('Septiembre 2026 · Tercera');
    expect(descripcionRegistro({ tipo: 'TOTY', periodo: '2026', categoria: 'Todas' })).toBe('Temporada 2026');
  });

  it('el ranking cuenta premios individuales y apariciones en quintetos', () => {
    const r = rankingDestacados([
      { tipo: 'POTW', cartas: [carta('1', true)] },
      { tipo: 'POTM', cartas: [carta('1', true)] },
      { tipo: 'POTW', cartas: [carta('2', true)] },
      { tipo: 'TOTW', cartas: [carta('1', true), carta('2'), carta('3')] },
      { tipo: 'TOTM', cartas: [carta('3', true), carta('2')] },
    ]);
    expect(r.map((f) => f.id)).toEqual(['1', '2', '3']);
    expect(r[0].individuales).toBe(2);
    expect(r[0].quintetos).toBe(1);
    expect(r[1].individuales).toBe(1);
    expect(r[1].quintetos).toBe(2);
    expect(r[2].individuales).toBe(0);   // ser el destacado de un quinteto no suma como premio individual
    expect(r[2].quintetos).toBe(2);
  });
});

describe('premios como cartas para jugar', () => {
  const p2 = { id: 'p2', fecha: '2026-11-02', rival: 'Sur', golesFavor: 1, golesContra: 1,
    jugadores: [c(1, 'ARQ', 6), c(2, 'ALA', 6.5), c(3, 'PIV', 8.1, { goles: 1 })] };
  const partidos = [partido, p2];
  const cb = (id, rol) => ({ id: String(id), nombre: 'N' + id, apellido: 'A' + id, rol, ovr: 70, tier: 'plata', enEvaluacion: false, atributos: [], forma: [],
    stats: { pj: 5, min: 120, goles: 3, asist: 1, rating: 6.5 } });
  const base = [cb(1, 'ARQ'), cb(2, 'ALA'), cb(3, 'PIV')];

  it('hay premios de cada partido, de cada mes y de la temporada', () => {
    const tipos = new Set(registrosDeTodo(partidos).map((r) => r.tipo));
    expect([...tipos].sort()).toEqual(['POTM', 'POTW', 'TOTM', 'TOTW', 'TOTY']);
  });

  it('un jugador puede tener varias cartas de premio, cada una con clave propia', () => {
    const cartas = cartasDePremios(partidos, base);
    const deCarlos = cartas.filter((x) => x.id === '3');
    expect(deCarlos.length).toBeGreaterThan(2);
    expect(new Set(cartas.map((x) => x.clave)).size).toBe(cartas.length);
    expect(deCarlos.every((x) => x.premio && x.edicion)).toBe(true);
  });

  it('la carta de premio lleva la nota de ese premio, no la del año', () => {
    const potw = cartasDePremios(partidos, base).find((x) => x.clave === claveCarta('POTW', 'p2', '3'));
    expect(potw.stats.rating).toBe(8.1);
    expect(potw.ovr).toBe(91);
    expect(potw.stats.min).toBeNull();
    expect(potw.atributos).toBe(base[2].atributos);
  });

  it('un jugador sin carta base en el filtro se saltea', () => {
    const cartas = cartasDePremios(partidos, base.filter((b) => b.id !== '3'));
    expect(cartas.some((x) => x.id === '3')).toBe(false);
  });

  it('TOTY sale una vez por año', () => {
    const anios = [partido, { ...p2, id: 'p3', fecha: '2027-02-02' }];
    const tipos = registrosDeTodo(anios).filter((r) => r.tipo === 'TOTY').map((r) => r.periodo).sort();
    expect(tipos).toEqual(['2026', '2027']);
  });

  it('el banco no muestra ninguna carta de un jugador que ya está en la cancha', () => {
    const premios = cartasDePremios(partidos, base);
    const banco = armarBanco(base, premios, ['1', '3', null, null, null], 'TODAS');
    expect(banco.some((x) => x.id === '3' || x.id === '1')).toBe(false);
    expect(banco.some((x) => x.id === '2' && x.premio)).toBe(true);
  });

  it('el filtro del banco por tipo', () => {
    const premios = cartasDePremios(partidos, base);
    expect(armarBanco(base, premios, [], 'BASE').every((x) => !x.premio)).toBe(true);
    const toty = armarBanco(base, premios, [], 'TOTY');
    expect(toty.length).toBeGreaterThan(0);
    expect(toty.every((x) => x.premio === 'TOTY')).toBe(true);
  });

  it('etiquetas cortas para la carta', () => {
    expect(etiquetaCorta({ tipo: 'TOTW', periodo: 'p1', fechaRef: '2026-10-08', contexto: { rival: 'Los Pibes', fecha: '2026-10-08' } })).toBe('TOTW LOS 08/10');
    expect(etiquetaCorta({ tipo: 'TOTM', periodo: '2026-09' })).toBe('TOTM SEP 26');
    expect(etiquetaCorta({ tipo: 'TOTY', periodo: '2026' })).toBe('TOTY 2026');
  });
});
