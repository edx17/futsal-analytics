// ==========================================
// ICONOS DE LA APP
// Un único mapa nombre → icono. Las pantallas piden el icono por lo que
// significa (<Icono nombre="tesoreria" />), no por cómo se dibuja: si
// mañana cambia la librería o el estilo, se toca solo este archivo.
// Estilo: Phosphor duotone + los iconos propios de ./futsal.
// ==========================================
import {
  ArrowsLeftRight, Bank, BatteryMedium, Barbell, Binoculars, BookOpen, Books,
  Briefcase, CalendarBlank, CalendarCheck, CalendarDots, CaretDown, CaretLeft,
  CaretRight, ChartBar, ChartLine, Check, CloudSlash, CreditCard, Crown, Export,
  FilmStrip, FirstAidKit, Gear, Handshake, Heartbeat, House, List, ListChecks,
  ListNumbers, Megaphone, PlayCircle, Plus, PlusCircle, Question, Receipt,
  Repeat, Scales, ShieldCheck, SignOut, SlidersHorizontal, SoccerBall, Table,
  Trophy, User, UserCheck, UserGear, Users, Wallet, X,
} from '@phosphor-icons/react';
import { Arco, Camiseta, Cancha, Jugada, Silbato, Tarjeta, Tarjetas } from './futsal';

const ICONOS = {
  // General
  inicio: House,
  manual: Question,
  cerrarSesion: SignOut,
  grupoAbierto: CaretDown,
  grupoCerrado: CaretRight,
  barraAbierta: CaretLeft,
  barraCerrada: CaretRight,
  menu: List,
  cerrar: X,
  agregar: Plus,
  listo: Check,
  personalizar: SlidersHorizontal,

  // Operaciones
  operaciones: Silbato,
  nuevoPartido: PlusCircle,
  continuarPartido: PlayCircle,
  analisisOffline: CloudSlash,

  // Competición
  competicion: Trophy,
  torneos: ListNumbers,
  rivales: Binoculars,

  // Análisis
  analisis: ChartBar,
  temporada: ChartLine,
  resumenPartido: Cancha,
  jugador: User,
  origenGoles: Arco,
  disciplina: Tarjetas,
  exportarGraficas: Export,

  // Planificación
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

  // Plantel
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

  // Administración
  administracion: Bank,
  staff: UserGear,
  empleados: Briefcase,
  tesoreria: Wallet,
  sponsors: Handshake,
  suscripcion: CreditCard,
  configuracion: Gear,

  // Sistema
  sistema: ShieldCheck,
  gestionMaster: Crown,
  suscripciones: Receipt,

  // Partido
  pelota: SoccerBall,
  tarjeta: Tarjeta,
};

export function Icono({ nombre, size = 20, className = '', ...props }) {
  const Componente = ICONOS[nombre];
  if (!Componente) return null;
  return (
    <Componente
      size={size}
      weight="duotone"
      className={`vc-icono ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Arco, Camiseta, Cancha, Jugada, Silbato, Tarjeta, Tarjetas };
