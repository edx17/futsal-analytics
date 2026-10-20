-- ═══════════════════════════════════════════════════════════════════════════
--  V-DRAFT
--
--  Un draft con las cartas del club y un torneo contra equipos reales de la
--  liga, de la D a la A:
--    1. Formación (2-2, 1-2-1, 3-1, 4-0).
--    2. Capitán: 1 de 5 cartas especiales.
--    3. Arquero: 1 de 4 (2 comunes y 2 especiales, si hay).
--    4. Los lugares de campo: 1 de 4 cartas comunes (bronce, plata, oro) de su
--       puesto. Sólo el último lugar ("comodín") trae 1 especial entre las 4.
--    5. Banco: 2 suplentes comunes, 1 de 4 cada uno.
--    Así no se arma siempre un equipo de puros especiales.
--    6. Torneo: cuartos vs Primera D, semis vs C, final vs B y "campeón de
--       campeones" vs A. La fuerza del rival sale de su división y de cómo le
--       va en la tabla (liga_partidos). Perdés y se termina.
--
--  Entrada: 1 gratis por día; las demás, 100 V-Coins.
--  Premios: 1 victoria 25 V-Coins · 2: 75 · 3 (campeón): 150 + 1 sobre ·
--           4: 300 + 1 sobre especial (5 cartas especiales).
--  Los sobres ganados quedan en sobres_perfil y se abren en Sobres.
--
--  TODO CORRE ACÁ: las ofertas del draft, la simulación y los premios. El
--  teléfono sólo pide "elegí esta carta" o "jugá el partido".
--
--  Para cambiar números (costos, premios, fuerzas), cambiar también
--  src/analytics/vdraft.js (el espejo que muestra la app).
--
--  Requiere 20261011120000_sobres.sql, 20261011160000_cartas_fotos_especiales.sql
--  y 20261011120000_liga_afa.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

do $vd$
begin
  if to_regprocedure('public._sobres_ctx(uuid)') is null
     or to_regprocedure('public._sobres_carta(public.cartas_catalogo)') is null then
    raise exception 'Faltan las funciones de los sobres (20261011120000_sobres.sql y 20261011160000_cartas_fotos_especiales.sql).';
  end if;
  if to_regclass('public.liga_partidos') is null then
    raise exception 'Falta la tabla liga_partidos (20261011120000_liga_afa.sql).';
  end if;
end
$vd$;

-- ── SOBRES DE PREMIO ────────────────────────────────────────────────────────

alter table public.sobres_perfil add column if not exists sobres_premio integer not null default 0;
alter table public.sobres_perfil add column if not exists sobres_especiales integer not null default 0;

alter table public.sobres_abiertos drop constraint if exists sobres_abiertos_tipo_check;
alter table public.sobres_abiertos add constraint sobres_abiertos_tipo_check
  check (tipo in ('diario', 'wellness', 'racha', 'puntos', 'mega', 'premio', 'premio_especial'));

