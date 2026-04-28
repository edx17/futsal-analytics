import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AceptarTerminos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleAceptar = async () => {
    setLoading(true);
    // Guardamos la firma en la base de datos de forma silenciosa
    const { error } = await supabase
      .from('perfiles')
      .update({ 
        terminos_aceptados: true, 
        fecha_aceptacion: new Date().toISOString()
      })
      .eq('id', user.id);

    setLoading(false);
    
    if (!error) {
      // Recargamos forzosamente para que el AuthContext se entere del cambio de estado
      window.location.href = '/inicio'; 
    } else {
      alert("Hubo un error al guardar la aceptación. Intenta nuevamente.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', padding: '20px', alignItems: 'center', boxSizing: 'border-box' }}>
      <div style={{ background: 'var(--panel)', padding: '30px', borderRadius: '12px', border: '1px solid var(--border)', width: '100%', maxWidth: '800px', flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <h1 style={{ color: 'var(--accent)', marginBottom: '20px', fontSize: '1.5rem', textAlign: 'center', fontWeight: '900' }}>
          TÉRMINOS Y CONDICIONES Y POLÍTICA DE PRIVACIDAD – VIRTUAL.CLUB
        </h1>
        
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '15px', color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6' }}>
          <p>El presente documento establece las condiciones de uso y el deslinde de responsabilidad legal aplicable a todos los usuarios (Clubes, Cuerpos Técnicos, Administradores y Jugadores) de la plataforma <strong>Virtual.Club</strong> (en adelante, "la Plataforma" o "la App"). Al acceder, registrarse o utilizar la Plataforma, usted acepta íntegramente estos términos.</p>

          <h3 style={{ color: '#fff', marginTop: '20px', fontWeight: 'bold' }}>1. NATURALEZA DEL SERVICIO Y DESLINDE MÉDICO (Disclaimer)</h3>
          <p><strong>1.1. Herramienta de Gestión, no Médica:</strong> Virtual.Club es una plataforma tecnológica diseñada para la recopilación, visualización y gestión de datos estadísticos y de percepción subjetiva del esfuerzo (RPE, Wellness, Readiness). En ningún caso la Plataforma constituye un dispositivo médico, ni provee diagnósticos, tratamientos o asesoramiento médico, psicológico o fisioterapéutico.</p>
          <p><strong>1.2. Exención de Responsabilidad Deportiva/Salud:</strong> Toda decisión táctica, física, médica o de recuperación tomada en base a las métricas, alertas o reportes generados por la Plataforma es de exclusiva y total responsabilidad del Club, su Cuerpo Técnico y su equipo médico. Virtual.Club y sus desarrolladores quedan expresamente eximidos de cualquier responsabilidad por lesiones, agravamiento de cuadros clínicos, estrés psicológico o bajo rendimiento deportivo que pudieran sufrir los jugadores.</p>

          <h3 style={{ color: '#fff', marginTop: '20px', fontWeight: 'bold' }}>2. PRIVACIDAD Y PROTECCIÓN DE DATOS SENSIBLES</h3>
          <p><strong>2.1. Roles legales:</strong> Para efectos legales de protección de datos, el Club (o el Administrador principal de la cuenta) actúa como el Responsable del Tratamiento de los datos. Virtual.Club actúa únicamente como Encargado del Tratamiento (proveedor de infraestructura tecnológica).</p>
          <p><strong>2.2. Datos de Salud y Psicológicos:</strong> La Plataforma recopila datos considerados altamente sensibles (ej. calidad de sueño, estado de ánimo, niveles de estrés, fatiga y dolor muscular). Virtual.Club se compromete a no vender, alquilar ni ceder estos datos a terceros bajo ninguna circunstancia.</p>
          <p><strong>2.3. Menores de Edad:</strong> Si el Club utiliza la Plataforma para gestionar jugadores menores de edad, es obligación exclusiva y excluyente del Club recabar el consentimiento libre, expreso e informado de los padres o tutores legales de dichos menores antes de ingresar sus datos al sistema. Virtual.Club se exime de cualquier reclamo derivado de la falta de dicho consentimiento.</p>

          <h3 style={{ color: '#fff', marginTop: '20px', fontWeight: 'bold' }}>3. ALMACENAMIENTO Y SEGURIDAD (Infraestructura)</h3>
          <p><strong>3.1. Proveedores de Terceros:</strong> Los datos son procesados y almacenados utilizando infraestructura en la nube de terceros de primer nivel (ej. Supabase). Si bien aplicamos medidas de seguridad lógicas y cifrado estándar de la industria, ninguna transmisión por internet es 100% segura.</p>
          <p><strong>3.2. Exención por Brechas de Seguridad:</strong> El usuario acepta que Virtual.Club no será responsable por la interceptación no autorizada de datos, hackeos, caídas de servidores (downtime) o pérdida de información derivada de ataques cibernéticos o eventos de fuerza mayor ajenos a nuestro control razonable.</p>

          <h3 style={{ color: '#fff', marginTop: '20px', fontWeight: 'bold' }}>4. USO DE DISPOSITIVOS COMPARTIDOS (Modo Kiosco)</h3>
          <p><strong>4.1. Cuidado del Kiosco:</strong> La Plataforma ofrece un "Modo Kiosco" para ingreso de datos en vestuarios. Es responsabilidad del Club garantizar la supervisión del dispositivo físico para evitar que un jugador ingrese datos en nombre de otro o visualice información confidencial. Virtual.Club no se responsabiliza por la adulteración de datos derivada de la negligencia en el cuidado del dispositivo compartido.</p>

          <h3 style={{ color: '#fff', marginTop: '20px', fontWeight: 'bold' }}>5. PROPIEDAD INTELECTUAL</h3>
          <p><strong>5.1. Titularidad:</strong> Todo el código fuente, algoritmos de cálculo (ej. fórmulas de Readiness, Rating de Jugadores), diseño de interfaz (UI/UX), bases de datos y marcas comerciales son propiedad exclusiva de Virtual.Club. Queda estrictamente prohibida su copia, ingeniería inversa o reproducción sin autorización.</p>

          <h3 style={{ color: '#fff', marginTop: '20px', fontWeight: 'bold' }}>6. LIMITACIÓN GENERAL DE RESPONSABILIDAD (Cláusula "As-Is")</h3>
          <p>El software se proporciona "tal cual" (As-Is) y "según disponibilidad". Virtual.Club rechaza toda garantía implícita o explícita sobre la idoneidad del software para un fin particular. En ningún caso Virtual.Club será responsable por daños indirectos, lucro cesante, pérdida de datos o daño reputacional derivados del uso o imposibilidad de uso de la Plataforma.</p>

          <h3 style={{ color: '#fff', marginTop: '20px', fontWeight: 'bold' }}>7. CUMPLIMIENTO DE LA LEY DE PROTECCIÓN DE DATOS PERSONALES (LEY 25.326)</h3>
          <p><strong>7.1. Calidad y Consentimiento (Art. 4 y 5):</strong> Los datos recabados en Virtual.Club son adecuados, pertinentes y no excesivos en relación con el ámbito deportivo. El ingreso a la Plataforma implica el consentimiento libre, expreso e informado del usuario para el tratamiento de sus datos.</p>
          <p><strong>7.2. Datos Sensibles (Art. 7):</strong> Virtual.Club procesa datos que la legislación argentina clasifica como "sensibles" (información de salud física, mental y hábitos personales). Ningún usuario (jugador) está obligado a proporcionar estos datos. Su carga es voluntaria y con el único fin de monitoreo deportivo por parte de su Club. Virtual.Club garantiza que estos datos no serán utilizados para actos discriminatorios ni compartidos con terceros ajenos al Club sin autorización judicial.</p>
          <p><strong>7.3. Seguridad de los Datos (Art. 9):</strong> Virtual.Club y los Clubes administradores se comprometen a adoptar las medidas técnicas y organizativas que resulten necesarias para garantizar la seguridad y confidencialidad de los datos personales, de modo de evitar su adulteración, pérdida, consulta o tratamiento no autorizado.</p>
          <p><strong>7.4. Derechos de los Titulares (Art. 14, 15 y 16):</strong> El titular de los datos (el jugador o su tutor legal) tiene la facultad de ejercer el derecho de acceso, rectificación, actualización y supresión de sus datos en forma gratuita a intervalos no inferiores a seis meses. Para ejercer estos derechos, el usuario deberá contactar primero a la Administración de su Club (Responsable de la Base de Datos) o, en su defecto, a los canales de soporte de Virtual.Club.</p>
          <p><strong>7.5. Autoridad de Aplicación:</strong> Se informa a los usuarios que la Agencia de Acceso a la Información Pública, Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales.</p>
        </div>

        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <button 
            onClick={handleAceptar} 
            disabled={loading}
            style={{ 
              width: '100%', maxWidth: '400px', padding: '15px', background: 'var(--accent)', color: '#000', 
              border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: '900', cursor: 'pointer',
              opacity: loading ? 0.7 : 1, transition: '0.2s'
            }}
          >
            {loading ? 'GUARDANDO...' : 'HE LEÍDO Y ACEPTO LOS TÉRMINOS'}
          </button>
        </div>
      </div>
    </div>
  );
}