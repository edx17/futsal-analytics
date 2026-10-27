-- ═══════════════════════════════════════════════════════════════════════════
--  V-COINS MULTIPLICADAS: DÓNDE APLICAN Y EL AVISO
--
--  Los eventos de "V-Coins x2" (vcoins_multiplicadores, Modo GOD · USUARIOS)
--  ahora eligen a qué juegos aplican (`aplica`): sobres (repetidas), V-Draft
--  (premio del torneo), misiones del día y penales (tanda ganada). Los que ya
--  existían aplican a todo.
--
--    _vcoins_factor_en(club, área)  el factor que corre en esa área (1 si no hay)
--    _vcoins_factor(club)           = el de 'sobres' (lo usan sobres_abrir y sobres_abrir_evento, sin cambios)
--    juegos_avisos(p_token)         { actual, proximo }: el evento en curso y el que viene
--                                   (hasta 7 días antes), para el cartel de los Juegos
--
--  Recrea _vdraft_terminar, _juegos_misiones y penales_tiro cambiando SÓLO el
--  premio (ahora multiplicado si el evento aplica). Va después de
--  20261103120000_penales_cartas.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.vcoins_multiplicadores
  add column if not exists aplica text[] not null default array['sobres', 'vdraft', 'misiones', 'penales'];
alter table public.vcoins_multiplicadores drop constraint if exists vcoins_multiplicadores_aplica_check;
alter table public.vcoins_multiplicadores add constraint vcoins_multiplicadores_aplica_check
  check (cardinality(aplica) > 0 and aplica <@ array['sobres', 'vdraft', 'misiones', 'penales']);

