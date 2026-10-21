-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: CADA SOBRE, EDITABLE DESDE EL MODO GOD
--
--  sobres_config.tipos guarda, por tipo de sobre (diario, wellness, racha,
--  puntos, mega, premio, premio_especial), lo que el superusuario cambió:
--    nombre, ayuda          la presentación (vacío = la de siempre);
--    cartas                 cuántas trae (1-10);
--    costo                  V-Coins (sólo 'puntos' y 'mega'; 0-5000);
--    rarezas                qué rarezas pueden salir (vacío = las de siempre:
--                           todas, o sólo las especiales en mega y
--                           premio_especial);
--    pesos                  { rareza: peso } para cambiar la chance de una
--                           rareza (0 = no sale); las que no están, la de siempre;
--    incluidas              claves del catálogo: si hay alguna, el sobre trae
--                           SÓLO esas (y puede traer exclusivas de evento);
--    escena                 cinemática y colores de la apertura
--                           { video, titulo, colores{...}, particulas, intensidad }.
--  Lo que no está, o está fuera de rango, toma el valor de siempre.
--
--  sobres_abrir y sobres_estado leen esto; el espejo en JS es
--  src/analytics/tiposSobre.js. Va después de 20261022140000. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.sobres_config add column if not exists tipos jsonb not null default '{}'::jsonb;
comment on column public.sobres_config.tipos is 'MySquad: cada sobre editado en el Modo GOD (presentación, cartas, rarezas, pesos, escena).';

-- Un número de la config de un tipo, siempre dentro de rango.
create or replace function public._sobres_tipo_num(p_cfg jsonb, p_campo text, p_def int, p_min int, p_max int)
returns int language sql immutable as $$
  select least(p_max, greatest(p_min, coalesce(
    case when jsonb_typeof(p_cfg -> p_campo) = 'number' then round((p_cfg ->> p_campo)::numeric)::int end, p_def)))
$$;

