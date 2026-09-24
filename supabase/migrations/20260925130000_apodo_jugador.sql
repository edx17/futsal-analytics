-- ════════════════════════════════════════════════════════════════════════════
--  APODO DEL JUGADOR
--
--  En el club a muchos se los conoce por el apodo ("el Tano", "Chino") más
--  que por el nombre. Se guarda aparte para poder buscarlos por ahí en Mi
--  Plantel y cargarlo desde la planilla. Opcional: puede quedar vacío.
--
--  Aditiva e idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.jugadores
  add column if not exists apodo text;
