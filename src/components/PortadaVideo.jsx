import React from 'react';
import { Icono } from '../iconos';

/* LA MINIATURA DE UNA TAREA O JUGADA CON VIDEO
 *
 * En las listas (Banco de Tareas, Libro Táctico, Planificación) no se carga
 * el video: cada uno pesa varios MB y, reproduciéndose solo en cada fila, se
 * bajaban todos al abrir la lista (era casi todo el tráfico de Supabase).
 * Se muestra el gráfico de la tarea (o un ícono) con un ▶ encima; el video
 * se ve al abrir la tarea.
 */
export default function PortadaVideo({ grafico, icono = 'video', ajuste = 'cover', chico = false }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {grafico
        ? <img src={grafico} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: ajuste }} />
        : <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: chico ? '1.1rem' : '2.6rem', display: 'flex' }}><Icono nombre={icono} size="1em" relleno="propio" /></span>}
      <span aria-label="Tiene video" title="Tiene video: se ve al abrirla"
        style={{
          position: 'absolute', right: chico ? 2 : 8, bottom: chico ? 2 : 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: chico ? 16 : 30, height: chico ? 16 : 30, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.5)',
          color: '#fff', fontSize: chico ? 8 : 13, paddingLeft: chico ? 1 : 2,
        }}>▶</span>
    </div>
  );
}
