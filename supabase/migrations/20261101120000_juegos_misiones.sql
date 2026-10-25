-- ═══════════════════════════════════════════════════════════════════════════
--  JUEGOS · MISIONES DIARIAS
--
--  Tres misiones por día (el día de Argentina, _sobres_hoy) que se cumplen
--  jugando y se cobran en V-Coins. El progreso NO se guarda aparte: se cuenta
--  de lo que ya registra la base (sobres_abiertos, vdraft_partidas), así no se
--  puede inflar desde el navegador. Lo único que se guarda es qué misión se
--  cobró (juegos_misiones_cobradas), para no cobrarla dos veces.
--
--    juegos_misiones(p_token)          → [{ id, titulo, meta, progreso, premio, cobrada }]
--    juegos_cobrar_mision(id, p_token) → { premio, puntos, misiones }
--
--  El superusuario no juega (_sobres_ctx no lo deja), así que no tiene misiones.
--  La de Penales se suma cuando la tanda pase a la base.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.juegos_misiones_cobradas (
  club_id    uuid not null,
  dueno      text not null,
  dia        date not null,
  mision     text not null,
  premio     int  not null,
  created_at timestamptz not null default now(),
  primary key (club_id, dueno, dia, mision)
);
alter table public.juegos_misiones_cobradas enable row level security;  -- sólo por las funciones
comment on table public.juegos_misiones_cobradas is 'Juegos: misiones diarias ya cobradas (una vez por día cada una).';

-- Las misiones del día con su progreso, para un dueño.
create or replace function public._juegos_misiones(p_club uuid, p_dueno text)
returns jsonb language sql stable security definer set search_path = public as $$
  with hoy as (select public._sobres_hoy() as d),
  prog as (
    select 'sobre'::text as id, 'Abrí 1 sobre'::text as titulo, 1 as meta, 25 as premio, 1 as orden,
           (select count(*) from public.sobres_abiertos s, hoy
             where s.club_id = p_club and s.dueno = p_dueno and s.dia = hoy.d)::int as progreso
    union all
    select 'vdraft_partido', 'Jugá 1 partido del V-Draft', 1, 25, 2,
           coalesce((select sum(jsonb_array_length(coalesce(v.partidos, '[]'::jsonb)))
                       from public.vdraft_partidas v, hoy
                      where v.club_id = p_club and v.dueno = p_dueno and v.dia = hoy.d), 0)::int
    union all
    select 'vdraft_victorias', 'Ganá 2 partidos del V-Draft', 2, 50, 3,
           coalesce((select sum(v.victorias) from public.vdraft_partidas v, hoy
                      where v.club_id = p_club and v.dueno = p_dueno and v.dia = hoy.d), 0)::int
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'titulo', p.titulo, 'meta', p.meta, 'premio', p.premio,
           'progreso', least(p.progreso, p.meta),
           'cobrada', exists (select 1 from public.juegos_misiones_cobradas c, hoy
                               where c.club_id = p_club and c.dueno = p_dueno and c.dia = hoy.d and c.mision = p.id))
         order by p.orden), '[]'::jsonb)
    from prog p
$$;

create or replace function public.juegos_misiones(p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  return public._juegos_misiones(c.o_club, c.o_dueno);
end
$$;

-- Cobrar una misión cumplida: suma las V-Coins una sola vez por día.
create or replace function public.juegos_cobrar_mision(p_mision text, p_token uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  m jsonb;
  v_puntos int;
begin
  select * into c from public._sobres_ctx(p_token);
  select x into m from jsonb_array_elements(public._juegos_misiones(c.o_club, c.o_dueno)) x where x ->> 'id' = p_mision;
  if m is null then raise exception 'juegos: esa misión no existe' using errcode = 'P0001'; end if;
  if (m ->> 'cobrada')::boolean then raise exception 'juegos: esa misión ya la cobraste hoy' using errcode = 'P0001'; end if;
  if (m ->> 'progreso')::int < (m ->> 'meta')::int then raise exception 'juegos: todavía no la cumpliste' using errcode = 'P0001'; end if;

  insert into public.juegos_misiones_cobradas (club_id, dueno, dia, mision, premio)
    values (c.o_club, c.o_dueno, public._sobres_hoy(), p_mision, (m ->> 'premio')::int);
  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
  update public.sobres_perfil set puntos = puntos + (m ->> 'premio')::int
   where club_id = c.o_club and dueno = c.o_dueno
   returning puntos into v_puntos;

  return jsonb_build_object('premio', (m ->> 'premio')::int, 'puntos', v_puntos,
                            'misiones', public._juegos_misiones(c.o_club, c.o_dueno));
end
$$;

revoke all on table public.juegos_misiones_cobradas from anon, authenticated;
revoke all on function public._juegos_misiones(uuid, text) from public, anon, authenticated;
grant execute on function public.juegos_misiones(uuid) to anon, authenticated;
grant execute on function public.juegos_cobrar_mision(text, uuid) to anon, authenticated;
