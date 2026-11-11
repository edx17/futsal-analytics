-- ═══════════════════════════════════════════════════════════════════════════
--  JUEGOS: DUELO DE CARTAS
--
--  Retás a otro del club con 5 cartas de TU colección (arquero + 4 de campo,
--  en una de las formaciones del V-Draft) y, si querés, una apuesta en
--  V-Coins. El otro arma su equipo sin ver el tuyo y, al aceptar, se juega el
--  partido (la misma simulación del V-Draft: fuerza = media + química). Si
--  empatan, penales: pateador contra arquero, según sus atributos.
--
--    · Apuesta de 0 a 1000: los dos ponen lo mismo y el ganador se lleva todo.
--    · El ganador cobra además 20 V-Coins (hasta 3 duelos ganados por día).
--    · Si no se acepta en 48 horas vence y se le devuelve la apuesta al que
--      retó (también si lo rechaza el retado o lo cancela el que retó).
--    · Hasta 5 retos abiertos por persona y uno solo pendiente por pareja.
--    · Se puede retar a cualquiera del club que tenga al menos 5 cartas.
--
--    duelos_estado(p_token)                                     todo lo de la pantalla
--    duelo_retar(p_rival, p_formacion, p_cartas, p_apuesta, p_token)
--    duelo_responder(p_duelo, p_formacion, p_cartas, p_token)   acepta y juega
--    duelo_rechazar(p_duelo, p_token)                           rechaza o cancela
--    duelo_visto(p_duelo, p_token)                              el que retó ya vio el resultado
--
--  Va después de 20261112120000_vdraft_desafio_torneo.sql (usa _juegos_nombre
--  y las funciones del V-Draft). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.juegos_duelos (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  retador     text not null,
  rival       text not null,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'jugado', 'rechazado', 'cancelado', 'vencido')),
  apuesta     int not null default 0 check (apuesta between 0 and 1000),
  formacion_r text not null,
  equipo_r    jsonb not null,
  formacion_v text,
  equipo_v    jsonb,
  resultado   jsonb,
  visto_r     boolean not null default false,
  created_at  timestamptz not null default now(),
  vence_at    timestamptz not null default now() + interval '48 hours',
  jugado_at   timestamptz,
  check (retador <> rival)
);
create index if not exists juegos_duelos_rival on public.juegos_duelos (club_id, rival, estado);
create index if not exists juegos_duelos_retador on public.juegos_duelos (club_id, retador, estado);
alter table public.juegos_duelos enable row level security;   -- sólo por las funciones
comment on table public.juegos_duelos is 'Juegos: duelos de cartas entre dos del club (5 cartas de la colección de cada uno).';

-- ── AYUDANTES ───────────────────────────────────────────────────────────────

