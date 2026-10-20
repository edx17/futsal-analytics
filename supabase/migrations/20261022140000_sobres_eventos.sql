-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: EVENTOS DE SOBRES
--
--  Un evento es un sobre propio, armado por el superusuario desde el Modo GOD:
--    nombre, fechas (opcionales) y si está activo;
--    cartas: las claves del catálogo que puede traer (sólo esas, y sólo las
--            activas); la media de cada una se corrige con cartas_ajustes
--            (la misma de siempre: se ve igual en sobres, colección y V-Draft);
--    sobre:  { cartas: 1-10, costo: V-Coins (0 = gratis), por_dia: 1-5 };
--    escena: la cinemática y los colores de la apertura
--            { video, video_alternativo, titulo, colores{...}, particulas, intensidad }.
--
--  Las cartas marcadas `exclusiva_evento` sólo salen en el sobre de su evento
--  (los demás sobres y el V-Draft las saltean).
--  El sorteo usa los MISMOS pesos por rareza que los demás sobres, pero sólo
--  entre las cartas del evento; una repetida da las V-Coins de siempre.
--  Cada apertura queda en sobres_abiertos (tipo 'evento', con su evento_id).
--
--  Leer: el staff del club (y los jugadores, a través de sobres_estado).
--  Escribir: sólo el superusuario. Va después de 20261022130000. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.sobres_eventos (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 60),
  activo      boolean not null default false,
  desde       date,
  hasta       date,
  cartas      text[] not null default '{}',
  sobre       jsonb not null default '{"cartas": 3, "costo": 0, "por_dia": 1}'::jsonb,
  escena      jsonb not null default '{}'::jsonb,
  creado_por  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sobres_eventos_club on public.sobres_eventos (club_id, activo);
comment on table public.sobres_eventos is 'MySquad: eventos de sobres (cartas propias, reglas y cinemática), armados desde el Modo GOD.';


-- Cartas exclusivas de evento: sólo salen en el sobre de su evento (no en los
-- demás sobres ni en el V-Draft). Quien ya la tiene la conserva igual.
alter table public.cartas_catalogo add column if not exists exclusiva_evento boolean not null default false;

alter table public.sobres_abiertos add column if not exists evento_id uuid references public.sobres_eventos(id) on delete set null;
alter table public.sobres_abiertos drop constraint if exists sobres_abiertos_tipo_check;
alter table public.sobres_abiertos add constraint sobres_abiertos_tipo_check
  check (tipo in ('diario', 'wellness', 'racha', 'puntos', 'mega', 'premio', 'premio_especial', 'evento'));

alter table public.sobres_eventos enable row level security;
drop policy if exists "Staff SELECT sobres_eventos" on public.sobres_eventos;
create policy "Staff SELECT sobres_eventos" on public.sobres_eventos for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin') and club_id::text = (select public.get_user_club_id())));
drop policy if exists "Superuser ALL sobres_eventos" on public.sobres_eventos;
create policy "Superuser ALL sobres_eventos" on public.sobres_eventos for all to authenticated
  using ((select public.get_user_rol()) = 'superuser') with check ((select public.get_user_rol()) = 'superuser');

-- Las reglas del sobre de un evento, siempre dentro de rango.
create or replace function public._evento_regla(e public.sobres_eventos, p_campo text, p_def int, p_min int, p_max int)
returns int language sql immutable as $$
  select least(p_max, greatest(p_min, coalesce(nullif(e.sobre ->> p_campo, '')::int, p_def)))
$$;

