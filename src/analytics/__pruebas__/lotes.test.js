import { describe, it, expect } from 'vitest';
import { fetchPorLotes } from '../../utils/supaPaginado.js';

/* Un doble del builder de supabase: devuelve `porId` filas por cada id del
   lote, y responde a .range() como lo hace PostgREST. */
const fabrica = (porId = 3, registro = null) => (lote) => ({
  range: (desde, hasta) => {
    if (registro) registro.push([...lote]);
    const filas = lote.flatMap((id) => Array.from({ length: porId }, (_, k) => ({ id_partido: id, n: k })));
    return Promise.resolve({ data: filas.slice(desde, hasta + 1), error: null });
  },
});

const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('fetchPorLotes: el avance', () => {
  it('avisa al terminar cada tanda, con el total de lotes desde el principio', async () => {
    const avances = [];
    await fetchPorLotes(ids(180), fabrica(), {
      tamLote: 60, concurrencia: 1,
      onProgreso: (a) => avances.push({ ...a }),
    });
    // 180 ids en lotes de 60 = 3 lotes, de a uno por vez = 3 avisos.
    expect(avances.map((a) => a.lotesHechos)).toEqual([1, 2, 3]);
    expect(avances.every((a) => a.lotesTotal === 3)).toBe(true);
  });

  it('el avance nunca supera el total, aunque la concurrencia se pase', async () => {
    // El caso que rompía la barra: 4 lotes de a 3 → la segunda tanda daría 6.
    const avances = [];
    await fetchPorLotes(ids(200), fabrica(), {
      tamLote: 60, concurrencia: 3,
      onProgreso: (a) => avances.push({ ...a }),
    });
    expect(avances.map((a) => a.lotesHechos)).toEqual([3, 4]);
    expect(avances.every((a) => a.lotesHechos <= a.lotesTotal)).toBe(true);
  });

  it('informa cuántas filas lleva acumuladas', async () => {
    const avances = [];
    await fetchPorLotes(ids(120), fabrica(2), {
      tamLote: 60, concurrencia: 1,
      onProgreso: (a) => avances.push({ ...a }),
    });
    expect(avances.map((a) => a.filas)).toEqual([120, 240]);   // 60 ids × 2 filas
  });

  it('termina siempre en el total: la barra no queda a medio camino', async () => {
    const avances = [];
    await fetchPorLotes(ids(150), fabrica(), { tamLote: 60, concurrencia: 2, onProgreso: (a) => avances.push({ ...a }) });
    const ultimo = avances[avances.length - 1];
    expect(ultimo.lotesHechos).toBe(ultimo.lotesTotal);
  });

  it('sin ids avisa igual, en cero, en vez de dejar la barra esperando', async () => {
    const avances = [];
    const r = await fetchPorLotes([], fabrica(), { onProgreso: (a) => avances.push({ ...a }) });
    expect(r).toEqual([]);
    expect(avances).toEqual([{ lotesHechos: 0, lotesTotal: 0, filas: 0 }]);
  });

  it('sigue funcionando sin que nadie mire el avance', async () => {
    const r = await fetchPorLotes(ids(70), fabrica(1), { tamLote: 60 });
    expect(r).toHaveLength(70);
  });
});

describe('fetchPorLotes: lo que ya hacía, sigue igual', () => {
  it('parte la lista en lotes del tamaño pedido', async () => {
    const vistos = [];
    await fetchPorLotes(ids(130), fabrica(1, vistos), { tamLote: 60, concurrencia: 1 });
    expect(vistos.map((l) => l.length)).toEqual([60, 60, 10]);
  });

  it('saca los repetidos y los vacíos antes de partir', async () => {
    const vistos = [];
    await fetchPorLotes([1, 1, 2, null, 2, undefined, 3, ''], fabrica(1, vistos), { tamLote: 60, concurrencia: 1 });
    expect(vistos[0]).toEqual([1, 2, 3]);
  });

  it('trae todas las filas de todos los lotes', async () => {
    const r = await fetchPorLotes(ids(100), fabrica(3), { tamLote: 40, concurrencia: 2 });
    expect(r).toHaveLength(300);
    expect(new Set(r.map((f) => f.id_partido)).size).toBe(100);
  });
});