drop index if exists public.sobres_abiertos_uno_por_dia;
create unique index if not exists sobres_abiertos_uno_por_dia
  on public.sobres_abiertos (club_id, dueno, tipo, dia) where tipo in ('diario', 'wellness', 'racha');

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
    'sobres_premio', coalesce(p.sobres_premio, 0),
    'sobres_especiales', coalesce(p.sobres_especiales, 0),
    'es_staff', c.o_jugador is null,
    'disponibles', jsonb_build_object(
      'diario', v_diario,
      'wellness', v_wellness,
      'racha', v_racha,
      'puntos', coalesce(p.puntos, 0) >= 50 and v_total > 0,
      'mega', coalesce(p.puntos, 0) >= 500 and v_especiales > 0,
      'premio', coalesce(p.sobres_premio, 0) > 0 and v_total > 0,
      'premio_especial', coalesce(p.sobres_especiales, 0) > 0 and v_especiales > 0),
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

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno)
    on conflict do nothing;
  select * into p from public.sobres_perfil
   where club_id = c.o_club and dueno = c.o_dueno for update;

  if not exists (select 1 from public.cartas_catalogo where club_id = c.o_club) then
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
       where club_id = c.o_club and rareza in ('totw', 'potw', 'totm', 'potm', 'toty')) then
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
                      where x.club_id = c.o_club and x.rareza = pe.rareza and not (x.id = any (v_ids)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza
      from acum a
     where a.hasta > v_tirada * a.total
     order by a.hasta limit 1;

    exit when v_rareza is null;

    select * into k from public.cartas_catalogo
     where club_id = c.o_club and rareza = v_rareza and not (id = any (v_ids))
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

-- ── V-DRAFT: TABLA ──────────────────────────────────────────────────────────

create table if not exists public.vdraft_partidas (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  dueno       text not null,
  dia         date not null,
  paga        boolean not null default false,
  estado      text not null default 'draft' check (estado in ('draft', 'torneo', 'terminada')),
  formacion   text not null,
  lugares     jsonb not null,                     -- [{ roles: ['ARQ'] }, …] (5)
  equipo      jsonb not null default '[null,null,null,null,null]'::jsonb,
  banco       jsonb not null default '[]'::jsonb,
  capitan     uuid,
  paso        text not null default 'capitan',    -- 'capitan' | 'lugar' | 'banco' | 'listo'
  lugar_actual int,
  oferta      jsonb not null default '[]'::jsonb,
  rivales     jsonb not null default '[]'::jsonb,
  partidos    jsonb not null default '[]'::jsonb,
  victorias   int not null default 0,
  premio      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists vdraft_una_activa
  on public.vdraft_partidas (club_id, dueno) where estado <> 'terminada';
create index if not exists vdraft_club_dia on public.vdraft_partidas (club_id, dia);

alter table public.vdraft_partidas enable row level security;  -- sin políticas: sólo las funciones

-- ── V-DRAFT: AYUDANTES ──────────────────────────────────────────────────────

create or replace function public._vdraft_lugares(p_formacion text)
returns jsonb language sql immutable as $$
  select case p_formacion
    when '2-2'   then '[{"roles":["ARQ"]},{"roles":["CIE"]},{"roles":["CIE"]},{"roles":["PIV"]},{"roles":["PIV"]}]'
    when '1-2-1' then '[{"roles":["ARQ"]},{"roles":["CIE"]},{"roles":["ALA"]},{"roles":["ALA"]},{"roles":["PIV"]}]'
    when '3-1'   then '[{"roles":["ARQ"]},{"roles":["ALA"]},{"roles":["CIE"]},{"roles":["ALA"]},{"roles":["PIV"]}]'
    when '4-0'   then '[{"roles":["ARQ"]},{"roles":["ALA"]},{"roles":["CIE"]},{"roles":["CIE","ALA"]},{"roles":["ALA"]}]'
  end::jsonb
$$;

-- Una carta como la guarda el draft.
create or replace function public._vdraft_carta(k public.cartas_catalogo)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('catalogo_id', k.id, 'jugador_id', k.jugador_id, 'rareza', k.rareza,
                            'tipo', k.tipo, 'carta', public._sobres_carta(k))
$$;

-- Jugadores ya elegidos (no se repite el mismo jugador en el equipo).
create or replace function public._vdraft_usados(p public.vdraft_partidas)
returns text[] language sql immutable as $$
  select coalesce(array_agg(x ->> 'jugador_id'), '{}')
    from (select jsonb_array_elements(p.equipo) x union all select jsonb_array_elements(p.banco)) t
   where x is not null and jsonb_typeof(x) = 'object'
$$;

/* n cartas al azar, de jugadores distintos.
   p_roles null = cualquier puesto; p_campo = sin arqueros.
   p_tipo: 'base' (bronce, plata, oro), 'especial' o 'todas'. */
create or replace function public._vdraft_oferta(p_club uuid, p_n int, p_roles text[], p_excluir text[],
                                                p_tipo text, p_campo boolean)
returns jsonb language sql volatile security definer set search_path = public as $$
  select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select c from (
      select distinct on (k.jugador_id) public._vdraft_carta(k) as c
        from public.cartas_catalogo k
       where k.club_id = p_club
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

-- Junta ofertas sin repetir jugador, hasta n cartas, y las mezcla.
create or replace function public._vdraft_sumar(p_a jsonb, p_b jsonb, p_n int)
returns jsonb language sql volatile as $$
  select coalesce(jsonb_agg(c order by random()), '[]'::jsonb) from (
    select c from (
      select distinct on (c ->> 'jugador_id') c, o
        from (select c, 1 as o from jsonb_array_elements(p_a) c
              union all select c, 2 from jsonb_array_elements(p_b) c) t
       order by c ->> 'jugador_id', o
    ) u order by o limit p_n
  ) x
$$;

/* La oferta para un lugar:
   - el arco: 2 arqueros comunes y 2 especiales (se completa con lo que haya);
   - el campo: 4 comunes de su puesto (si no alcanzan, comunes de otro puesto
     de campo, que juegan fuera de puesto); el último lugar libre es el
     "comodín" y trae 1 especial de su puesto entre las 4. */
create or replace function public._vdraft_oferta_lugar(p public.vdraft_partidas, p_lugar int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_roles text[] := array(select jsonb_array_elements_text(p.lugares -> p_lugar -> 'roles'));
  v_usados text[] := public._vdraft_usados(p);
  v_vacios int := (select count(*) from generate_series(0, 4) i where jsonb_typeof(p.equipo -> i) <> 'object');
  v_of jsonb;
begin
  if p_lugar = 0 then
    v_of := public._vdraft_sumar(public._vdraft_oferta(p.club_id, 2, array['ARQ'], v_usados, 'base', false),
                                 public._vdraft_oferta(p.club_id, 2, array['ARQ'], v_usados, 'especial', false), 4);
    v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, array['ARQ'], v_usados, 'todas', false), 4);
    if jsonb_array_length(v_of) < 2 then
      v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, null, v_usados, 'todas', false), 4);
    end if;
    return v_of;
  end if;

  if v_vacios <= 1 then
    v_of := public._vdraft_oferta(p.club_id, 1, v_roles, v_usados, 'especial', true);
  else
    v_of := '[]'::jsonb;
  end if;
  v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, v_roles, v_usados, 'base', true), 4);
  v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, null, v_usados, 'base', true), 4);
  if jsonb_array_length(v_of) < 2 then
    v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, v_roles, v_usados, 'todas', true), 4);
  end if;
  return v_of;
