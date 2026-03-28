import React from 'react';
import { useNavigate } from 'react-router-dom';

// ==========================================
// ESTILOS REUTILIZABLES (Para mantener consistencia)
// ==========================================
const COLORS = {
  bg: '#000',
  bgCard: '#111',
  text: '#fff',
  textDim: '#aaa',
  accent: '#00ff88', // Tu verde flúor
  border: '#222',
  cardHover: '#1a1a1a'
};

const sectionStyle = {
  padding: '80px 20px',
  maxWidth: '1200px',
  margin: '0 auto',
  borderBottom: `1px solid ${COLORS.border}`
};

const titleStyle = {
  fontSize: '2.8rem',
  fontWeight: 900,
  textAlign: 'center',
  marginBottom: '20px',
  lineHeight: 1.1
};

const subtitleStyle = {
  fontSize: '1.2rem',
  color: COLORS.textDim,
  textAlign: 'center',
  marginBottom: '60px',
  maxWidth: '700px',
  marginRight: 'auto',
  marginLeft: 'auto',
  lineHeight: 1.6
};

// Componente Placeholder para Imágenes/Videos
const PlaceholderMedia = ({ text = 'MEDIA PLACEHOLDER', aspectRatio = '16/9', height }) => (
  <div style={{
    width: '100%',
    height: height || 'auto',
    aspectRatio: height ? 'auto' : aspectRatio,
    background: '#222',
    border: `2px dashed #444`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
    fontWeight: 700,
    fontSize: '0.8rem',
    borderRadius: '8px',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  }}>
    [ {text} - SCREENSHOT ]
  </div>
);

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: 'sans-serif' }}>
      <style>{`
        button { transition: 0.2s; }
        .feature-card:hover { transform: translateY(-5px); background-color: ${COLORS.cardHover} !important; border-color: ${COLORS.accent} !important; }
        .plan-card:hover { border-color: ${COLORS.accent} !important; transform: scale(1.02); }
      `}</style>

      {/* 1. NAVBAR */}
      <nav style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '15px 40px', borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky', top: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img 
            src="/favicon-32x32.png" 
            alt="logo" 
            style={{ width: '30px', height: '30px', objectFit: 'contain' }}
          />
          <div style={{ fontSize: '1.3rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>
            VIRTUAL<span style={{color: COLORS.accent}}>CLUB</span><span style={{fontWeight: 300, fontSize: '0.9rem'}}></span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button 
            onClick={() => navigate('/kiosco')}
            style={{ 
              padding: '8px 20px', background: 'rgba(255,255,255,0.05)', color: '#fff', 
              border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem'
            }}
            onMouseOver={(e) => { e.target.style.borderColor = COLORS.textDim; e.target.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseOut={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
          >
            📱 INGRESO JUGADORES
          </button>

          <button 
            onClick={() => navigate('/login')}
            style={{ 
              padding: '8px 20px', background: 'transparent', color: '#fff', 
              border: '1px solid var(--border)', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem'
            }}
            onMouseOver={(e) => { e.target.style.borderColor = COLORS.accent; e.target.style.color = COLORS.accent; }}
            onMouseOut={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = '#fff'; }}
          >
            INICIAR SESIÓN
          </button>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <header style={{ ...sectionStyle, textAlign: 'center', padding: '120px 20px' }}>
        <h1 style={{ fontSize: '4.5rem', fontWeight: 900, marginBottom: '25px', lineHeight: 1.0, letterSpacing: '-2px' }}>
          Analizá. Medí.<span style={{ color: COLORS.accent }}> Ganá</span>.
        </h1>
        <p style={{ ...subtitleStyle, fontSize: '1.4rem' }}>
          La plataforma integral de analítica avanzada y videotracking diseñada exclusivamente para el Futsal moderno. Dejá de intuir y empezá a decidir basándote en datos estructurales de rendimiento.
        </p>
        
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '80px' }}>
          <button 
            onClick={() => navigate('/registro?plan=trial')}
            style={{ padding: '18px 35px', background: COLORS.accent, color: '#000', border: 'none', borderRadius: '4px', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', boxShadow: `0 0 20px ${COLORS.accent}33` }}
          >
            SOLICITAR DEMO GRATIS
          </button>
        </div>

        <div style={{maxWidth: '1000px', margin: '0 auto', boxShadow: '0 20px 50px rgba(0,255,136,0.1)'}}>
          <PlaceholderMedia text="VIDEO DEMOSTRACIÓN DE LA INTERFAZ TRABAJANDO CON YOUTUBE" aspectRatio="16/9" />
        </div>
      </header>

      {/* 3. EL PROBLEMA/SOLUCIÓN */}
      <section style={{ ...sectionStyle, background: COLORS.bgCard }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '50px', alignItems: 'center' }}>
          <div>
            <h2 style={{ ...titleStyle, textAlign: 'left', fontSize: '2.5rem' }}>El Futsal ya no es solo intuición.</h2>
            <p style={{ color: COLORS.textDim, lineHeight: 1.8, marginBottom: '20px' }}>
              En el deporte de élite, cada detalle cuenta. Las herramientas genéricas de análisis no entienden la dinámica del Futsal: las rotaciones constantes, el impacto real de los quintetos o la espacialidad de las recuperaciones.
            </p>
            <p style={{ color: COLORS.textDim, lineHeight: 1.8 }}>
              VIRTUAL.CLUB nace para cerrar la brecha entre el video y la decisión táctica, centralizando tus datos y todo el desarrollo de tu club en un solo ecosistema.
            </p>
          </div>
          <PlaceholderMedia text="GRÁFICO COMPARATIVO: INTUICIÓN VS DATOS ESTRUCTURALES" height="300px" />
        </div>
      </section>

      {/* 4. MÓDULOS TÉCNICOS */}
      <section style={sectionStyle}>
        <h2 style={titleStyle}>Módulos de Éxito Deportivo</h2>
        <p style={subtitleStyle}>Herramientas de nivel profesional integradas en un flujo de trabajo optimizado para el staff técnico.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
          <div className="feature-card" style={featureCardStyle}>
            <div style={iconStyle}>🎬</div>
            <h3 style={featureTitleStyle}>Videotracking Interactivo</h3>
            <p style={featureDescStyle}>Sincronizá tus eventos trackeados directamente con videos de YouTube. Repasá cada jugada, remate o pérdida al instante sin editar video.</p>
            <PlaceholderMedia text="SCREENSHOT: LÍNEA DE TIEMPO + VIDEO YOUTUBE" aspectRatio="16/10" />
          </div>

          <div className="feature-card" style={featureCardStyle}>
            <div style={iconStyle}>🔄</div>
            <h3 style={featureTitleStyle}>Ratings de Quintetos</h3>
            <p style={featureDescStyle}>Nuestro algoritmo exclusivo mide el impacto sostenido de cada combinación de 5 jugadores, ajustado por volumen y eficiencia real.</p>
            <PlaceholderMedia text="SCREENSHOT: TABLA DE QUINTETOS CON RATING PRO" aspectRatio="16/10" />
          </div>

          <div className="feature-card" style={featureCardStyle}>
            <div style={iconStyle}>🗺️</div>
            <h3 style={featureTitleStyle}>Mapeo Táctico Espacial</h3>
            <p style={featureDescStyle}>Visualizá mapas de calor, origen de goles y flujo de transiciones. Entendé el dónde y el por qué de lo que pasa en cancha.</p>
            <PlaceholderMedia text="SCREENSHOT: MAPA DE CALOR + TRANSICIONES" aspectRatio="16/10" />
          </div>
        </div>
      </section>

      {/* 5. GESTIÓN INTEGRAL */}
      <section style={{ ...sectionStyle, background: COLORS.bgCard }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px', alignItems: 'center' }}>
          <PlaceholderMedia text="SCREENSHOT: DASHBOARD INICIAL DEL CLUB / PANEL WELLNESS" height="400px" />
          <div>
            <h2 style={{ ...titleStyle, textAlign: 'left', fontSize: '2.5rem' }}>Centralizá la inteligencia de tu Club.</h2>
            <ul style={{ listStyle: 'none', padding: 0, color: COLORS.textDim, lineHeight: 2.5, fontSize: '1.1rem' }}>
              <li>✅ <strong style={{color: COLORS.text}}>Base de Datos Única:</strong> Historial de partidos, jugadores y eventos centralizados.</li>
              <li>✅ <strong style={{color: COLORS.text}}>Eficiencia del Staff:</strong> Reducí tiempos de análisis y reportes en un 60%.</li>
              <li>✅ <strong style={{color: COLORS.text}}>Contexto Wellness:</strong> Integrá cargas RPE y sueño al análisis técnico.</li>
              <li>✅ <strong style={{color: COLORS.text}}>Exportación Pro:</strong> Generá reportes PDF listos para imprimir o compartir.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6. PLANES Y PRECIOS */}
      <section style={sectionStyle}>
        <h2 style={titleStyle}>Planes diseñados para cada nivel</h2>
        <p style={subtitleStyle}>Desde cuerpos técnicos individuales hasta estructuras completas de clubes.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', alignItems: 'start' }}>
          
          <div className="plan-card" style={planCardStyle}>
            <div style={planBadgeStyle}>INDIVIDUAL</div>
            <h3 style={planTitleStyle}>Entrenador PRO</h3>
            <div style={planPriceStyle}>$20.000 <span style={{fontSize: '1rem', color: COLORS.textDim}}>/ mes</span></div>
            <ul style={planListStyle}>
              <li>1 Usuario Técnico</li>
              <li>Trackeo de Partidos Ilimitado</li>
              <li>Mapeo Táctico Base</li>
              <li>Gestión de Equipo Basica</li>
              <li>Soporte vía Email</li>
            </ul>
            <button onClick={() => navigate('/registro?plan=trial')} style={planButtonStyle}>EMPEZAR GRATIS</button>
          </div>

          <div className="plan-card" style={{ ...planCardStyle, borderColor: COLORS.accent, background: '#1a1a1a', boxShadow: `0 10px 30px ${COLORS.accent}15` }}>
            <div style={{ ...planBadgeStyle, background: COLORS.accent, color: '#000' }}>.    .    .  .  RECOMENDADO</div>
            <h3 style={planTitleStyle}>Cuerpo Técnico PRO</h3>
            <div style={planPriceStyle}>$30.000 <span style={{fontSize: '1rem', color: COLORS.textDim}}>/ mes</span></div>
            <ul style={planListStyle}>
              <li>Hasta 5 Usuarios Técnicos</li>
              <li><strong style={{color: COLORS.text}}>Rating Avanzado de Quintetos</strong></li>
              <li><strong style={{color: COLORS.text}}>Videotracking Interactivo YouTube</strong></li>
              <li>Wellness Completo + Control Presentismo</li>
              <li>Creador Táctico y Libro Táctico</li>
              <li>Reportes PDF Personalizados</li>
            </ul>
            <button onClick={() => navigate('/registro?plan=pro')} style={{ ...planButtonStyle, background: COLORS.accent, color: '#000' }}>SUSCRIBIRSE</button>
          </div>

          <div className="plan-card" style={planCardStyle}>
            <div style={planBadgeStyle}>.          .        .            .         INSTITUCIONAL</div>
            <h3 style={planTitleStyle}>Gestión de Club</h3>
            <div style={planPriceStyle}>Consultar</div>
            <ul style={planListStyle}>
              <li>Usuarios Ilimitados</li>
              <li>Todas las características PRO</li>
              <li>Acceso Rápido a Jugadores</li>
              <li>Admin, RRHH, Gestor de Cuotas y Tesorería</li>
              <li>Soporte 24/7 y Capacitación</li>
            </ul>
            <button onClick={() => window.location.href = 'mailto:virtualfutsal@gmail.com'} style={planButtonStyle}>CONTACTAR VENTAS</button>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer style={{ padding: '50px 20px', textAlign: 'center', color: '#444', fontSize: '0.8rem', borderTop: `1px solid ${COLORS.border}` }}>
        <p>VIRTUAL.CLUB © 2026 - Propiedad de VirtualFutsal - Todos los derechos reservados.</p>
        <p style={{marginTop: '10px'}}>Software diseñado en Argentina para el Futsal del mundo.</p>
      </footer>

    </div>
  );
}

const featureCardStyle = { background: COLORS.bgCard, padding: '30px', borderRadius: '8px', border: `1px solid ${COLORS.border}`, transition: '0.3s' };
const iconStyle = { fontSize: '2.5rem', marginBottom: '20px', color: COLORS.accent };
const featureTitleStyle = { fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px' };
const featureDescStyle = { color: COLORS.textDim, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '25px', height: '70px' };
const planCardStyle = { background: COLORS.bgCard, padding: '40px', borderRadius: '8px', border: `1px solid ${COLORS.border}`, textAlign: 'center', transition: '0.3s', position: 'relative', overflow: 'hidden' };
const planBadgeStyle = { position: 'absolute', top: '15px', right: '-30px', background: '#333', color: '#fff', padding: '5px 30px', fontSize: '0.65rem', fontWeight: 700, transform: 'rotate(45deg)', textTransform: 'uppercase', letterSpacing: '1px' };
const planTitleStyle = { fontSize: '1.5rem', fontWeight: 800, marginBottom: '10px' };
const planPriceStyle = { fontSize: '2.5rem', fontWeight: 900, color: COLORS.accent, marginBottom: '30px' };
const planListStyle = { listStyle: 'none', padding: 0, margin: '0 0 40px 0', color: COLORS.textDim, fontSize: '0.9rem', lineHeight: 2.2, textAlign: 'left' };
const planButtonStyle = { width: '100%', padding: '12px', background: 'transparent', color: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: '4px', fontWeight: 700, cursor: 'pointer' };

export default Landing;