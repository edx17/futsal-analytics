-- ═══════════════════════════════════════════════════════════════════════════
--  SOBRE DE WELLNESS: SIEMPRE UNA CARTA NUEVA
--
--  El sobre que se gana completando el wellness trae siempre al menos una
--  carta que el jugador todavía no tiene (la primera del sobre), para que el
--  desafío del wellness valga la pena todos los días. La rareza se sigue
--  sorteando con los pesos del sobre, pero sólo entre las rarezas donde le
--  quedan cartas por conseguir. Si ya tiene todas las del sobre, sale como
--  siempre (repetidas que dan V-Coins).
--
--  Recrea sobres_abrir cambiando SÓLO eso. Va después de
--  20261106120000_juegos_cuentas.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sobres_abrir(p_tipo text, p_token uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  r record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
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
  v_garantiza boolean := false;   -- el wellness trae una que no tiene (si le quedan)
  v_solo_nuevas boolean;
  i int;
begin
  if p_tipo not in ('diario', 'wellness', 'racha', 'puntos', 'mega', 'premio', 'premio_especial') then
    raise exception 'sobres: tipo de sobre inválido' using errcode = '22023';
  end if;

  select * into c from public._sobres_ctx(p_token);

  if exists (select 1 from public.sobres_config where club_id = c.o_club and p_tipo = any (suspendidos)) then
    raise exception 'sobres: este sobre está suspendido por el club' using errcode = 'P0001';
  end if;

  select * into r from public._sobres_tipo_reglas(c.o_club, p_tipo);

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno)
    on conflict do nothing;
  select * into p from public.sobres_perfil
   where club_id = c.o_club and dueno = c.o_dueno for update;

  if not exists (select 1 from public.cartas_catalogo x
                  where x.club_id = c.o_club and public._sobres_elegible(x, r.rarezas, r.incluidas)
                    and public._sobres_peso(r.pesos, x.rareza, 1) > 0) then
    raise exception 'sobres: este sobre todavía no tiene cartas' using errcode = 'P0001';
  end if;

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
  if r.costo > 0 and p.puntos < r.costo then
    raise exception 'sobres: te faltan V-Coins (hacen falta %)', r.costo using errcode = 'P0001';
  end if;
  if p_tipo = 'premio' and p.sobres_premio < 1 then
    raise exception 'sobres: no tenés sobres de premio para abrir' using errcode = 'P0001';
  end if;
  if p_tipo = 'premio_especial' and p.sobres_especiales < 1 then
    raise exception 'sobres: no tenés sobres especiales para abrir' using errcode = 'P0001';
  end if;

  -- ¿Le queda alguna carta por conseguir en este sobre?
  v_garantiza := p_tipo = 'wellness' and exists (
    select 1 from public.cartas_catalogo x
     where x.club_id = c.o_club and public._sobres_elegible(x, r.rarezas, r.incluidas)
       and public._sobres_peso(r.pesos, x.rareza, 1) > 0
       and not exists (select 1 from public.cartas_coleccion cc
                        where cc.club_id = c.o_club and cc.dueno = c.o_dueno and cc.catalogo_id = x.id));

  for i in 1..r.cantidad loop
    v_solo_nuevas := v_garantiza and i = 1;
    v_tirada := random();
    with base(rareza, peso, orden) as (values
      ('bronce', 42.0, 1), ('plata', 30.0, 2), ('oro', 15.0, 3), ('totw', 5.0, 4),
      ('potw', 3.0, 5), ('totm', 2.5, 6), ('potm', 1.5, 7), ('toty', 1.0, 8)),
    pesos as (
      select b.rareza, public._sobres_peso(r.pesos, b.rareza, b.peso) as peso, b.orden from base b),
    disp as (
      select pe.rareza, pe.peso, pe.orden from pesos pe
       where pe.peso > 0
         and exists (select 1 from public.cartas_catalogo x
                      where x.club_id = c.o_club and x.rareza = pe.rareza and not (x.id = any (v_ids))
                        and public._sobres_elegible(x, r.rarezas, r.incluidas)
                        and (not v_solo_nuevas or not exists (select 1 from public.cartas_coleccion cc
                              where cc.club_id = c.o_club and cc.dueno = c.o_dueno and cc.catalogo_id = x.id)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza
      from acum a
     where a.hasta > v_tirada * a.total
     order by a.hasta limit 1;

    exit when v_rareza is null;

    select * into k from public.cartas_catalogo x
     where x.club_id = c.o_club and x.rareza = v_rareza and not (x.id = any (v_ids))
       and public._sobres_elegible(x, r.rarezas, r.incluidas)
       and (not v_solo_nuevas or not exists (select 1 from public.cartas_coleccion cc
             where cc.club_id = c.o_club and cc.dueno = c.o_dueno and cc.catalogo_id = x.id))
     order by random() limit 1;
    exit when not found;
    v_ids := v_ids || k.id;

    v_tiene := exists (select 1 from public.cartas_coleccion
                        where club_id = c.o_club and dueno = c.o_dueno and catalogo_id = k.id);
    v_pts := case when v_tiene then round(public._sobres_puntos(k.rareza) * public._vcoins_factor(c.o_club))::int else 0 end;
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
     set puntos = puntos + v_ganados - r.costo,
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

grant execute on function public.sobres_abrir(text, uuid) to anon, authenticated;
