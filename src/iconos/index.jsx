// ==========================================
// ICONOS DE LA APP
// Un único mapa nombre → icono. Las pantallas piden el icono por lo que
// significa (<Icono nombre="tesoreria" />), no por cómo se dibuja: si
// mañana cambia la librería o el estilo, se toca solo este archivo.
// Estilo: Phosphor duotone + los iconos propios de ./futsal.
//
// Props además de las de Phosphor:
//   relleno="propio"  la capa suave toma el color del icono en vez del
//                     verde de acento (para iconos sobre tarjetas de color).
//   girar             lo hace girar (indicadores de carga).
// ==========================================
import {
  Airplane, ArrowBendUpRight, ArrowClockwise, ArrowCounterClockwise, ArrowDown,
  ArrowLeft, ArrowRight, ArrowSquareOut, ArrowUp, ArrowsClockwise,
  ArrowsDownUp, ArrowsLeftRight, Backspace, Bandaids, Bank, Barbell, Barricade,
  BatteryLow, BatteryMedium, Bell, Binoculars, Bone, BookOpen, Books, Brain,
  Briefcase, Buildings, Bus, Cake, CalendarBlank, CalendarCheck, CalendarDots,
  CalendarPlus, Camera, CaretDown, CaretLeft, CaretRight, CaretUp, ChartBar,
  ChartLine, ChartPie, ChatCircle, Check, CheckCircle, Circle, ClipboardText,
  Clock, CloudSlash, Coins, Compass, Confetti, Copy, CornersIn, CornersOut,
  CreditCard, Crosshair, Crown, Cursor, DeviceMobile, Dna, DotsSixVertical,
  DownloadSimple, Envelope, Export, Eye, EyeSlash, FileText, FileXls,
  FilmStrip, Fire, FirstAidKit, Flag, FlipHorizontal, FlipVertical, FloppyDisk,
  Folder, Footprints, ForkKnife, GameController, Gear, Ghost, Gift, Globe,
  GraduationCap, Hand, HandPalm, HandWaving, Handshake, Hash, Heart, Heartbeat,
  Hexagon, Hourglass, House, IdentificationCard, Image, Info, Laptop,
  Lightbulb, Lightning, Link, List, ListChecks, ListNumbers, Lock, LockOpen,
  MagnifyingGlass, MapPin, MapTrifold, Medal, Megaphone, Money, Moon,
  Newspaper, Note, Package, PaperPlaneTilt, Pause, PencilSimple,
  PersonSimpleRun, PersonSimpleTaiChi, Play, PlayCircle, Plus, PlusCircle,
  Prohibit, Pulse, PushPin, QrCode, Question, Receipt, Repeat, RocketLaunch,
  Ruler, Scales, ShareNetwork, Shield, ShieldCheck, ShoppingCart, SignOut,
  SkipBack, SkipForward, SlidersHorizontal, Smiley, SoccerBall, Sparkle,
  SpinnerGap, Spiral, Square, Stack, Star, Stethoscope, Stop, Student, Sun,
  Sword, TShirt, Table, Target, TextAa, Thermometer, Ticket, Timer, Trash,
  Tray, Triangle, Trophy, UploadSimple, User, UserCheck, UserGear, Users,
  UsersThree, VideoCamera, Wallet, Warning, WhatsappLogo, WifiHigh, WifiSlash,
  Wind, Wrench, X, XCircle,
} from '@phosphor-icons/react';
import { Arco, Camiseta, Cancha, Jugada, Silbato, Tarjeta, Tarjetas } from './futsal';