-- Las reglas efectivas de un tipo de sobre para un club.
create or replace function public._sobres_tipo_reglas(p_club uuid, p_tipo text,
  out cantidad int, out costo int, out rarezas text[], out incluidas text[], out pesos jsonb, out cfg jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_todas text[] := array['bronce', 'plata', 'oro', 'totw', 'potw', 'totm', 'potm', 'toty'];
  v_def text[];
begin
  select coalesce(s.tipos -> p_tipo, '{}'::jsonb) into cfg from public.sobres_config s where s.club_id = p_club;
  cfg := coalesce(cfg, '{}'::jsonb);
  if jsonb_typeof(cfg) <> 'object' then cfg := '{}'::jsonb; end if;

  cantidad := public._sobres_tipo_num(cfg, 'cartas',
    case p_tipo when 'racha' then 4 when 'mega' then 10 when 'premio_especial' then 5 else 3 end, 1, 10);
  costo := case p_tipo
    when 'puntos' then public._sobres_tipo_num(cfg, 'costo', 50, 0, 5000)
    when 'mega' then public._sobres_tipo_num(cfg, 'costo', 500, 0, 5000)
    else 0 end;

  v_def := case when p_tipo in ('mega', 'premio_especial') then array['totw', 'potw', 'totm', 'potm', 'toty'] else v_todas end;
  if jsonb_typeof(cfg -> 'rarezas') = 'array' then
    select coalesce(array_agg(r), '{}') into rarezas
      from jsonb_array_elements_text(cfg -> 'rarezas') r where r = any (v_todas);
  end if;
  if coalesce(cardinality(rarezas), 0) = 0 then rarezas := v_def; end if;

  incluidas := '{}';
  if jsonb_typeof(cfg -> 'incluidas') = 'array' then
    select coalesce(array_agg(x), '{}') into incluidas from jsonb_array_elements_text(cfg -> 'incluidas') x;
  end if;

  pesos := case when jsonb_typeof(cfg -> 'pesos') = 'object' then cfg -> 'pesos' else '{}'::jsonb end;
end
$$;

-- ¿Esta carta puede salir en este sobre? Con `incluidas`, sólo esas (exclusivas de evento también);
-- sin, todas las activas que no son exclusivas de un evento.
create or replace function public._sobres_elegible(k public.cartas_catalogo, p_rarezas text[], p_incluidas text[])
returns boolean language sql immutable as $$
  select k.activa and k.rareza = any (p_rarezas)
     and case when cardinality(p_incluidas) > 0 then k.clave = any (p_incluidas) else not k.exclusiva_evento end
$$;

-- El peso de una rareza en un sobre: el de la config (0-100) o el de siempre.
create or replace function public._sobres_peso(p_pesos jsonb, p_rareza text, p_def numeric)
returns numeric language sql immutable as $$
  select least(100, greatest(0, coalesce(
    case when jsonb_typeof(p_pesos -> p_rareza) = 'number' then (p_pesos ->> p_rareza)::numeric end, p_def)))
$$;

-- El estado de los sobres, con las reglas de cada tipo del club.
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
  t text;
  r record;
  v_n int;
  v_tipos jsonb := '{}'::jsonb;
  v_puntos int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno;
  select * into cfg from public.sobres_config where club_id = c.o_club;
  v_sus := coalesce(cfg.suspendidos, '{}');
  v_puntos := coalesce(p.puntos, 0);

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

  -- Cada tipo: sus reglas y cuántas cartas pueden salir en él.
  foreach t in array array['diario', 'wellness', 'racha', 'puntos', 'mega', 'premio', 'premio_especial'] loop
    select * into r from public._sobres_tipo_reglas(c.o_club, t);
    select count(*) into v_n from public.cartas_catalogo k
     where k.club_id = c.o_club and public._sobres_elegible(k, r.rarezas, r.incluidas)
       and public._sobres_peso(r.pesos, k.rareza, 1) > 0;
    v_tipos := v_tipos || jsonb_build_object(t, jsonb_build_object(
      'nombre', nullif(trim(coalesce(r.cfg ->> 'nombre', '')), ''),
      'ayuda', nullif(trim(coalesce(r.cfg ->> 'ayuda', '')), ''),
      'cartas', r.cantidad, 'costo', r.costo,
      'rarezas', to_jsonb(r.rarezas), 'pesos', r.pesos,
      'con_lista', cardinality(r.incluidas) > 0,
      'total_cartas', v_n,
      'escena', case when jsonb_typeof(r.cfg -> 'escena') = 'object' then r.cfg -> 'escena' else null end));
  end loop;

  return jsonb_build_object(
    'hoy', v_hoy,
    'puntos', v_puntos,
    'racha', coalesce(p.racha, 0),
    'costo_puntos', (v_tipos -> 'puntos' ->> 'costo')::int,
    'costo_mega', (v_tipos -> 'mega' ->> 'costo')::int,
    'cartas_tengo', v_tiene,
    'cartas_total', v_total,
    'cartas_especiales', v_especiales,
    'sobres_premio', coalesce(p.sobres_premio, 0),
    'sobres_especiales', coalesce(p.sobres_especiales, 0),
    'es_staff', c.o_jugador is null,
    'disponibles', jsonb_build_object(
      'diario', v_diario and (v_tipos -> 'diario' ->> 'total_cartas')::int > 0 and not 'diario' = any (v_sus),
      'wellness', v_wellness and (v_tipos -> 'wellness' ->> 'total_cartas')::int > 0 and not 'wellness' = any (v_sus),
      'racha', v_racha and (v_tipos -> 'racha' ->> 'total_cartas')::int > 0 and not 'racha' = any (v_sus),
      'puntos', v_puntos >= (v_tipos -> 'puntos' ->> 'costo')::int and (v_tipos -> 'puntos' ->> 'total_cartas')::int > 0
                and not 'puntos' = any (v_sus),
      'mega', v_puntos >= (v_tipos -> 'mega' ->> 'costo')::int and (v_tipos -> 'mega' ->> 'total_cartas')::int > 0
              and not 'mega' = any (v_sus),
      'premio', coalesce(p.sobres_premio, 0) > 0 and (v_tipos -> 'premio' ->> 'total_cartas')::int > 0 and not 'premio' = any (v_sus),
      'premio_especial', coalesce(p.sobres_especiales, 0) > 0 and (v_tipos -> 'premio_especial' ->> 'total_cartas')::int > 0
                         and not 'premio_especial' = any (v_sus)),
    'tipos', v_tipos,
    'suspendidos', to_jsonb(v_sus),
    'evento', cfg.evento_activo,
    'eventos', public._sobres_eventos_de(c.o_club, c.o_dueno, v_puntos, v_hoy),
    'es_superuser', c.o_jugador is null and (select public.get_user_rol()) = 'superuser',
    'wellness_hecho', public._sobres_wellness_hoy(c.o_jugador)
  );
end
$$;

-- Abrir un sobre: las reglas de su tipo (cantidad, costo, rarezas, pesos, cartas).
create or replace function public.sobres_abrir(p_tipo text, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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

  for i in 1..r.cantidad loop
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
                        and public._sobres_elegible(x, r.rarezas, r.incluidas))),
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

revoke all on function public._sobres_tipo_reglas(uuid, text) from public, anon, authenticated;
revoke all on function public._sobres_tipo_num(jsonb, text, int, int, int) from public, anon, authenticated;
revoke all on function public._sobres_elegible(public.cartas_catalogo, text[], text[]) from public, anon, authenticated;
revoke all on function public._sobres_peso(jsonb, text, numeric) from public, anon, authenticated;
grant execute on function public.sobres_estado(uuid) to anon, authenticated;
grant execute on function public.sobres_abrir(text, uuid) to anon, authenticated;
