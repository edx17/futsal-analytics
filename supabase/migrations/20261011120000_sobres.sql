-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: SOBRES DE CARTAS
--
--  Cada jugador (con su PIN del Kiosco) y cada integrante del cuerpo técnico
--  (con su cuenta de VirtualClub) abre sobres con cartas del plantel:
--    · diario     1 por día. No se acumula: si no se abre hoy, se pierde.
--    · wellness   1 por día, si hoy completó el wellness. Tampoco se acumula.
--    · racha      1 cada 7 días seguidos entrando (se abre el día que se completa).
--    · puntos     sobre extra que se paga con los puntos de las cartas repetidas.
--  Una carta que ya tenías no se suma a la colección: da puntos.
--
--  EL SORTEO CORRE ACÁ, no en el teléfono. El navegador sólo pide "abrir un
--  sobre" y la base decide si corresponde, qué sale y qué queda guardado. El
--  día se cuenta en hora de Argentina (UTC-3), no con el reloj del teléfono.
--
--  Quién puede qué
--    · cartas_catalogo   el staff del club (ct, manager, admin) la publica
--                        desde MySquad; superuser, todo. El Kiosco no la lee
--                        directo: la ve a través de las funciones.
--    · el resto de las tablas no tiene políticas: sólo las tocan las funciones.
--
--  Para cambiar las probabilidades o los puntos hay que cambiar también
--  src/analytics/sobres.js (es el espejo que muestra la app).
--
--  Es idempotente: se puede correr por arriba de un intento anterior.
-- ═══════════════════════════════════════════════════════════════════════════

do $sobres$
begin
  if to_regprocedure('public.get_user_rol()') is null
     or to_regprocedure('public.get_user_club_id()') is null then
    raise exception
      'Faltan las funciones get_user_rol() / get_user_club_id(), que son las que usan las políticas del resto de las tablas.';
  end if;
  if to_regclass('public.kiosco_sesiones') is null then
    raise exception
      'Falta la tabla kiosco_sesiones (migración 20260924120000_kiosco_ficha_jugador.sql).';
  end if;
end
$sobres$;

-- ── TABLAS ──────────────────────────────────────────────────────────────────

create table if not exists public.cartas_catalogo (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubes(id) on delete cascade,
  clave          text not null,
  jugador_id     text not null,
  tipo           text not null check (tipo in ('BASE', 'POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY')),
  rareza         text not null check (rareza in ('bronce', 'plata', 'oro', 'totw', 'potw', 'totm', 'potm', 'toty')),
  carta          jsonb not null,
  actualizada_at timestamptz not null default now(),
  constraint cartas_catalogo_unica unique (club_id, clave)
);

create table if not exists public.sobres_perfil (
  club_id          uuid not null references public.clubes(id) on delete cascade,
  dueno            text not null,            -- 'j:<jugador>' (Kiosco) o 'u:<usuario>' (staff)
  puntos           integer not null default 0 check (puntos >= 0),
  racha            integer not null default 0,
  ultima_visita    date,
  premio_racha_dia date,                     -- el día en que completó la semana
  primary key (club_id, dueno)
);

create table if not exists public.sobres_abiertos (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubes(id) on delete cascade,
  dueno          text not null,
  tipo           text not null check (tipo in ('diario', 'wellness', 'racha', 'puntos')),
  dia            date not null,
  cartas         jsonb not null default '[]'::jsonb,
  puntos_ganados integer not null default 0,
  created_at     timestamptz not null default now()
);
-- Un sobre por tipo y por día, salvo los que se pagan con puntos.
create unique index if not exists sobres_abiertos_uno_por_dia
  on public.sobres_abiertos (club_id, dueno, tipo, dia) where tipo <> 'puntos';

create table if not exists public.cartas_coleccion (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  dueno       text not null,
  catalogo_id uuid not null references public.cartas_catalogo(id) on delete cascade,
  sobre_id    uuid references public.sobres_abiertos(id) on delete set null,
  obtenida_at timestamptz not null default now(),
  constraint cartas_coleccion_unica unique (club_id, dueno, catalogo_id)   -- una sola vez cada carta
);
create index if not exists cartas_coleccion_dueno on public.cartas_coleccion (club_id, dueno);

