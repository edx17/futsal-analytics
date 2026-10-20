-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: CARTAS ESPECIALES (Goleadores, Asistidores, Presencia, MVP,
--  Recuperadores)
--
--  Los tipos nuevos que se guardan en el historial y se publican en el
--  catálogo de los sobres (ver src/analytics/especiales.js):
--    GOLM / ASIM / PREM   goleador, asistidor y presencia del mes ('YYYY-MM')
--    GOLR / ASIR / PRER   goleador, asistidor y presencia de la 1ª rueda
--    MVPR                 MVP de la 1ª rueda
--    SGOL / SREC          series GOLEADORES y RECUPERADORES (1 a 10)
--  Los de la rueda usan periodo 'R1:<torneo_id>'.
--
--  Las RAREZAS no cambian: cada tipo nuevo se publica con una rareza que ya
--  existe (GOLM/ASIM/PREM → totm, GOLR/ASIR/PRER/MVPR → potm, series → totw;
--  ver src/analytics/especialesCartas.js). Así los pesos del sorteo y las
--  V-Coins de las repetidas quedan exactamente igual.
--
--  Sólo amplía dos CHECK. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cartas_destacadas drop constraint if exists cartas_destacadas_tipo_check;
alter table public.cartas_destacadas add constraint cartas_destacadas_tipo_check
  check (tipo in ('POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY',
                  'GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC'));

alter table public.cartas_catalogo drop constraint if exists cartas_catalogo_tipo_check;
alter table public.cartas_catalogo add constraint cartas_catalogo_tipo_check
  check (tipo in ('BASE', 'POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY',
                  'GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC'));

comment on column public.cartas_destacadas.periodo is
  'POTW/TOTW: id del partido. POTM/TOTM y GOLM/ASIM/PREM: YYYY-MM. TOTY: YYYY. Primera rueda (GOLR, ASIR, PRER, MVPR, SGOL, SREC): R1:<torneo_id>.';
