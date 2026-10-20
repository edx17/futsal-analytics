-- ═══════════════════════════════════════════════════════════════════════════
--  V-DRAFT: MÁS DIFÍCIL
--
--  Para correr sobre 20261020120000_vdraft.sql si ya se había aplicado una
--  versión anterior (la que ofrecía puras especiales y casi siempre se ganaba).
--  Cambia sólo las ofertas del draft y la fuerza de los rivales:
--    - capitán: 1 de 5 especiales;
--    - arquero: 2 comunes y 2 especiales;
--    - lugares de campo: cartas comunes (bronce, plata, oro) de su puesto;
--      el último ("comodín") trae 1 especial entre las 4;
--    - suplentes comunes;
--    - rivales: media de las cartas comunes del club + D 10,5 · C 14 · B 17 · A 20.
--  Es idempotente (en una base nueva, 20261020120000_vdraft.sql ya trae esto).
-- ═══════════════════════════════════════════════════════════════════════════

-- La versión vieja de la oferta (con un booleano para las especiales).
drop function if exists public._vdraft_oferta(uuid, int, text[], text[], boolean, boolean);

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

revoke all on function public._vdraft_oferta(uuid, int, text[], text[], text, boolean) from public, anon, authenticated;
revoke all on function public._vdraft_sumar(jsonb, jsonb, int) from public, anon, authenticated;
revoke all on function public._vdraft_oferta_lugar(public.vdraft_partidas, int) from public, anon, authenticated;
revoke all on function public._vdraft_rivales(uuid) from public, anon, authenticated;
grant execute on function public.vdraft_nueva(text, uuid)        to anon, authenticated;
grant execute on function public.vdraft_elegir(uuid, uuid, uuid) to anon, authenticated;
