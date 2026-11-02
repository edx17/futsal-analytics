-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: CARTAS DE LA SEGUNDA RUEDA y CUÁNDO APARECIÓ CADA CARTA
--
--  1) Seis tipos nuevos, los de la 2ª rueda de un torneo (mismo cálculo que
--     los de la 1ª, en otro tono):
--       GOLR2 / ASIR2 / PRER2 / MVPR2   Goleador, Asistidor, Presencia y MVP
--       SGOL2 / SREC2                   series GOLEADORES y RECUPERADORES (1 a 10)
--     Usan periodo 'R2:<torneo_id>'. Amplía los CHECK de tipo del historial
--     (cartas_destacadas) y del catálogo (cartas_catalogo).
--
--  2) cartas_catalogo.creada_at: cuándo entró cada carta al catálogo (para
--     ordenar por aparición en Modo GOD → CARTAS). actualizada_at cambia con
--     cada nueva publicación; creada_at no. Las que ya estaban toman su
--     actualizada_at.
--
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cartas_destacadas drop constraint if exists cartas_destacadas_tipo_check;
alter table public.cartas_destacadas add constraint cartas_destacadas_tipo_check
  check (tipo in ('POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY',
                  'GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC',
                  'GOLR2', 'ASIR2', 'PRER2', 'MVPR2', 'SGOL2', 'SREC2'));

alter table public.cartas_catalogo drop constraint if exists cartas_catalogo_tipo_check;
alter table public.cartas_catalogo add constraint cartas_catalogo_tipo_check
  check (tipo in ('BASE', 'POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY',
                  'GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC',
                  'GOLR2', 'ASIR2', 'PRER2', 'MVPR2', 'SGOL2', 'SREC2',
                  'HERO', 'HALW', 'CFOR'));

comment on column public.cartas_destacadas.periodo is
  'POTW/TOTW: id del partido. POTM/TOTM y GOLM/ASIM/PREM: YYYY-MM. TOTY: YYYY. Primera rueda (GOLR, ASIR, PRER, MVPR, SGOL, SREC): R1:<torneo_id>. Segunda rueda (GOLR2, ASIR2, PRER2, MVPR2, SGOL2, SREC2): R2:<torneo_id>.';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cartas_catalogo' and column_name = 'creada_at') then
    alter table public.cartas_catalogo add column creada_at timestamptz;
    update public.cartas_catalogo set creada_at = actualizada_at;
    alter table public.cartas_catalogo alter column creada_at set default now();
    alter table public.cartas_catalogo alter column creada_at set not null;
  end if;
end
$$;
create index if not exists cartas_catalogo_creada on public.cartas_catalogo (club_id, creada_at desc);
