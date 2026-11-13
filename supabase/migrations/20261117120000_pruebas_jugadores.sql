-- ═══════════════════════════════════════════════════════════════════════════
--  PLANTEL · PRUEBAS DE JUGADORES
--
--  Evaluar candidatos a incorporar con una rúbrica única (src/pruebas/rubrica.js,
--  versionada en código: la base NO guarda bloques ni criterios) y cerrar con
--  una recomendación cuyos criterios se ajustan desde el configurador.
--
--    pruebas_candidatos    la ficha previa (por categoría), con las señas para reconocerlo
--    pruebas_sesiones      cada día de prueba (etapa 1 o 2)
--    pruebas_evaluaciones  un puntaje 1-5 por evaluador, bloque y criterio
--    pruebas_cierres       por candidato y etapa: 'revision' (se cerró la carga y
--                          todos ven todos los puntajes) → 'decidido' (decisión
--                          final + snapshot de la configuración usada, congelado)
--    pruebas_config        ponderaciones, umbrales y bloques clave por club
--                          (categoria null) o por categoría (pisa a la del club)
--
--  Permisos:
--    ver        superuser, manager, admin y ct del club
--    cargar     superuser, manager y ct (candidatos, sesiones, puntajes, cierres)
--    configurar superuser, manager y ct
--  Los puntajes son de quien los carga: mientras la carga del candidato en esa
--  etapa está abierta, cada evaluador ve sólo los suyos (el superusuario ve
--  todo). Al cerrar la carga, los ve todo el cuerpo técnico y ya no se tocan.
--  Un cierre decidido no se modifica (sólo el superusuario puede borrarlo).
--
--  club_id es uuid (igual que jugadores.club_id); get_user_club_id() devuelve
--  text, por eso se compara club_id::text. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ayudantes de permisos ───────────────────────────────────────────────────
create or replace function public._pruebas_ve(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.get_user_rol()), '') = 'superuser'
      or (p_club::text = (select public.get_user_club_id())
          and (select public.get_user_rol()) in ('manager', 'admin', 'ct'))
$$;

create or replace function public._pruebas_carga(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.get_user_rol()), '') = 'superuser'
      or (p_club::text = (select public.get_user_club_id())
          and (select public.get_user_rol()) in ('manager', 'ct'))
$$;

-- ── Candidatos ─────────────────────────────────────────────────────────────
create table if not exists public.pruebas_candidatos (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null references public.clubes(id) on delete cascade,
  categoria           text not null check (length(trim(categoria)) > 0),
  nombre              text not null check (length(trim(nombre)) > 0),
  apellido            text not null default '',
  fecha_nacimiento    date,
  foto_url            text,
  puesto_principal    text not null,      -- Cierre | Ala | Pivot | Arquero (check más abajo)
  puesto_alternativo  text,
  perfil_dominante    jsonb not null default '{}'::jsonb,   -- { pierna, zona, rol }
  antecedentes        jsonb not null default '{}'::jsonb,   -- { club_anterior, minutos, lesiones }
  observaciones       text,                                 -- actitud, puntualidad, cómo llega (NO puntuado)
  senas               text,                                 -- para reconocerlo: "camiseta naranja, botines blancos"
  estado              text not null default 'citado' check (estado in ('citado', 'en_prueba', 'incorporado', 'descartado')),
  jugador_id          bigint references public.jugadores(id) on delete set null,   -- al incorporarlo
  creado_por          uuid default auth.uid(),
  created_at          timestamptz not null default now()
);
create index if not exists pruebas_candidatos_club_cat on public.pruebas_candidatos (club_id, categoria, estado);

-- Si la tabla ya existía de la primera versión: las señas y el arquero.
alter table public.pruebas_candidatos add column if not exists senas text;
alter table public.pruebas_candidatos drop constraint if exists pruebas_candidatos_senas_check;
alter table public.pruebas_candidatos add constraint pruebas_candidatos_senas_check check (senas is null or length(senas) <= 120);
alter table public.pruebas_candidatos drop constraint if exists pruebas_candidatos_puesto_principal_check;
alter table public.pruebas_candidatos add constraint pruebas_candidatos_puesto_principal_check
  check (puesto_principal in ('Cierre', 'Ala', 'Pivot', 'Arquero'));
alter table public.pruebas_candidatos drop constraint if exists pruebas_candidatos_puesto_alternativo_check;
alter table public.pruebas_candidatos add constraint pruebas_candidatos_puesto_alternativo_check
  check (puesto_alternativo is null or puesto_alternativo in ('Cierre', 'Ala', 'Pivot', 'Arquero'));

