import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { getColorAccion } from '../utils/helpers';

const CANVAS_W = 1080;
const CANVAS_H = 1920;

const asNumber = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };

const KpiBox = ({ label, value, color, borderColor }) => (
  <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', borderRadius: '12px', border: `2px solid ${borderColor}`, padding: '10px 5px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
    <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 800, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
    <div style={{ fontSize: '2.4rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
  </div>
);

const RowStat = ({ label, value, subValue, valueColor="#fff" }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '1.4rem' }}>
    <span style={{ color: '#ccc', fontWeight: 600 }}>{label}</span>
    <div style={{ textAlign: 'right' }}>
      <strong style={{ color: valueColor, fontWeight: 900 }}>{value}</strong>
      {subValue && <div style={{ fontSize: '0.9rem', color: '#aaa', fontWeight: 700, marginTop: '2px' }}>{subValue}</div>}
    </div>
  </div>
);

// --- CANCHA DE FUTSAL NEÓN PLANA Y PRECISA (CORRECCIÓN HTML2CANVAS) ---
// Se eliminó Perspective y RotateX para garantizar consistencia en exportación.
const CanchaFutsalNeonDeep = ({ accionesMapa, dotSize = 10, colorLinea = '#00ff88' }) => (
  <div style={{ position: 'relative', width: '100%', aspectRatio: '2/1', background: 'transparent', overflow: 'hidden', border: `2px solid ${colorLinea}`, borderRadius: '4px', boxShadow: `0 5px 15px ${colorLinea}33` }}>
    {/* DIBUJO DE LÍNEAS REGLAMENTARIAS FUTSAL (Área 6m, Marcas) */}
    {/* Áreas (Arcos reglamentarios compactados en CSS) */}
    <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '15%', border: `1.5px solid ${colorLinea}`, borderLeft: 'none', borderRadius: '0 100px 100px 0' }} />
    <div style={{ position: 'absolute', right: 0, top: '20%', bottom: '20%', width: '15%', border: `1.5px solid ${colorLinea}`, borderRight: 'none', borderRadius: '100px 0 0 100px' }} />
    
    {/* Marcas de Penal 6m y 10m (opcionales para mayor detalle) */}
    <div style={{ position: 'absolute', left: '15%', top: '50%', width: '4px', height: '4px', background: colorLinea, borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.5 }} />
    <div style={{ position: 'absolute', right: '15%', top: '50%', width: '4px', height: '4px', background: colorLinea, borderRadius: '50%', transform: 'translate(50%, -50%)', opacity: 0.5 }} />
    <div style={{ position: 'absolute', left: '25%', top: '50%', width: '3px', height: '3px', background: colorLinea, borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.3 }} />
    <div style={{ position: 'absolute', right: '25%', top: '50%', width: '3px', height: '3px', background: colorLinea, borderRadius: '50%', transform: 'translate(50%, -50%)', opacity: 0.3 }} />

    {/* Porterías (Arcos) */}
    <div style={{ position: 'absolute', left: '-2px', top: '40%', bottom: '40%', width: '2%', border: `3px solid #c2c2c2`, borderLeft: 'none' }} />
    <div style={{ position: 'absolute', right: '-2px', top: '40%', bottom: '40%', width: '2%', border: `3px solid #c2c2c2`, borderRight: 'none' }} />
    
    {/* Mitad de cancha y círculo central */}
    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1.5px', background: colorLinea, transform: 'translateX(-50%)' }} />
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: '18%', height: '36%', border: `1.5px solid ${colorLinea}`, borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: '6px', height: '6px', background: colorLinea, borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.5 }} />

    {accionesMapa.map((ev, i) => (
      <div key={i} style={{ position: 'absolute', left: `${ev.x}%`, top: `${ev.y}%`, width: `${dotSize}px`, height: `${dotSize}px`, backgroundColor: getColorAccion(ev.accion), borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 1, boxShadow: `0 0 4px ${getColorAccion(ev.accion)}`, zIndex: 2 }} />
    ))}
  </div>
);