end
$$;

-- Los 4 rivales: un equipo de cada Primera, de la D a la A. La fuerza sale
-- de la media de las cartas COMUNES del club (así el torneo es parejo para
-- cualquier club), más un plus por división (D +10,5, C +14, B +17, A +20) y
-- por cómo le va en la tabla (puntos por partido; con su puesto en su zona).
-- Simulado contra el catálogo real: eligiendo siempre la mejor carta, ganar
-- los 4 sale ~1 de cada 10 y salir campeón ~1 de cada 4; con un draft
-- promedio, casi nunca. Lo que paga en promedio no llega a los 100 V-Coins
-- de una partida extra.
create or replace function public._vdraft_rivales(p_club uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_nombre text := lower(coalesce((select nombre from public.clubes where id = p_club), ''));
  v_media numeric := coalesce(
    (select avg((carta ->> 'ovr')::numeric) from public.cartas_catalogo
      where club_id = p_club and rareza in ('bronce', 'plata', 'oro')),
    (select avg((carta ->> 'ovr')::numeric) - 14 from public.cartas_catalogo where club_id = p_club),
    72);
  v_res jsonb := '[]'::jsonb;
  d record;
  r record;
begin
  for d in select * from (values ('D', 10.5, 'CUARTOS DE FINAL'), ('C', 14.0, 'SEMIFINAL'),
                                 ('B', 17.0, 'FINAL'), ('A', 20.0, 'CAMPEÓN DE CAMPEONES')) v(division, plus, ronda)
  loop
    with comp as (
      select id from public.liga_competencias
       where division = d.division and categoria = '1ra' and activa
       order by anio desc limit 1),
    lados as (
      select p.local as equipo, p.zona, p.goles_local as gf, p.goles_visitante as gc from public.liga_partidos p
       where p.competencia_id = (select id from comp) and p.estado ilike 'finalizado' and p.goles_local is not null
      union all
      select p.visitante, p.zona, p.goles_visitante, p.goles_local from public.liga_partidos p
       where p.competencia_id = (select id from comp) and p.estado ilike 'finalizado' and p.goles_local is not null),
    tabla as (
      select equipo, max(zona) as zona, count(*) as pj,
             sum(case when gf > gc then 3 when gf = gc then 1 else 0 end) as pts
        from lados group by equipo),
    pos as (
      select t.*, rank() over (partition by t.zona order by t.pts desc, t.pj asc) as puesto,
             count(*) over (partition by t.zona) as de
        from tabla t)
    select * into r from pos
     where v_nombre = '' or position(lower(equipo) in v_nombre) = 0
     order by random() limit 1;

    if r.equipo is null then
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'division', d.division, 'ronda', d.ronda, 'equipo', 'Primera ' || d.division, 'puesto', null, 'de', null,
        'zona', null, 'fuerza', round(v_media + d.plus, 1)));
    else
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'division', d.division, 'ronda', d.ronda, 'equipo', r.equipo, 'puesto', r.puesto, 'de', r.de,
        'zona', r.zona, 'pts', r.pts, 'pj', r.pj,
        'fuerza', round(v_media + d.plus + (case when r.pj > 0 then r.pts::numeric / r.pj else 1.5 end - 1.5) * 3, 1)));
    end if;
  end loop;
  return v_res;
