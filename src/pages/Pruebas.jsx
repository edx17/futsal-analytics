import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import { useCategorias } from '../utils/useCategorias';
import { resolverConfig } from '../pruebas/configDefault';
import { listarCandidatos, listarSesiones, listarEvaluaciones, listarCierres, leerConfigs, resumenCarga } from '../pruebas/datos';
import CandidatosPruebas from '../components/pruebas/CandidatosPruebas';
import CargaPrueba from '../components/pruebas/CargaPrueba';
import CierrePrueba from '../components/pruebas/CierrePrueba';
import ConfiguradorPruebas from '../components/pruebas/ConfiguradorPruebas';
import { dim, input, chip } from '../components/pruebas/estilos';
import { Icono } from '../iconos';

/* PLANTEL · PRUEBAS DE JUGADORES (/pruebas)
 *
 *   CANDIDATOS     la ficha previa (con la edad relativa)
 *   EVALUAR        la carga por bloque, en el celular, con cola offline
 *   CIERRE         resultado, decisión del DT (congelada), radar, PNG e Incorporar
 *   CONFIGURADOR   ponderaciones, umbrales y bloques clave, con simulación
 * Siempre dentro de UNA categoría: nunca se mezclan candidatos ni pruebas de
 * categorías distintas. La rúbrica está en src/pruebas/rubrica.js, el motor en
 * src/pruebas/evaluacionPrueba.js y las reglas de la base en la migración
 * 20261117120000_pruebas_jugadores.sql.
 */

const PESTANAS = [['candidatos', 'CANDIDATOS'], ['evaluar', 'EVALUAR'], ['cierre', 'CIERRE'], ['config', 'CONFIGURADOR']];
const ROLES_CARGA = ['superuser', 'manager', 'ct'];
const leerLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin espacio */ } };

export default function Pruebas() {
  const { user, perfil } = useAuth();
  const esMovil = useEsMovil();
  const rol = String(perfil?.rol || '').toLowerCase();
  const esSuper = rol === 'superuser';
  const clubId = (esSuper ? leerLS('club_id') : perfil?.club_id) || leerLS('club_id') || null;
  const puedeCargar = ROLES_CARGA.includes(rol);
  const puedeBorrar = ['superuser', 'manager'].includes(rol);
  const asignadas = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);
  const { categorias } = useCategorias({ asignadas });

  // La elegida si es una de las del usuario; si no, la primera (nunca "todas": no se mezclan categorías).
  const [elegida, setElegida] = useState(() => leerLS('vc_pruebas_categoria') || '');
  const categoria = categorias?.includes(elegida) ? elegida : (categorias?.[0] || '');
  const elegirCategoria = (c) => { setElegida(c); guardarLS('vc_pruebas_categoria', c); };

  const [pestana, setPestana] = useState('candidatos');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const timerAviso = useRef(null);
  const avisar = useCallback((texto, esError = false) => {
    setAviso({ texto, error: esError });
    clearTimeout(timerAviso.current);
    timerAviso.current = setTimeout(() => setAviso(null), 4500);
  }, []);

  const recargar = useCallback(async () => {
    if (!clubId || !categoria) return;
    try {
      const [candidatos, sesiones, evaluaciones, cierres, configs, resumen] = await Promise.all([
        listarCandidatos(clubId, categoria), listarSesiones(clubId, categoria), listarEvaluaciones(clubId, categoria),
        listarCierres(clubId, categoria), leerConfigs(clubId), resumenCarga(clubId, categoria),
      ]);
      setDatos({ candidatos, sesiones, evaluaciones, cierres, configs, resumen, categoria });
      setError(null);
    } catch (err) {
      setError(err?.message || 'No se pudieron leer las pruebas.');
      setDatos((d) => d || { candidatos: [], sesiones: [], evaluaciones: [], cierres: [], configs: [], resumen: new Map(), categoria });
    }
  }, [clubId, categoria]);
  useEffect(() => {
    let vivo = true;
    // Al cambiar de categoría no se muestra nada de la anterior.
    Promise.resolve().then(() => { if (vivo) { setDatos(null); recargar(); } });
    return () => { vivo = false; };
  }, [recargar]);

  const vigente = useMemo(() => {
    const r = resolverConfig(datos?.configs || [], categoria);
    return { config: r.config, fuente: r.fuente, version: r.fila?.version ?? 0 };
  }, [datos?.configs, categoria]);

  if (!clubId) return <div className="bento-card" style={{ maxWidth: 560, margin: '40px auto', padding: 24, ...dim }}>Elegí un club en la app para trabajar con las pruebas.</div>;

  const listo = datos && datos.categoria === categoria;
  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 0 90px', animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Icono nombre="objetivo" size={32} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>PRUEBAS DE JUGADORES</div>
          <div style={dim}>Evaluá candidatos con la misma rúbrica y cerrá con una recomendación.</div>
        </div>
        <select value={categoria} onChange={(e) => elegirCategoria(e.target.value)} style={{ ...input, width: 'auto', minWidth: 160, fontWeight: 800 }} aria-label="Categoría">
          {(categorias || []).map((c) => <option key={c} value={c}>{String(c).toUpperCase()}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }} role="tablist">
        {PESTANAS.map(([id, t]) => <button key={id} role="tab" aria-selected={pestana === id} style={chip(pestana === id)} onClick={() => setPestana(id)}>{t}</button>)}
      </div>

      {aviso && <div role="status" style={{ marginBottom: 10, fontSize: 13, color: aviso.error ? '#ef4444' : 'var(--accent)' }}>{aviso.texto}</div>}
      {error && <div role="alert" style={{ marginBottom: 10, fontSize: 13, color: '#ef4444' }}>{error}</div>}
      {!categoria && <div style={dim}>No tenés categorías asignadas.</div>}
      {categoria && !listo && <div style={dim}>Leyendo las pruebas de {categoria}…</div>}

      {listo && pestana === 'candidatos' && (
        <CandidatosPruebas clubId={clubId} categoria={categoria} candidatos={datos.candidatos} recargar={recargar}
          puedeCargar={puedeCargar} puedeBorrar={puedeBorrar} esMovil={esMovil} avisar={avisar} />
      )}
      {listo && pestana === 'evaluar' && (
        <CargaPrueba key={categoria} clubId={clubId} categoria={categoria} yo={user?.id} sesiones={datos.sesiones} candidatos={datos.candidatos}
          evaluaciones={datos.evaluaciones} cierres={datos.cierres} recargar={recargar} puedeCargar={puedeCargar} avisar={avisar} />
      )}
      {listo && pestana === 'cierre' && (
        <CierrePrueba key={categoria} clubId={clubId} categoria={categoria} candidatos={datos.candidatos} sesiones={datos.sesiones}
          evaluaciones={datos.evaluaciones} cierres={datos.cierres} resumen={datos.resumen} vigente={vigente}
          recargar={recargar} puedeCargar={puedeCargar} esSuper={esSuper} avisar={avisar} />
      )}
      {listo && pestana === 'config' && (
        <ConfiguradorPruebas key={categoria} clubId={clubId} categoria={categoria} filas={datos.configs} candidatos={datos.candidatos}
          evaluaciones={datos.evaluaciones} sesiones={datos.sesiones} cierres={datos.cierres}
          puedeEditar={puedeCargar} recargar={recargar} avisar={avisar} esMovil={esMovil} />
      )}
    </div>
  );
}
