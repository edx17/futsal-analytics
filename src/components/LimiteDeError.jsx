import React from 'react';

/* NINGUNA PANTALLA EN NEGRO
 *
 * Las pantallas se cargan con lazy(), y Suspense sólo maneja la espera: si
 * algo falla, React desmonta el árbol entero y queda la pantalla negra, sin
 * un cartel ni forma de volver.
 *
 * Hay dos fallas distintas y cada una necesita otra respuesta:
 *
 *  1. No bajó el archivo de la pantalla. Pasa cuando la pestaña está abierta
 *     desde antes de un deploy: cada versión genera nombres con hash nuevos,
 *     así que el archivo que tu pestaña pide ya no existe. Se arregla sola
 *     recargando, que es lo que uno termina haciendo a mano con F5. Una vez,
 *     con una marca, para no entrar en bucle si el problema es otro.
 *
 *  2. Un error de código de esa pantalla. Recargar no lo arregla: hay que
 *     mostrar qué pasó y dejar salir a otra pantalla.
 */

const CLAVE_RECARGA = 'vc_recarga_por_chunk';

const esFalloDeCarga = (error) => {
  const txt = `${error?.name || ''} ${error?.message || ''}`;
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(txt);
};

export default class LimiteDeError extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, recargando: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Al log, para poder pedirle al usuario que lo copie si hace falta.
    console.error('Pantalla caída:', error, info?.componentStack);

    if (esFalloDeCarga(error)) {
      let yaIntentado = false;
      try { yaIntentado = sessionStorage.getItem(CLAVE_RECARGA) === '1'; } catch { /* modo privado */ }
      if (!yaIntentado) {
        try { sessionStorage.setItem(CLAVE_RECARGA, '1'); } catch { /* modo privado */ }
        this.setState({ recargando: true });
        window.location.reload();
      }
    } else {
      // Una pantalla que carga bien limpia la marca: la próxima falla de
      // descarga vuelve a tener su recarga automática.
      try { sessionStorage.removeItem(CLAVE_RECARGA); } catch { /* modo privado */ }
    }
  }

  reintentar = () => {
    try { sessionStorage.removeItem(CLAVE_RECARGA); } catch { /* modo privado */ }
    window.location.reload();
  };

  render() {
    const { error, recargando } = this.state;
    if (!error) return this.props.children;

    const deCarga = esFalloDeCarga(error);

    if (recargando) {
      return (
        <div style={estilos.centro}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Actualizando a la última versión…</div>
        </div>
      );
    }

    return (
      <div style={estilos.centro}>
        <div style={estilos.caja}>
          <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>{deCarga ? '🔄' : '⚠️'}</div>
          <h2 style={estilos.titulo}>
            {deCarga ? 'Hay una versión nueva de la app' : 'Esta pantalla no se pudo abrir'}
          </h2>
          <p style={estilos.texto}>
            {deCarga
              ? 'Tu pestaña estaba abierta desde antes de la última actualización. Recargando se soluciona.'
              : 'El resto de la app sigue funcionando. Si te vuelve a pasar en la misma pantalla, mandanos el detalle de acá abajo.'}
          </p>

          {!deCarga && (
            <pre style={estilos.detalle}>{String(error?.message || error)}</pre>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '18px' }}>
            <button onClick={this.reintentar} style={estilos.botonPrincipal}>RECARGAR</button>
            <button onClick={() => { window.location.href = '/'; }} style={estilos.botonSecundario}>IR AL INICIO</button>
          </div>
        </div>
      </div>
    );
  }
}

const estilos = {
  centro: {
    minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
  },
  caja: {
    background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px',
    padding: '30px 26px', maxWidth: '460px', textAlign: 'center',
  },
  titulo: { color: 'var(--text)', fontSize: '1.15rem', margin: '0 0 10px' },
  texto: { color: 'var(--text-dim)', fontSize: '0.86rem', lineHeight: 1.6, margin: 0 },
  detalle: {
    marginTop: '14px', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '6px', fontSize: '0.7rem', color: '#fbbf24', textAlign: 'left',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '140px', overflowY: 'auto',
  },
  botonPrincipal: {
    background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px',
    padding: '11px 22px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
  },
  botonSecundario: {
    background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '11px 22px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
  },
};
