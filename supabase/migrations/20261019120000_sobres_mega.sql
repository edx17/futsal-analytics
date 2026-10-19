-- ═══════════════════════════════════════════════════════════════════════════
--  SOBRES: MEGA SOBRE ESPECIAL + V-COINS
--
--  · Los "puntos" que dan las cartas repetidas pasan a llamarse V-Coins. Es
--    sólo el nombre: la columna sigue siendo sobres_perfil.puntos.
--  · Mega Sobre (tipo 'mega'): 10 cartas, TODAS especiales (TOTW, POTW, TOTM,
--    POTM, TOTY), con los mismos pesos relativos que el sobre común. Cuesta
--    500 V-Coins y se puede abrir cuantas veces alcancen las V-Coins.
--    Si el club tiene menos de 10 especiales, trae las que haya (sin repetir
--    dentro del sobre, como siempre).
--
--  Parte de las funciones tal como están en producción (con _sobres_carta,
--  de 20261011160000_cartas_fotos_especiales.sql). Para cambiar costos o
--  cantidades, cambiar también src/analytics/sobres.js.
--
--  Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

do $mega$
begin
  if to_regprocedure('public._sobres_carta(public.cartas_catalogo)') is null then
    raise exception 'Falta correr antes 20261011160000_cartas_fotos_especiales.sql (_sobres_carta).';
  end if;
end
$mega$;

-- El tipo nuevo, y el mega (como el de V-Coins) no tiene límite por día.
alter table public.sobres_abiertos drop constraint if exists sobres_abiertos_tipo_check;
alter table public.sobres_abiertos add constraint sobres_abiertos_tipo_check
  check (tipo in ('diario', 'wellness', 'racha', 'puntos', 'mega'));

drop index if exists public.sobres_abiertos_uno_por_dia;
create unique index if not exists sobres_abiertos_uno_por_dia
  on public.sobres_abiertos (club_id, dueno, tipo, dia) where tipo not in ('puntos', 'mega');

create or replace function public.sobres_estado(p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_diario boolean; v_wellness boolean; v_racha boolean;
  v_tiene int; v_total int; v_especiales int;
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
  select count(*) into v_especiales from public.cartas_catalogo
   where club_id = c.o_club and rareza in ('totw', 'potw', 'totm', 'potm', 'toty');

  return jsonb_build_object(
    'hoy', v_hoy,
    'puntos', coalesce(p.puntos, 0),
    'racha', coalesce(p.racha, 0),
    'costo_puntos', 50,
    'costo_mega', 500,
    'cartas_tengo', v_tiene,
    'cartas_total', v_total,
    'cartas_especiales', v_especiales,
    'es_staff', c.o_jugador is null,
    'disponibles', jsonb_build_object(
      'diario', v_diario,
      'wellness', v_wellness,
      'racha', v_racha,
      'puntos', coalesce(p.puntos, 0) >= 50 and v_total > 0,
      'mega', coalesce(p.puntos, 0) >= 500 and v_especiales > 0),
    'wellness_hecho', public._sobres_wellness_hoy(c.o_jugador)
  );
end
$$;

create or replace function public.sobres_abrir(p_tipo text, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_cantidad int;
  v_costo int;
  v_especial boolean := p_tipo = 'mega';
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
  if p_tipo not in ('diario', 'wellness', 'racha', 'puntos', 'mega') then
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

  v_costo := case p_tipo when 'puntos' then 50 when 'mega' then 500 else 0 end;

  if p_tipo not in ('puntos', 'mega') and exists (select 1 from public.sobres_abiertos
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
  if v_especial and not exists (select 1 from public.cartas_catalogo
       where club_id = c.o_club and rareza in ('totw', 'potw', 'totm', 'potm', 'toty')) then
    raise exception 'sobres: el club todavía no tiene cartas especiales' using errcode = 'P0001';
  end if;

  v_cantidad := case p_tipo when 'racha' then 4 when 'mega' then 10 else 3 end;

  for i in 1..v_cantidad loop
    -- 1) la rareza, entre las que todavía tienen cartas para sacar en este sobre
    --    (en el mega, sólo las especiales: orden >= 4).
    --    Una sola tirada por lugar (random() dentro del WHERE se sortearía por fila).
    v_tirada := random();
    with pesos(rareza, peso, orden) as (values
      ('bronce', 42.0, 1), ('plata', 30.0, 2), ('oro', 15.0, 3), ('totw', 5.0, 4),
      ('potw', 3.0, 5), ('totm', 2.5, 6), ('potm', 1.5, 7), ('toty', 1.0, 8)),
    disp as (
      select pe.rareza, pe.peso, pe.orden from pesos pe
       where (not v_especial or pe.orden >= 4)
         and exists (select 1 from public.cartas_catalogo x
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

    -- 3) nueva: va a la colección. Repetida: da V-Coins.
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

  -- V-Coins: se suman las repetidas y se resta lo que costó el sobre
  update public.sobres_perfil
     set puntos = puntos + v_ganados - v_costo
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

grant execute on function public.sobres_estado(uuid)      to anon, authenticated;
grant execute on function public.sobres_abrir(text, uuid) to anon, authenticated;
