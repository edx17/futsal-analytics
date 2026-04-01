import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ==========================================
// CONFIGURACIÓN VISUAL
// ==========================================
const COLORS = {
  bg: '#050505', 
  bgDeep: '#000000',
  bgCard: '#111111',
  text: '#ffffff',
  textDim: '#aaaaaa',
  accent: '#00ff88', 
  accentHover: '#00cc6e',
  border: '#222222',
  overlay: 'rgba(0, 0, 0, 0.6)' 
};

// CSS Global
const GlobalStyles = () => (
  <style>{`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      background-color: ${COLORS.bg};
      background-image: radial-gradient(circle at center, #111 0%, #000 100%);
      color: ${COLORS.text};
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    
    @keyframes floatStats {
      0% { transform: translateY(0px); opacity: 0.7; }
      50% { transform: translateY(-10px); opacity: 1; }
      100% { transform: translateY(0px); opacity: 0.7; }
    }

    .feature-card { transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1); cursor: pointer; }
    .feature-card:hover { 
      transform: translateY(-8px) scale(1.02); 
      border-color: ${COLORS.accent} !important; 
      box-shadow: 0 10px 30px rgba(0,255,136,0.1);
    }
    
    button { transition: all 0.2s ease; font-family: inherit; }
    button:hover { transform: translateY(-2px); }
    button:active { transform: translateY(1px); }

    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #000; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #444; }
  `}</style>
);

// COMPONENTE PARA RELLENAR LOS "HUECOS" HASTA QUE TENGAS LAS FOTOS
const PlaceholderBlock = ({ text, height = '200px', width = '100%', style }) => (
  <div style={{
    width, height, background: '#1a1a1a', border: '1px dashed #333',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#666', fontSize: '0.8rem', fontWeight: 'bold', borderRadius: '8px',
    textAlign: 'center', padding: '10px', textTransform: 'uppercase', ...style
  }}>
    [ {text} ]
  </div>
);

// ==========================================
// COMPONENTES AUXILIARES
// ==========================================
const Section = ({ children, style, id, darkBg = false }) => (
  <section id={id} style={{
    padding: '100px 20px',
    borderBottom: `1px solid ${COLORS.border}`,
    position: 'relative',
    background: darkBg ? COLORS.bgDeep : 'transparent',
    ...style
  }}>
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {children}
    </div>
  </section>
);

const Title = ({ children, style }) => (
  <h2 style={{
    fontSize: '3.5rem',
    fontWeight: 900,
    textAlign: 'center',
    marginBottom: '20px',
    lineHeight: 1.05,
    letterSpacing: '-2px',
    ...style
  }}>{children}</h2>
);

const Subtitle = ({ children, style }) => (
  <p style={{
    fontSize: '1.25rem',
    color: COLORS.textDim,
    textAlign: 'center',
    marginBottom: '80px',
    maxWidth: '750px',
    marginRight: 'auto',
    marginLeft: 'auto',
    lineHeight: 1.6,
    ...style
  }}>{children}</p>
);

