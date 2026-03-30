import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { getColorAccion } from '../utils/helpers';

const CANVAS_W = 1080;

// ─── Helpers ───────────────────────────────────────────────────────────────

const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getTarjetasAmarillas = (stats) =>
  asNumber(
    stats?.amarillas ??
      stats?.tarjetasAmarillas ??
      stats?.yellowCards ??
      stats?.tarjetas_amarillas ??
      0
  );

const getTarjetasRojas = (stats) =>
  asNumber(
    stats?.rojas ??
      stats?.tarjetasRojas ??
      stats?.redCards ??
      stats?.tarjetas_rojas ??
      0
  );

// ─── Componentes auxiliares ────────────────────────────────────────────────

const KpiCard = ({ label, value, color = '#fff', compact = false }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.03)',
      padding: compact ? '14px 10px' : '20px 16px',
      borderRadius: '18px',
      border: '1px solid rgba(255,255,255,0.06)',
      textAlign: 'center',
      minWidth: 0,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        fontSize: compact ? '0.78rem' : '0.92rem',
        color: '#666',
        fontWeight: 800,
        marginBottom: '5px',
        letterSpacing: '1px',
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: compact ? '2rem' : '2.7rem',
        fontWeight: 900,
        color,
        lineHeight: 1,
        wordBreak: 'break-word',
      }}
    >
      {value}
    </div>
  </div>
);

const Row = ({ label, value, color = '#fff', sub = '', noBorder = false, compact = false }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: compact ? '10px 0' : '13px 0',
      borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)',
      fontSize: compact ? '0.92rem' : '1.1rem',
      gap: '10px',
    }}
  >
    <span style={{ color: '#888', fontWeight: 600 }}>{label}</span>
    <strong style={{ color, textAlign: 'right', flexShrink: 0 }}>
      {value}
      {sub && (
        <span
          style={{
            color: '#555',
            fontSize: compact ? '0.82rem' : '0.92rem',
            marginLeft: '5px',
          }}
        >
          {sub}
        </span>
      )}
    </strong>
  </div>
);

// ─── Cancha de Futsal ───────────────────────────────────────────────────────

