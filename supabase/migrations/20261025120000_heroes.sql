-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: CARTAS DE HÉROES
--
--  Figuras que ya no están en el club. No salen de los partidos (no hay datos):
--  las carga el superusuario desde el Modo GOD · HÉROES, con su media, su
--  puesto, sus rasgos y su foto (en sepia). Van al catálogo como tipo 'HERO',
--  clave 'HERO|<nombre>', jugador_id 'heroe:<nombre>', rareza 'toty', y por
--  defecto exclusivas de su evento (el sobre "Héroes").
--
--  Sólo amplía los tipos permitidos del catálogo. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cartas_catalogo drop constraint if exists cartas_catalogo_tipo_check;
alter table public.cartas_catalogo add constraint cartas_catalogo_tipo_check
  check (tipo in ('BASE', 'POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY',
                  'GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC',
                  'HERO'));
