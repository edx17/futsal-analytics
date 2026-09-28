// ==========================================
// ICONOS PROPIOS DE FUTSAL
// Lo que Phosphor no trae: cancha, arco, tarjetas, silbato, jugada y
// camiseta. Dibujados en grilla de 24 px con el trazo del peso "duotone"
// de Phosphor (1,5 px), así conviven con el resto sin notarse el cambio.
// La capa de relleno suave lleva opacity 0.2, igual que Phosphor: la regla
// .vc-icono de index.css la pinta con el verde de acento.
// ==========================================

// weight llega desde <Icono> (es la prop de Phosphor); acá no aplica.
// eslint-disable-next-line no-unused-vars
function Base({ size = 20, weight, children, className = '', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`vc-icono ${className}`}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

// Capa de relleno suave (la parte "duo" del duotone).
const Duo = (props) => <path fill="currentColor" stroke="none" opacity="0.2" {...props} />;

export function Cancha(props) {
  return (
    <Base {...props}>
      <Duo d="M4 5h16a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 4 5z" />
      <rect x="2.5" y="5" width="19" height="14" rx="1.5" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M2.5 9h1.2a3 3 0 0 1 0 6H2.5" />
      <path d="M21.5 9h-1.2a3 3 0 0 0 0 6h1.2" />
    </Base>
  );
}

export function Arco(props) {
  return (
    <Base {...props}>
      <Duo d="M6 20V8.5h12V20z" />
      <path d="M3 20V5.5h18V20" />
      <path d="M6 20V8.5h12V20" />
      <path d="M3 5.5l3 3M21 5.5l-3 3" />
      <path d="M10 8.5V20M14 8.5V20M6 12.5h12M6 16.3h12" opacity="0.55" />
    </Base>
  );
}

export function Jugada(props) {
  return (
    <Base {...props}>
      <Duo d="M18.5 15.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
      <path d="M4 4.5l3.5 3.5M7.5 4.5L4 8" />
      <circle cx="18.5" cy="18" r="2.5" />
      <path d="M6.5 12c.5 4.5 3.5 6.5 8.5 6.2" strokeDasharray="2.2 2.2" />
      <path d="M13.3 16.1l2.2 2-2.3 1.9" />
    </Base>
  );
}

export function Silbato(props) {
  return (
    <Base {...props}>
      <Duo d="M9.5 8H21v3.5l-8.2 2.3A5.5 5.5 0 1 1 9.5 8z" />
      <path d="M9.5 8H21v3.5l-8.2 2.3A5.5 5.5 0 1 1 9.5 8z" />
      <circle cx="8.5" cy="13.5" r="1.6" />
      <path d="M15 8V5.5" />
    </Base>
  );
}

export function Camiseta({ dorsal = '10', ...props }) {
  const cuerpo = 'M8.5 3.5 4 5.5 2.5 10l3 1.2v9.3h13v-9.3l3-1.2L20 5.5l-4.5-2a3.5 3.5 0 0 1-7 0z';
  return (
    <Base {...props}>
      <Duo d={cuerpo} />
      <path d={cuerpo} />
      <text
        x="12" y="17.3" fontSize="6.4" textAnchor="middle" fontWeight="800"
        fill="currentColor" stroke="none" fontFamily="inherit"
      >
        {dorsal}
      </text>
    </Base>
  );
}

// Las tarjetas son la única excepción al color único: rellenas de amarillo
// o de rojo, porque en línea no se distinguen entre sí.
// Colores fijos, iguales en los dos temas: son el color de la tarjeta, no un
// color de texto (--amarillo en modo claro es un dorado oscuro para leerse
// sobre blanco, y la tarjeta se vería marrón). El borde fino hace que la
// amarilla se despegue del fondo blanco.
const COLOR_TARJETA = {
  amarilla: { relleno: '#facc15', borde: '#ca8a04' },
  roja: { relleno: '#ef4444', borde: '#b91c1c' },
};

const unaTarjeta = (x, giro, color) => {
  const c = COLOR_TARJETA[color] || COLOR_TARJETA.amarilla;
  return (
    <rect
      x={x} y="3.5" width="10" height="15" rx="1.6"
      transform={`rotate(${giro} ${x + 5} 11)`}
      fill={c.relleno} stroke={c.borde} strokeWidth="1"
    />
  );
};

export function Tarjeta({ color = 'amarilla', ...props }) {
  return <Base {...props}>{unaTarjeta(7, 10, color)}</Base>;
}

// Amarilla y roja juntas: el icono de Disciplina en la barra lateral.
export function Tarjetas(props) {
  return (
    <Base {...props}>
      {unaTarjeta(4, -10, 'amarilla')}
      {unaTarjeta(10, 12, 'roja')}
    </Base>
  );
}