const CanchaFutsal = ({ accionesMapa, dotSize = 18 }) => (
  <div
    style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: '#0a1a0f',
      borderRadius: '14px',
      overflow: 'hidden',
      border: '2px solid rgba(255,255,255,0.08)',
    }}
  >
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '5%',
        bottom: '5%',
        width: '1.5px',
        background: 'rgba(255,255,255,0.15)',
        transform: 'translateX(-50%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '18%',
        height: '32%',
        border: '1.5px solid rgba(255,255,255,0.15)',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '5px',
        height: '5px',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: '22%',
        bottom: '22%',
        width: '16%',
        border: '1.5px solid rgba(255,255,255,0.15)',
        borderLeft: 'none',
        borderRadius: '0 80px 80px 0',
      }}
    />
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: '22%',
        bottom: '22%',
        width: '16%',
        border: '1.5px solid rgba(255,255,255,0.15)',
        borderRight: 'none',
        borderRadius: '80px 0 0 80px',
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: '22%',
        top: '50%',
        width: '4px',
        height: '4px',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        right: '22%',
        top: '50%',
        width: '4px',
        height: '4px',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: '50%',
        transform: 'translate(50%, -50%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: '4%',
        border: '1.5px solid rgba(255,255,255,0.12)',
        borderRadius: '8px',
        pointerEvents: 'none',
      }}
    />

    {accionesMapa.map((ev, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${ev.x}%`,
          top: `${ev.y}%`,
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          backgroundColor: getColorAccion(ev.accion),
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0.92,
          boxShadow: `0 0 10px ${getColorAccion(ev.accion)}99`,
          zIndex: 2,
        }}
      />
    ))}
  </div>
);

// ─── Leyenda del mapa ──────────────────────────────────────────────────────

const LeyendaMapa = ({ compact = false }) => {
  const items = [
    { label: 'Remate', accion: 'Gol' },
    { label: 'Recuperación', accion: 'Recuperación' },
    { label: 'Pérdida', accion: 'Pérdida' },
    { label: 'Duelo OFE', accion: 'Duelo OFE Ganado' },
    { label: 'Duelo DEF', accion: 'Duelo DEF Ganado' },
    { label: 'Asistencia', accion: 'Asistencia' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? '8px 16px' : '8px 20px',
        marginTop: compact ? '8px' : '10px',
        justifyContent: 'center',
      }}
    >
      {items.map(({ label, accion }) => (
        <span
          key={accion}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: compact ? '0.82rem' : '0.95rem',
            color: '#777',
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: getColorAccion(accion),
              flexShrink: 0,
              boxShadow: `0 0 6px ${getColorAccion(accion)}88`,
            }}
          />
          {label}
        </span>
      ))}
    </div>
  );
};

// ─── Sección Remates ───────────────────────────────────────────────────────

const COLORS_REMATES = {
  Gol: '#00ff88',
  Atajado: '#3b82f6',
  Desviado: '#888888',
  Rebatido: '#a855f7',
};

const SeccionRemates = ({ dataRemates, totalRemates, compact = false }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '6px' : '8px' }}>
    {dataRemates.length > 0 ? (
      dataRemates.map((item, idx) => {
        const pct = totalRemates > 0 ? Math.round((item.value / totalRemates) * 100) : 0;
        return (
          <div key={idx}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: compact ? '0.88rem' : '1rem',
                fontWeight: 700,
                marginBottom: '4px',
              }}
            >
              <span style={{ color: COLORS_REMATES[item.name] || '#fff' }}>{item.name}</span>
              <span style={{ color: '#ccc' }}>
                {item.value}{' '}
                <span style={{ color: '#555', fontSize: '0.85em' }}>({pct}%)</span>
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: compact ? '7px' : '9px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: COLORS_REMATES[item.name] || '#fff',
                  borderRadius: '6px',
                }}
              />
            </div>
          </div>
        );
      })
    ) : (
      <div
        style={{
          color: '#444',
          fontSize: compact ? '0.9rem' : '1rem',
          textAlign: 'center',
          fontWeight: 700,
        }}
      >
        Sin remates registrados
      </div>
    )}
  </div>
);

// ─── Sección Tarjetas ──────────────────────────────────────────────────────

const SeccionTarjetas = ({ amarillas = 0, rojas = 0, compact = false }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: compact ? '8px' : '10px',
      marginTop: compact ? '10px' : '12px',
    }}
  >
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '12px',
        padding: compact ? '10px 8px' : '12px 10px',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ fontSize: compact ? '0.68rem' : '0.72rem', color: '#777', fontWeight: 800 }}>
        AMARILLAS
      </div>
      <div style={{ fontSize: compact ? '1.3rem' : '1.5rem', fontWeight: 900, color: '#facc15', lineHeight: 1.1 }}>
        {amarillas}
      </div>
    </div>

    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '12px',
        padding: compact ? '10px 8px' : '12px 10px',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ fontSize: compact ? '0.68rem' : '0.72rem', color: '#777', fontWeight: 800 }}>
        ROJAS
      </div>
      <div style={{ fontSize: compact ? '1.3rem' : '1.5rem', fontWeight: 900, color: '#ef4444', lineHeight: 1.1 }}>
        {rojas}
      </div>
    </div>
  </div>
);

// ─── Sección Stats Ofensiva/Defensiva ──────────────────────────────────────

const SeccionStats = ({ stats, perfil, compact }) => (
  <div style={{ display: 'flex', gap: compact ? '10px' : '14px', minHeight: 0 }}>
    <div
      style={{
        flex: 1,
        background: 'rgba(255,255,255,0.03)',
        padding: compact ? '16px' : '20px',
        borderRadius: compact ? '16px' : '20px',
        border: '1px solid rgba(255,255,255,0.05)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          color: '#00e676',
          fontSize: compact ? '1.05rem' : '1.3rem',
          fontWeight: 900,
          marginBottom: compact ? '10px' : '14px',
        }}
      >
        ⚔️ OFENSIVA
      </div>
      <Row
        label="Goles / xG"
        value={`${stats.goles ?? 0} / ${Number(stats.xG || 0).toFixed(2)}`}
        compact={compact}
      />
      <Row label="Asistencias" value={stats.asistencias ?? 0} compact={compact} />
      <Row
        label="Duelos OFE"
        value={`${stats.duelosOfeGanados ?? 0}/${stats.duelosOfeTotales ?? 0}`}
        sub={`(${stats.duelosOfeTotales > 0 ? Math.round(((stats.duelosOfeGanados || 0) / stats.duelosOfeTotales) * 100) : 0}%)`}
        compact={compact}
      />
      <Row
        label="Transiciones"
        value={perfil.transicionesInvolucrado ?? 0}
        color="#00e676"
        noBorder
        compact={compact}
      />
    </div>

    <div
      style={{
        flex: 1,
        background: 'rgba(255,255,255,0.03)',
        padding: compact ? '16px' : '20px',
        borderRadius: compact ? '16px' : '20px',
        border: '1px solid rgba(255,255,255,0.05)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          color: '#ef4444',
          fontSize: compact ? '1.05rem' : '1.3rem',
          fontWeight: 900,
          marginBottom: compact ? '10px' : '14px',
        }}
      >
        🛡️ DEFENSIVA
      </div>
      <Row
        label="Recuperaciones"
        value={stats.recuperaciones ?? 0}
        color="#00e676"
        compact={compact}
      />
      <Row label="Pérdidas" value={stats.perdidas ?? 0} color="#ef4444" compact={compact} />
      <Row
        label="Ratio Defensivo"
        value={`${perfil.ratioSeguridad ?? 0}%`}
        compact={compact}
      />
      <Row
        label="Duelos DEF"
        value={`${stats.duelosDefGanados ?? 0}/${stats.duelosDefTotales ?? 0}`}
        sub={`(${stats.duelosDefTotales > 0 ? Math.round(((stats.duelosDefGanados || 0) / stats.duelosDefTotales) * 100) : 0}%)`}
        noBorder
        compact={compact}
      />
    </div>
  </div>
);

// ─── Footer ────────────────────────────────────────────────────────────────

const Footer = ({ wellness, labelContexto, compact }) => (
  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {wellness ? (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: compact ? '12px 16px' : '16px 22px',
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: '14px',
          gap: '16px',
        }}
      >
        <div
          style={{
            color: '#3b82f6',
            fontSize: compact ? '0.95rem' : '1.1rem',
            fontWeight: 900,
            lineHeight: 1.2,
          }}
        >
          WELLNESS
          <br />
          <span style={{ fontSize: compact ? '0.75rem' : '0.85rem', color: '#666' }}>
            ESTADO FÍSICO
          </span>
        </div>
        <div style={{ display: 'flex', gap: compact ? '20px' : '32px', textAlign: 'center' }}>
          {[
            { label: 'READINESS', value: `${wellness.avgReadiness}/100` },
            { label: 'RPE', value: `${wellness.avgRPE}/10` },
            { label: 'CARGA', value: wellness.cargaAguda },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '0.78rem', color: '#555', fontWeight: 800 }}>{label}</div>
              <div
                style={{
                  fontSize: compact ? '1.1rem' : '1.45rem',
                  fontWeight: 900,
                  color: '#fff',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null}

    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '8px',
        fontSize: compact ? '0.72rem' : '0.82rem',
        color: '#555',
        letterSpacing: '1px',
      }}
    >
      <span>REPORTE VISUAL</span>
      <span style={{ color: '#888', fontWeight: 700 }}>ANALIZADO POR {labelContexto}</span>
    </div>
  </div>
);

// ─── Botones de formato ────────────────────────────────────────────────────

const btnBase = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.8rem',
  fontWeight: 800,
  cursor: 'pointer',
  transition: '0.15s',
};

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════

const PlayerReportGenerator = ({ jugador, perfil, wellness, contexto }) => {
  const [formato, setFormato] = useState('post');
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const wrapperRef = useRef(null);

  const isStory = formato === 'story';
  const CANVAS_H = isStory ? 1920 : 1350;

  const stats = perfil?.stats ?? {};
  const accionesDirectas = perfil?.accionesDirectas ?? [];
  const dataRemates = Array.isArray(perfil?.dataTortaRemates) ? perfil.dataTortaRemates : [];
  const labelContexto = contexto || 'VIRTUAL FUTSAL';

  const accionesMapa = accionesDirectas
    .map((ev) => ({
      ...ev,
      x: ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x,
      y: ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y,
    }))
    .filter((ev) => ev.x != null && ev.y != null);

  const amarillas = getTarjetasAmarillas(stats);
  const rojas = getTarjetasRojas(stats);

  useEffect(() => {
    const calcular = () => {
      const parent = wrapperRef.current?.parentElement || document.body;
      const anchoDisponible = parent.offsetWidth - 48;
      const altoDisponible = window.innerHeight * 0.82;
      setEscala(Math.min(anchoDisponible / CANVAS_W, altoDisponible / CANVAS_H, 1));
    };

    const t = setTimeout(calcular, 80);
    window.addEventListener('resize', calcular);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', calcular);
    };
  }, [formato, CANVAS_H]);

  const exportarPNG = async () => {
    const el = document.getElementById('player-report-exportable');
    if (!el || exportando) return;
    setExportando(true);

    const prev = {
      transform: el.style.transform,
      origin: el.style.transformOrigin,
      w: el.style.width,
      h: el.style.height,
    };

    el.style.transform = 'none';
    el.style.transformOrigin = 'top left';
    el.style.width = `${CANVAS_W}px`;
    el.style.height = `${CANVAS_H}px`;

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0a0a0a',
        logging: false,
        width: CANVAS_W,
        height: CANVAS_H,
        windowWidth: CANVAS_W,
        windowHeight: CANVAS_H,
      });

      const slug = (s) =>
        (s || '')
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase()
          .substring(0, 20);

      const link = document.createElement('a');
      link.download = `Scouting_${slug(`${jugador?.apellido}_${jugador?.nombre}`)}_${formato}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('❌ Error exportando reporte:', err);
      alert('Hubo un error al generar la imagen. Revisá la consola.');
    } finally {
      el.style.transform = prev.transform;
      el.style.transformOrigin = prev.origin;
      el.style.width = prev.w;
      el.style.height = prev.h;
      setExportando(false);
    }
  };

  if (!jugador || !perfil) return null;

  const canvasWPx = Math.floor(CANVAS_W * escala);
  const canvasHPx = Math.floor(CANVAS_H * escala);

  const POST = {
    pad: { top: 44, right: 44, bottom: 20, left: 44 },
    headerH: 200,
    kpiH: 120,
    statsH: 260,
    footerH: 106,
    gap: 14,
  };

  const STORY = {
    pad: { top: 32, right: 36, bottom: 18, left: 36 },
    headerH: 170,
    kpiH: 108,
    statsH: 240,
    footerH: 100,
    gap: 12,
  };

  const L = isStory ? STORY : POST;
  const innerW = CANVAS_W - L.pad.left - L.pad.right;

  const totalFixed = L.headerH + L.kpiH + L.statsH + L.footerH + L.gap * 5;
  const mapaAvailableH = CANVAS_H - L.pad.top - L.pad.bottom - totalFixed;

  const rematesPanelW = isStory ? innerW : Math.round(innerW * 0.34);
  const mapaPanelW = isStory ? innerW : innerW - rematesPanelW - L.gap;

  return (
    <div
      ref={wrapperRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px',
        gap: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: `${canvasWPx}px`,
          maxWidth: '100%',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              onClick={() => setFormato('post')}
              style={{
                ...btnBase,
                background: formato === 'post' ? '#3b82f6' : '#222',
                color: formato === 'post' ? '#fff' : '#888',
              }}
            >
              POST 4:5
            </button>
            <button
              onClick={() => setFormato('story')}
              style={{
                ...btnBase,
                background: formato === 'story' ? '#a855f7' : '#222',
                color: formato === 'story' ? '#fff' : '#888',
              }}
            >
              STORY 9:16
            </button>
          </div>

          <div style={{ color: '#00e676', fontWeight: 800, fontSize: '0.72rem', letterSpacing: 1 }}>
            PREVIEW — {CANVAS_W}×{CANVAS_H}px · Escala {Math.round(escala * 100)}%
          </div>
        </div>

        <button
          onClick={exportarPNG}
          disabled={exportando}
          style={{
            background: exportando ? '#1a1a1a' : '#00e676',
            color: exportando ? '#555' : '#000',
            fontWeight: 900,
            fontSize: '0.85rem',
            padding: '12px 20px',
            border: 'none',
            borderRadius: '6px',
            cursor: exportando ? 'not-allowed' : 'pointer',
            letterSpacing: 0.5,
          }}
          onMouseOver={(e) => {
            if (!exportando) e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {exportando ? '⏳ Generando PNG...' : '📸 DESCARGAR ALTA CALIDAD'}
        </button>
      </div>

      <div
        style={{
          width: `${canvasWPx}px`,
          height: `${canvasHPx}px`,
          overflow: 'hidden',
          borderRadius: `${Math.round(16 * escala)}px`,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 20px 50px rgba(0,0,0,0.8)',
          flexShrink: 0,
        }}
      >
        <div
          id="player-report-exportable"
          style={{
            transform: `scale(${escala})`,
            transformOrigin: 'top left',
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            background: '#0a0a0a',
            backgroundImage: 'radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0a0a0a 55%)',
            color: '#fff',
            padding: `${L.pad.top}px ${L.pad.right}px ${L.pad.bottom}px ${L.pad.left}px`,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: `${L.gap}px`,
            overflow: 'hidden',
          }}
        >
          <div style={{ height: `${L.headerH}px`, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div
              style={{
                width: isStory ? '130px' : '162px',
                height: isStory ? '130px' : '162px',
                borderRadius: '50%',
                background: '#111',
                border: '4px solid #00e676',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontSize: isStory ? '3rem' : '3.8rem',
                fontWeight: 900,
                color: '#00e676',
                flexShrink: 0,
                boxShadow: '0 0 28px rgba(0,230,118,0.18)',
              }}
            >
              {jugador.foto ? (
                <img
                  src={jugador.foto}
                  alt="Foto"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <>
                  {jugador.apellido?.charAt(0)}
                  {jugador.nombre?.charAt(0)}
                </>
              )}
            </div>

            <div style={{ marginLeft: isStory ? '22px' : '32px', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: isStory ? '0.9rem' : '1.2rem',
                  color: '#555',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '4px',
                  marginBottom: '6px',
                }}
              >
                SCOUTING REPORT • {labelContexto}
              </div>
              <div
                style={{
                  fontSize: isStory ? '3rem' : '4rem',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  textShadow: '2px 2px 0 rgba(0,0,0,0.5)',
                  wordBreak: 'break-word',
                }}
              >
                {jugador.apellido}{' '}
                <span style={{ color: '#00e676' }}>#{jugador.dorsal}</span>
              </div>
              <div
                style={{
                  fontSize: isStory ? '1.7rem' : '2.1rem',
                  color: '#888',
                  fontWeight: 700,
                  margin: '4px 0 10px',
                }}
              >
                {jugador.nombre}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: '#00e676',
                    color: '#000',
                    padding: '6px 18px',
                    borderRadius: '50px',
                    fontSize: isStory ? '0.88rem' : '1.05rem',
                    fontWeight: 900,
                  }}
                >
                  {perfil.rol}
                </span>
                <span
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    padding: '6px 18px',
                    borderRadius: '50px',
                    fontSize: isStory ? '0.88rem' : '1.05rem',
                    fontWeight: 700,
                  }}
                >
                  {jugador.categoria}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              height: `${L.kpiH}px`,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: `${L.gap}px`,
              flexShrink: 0,
            }}
          >
            <KpiCard label="MINUTOS" value={`${perfil.minutos ?? 0}'`} compact={isStory} />
            <KpiCard
              label="RATING"
              value={`${(perfil.impacto || 0) > 0 ? '+' : ''}${Number(perfil.impacto || 0).toFixed(1)}`}
              color={(perfil.impacto || 0) > 0 ? '#00e676' : '#ef4444'}
              compact={isStory}
            />
            <KpiCard
              label="xG BUILDUP"
              value={Number(perfil.xgBuildup || 0).toFixed(2)}
              color="#c084fc"
              compact={isStory}
            />
            <KpiCard
              label="PLUS / MINUS"
              value={`${(perfil.plusMinus || 0) > 0 ? '+' : ''}${perfil.plusMinus || 0}`}
              compact={isStory}
            />
          </div>

          <div style={{ height: `${L.statsH}px`, flexShrink: 0 }}>
            <SeccionStats stats={stats} perfil={perfil} compact={isStory} />
          </div>

          {isStory ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: `${L.gap}px`,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '18px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '14px 16px',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '1rem', fontWeight: 900, color: '#fff' }}>
                    DESTINO DE REMATES
                  </span>
                  <span style={{ fontSize: '0.82rem', color: '#555', fontWeight: 700 }}>
                    Total: <strong style={{ color: '#aaa' }}>{stats.remates ?? 0}</strong>
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px 18px',
                  }}
                >
                  {dataRemates.length > 0 ? (
                    dataRemates.map((item, idx) => {
                      const totalRemates = stats.remates ?? 0;
                      const pct = totalRemates > 0 ? Math.round((item.value / totalRemates) * 100) : 0;

                      return (
                        <div key={idx}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              marginBottom: '3px',
                              gap: '8px',
                            }}
                          >
                            <span style={{ color: COLORS_REMATES[item.name] || '#fff' }}>
                              {item.name}
                            </span>
                            <span style={{ color: '#aaa' }}>
                              {item.value}{' '}
                              <span style={{ color: '#444' }}>({pct}%)</span>
                            </span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: '7px',
                              background: 'rgba(255,255,255,0.08)',
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: COLORS_REMATES[item.name] || '#fff',
                                borderRadius: '4px',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div
                      style={{
                        color: '#444',
                        fontSize: '0.9rem',
                        gridColumn: '1/-1',
                        textAlign: 'center',
                        fontWeight: 700,
                      }}
                    >
                      Sin remates
                    </div>
                  )}
                </div>

                <SeccionTarjetas
                  amarillas={amarillas}
                  rojas={rojas}
                  compact
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    color: '#fff',
                    marginBottom: '8px',
                    flexShrink: 0,
                  }}
                >
                  MAPA DE INFLUENCIAS
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: '#444',
                      fontWeight: 600,
                      marginLeft: '10px',
                    }}
                  >
                    {accionesMapa.length} acciones registradas
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <CanchaFutsal accionesMapa={accionesMapa} dotSize={18} />
                </div>
                <LeyendaMapa compact />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', gap: `${L.gap}px`, minHeight: 0 }}>
              <div style={{ flex: 1.9, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 900,
                    color: '#fff',
                    marginBottom: '8px',
                    flexShrink: 0,
                  }}
                >
                  MAPA DE INFLUENCIAS
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: '#444',
                      fontWeight: 600,
                      marginLeft: '10px',
                    }}
                  >
                    {accionesMapa.length} acciones
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <CanchaFutsal accionesMapa={accionesMapa} dotSize={18} />
                </div>
                <LeyendaMapa />
              </div>

              <div
                style={{
                  width: `${rematesPanelW}px`,
                  flexShrink: 0,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '20px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fff', marginBottom: '4px' }}>
                  DESTINO DE REMATES
                </div>
                <div style={{ fontSize: '0.92rem', color: '#555', marginBottom: '10px', fontWeight: 700 }}>
                  Total: <strong style={{ color: '#aaa' }}>{stats.remates ?? 0}</strong>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <SeccionRemates
                    dataRemates={dataRemates}
                    totalRemates={stats.remates ?? 0}
                    compact
                  />
                  <SeccionTarjetas
                    amarillas={amarillas}
                    rojas={rojas}
                    compact
                  />
                </div>
              </div>
            </div>
          )}

          <Footer wellness={wellness} labelContexto={labelContexto} compact={isStory} />
        </div>
      </div>
    </div>
  );
};

export default PlayerReportGenerator;