alter table public.cartas_catalogo enable row level security;
alter table public.sobres_perfil   enable row level security;
alter table public.sobres_abiertos enable row level security;
alter table public.cartas_coleccion enable row level security;

drop policy if exists "Staff ALL cartas_catalogo" on public.cartas_catalogo;
create policy "Staff ALL cartas_catalogo" on public.cartas_catalogo
  for all to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
             and club_id::text = (select public.get_user_club_id())))
  with check ((select public.get_user_rol()) = 'superuser'
              or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
                  and club_id::text = (select public.get_user_club_id())));

-- ── FUNCIONES ───────────────────────────────────────────────────────────────

-- Quién pide: con token es un jugador del Kiosco; sin token, el staff logueado.
create or replace function public._sobres_ctx(p_token uuid)
returns table (o_club uuid, o_dueno text, o_jugador text)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.kiosco_sesiones;
  v_club text;
begin
  if p_token is not null then
    select * into s from public.kiosco_sesiones where token = p_token and expira_at > now();
    if not found then
      raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
    end if;
    return query select s.club_id::uuid, 'j:' || s.jugador_id, s.jugador_id;
    return;
  end if;

  v_club := (select public.get_user_club_id());
  if auth.uid() is null or v_club is null
     or (select public.get_user_rol()) not in ('ct', 'manager', 'admin') then
    raise exception 'sobres: sin permiso' using errcode = '42501';
  end if;
  return query select v_club::uuid, 'u:' || auth.uid()::text, null::text;
end
$$;

-- Los puntos que da una carta repetida, según su rareza.
create or replace function public._sobres_puntos(p_rareza text)
returns integer language sql immutable as $$
  select case p_rareza
    when 'bronce' then 5 when 'plata' then 10 when 'oro' then 25
    when 'totw' then 40 when 'potw' then 50 when 'totm' then 60
    when 'potm' then 75 when 'toty' then 100 else 5 end
$$;

create or replace function public._sobres_hoy()
returns date language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

-- ¿Completó el wellness hoy? (si la tabla o la columna cambian, no rompe: dice que no)
create or replace function public._sobres_wellness_hoy(p_jugador text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_jugador is null then return false; end if;
  return exists (select 1 from public.wellness w
                  where w.jugador_id::text = p_jugador
                    and left(w.fecha::text, 10) = public._sobres_hoy()::text);
exception when others then
  return false;
end
$$;

-- Cómo está hoy: qué sobres puede abrir, puntos, racha, cuántas cartas tiene.
create or replace function public.sobres_estado(p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_diario boolean; v_wellness boolean; v_racha boolean;
  v_tiene int; v_total int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno;

  v_diario := not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'diario' and dia = v_hoy);
  v_wellness := public._sobres_wellness_hoy(c.o_jugador) and not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'wellness' and dia = v_hoy);
  v_racha := coalesce(p.premio_racha_dia = v_hoy, false) and not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'racha' and dia = v_hoy);

  select count(*) into v_tiene from public.cartas_coleccion where club_id = c.o_club and dueno = c.o_dueno;
  select count(*) into v_total from public.cartas_catalogo where club_id = c.o_club;

  return jsonb_build_object(
    'hoy', v_hoy,
    'puntos', coalesce(p.puntos, 0),
    'racha', coalesce(p.racha, 0),
    'costo_puntos', 50,
    'cartas_tengo', v_tiene,
    'cartas_total', v_total,
    'es_staff', c.o_jugador is null,
    'disponibles', jsonb_build_object(
      'diario', v_diario,
      'wellness', v_wellness,
      'racha', v_racha,
      'puntos', coalesce(p.puntos, 0) >= 50 and v_total > 0),
    'wellness_hecho', public._sobres_wellness_hoy(c.o_jugador)
  );
