-- ═══════════════════════════════════════════════════════════════════════════
--  AFA STATS: ZONAS
--
--  Primera D se juega en dos zonas de 19 equipos que no se cruzan entre sí.
--  segundopalo lo informa en el campo `zona` de cada partido de Primera
--  ('z1', 'z2'); en inferiores viene vacío y la pantalla lo deduce de la
--  Primera de la misma división (son los mismos clubes).
--
--  Aditivo e idempotente: solo agrega la columna.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.liga_partidos add column if not exists zona text;

comment on column public.liga_partidos.zona is
  'Zona dentro de la competencia según la fuente (ej. z1, z2). Null si no tiene zonas.';
