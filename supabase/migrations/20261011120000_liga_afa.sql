-- ═══════════════════════════════════════════════════════════════════════════
--  AFA STATS / OTRAS COMPETENCIAS
--
--  Los partidos de la liga (Primera A, B, C y D de AFA, de 1ra a 8va) tal como
--  los publica segundopalo.com. Son datos públicos y no son de ningún club:
--  por eso estas tablas NO llevan club_id. Las ve cualquiera que use la app
--  (también el kiosco, que entra como anon).
--
--  Quién escribe: solamente la función liga-sync (service role). Desde la app
--  no se puede insertar ni cambiar nada.
--
--    liga_competencias  qué se baja de segundopalo y cómo (una fila por
--                       división + categoría + año).
--    liga_partidos      un partido por id de segundopalo. Volver a sincronizar
--                       actualiza la fila, no la duplica.
--
--  Es idempotente: se puede correr por arriba de un intento anterior.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.liga_competencias (
  id             text primary key,               -- ej. 'afa-c-1ra-2026'
  division       text not null,                  -- 'A' | 'B' | 'C' | 'D'
  categoria      text not null,                  -- '1ra' | '3ra' … '8va'
  anio           int  not null,
  nombre         text not null,                  -- 'Primera C · 1ra'
  fuente         text not null check (fuente in ('primera', 'inferiores')),
  fuente_params  jsonb not null default '{}'::jsonb,
  activa         boolean not null default true,
  orden          int not null default 0,
  actualizado_at timestamptz,
  constraint liga_competencias_unica unique (division, categoria, anio)
);

comment on table public.liga_competencias is
  'Competencias de la liga que se bajan de segundopalo.com (AFA Stats / Otras competencias).';

create table if not exists public.liga_partidos (
  competencia_id       text not null references public.liga_competencias(id) on delete cascade,
  id_externo           bigint not null,
  jornada              int,
  fecha                date,
  hora                 text,
  local                text not null,
  visitante            text not null,
  goles_local          int,
  goles_visitante      int,
  estado               text,
  estadio              text,
  goleadores_local     text,
  goleadores_visitante text,
  actualizado_at       timestamptz not null default now(),
  primary key (competencia_id, id_externo)
);

comment on table public.liga_partidos is
  'Partidos de la liga según segundopalo.com. Clave: (competencia_id, id_externo).';

create index if not exists liga_partidos_competencia_jornada
  on public.liga_partidos (competencia_id, jornada);

alter table public.liga_competencias enable row level security;
alter table public.liga_partidos     enable row level security;

drop policy if exists liga_competencias_leer on public.liga_competencias;
create policy liga_competencias_leer on public.liga_competencias
  for select to anon, authenticated using (true);

drop policy if exists liga_partidos_leer on public.liga_partidos;
create policy liga_partidos_leer on public.liga_partidos
  for select to anon, authenticated using (true);

grant select on public.liga_competencias to anon, authenticated;
grant select on public.liga_partidos     to anon, authenticated;

-- Temporada 2026. Primera: competencia_id de segundopalo. Inferiores: edición
-- por división + categoría (no hay 2da).
insert into public.liga_competencias (id, division, categoria, anio, nombre, fuente, fuente_params, orden)
select
  'afa-' || lower(d.division) || '-' || c.categoria || '-2026',
  d.division,
  c.categoria,
  2026,
  'Primera ' || d.division || ' · ' || c.categoria,
  case when c.categoria = '1ra' then 'primera' else 'inferiores' end,
  case when c.categoria = '1ra'
       then jsonb_build_object('competencia_id', d.competencia_id)
       else jsonb_build_object('edicion_id', d.edicion_id, 'categoria_id', c.categoria_id, 'tipo', 1)
  end,
  d.orden * 10 + c.orden
from (values ('A', 1, 123, 1), ('B', 7, 125, 2), ('C', 10, 127, 3), ('D', 12, 130, 4))
       as d(division, competencia_id, edicion_id, orden)
cross join (values ('1ra', null::int, 1), ('3ra', 2, 3), ('4ta', 3, 4), ('5ta', 4, 5), ('6ta', 5, 6), ('7ma', 6, 7), ('8va', 7, 8))
       as c(categoria, categoria_id, orden)
on conflict (id) do nothing;
