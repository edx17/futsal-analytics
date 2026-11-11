import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatosPlantel } from './useDatosPlantel';
import { useCategorias } from './useCategorias';
import { procesarPlantel } from '../analytics/plantel';
import { analizarPartidos, armarCartas } from '../analytics/quinteto';
import { cartasDeHistorial } from '../analytics/premiosCartas';
import { aplicarAjustes } from '../analytics/god';
import { listarFotos } from './cartasFotos';
import { listarHistorial } from './cartasDestacadas';
import { listarAjustes } from './god';

/* EL PLANTEL EN CARTAS
 *
 * Lo que necesitan MySquad (la cancha) y el Configurador GOD (alta de cartas
 * básicas y de premio, fotos y placas): los partidos del club con los mismos
 * filtros que Resumen de plantel, las cartas calculadas, las de premio
 * guardadas en el historial, las fotos especiales y las medias corregidas.
 */
export function usePlantelEnCartas({ clubId, misCategorias = [], conHistorial = true }) {
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroTorneo, setFiltroTorneo] = useState('Todos');

  const [fotos, setFotos] = useState(() => new Map());
  const [versionFotos, setVersionFotos] = useState(0);
  const cargarFotos = useCallback(() => setVersionFotos((v) => v + 1), []);
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    listarFotos(clubId).then((f) => { if (vivo) setFotos(f); }).catch(() => {});
    return () => { vivo = false; };
  }, [clubId, versionFotos]);

  /* Las cartas especiales salen del HISTORIAL: sólo existen los premios guardados ahí. */
  const [historial, setHistorial] = useState([]);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const recargarHistorial = useCallback(() => setVersionHistorial((v) => v + 1), []);
  useEffect(() => {
    if (!clubId || !conHistorial) return undefined;
    let vivo = true;
    listarHistorial(clubId)
      .then((r) => { if (vivo) setHistorial(r); })
      .catch((err) => { console.warn('Historial de premios:', err?.message); if (vivo) setHistorial([]); });
    return () => { vivo = false; };
  }, [clubId, conHistorial, versionHistorial]);

  const { raw, loading, avance } = useDatosPlantel(clubId);
  const { categorias } = useCategorias({ incluirHistoricas: true, asignadas: misCategorias });

  /* ── mismos filtros que Resumen de plantel ── */
  const partidosScopeCat = useMemo(() => {
    let p = raw.partidos;
    if (misCategorias.length > 0) p = p.filter((x) => !x.categoria || misCategorias.includes(x.categoria));
    if (filtroCategoria !== 'Todas') p = p.filter((x) => x.categoria === filtroCategoria);
    return p;
  }, [raw.partidos, misCategorias, filtroCategoria]);

  const torneos = useMemo(() => {
    const m = new Map();
    partidosScopeCat.forEach((p) => { if (p.torneo_id) m.set(p.torneo_id, p.competicion || 'Torneo'); });
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [partidosScopeCat]);

  const partidosFiltro = useMemo(
    () => (filtroTorneo === 'Todos' ? partidosScopeCat : partidosScopeCat.filter((p) => p.torneo_id === filtroTorneo)),
    [partidosScopeCat, filtroTorneo],
  );

  /* Medias corregidas a mano por el superusuario: se ven en la cancha y el
     banco; al publicar va siempre la calculada (la rareza no cambia). */
  const [ajustes, setAjustes] = useState(() => new Map());
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    listarAjustes(clubId).then((a) => { if (vivo) setAjustes(a); }).catch(() => {});
    return () => { vivo = false; };
  }, [clubId]);

  const { cartas: cartasCalculadas, minimo, partidosEquipo, analisis } = useMemo(() => {
    const { jugadoresProc, arquerosProc } = procesarPlantel({
      raw, partidosScopeCat, filtroTorneo, filtroCategoria, misCategorias,
      hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
    });
    const a = analizarPartidos({ partidos: partidosFiltro, eventos: raw.eventos, jugadores: raw.jugadores });
    return { ...armarCartas({ jugadoresProc, arquerosProc, forma: a.forma, figura: a.figura }), analisis: a };
  }, [raw, partidosScopeCat, partidosFiltro, filtroTorneo, filtroCategoria, misCategorias]);

  const cartasBase = useMemo(() => aplicarAjustes(cartasCalculadas, ajustes, (c) => `BASE|${c.id}`), [cartasCalculadas, ajustes]);

  /* Las versiones de premio de cada carta (TOTY, TOTM, TOTW…): las del historial guardado. */
  const premiosCalculados = useMemo(() => cartasDeHistorial(historial, cartasCalculadas, fotos), [historial, cartasCalculadas, fotos]);
  const premios = useMemo(() => aplicarAjustes(premiosCalculados, ajustes), [premiosCalculados, ajustes]);

  return {
    raw, loading, avance, categorias, torneos,
    filtroCategoria, setFiltroCategoria, filtroTorneo, setFiltroTorneo,
    partidosScopeCat, partidosFiltro,
    fotos, cargarFotos, historial, recargarHistorial,
    cartasCalculadas, cartasBase, minimo, partidosEquipo, analisis,
    premiosCalculados, premios,
  };
}