-- Los eventos que corren hoy para un dueño (lo que ve en Sobres).
create or replace function public._sobres_eventos_de(p_club uuid, p_dueno text, p_puntos int, p_hoy date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'nombre', e.nombre, 'escena', e.escena, 'desde', e.desde, 'hasta', e.hasta,
           'cartas', public._evento_regla(e, 'cartas', 3, 1, 10),
           'costo', public._evento_regla(e, 'costo', 0, 0, 5000),
           'por_dia', public._evento_regla(e, 'por_dia', 1, 1, 5),
           'abiertos_hoy', x.hoy,
           'total_cartas', x.total,
           'disponible', x.total > 0
                         and x.hoy < public._evento_regla(e, 'por_dia', 1, 1, 5)
                         and p_puntos >= public._evento_regla(e, 'costo', 0, 0, 5000))
         order by e.created_at), '[]'::jsonb)
    from public.sobres_eventos e
    cross join lateral (select
        (select count(*) from public.sobres_abiertos a
          where a.club_id = p_club and a.dueno = p_dueno and a.evento_id = e.id and a.dia = p_hoy) as hoy,
        (select count(*) from public.cartas_catalogo k
          where k.club_id = p_club and k.activa and k.clave = any (e.cartas)) as total) x
   where e.club_id = p_club and e.activo
     and (e.desde is null or e.desde <= p_hoy) and (e.hasta is null or e.hasta >= p_hoy)
$$;
revoke all on function public._sobres_eventos_de(uuid, text, int, date) from public, anon, authenticated;

-- El estado de los sobres, ahora con los eventos que corren hoy.
create or replace function public.sobres_estado(p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_diario boolean; v_wellness boolean; v_racha boolean;
  v_tiene int; v_total int; v_especiales int;
  cfg public.sobres_config;
  v_sus text[];
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno;
  select * into cfg from public.sobres_config where club_id = c.o_club;
  v_sus := coalesce(cfg.suspendidos, '{}');

  v_diario := not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'diario' and dia = v_hoy);
  v_wellness := public._sobres_wellness_hoy(c.o_jugador) and not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'wellness' and dia = v_hoy);
  v_racha := coalesce(p.premio_racha_dia = v_hoy, false) and not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'racha' and dia = v_hoy);

  select count(*) into v_tiene from public.cartas_coleccion where club_id = c.o_club and dueno = c.o_dueno;
  select count(*) into v_total from public.cartas_catalogo where club_id = c.o_club and activa and not exclusiva_evento;
  select count(*) into v_especiales from public.cartas_catalogo
   where club_id = c.o_club and activa and not exclusiva_evento and rareza in ('totw', 'potw', 'totm', 'potm', 'toty');

  return jsonb_build_object(
    'hoy', v_hoy,
    'puntos', coalesce(p.puntos, 0),
    'racha', coalesce(p.racha, 0),
    'costo_puntos', 50,
    'costo_mega', 500,
    'cartas_tengo', v_tiene,
    'cartas_total', v_total,
    'cartas_especiales', v_especiales,
    'sobres_premio', coalesce(p.sobres_premio, 0),
    'sobres_especiales', coalesce(p.sobres_especiales, 0),
    'es_staff', c.o_jugador is null,
    'disponibles', jsonb_build_object(
      'diario', v_diario and not 'diario' = any (v_sus),
      'wellness', v_wellness and not 'wellness' = any (v_sus),
      'racha', v_racha and not 'racha' = any (v_sus),
      'puntos', coalesce(p.puntos, 0) >= 50 and v_total > 0 and not 'puntos' = any (v_sus),
      'mega', coalesce(p.puntos, 0) >= 500 and v_especiales > 0 and not 'mega' = any (v_sus),
      'premio', coalesce(p.sobres_premio, 0) > 0 and v_total > 0 and not 'premio' = any (v_sus),
      'premio_especial', coalesce(p.sobres_especiales, 0) > 0 and v_especiales > 0 and not 'premio_especial' = any (v_sus)),
    'suspendidos', to_jsonb(v_sus),
    'evento', cfg.evento_activo,
    'eventos', public._sobres_eventos_de(c.o_club, c.o_dueno, coalesce(p.puntos, 0), v_hoy),
    'es_superuser', c.o_jugador is null and (select public.get_user_rol()) = 'superuser',
    'wellness_hecho', public._sobres_wellness_hoy(c.o_jugador)
  );