end
$$;

-- Química (0-100) y fuerza del equipo titular.
create or replace function public._vdraft_fuerza(p public.vdraft_partidas)
returns jsonb language plpgsql immutable as $$
declare
  i int;
  v_c jsonb;
  v_rol text;
  v_roles jsonb;
  v_quim int := 0;
  v_ovr numeric := 0;
  v_n int := 0;
  v_arq_mal boolean := false;
begin
  for i in 0..4 loop
    v_c := p.equipo -> i;
    continue when v_c is null or jsonb_typeof(v_c) <> 'object';
    v_rol := v_c -> 'carta' ->> 'rol';
    v_roles := p.lugares -> i -> 'roles';
    v_ovr := v_ovr + coalesce((v_c -> 'carta' ->> 'ovr')::numeric, 60);
    v_n := v_n + 1;
    if v_roles ? v_rol then v_quim := v_quim + 20;
    elsif i = 0 or v_rol = 'ARQ' then v_arq_mal := true;
    else v_quim := v_quim + 8;
    end if;
  end loop;
  return jsonb_build_object(
    'media', case when v_n > 0 then round(v_ovr / v_n, 1) else 0 end,
    'quimica', v_quim,
    'fuerza', case when v_n > 0
      then round(v_ovr / v_n + (v_quim - 80) / 5.0 - case when v_arq_mal then 6 else 0 end, 1) else 0 end);
end
$$;

-- Poisson (Knuth): goles de un partido.
create or replace function public._vdraft_poisson(p_lambda double precision)
returns int language plpgsql volatile as $$
declare
  l double precision := exp(-least(p_lambda, 12));
  k int := 0;
  pr double precision := 1;
begin
  loop
    k := k + 1;
    pr := pr * random();
    exit when pr <= l;
  end loop;
  return k - 1;
end
$$;

-- Un valor de atributo de una carta ("TIR", "PAS"…).
create or replace function public._vdraft_attr(p_carta jsonb, p_clave text)
returns numeric language sql immutable as $$
  select coalesce((select (a ->> 1)::numeric from jsonb_array_elements(p_carta -> 'carta' -> 'atributos') a
                    where a ->> 0 = p_clave limit 1), 50)
$$;

-- Un jugador de campo al azar, con más chance cuanto más alto el atributo.
create or replace function public._vdraft_elegir_jugador(p_equipo jsonb, p_clave text, p_menos int)
returns int language plpgsql volatile as $$
declare
  v_total numeric := 0;
  v_tir numeric;
  i int;
  v_c jsonb;