-- El equipo de un duelo: las 5 cartas en el orden de los lugares (la 1ª al arco).
-- Tienen que ser del dueño y de 5 jugadores distintos.
create or replace function public._duelo_equipo(p_club uuid, p_dueno text, p_formacion text, p_cartas uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_eq jsonb := '[]'::jsonb;
  v_k public.cartas_catalogo;
  i int;
begin
  if p_formacion not in ('2-2', '1-2-1', '3-1', '4-0') then
    raise exception 'duelo: formación inválida' using errcode = '22023';
  end if;
  if coalesce(array_length(p_cartas, 1), 0) <> 5 or (select count(distinct x) from unnest(p_cartas) x) <> 5 then
    raise exception 'duelo: elegí 5 cartas distintas' using errcode = '22023';
  end if;
  for i in 1..5 loop
    select k.* into v_k from public.cartas_catalogo k
      join public.cartas_coleccion cc on cc.catalogo_id = k.id and cc.club_id = p_club and cc.dueno = p_dueno
     where k.id = p_cartas[i] and k.club_id = p_club;
    if not found then raise exception 'duelo: esa carta no es tuya' using errcode = 'P0001'; end if;
    v_eq := v_eq || jsonb_build_array(public._vdraft_carta(v_k));
  end loop;
  if (select count(distinct x ->> 'jugador_id') from jsonb_array_elements(v_eq) x) <> 5 then
    raise exception 'duelo: no se puede repetir el mismo jugador' using errcode = 'P0001';
  end if;
  return v_eq;
end
$$;

-- Media, química y fuerza de un equipo (las mismas reglas que _vdraft_fuerza).
create or replace function public._duelo_fuerza(p_equipo jsonb, p_formacion text)
returns jsonb language plpgsql immutable as $$
declare
  v_lugares jsonb := public._vdraft_lugares(p_formacion);
  i int;
  v_c jsonb;
  v_rol text;
  v_quim int := 0;
  v_ovr numeric := 0;
  v_n int := 0;
  v_arq_mal boolean := false;
begin
  for i in 0..4 loop
    v_c := p_equipo -> i;
    continue when v_c is null or jsonb_typeof(v_c) <> 'object';
    v_rol := v_c -> 'carta' ->> 'rol';
    v_ovr := v_ovr + coalesce((v_c -> 'carta' ->> 'ovr')::numeric, 60);
    v_n := v_n + 1;
    if (v_lugares -> i -> 'roles') ? v_rol then v_quim := v_quim + 20;
    elsif i = 0 or v_rol = 'ARQ' then v_arq_mal := true;
    else v_quim := v_quim + 8;
    end if;
  end loop;
  return jsonb_build_object(
    'media', case when v_n > 0 then round(v_ovr / v_n, 1) else 0 end,
    'quimica', v_quim,
    'fuerza', case when v_n > 0 then round(v_ovr / v_n + (v_quim - 80) / 5.0 - case when v_arq_mal then 6 else 0 end, 1) else 0 end);
end
$$;

-- El partido: goles de cada lado (Poisson con la diferencia de fuerza) y, si
-- empatan, penales (5 cada uno y muerte súbita; pateador contra arquero).
create or replace function public._duelo_simular(p_eq_r jsonb, p_form_r text, p_eq_v jsonb, p_form_v text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_fr jsonb := public._duelo_fuerza(p_eq_r, p_form_r);
  v_fv jsonb := public._duelo_fuerza(p_eq_v, p_form_v);
  v_dif numeric := (v_fr ->> 'fuerza')::numeric - (v_fv ->> 'fuerza')::numeric;
  v_gr int;
  v_gv int;
  v_mins int[];
  v_orden text[];
  v_goles jsonb := '[]'::jsonb;
  v_eq jsonb;
  v_autor int;
  v_asis int;
  v_pr int := 0;
  v_pv int := 0;
  v_tiros jsonb := '[]'::jsonb;
  v_ganador text;
  v_lado text;
  v_pat int;
  v_prob numeric;
  v_gol boolean;
  n int;
  i int;
begin
  v_gr := least(public._vdraft_poisson(2.5 * exp(v_dif / 15.0)), 15);
  v_gv := least(public._vdraft_poisson(2.5 * exp(-v_dif / 15.0)), 15);
  v_mins := array(select m from (select m from generate_series(1, 40) m order by random() limit v_gr + v_gv) s order by m);
  v_orden := array(select e from (select 'retador' as e from generate_series(1, v_gr)
                                  union all select 'rival' from generate_series(1, v_gv)) s order by random());
  for i in 1..(v_gr + v_gv) loop
    v_eq := case when v_orden[i] = 'retador' then p_eq_r else p_eq_v end;
    v_autor := public._vdraft_elegir_jugador(v_eq, 'TIR', -1);
    v_asis := case when random() < 0.7 then public._vdraft_elegir_jugador(v_eq, 'PAS', v_autor) else null end;
    v_goles := v_goles || jsonb_build_array(jsonb_build_object(
      'minuto', v_mins[i], 'equipo', v_orden[i],
      'autor', v_eq -> v_autor -> 'carta' ->> 'apellido',
      'asistencia', case when v_asis is null then null else v_eq -> v_asis -> 'carta' ->> 'apellido' end));
  end loop;

  if v_gr > v_gv then v_ganador := 'retador';
  elsif v_gv > v_gr then v_ganador := 'rival';
  else
    -- Penales: patean de a uno, empieza el que retó.
    n := 0;
    loop
      n := n + 1;
      foreach v_lado in array array['retador', 'rival'] loop
        v_eq := case when v_lado = 'retador' then p_eq_r else p_eq_v end;
        v_pat := 1 + ((n - 1) % 4);
        v_prob := least(0.92, greatest(0.55, 0.75
          + ((0.6 * public._vdraft_attr(v_eq -> v_pat, 'TIR') + 0.4 * public._vdraft_attr(v_eq -> v_pat, 'IMP'))
             - (public._vdraft_attr(case when v_lado = 'retador' then p_eq_v else p_eq_r end -> 0, 'ATA')
                + public._vdraft_attr(case when v_lado = 'retador' then p_eq_v else p_eq_r end -> 0, 'SAL')
                + public._vdraft_attr(case when v_lado = 'retador' then p_eq_v else p_eq_r end -> 0, 'EVI')) / 3.0) / 200.0));
        v_gol := random() < v_prob;
        if v_gol then
          if v_lado = 'retador' then v_pr := v_pr + 1; else v_pv := v_pv + 1; end if;
        end if;
        v_tiros := v_tiros || jsonb_build_array(jsonb_build_object('equipo', v_lado, 'gol', v_gol,
                                                                   'pateador', v_eq -> v_pat -> 'carta' ->> 'apellido'));
      end loop;
      -- 5 cada uno; después, muerte súbita (a los 15, moneda).
      exit when n >= 5 and v_pr <> v_pv;
      if n >= 15 then
        if random() < 0.5 then v_pr := v_pr + 1; else v_pv := v_pv + 1; end if;
        exit;
      end if;
    end loop;
    v_ganador := case when v_pr > v_pv then 'retador' else 'rival' end;
  end if;

  return jsonb_build_object(
    'goles_r', v_gr, 'goles_v', v_gv, 'goles', v_goles,
    'penales', case when v_gr = v_gv then jsonb_build_object('r', v_pr, 'v', v_pv, 'tiros', v_tiros) else null end,
    'ganador', v_ganador, 'fuerza_r', v_fr, 'fuerza_v', v_fv);
end
$$;

-- Suma (o resta) V-Coins y lo deja anotado.
create or replace function public._duelo_mover(p_club uuid, p_dueno text, p_cant int, p_motivo text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if coalesce(p_cant, 0) = 0 then return; end if;
  insert into public.sobres_perfil (club_id, dueno) values (p_club, p_dueno) on conflict do nothing;
  update public.sobres_perfil set puntos = puntos + p_cant where club_id = p_club and dueno = p_dueno;
  insert into public.vcoins_movimientos (club_id, dueno, cantidad, motivo, por) values (p_club, p_dueno, p_cant, p_motivo, null);
end
$$;

-- Los retos que pasaron las 48 horas: vencen y se devuelve la apuesta.
create or replace function public._duelos_vencer(p_club uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  d public.juegos_duelos;
begin
  for d in update public.juegos_duelos set estado = 'vencido'
            where club_id = p_club and estado = 'pendiente' and vence_at < now() returning *
  loop
    perform public._duelo_mover(p_club, d.retador, d.apuesta, 'Duelo vencido: se devuelve la apuesta');
  end loop;
end
$$;

-- Un duelo visto por uno de los dos (el equipo del otro sólo cuando ya se jugó).
create or replace function public._duelo_vista(d public.juegos_duelos, p_yo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', d.id, 'estado', d.estado, 'apuesta', d.apuesta, 'created_at', d.created_at, 'vence_at', d.vence_at, 'jugado_at', d.jugado_at,
    'soy', case when d.retador = p_yo then 'retador' else 'rival' end,
    'otro', public._juegos_nombre(case when d.retador = p_yo then d.rival else d.retador end),
    'mio', case when d.retador = p_yo then jsonb_build_object('formacion', d.formacion_r, 'equipo', d.equipo_r)
                when d.equipo_v is not null then jsonb_build_object('formacion', d.formacion_v, 'equipo', d.equipo_v) end,
    'suyo', case when d.estado <> 'jugado' then null
                 when d.retador = p_yo then jsonb_build_object('formacion', d.formacion_v, 'equipo', d.equipo_v)
                 else jsonb_build_object('formacion', d.formacion_r, 'equipo', d.equipo_r) end,
    'resultado', case when d.resultado is null then null else d.resultado || jsonb_build_object(
      'gane', (d.resultado ->> 'ganador') = case when d.retador = p_yo then 'retador' else 'rival' end,
      'mis_goles', case when d.retador = p_yo then d.resultado -> 'goles_r' else d.resultado -> 'goles_v' end,
      'sus_goles', case when d.retador = p_yo then d.resultado -> 'goles_v' else d.resultado -> 'goles_r' end,
      'mi_premio', case when d.retador = p_yo then d.resultado -> 'premio_r' else d.resultado -> 'premio_v' end) end,
    'nuevo', d.retador = p_yo and d.estado = 'jugado' and not d.visto_r)
$$;

-- ── LO QUE LLAMA LA APP ─────────────────────────────────────────────────────

create or replace function public.duelos_estado(p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  perform public._duelos_vencer(c.o_club);
  return jsonb_build_object(
    'yo', c.o_dueno,
    'puntos', coalesce((select puntos from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno), 0),
    'mis_cartas', (select count(*) from public.cartas_coleccion where club_id = c.o_club and dueno = c.o_dueno),
    'limites', jsonb_build_object('apuesta_max', 1000, 'abiertos_max', 5, 'premio_ganador', 20, 'premios_por_dia', 3, 'horas', 48),
    'ganados_hoy', (select count(*) from public.juegos_duelos d
                     where d.club_id = c.o_club and d.estado = 'jugado' and d.jugado_at >= (public._sobres_hoy()::timestamp at time zone 'America/Argentina/Buenos_Aires')
                       and ((d.retador = c.o_dueno and d.resultado ->> 'ganador' = 'retador')
                         or (d.rival = c.o_dueno and d.resultado ->> 'ganador' = 'rival'))),
    'rivales', coalesce((
      select jsonb_agg(jsonb_build_object('dueno', x.dueno, 'nombre', public._juegos_nombre(x.dueno), 'cartas', x.n,
                                          'pendiente', exists (select 1 from public.juegos_duelos d
                                                                where d.club_id = c.o_club and d.estado = 'pendiente'
                                                                  and ((d.retador = c.o_dueno and d.rival = x.dueno) or (d.rival = c.o_dueno and d.retador = x.dueno))))
                       order by public._juegos_nombre(x.dueno))
        from (select cc.dueno, count(*) as n from public.cartas_coleccion cc
               where cc.club_id = c.o_club and cc.dueno <> c.o_dueno
                 and not exists (select 1 from public.sobres_perfil sp where sp.club_id = c.o_club and sp.dueno = cc.dueno and sp.bloqueado)
               group by cc.dueno having count(*) >= 5) x), '[]'::jsonb),
    'recibidos', coalesce((select jsonb_agg(public._duelo_vista(d, c.o_dueno) order by d.created_at desc)
                             from public.juegos_duelos d where d.club_id = c.o_club and d.rival = c.o_dueno and d.estado = 'pendiente'), '[]'::jsonb),
    'enviados', coalesce((select jsonb_agg(public._duelo_vista(d, c.o_dueno) order by d.created_at desc)
                            from public.juegos_duelos d where d.club_id = c.o_club and d.retador = c.o_dueno and d.estado = 'pendiente'), '[]'::jsonb),
    'historial', coalesce((select jsonb_agg(public._duelo_vista(x, c.o_dueno) order by coalesce(x.jugado_at, x.created_at) desc)
                             from (select * from public.juegos_duelos d
                                    where d.club_id = c.o_club and d.estado <> 'pendiente' and c.o_dueno in (d.retador, d.rival)
                                    order by coalesce(d.jugado_at, d.created_at) desc limit 15) x), '[]'::jsonb)
  );
end
$$;

create or replace function public.duelo_retar(p_rival text, p_formacion text, p_cartas uuid[], p_apuesta int default 0, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_eq jsonb;
  v_apuesta int := coalesce(p_apuesta, 0);
  v_saldo int;
  d public.juegos_duelos;
begin
  select * into c from public._sobres_ctx(p_token);
  perform public._duelos_vencer(c.o_club);
  if p_rival is null or p_rival = c.o_dueno then raise exception 'duelo: elegí a quién retar' using errcode = '22023'; end if;
  if v_apuesta < 0 or v_apuesta > 1000 then raise exception 'duelo: la apuesta va de 0 a 1000' using errcode = '22023'; end if;
  if (select count(*) from public.cartas_coleccion where club_id = c.o_club and dueno = p_rival) < 5 then
    raise exception 'duelo: ese jugador todavía no tiene 5 cartas' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sobres_perfil where club_id = c.o_club and dueno = p_rival and bloqueado) then
    raise exception 'duelo: no se puede retar a ese jugador ahora' using errcode = 'P0001';
  end if;
  if (select count(*) from public.juegos_duelos where club_id = c.o_club and retador = c.o_dueno and estado = 'pendiente') >= 5 then
    raise exception 'duelo: ya tenés 5 retos esperando respuesta' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.juegos_duelos where club_id = c.o_club and estado = 'pendiente'
              and ((retador = c.o_dueno and rival = p_rival) or (retador = p_rival and rival = c.o_dueno))) then
    raise exception 'duelo: ya hay un duelo pendiente con ese jugador' using errcode = 'P0001';
  end if;
  v_eq := public._duelo_equipo(c.o_club, c.o_dueno, p_formacion, p_cartas);

  if v_apuesta > 0 then
    insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
    select puntos into v_saldo from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;
    if v_saldo < v_apuesta then
      raise exception 'duelo: no te alcanzan las V-Coins para esa apuesta' using errcode = 'P0001';
    end if;
    perform public._duelo_mover(c.o_club, c.o_dueno, -v_apuesta, 'Apuesta de un duelo');
  end if;

  insert into public.juegos_duelos (club_id, retador, rival, apuesta, formacion_r, equipo_r)
    values (c.o_club, c.o_dueno, p_rival, v_apuesta, p_formacion, v_eq) returning * into d;
  return public._duelo_vista(d, c.o_dueno);
end
$$;

create or replace function public.duelo_responder(p_duelo uuid, p_formacion text, p_cartas uuid[], p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  d public.juegos_duelos;
  v_eq jsonb;
  v_res jsonb;
  v_ganador text;
  v_base int;
  v_pr int := 0;
  v_pv int := 0;
  v_ganados int;
  v_saldo int;
begin
  select * into c from public._sobres_ctx(p_token);
  perform public._duelos_vencer(c.o_club);
  select * into d from public.juegos_duelos where id = p_duelo and club_id = c.o_club and rival = c.o_dueno for update;
  if not found then raise exception 'duelo: ese duelo no existe' using errcode = 'P0001'; end if;
  if d.estado <> 'pendiente' then raise exception 'duelo: ese duelo ya no está pendiente' using errcode = 'P0001'; end if;
  v_eq := public._duelo_equipo(c.o_club, c.o_dueno, p_formacion, p_cartas);

  if d.apuesta > 0 then
    insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
    select puntos into v_saldo from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;
    if v_saldo < d.apuesta then
      raise exception 'duelo: no te alcanzan las V-Coins para igualar la apuesta' using errcode = 'P0001';
    end if;
    perform public._duelo_mover(c.o_club, c.o_dueno, -d.apuesta, 'Apuesta de un duelo');
  end if;

  v_res := public._duelo_simular(d.equipo_r, d.formacion_r, v_eq, p_formacion);
  v_ganador := v_res ->> 'ganador';

  -- El premio del ganador: el pozo y, si no ganó ya 3 hoy, 20 más.
  select count(*) into v_ganados from public.juegos_duelos x
   where x.club_id = c.o_club and x.estado = 'jugado'
     and x.jugado_at >= (public._sobres_hoy()::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and ((x.retador = case when v_ganador = 'retador' then d.retador else d.rival end and x.resultado ->> 'ganador' = 'retador')
       or (x.rival = case when v_ganador = 'retador' then d.retador else d.rival end and x.resultado ->> 'ganador' = 'rival'));
  v_base := case when v_ganados < 3 then 20 else 0 end;
  if v_ganador = 'retador' then v_pr := 2 * d.apuesta + v_base; else v_pv := 2 * d.apuesta + v_base; end if;
  perform public._duelo_mover(c.o_club, d.retador, v_pr, 'Duelo ganado');
  perform public._duelo_mover(c.o_club, d.rival, v_pv, 'Duelo ganado');

  update public.juegos_duelos
     set estado = 'jugado', formacion_v = p_formacion, equipo_v = v_eq, jugado_at = now(),
         resultado = v_res || jsonb_build_object('premio_r', v_pr, 'premio_v', v_pv, 'base', v_base)
   where id = d.id returning * into d;
  return public._duelo_vista(d, c.o_dueno);
end
$$;

create or replace function public.duelo_rechazar(p_duelo uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  d public.juegos_duelos;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into d from public.juegos_duelos
   where id = p_duelo and club_id = c.o_club and c.o_dueno in (retador, rival) for update;
  if not found or d.estado <> 'pendiente' then raise exception 'duelo: ese duelo ya no está pendiente' using errcode = 'P0001'; end if;
  update public.juegos_duelos set estado = case when d.retador = c.o_dueno then 'cancelado' else 'rechazado' end
   where id = d.id returning * into d;
  perform public._duelo_mover(c.o_club, d.retador, d.apuesta,
    case when d.estado = 'cancelado' then 'Duelo cancelado: se devuelve la apuesta' else 'Duelo rechazado: se devuelve la apuesta' end);
  return public._duelo_vista(d, c.o_dueno);
end
$$;

create or replace function public.duelo_visto(p_duelo uuid, p_token uuid default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  update public.juegos_duelos set visto_r = true where id = p_duelo and club_id = c.o_club and retador = c.o_dueno;
end
$$;

revoke all on table public.juegos_duelos from anon, authenticated;
revoke all on function public._duelo_equipo(uuid, text, text, uuid[]) from public, anon, authenticated;
revoke all on function public._duelo_fuerza(jsonb, text) from public, anon, authenticated;
revoke all on function public._duelo_simular(jsonb, text, jsonb, text) from public, anon, authenticated;
revoke all on function public._duelo_mover(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public._duelos_vencer(uuid) from public, anon, authenticated;
revoke all on function public._duelo_vista(public.juegos_duelos, text) from public, anon, authenticated;
grant execute on function public.duelos_estado(uuid) to anon, authenticated;
grant execute on function public.duelo_retar(text, text, uuid[], int, uuid) to anon, authenticated;
grant execute on function public.duelo_responder(uuid, text, uuid[], uuid) to anon, authenticated;
grant execute on function public.duelo_rechazar(uuid, uuid) to anon, authenticated;
grant execute on function public.duelo_visto(uuid, uuid) to anon, authenticated;