-- ── Sesiones ───────────────────────────────────────────────────────────────
create table if not exists public.pruebas_sesiones (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  categoria   text not null check (length(trim(categoria)) > 0),
  fecha       date not null default current_date,
  etapa       smallint not null default 1 check (etapa in (1, 2)),
  evaluadores uuid[] not null default '{}',
  notas       text,
  creado_por  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists pruebas_sesiones_club_cat on public.pruebas_sesiones (club_id, categoria, fecha desc);

-- ── Cierres (antes que las evaluaciones: las políticas de éstas lo miran) ──
create table if not exists public.pruebas_cierres (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references public.clubes(id) on delete cascade,
  categoria          text not null,
  candidato_id       uuid not null references public.pruebas_candidatos(id) on delete cascade,
  etapa              smallint not null check (etapa in (1, 2)),
  estado             text not null default 'revision' check (estado in ('revision', 'decidido')),
  resultado          jsonb,          -- lo que calculó el motor (puntaje, bloques, divergencias, fortalezas…)
  recomendacion      text check (recomendacion is null or recomendacion in ('incorporar', 'observar', 'no_incorporar')),
  decision           text check (decision is null or decision in ('incorporar', 'observar', 'no_incorporar')),
  comentario_dt      text,
  config_snapshot    jsonb,          -- la configuración con la que se calculó (congelada)
  config_version     int,
  rubrica_version    int,
  cerrado_por        uuid default auth.uid(),
  cerrado_at         timestamptz not null default now(),
  decidido_por       uuid,
  decidido_at        timestamptz,
  unique (candidato_id, etapa),
  -- Si la decisión no es la recomendada, el comentario del DT es obligatorio.
  check (estado = 'revision' or (decision is not null and recomendacion is not null and config_snapshot is not null
         and (decision = recomendacion or length(trim(coalesce(comentario_dt, ''))) > 0)))
);
create index if not exists pruebas_cierres_club_cat on public.pruebas_cierres (club_id, categoria);

-- ── Evaluaciones ───────────────────────────────────────────────────────────
create table if not exists public.pruebas_evaluaciones (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubes(id) on delete cascade,
  categoria      text not null,
  sesion_id      uuid not null references public.pruebas_sesiones(id) on delete cascade,
  candidato_id   uuid not null references public.pruebas_candidatos(id) on delete cascade,
  evaluador_id   uuid not null default auth.uid(),
  bloque         text not null check (bloque ~ '^[a-z_]{1,40}$'),
  criterio       text not null check (criterio ~ '^[a-z_]{1,40}$'),
  puntaje        smallint not null check (puntaje between 1 and 5),
  dato_objetivo  jsonb,
  comentario     text,
  updated_at     timestamptz not null default now(),
  unique (sesion_id, candidato_id, evaluador_id, bloque, criterio)
);
create index if not exists pruebas_eval_cand on public.pruebas_evaluaciones (candidato_id);
create index if not exists pruebas_eval_club_cat on public.pruebas_evaluaciones (club_id, categoria);

-- ¿Se puede seguir cargando? Sí mientras no haya cierre para el candidato en la etapa de la sesión.
create or replace function public._pruebas_carga_abierta(p_sesion uuid, p_candidato uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.pruebas_cierres c join public.pruebas_sesiones s on s.id = p_sesion
                      where c.candidato_id = p_candidato and c.etapa = s.etapa)
$$;

-- La evaluación hereda club y categoría de la sesión, y tiene que coincidir con la del candidato.
create or replace function public._pruebas_eval_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.pruebas_sesiones;
  k public.pruebas_candidatos;
begin
  select * into s from public.pruebas_sesiones where id = new.sesion_id;
  select * into k from public.pruebas_candidatos where id = new.candidato_id;
  if s.id is null or k.id is null then raise exception 'pruebas: sesión o candidato inexistente' using errcode = 'P0001'; end if;
  if s.club_id <> k.club_id or s.categoria <> k.categoria then
    raise exception 'pruebas: el candidato no es de la categoría de la sesión' using errcode = 'P0001';
  end if;
  if new.bloque = 'juego_real' and s.etapa <> 2 then
    raise exception 'pruebas: el juego real se evalúa en la etapa 2' using errcode = 'P0001';
  end if;
  if s.etapa = 2 and exists (select 1 from public.pruebas_cierres c where c.candidato_id = k.id and c.etapa = 1
                                and c.estado = 'decidido' and c.decision = 'no_incorporar') then
    raise exception 'pruebas: en la etapa 1 se decidió no incorporarlo' using errcode = 'P0001';
  end if;
  new.club_id := s.club_id;
  new.categoria := s.categoria;
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists pruebas_eval_antes on public.pruebas_evaluaciones;
create trigger pruebas_eval_antes before insert or update on public.pruebas_evaluaciones
  for each row execute function public._pruebas_eval_antes();

-- El cierre hereda club y categoría del candidato; un cierre decidido no se cambia.
create or replace function public._pruebas_cierre_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k public.pruebas_candidatos;
begin
  if tg_op = 'UPDATE' and old.estado = 'decidido' then
    raise exception 'pruebas: el cierre ya está decidido y queda congelado' using errcode = 'P0001';
  end if;
  select * into k from public.pruebas_candidatos where id = new.candidato_id;
  new.club_id := k.club_id;
  new.categoria := k.categoria;
  if new.estado = 'decidido' and (tg_op = 'INSERT' or old.estado = 'revision') then
    new.decidido_por := auth.uid();
    new.decidido_at := now();
  end if;
  return new;
end
$$;
drop trigger if exists pruebas_cierre_antes on public.pruebas_cierres;
create trigger pruebas_cierre_antes before insert or update on public.pruebas_cierres
  for each row execute function public._pruebas_cierre_antes();

-- ── Configuración ──────────────────────────────────────────────────────────
create table if not exists public.pruebas_config (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubes(id) on delete cascade,
  categoria      text,                                   -- null = vale para todo el club
  ponderaciones  jsonb not null default '{}'::jsonb,     -- { Cierre: { sin_pelota: 1.0, … }, … }
  umbrales       jsonb not null default '{}'::jsonb,     -- { incorporar, seguir_observando, bloque_clave_max, divergencia_min }
  bloques_clave  jsonb not null default '{}'::jsonb,     -- { Cierre: 'transiciones', … }
  version        int not null default 1,
  updated_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists pruebas_config_club_cat on public.pruebas_config (club_id, coalesce(categoria, ''));

create or replace function public._pruebas_config_version()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists pruebas_config_version on public.pruebas_config;
create trigger pruebas_config_version before insert or update on public.pruebas_config
  for each row execute function public._pruebas_config_version();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.pruebas_candidatos   enable row level security;
alter table public.pruebas_sesiones     enable row level security;
alter table public.pruebas_evaluaciones enable row level security;
alter table public.pruebas_cierres      enable row level security;
alter table public.pruebas_config       enable row level security;

-- Candidatos
drop policy if exists "Pruebas candidatos: ver" on public.pruebas_candidatos;
create policy "Pruebas candidatos: ver" on public.pruebas_candidatos for select to authenticated using (public._pruebas_ve(club_id));
drop policy if exists "Pruebas candidatos: crear" on public.pruebas_candidatos;
create policy "Pruebas candidatos: crear" on public.pruebas_candidatos for insert to authenticated with check (public._pruebas_carga(club_id));
drop policy if exists "Pruebas candidatos: editar" on public.pruebas_candidatos;
create policy "Pruebas candidatos: editar" on public.pruebas_candidatos for update to authenticated
  using (public._pruebas_carga(club_id)) with check (public._pruebas_carga(club_id));
drop policy if exists "Pruebas candidatos: borrar" on public.pruebas_candidatos;
create policy "Pruebas candidatos: borrar" on public.pruebas_candidatos for delete to authenticated
  using (public._pruebas_carga(club_id) and (select public.get_user_rol()) in ('superuser', 'manager'));

-- Sesiones
drop policy if exists "Pruebas sesiones: ver" on public.pruebas_sesiones;
create policy "Pruebas sesiones: ver" on public.pruebas_sesiones for select to authenticated using (public._pruebas_ve(club_id));
drop policy if exists "Pruebas sesiones: crear" on public.pruebas_sesiones;
create policy "Pruebas sesiones: crear" on public.pruebas_sesiones for insert to authenticated with check (public._pruebas_carga(club_id));
drop policy if exists "Pruebas sesiones: editar" on public.pruebas_sesiones;
create policy "Pruebas sesiones: editar" on public.pruebas_sesiones for update to authenticated
  using (public._pruebas_carga(club_id)) with check (public._pruebas_carga(club_id));
drop policy if exists "Pruebas sesiones: borrar" on public.pruebas_sesiones;
create policy "Pruebas sesiones: borrar" on public.pruebas_sesiones for delete to authenticated
  using (public._pruebas_carga(club_id) and (select public.get_user_rol()) in ('superuser', 'manager'));

-- Evaluaciones: las tuyas mientras la carga está abierta; las de todos cuando se cerró.
drop policy if exists "Pruebas evaluaciones: ver" on public.pruebas_evaluaciones;
create policy "Pruebas evaluaciones: ver" on public.pruebas_evaluaciones for select to authenticated
  using (public._pruebas_ve(club_id) and (
           evaluador_id = auth.uid()
        or coalesce((select public.get_user_rol()), '') = 'superuser'
        or not public._pruebas_carga_abierta(sesion_id, candidato_id)));
drop policy if exists "Pruebas evaluaciones: cargar" on public.pruebas_evaluaciones;
create policy "Pruebas evaluaciones: cargar" on public.pruebas_evaluaciones for insert to authenticated
  with check (evaluador_id = auth.uid() and public._pruebas_carga(club_id) and public._pruebas_carga_abierta(sesion_id, candidato_id));
drop policy if exists "Pruebas evaluaciones: corregir" on public.pruebas_evaluaciones;
create policy "Pruebas evaluaciones: corregir" on public.pruebas_evaluaciones for update to authenticated
  using (evaluador_id = auth.uid() and public._pruebas_carga(club_id) and public._pruebas_carga_abierta(sesion_id, candidato_id))
  with check (evaluador_id = auth.uid() and public._pruebas_carga(club_id) and public._pruebas_carga_abierta(sesion_id, candidato_id));
drop policy if exists "Pruebas evaluaciones: borrar" on public.pruebas_evaluaciones;
create policy "Pruebas evaluaciones: borrar" on public.pruebas_evaluaciones for delete to authenticated
  using (evaluador_id = auth.uid() and public._pruebas_carga(club_id) and public._pruebas_carga_abierta(sesion_id, candidato_id));

-- Cierres
drop policy if exists "Pruebas cierres: ver" on public.pruebas_cierres;
create policy "Pruebas cierres: ver" on public.pruebas_cierres for select to authenticated using (public._pruebas_ve(club_id));
drop policy if exists "Pruebas cierres: cerrar" on public.pruebas_cierres;
create policy "Pruebas cierres: cerrar" on public.pruebas_cierres for insert to authenticated
  with check (public._pruebas_carga((select k.club_id from public.pruebas_candidatos k where k.id = candidato_id)));
drop policy if exists "Pruebas cierres: decidir" on public.pruebas_cierres;
create policy "Pruebas cierres: decidir" on public.pruebas_cierres for update to authenticated
  using (public._pruebas_carga(club_id) and estado = 'revision') with check (public._pruebas_carga(club_id));
drop policy if exists "Pruebas cierres: reabrir" on public.pruebas_cierres;
create policy "Pruebas cierres: reabrir" on public.pruebas_cierres for delete to authenticated
  using (coalesce((select public.get_user_rol()), '') = 'superuser');

-- Configuración
drop policy if exists "Pruebas config: ver" on public.pruebas_config;
create policy "Pruebas config: ver" on public.pruebas_config for select to authenticated using (public._pruebas_ve(club_id));
drop policy if exists "Pruebas config: crear" on public.pruebas_config;
create policy "Pruebas config: crear" on public.pruebas_config for insert to authenticated with check (public._pruebas_carga(club_id));
drop policy if exists "Pruebas config: editar" on public.pruebas_config;
create policy "Pruebas config: editar" on public.pruebas_config for update to authenticated
  using (public._pruebas_carga(club_id)) with check (public._pruebas_carga(club_id));
drop policy if exists "Pruebas config: borrar" on public.pruebas_config;
create policy "Pruebas config: borrar" on public.pruebas_config for delete to authenticated using (public._pruebas_carga(club_id));

-- Cuántos evaluadores cargaron a cada candidato por etapa (sin los puntajes: mientras
-- la carga está abierta nadie ve los del otro, pero hace falta saber si ya son 2 para cerrar).
create or replace function public.pruebas_resumen_carga(p_club uuid, p_categoria text)
returns table (candidato_id uuid, etapa smallint, evaluadores int, puntajes int)
language sql stable security definer set search_path = public as $$
  select e.candidato_id, s.etapa, count(distinct e.evaluador_id)::int, count(*)::int
    from public.pruebas_evaluaciones e join public.pruebas_sesiones s on s.id = e.sesion_id
   where e.club_id = p_club and e.categoria = p_categoria and public._pruebas_ve(p_club)
   group by e.candidato_id, s.etapa
$$;
revoke all on function public.pruebas_resumen_carga(uuid, text) from public, anon;
grant execute on function public.pruebas_resumen_carga(uuid, text) to authenticated;

grant select, insert, update, delete on public.pruebas_candidatos, public.pruebas_sesiones, public.pruebas_evaluaciones,
  public.pruebas_cierres, public.pruebas_config to authenticated;
revoke all on public.pruebas_candidatos, public.pruebas_sesiones, public.pruebas_evaluaciones,
  public.pruebas_cierres, public.pruebas_config from anon;
revoke all on function public._pruebas_ve(uuid) from public, anon;
revoke all on function public._pruebas_carga(uuid) from public, anon;
revoke all on function public._pruebas_carga_abierta(uuid, uuid) from public, anon;
grant execute on function public._pruebas_ve(uuid) to authenticated;
grant execute on function public._pruebas_carga(uuid) to authenticated;
grant execute on function public._pruebas_carga_abierta(uuid, uuid) to authenticated;