begin
  for i in 1..4 loop
    v_c := p_equipo -> i;
    continue when v_c is null or jsonb_typeof(v_c) <> 'object' or i = p_menos;
    v_total := v_total + power(public._vdraft_attr(v_c, p_clave), 2);
  end loop;
  if v_total = 0 then return null; end if;
  v_tir := random() * v_total;
  for i in 1..4 loop
    v_c := p_equipo -> i;
    continue when v_c is null or jsonb_typeof(v_c) <> 'object' or i = p_menos;
    v_tir := v_tir - power(public._vdraft_attr(v_c, p_clave), 2);
    if v_tir <= 0 then return i; end if;
  end loop;
  return null;
end
$$;

-- Lo que devuelve cada función: la partida tal como la ve el jugador.
create or replace function public._vdraft_vista(p public.vdraft_partidas)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'estado', p.estado, 'paga', p.paga, 'formacion', p.formacion, 'lugares', p.lugares,
    'equipo', p.equipo, 'banco', p.banco, 'capitan', p.capitan, 'paso', p.paso, 'lugar_actual', p.lugar_actual,
    'oferta', p.oferta, 'rivales', p.rivales, 'partidos', p.partidos, 'victorias', p.victorias,
    'premio', p.premio, 'fuerza', public._vdraft_fuerza(p))
$$;

