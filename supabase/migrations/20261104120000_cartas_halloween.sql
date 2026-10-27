-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: CARTAS DE HALLOWEEN
--
--  La edición de noche de brujas de una carta. Las crea el superusuario desde
--  el Modo GOD · HALLOWEEN eligiendo jugadores: van al catálogo como tipo
--  'HALW', clave 'HALW|<año>|<jugador>', rareza 'potm', y exclusivas del
--  sobre del evento (plantilla "Noche de Halloween" en EVENTOS).
--
--  Sólo amplía los tipos permitidos del catálogo. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cartas_catalogo drop constraint if exists cartas_catalogo_tipo_check;
alter table public.cartas_catalogo add constraint cartas_catalogo_tipo_check
  check (tipo in ('BASE', 'POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY',
                  'GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC',
                  'HERO', 'HALW'));
