import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { getColorAccion } from '../utils/helpers';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

// Lienzo A4 / Póster - Ajustado a 1850px para optimizar los espacios sin dejar tanto hueco.
const CANVAS_W = 1300;
const CANVAS_H = 2100;

const asNumber = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const getTarjetasAmarillas = (stats) => asNumber(stats?.amarillas ?? 0);
const getTarjetasRojas = (stats) => asNumber(stats?.rojas ?? 0);

const calcularEdad = (fechaNac) => {
  if (!fechaNac) return 'N/D';
  const diff = Date.now() - new Date(fechaNac).getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
};

const KpiCard = ({ label, value, color = '#fff' }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', minWidth: 0 }}>
    <div style={{ fontSize: '0.85rem', color: '#888', fontWeight: 800, marginBottom: '5px', letterSpacing: '1px' }}>{label}</div>
    <div style={{ fontSize: '2.4rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
  </div>
);

const Row = ({ label, value, color = '#fff', sub = '', noBorder = false }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)', fontSize: '1rem', gap: '10px' }}>
    <span style={{ color: '#aaa', fontWeight: 600 }}>{label}</span>
    <strong style={{ color, textAlign: 'right', flexShrink: 0 }}>{value} {sub && <span style={{ color: '#666', fontSize: '0.85rem', marginLeft: '5px' }}>{sub}</span>}</strong>
  </div>
);

// --- CANCHA DE FUTSAL (Medidas y marcas reales de 40x20m) ---
const CanchaFutsal = ({ accionesMapa, dotSize = 14 }) => (
  <div style={{ position: 'relative', width: '100%', aspectRatio: '2/1', background: '#0a1a0f', borderRadius: '8px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)' }}>

    {/* Esquinas (Corner) */}
    <div style={{ position: 'absolute', left: '-1%', top: '-2%', width: '3%', height: '6%', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
    <div style={{ position: 'absolute', left: '-1%', bottom: '-2%', width: '3%', height: '6%', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
    <div style={{ position: 'absolute', right: '-1%', top: '-2%', width: '3%', height: '6%', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />
    <div style={{ position: 'absolute', right: '-1%', bottom: '-2%', width: '3%', height: '6%', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '50%' }} />

    {/* Linea central */}
    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.2)', transform: 'translateX(-50%)' }} />
    {/* Circulo central */}
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '2px solid rgba(255,255,255,0.2)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
    {/* Punto de saque central */}
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: '6px', height: '6px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
    
    {/* Área de penal (6m) Izquierda - Borde elíptico */}
    <div style={{ position: 'absolute', left: 0, top: '12.5%', bottom: '12.5%', width: '15%', border: '2px solid rgba(255,255,255,0.2)', borderLeft: 'none', borderRadius: '0 100% 100% 0 / 0 50% 50% 0' }} />
    {/* Área de penal (6m) Derecha */}
    <div style={{ position: 'absolute', right: 0, top: '12.5%', bottom: '12.5%', width: '15%', border: '2px solid rgba(255,255,255,0.2)', borderRight: 'none', borderRadius: '100% 0 0 100% / 50% 0 0 50%' }} />
    
    {/* Puntos de penal (6m) */}
    <div style={{ position: 'absolute', left: '15%', top: '50%', width: '6px', height: '6px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
    <div style={{ position: 'absolute', right: '15%', top: '50%', width: '6px', height: '6px', background: 'rgba(255,255,255,0.4)', borderRadius: '50%', transform: 'translate(50%, -50%)' }} />
    
    {/* Segundo punto de penal (Doble penal - 10m) */}
    <div style={{ position: 'absolute', left: '25%', top: '50%', width: '4px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
    <div style={{ position: 'absolute', right: '25%', top: '50%', width: '4px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '50%', transform: 'translate(50%, -50%)' }} />

    {/* Porterías */}
    <div style={{ position: 'absolute', left: '-2px', top: '42.5%', bottom: '42.5%', width: '2%', border: '3px solid #c2c2c2', borderLeft: 'none' }} />
    <div style={{ position: 'absolute', right: '-2px', top: '42.5%', bottom: '42.5%', width: '2%', border: '3px solid #c2c2c2', borderRight: 'none' }} />

    {accionesMapa.map((ev, i) => {
      // Forzar color rojo para goles recibidos y azul para atajadas si los helpers no los cubren
      let col = getColorAccion(ev.accion);
      if (ev.accion === 'Gol Recibido') col = '#ef4444';
      if (ev.accion === 'Atajada') col = '#3b82f6';
      
      return (
        <div key={i} style={{ position: 'absolute', left: `${ev.x}%`, top: `${ev.y}%`, width: `${dotSize}px`, height: `${dotSize}px`, backgroundColor: col, borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.9, boxShadow: `0 0 8px ${col}99`, zIndex: 2 }} />
      );
    })}
  </div>
);

const LeyendaMapaDistribucion = () => {
  const items = [{ label: 'Recuperación', accion: 'Recuperación' }, { label: 'Pérdida', accion: 'Pérdida' }, { label: 'Duelo OFE', accion: 'Duelo OFE Ganado' }, { label: 'Duelo DEF', accion: 'Duelo DEF Ganado' }];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '12px', justifyContent: 'center' }}>
      {items.map(({ label, accion }) => (
        <span key={accion} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#777', fontWeight: 700 }}><span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getColorAccion(accion), flexShrink: 0 }} />{label}</span>
      ))}
    </div>
  );
};

const COLORS_REMATES = { Gol: '#00ff88', Atajado: '#3b82f6', Desviado: '#888888', Rebatido: '#a855f7' };

const SeccionRemates = ({ dataRemates, totalRemates }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
    {dataRemates.length > 0 ? (
      dataRemates.map((item, idx) => {
        const pct = totalRemates > 0 ? Math.round((item.value / totalRemates) * 100) : 0;
        return (
          <div key={idx}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '1.05rem', fontWeight: 700, marginBottom: '8px' }}>
              <span style={{ color: COLORS_REMATES[item.name] || '#fff' }}>{item.name}</span><span style={{ color: '#ccc' }}>{item.value} <span style={{ color: '#555', fontSize: '0.85em' }}>({pct}%)</span></span>
            </div>
            <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: COLORS_REMATES[item.name] || '#fff', borderRadius: '5px' }} />
            </div>
          </div>
        );
      })
    ) : <div style={{ color: '#444', fontSize: '1rem', textAlign: 'center', fontWeight: 700 }}>Sin remates</div>}
  </div>
);

const PlayerReportGenerator = ({ jugador, perfil, wellness, contexto, jugadores = [] }) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const wrapperRef = useRef(null);

  const isArquero = perfil?.rol === 'ARQUERO' || (jugador?.posicion || '').toLowerCase().includes('arquero');

  const stats = perfil?.stats ?? {};
  const accionesDirectas = perfil?.accionesDirectas ?? [];
  const dataRemates = Array.isArray(perfil?.dataTortaRemates) ? perfil.dataTortaRemates : [];
  
  const clubName = localStorage.getItem('mi_club') || 'VIRTUAL FUTSAL';
  const escudoUrl = localStorage.getItem('escudo_url') || null;

  const accionesMapa = accionesDirectas.map((ev) => ({ ...ev, x: ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x, y: ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y })).filter((ev) => ev.x != null && ev.y != null);
  
  // Filtros diferenciados por rol
  const accionesAtaque = accionesMapa.filter(ev => ['Gol', 'Remate - Gol', 'Remate - Atajado', 'Remate - Desviado', 'Remate - Rebatido', 'Asistencia'].includes(ev.accion) || ev.accion?.includes('Remate'));
  const accionesResto = accionesMapa.filter(ev => !['Gol', 'Remate - Gol', 'Remate - Atajado', 'Remate - Desviado', 'Remate - Rebatido', 'Asistencia'].includes(ev.accion) && !ev.accion?.includes('Remate'));
  
  const accionesArco = accionesMapa.filter(ev => ['Atajada', 'Gol Recibido'].includes(ev.accion));
  const accionesDistribucionGK = accionesMapa.filter(ev => !['Atajada', 'Gol Recibido'].includes(ev.accion));

  const amarillas = getTarjetasAmarillas(stats);
  const rojas = getTarjetasRojas(stats);

  const factor40 = perfil?.minutos > 0 ? (40 / perfil.minutos) : 0;

  // Stats exclusivas de arquero
  const atajadas = stats.atajadas || 0;
  const golesRecibidos = stats.golesRecibidos || 0;
  const tirosRecibidos = atajadas + golesRecibidos;
  const pctAtajadas = tirosRecibidos > 0 ? Math.round((atajadas / tirosRecibidos) * 100) : 0;

  // Extraemos los compañeros del Quinteto Ideal
  let companerosQuinteto = [];
  if (perfil?.mejorQuinteto && jugadores.length > 0) {
    const otrosIds = perfil.mejorQuinteto.ids.filter(id => id != jugador.id);
    companerosQuinteto = otrosIds.map(id => jugadores.find(j => j.id == id)).filter(Boolean);
  } else if (perfil?.topSocios) {
    companerosQuinteto = perfil.topSocios;
  }

  useEffect(() => {
    const calcular = () => {
      const parent = wrapperRef.current?.parentElement || document.body;
      const anchoDisponible = parent.offsetWidth - 48;
      const altoDisponible = window.innerHeight * 0.9;
      setEscala(Math.min(anchoDisponible / CANVAS_W, altoDisponible / CANVAS_H, 1));
    };
    const t = setTimeout(calcular, 80);
    window.addEventListener('resize', calcular);
    return () => { clearTimeout(t); window.removeEventListener('resize', calcular); };
  }, []);

  const exportarPNG = async () => {
    const scaleWrapper = document.getElementById('report-scale-wrapper');
    const containerDiv = scaleWrapper.parentElement; 
    const el = document.getElementById('player-report-exportable');
    
    if (!el || !scaleWrapper || !containerDiv || exportando) return;
    
    setExportando(true);
    
    const originalTransform = scaleWrapper.style.transform;
    const originalWidth = containerDiv.style.width;
    const originalHeight = containerDiv.style.height;
    const originalOverflow = containerDiv.style.overflow;
    
    scaleWrapper.style.transform = 'scale(1)';
    containerDiv.style.width = `${CANVAS_W}px`;
    containerDiv.style.height = `${CANVAS_H}px`;
    containerDiv.style.overflow = 'visible';
    
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(el, { 
          scale: 2, 
          useCORS: true, 
          backgroundColor: '#0a0a0a', 
          logging: false
        });
        const link = document.createElement('a');
        link.download = `Scouting_${jugador?.apellido}_${contexto === 'TODA LA TEMPORADA' ? new Date().getFullYear() : 'Partido'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (err) {
        alert('Hubo un error al generar la imagen.');
      } finally {
        scaleWrapper.style.transform = originalTransform;
        containerDiv.style.width = originalWidth;
        containerDiv.style.height = originalHeight;
        containerDiv.style.overflow = originalOverflow;
        setExportando(false);
      }
    }, 300);
  };

  if (!jugador || !perfil) return null;

  return (
    <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <div style={{ width: `${CANVAS_W * escala}px`, display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button onClick={exportarPNG} disabled={exportando} style={{ background: exportando ? '#1a1a1a' : '#00e676', color: exportando ? '#555' : '#000', fontWeight: 900, fontSize: '0.9rem', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          {exportando ? '⏳ Generando Alta Calidad...' : '📸 DESCARGAR REPORTE'}
        </button>
      </div>

      <div style={{ width: `${CANVAS_W * escala}px`, height: `${CANVAS_H * escala}px`, overflow: 'hidden', borderRadius: `${Math.round(16 * escala)}px`, boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
        <div id="report-scale-wrapper" style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: `${CANVAS_W}px`, height: `${CANVAS_H}px` }}>
          
          <div id="player-report-exportable" style={{ width: `${CANVAS_W}px`, height: `${CANVAS_H}px`, background: '#0a0a0a', backgroundImage: 'radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0a0a0a 60%)', color: '#fff', padding: '40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* HEADER ROW */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid rgba(255,255,255,0.05)', paddingBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: '#111', border: '4px solid #00e676', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {jugador.foto ? (
                    <div style={{ width: '100%', height: '100%', backgroundImage: `url(${jugador.foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  ) : (
                    <span style={{ fontSize: '3rem', color: '#00e676', fontWeight: 900 }}>{jugador.apellido?.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '1.2rem', color: '#aaa', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '4px', marginBottom: '5px' }}>{clubName} • SCOUTING</div>
                  <div style={{ fontSize: '4.5rem', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1, textShadow: '3px 3px 0 rgba(0,0,0,0.5)' }}>{jugador.apellido}</div>
                  <div style={{ fontSize: '2rem', color: '#888', fontWeight: 700, margin: '5px 0 10px' }}>{jugador.nombre}</div>
                  
                  <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', marginTop: '5px' }}>
                    <span style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 900 }}>#{jugador.dorsal}</span>
                    <span style={{ width: '6px', height: '6px', background: '#444', borderRadius: '50%' }}></span>
                    <span style={{ fontSize: '1.1rem', color: '#aaa' }}>{jugador.posicion || 'Posición N/A'}</span>
                    <span style={{ width: '6px', height: '6px', background: '#444', borderRadius: '50%' }}></span>
                    <span style={{ fontSize: '1.1rem', color: '#aaa' }}>{jugador.pierna || 'Pierna N/A'}</span>
                    <span style={{ width: '6px', height: '6px', background: '#444', borderRadius: '50%' }}></span>
                    <span style={{ fontSize: '1.1rem', color: '#aaa' }}>{calcularEdad(jugador.fechanac)} Años</span>
                    {jugador.altura && (
                      <>
                        <span style={{ width: '6px', height: '6px', background: '#444', borderRadius: '50%' }}></span>
                        <span style={{ fontSize: '1.1rem', color: '#aaa' }}>{jugador.altura} cm</span>
                      </>
                    )}
                    {jugador.peso && (
                      <>
                        <span style={{ width: '6px', height: '6px', background: '#444', borderRadius: '50%' }}></span>
                        <span style={{ fontSize: '1.1rem', color: '#aaa' }}>{jugador.peso} kg</span>
                      </>
                    )}
                    <span style={{ width: '6px', height: '6px', background: '#444', borderRadius: '50%' }}></span>
                    <span style={{ fontSize: '1.1rem', color: '#aaa' }}>{jugador.categoria || 'Cat. N/A'}</span>
                    <span style={{ width: '6px', height: '6px', background: '#444', borderRadius: '50%' }}></span>
                    <span style={{ background: '#00e676', color: '#000', padding: '4px 12px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 900 }}>{perfil.rol}</span>
                  </div>
                </div>
              </div>
              
              <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.9 }}>
                {escudoUrl ? (
                  <div style={{ width: '100%', height: '100%', backgroundImage: `url(${escudoUrl})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
                ) : (
                  <div style={{ width: '100px', height: '100px', border: '2px solid #333', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>ESCUDO</div>
                )}
              </div>
            </div>

            {/* KPI TIER */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
              <KpiCard label="MINUTOS" value={`${perfil.minutos ?? 0}'`} />
              <KpiCard label="PARTIDOS" value={perfil.partidosJugados ?? 0} />
              
              {isArquero ? (
                <>
                  <KpiCard label="ATAJADAS" value={atajadas} color="#3b82f6" />
                  <KpiCard label="% EFECTIVIDAD" value={`${pctAtajadas}%`} color="#c084fc" />
                </>
              ) : (
                <>
                  <KpiCard label="xG BUILDUP" value={Number(perfil.xgBuildup || 0).toFixed(2)} color="#c084fc" />
                  <KpiCard label="PLUS / MINUS" value={`${(perfil.plusMinus || 0) > 0 ? '+' : ''}${perfil.plusMinus || 0}`} />
                </>
              )}
              
              <KpiCard label="RATING / IMPACTO" value={`${(perfil.impacto || 0) > 0 ? '+' : ''}${Number(perfil.impacto || 0).toFixed(1)}`} color={(perfil.impacto || 0) > 0 ? '#00e676' : '#ef4444'} />
            </div>

            {/* MAIN STATS ROW */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: '20px' }}>
              {/* Radiografía Izquierda (Ataque o Arco) */}
              {isArquero ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color: '#3b82f6', fontSize: '1.2rem', fontWeight: 900, marginBottom: '20px' }}>🧤 RADIOGRAFÍA DEL ARCO</div>
                  <Row label="Tiros Recibidos" value={tirosRecibidos} />
                  <Row label="Atajadas" value={atajadas} color="#00e676" />
                  <Row label="Goles Recibidos" value={golesRecibidos} color="#ef4444" />
                  <Row label="% Efectividad" value={`${pctAtajadas}%`} color="#c084fc" />
                  <Row label="xG Buildup (Pies)" value={Number(perfil.xgBuildup || 0).toFixed(2)} noBorder />
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color: '#00e676', fontSize: '1.2rem', fontWeight: 900, marginBottom: '20px' }}>⚔️ RADIOGRAFÍA OFENSIVA</div>
                  <Row label="Goles / xG" value={`${stats.goles ?? 0} / ${Number(stats.xG || 0).toFixed(2)}`} />
                  <Row label="Asistencias" value={stats.asistencias ?? 0} />
                  <Row label="Remates (p40)" value={stats.remates ?? 0} sub={`(${(stats.remates * factor40).toFixed(1)})`} />
                  <Row label="Duelos OFE" value={`${stats.duelosOfeGanados ?? 0}/${stats.duelosOfeTotales ?? 0}`} sub={`(${stats.duelosOfeTotales > 0 ? Math.round(((stats.duelosOfeGanados || 0) / stats.duelosOfeTotales) * 100) : 0}%)`} />
                  <Row label="Duelos Perdidos" value={stats.duelosOfePerdidos ?? 0} color="#ef4444" noBorder />
                </div>
              )}

              {/* Centro: Radar */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
                <div style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 900, marginBottom: '10px' }}>PERFIL GLOBAL DE RENDIMIENTO</div>
                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '10px', textAlign: 'center' }}>Percentiles estimados en base a producción p40 vs media general de Futsal.</div>
                
                <div style={{ flex: 1, width: '100%', minHeight: '220px', display: 'flex', justifyContent: 'center' }}>
                  <RadarChart width={450} height={280} cx="50%" cy="50%" outerRadius="75%" data={perfil.dataRadar}>
                    <PolarGrid stroke="#333" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#aaa', fontSize: 11, fontWeight: 'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Jugador" dataKey="A" stroke={isArquero ? "#3b82f6" : "#00e676"} fill={isArquero ? "#3b82f6" : "#00e676"} fillOpacity={0.4} isAnimationActive={false} />
                  </RadarChart>
                </div>
              </div>

              {/* Radiografía Derecha (Defensa/Distribución) */}
              {isArquero ? (
                 <div style={{ background: 'rgba(255,255,255,0.03)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color: '#00e676', fontSize: '1.2rem', fontWeight: 900, marginBottom: '20px' }}>⚡ DISTRIBUCIÓN Y DEFENSA</div>
                  <Row label="Recuperaciones" value={stats.recuperaciones ?? 0} color="#00e676" />
                  <Row label="Pérdidas Totales" value={stats.perdidas ?? 0} color="#ef4444" />
                  <Row label="Pases Clave / Asist" value={stats.asistencias ?? 0} color="#eab308" />
                  <Row label="Duelos (Gan/Tot)" value={`${stats.duelosDefGanados ?? 0}/${stats.duelosDefTotales ?? 0}`} sub={`(${stats.duelosDefTotales > 0 ? Math.round(((stats.duelosDefGanados || 0) / stats.duelosDefTotales) * 100) : 0}%)`} />
                  <Row label="Faltas Recibidas" value={stats.faltasRecibidas ?? 0} noBorder />
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color: '#ef4444', fontSize: '1.2rem', fontWeight: 900, marginBottom: '20px' }}>🛡️ RADIOGRAFÍA DEFENSIVA</div>
                  <Row label="Recuperaciones (p40)" value={stats.recuperaciones ?? 0} sub={`(${(stats.recuperaciones * factor40).toFixed(1)})`} color="#00e676" />
                  <Row label="Recuperaciones Altas" value={stats.recAltas ?? 0} color="#eab308" />
                  <Row label="Pérdidas (Peligrosas)" value={`${stats.perdidas ?? 0}`} sub={`(${stats.perdidasPeligrosas})`} color="#ef4444" />
                  <Row label="Duelos DEF" value={`${stats.duelosDefGanados ?? 0}/${stats.duelosDefTotales ?? 0}`} sub={`(${stats.duelosDefTotales > 0 ? Math.round(((stats.duelosDefGanados || 0) / stats.duelosDefTotales) * 100) : 0}%)`} />
                  <Row label="Duelos Perdidos" value={stats.duelosDefPerdidos ?? 0} color="#ef4444" noBorder />
                </div>
              )}
            </div>

            {/* GRILLA 2x2: MAPAS A LA IZQUIERDA Y ESTADÍSTICAS A LA DERECHA */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
              
              {/* FILA 1: MAPA 1 */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isArquero ? '#3b82f6' : '#00e676', marginBottom: '5px' }}>
                  {isArquero ? 'MAPA DEL ARCO (TIROS RECIBIDOS)' : 'MAPA OFENSIVO (REMATES Y ASISTENCIAS)'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '15px' }}>
                  {isArquero ? `${accionesArco.length} acciones de protección del arco (Atajadas vs Goles).` : `${accionesAtaque.length} acciones de creación y finalización. (Ref de colores en Destino de Remates)`}
                </div>
                <CanchaFutsal accionesMapa={isArquero ? accionesArco : accionesAtaque} dotSize={16} />
                {isArquero && (
                  <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 700 }}><span style={{ color: '#3b82f6', fontSize: '1.2em' }}>●</span> Atajadas</span>
                    <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 700 }}><span style={{ color: '#ef4444', fontSize: '1.2em' }}>●</span> Goles Recibidos</span>
                  </div>
                )}
              </div>

              {/* FILA 1 DERECHA: REMATES */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '24px 20px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', marginBottom: '20px' }}>
                  {isArquero ? 'COMPOSICIÓN DE TIROS AL ARCO' : 'DESTINO DE REMATES'}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  
                  {isArquero ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                       <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '1.05rem', fontWeight: 700, marginBottom: '8px' }}>
                          <span style={{ color: '#00e676' }}>Atajadas</span><span style={{ color: '#ccc' }}>{atajadas} <span style={{ color: '#555', fontSize: '0.85em' }}>({pctAtajadas}%)</span></span>
                        </div>
                        <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
                          <div style={{ width: `${pctAtajadas}%`, height: '100%', background: '#00e676', borderRadius: '5px' }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '1.05rem', fontWeight: 700, marginBottom: '8px' }}>
                          <span style={{ color: '#ef4444' }}>Goles Recibidos</span><span style={{ color: '#ccc' }}>{golesRecibidos} <span style={{ color: '#555', fontSize: '0.85em' }}>({100 - pctAtajadas}%)</span></span>
                        </div>
                        <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
                          <div style={{ width: `${100 - pctAtajadas}%`, height: '100%', background: '#ef4444', borderRadius: '5px' }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <SeccionRemates dataRemates={dataRemates} totalRemates={stats.remates ?? 0} />
                  )}
                  
                  {!isArquero && perfil.perfilRemate && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 800, marginBottom: '8px' }}>ZONA (CARRIL)</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                          <span style={{ color: '#aaa' }}>Centro: <strong style={{color:'#fff'}}>{perfil.perfilRemate.centro}</strong></span>
                          <span style={{ color: '#aaa' }}>Banda: <strong style={{color:'#fff'}}>{perfil.perfilRemate.banda}</strong></span>
                        </div>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 800, marginBottom: '8px' }}>DISTANCIA</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                          <span style={{ color: '#aaa' }}>Cerca: <strong style={{color:'#fff'}}>{perfil.perfilRemate.cerca}</strong></span>
                          <span style={{ color: '#aaa' }}>Lejos: <strong style={{color:'#fff'}}>{perfil.perfilRemate.lejos}</strong></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* FILA 2: DISTRIBUCIÓN / DISCIPLINA Y DUELOS */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isArquero ? '#00e676' : '#3b82f6', marginBottom: '5px' }}>
                  {isArquero ? 'JUEGO CON LOS PIES Y DISTRIBUCIÓN' : 'DISTRIBUCIÓN Y LUCHA'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '15px' }}>
                  {isArquero ? `${accionesDistribucionGK.length} acciones de juego con los pies, saques y recuperaciones.` : `${accionesResto.length} acciones de recuperaciones, pérdidas y duelos en campo.`}
                </div>
                <CanchaFutsal accionesMapa={isArquero ? accionesDistribucionGK : accionesResto} dotSize={16} />
                <LeyendaMapaDistribucion />
              </div>

              {/* COLUMNA DERECHA FILA 2 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#facc15', marginBottom: '15px' }}>DISCIPLINA</div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#0a0a0a', padding: '8px 15px', borderRadius: '8px', gap: '10px' }}>
                        <div style={{ width: '15px', height: '22px', background: '#facc15', borderRadius: '2px' }} />
                        <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{amarillas}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#0a0a0a', padding: '8px 15px', borderRadius: '8px', gap: '10px' }}>
                        <div style={{ width: '15px', height: '22px', background: '#ef4444', borderRadius: '2px' }} />
                        <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{rojas}</div>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Row label="Faltas Hechas" value={stats.faltasCometidas} noBorder />
                      <Row label="Recibidas" value={stats.faltasRecibidas} noBorder />
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0ea5e9', marginBottom: '15px' }}>BALANCE DE DUELOS</div>
                  <Row 
                    label="Duelos Ofensivos" 
                    value={`${stats.duelosOfeGanados}/${stats.duelosOfeTotales}`} 
                    sub={`(${stats.duelosOfeTotales > 0 ? Math.round((stats.duelosOfeGanados / stats.duelosOfeTotales)*100) : 0}%)`} 
                  />
                  <Row 
                    label="Duelos Defensivos" 
                    value={`${stats.duelosDefGanados}/${stats.duelosDefTotales}`} 
                    sub={`(${stats.duelosDefTotales > 0 ? Math.round((stats.duelosDefGanados / stats.duelosDefTotales)*100) : 0}%)`} 
                    noBorder 
                  />
                </div>

              </div>

            </div>

            {/* FUTSAL IQ / QUIMICA Y SITUACIONES ESPECIALES */}
            <div style={{ background: 'linear-gradient(90deg, #1a1a2e 0%, #0a0a0a 100%)', borderRadius: '16px', padding: '20px', border: '1px solid #3b82f6', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: 'auto' }}>
              <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#3b82f6', marginBottom: '10px' }}>🧠 INTELIGENCIA TÁCTICA Y SITUACIONES</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ color: '#aaa', fontSize: '0.95rem' }}>Transiciones Rápidas Involucradas</span>
                    <strong style={{ fontSize: '1.2rem', color: '#fff' }}>{perfil.transicionesInvolucrado}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                    <span style={{ color: '#aaa', fontSize: '0.95rem' }}>Eficacia como Arquero Jugador (5v4)</span>
                    <strong style={{ fontSize: '1rem', color: '#666' }}>S/D <span style={{fontSize:'0.7rem'}}>(Próximamente)</span></strong>
                  </div>
              </div>

              <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#c084fc', marginBottom: '10px' }}>🤝 QUÍMICA: EL QUINTETO IDEAL</div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    
                    <div style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase', textAlign: 'center', marginBottom: '5px' }}>
                      El quinteto de mejor rendimiento estructural en cancha
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                      
                      {/* El Jugador Principal */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#111', border: '2px solid #00e676', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {jugador.foto ? (
                            <div style={{ width: '100%', height: '100%', backgroundImage: `url(${jugador.foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                          ) : (
                            <span style={{color:'#00e676', fontWeight:'bold', fontSize:'0.9rem'}}>{jugador.apellido?.substring(0,2).toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#00e676', marginTop: '5px' }}>{jugador.apellido}</div>
                      </div>

                      {/* Signo más para separar visualmente */}
                      <div style={{ color: '#555', fontWeight: 900 }}>+</div>

                      {/* Mapeo de los 4 socios para completar el quinteto */}
                      {companerosQuinteto.length > 0 ? (
                        companerosQuinteto.map((socio, idx) => (
                          <div key={socio.id || idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#222', border: '2px solid #c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              {socio.foto ? (
                                <div style={{ width: '100%', height: '100%', backgroundImage: `url(${socio.foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                              ) : (
                                <span style={{color:'#c084fc', fontWeight:'bold', fontSize:'0.8rem'}}>{socio.apellido?.substring(0,2).toUpperCase()}</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fff', marginTop: '5px', textAlign: 'center' }}>{socio.apellido}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.8rem', flex: 1, textAlign: 'center' }}>
                          Insuficientes datos para armar el quinteto ideal.
                        </div>
                      )}

                    </div>

                    {/* Stats del quinteto en la parte de abajo */}
                    {perfil?.mejorQuinteto && (
                      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#aaa' }}>Rating: <strong style={{ color: '#00e676' }}>{perfil.mejorQuinteto.rating.toFixed(1)}</strong></span>
                        <span style={{ fontSize: '0.75rem', color: '#aaa' }}>+/-: <strong style={{ color: '#fff' }}>{perfil.mejorQuinteto.diffGoles > 0 ? '+' : ''}{perfil.mejorQuinteto.diffGoles}</strong></span>
                        <span style={{ fontSize: '0.75rem', color: '#aaa' }}>Mins: <strong style={{ color: '#fff' }}>{perfil.mejorQuinteto.minutos.toFixed(0)}'</strong></span>
                      </div>
                    )}
                  </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#555', letterSpacing: '1px', fontWeight: 700 }}>
              <span>
                <strong>
                  VIRTUAL.CLUB © {new Date().getFullYear()} - Propiedad de{" "} 
                  <span style={{ color: "#fd7d05" }}>VirtualFutsal</span> {" "} 
                  - Todos los derechos reservados.
                </strong>
              </span>
              <span>CONTEXTO: {contexto === 'TODA LA TEMPORADA' ? `TEMPORADA ${new Date().getFullYear()}` : contexto}</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerReportGenerator;