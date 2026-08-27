import React from 'react';
import { DIAS_SEMANA, ESCALA, moverMes } from '../utils/resumenMensual';

const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const diaDe = (iso) => Number(iso.substring(8, 10));

const Destacado = ({ rotulo, dia, color }) => (
  <div style={{ flex: 1, minWidth: 130 }}>
    <div className="stat-label" style={{ marginBottom: 4 }}>{rotulo}</div>
    {dia ? (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '1.6rem', fontWeight: 900, color }}>{dia.presentes}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          de {dia.total} · día {diaDe(dia.fecha)}
        </span>
      </div>
    ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
  </div>
);

/**
 * El mes visto desde el plantel: una celda por día, el color según qué
 * porcentaje asistió y el número grande según cuántos fueron.
 *
 * Se muestran los dos datos porque contestan preguntas distintas: el
 * porcentaje dice qué tan bien respondió el grupo que estaba citado, y el
 * número absoluto dice cuánta gente hubo realmente en la cancha. Un 4 de 5
 * es 80% y sigue siendo un entrenamiento de cuatro jugadores.
 */
export default function CalendarioAsistencia({ resumen, mesISO, fechaActiva, onElegirDia, onCambiarMes, esMovil }) {
  const [anio, mes] = mesISO.split('-').map(Number);

  const encabezado = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
      <button onClick={() => onCambiarMes(moverMes(fechaActiva, -1))} className="btn-fantasma"
              aria-label="Mes anterior" style={{ minWidth: 44, padding: '0 12px' }}>←</button>
      <div style={{ textAlign: 'center', flex: 1 }}>
        <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{NOMBRE_MES[mes - 1]} {anio}</div>
        {resumen && (
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            {resumen.diasConDatos} {resumen.diasConDatos === 1 ? 'día entrenado' : 'días entrenados'}
            {' · '}{resumen.promedio}% de asistencia
            {' · '}{resumen.promedioPresentes} jugadores por sesión
          </div>
        )}
      </div>
      <button onClick={() => onCambiarMes(moverMes(fechaActiva, 1))} className="btn-fantasma"
              aria-label="Mes siguiente" style={{ minWidth: 44, padding: '0 12px' }}>→</button>
    </div>
  );

  if (!resumen) {
    return (
      <div className="bento-card" style={{ borderTop: '3px solid #3b82f6' }}>
        {encabezado}
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '30px 10px', margin: 0 }}>
          No hay asistencias cargadas en {NOMBRE_MES[mes - 1]}.
        </p>
      </div>
    );
  }

  return (
    <div className="bento-card" style={{ borderTop: '3px solid #3b82f6' }}>
      {encabezado}

      {/* Lo primero que hay que poder contestar: cuál fue el peor día. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 18,
                    paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <Destacado rotulo="Día más flojo" dia={resumen.peor} color="var(--peligro)" />
        <Destacado rotulo="Día más completo" dia={resumen.mejor} color="var(--ok)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: esMovil ? 3 : 6 }}>
        {DIAS_SEMANA.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 700,
                                letterSpacing: '0.06em', color: 'var(--text-dim)', paddingBottom: 4 }}>
            {/* Dos letras, no una: L/M/M/J/V/S/D deja martes y miércoles
                iguales y hay que contar columnas para saber cuál es cuál. */}
            {esMovil ? d.substring(0, 2) : d}
          </div>
        ))}

        {resumen.semanas.flat().map((celda, i) => {
          if (!celda) return <div key={`v${i}`} />;
          const { dia, fecha, datos } = celda;
          const elegido = fecha === fechaActiva;
          return (
            <button
              key={fecha}
              onClick={() => onElegirDia(fecha)}
              title={datos
                ? `${fecha}: ${datos.presentes} de ${datos.total} (${datos.porcentaje}%)`
                : `${fecha}: sin entrenamiento cargado`}
              style={{
                aspectRatio: '1', padding: 2, borderRadius: 8, cursor: 'pointer',
                background: datos ? datos.color : 'var(--bg)',
                color: datos ? datos.colorTexto : 'var(--text-dim)',
                /* El día seleccionado se marca con un aro por fuera, no
                   cambiándole el fondo: el fondo es el dato. */
                borderWidth: elegido ? 2 : 1,
                borderStyle: 'solid',
                borderColor: elegido ? 'var(--text)' : 'var(--border)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 0,
                fontFamily: 'inherit', minHeight: esMovil ? 38 : 52,
              }}
            >
              <span style={{ fontSize: '0.55rem', opacity: 0.75, lineHeight: 1 }}>{dia}</span>
              {datos && (
                <span style={{ fontSize: esMovil ? '0.85rem' : '1.15rem', fontWeight: 900, lineHeight: 1.1 }}>
                  {datos.presentes}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>ASISTENCIA:</span>
        {ESCALA.map((paso) => (
          <span key={paso.hasta} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, background: paso.fondo,
                           border: '1px solid var(--border)' }} />
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{paso.etiqueta}</span>
          </span>
        ))}
        <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          El número es cuántos jugadores fueron. Tocá un día para verlo.
        </span>
      </div>
    </div>
  );
}
