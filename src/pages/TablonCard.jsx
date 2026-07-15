import { useTablon } from '../utils/useTablon'; // vive junto a useEsMovil.js

// Ojo: en Inicio.jsx probablemente NO haga falta este componente — el módulo
// m_triage ya es "la card con lo crítico". Este queda disponible por si en algún
// momento querés usarlo en otra pantalla que no tenga su propio triage.
export default function TablonCard({ clubId, misCategorias }) {
  const { alertas, loading } = useTablon(clubId, misCategorias);

  const criticas = alertas.filter((a) => a.prioridad === 'bloqueante');
  const importantes = alertas.filter((a) => a.prioridad === 'importante').slice(0, 2);
  const destacadas = [...criticas, ...importantes];

  // No molestar en Inicio si no hay nada urgente/importante (las info quedan solo en la campanita)
  if (!loading && destacadas.length === 0) return null;

  return (
    <div className="bento-card fadeIn tablon-card">
      <h3>Pendientes</h3>
      {loading && <p>Cargando...</p>}
      {!loading &&
        destacadas.map((a) => (
          <a key={a.id} href={a.ruta || '#'} className="tablon-card-item">
            <span
              className="tablon-card-dot"
              style={{ background: a.prioridad === 'bloqueante' ? '#ff5252' : '#ffc107' }}
            />
            {a.titulo}
          </a>
        ))}
    </div>
  );
}