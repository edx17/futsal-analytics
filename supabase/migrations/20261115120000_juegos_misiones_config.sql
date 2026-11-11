-- ═══════════════════════════════════════════════════════════════════════════
--  JUEGOS · MISIONES CONFIGURABLES (Configurador GOD › Misiones)
--
--  Hasta ahora las misiones del día estaban fijas en _juegos_misiones. Ahora
--  cada club tiene las suyas (juegos_misiones_def): acción, meta, premio,
--  días de la semana, activa y orden. Mientras el club no las cambie, siguen
--  las 4 de siempre (mismos ids: lo que ya se cobró hoy sigue cobrado).
--
--  El progreso se sigue contando solo, con lo que ya registra la base: no se
--  puede inflar desde el navegador. Acciones que se pueden usar:
--    sobres            abrir sobres                    (sobres_abiertos)
--    vdraft_partidos   jugar partidos del V-Draft      (vdraft_partidas.partidos)
--    vdraft_victorias  ganar partidos del V-Draft      (vdraft_partidas.victorias)
--    desafio           jugar el desafío del día        (vdraft_partidas modo 'desafio' terminadas)
--    penales           ganar tandas de penales         (penales_tandas.gano)
--    duelos_jugados    jugar duelos                    (juegos_duelos jugados hoy)
--    duelos_ganados    ganar duelos                    (juegos_duelos ganados hoy)
--
--    god_misiones(p_club)                 → { personalizadas, misiones }
--    god_misiones_guardar(p_club, lista)  → lo mismo, ya guardado (reemplaza todas)
--    god_misiones_restablecer(p_club)     → vuelve a las de siempre
--
--  Recrea _juegos_misiones (misma salida + 'accion'); juegos_misiones y
--  juegos_cobrar_mision no cambian (la leen). Va después de
--  20261105120000_vcoins_eventos.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.juegos_misiones_def (
  club_id    uuid not null references public.clubes(id) on delete cascade,
  id         text not null check (id ~ '^[a-z0-9_]{1,40}$'),
  accion     text not null check (accion in ('sobres', 'vdraft_partidos', 'vdraft_victorias', 'desafio', 'penales', 'duelos_jugados', 'duelos_ganados')),
  titulo     text not null check (length(trim(titulo)) between 1 and 80),
  meta       int  not null check (meta between 1 and 50),
  premio     int  not null check (premio between 0 and 5000),
  dias       smallint[] not null default array[1, 2, 3, 4, 5, 6, 7]::smallint[]
             check (cardinality(dias) > 0 and dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  activa     boolean not null default true,
  orden      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (club_id, id)
);
comment on table public.juegos_misiones_def is 'Juegos: las misiones del día de cada club (Configurador GOD). Sin filas y sin marca, valen las de siempre.';

-- Que el club ya armó las suyas (aunque las haya borrado todas: entonces no hay misiones).
create table if not exists public.juegos_misiones_club (
  club_id    uuid primary key references public.clubes(id) on delete cascade,
  updated_at timestamptz not null default now(),
  por        uuid default auth.uid()
);

alter table public.juegos_misiones_def enable row level security;   -- sólo por las funciones
alter table public.juegos_misiones_club enable row level security;
revoke all on table public.juegos_misiones_def from anon, authenticated;
revoke all on table public.juegos_misiones_club from anon, authenticated;

-- Las de siempre (las que había fijas): mismos ids, para no perder lo cobrado.
create or replace function public._juegos_misiones_por_defecto()
returns table (id text, accion text, titulo text, meta int, premio int, dias smallint[], activa boolean, orden int)
language sql immutable as $$
  values
    ('sobre'::text, 'sobres'::text, 'Abrí 1 sobre'::text, 1, 25, array[1, 2, 3, 4, 5, 6, 7]::smallint[], true, 1),
    ('vdraft_partido', 'vdraft_partidos', 'Jugá 1 partido del V-Draft', 1, 25, array[1, 2, 3, 4, 5, 6, 7]::smallint[], true, 2),
    ('vdraft_victorias', 'vdraft_victorias', 'Ganá 2 partidos del V-Draft', 2, 50, array[1, 2, 3, 4, 5, 6, 7]::smallint[], true, 3),
    ('penales', 'penales', 'Ganá 1 tanda de penales', 1, 25, array[1, 2, 3, 4, 5, 6, 7]::smallint[], true, 4)
$$;

-- Las del club (o las de siempre si nunca las cambió).
create or replace function public._juegos_misiones_defs(p_club uuid)
returns table (id text, accion text, titulo text, meta int, premio int, dias smallint[], activa boolean, orden int)
language sql stable security definer set search_path = public as $$
  select d.id, d.accion, d.titulo, d.meta, d.premio, d.dias, d.activa, d.orden
    from public.juegos_misiones_def d where d.club_id = p_club
  union all
  select * from public._juegos_misiones_por_defecto()
   where not exists (select 1 from public.juegos_misiones_club c where c.club_id = p_club)
$$;

-- Cuánto lleva hoy un dueño en una acción.
create or replace function public._juegos_mision_progreso(p_club uuid, p_dueno text, p_accion text, p_dia date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(case p_accion
    when 'sobres' then
      (select count(*) from public.sobres_abiertos s where s.club_id = p_club and s.dueno = p_dueno and s.dia = p_dia)
    when 'vdraft_partidos' then
      (select sum(jsonb_array_length(coalesce(v.partidos, '[]'::jsonb))) from public.vdraft_partidas v
        where v.club_id = p_club and v.dueno = p_dueno and v.dia = p_dia)
    when 'vdraft_victorias' then
      (select sum(v.victorias) from public.vdraft_partidas v where v.club_id = p_club and v.dueno = p_dueno and v.dia = p_dia)
    when 'desafio' then
      (select count(*) from public.vdraft_partidas v
        where v.club_id = p_club and v.dueno = p_dueno and v.dia = p_dia and v.modo = 'desafio' and v.estado = 'terminada')
    when 'penales' then
      (select count(*) from public.penales_tandas t where t.club_id = p_club and t.dueno = p_dueno and t.dia = p_dia and t.gano)
    when 'duelos_jugados' then
      (select count(*) from public.juegos_duelos d
        where d.club_id = p_club and d.estado = 'jugado' and p_dueno in (d.retador, d.rival)
          and (d.jugado_at at time zone 'America/Argentina/Buenos_Aires')::date = p_dia)
    when 'duelos_ganados' then
      (select count(*) from public.juegos_duelos d
        where d.club_id = p_club and d.estado = 'jugado'
          and (d.jugado_at at time zone 'America/Argentina/Buenos_Aires')::date = p_dia
          and ((d.retador = p_dueno and d.resultado ->> 'ganador' = 'retador')
            or (d.rival = p_dueno and d.resultado ->> 'ganador' = 'rival')))
  end, 0)::int
$$;

-- Las misiones de hoy (las activas y de este día de la semana) con su progreso.
-- Misma salida que antes, más 'accion' (para el ícono). El premio, x2 si aplica.
create or replace function public._juegos_misiones(p_club uuid, p_dueno text)
returns jsonb language sql stable security definer set search_path = public as $$
  with hoy as (select public._sobres_hoy() as d),
  defs as (
    select m.* from public._juegos_misiones_defs(p_club) m, hoy
     where m.activa and extract(isodow from hoy.d)::smallint = any (m.dias)
  ),
  prog as (
    select m.*, public._juegos_mision_progreso(p_club, p_dueno, m.accion, hoy.d) as progreso from defs m, hoy
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'accion', p.accion, 'titulo', p.titulo, 'meta', p.meta,
           'premio', round(p.premio * public._vcoins_factor_en(p_club, 'misiones'))::int,
           'premio_base', p.premio,
           'progreso', least(p.progreso, p.meta),
           'cobrada', exists (select 1 from public.juegos_misiones_cobradas c, hoy
                               where c.club_id = p_club and c.dueno = p_dueno and c.dia = hoy.d and c.mision = p.id))
         order by p.orden, p.id), '[]'::jsonb)
    from prog p