end
$$;

-- Abrir el sobre de un evento: las reglas del evento y el sorteo de siempre,
-- sólo entre sus cartas activas.
create or replace function public.sobres_abrir_evento(p_evento uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  e public.sobres_eventos;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_cantidad int;
  v_costo int;
  v_por_dia int;
  v_ids uuid[] := '{}';
  v_rareza text;
  v_tirada double precision;
  k public.cartas_catalogo;
  v_tiene boolean;
  v_pts int;
  v_ganados int := 0;
  v_cartas jsonb := '[]'::jsonb;
  v_sobre uuid := gen_random_uuid();
  i int;
begin
  select * into c from public._sobres_ctx(p_token);

  select * into e from public.sobres_eventos where id = p_evento and club_id = c.o_club;
  if not found or not e.activo
     or (e.desde is not null and e.desde > v_hoy) or (e.hasta is not null and e.hasta < v_hoy) then
    raise exception 'sobres: ese evento no está activo' using errcode = 'P0001';
  end if;

  v_cantidad := public._evento_regla(e, 'cartas', 3, 1, 10);
  v_costo := public._evento_regla(e, 'costo', 0, 0, 5000);
  v_por_dia := public._evento_regla(e, 'por_dia', 1, 1, 5);

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
  select * into p from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;

  if (select count(*) from public.sobres_abiertos
       where club_id = c.o_club and dueno = c.o_dueno and evento_id = e.id and dia = v_hoy) >= v_por_dia then
    raise exception 'sobres: ya abriste los sobres de este evento hoy' using errcode = 'P0001';
  end if;
  if v_costo > 0 and p.puntos < v_costo then
    raise exception 'sobres: te faltan V-Coins (hacen falta %)', v_costo using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.cartas_catalogo
                  where club_id = c.o_club and activa and clave = any (e.cartas)) then
    raise exception 'sobres: el evento todavía no tiene cartas' using errcode = 'P0001';
  end if;

  for i in 1..v_cantidad loop
    v_tirada := random();
    with pesos(rareza, peso, orden) as (values
      ('bronce', 42.0, 1), ('plata', 30.0, 2), ('oro', 15.0, 3), ('totw', 5.0, 4),
      ('potw', 3.0, 5), ('totm', 2.5, 6), ('potm', 1.5, 7), ('toty', 1.0, 8)),
    disp as (
      select pe.rareza, pe.peso, pe.orden from pesos pe
       where exists (select 1 from public.cartas_catalogo x
                      where x.club_id = c.o_club and x.activa and x.clave = any (e.cartas)
                        and x.rareza = pe.rareza and not (x.id = any (v_ids)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza from acum a where a.hasta > v_tirada * a.total order by a.hasta limit 1;

    exit when v_rareza is null;

    select * into k from public.cartas_catalogo
     where club_id = c.o_club and activa and clave = any (e.cartas) and rareza = v_rareza and not (id = any (v_ids))
     order by random() limit 1;
    exit when not found;
    v_ids := v_ids || k.id;

    v_tiene := exists (select 1 from public.cartas_coleccion
                        where club_id = c.o_club and dueno = c.o_dueno and catalogo_id = k.id);
    v_pts := case when v_tiene then public._sobres_puntos(k.rareza) else 0 end;
    v_ganados := v_ganados + v_pts;
    v_cartas := v_cartas || jsonb_build_array(jsonb_build_object(
      'catalogo_id', k.id, 'rareza', k.rareza, 'tipo', k.tipo, 'carta', public._sobres_carta(k),
      'nueva', not v_tiene, 'puntos', v_pts));
  end loop;

  insert into public.sobres_abiertos (id, club_id, dueno, tipo, dia, cartas, puntos_ganados, evento_id)
    values (v_sobre, c.o_club, c.o_dueno, 'evento', v_hoy, v_cartas, v_ganados, e.id);

  insert into public.cartas_coleccion (club_id, dueno, catalogo_id, sobre_id)
    select c.o_club, c.o_dueno, (x ->> 'catalogo_id')::uuid, v_sobre
      from jsonb_array_elements(v_cartas) x where (x ->> 'nueva')::boolean
    on conflict do nothing;

  update public.sobres_perfil set puntos = puntos + v_ganados - v_costo
   where club_id = c.o_club and dueno = c.o_dueno;

  return jsonb_build_object('sobre_id', v_sobre, 'tipo', 'evento', 'cartas', v_cartas, 'puntos_ganados', v_ganados,
                            'evento', jsonb_build_object('id', e.id, 'nombre', e.nombre, 'escena', e.escena))
         || jsonb_build_object('estado', public.sobres_estado(p_token));
end
$$;

-- Los sobres de siempre y el V-Draft saltean las cartas exclusivas de evento.
create or replace function public.sobres_abrir(p_tipo text, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_cantidad int;
  v_costo int;
  v_especial boolean := p_tipo in ('mega', 'premio_especial');
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
  if p_tipo not in ('diario', 'wellness', 'racha', 'puntos', 'mega', 'premio', 'premio_especial') then
    raise exception 'sobres: tipo de sobre inválido' using errcode = '22023';
  end if;

  select * into c from public._sobres_ctx(p_token);

  if exists (select 1 from public.sobres_config where club_id = c.o_club and p_tipo = any (suspendidos)) then
    raise exception 'sobres: este sobre está suspendido por el club' using errcode = 'P0001';
  end if;

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno)
    on conflict do nothing;
  select * into p from public.sobres_perfil
   where club_id = c.o_club and dueno = c.o_dueno for update;

  if not exists (select 1 from public.cartas_catalogo where club_id = c.o_club and activa and not exclusiva_evento) then
    raise exception 'sobres: el club todavía no publicó cartas' using errcode = 'P0001';
  end if;

  v_costo := case p_tipo when 'puntos' then 50 when 'mega' then 500 else 0 end;

  if p_tipo in ('diario', 'wellness', 'racha') and exists (select 1 from public.sobres_abiertos
       where club_id = c.o_club and dueno = c.o_dueno and tipo = p_tipo and dia = v_hoy) then
    raise exception 'sobres: ya abriste este sobre hoy' using errcode = 'P0001';
  end if;
  if p_tipo = 'wellness' and not public._sobres_wellness_hoy(c.o_jugador) then
    raise exception 'sobres: completá el wellness de hoy para abrirlo' using errcode = 'P0001';
  end if;
  if p_tipo = 'racha' and coalesce(p.premio_racha_dia, date '1900-01-01') <> v_hoy then
    raise exception 'sobres: todavía no completaste la semana' using errcode = 'P0001';
  end if;
  if v_costo > 0 and p.puntos < v_costo then
    raise exception 'sobres: te faltan V-Coins (hacen falta %)', v_costo using errcode = 'P0001';
  end if;
  if p_tipo = 'premio' and p.sobres_premio < 1 then
    raise exception 'sobres: no tenés sobres de premio para abrir' using errcode = 'P0001';
  end if;
  if p_tipo = 'premio_especial' and p.sobres_especiales < 1 then
    raise exception 'sobres: no tenés sobres especiales para abrir' using errcode = 'P0001';
  end if;
  if v_especial and not exists (select 1 from public.cartas_catalogo
       where club_id = c.o_club and activa and not exclusiva_evento and rareza in ('totw', 'potw', 'totm', 'potm', 'toty')) then
    raise exception 'sobres: el club todavía no tiene cartas especiales' using errcode = 'P0001';
  end if;

  v_cantidad := case p_tipo when 'racha' then 4 when 'mega' then 10 when 'premio_especial' then 5 else 3 end;

  for i in 1..v_cantidad loop
    v_tirada := random();
    with pesos(rareza, peso, orden) as (values
      ('bronce', 42.0, 1), ('plata', 30.0, 2), ('oro', 15.0, 3), ('totw', 5.0, 4),
      ('potw', 3.0, 5), ('totm', 2.5, 6), ('potm', 1.5, 7), ('toty', 1.0, 8)),
    disp as (
      select pe.rareza, pe.peso, pe.orden from pesos pe
       where (not v_especial or pe.orden >= 4)
         and exists (select 1 from public.cartas_catalogo x
                      where x.club_id = c.o_club and x.activa and not x.exclusiva_evento and x.rareza = pe.rareza and not (x.id = any (v_ids)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza
      from acum a
     where a.hasta > v_tirada * a.total
     order by a.hasta limit 1;

    exit when v_rareza is null;

    select * into k from public.cartas_catalogo
     where club_id = c.o_club and activa and not exclusiva_evento and rareza = v_rareza and not (id = any (v_ids))
     order by random() limit 1;
    exit when not found;
    v_ids := v_ids || k.id;

    v_tiene := exists (select 1 from public.cartas_coleccion
                        where club_id = c.o_club and dueno = c.o_dueno and catalogo_id = k.id);
    v_pts := case when v_tiene then public._sobres_puntos(k.rareza) else 0 end;
    v_ganados := v_ganados + v_pts;
    v_cartas := v_cartas || jsonb_build_array(jsonb_build_object(
      'catalogo_id', k.id, 'rareza', k.rareza, 'tipo', k.tipo, 'carta', public._sobres_carta(k),
      'nueva', not v_tiene, 'puntos', v_pts));
  end loop;

  insert into public.sobres_abiertos (id, club_id, dueno, tipo, dia, cartas, puntos_ganados)
    values (v_sobre, c.o_club, c.o_dueno, p_tipo, v_hoy, v_cartas, v_ganados);

  insert into public.cartas_coleccion (club_id, dueno, catalogo_id, sobre_id)
    select c.o_club, c.o_dueno, (x ->> 'catalogo_id')::uuid, v_sobre
      from jsonb_array_elements(v_cartas) x
     where (x ->> 'nueva')::boolean
    on conflict do nothing;

  update public.sobres_perfil
     set puntos = puntos + v_ganados - v_costo,
         sobres_premio = sobres_premio - case when p_tipo = 'premio' then 1 else 0 end,
         sobres_especiales = sobres_especiales - case when p_tipo = 'premio_especial' then 1 else 0 end
   where club_id = c.o_club and dueno = c.o_dueno;

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

create or replace function public._vdraft_oferta(p_club uuid, p_n int, p_roles text[], p_excluir text[],
                                                p_tipo text, p_campo boolean)
returns jsonb language sql volatile security definer set search_path = public as $$
  select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select c from (
      select distinct on (k.jugador_id) public._vdraft_carta(k) as c
        from public.cartas_catalogo k
       where k.club_id = p_club and k.activa and not k.exclusiva_evento
         and (p_roles is null or k.carta ->> 'rol' = any (p_roles))
         and not (k.jugador_id = any (coalesce(p_excluir, '{}')))
         and (p_tipo = 'todas'
              or (p_tipo = 'especial' and k.rareza in ('totw', 'potw', 'totm', 'potm', 'toty'))
              or (p_tipo = 'base' and k.rareza in ('bronce', 'plata', 'oro')))
         and (not p_campo or coalesce(k.carta ->> 'rol', '') <> 'ARQ')
       order by k.jugador_id, random()
    ) d order by random() limit greatest(p_n, 0)
  ) x
$$;

revoke all on function public._evento_regla(public.sobres_eventos, text, int, int, int) from public, anon, authenticated;
grant execute on function public.sobres_abrir_evento(uuid, uuid) to anon, authenticated;
grant execute on function public.sobres_estado(uuid) to anon, authenticated;
revoke all on function public._vdraft_oferta(uuid, int, text[], text[], text, boolean) from public, anon, authenticated;
grant execute on function public.sobres_abrir(text, uuid) to anon, authenticated;