-- El factor que corre ahora en un área del juego (1 si no hay ningún evento).
create or replace function public._vcoins_factor_en(p_club uuid, p_area text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(max(m.factor), 1) from public.vcoins_multiplicadores m
   where m.club_id = p_club and m.activo and now() between m.desde and m.hasta and p_area = any (m.aplica)
$$;

-- El de los sobres (sobres_abrir y sobres_abrir_evento lo llaman así).
create or replace function public._vcoins_factor(p_club uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select public._vcoins_factor_en(p_club, 'sobres')
$$;

-- El evento que corre (sobres_estado lo muestra): ahora con dónde aplica.
create or replace function public._vcoins_evento(p_club uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nombre', m.nombre, 'factor', m.factor, 'desde', m.desde, 'hasta', m.hasta, 'aplica', m.aplica)
    from public.vcoins_multiplicadores m
   where m.club_id = p_club and m.activo and now() between m.desde and m.hasta
   order by m.factor desc, m.hasta limit 1
$$;

-- El cartel de los Juegos: el evento en curso y el próximo (si empieza en 7 días o menos).
create or replace function public.juegos_avisos(p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  return jsonb_build_object(
    'actual', public._vcoins_evento(c.o_club),
    'proximo', (select jsonb_build_object('nombre', m.nombre, 'factor', m.factor, 'desde', m.desde, 'hasta', m.hasta, 'aplica', m.aplica)
                  from public.vcoins_multiplicadores m
                 where m.club_id = c.o_club and m.activo and m.desde > now() and m.desde <= now() + interval '7 days'
                 order by m.desde limit 1),
    'ahora', now());
end
$$;

-- El premio del V-Draft: x2 si el evento aplica al V-Draft.
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
  v_coins := round(v_coins * public._vcoins_factor_en(p.club_id, 'vdraft'))::int;   -- evento de V-Coins dobles (si aplica al V-Draft)
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

-- Las misiones: el premio que se muestra y se cobra, x2 si aplica.
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
    union all
    select 'penales', 'Ganá 1 tanda de penales', 1, 25, 4,
           (select count(*) from public.penales_tandas t, hoy
             where t.club_id = p_club and t.dueno = p_dueno and t.dia = hoy.d and t.gano)::int
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'titulo', p.titulo, 'meta', p.meta,
           'premio', round(p.premio * public._vcoins_factor_en(p_club, 'misiones'))::int,   -- x2 si aplica a las misiones
           'premio_base', p.premio,
           'progreso', least(p.progreso, p.meta),
           'cobrada', exists (select 1 from public.juegos_misiones_cobradas c, hoy
                               where c.club_id = p_club and c.dueno = p_dueno and c.dia = hoy.d and c.mision = p.id))
         order by p.orden), '[]'::jsonb)
    from prog p
$$;

-- Penales: el premio de la tanda ganada, x2 si aplica.
create or replace function public.penales_tiro(p_tanda uuid, p_eleccion int, p_token uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  t public.penales_tandas;
  v_turno text;
  v_S int; v_K int; v_G int; v_R int;
  v_celda int; v_arquero int;
  v_gol boolean; v_motivo text;
  v_tiro jsonb;
  v_tj jsonb;
  v_ganador text;
  v_np int;
  v_premio int := 0;
  v_puntos int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into t from public.penales_tandas
   where id = p_tanda and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or t.estado <> 'jugando' then raise exception 'penales: no hay tanda para patear' using errcode = 'P0001'; end if;
  if p_eleccion is null or p_eleccion < -1 or p_eleccion > 8 then
    raise exception 'penales: elegí un cuadrante del arco (0 a 8)' using errcode = '22023';
  end if;

  v_turno := public._vdraft_tanda_turno(jsonb_build_object('primero', t.primero, 'tiros', t.tiros));
  if v_turno = 'propio' then
    v_S := (t.pateador ->> 'valor')::int;
    v_K := public._penales_cpu(t.nivel);
    v_celda := p_eleccion;
    v_motivo := null;
    if v_celda = -1 then
      v_celda := floor(random() * 9)::int;
      if random() < 0.3 then v_gol := false; v_motivo := 'afuera'; v_arquero := 4; end if;
    end if;
    if v_motivo is null then
      v_arquero := case when random() < public._penales_limitar(0.12 + (v_K - 60) / 200.0, 0.08, 0.3)
                        then v_celda else floor(random() * 9)::int end;
      if v_celda in (0, 2, 6, 8) and random() < public._penales_limitar(0.10 - (v_S - 60) / 600.0, 0.02, 0.12) then
        v_gol := false; v_motivo := 'palo';
      elsif v_arquero = v_celda and random() < public._penales_limitar(0.55 + (v_K - v_S) / 150.0, 0.3, 0.85) then
        v_gol := false; v_motivo := 'atajada';
      elsif v_arquero <> v_celda and public._penales_vecinos(v_arquero, v_celda)
            and random() < public._penales_limitar(0.25 + (v_K - v_S) / 250.0, 0.08, 0.4) then
        v_gol := false; v_motivo := 'atajada';
      else
        v_gol := true; v_motivo := 'gol';
      end if;
    end if;
    v_tiro := jsonb_build_object('equipo', 'propio', 'celda', v_celda, 'arquero', v_arquero, 'gol', v_gol, 'motivo', v_motivo,
                                 'sin_tiempo', p_eleccion = -1);
  else
    v_G := (t.arquero ->> 'valor')::int;
    v_R := public._penales_cpu(t.nivel);
    v_arquero := case when p_eleccion = -1 then 4 else p_eleccion end;
    v_celda := floor(random() * 9)::int;
    if random() < public._penales_limitar(0.06 - (v_R - 60) / 800.0, 0.02, 0.08) then
      v_gol := false; v_motivo := 'afuera';
    elsif v_arquero = v_celda and random() < public._penales_limitar(0.55 + (v_G - v_R) / 150.0, 0.3, 0.85) then
      v_gol := false; v_motivo := 'atajada';
    elsif v_arquero <> v_celda and public._penales_vecinos(v_arquero, v_celda)
          and random() < public._penales_limitar(0.3 + (v_G - v_R) / 250.0, 0.1, 0.45) then
      v_gol := false; v_motivo := 'atajada';
    else
      v_gol := true; v_motivo := 'gol';
    end if;
    v_tiro := jsonb_build_object('equipo', 'rival', 'celda', v_celda, 'arquero', v_arquero, 'lado', v_arquero % 3,
                                 'gol', v_gol, 'motivo', v_motivo, 'sin_tiempo', p_eleccion = -1);
  end if;

  t.tiros := t.tiros || jsonb_build_array(v_tiro);
  if v_gol then
    if v_turno = 'propio' then t.propio := t.propio + 1; else t.rival := t.rival + 1; end if;
  end if;

  v_tj := jsonb_build_object('primero', t.primero, 'tiros', t.tiros, 'propio', t.propio, 'rival', t.rival);
  v_ganador := public._vdraft_tanda_ganador(v_tj);
  select count(*) into v_np from jsonb_array_elements(t.tiros) x where x ->> 'equipo' = 'propio';
  if v_ganador is null and v_np >= 20 and public._vdraft_tanda_turno(v_tj) = t.primero then
    v_ganador := case when random() < 0.5 then 'propio' else 'rival' end;   -- moneda
  end if;

  if v_ganador is null then
    update public.penales_tandas set tiros = t.tiros, propio = t.propio, rival = t.rival, updated_at = now() where id = t.id;
  else
    if v_ganador = 'propio' and public._penales_premiadas_hoy(c.o_club, c.o_dueno) < 3 then
      v_premio := round(public._penales_premio(t.nivel) * public._vcoins_factor_en(c.o_club, 'penales'))::int;   -- x2 si aplica
      insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
      update public.sobres_perfil set puntos = puntos + v_premio where club_id = c.o_club and dueno = c.o_dueno;
    end if;
    update public.penales_tandas
       set tiros = t.tiros, propio = t.propio, rival = t.rival, estado = 'terminada',
           gano = v_ganador = 'propio', premio = v_premio, updated_at = now()
     where id = t.id;
  end if;
  select puntos into v_puntos from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno;

  select * into t from public.penales_tandas where id = t.id;
  return jsonb_build_object(
    'tiro', v_tiro,
    'tanda', case when v_ganador is null then public._penales_vista(t) else null end,
    'marcador', jsonb_build_object('propio', t.propio, 'rival', t.rival),
    'definida', v_ganador is not null,
    'ultimo', case when v_ganador is null then null
                   else jsonb_build_object('gano', v_ganador = 'propio', 'penales', t.propio || '-' || t.rival,
                                           'tanda', t.tiros, 'premio', v_premio) end,
    'premio', v_premio,
    'puntos', coalesce(v_puntos, 0),
    'premiadas_hoy', public._penales_premiadas_hoy(c.o_club, c.o_dueno), 'limite', 3);
end
$$;

revoke all on function public._vcoins_factor_en(uuid, text) from public, anon, authenticated;
revoke all on function public._vcoins_factor(uuid) from public, anon, authenticated;
revoke all on function public._vcoins_evento(uuid) from public, anon, authenticated;
revoke all on function public._vdraft_terminar(uuid) from public, anon, authenticated;
revoke all on function public._juegos_misiones(uuid, text) from public, anon, authenticated;
grant execute on function public.juegos_avisos(uuid) to anon, authenticated;
grant execute on function public.penales_tiro(uuid, int, uuid) to anon, authenticated;