end
$$;

-- Abre un sobre. Valida todo acá: el teléfono no decide nada.
create or replace function public.sobres_abrir(p_tipo text, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_cantidad int;
  v_ids uuid[] := '{}';
  v_rareza text;
  v_tirada double precision;
  k public.cartas_catalogo;
  v_tiene boolean;
  v_pts int;
  v_ganados int := 0;
  v_cartas jsonb := '[]'::jsonb;
  v_sobre uuid := gen_random_uuid();
  v_racha int;
  i int;
begin
  if p_tipo not in ('diario', 'wellness', 'racha', 'puntos') then
    raise exception 'sobres: tipo de sobre inválido' using errcode = '22023';
  end if;

  select * into c from public._sobres_ctx(p_token);

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno)
    on conflict do nothing;
  -- Bloquea la fila: dos pedidos a la vez no pasan los dos.
  select * into p from public.sobres_perfil
   where club_id = c.o_club and dueno = c.o_dueno for update;

  if not exists (select 1 from public.cartas_catalogo where club_id = c.o_club) then
    raise exception 'sobres: el club todavía no publicó cartas' using errcode = 'P0001';
  end if;

  if p_tipo <> 'puntos' and exists (select 1 from public.sobres_abiertos
       where club_id = c.o_club and dueno = c.o_dueno and tipo = p_tipo and dia = v_hoy) then
    raise exception 'sobres: ya abriste este sobre hoy' using errcode = 'P0001';
  end if;
  if p_tipo = 'wellness' and not public._sobres_wellness_hoy(c.o_jugador) then
    raise exception 'sobres: completá el wellness de hoy para abrirlo' using errcode = 'P0001';
  end if;
  if p_tipo = 'racha' and coalesce(p.premio_racha_dia, date '1900-01-01') <> v_hoy then
    raise exception 'sobres: todavía no completaste la semana' using errcode = 'P0001';
  end if;
  if p_tipo = 'puntos' and p.puntos < 50 then
    raise exception 'sobres: te faltan puntos (hacen falta 50)' using errcode = 'P0001';
  end if;

  v_cantidad := case when p_tipo = 'racha' then 4 else 3 end;

  for i in 1..v_cantidad loop
    -- 1) la rareza, entre las que todavía tienen cartas para sacar en este sobre.
    --    Una sola tirada por lugar (random() dentro del WHERE se sortearía por fila).
    v_tirada := random();
    with pesos(rareza, peso, orden) as (values
      ('bronce', 42.0, 1), ('plata', 30.0, 2), ('oro', 15.0, 3), ('totw', 5.0, 4),
      ('potw', 3.0, 5), ('totm', 2.5, 6), ('potm', 1.5, 7), ('toty', 1.0, 8)),
    disp as (
      select pe.rareza, pe.peso, pe.orden from pesos pe
       where exists (select 1 from public.cartas_catalogo x
                      where x.club_id = c.o_club and x.rareza = pe.rareza and not (x.id = any (v_ids)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza
      from acum a
     where a.hasta > v_tirada * a.total
     order by a.hasta limit 1;

    exit when v_rareza is null;

    -- 2) una carta de esa rareza
    select * into k from public.cartas_catalogo
     where club_id = c.o_club and rareza = v_rareza and not (id = any (v_ids))
     order by random() limit 1;
    exit when not found;
    v_ids := v_ids || k.id;

    -- 3) nueva: va a la colección. Repetida: da puntos.
    v_tiene := exists (select 1 from public.cartas_coleccion
                        where club_id = c.o_club and dueno = c.o_dueno and catalogo_id = k.id);
    v_pts := case when v_tiene then public._sobres_puntos(k.rareza) else 0 end;
    v_ganados := v_ganados + v_pts;
    v_cartas := v_cartas || jsonb_build_array(jsonb_build_object(
      'catalogo_id', k.id, 'rareza', k.rareza, 'tipo', k.tipo, 'carta', k.carta,
      'nueva', not v_tiene, 'puntos', v_pts));
  end loop;

  insert into public.sobres_abiertos (id, club_id, dueno, tipo, dia, cartas, puntos_ganados)
    values (v_sobre, c.o_club, c.o_dueno, p_tipo, v_hoy, v_cartas, v_ganados);

  insert into public.cartas_coleccion (club_id, dueno, catalogo_id, sobre_id)
    select c.o_club, c.o_dueno, (x ->> 'catalogo_id')::uuid, v_sobre
      from jsonb_array_elements(v_cartas) x
     where (x ->> 'nueva')::boolean
    on conflict do nothing;

  -- puntos: se suman las repetidas y, si el sobre se pagó con puntos, se restan 50
  update public.sobres_perfil
     set puntos = puntos + v_ganados - case when p_tipo = 'puntos' then 50 else 0 end
   where club_id = c.o_club and dueno = c.o_dueno;

  -- racha: el sobre diario es "la visita del día"
  if p_tipo = 'diario' then
    v_racha := case
      when p.ultima_visita = v_hoy - 1 then p.racha + 1
      else 1 end;
    if v_racha >= 7 then
      update public.sobres_perfil set racha = 0, ultima_visita = v_hoy, premio_racha_dia = v_hoy
       where club_id = c.o_club and dueno = c.o_dueno;
    else
      update public.sobres_perfil set racha = v_racha, ultima_visita = v_hoy
       where club_id = c.o_club and dueno = c.o_dueno;
    end if;
  end if;

  return jsonb_build_object('sobre_id', v_sobre, 'tipo', p_tipo, 'cartas', v_cartas, 'puntos_ganados', v_ganados)
         || jsonb_build_object('estado', public.sobres_estado(p_token));
end
$$;

-- La colección: cada carta que tiene, tal como se publicó.
create or replace function public.sobres_coleccion(p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  return jsonb_build_object(
    'cartas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'catalogo_id', k.id, 'rareza', k.rareza, 'tipo', k.tipo, 'clave', k.clave,
               'carta', k.carta, 'obtenida_at', cc.obtenida_at)
             order by cc.obtenida_at desc)
        from public.cartas_coleccion cc
        join public.cartas_catalogo k on k.id = cc.catalogo_id
       where cc.club_id = c.o_club and cc.dueno = c.o_dueno), '[]'::jsonb),
    'total', (select count(*) from public.cartas_catalogo where club_id = c.o_club),
    'por_rareza', coalesce((
      select jsonb_object_agg(r.rareza, jsonb_build_object('total', r.total, 'tengo', coalesce(t.tengo, 0)))
        from (select rareza, count(*) as total from public.cartas_catalogo where club_id = c.o_club group by rareza) r
        left join (select k.rareza, count(*) as tengo
                     from public.cartas_coleccion cc join public.cartas_catalogo k on k.id = cc.catalogo_id
                    where cc.club_id = c.o_club and cc.dueno = c.o_dueno group by k.rareza) t using (rareza)), '{}'::jsonb)
  );
end
$$;

-- Para PROBAR: el staff borra su propia colección, puntos y sobres de hoy y vuelve a empezar.
-- No sirve con el token de un jugador: un jugador no puede reiniciarse.
create or replace function public.sobres_reiniciar_prueba()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(null);
  delete from public.cartas_coleccion where club_id = c.o_club and dueno = c.o_dueno;
  delete from public.sobres_abiertos  where club_id = c.o_club and dueno = c.o_dueno;
  delete from public.sobres_perfil    where club_id = c.o_club and dueno = c.o_dueno;
end
$$;

revoke all on function public._sobres_ctx(uuid) from public, anon, authenticated;
revoke all on function public._sobres_wellness_hoy(text) from public, anon, authenticated;
grant execute on function public.sobres_estado(uuid)        to anon, authenticated;
grant execute on function public.sobres_abrir(text, uuid)   to anon, authenticated;
grant execute on function public.sobres_coleccion(uuid)     to anon, authenticated;
grant execute on function public.sobres_reiniciar_prueba()  to authenticated;