const MainButton = ({ children, onClick, style, primary = true }) => (
  <button 
    onClick={onClick}
    style={{
      padding: '16px 32px',
      background: primary ? COLORS.accent : 'rgba(255,255,255,0.05)',
      color: primary ? '#000' : '#fff',
      border: primary ? 'none' : `1px solid ${COLORS.border}`,
      borderRadius: '6px',
      fontWeight: 800,
      fontSize: '1rem',
      cursor: 'pointer',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      boxShadow: primary ? `0 4px 15px ${COLORS.accent}33` : 'none',
      ...style
    }}
  >
    {children}
  </button>
);

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Estructura de landing cargada.");
  }, []);

  return (
    <>
      <GlobalStyles />
      
      {/* NAVBAR */}
      <nav style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '15px 40px', borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky', top: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(15px)', zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/')}>
          <img src="/favicon-32x32.png" alt="logo" style={{ width: '35px', height: '35px', objectFit: 'contain' }} />
          <div style={{ fontSize: '1.4rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>
            VIRTUAL<span style={{color: COLORS.accent}}>CLUB</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button onClick={() => navigate('/kiosco')} style={secondaryNavLinkStyle}>📱 INGRESO JUGADORES</button>
          <MainButton onClick={() => navigate('/login')} style={{padding: '10px 20px', fontSize: '0.85rem'}}>INICIAR SESIÓN</MainButton>
        </div>
      </nav>

      {/* HERO */}
      <header style={heroContainerStyle}>
        <video 
          autoPlay 
          loop 
          muted 
          playsInline 
          style={heroVideoStyle}
          poster="/assets/hero-poster.jpg" 
        >
          <source src="/assets/hero-cinematic.mp4" type="video/mp4" />
        </video>
        
        <div style={heroOverlayStyle} />

        <div style={heroContentStyle}>
          <div style={badgeStyle}>ANALÍTICA DE ÉLITE PARA FUTSAL</div>
          <h1 style={heroTitleStyle}>
            Dejá de intuir.<br />Empezá a <span style={{ color: COLORS.accent }}>Ganá</span>r.
          </h1>
          <p style={heroSubtitleStyle}>
            Plataforma integral de videotracking y datos estructurados. Medí el impacto real de cada jugada y quinteto en tiempo real.
          </p>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <MainButton onClick={() => navigate('/registro?plan=trial')}>SOLICITAR DEMO GRATIS</MainButton>
            <MainButton onClick={() => window.location.href='#demo'} primary={false}>VER CÓMO FUNCIONA ⬇</MainButton>
          </div>
        </div>

        <div style={heroStatsOverlayStyle}>
          <div style={{...floatingStatStyle, animationDelay: '0s', top: '20%', left: '10%'}}>
            <span style={{color: COLORS.accent}}>LIVE &gt;</span> Presión Alta Efectiva: 82%
          </div>
          <div style={{...floatingStatStyle, animationDelay: '1s', top: '60%', right: '15%'}}>
            <span style={{color: COLORS.accent}}>LIVE &gt;</span> xG Acumulado: 2.15
          </div>
          <div style={{...floatingStatStyle, animationDelay: '2s', bottom: '15%', left: '25%'}}>
            <span style={{color: COLORS.accent}}>LIVE &gt;</span> Eficiencia Quinteto #3: +1.8
          </div>
        </div>
      </header>

      {/* QUÉ ES */}
      <Section id="que-es" darkBg={true}>
        <div style={splitLayoutStyle}>
          <div style={mockupContainerStyle}>
            {/* Como no tenés "app-mockup-base.png", usamos un placeholder temporal */}
            <PlaceholderBlock text="IMAGEN MOCKUP APP CELULAR" height="500px" />
          </div>
          
          <div style={textBlockStyle}>
            {/* FIX: Se cambia <badge> por <span> */}
            <span style={{color: COLORS.accent, fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', display: 'block'}}>Inteligencia Deportiva</span>
            <h2 style={{...titleStyle, textAlign: 'left', fontSize: '2.8rem', marginTop: '10px'}}>Mucho más que una planilla glorificada.</h2>
            <p style={descriptionStyle}>
              Virtual Club transforma el video crudo en decisiones tácticas. Centraliza gestión, wellness y análisis avanzado en un flujo dinámico diseñado para el futsal moderno.
            </p>
            <div style={microVideoContainerStyle}>
              <video autoPlay loop muted playsInline style={microVideoStyle}>
                <source src="/assets/micro-carga-evento.mp4" type="video/mp4" />
              </video>
              <span style={{fontSize: '0.8rem', color: COLORS.textDim}}>Carga de evento en 2 segundos y sincronización directa.</span>
            </div>
          </div>
        </div>
      </Section>

      {/* DEMOSTRACIÓN REAL */}
      <Section id="demo">
        <Title>Del 40x20 al Dashboard en Clics</Title>
        <Subtitle>Mirá cómo se ve el flujo de trabajo real. Sin vueltas, directo al dato.</Subtitle>
        
        <div style={demoFlowContainerStyle}>
          <div style={verticalVideoWrapperStyle}>
            <video autoPlay loop muted playsInline style={verticalVideoStyle}>
              <source src="/assets/demo-carga-en-cancha.mp4" type="video/mp4" />
            </video>
            <div style={videoLabelStyle}>PASO 1: Carga en vivo (Cancha)</div>
          </div>

          <div style={flowArrowStyle}>➡</div>

          <div style={dashboardResultWrapperStyle}>
            <img src="/assets/dashboard-generated.jpg" alt="Dashboard Generado" style={dashboardImgStyle} />
            <div style={videoLabelStyle}>PASO 2: Análisis Instantáneo</div>
          </div>
        </div>
      </Section>

      {/* FEATURES */}
      <Section id="features" darkBg={true}>
        {/* FIX: Se cambia <badge> por <span> */}
        <span style={centralBadgeStyle}>Poder Táctico</span>
        <Title>Herramientas de Nivel Profesional</Title>
        <Subtitle>Diseñadas por y para cuerpos técnicos de futsal.</Subtitle>

        <div style={featuresGridStyle}>
          <div className="feature-card" style={featureCardStyle}>
            <div style={iconStyle}>🎬</div>
            <h3 style={featureTitleStyle}>Videotracking Interactivo</h3>
            <p style={featureDescStyle}>Vinculá eventos con YouTube. Repasá clips al instante.</p>
            <PlaceholderBlock text="IMAGEN PREVIEW VIDEO" height="150px" style={{marginTop: 'auto'}} />
          </div>

          <div className="feature-card" style={featureCardStyle}>
            <div style={iconStyle}>🔄</div>
            <h3 style={featureTitleStyle}>Rating de Quintetos PRO</h3>
            <p style={featureDescStyle}>Algoritmo exclusivo de eficiencia ajustada por volumen.</p>
            <PlaceholderBlock text="IMAGEN TABLA QUINTETOS" height="150px" style={{marginTop: 'auto'}} />
          </div>

          <div className="feature-card" style={featureCardStyle}>
            <div style={iconStyle}>📋</div>
            <h3 style={featureTitleStyle}>Libro Táctico Digital</h3>
            <p style={featureDescStyle}>Diseñá y centralizá ABP, rotaciones y presiones.</p>
            <PlaceholderBlock text="IMAGEN LIBRO TÁCTICO" height="150px" style={{marginTop: 'auto'}} />
          </div>
        </div>
      </Section>

      {/* DATA VISUAL */}
      <Section id="data">
        <Title>Tu fuerte son los datos.<br />Mostralos.</Title>
        <Subtitle>Gráficos reales, heatmaps dinámicos y redes de pases. Nada de fakes.</Subtitle>
        
        <div style={dataGridStyle}>
          <div style={dataVisualizationWrapperStyle}>
            <PlaceholderBlock text="GRÁFICO HEATMAP REAL" height="250px" />
            <span style={dataLabelStyle}>Mapas de Calor y Espacialidad</span>
          </div>
          <div style={dataVisualizationWrapperStyle}>
            <PlaceholderBlock text="GRÁFICO RED DE PASES" height="250px" />
            <span style={dataLabelStyle}>Redes de Pases y Flujo Táctico</span>
          </div>
        </div>
        
        <div style={{...dataVisualizationWrapperStyle, marginTop: '40px'}}>
          <PlaceholderBlock text="GRÁFICO BARRAS xG / ESTADÍSTICAS" height="300px" />
          <span style={dataLabelStyle}>Evolución de Rendimiento Clave (xG, Eficiencia, Pérdidas)</span>
        </div>
      </Section>

      {/* VALIDACIÓN */}
      <Section id="validacion" darkBg={true}>
        <Title>Hablamos el mismo idioma</Title>
        <Subtitle>Entrenadores y jugadores que ya elevaron su juego con Virtual Club.</Subtitle>
        
        <div style={testimoniosGridStyle}>
          {/* El array map genera 3 videos. Como en tu carpeta solo tenés "testimonio-clip-1.mp4",
              pongo los 3 apuntando al mismo archivo temporalmente para que veas el diseño armado */}
          {[1, 2, 3].map((i) => (
            <div key={i} style={testimonioCardStyle}>
              <video autoPlay loop muted playsInline style={testimonioVideoStyle}>
                <source src="/assets/testimonio-clip-1.mp4" type="video/mp4" />
              </video>
              <div style={testimonioOverlayStyle}>
                <div style={{fontWeight: 800}}>Profe Carlos</div>
                <div style={{fontSize: '0.8rem', color: COLORS.accent}}>DT Primera División</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA INTERMEDIO */}
      <Section id="cta-final" style={{borderBottom: 'none'}}>
        <div style={ctaCardStyle}>
          <div style={ctaContentStyle}>
            <h2 style={{fontSize: '2.5rem', fontWeight: 900, marginBottom: '20px'}}>¿Listo para dominar el 40x20?</h2>
            <p style={{marginBottom: '40px', color: COLORS.text, opacity: 0.9, maxWidth: '600px', margin: '0 auto 40px auto'}}>
              Unite a los clubes que ya usan datos para ganar partidos. Tu próximo rival ya podría estar usándolo.
            </p>
            <MainButton onClick={() => navigate('/registro')} style={{fontSize: '1.1rem', padding: '20px 40px'}}>EMPEZAR MI PRUEBA GRATIS</MainButton>
          </div>
        </div>
      </Section>

      {/* FOOTER */}
      <footer style={footerStyle}>
        <video autoPlay loop muted playsInline style={footerVideoStyle}>
          <source src="/assets/footer-highlights.mp4" type="video/mp4" />
        </video>
        <div style={footerOverlayStyle} />
        
        <div style={footerContentStyle}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>
            VIRTUAL<span style={{color: COLORS.accent}}>CLUB</span>
          </div>
          <p style={{color: '#888', maxWidth: '500px', margin: '0 auto'}}>La ventaja injusta que estabas buscando para tu staff técnico.</p>
          <div style={{marginTop: '40px', display: 'flex', gap: '20px', justifyContent: 'center', color: '#444'}}>
            <span>Soporte</span> | <span>Precios</span> | <span>Contacto</span>
          </div>
          <p style={{ marginTop: '50px', fontSize: '0.8rem', color: '#333' }}>© 2026 VirtualFutsal. Software diseñado para la victoria.</p>
        </div>
      </footer>
    </>
  );
}

// ==========================================
// ESTILOS EN JS
// ==========================================

const titleStyle = { 
  fontSize: '3.5rem', 
  fontWeight: 900, 
  textAlign: 'center', 
  marginBottom: '20px', 
  lineHeight: 1.05, 
  letterSpacing: '-2px' 
};

const secondaryNavLinkStyle = { padding: '8px 20px', background: 'transparent', color: COLORS.textDim, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' };

// FIX DE Z-INDEX: Contenedor en position relative con z-index base
const heroContainerStyle = { height: '90vh', width: '100%', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: COLORS.text, zIndex: 1 };
// Video en la capa inferior del contenedor (-1)
const heroVideoStyle = { position: 'absolute', top: '50%', left: '50%', minWidth: '100%', minHeight: '100%', width: 'auto', height: 'auto', zIndex: -1, transform: 'translateX(-50%) translateY(-50%)', objectFit: 'cover' };
// Oscurecimiento arriba del video (0)
const heroOverlayStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: `linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, ${COLORS.overlay} 50%, rgba(0,0,0,0.9) 100%)`, zIndex: 0 };
// Textos y botones arriba de todo (10)
const heroContentStyle = { position: 'relative', zIndex: 10, maxWidth: '850px', padding: '0 20px' };

const badgeStyle = { display: 'inline-block', padding: '6px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.accent}44`, color: COLORS.accent, borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '2px', marginBottom: '20px', textTransform: 'uppercase' };
const heroTitleStyle = { fontSize: '5rem', fontWeight: 900, marginBottom: '25px', lineHeight: 1.0, letterSpacing: '-3px' };
const heroSubtitleStyle = { fontSize: '1.4rem', color: COLORS.text, opacity: 0.8, marginBottom: '50px', lineHeight: 1.6, maxWidth: '650px', margin: '0 auto 50px auto' };
const heroStatsOverlayStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' };
const floatingStatStyle = { position: 'absolute', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', padding: '10px 18px', borderRadius: '8px', border: '1px solid #333', fontSize: '0.85rem', fontWeight: 'bold', color: '#fff', animation: 'floatStats 4s infinite ease-in-out' };

const splitLayoutStyle = { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '80px', alignItems: 'center' };
const mockupContainerStyle = { position: 'relative', width: '100%' };
const textBlockStyle = { textAlign: 'left' };
const descriptionStyle = { color: COLORS.textDim, lineHeight: 1.8, fontSize: '1.1rem', marginBottom: '30px' };
const microVideoContainerStyle = { background: '#080808', border: '1px solid #222', borderRadius: '8px', padding: '15px', display: 'flex', alignItems: 'center', gap: '15px' };
const microVideoStyle = { width: '80px', height: '50px', objectFit: 'cover', borderRadius: '4px' };

const demoFlowContainerStyle = { display: 'flex', alignItems: 'center', gap: '30px', justifyContent: 'center', marginTop: '60px', flexWrap: 'wrap' };
const verticalVideoWrapperStyle = { width: '220px', aspectRatio: '9/16', background: '#111', borderRadius: '12px', border: `2px solid #333`, overflow: 'hidden', position: 'relative', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' };
const verticalVideoStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const videoLabelStyle = { position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', padding: '20px 10px 10px 10px', fontSize: '0.8rem', fontWeight: 700, color: COLORS.accent, textAlign: 'center' };
const flowArrowStyle = { fontSize: '3rem', color: '#333', fontWeight: 900 };
const dashboardResultWrapperStyle = { flex: 1, maxWidth: '600px', aspectRatio: '16/10', background: '#111', borderRadius: '12px', border: `2px solid ${COLORS.border}`, overflow: 'hidden', position: 'relative', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' };
const dashboardImgStyle = { width: '100%', height: '100%', objectFit: 'cover' };

const centralBadgeStyle = { display: 'block', textAlign: 'center', color: COLORS.accent, fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '10px' };
const featuresGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' };
const featureCardStyle = { background: COLORS.bgCard, padding: '30px', borderRadius: '8px', border: `1px solid ${COLORS.border}`, position: 'relative', overflow: 'hidden', height: '350px', display: 'flex', flexDirection: 'column' };
const iconStyle = { fontSize: '2.5rem', marginBottom: '20px', color: COLORS.accent };
const featureCardTitleStyle = { fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px' };
const featureCardDescStyle = { color: COLORS.textDim, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '25px' };
const featureTitleStyle = { fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px' };
const featureDescStyle = { color: COLORS.textDim, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '15px' };

const dataGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', flexWrap: 'wrap' };
const dataVisualizationWrapperStyle = { background: '#080808', border: `1px solid ${COLORS.border}`, borderRadius: '12px', padding: '15px', position: 'relative', overflow: 'hidden' };
const dataLabelStyle = { display: 'block', marginTop: '15px', fontSize: '0.9rem', color: COLORS.textDim, fontWeight: 600, textAlign: 'center' };

const testimoniosGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' };
const testimonioCardStyle = { width: '100%', aspectRatio: '9/16', borderRadius: '12px', border: `2px solid ${COLORS.border}`, overflow: 'hidden', position: 'relative' };
const testimonioVideoStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const testimonioOverlayStyle = { position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', padding: '30px 15px 15px 15px' };

const ctaCardStyle = { background: '#111', borderRadius: '12px', border: `1px solid ${COLORS.accent}66`, padding: '80px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden', boxShadow: `0 10px 40px ${COLORS.accent}11` };
const ctaContentStyle = { position: 'relative', zIndex: 2 };

const footerStyle = { padding: '100px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden', borderTop: `1px solid ${COLORS.border}` };
// Z-index de footer igual que el hero
const footerVideoStyle = { position: 'absolute', top: '50%', left: '50%', minWidth: '100%', minHeight: '100%', width: 'auto', height: 'auto', zIndex: -1, transform: 'translateX(-50%) translateY(-50%)', objectFit: 'cover', opacity: 0.3 };
const footerOverlayStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: `linear-gradient(to bottom, #000 0%, ${COLORS.overlay} 50%, #000 100%)`, zIndex: 0 };
const footerContentStyle = { position: 'relative', zIndex: 10 };

export default Landing;