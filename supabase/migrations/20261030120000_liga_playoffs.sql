-- ═══════════════════════════════════════════════════════════════════════════
--  LIGA: PLAYOFFS
--
--  segundopalo trae los partidos de playoff en la misma consulta que el
--  torneo regular, pero con la jornada en 1: sin marcar la fase se mezclaban
--  con la fecha 1 (y entraban en la tabla). Ahora cada partido guarda:
--    fase             null en el torneo regular; "Cuartos de final",
--                     "Semifinal", "Final"… en los playoffs
--    llave            el número de cruce dentro de la fase
--    partido_playoff  "Ida" / "Vuelta" (o "Único")
--    penales_local / penales_visitante   si se definió por penales
--
--  Correr ANTES de desplegar la función liga-sync nueva (que ya manda estos
--  campos). Después, "Actualizar" en Otras competencias completa la fase de
--  los playoffs que ya se habían bajado.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.liga_partidos
  add column if not exists fase text,
  add column if not exists llave int,
  add column if not exists partido_playoff text,
  add column if not exists penales_local int,
  add column if not exists penales_visitante int;

comment on column public.liga_partidos.fase is
  'null = torneo regular. Si no, la fase del playoff según segundopalo (fase_copas).';

create index if not exists liga_partidos_fase on public.liga_partidos (competencia_id, fase) where fase is not null;
