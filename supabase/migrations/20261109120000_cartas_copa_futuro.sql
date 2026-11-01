-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: CARTAS DE LA COPA FUTURO DE ORO (diseño TOTY Icons)
--
--  La edición de los de inferiores que juegan la Copa Futuro de Oro. Las crea
--  el superusuario desde el Modo GOD · COPA FUTURO eligiendo jugadores: van al
--  catálogo como tipo 'CFOR', clave 'CFOR|<año>|<jugador>', rareza 'toty', y
--  exclusivas del sobre del evento (plantilla "Copa Futuro de Oro" en EVENTOS).
--
--  Las TOTY del plantel (Modo GOD · TOTY) usan el tipo 'TOTY' que ya existía.
--  Sólo amplía los tipos permitidos del catálogo. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cartas_catalogo drop constraint if exists cartas_catalogo_tipo_check;
alter table public.cartas_catalogo add constraint cartas_catalogo_tipo_check
  check (tipo in ('BASE', 'POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY',
                  'GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC',
                  'HERO', 'HALW', 'CFOR'));