const ICONOS = {
  // ---- Navegación (barra lateral, menú móvil, accesos rápidos)
  inicio: House,
  manual: Question,
  cerrarSesion: SignOut,
  grupoAbierto: CaretDown,
  grupoCerrado: CaretRight,
  barraAbierta: CaretLeft,
  barraCerrada: CaretRight,
  menu: List,
  personalizar: SlidersHorizontal,

  operaciones: Silbato,
  nuevoPartido: PlusCircle,
  continuarPartido: PlayCircle,
  analisisOffline: CloudSlash,

  competicion: Trophy,
  torneos: ListNumbers,
  rivales: Binoculars,

  analisis: ChartBar,
  temporada: ChartLine,
  resumenPartido: Cancha,
  jugador: User,
  origenGoles: Arco,
  disciplina: Tarjetas,
  exportarGraficas: Export,

  planificacion: CalendarDots,
  agenda: CalendarBlank,
  hoy: CalendarCheck,
  citacion: ListChecks,
  microciclo: Repeat,
  creadorTactico: Jugada,
  creadorFisico: Barbell,
  bancoTareas: Books,
  libroTactico: BookOpen,
  videoanalisis: FilmStrip,

  plantelGrupo: Camiseta,
  plantel: Users,
  resumenPlantel: Table,
  comparar: Scales,
  transferencias: ArrowsLeftRight,
  presentismo: UserCheck,
  enfermeria: FirstAidKit,
  wellness: BatteryMedium,
  fisiologia: Heartbeat,
  novedades: Megaphone,

  administracion: Bank,
  staff: UserGear,
  diana: Target,
  empleados: Briefcase,
  tesoreria: Wallet,
  sponsors: Handshake,
  suscripcion: CreditCard,
  configuracion: Gear,

  sistema: ShieldCheck,
  gestionMaster: Crown,
  suscripciones: Receipt,

  // ---- Acciones
  agregar: Plus,
  guardar: FloppyDisk,
  editar: PencilSimple,
  borrar: Trash,
  cerrar: X,
  listo: Check,
  volver: ArrowLeft,
  avanzar: ArrowRight,
  subirFlecha: ArrowUp,
  bajarFlecha: ArrowDown,
  expandir: CaretDown,
  contraer: CaretUp,
  descargar: DownloadSimple,
  subir: UploadSimple,
  compartir: ShareNetwork,
  enviar: PaperPlaneTilt,
  abrirAfuera: ArrowSquareOut,
  actualizar: ArrowsClockwise,
  deshacer: ArrowCounterClockwise,
  rehacer: ArrowClockwise,
  anteriorPag: CaretLeft,
  siguientePag: CaretRight,
  ordenar: ArrowsDownUp,
  seleccionar: Cursor,
  espejarH: FlipHorizontal,
  espejarV: FlipVertical,
  borrarTecla: Backspace,
  conectado: WifiHigh,
  sinConexion: WifiSlash,
  buscar: MagnifyingGlass,
  copiar: Copy,
  lista: ClipboardText,
  enlace: Link,
  whatsapp: WhatsappLogo,
  nota: Note,
  comentario: ChatCircle,
  camara: Camera,
  ver: Eye,
  ocultar: EyeSlash,
  arrastrar: DotsSixVertical,
  pantallaCompleta: CornersOut,
  contraerPantalla: CornersIn,
  carpeta: Folder,
  archivo: FileText,
  excel: FileXls,
  qr: QrCode,
  capas: Stack,
  triangulo: Triangle,
  cuadrado: Square,
  circulo: Circle,
  valla: Barricade,
  formacion: Hexagon,
  ajustes: Gear,

  // ---- Video y tiempo
  reproducir: Play,
  pausa: Pause,
  detener: Stop,
  siguiente: SkipForward,
  anterior: SkipBack,
  video: VideoCamera,
  pelicula: FilmStrip,
  reloj: Clock,
  cronometro: Timer,
  espera: Hourglass,
  calendario: CalendarBlank,
  calendarioNuevo: CalendarPlus,

  // ---- Estados y avisos
  ok: CheckCircle,
  error: XCircle,
  aviso: Warning,
  prohibido: Prohibit,
  cargando: SpinnerGap,
  info: Info,
  pregunta: Question,
  candado: Lock,
  abierto: LockOpen,
  campana: Bell,
  fijado: PushPin,
  estrella: Star,
  destello: Sparkle,
  fuego: Fire,
  rayo: Lightning,
  objetivo: Target,
  escudo: Shield,
  cohete: RocketLaunch,
  festejo: Confetti,
  cumple: Cake,
  regalo: Gift,
  idea: Lightbulb,
  trofeo: Trophy,
  medalla: Medal,
  bandera: Flag,
  ubicacion: MapPin,
  mira: Crosshair,
  mundo: Globe,
  club: Buildings,
  celular: DeviceMobile,
  computadora: Laptop,
  mail: Envelope,
  diario: Newspaper,
  paquete: Package,
  bandeja: Tray,
  fantasma: Ghost,
  saludo: HandWaving,
  texto: TextAa,
  numero: Hash,
  regla: Ruler,
  imagen: Image,
  brujula: Compass,
  mapa: MapTrifold,
  juego: GameController,
  giro: Spiral,

  // ---- Salud y rendimiento
  medico: Stethoscope,
  lesion: Bandaids,
  botiquin: FirstAidKit,
  fisico: PersonSimpleRun,
  pesas: Barbell,
  cerebro: Brain,
  sueno: Moon,
  sol: Sun,
  corazon: Heart,
  pulso: Pulse,
  adn: Dna,
  hueso: Bone,
  pisada: Footprints,
  comida: ForkKnife,
  bateria: BatteryMedium,
  bateriaBaja: BatteryLow,
  temperatura: Thermometer,
  animo: Smiley,
  aire: Wind,
  relajacion: PersonSimpleTaiChi,

  // ---- Plata
  efectivo: Money,
  banco: Bank,
  tarjetaCredito: CreditCard,
  recibo: Receipt,
  billetera: Wallet,
  monedas: Coins,
  compra: ShoppingCart,
  entrada: Ticket,
  indumentaria: TShirt,
  herramienta: Wrench,
  beca: GraduationCap,

  // ---- Personas
  usuario: User,
  usuarios: Users,
  familia: UsersThree,
  identificacion: IdentificationCard,
  corona: Crown,
  mano: Hand,
  alumno: Student,

  // ---- Partido
  pelota: SoccerBall,
  asistencia: ArrowBendUpRight,
  arco: Arco,
  arquero: HandPalm,
  cancha: Cancha,
  silbato: Silbato,
  jugada: Jugada,
  camiseta: Camiseta,
  tarjeta: Tarjeta,
  tarjetas: Tarjetas,
  versus: Sword,
  viaje: Bus,
  avion: Airplane,
  grafico: ChartBar,
  evolucion: ChartLine,
  torta: ChartPie,
};

// Iconos simples cuyo duotone trae un cuadrado de fondo (X, tilde, más,
// menú, arrastrar): con relleno parecen botones dentro de botones, así que
// van solo con la línea.
const SIN_RELLENO = new Set(['cerrar', 'listo', 'agregar', 'menu', 'arrastrar']);

export function Icono({ nombre, size = 20, className = '', relleno, girar, style, ...props }) {
  const Componente = ICONOS[nombre];
  if (!Componente) return null;
  const clases = ['vc-icono', relleno === 'propio' && 'vc-icono--propio', girar && 'vc-icono--girar', className]
    .filter(Boolean).join(' ');
  return (
    <Componente
      size={size}
      weight={SIN_RELLENO.has(nombre) ? 'regular' : 'duotone'}
      className={clases}
      aria-hidden="true"
      style={{ verticalAlign: 'middle', ...style }}
      {...props}
    />
  );
}

export { Arco, Camiseta, Cancha, Jugada, Silbato, Tarjeta, Tarjetas };