const LegendMap = ({ items }) => (
  <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', fontSize: '0.95rem', fontWeight: 700, flexWrap: 'wrap', marginTop: '10px' }}>
    {items.map(item => (
      <span key={item.color} style={{ color: item.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span style={{width: '10px', height: '10px', borderRadius: '50%', background: item.color}} /> {item.label}
      </span>
    ))}
  </div>
);

const PlayerReportIGStory = ({ jugador, perfil, contexto, jugadores = [] }) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const wrapperRef = useRef(null);

  const stats = perfil?.stats ?? {};
  // clubName y escudoUrl se mantienen para lógica, aunque se sacó el texto de clubName de la visual
  const clubName = localStorage.getItem('mi_club') || 'VIRTUAL FUTSAL';
  const escudoUrl = localStorage.getItem('escudo_url') || null;

  const accionesMapa = (perfil?.accionesDirectas ?? []).map((ev) => ({ ...ev, x: ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x, y: ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y })).filter((ev) => ev.x != null && ev.y != null);
  const accionesAtaque = accionesMapa.filter(ev => ['Gol', 'Remate - Gol', 'Remate - Atajado', 'Remate - Desviado', 'Remate - Rebatido', 'Asistencia'].includes(ev.accion) || ev.accion?.includes('Remate'));
  const accionesResto = accionesMapa.filter(ev => !['Gol', 'Remate - Gol', 'Remate - Atajado', 'Remate - Desviado', 'Remate - Rebatido', 'Asistencia'].includes(ev.accion) && !ev.accion?.includes('Remate'));

  let companerosQuinteto = [];
  let ratingEstruc = '-';
  let diffGoles = '-';

  if (perfil?.mejorQuinteto && jugadores.length > 0) {
    const otrosIds = perfil.mejorQuinteto.ids.filter(id => id != jugador.id).slice(0, 4);
    companerosQuinteto = otrosIds.map(id => jugadores.find(j => j.id == id)).filter(Boolean);
    ratingEstruc = perfil.mejorQuinteto.rating?.toFixed(1) || '-';
    diffGoles = perfil.mejorQuinteto.diffGoles > 0 ? `+${perfil.mejorQuinteto.diffGoles}` : perfil.mejorQuinteto.diffGoles;
  } else if (perfil?.topSocios) {
    companerosQuinteto = perfil.topSocios.slice(0, 4);
  }

  while (companerosQuinteto.length < 4) {
    companerosQuinteto.push({ id: `empty-${companerosQuinteto.length}`, vacio: true });
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
    const scaleWrapper = document.getElementById('ig-scale-wrapper');
    const containerDiv = scaleWrapper.parentElement;
    const el = document.getElementById('ig-story-exportable');
    
    if (!el || !scaleWrapper || !containerDiv || exportando) return;
    setExportando(true);
    
    const originalTransform = scaleWrapper.style.transform;
    const originalWidth = containerDiv.style.width;
    const originalHeight = containerDiv.style.height;
    
    scaleWrapper.style.transform = 'scale(1)';
    containerDiv.style.width = `${CANVAS_W}px`;
    containerDiv.style.height = `${CANVAS_H}px`;
    
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#0f172a', logging: false });
        const link = document.createElement('a');
        link.download = `Story_${jugador?.apellido}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (err) {
        alert('Hubo un error al generar la Historia.');
      } finally {
        scaleWrapper.style.transform = originalTransform;
        containerDiv.style.width = originalWidth;
        containerDiv.style.height = originalHeight;
        setExportando(false);
      }
    }, 300);
  };

  if (!jugador || !perfil) return null;

  const totalDuelosDef = asNumber(stats.duelosDefGanados) + asNumber(stats.duelosDefPerdidos);
  const totalDuelosOfe = asNumber(stats.duelosOfeGanados) + asNumber(stats.duelosOfePerdidos);
  const totalDuelos = totalDuelosDef + totalDuelosOfe;
  const totalDuelosGanados = asNumber(stats.duelosDefGanados) + asNumber(stats.duelosOfeGanados);
  const pctDuelos = totalDuelos > 0 ? Math.round((totalDuelosGanados / totalDuelos) * 100) : 0;

  return (
    <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <div style={{ width: `${CANVAS_W * escala}px`, display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button onClick={exportarPNG} disabled={exportando} style={{ background: exportando ? '#1a1a1a' : '#c084fc', color: '#fff', fontWeight: 900, padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          {exportando ? '⏳ Armando Historia...' : '📸 DESCARGAR STORY'}
        </button>
      </div>

      <div style={{ width: `${CANVAS_W * escala}px`, height: `${CANVAS_H * escala}px`, overflow: 'hidden', borderRadius: `${Math.round(20 * escala)}px`, boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
        <div id="ig-scale-wrapper" style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: `${CANVAS_W}px`, height: `${CANVAS_H}px` }}>
          
          <div id="ig-story-exportable" style={{ 
              width: `${CANVAS_W}px`, height: `${CANVAS_H}px`, 
              background: 'linear-gradient(145deg, #0f172a 0%, #020617 100%)', 
              color: '#fff', 
              // MODIFICACIÓN 1: Más margen superior (padding-top: 90px)
              padding: '90px 40px 60px',
              boxSizing: 'border-box', 
              display: 'flex', flexDirection: 'column', gap: '20px',
              position: 'relative', overflow: 'hidden'
            }}>
            
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '120%', height: '120%', background: 'radial-gradient(circle at 50% 50%, rgba(0,255,136,0.05) 0%, transparent 60%)', zIndex: 0, pointerEvents: 'none' }} />

            <div style={{ zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* HEADER ROW */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '10px' }}>
                <span style={{ color: '#00ff88', fontSize: '1.4rem', fontWeight: 900, letterSpacing: '2px' }}>ANALISIS INDIVIDUAL</span>
                <span style={{ color: '#a3e635', fontSize: '1.2rem', fontWeight: 800 }}>{contexto || 'TEMPORADA 2024'}</span>
              </div>

              {/* JUGADOR INFO CARD */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '15px 20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '10px' }}>
                <div style={{ width: '110px', height: '110px', borderRadius: '50%', background: '#111', border: '4px solid #00ff88', overflow: 'hidden', flexShrink: 0 }}>
                  {jugador.foto ? (
                    <div style={{ width: '100%', height: '100%', backgroundImage: `url(${jugador.foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', fontSize: '3rem', color: '#00ff88', fontWeight: 900 }}>{jugador.apellido?.charAt(0)}</div>
                  )}
                </div>
                
                <div style={{ marginLeft: '25px', flex: 1 }}>
                  <div style={{ fontSize: '2.8rem', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1 }}>{jugador.apellido}</div>
                  <div style={{ fontSize: '1.4rem', color: '#cbd5e1', fontWeight: 700, margin: '4px 0 10px' }}>{jugador.nombre}</div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.4rem', background: '#00ff88', color: '#000', padding: '4px 12px', borderRadius: '6px', fontWeight: 900 }}>#{jugador.dorsal}</span>
                    <span style={{ fontSize: '1.1rem', background: 'rgba(0,255,136,0.2)', color: '#00ff88', padding: '5px 15px', borderRadius: '6px', fontWeight: 800, border: '1px solid #00ff88' }}>{perfil.rol}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
                  {escudoUrl ? (
                    // MODIFICACIÓN 2 & 3: Escudo 25% más grande (70px -> 90px) y se eliminó el span `{clubName}`
                    <div style={{ width: '90px', height: '90px', backgroundImage: `url(${escudoUrl})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
                  ) : (
                    <div style={{ width: '90px', height: '90px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🛡️</div>
                  )}
                  {/* Nombre del club eliminado (reemplazado por gap para estética si es necesario o simplemente sacado) */}
                </div>
              </div>

              {/* KPIs BOXES */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <KpiBox label="RATING" value={`${(perfil.impacto || 0) > 0 ? '+' : ''}${Number(perfil.impacto || 0).toFixed(1)}`} color="#00ff88" borderColor="#00ff88" />
                <KpiBox label="xG BUILDUP" value={Number(perfil.xgBuildup || 0).toFixed(2)} color="#c084fc" borderColor="#c084fc" />
                <KpiBox label="+ / -" value={`${(perfil.plusMinus || 0) > 0 ? '+' : ''}${perfil.plusMinus || 0}`} color="#fff" borderColor="rgba(255,255,255,0.3)" />
                <KpiBox label="MINUTOS" value={`${perfil.minutos ?? 0}'`} color="#38bdf8" borderColor="#38bdf8" />
              </div>

              {/* RADAR & STATS - Chart enlarged to 350px height */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '30px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px' }}>
                   <RadarChart width={450} height={350} cx="50%" cy="50%" outerRadius="75%" data={perfil.dataRadar}>
                      <PolarGrid stroke="rgba(255,255,255,0.2)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#e2e8f0', fontSize: 15, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Jugador" dataKey="A" stroke="#00ff88" strokeWidth={3} fill="#00ff88" fillOpacity={0.3} isAnimationActive={false} />
                    </RadarChart>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <RowStat label="Goles" value={stats.goles ?? 0} />
                  <RowStat label="Asistencias" value={stats.asistencias ?? 0} />
                  <RowStat label="Remates Total" value={stats.remates ?? 0} />
                  <RowStat label="xG Generado" value={Number(stats.xG || 0).toFixed(2)} valueColor="#c084fc"/>
                  <RowStat label="Recuperaciones" value={stats.recuperaciones ?? 0} valueColor="#38bdf8" />
                  <RowStat label="Pérdidas Totales" value={stats.perdidas ?? 0} valueColor="#ef4444" />
                </div>
              </div>

              {/* GRILLA DE INFORMACIÓN ADICIONAL - Disciplina y Duelos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                {/* DISCIPLINA */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px 20px', borderRadius: '20px', border: '1px solid #eab308' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#eab308', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', textAlign: 'center' }}>Disciplina</div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#111', padding: '6px 14px', borderRadius: '6px', border: '1px solid #444', gap: '8px' }}>
                      <div style={{ width: '12px', height: '18px', background: '#facc15', borderRadius: '2px' }} />
                      <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{asNumber(stats.amarillas)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#111', padding: '6px 14px', borderRadius: '6px', border: '1px solid #444', gap: '8px' }}>
                      <div style={{ width: '12px', height: '18px', background: '#ef4444', borderRadius: '2px' }} />
                      <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{asNumber(stats.rojas)}</div>
                    </div>
                  </div>
                  <RowStat label="Faltas Cometidas" value={stats.faltasCometidas || 0} valueColor="#fff" />
                  <RowStat label="Faltas Recibidas" value={stats.faltasRecibidas || 0} valueColor="#00ff88" />
                </div>

                {/* DUELOS */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px 20px', borderRadius: '20px', border: '1px solid #fff' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', textAlign: 'center' }}>Balance de Duelos</div>
                  <RowStat 
                    label="Eficiencia Global" 
                    value={`${pctDuelos}%`} 
                    subValue={`(${totalDuelosGanados}/${totalDuelos})`}
                    valueColor="#fff"
                  />
                  <RowStat 
                    label="Eficiencia Ofensiva" 
                    value={`${totalDuelosOfe > 0 ? Math.round((asNumber(stats.duelosOfeGanados) / totalDuelosOfe) * 100) : 0}%`}
                    subValue={`(${asNumber(stats.duelosOfeGanados)}/${totalDuelosOfe})`}
                    valueColor="#fff"
                  />
                  <RowStat 
                    label="Eficiencia Defensiva" 
                    value={`${totalDuelosDef > 0 ? Math.round((asNumber(stats.duelosDefGanados) / totalDuelosDef) * 100) : 0}%`}
                    subValue={`(${asNumber(stats.duelosDefGanados)}/${totalDuelosDef})`}
                    valueColor="#fff"
                  />
                </div>
              </div>

              {/* ZONAS DE ACCIÓN SEPARADAS - Two distinct cards/columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                {/* Mapa Ataque */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '20px', border: '1px solid #00ff88', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#00ff88', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>Mapa de Ataque</div>
                  <div style={{ padding: '0 20px' }}>
                    <CanchaFutsalNeonDeep accionesMapa={accionesAtaque} dotSize={10} colorLinea="#00ff88" />
                  </div>
                  <LegendMap items={[
                    { label: 'Gol', color: '#fbbf24' },
                    { label: 'Remate', color: '#00ff88' },
                    { label: 'Asistencia', color: '#a3e635' }
                  ]} />
                </div>

                {/* Mapa Recuperación */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '20px', border: '1px solid #38bdf8', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#38bdf8', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>Mapa de Disposción Táctica</div>
                  <div style={{ padding: '0 20px' }}>
                    <CanchaFutsalNeonDeep accionesMapa={accionesResto} dotSize={10} colorLinea="#38bdf8" />
                  </div>
                  <LegendMap items={[
                    { label: 'Recuperaciones', color: '#38bdf8' },
                    { label: 'Duelo', color: '#c084fc' },
                    { label: 'Pérdida', color: '#f87171' }
                  ]} />
                </div>
              </div>

              {/* QUINTETO IDEAL */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px 25px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 20px' }}>
                  
                  {/* Línea conectora base */}
                  <div style={{ position: 'absolute', top: '40px', left: '100px', right: '80px', height: '2px', background: 'rgba(255,255,255,0.2)', zIndex: 0 }} />

                  {/* Player principal */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#111', border: '3px solid #00ff88', overflow: 'hidden', marginBottom: '8px' }}>
                      {jugador.foto ? <div style={{ width: '100%', height: '100%', backgroundImage: `url(${jugador.foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} /> : <span style={{display:'block', textAlign:'center', lineHeight:'80px', color:'#00ff88', fontWeight:'bold', fontSize:'2rem'}}>{jugador.apellido?.charAt(0)}</span>}
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#00ff88' }}>#{jugador.dorsal} {jugador.apellido?.substring(0, 4)}.</span>
                  </div>

                  {/* Compañeros */}
                  {companerosQuinteto.map((socio, idx) => (
                    <div key={socio.id || idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                      <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#1e293b', border: '2px solid rgba(255,255,255,0.3)', overflow: 'hidden', marginBottom: '8px', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {socio.vacio ? (
                          <span style={{ fontSize: '2rem', color: 'rgba(255,255,255,0.1)' }}>👤</span>
                        ) : socio.foto ? (
                          <div style={{ width: '100%', height: '100%', backgroundImage: `url(${socio.foto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                        ) : (
                          <span style={{ fontSize: '1.5rem', color: '#94a3b8', fontWeight: 900 }}>{socio.apellido?.charAt(0)}</span>
                        )}
                      </div>
                      {!socio.vacio && <span style={{ fontSize: '1rem', fontWeight: 800, color: '#cbd5e1' }}>#{socio.dorsal} {socio.apellido?.substring(0, 15)}</span>}
                    </div>
                  ))}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', fontSize: '1.1rem', fontWeight: 800 }}>
                  <span style={{ color: '#cbd5e1' }}>RATING ESTRUCTURAL: <span style={{ color: '#00ff88' }}>{ratingEstruc}</span></span>
                  <span style={{ color: '#cbd5e1' }}>+/- GOLES: <span style={{ color: '#00ff88' }}>{diffGoles}</span></span>
                </div>
                <div style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>QUINTETO IDEAL (Estructural)</div>
              </div>

              {/* FOOTER - Actualizado 2026 */}
              <div style={{ textAlign: 'center', fontSize: '1rem', color: 'rgba(255,255,255,0.3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', paddingBottom: '10px', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '15px' }}>
                VIRTUAL.CLUB © 2026 - Propiedad de{" "}
                <span style={{ color: "#fd7d05", fontWeight: 'bold' }}>VirtualFutsal</span>{" "}
                - Todos los derechos reservados.
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerReportIGStory;