import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import { usePlantelEnCartas } from '../utils/usePlantelEnCartas';
import { menuPorGrupo, altasPara, seccionInicial, SECCIONES_GOD } from '../analytics/configuradorGod';
import { leerPreferencias, guardarPreferencias } from '../utils/preferenciasApertura';
import { prepararAudio, sonidoActivo } from '../utils/sonidoApertura';
import { datosDelClub } from '../placas/club';
import PanelGod from '../components/sobres/PanelGod';
import AperturaSobre from '../components/sobres/AperturaSobre';
import PreferenciasApertura from '../components/sobres/PreferenciasApertura';
import PanelPremios from '../components/quinteto/PanelPremios';
import HistorialPremios from '../components/quinteto/HistorialPremios';
import FotosEspeciales from '../components/quinteto/FotosEspeciales';
import AltaCartasPlantel from '../components/god/AltaCartasPlantel';
import GodMisiones from '../components/god/GodMisiones';
import GodVcoins from '../components/god/GodVcoins';
import { Icono } from '../iconos';
import '../components/quinteto/quinteto.css';

/* CONFIGURADOR GOD (/god)
 *
 * Todo lo que se administra del módulo de Juegos, en un solo lugar y con un
 * menú por secciones: cartas (alta, modificación y baja), placas, eventos,
 * sobres, usuarios, misiones, V-Coins, el torneo del V-Draft y Gmail.
 * El superusuario ve todo; el manager, el alta de cartas básicas y de premio,
 * sus fotos y las placas (lo que antes hacía desde MySquad).
 * Plan completo y etapas: docs/CONFIGURADOR_GOD.md.
 */

const ORO = '#fbbf24';
export default function God() {
  const { perfil } = useAuth();
  const esMovil = useEsMovil();
  const rol = String(perfil?.rol || '').toLowerCase();
  const clubId = localStorage.getItem('club_id') || perfil?.club_id || null;
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);

  const [params, setParams] = useSearchParams();
  const seccion = seccionInicial(rol, params.get('s'));
  const ir = (id) => setParams(id === 'probar' ? {} : { s: id }, { replace: true });
  const altas = altasPara(rol);
  const [alta, setAlta] = useState(() => (altas.find((a) => a.id === params.get('alta')) || altas[0])?.id || null);

  /* Los datos del plantel (pesados) se piden recién cuando una sección los usa. */
  const [usaPlantel, setUsaPlantel] = useState(false);
  const necesitaPlantel = seccion === 'placas' || seccion === 'modificar' || (seccion === 'alta' && ['basicas', 'premios'].includes(alta));
  if (necesitaPlantel && !usaPlantel) setUsaPlantel(true);
  const plantel = usePlantelEnCartas({ clubId: usaPlantel ? clubId : null, misCategorias });

  /* PanelGod queda montado (oculto) una vez abierto: así no vuelve a leer el catálogo en cada sección. */
  const actual = SECCIONES_GOD.find((s) => s.id === seccion);
  const pestanaGod = actual?.god || (seccion === 'alta' ? altas.find((a) => a.id === alta)?.god : null) || (seccion === 'modificar' && rol === 'superuser' ? 'cartas' : null);
  const [usoGod, setUsoGod] = useState(false);
  if (pestanaGod && !usoGod) setUsoGod(true);

  /* Una apertura de prueba (PROBAR, eventos y sobres): no toca la base. */
  const [prefs, setPrefs] = useState(leerPreferencias);
  const [prueba, setPrueba] = useState(null);
  const cambiarPref = (clave, valor) => {
    const nuevas = { ...prefs, [clave]: valor };
    setPrefs(nuevas);
    guardarPreferencias(nuevas);
    if (clave === 'sonido') sonidoActivo(valor);
  };

  if (!seccion) return <div style={{ textAlign: 'center', marginTop: 50, color: 'var(--text-dim)' }}>El Configurador GOD es para el superusuario y el manager.</div>;
  if (!clubId) return <div className="bento-card" style={{ maxWidth: 600, margin: '40px auto', padding: 24, color: 'var(--text-dim)' }}>Elegí un club en la app para administrar sus juegos.</div>;

  const grupos = menuPorGrupo(rol);
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 80px', animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
        <Icono nombre="rayo" size={34} style={{ color: ORO }} />
        <div>
          <div className="stat-label" style={{ color: ORO, fontSize: '1.2rem' }}>CONFIGURADOR GOD</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            {rol === 'superuser' ? 'Todo lo que se administra de los juegos del club, en un solo lugar.' : 'Las cartas de premio, sus fotos y las placas para redes.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '230px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <nav aria-label="Secciones del configurador" style={esMovil
          ? { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }
          : { display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 12 }}>
          {grupos.map((g) => (
            <div key={g.grupo} style={esMovil ? { display: 'contents' } : { display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!esMovil && <div style={rotulo}>{g.grupo}</div>}
              {g.secciones.map((s) => (
                <button key={s.id} onClick={() => ir(s.id)} aria-current={seccion === s.id ? 'page' : undefined}
                  style={esMovil ? chip(seccion === s.id) : itemMenu(seccion === s.id)}>
                  {s.titulo}{s.pronto && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-dim)' }}>PRONTO</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main style={{ minWidth: 0 }}>
          {actual && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '.04em' }}>{actual.titulo.toUpperCase()}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{rol !== 'superuser' && seccion === 'modificar' ? 'Las fotos de las cartas de premio.' : actual.texto}</div>
            </div>
          )}

          {seccion === 'probar' && <PreferenciasApertura prefs={prefs} cambiar={cambiarPref} />}

          {seccion === 'alta' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {altas.map((a) => <button key={a.id} onClick={() => setAlta(a.id)} style={chip(alta === a.id)}>{a.titulo}</button>)}
            </div>
          )}
          {seccion === 'alta' && alta === 'basicas' && (
            <ConPlantel plantel={plantel}><AltaCartasPlantel plantel={plantel} clubId={clubId} esMovil={esMovil} /></ConPlantel>
          )}
          {seccion === 'alta' && alta === 'premios' && (
            <ConPlantel plantel={plantel}>
              <PanelPremios partidosJugados={plantel.analisis.partidosJugados} jugadores={plantel.raw.jugadores} club={datosDelClub(perfil)}
                clubId={clubId} categoria={plantel.filtroCategoria} torneoId={plantel.filtroTorneo} esMovil={esMovil}
                historial={plantel.historial} alGuardar={plantel.recargarHistorial}
                raw={plantel.raw} partidosFiltro={plantel.partidosFiltro} partidosCategoria={plantel.partidosScopeCat} misCategorias={misCategorias}
                cartas={plantel.cartasCalculadas}
                torneo={plantel.filtroTorneo === 'Todos' ? null : (plantel.raw.torneos || []).find((t) => t.id === plantel.filtroTorneo) || null} />
            </ConPlantel>
          )}

          {seccion === 'modificar' && rol === 'superuser' && (
            <div style={{ ...rotulo, marginBottom: 10 }}>CARTAS DEL CATÁLOGO · media, foto, suspender o eliminar</div>
          )}

          {usoGod && (
            <div hidden={!pestanaGod}>
              <PanelGod clubId={clubId} estado={null} pestana={pestanaGod || 'probar'} alCambiar={() => {}}
                alProbar={(p) => { prepararAudio(prefs.sonido); setPrueba(p); }} />
            </div>
          )}

          {seccion === 'modificar' && (
            <div style={{ marginTop: rol === 'superuser' ? 26 : 0 }}>
              <div style={{ ...rotulo, marginBottom: 10 }}>FOTOS DE LAS CARTAS DE PREMIO · también las que todavía no están en los sobres</div>
              <ConPlantel plantel={plantel} sinFiltros>
                <FotosEspeciales premios={plantel.premios} fotos={plantel.fotos} clubId={clubId} alCambiar={plantel.cargarFotos} esMovil={esMovil} />
              </ConPlantel>
            </div>
          )}

          {seccion === 'misiones' && <GodMisiones clubId={clubId} esMovil={esMovil} />}

          {seccion === 'placas' && <HistorialPremios clubId={clubId} club={datosDelClub(perfil)} esMovil={esMovil} />}

          {seccion === 'vcoins' && <GodVcoins clubId={clubId} esMovil={esMovil} />}
        </main>
      </div>

      {prueba && (
        <AperturaSobre key={prueba.resultado.sobre_id} resultado={prueba.resultado} prefs={{ ...prefs, cine: true }}
          evento={prueba.evento} forzar={prueba.forzar} escenaTipo={prueba.escenaTipo} onCerrar={() => setPrueba(null)} />
      )}
    </div>
  );
}

/* Los filtros del plantel (categoría y torneo) y la espera mientras llegan los partidos. */
function ConPlantel({ plantel, sinFiltros = false, children }) {
  const { loading, avance, categorias, torneos, filtroCategoria, setFiltroCategoria, filtroTorneo, setFiltroTorneo } = plantel;
  return (
    <>
      {!sinFiltros && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={select} aria-label="Categoría">
            <option value="Todas">TODAS LAS CATEGORÍAS</option>
            {categorias.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
          <select value={filtroTorneo} onChange={(e) => setFiltroTorneo(e.target.value)} style={select} aria-label="Torneo">
            <option value="Todos">TODA LA TEMPORADA</option>
            {torneos.map((t) => <option key={t.id} value={t.id}>{String(t.nombre).toUpperCase()}</option>)}
          </select>
        </div>
      )}
      {loading ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          Armando las cartas…
          {avance.total > 0 && <div style={{ marginTop: 10, fontSize: '0.75rem' }}>{avance.traidas.toLocaleString('es-AR')} de {avance.total.toLocaleString('es-AR')} acciones</div>}
        </div>
      ) : children}
    </>
  );
}

const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
const select = { width: 'auto', maxWidth: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 700 };
const chip = (activo) => ({
  padding: '8px 14px', minHeight: 40, whiteSpace: 'nowrap', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, letterSpacing: '.06em',
  border: `1px solid ${activo ? ORO : 'var(--border)'}`, color: activo ? ORO : 'var(--text-dim)', background: activo ? 'rgba(251,191,36,.08)' : 'transparent',
});
const itemMenu = (activo) => ({
  textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: '.03em',
  border: '1px solid transparent', borderLeft: `3px solid ${activo ? ORO : 'transparent'}`,
  color: activo ? ORO : 'var(--text)', background: activo ? 'rgba(251,191,36,.08)' : 'transparent',
});