$$;

-- ── CONFIGURADOR GOD (sólo el superusuario) ─────────────────────────────────

create or replace function public.god_misiones(p_club uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._god_o_error();
  return jsonb_build_object(
    'personalizadas', exists (select 1 from public.juegos_misiones_club c where c.club_id = p_club),
    'misiones', coalesce((select jsonb_agg(to_jsonb(m) order by m.orden, m.id) from public._juegos_misiones_defs(p_club) m), '[]'::jsonb));
end
$$;

-- Reemplaza todas las misiones del club por la lista ([{ id, accion, titulo, meta, premio, dias, activa, orden }]).
create or replace function public.god_misiones_guardar(p_club uuid, p_misiones jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._god_o_error();
  if jsonb_typeof(p_misiones) <> 'array' then raise exception 'god: las misiones van en una lista' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_misiones) > 20 then raise exception 'god: hasta 20 misiones' using errcode = 'P0001'; end if;
  if (select count(distinct x ->> 'id') from jsonb_array_elements(p_misiones) x) <> jsonb_array_length(p_misiones) then
    raise exception 'god: hay dos misiones con el mismo id' using errcode = 'P0001';
  end if;

  delete from public.juegos_misiones_def where club_id = p_club;
  insert into public.juegos_misiones_def (club_id, id, accion, titulo, meta, premio, dias, activa, orden, updated_at)
  select p_club, x ->> 'id', x ->> 'accion', trim(x ->> 'titulo'), (x ->> 'meta')::int, (x ->> 'premio')::int,
         coalesce((select array_agg(d::smallint order by d::smallint) from jsonb_array_elements_text(x -> 'dias') d),
                  array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
         coalesce((x ->> 'activa')::boolean, true), coalesce((x ->> 'orden')::int, n::int), now()
    from jsonb_array_elements(p_misiones) with ordinality as t(x, n);
  insert into public.juegos_misiones_club (club_id, updated_at, por) values (p_club, now(), auth.uid())
  on conflict (club_id) do update set updated_at = now(), por = auth.uid();
  return public.god_misiones(p_club);
end
$$;

create or replace function public.god_misiones_restablecer(p_club uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._god_o_error();
  delete from public.juegos_misiones_def where club_id = p_club;
  delete from public.juegos_misiones_club where club_id = p_club;
  return public.god_misiones(p_club);
end
$$;

revoke all on function public._juegos_misiones_por_defecto() from public, anon, authenticated;
revoke all on function public._juegos_misiones_defs(uuid) from public, anon, authenticated;
revoke all on function public._juegos_mision_progreso(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public._juegos_misiones(uuid, text) from public, anon, authenticated;
revoke all on function public.god_misiones(uuid) from public, anon;
revoke all on function public.god_misiones_guardar(uuid, jsonb) from public, anon;
revoke all on function public.god_misiones_restablecer(uuid) from public, anon;
grant execute on function public.god_misiones(uuid) to authenticated;
grant execute on function public.god_misiones_guardar(uuid, jsonb) to authenticated;
grant execute on function public.god_misiones_restablecer(uuid) to authenticated;