-- Termina la partida y paga el premio según las victorias.
create or replace function public._vdraft_terminar(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  p public.vdraft_partidas;
  v_coins int;
  v_sobre text;
begin
  select * into p from public.vdraft_partidas where id = p_id for update;
  if p.estado = 'terminada' then return; end if;
  v_coins := case p.victorias when 1 then 25 when 2 then 75 when 3 then 150 when 4 then 300 else 0 end;
  v_sobre := case when p.victorias >= 4 then 'premio_especial' when p.victorias = 3 then 'premio' else null end;

  insert into public.sobres_perfil (club_id, dueno) values (p.club_id, p.dueno) on conflict do nothing;
  update public.sobres_perfil
     set puntos = puntos + v_coins,
         sobres_premio = sobres_premio + case when v_sobre = 'premio' then 1 else 0 end,
         sobres_especiales = sobres_especiales + case when v_sobre = 'premio_especial' then 1 else 0 end
   where club_id = p.club_id and dueno = p.dueno;

  update public.vdraft_partidas
     set estado = 'terminada', paso = 'listo', oferta = '[]'::jsonb, updated_at = now(),
         premio = jsonb_build_object('vcoins', v_coins, 'sobre', v_sobre)
   where id = p_id;
end
$$;

-- ── V-DRAFT: LO QUE LLAMA LA APP ────────────────────────────────────────────

create or replace function public.vdraft_estado(p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.vdraft_partidas;
  v_gratis boolean;
  v_puntos int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where club_id = c.o_club and dueno = c.o_dueno and estado <> 'terminada' limit 1;
  v_gratis := not exists (select 1 from public.vdraft_partidas
    where club_id = c.o_club and dueno = c.o_dueno and dia = v_hoy and not paga);
  select coalesce(puntos, 0) into v_puntos from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno;

  return jsonb_build_object(
    'partida', case when p.id is null then null else public._vdraft_vista(p) end,
    'gratis_hoy', v_gratis,
    'puntos', coalesce(v_puntos, 0),
    'costo', 100,
    'es_staff', c.o_jugador is null,
    'ultimas', coalesce((
      select jsonb_agg(jsonb_build_object('dia', x.dia, 'victorias', x.victorias, 'premio', x.premio, 'formacion', x.formacion) order by x.created_at desc)
        from (select * from public.vdraft_partidas
               where club_id = c.o_club and dueno = c.o_dueno and estado = 'terminada'
               order by created_at desc limit 5) x), '[]'::jsonb),
    -- Ranking de la semana (lunes a domingo, hora de Argentina) del club.
    'ranking', coalesce((
      select jsonb_agg(r order by (r ->> 'campeonatos')::int desc, (r ->> 'victorias')::int desc)
        from (
          select jsonb_build_object(
                   'dueno', v.dueno,
                   'nombre', coalesce(
                     (select coalesce(j.apellido, j.nombre) from public.jugadores j
                       where v.dueno like 'j:%' and j.id::text = substring(v.dueno from 3) limit 1),
                     (select pf.nombre_completo from public.perfiles pf
                       where v.dueno like 'u:%' and pf.id::text = substring(v.dueno from 3) limit 1),
                     'Staff'),
                   'yo', v.dueno = c.o_dueno,
                   'partidas', count(*),
                   'victorias', sum(v.victorias),
                   'campeonatos', count(*) filter (where v.victorias >= 3)) as r
            from public.vdraft_partidas v
           where v.club_id = c.o_club and v.estado = 'terminada'
             and v.dia >= date_trunc('week', v_hoy)::date
           group by v.dueno
           order by count(*) filter (where v.victorias >= 3) desc, sum(v.victorias) desc
           limit 10) t), '[]'::jsonb)
  );
end
$$;

create or replace function public.vdraft_nueva(p_formacion text, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  v_paga boolean;
  pf public.sobres_perfil;
  p public.vdraft_partidas;
begin
  if p_formacion not in ('2-2', '1-2-1', '3-1', '4-0') then
    raise exception 'vdraft: formación inválida' using errcode = '22023';
  end if;
  select * into c from public._sobres_ctx(p_token);

  if exists (select 1 from public.vdraft_partidas where club_id = c.o_club and dueno = c.o_dueno and estado <> 'terminada') then
    raise exception 'vdraft: ya tenés una partida en juego' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cartas_catalogo where club_id = c.o_club) < 8 then
    raise exception 'vdraft: el club todavía no tiene cartas suficientes' using errcode = 'P0001';
  end if;

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
  select * into pf from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;

  v_paga := exists (select 1 from public.vdraft_partidas
    where club_id = c.o_club and dueno = c.o_dueno and dia = v_hoy and not paga);
  if v_paga then
    if pf.puntos < 100 then
      raise exception 'vdraft: te faltan V-Coins (la partida extra cuesta 100)' using errcode = 'P0001';
    end if;
    update public.sobres_perfil set puntos = puntos - 100 where club_id = c.o_club and dueno = c.o_dueno;
  end if;

  insert into public.vdraft_partidas (club_id, dueno, dia, paga, formacion, lugares)
    values (c.o_club, c.o_dueno, v_hoy, v_paga, p_formacion, public._vdraft_lugares(p_formacion))
    returning * into p;

  -- El capitán: 5 especiales de campo (si el club no tiene, cualquier carta).
  update public.vdraft_partidas
     set oferta = public._vdraft_sumar(public._vdraft_oferta(c.o_club, 5, null, '{}', 'especial', true),
                                       public._vdraft_oferta(c.o_club, 5, null, '{}', 'todas', false), 5)
   where id = p.id returning * into p;

  return public._vdraft_vista(p);
end
$$;

create or replace function public.vdraft_elegir(p_partida uuid, p_catalogo uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  v_carta jsonb;
  v_rol text;
  v_lugar int;
  i int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found then raise exception 'vdraft: partida inexistente' using errcode = 'P0001'; end if;
  if p.estado <> 'draft' then raise exception 'vdraft: el draft ya terminó' using errcode = 'P0001'; end if;

  select x into v_carta from jsonb_array_elements(p.oferta) x where x ->> 'catalogo_id' = p_catalogo::text limit 1;
  if v_carta is null then raise exception 'vdraft: esa carta no estaba en la oferta' using errcode = 'P0001'; end if;
  v_rol := v_carta -> 'carta' ->> 'rol';

  if p.paso = 'capitan' then
    -- El capitán va al primer lugar de su puesto; si no hay, al primer lugar
    -- de campo (un arquero, siempre al arco).
    v_lugar := null;
    for i in 0..4 loop
      if (p.lugares -> i -> 'roles') ? v_rol then v_lugar := i; exit; end if;
    end loop;
    if v_lugar is null then v_lugar := case when v_rol = 'ARQ' then 0 else 1 end; end if;
    p.equipo := jsonb_set(p.equipo, array[v_lugar::text], v_carta);
    p.capitan := p_catalogo;
  elsif p.paso = 'lugar' then
    p.equipo := jsonb_set(p.equipo, array[p.lugar_actual::text], v_carta);
  elsif p.paso = 'banco' then
    p.banco := p.banco || jsonb_build_array(v_carta);
  end if;

  -- Lo que sigue: el próximo lugar vacío, después el banco, después el torneo.
  v_lugar := null;
  for i in 0..4 loop
    if jsonb_typeof(p.equipo -> i) <> 'object' then v_lugar := i; exit; end if;
  end loop;

  if v_lugar is not null then
    p.paso := 'lugar';
    p.lugar_actual := v_lugar;
    p.oferta := public._vdraft_oferta_lugar(p, v_lugar);
  elsif jsonb_array_length(p.banco) < 2 then
    p.paso := 'banco';
    p.lugar_actual := null;
    -- Suplentes comunes: el 1ro de campo, el 2do cualquiera.
    p.oferta := public._vdraft_sumar(
      public._vdraft_oferta(p.club_id, 4, null, public._vdraft_usados(p), 'base', jsonb_array_length(p.banco) = 0),
      public._vdraft_oferta(p.club_id, 4, null, public._vdraft_usados(p), 'todas', jsonb_array_length(p.banco) = 0), 4);
  else
    p.paso := 'listo';
    p.lugar_actual := null;
    p.oferta := '[]'::jsonb;
    p.estado := 'torneo';
    p.rivales := public._vdraft_rivales(p.club_id);
  end if;

  update public.vdraft_partidas
     set equipo = p.equipo, banco = p.banco, capitan = p.capitan, paso = p.paso, lugar_actual = p.lugar_actual,
         oferta = p.oferta, estado = p.estado, rivales = p.rivales, updated_at = now()
   where id = p.id;
  return public._vdraft_vista(p);
end
$$;

-- Cambio entre partidos: el titular del lugar i por el suplente j.
create or replace function public.vdraft_cambio(p_partida uuid, p_lugar int, p_banco int, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  v_tit jsonb;
  v_sup jsonb;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.estado <> 'torneo' then raise exception 'vdraft: no se puede cambiar ahora' using errcode = 'P0001'; end if;
  if p_lugar not between 0 and 4 or p_banco < 0 or p_banco >= jsonb_array_length(p.banco) then
    raise exception 'vdraft: cambio inválido' using errcode = '22023';
  end if;
  v_tit := p.equipo -> p_lugar;
  v_sup := p.banco -> p_banco;
  p.equipo := jsonb_set(p.equipo, array[p_lugar::text], v_sup);
  p.banco := jsonb_set(p.banco, array[p_banco::text], v_tit);
  update public.vdraft_partidas set equipo = p.equipo, banco = p.banco, updated_at = now() where id = p.id;
  return public._vdraft_vista(p);
end
$$;

-- Juega el próximo partido del torneo.
create or replace function public.vdraft_jugar(p_partida uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  v_n int;
  v_rival jsonb;
  v_f jsonb;
  v_dif numeric;
  v_gp int;
  v_gr int;
  v_goles jsonb := '[]'::jsonb;
  v_mins int[];
  v_orden text[];
  v_autor int;
  v_asis int;
  v_gano boolean;
  v_pen text := null;
  v_pp int; v_pr int;
  i int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.estado <> 'torneo' then raise exception 'vdraft: no hay partido para jugar' using errcode = 'P0001'; end if;

  v_n := jsonb_array_length(p.partidos);
  v_rival := p.rivales -> v_n;
  v_f := public._vdraft_fuerza(p);
  v_dif := (v_f ->> 'fuerza')::numeric - (v_rival ->> 'fuerza')::numeric;

  -- Unos 2,5 goles por equipo entre parejos; la diferencia de fuerza los mueve.
  v_gp := public._vdraft_poisson(2.5 * exp(v_dif / 15.0));
  v_gr := public._vdraft_poisson(2.5 * exp(-v_dif / 15.0));

  -- Minuto de cada gol, en orden.
  v_mins := array(select 1 + floor(random() * 40)::int from generate_series(1, v_gp + v_gr) order by 1);
  -- El orden en que caen los goles, y quién hace cada gol propio (más chance
  -- con más TIR) y quién asiste (PAS, 70% de los goles).
  v_orden := array(select e from (select 'propio' as e from generate_series(1, v_gp)
                                  union all select 'rival' from generate_series(1, v_gr)) s order by random());
  for i in 1..(v_gp + v_gr) loop
    if v_orden[i] = 'propio' then
      v_autor := public._vdraft_elegir_jugador(p.equipo, 'TIR', -1);
      v_asis := case when random() < 0.7 then public._vdraft_elegir_jugador(p.equipo, 'PAS', v_autor) else null end;
      v_goles := v_goles || jsonb_build_array(jsonb_build_object(
        'minuto', v_mins[i], 'equipo', 'propio',
        'autor', p.equipo -> v_autor -> 'carta' ->> 'apellido',
        'asistencia', case when v_asis is null then null else p.equipo -> v_asis -> 'carta' ->> 'apellido' end));
    else
      v_goles := v_goles || jsonb_build_array(jsonb_build_object('minuto', v_mins[i], 'equipo', 'rival'));
    end if;
  end loop;

  if v_gp > v_gr then v_gano := true;
  elsif v_gp < v_gr then v_gano := false;
  else
    -- Penales: pesa un poco la diferencia de fuerza.
    v_gano := random() < 0.5 + greatest(-0.2, least(0.2, v_dif / 50.0));
    v_pp := 3 + floor(random() * 3)::int;
    v_pr := v_pp - 1 - floor(random() * 2)::int;
    if not v_gano then v_pen := v_pr || '-' || v_pp; else v_pen := v_pp || '-' || v_pr; end if;
  end if;

  p.partidos := p.partidos || jsonb_build_array(jsonb_build_object(
    'ronda', v_rival ->> 'ronda', 'rival', v_rival ->> 'equipo', 'division', v_rival ->> 'division',
    'goles_propios', v_gp, 'goles_rival', v_gr, 'penales', v_pen, 'gano', v_gano, 'goles', v_goles,
    'fuerza_propia', v_f ->> 'fuerza', 'fuerza_rival', v_rival ->> 'fuerza'));
  p.victorias := p.victorias + case when v_gano then 1 else 0 end;

  update public.vdraft_partidas set partidos = p.partidos, victorias = p.victorias, updated_at = now() where id = p.id;
  if not v_gano or p.victorias >= 4 then perform public._vdraft_terminar(p.id); end if;

  select * into p from public.vdraft_partidas where id = p.id;
  return public._vdraft_vista(p) || jsonb_build_object('ultimo', p.partidos -> (jsonb_array_length(p.partidos) - 1));
end
$$;

-- Abandonar: en el draft no hay premio; en el torneo, se cobra lo ganado.
create or replace function public.vdraft_abandonar(p_partida uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.estado = 'terminada' then raise exception 'vdraft: no hay partida en juego' using errcode = 'P0001'; end if;
  perform public._vdraft_terminar(p.id);
  select * into p from public.vdraft_partidas where id = p.id;
  return public._vdraft_vista(p);
end
$$;

drop function if exists public._vdraft_oferta(uuid, int, text[], text[], boolean, boolean);
revoke all on function public._vdraft_oferta(uuid, int, text[], text[], text, boolean) from public, anon, authenticated;
revoke all on function public._vdraft_sumar(jsonb, jsonb, int) from public, anon, authenticated;
revoke all on function public._vdraft_oferta_lugar(public.vdraft_partidas, int) from public, anon, authenticated;
revoke all on function public._vdraft_rivales(uuid) from public, anon, authenticated;
revoke all on function public._vdraft_terminar(uuid) from public, anon, authenticated;
revoke all on function public._vdraft_carta(public.cartas_catalogo) from public, anon, authenticated;
grant execute on function public.sobres_estado(uuid)                      to anon, authenticated;
grant execute on function public.sobres_abrir(text, uuid)                 to anon, authenticated;
grant execute on function public.vdraft_estado(uuid)                      to anon, authenticated;
grant execute on function public.vdraft_nueva(text, uuid)                 to anon, authenticated;
grant execute on function public.vdraft_elegir(uuid, uuid, uuid)          to anon, authenticated;
grant execute on function public.vdraft_cambio(uuid, int, int, uuid)      to anon, authenticated;
grant execute on function public.vdraft_jugar(uuid, uuid)                 to anon, authenticated;
grant execute on function public.vdraft_abandonar(uuid, uuid)             to anon, authenticated;
