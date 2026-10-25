-- ═══════════════════════════════════════════════════════════════════════════
--  V-DRAFT: LOS PENALES SE PATEAN
--
--  Si el partido termina empatado, la tanda ya no se sortea sola: queda
--  pendiente (vdraft_partidas.tanda) y el jugador la juega tiro por tiro con
--  vdraft_penal. Cuántas veces hay empate NO cambia: la simulación del partido
--  es la misma de siempre; sólo cambia quién define la tanda.
--
--  Patear:  el jugador elige 1 de 9 cuadrantes del arco (0 = arriba a la
--           izquierda … 8 = abajo a la derecha). El arquero (la CPU) se tira a
--           uno al azar: si es el mismo, ataja; si es uno de al lado, llega con
--           la chance `alcance`; los ángulos pueden ir al palo/afuera (`palo`).
--  Atajar:  el jugador elige izquierda, centro o derecha (0, 1, 2). El rival
--           patea a uno de los 9; si es la misma columna, ataja con la chance
--           `ataja`; a veces el rival la tira afuera (`afuera`).
--  La dificultad sube con la ronda (D, C, B, A): el arquero llega más, los
--  ángulos son más exigentes y los rivales patean mejor. Jugando al azar se
--  gana ~64% de las tandas en cuartos y ~42% contra la A (antes: ~50% ± la
--  diferencia de fuerza).
--  5 tiros cada uno (se corta cuando ya no se puede alcanzar) y después muerte
--  súbita; a los 20 tiros cada uno, moneda.
--
--  TODO SE DECIDE ACÁ: la app sólo manda la elección del jugador. El espejo de
--  los números está en src/analytics/penales.js. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.vdraft_partidas add column if not exists tanda jsonb;

-- La dificultad de la tanda según la ronda (0 = cuartos vs Primera D … 3 = vs A).
create or replace function public._vdraft_tanda_nueva(p_ronda int)
returns jsonb language sql volatile as $$
  select jsonb_build_object(
    'ronda', least(3, greatest(0, p_ronda)),
    'alcance', (array[0.18, 0.22, 0.26, 0.30])[least(3, greatest(0, p_ronda)) + 1],
    'palo',    (array[0.04, 0.05, 0.06, 0.07])[least(3, greatest(0, p_ronda)) + 1],
    'ataja',   (array[0.75, 0.71, 0.67, 0.63])[least(3, greatest(0, p_ronda)) + 1],
    'afuera',  (array[0.06, 0.05, 0.045, 0.04])[least(3, greatest(0, p_ronda)) + 1],
    'primero', case when random() < 0.5 then 'propio' else 'rival' end,
    'tiros', '[]'::jsonb, 'propio', 0, 'rival', 0)
$$;

-- A quién le toca: alternan, empezando por `primero`.
create or replace function public._vdraft_tanda_turno(t jsonb)
returns text language sql immutable as $$
  select case
    when (select count(*) from jsonb_array_elements(t -> 'tiros') x where x ->> 'equipo' = 'propio')
       = (select count(*) from jsonb_array_elements(t -> 'tiros') x where x ->> 'equipo' = 'rival')
    then t ->> 'primero'
    else case when t ->> 'primero' = 'propio' then 'rival' else 'propio' end end
$$;

-- ¿Terminó? Devuelve 'propio', 'rival' o null.
create or replace function public._vdraft_tanda_ganador(t jsonb)
returns text language plpgsql immutable as $$
declare
  np int; nr int; gp int; gr int;
begin
  select count(*) filter (where x ->> 'equipo' = 'propio'), count(*) filter (where x ->> 'equipo' = 'rival')
    into np, nr from jsonb_array_elements(t -> 'tiros') x;
  gp := (t ->> 'propio')::int; gr := (t ->> 'rival')::int;
  if np <= 5 and nr <= 5 then
    -- Los cinco: se corta cuando uno ya no puede alcanzar al otro.
    if gp > gr + (5 - nr) then return 'propio'; end if;
    if gr > gp + (5 - np) then return 'rival'; end if;
    if np = 5 and nr = 5 and gp <> gr then return case when gp > gr then 'propio' else 'rival' end; end if;
    return null;
  end if;
  -- Muerte súbita: después de cada par.
  if np = nr and gp <> gr then return case when gp > gr then 'propio' else 'rival' end; end if;
  return null;
end
$$;

-- La partida como la ve el jugador, ahora con la tanda pendiente.
create or replace function public._vdraft_vista(p public.vdraft_partidas)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'estado', p.estado, 'paga', p.paga, 'formacion', p.formacion, 'lugares', p.lugares,
    'equipo', p.equipo, 'banco', p.banco, 'capitan', p.capitan, 'paso', p.paso, 'lugar_actual', p.lugar_actual,
    'oferta', p.oferta, 'rivales', p.rivales, 'partidos', p.partidos, 'victorias', p.victorias,
    'premio', p.premio, 'fuerza', public._vdraft_fuerza(p),
    'tanda', case when p.tanda is null then null
                  else p.tanda || jsonb_build_object('turno', public._vdraft_tanda_turno(p.tanda)) end)
$$;

-- Jugar el partido: igual que antes; si empata, la tanda queda para jugarla.
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
  i int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.estado <> 'torneo' then raise exception 'vdraft: no hay partido para jugar' using errcode = 'P0001'; end if;
  if p.tanda is not null then raise exception 'vdraft: primero terminá la tanda de penales' using errcode = 'P0001'; end if;

  v_n := jsonb_array_length(p.partidos);
  v_rival := p.rivales -> v_n;
  v_f := public._vdraft_fuerza(p);
  v_dif := (v_f ->> 'fuerza')::numeric - (v_rival ->> 'fuerza')::numeric;

  -- Unos 2,5 goles por equipo entre parejos; la diferencia de fuerza los mueve.
  v_gp := public._vdraft_poisson(2.5 * exp(v_dif / 15.0));
  v_gr := public._vdraft_poisson(2.5 * exp(-v_dif / 15.0));

  v_mins := array(select 1 + floor(random() * 40)::int from generate_series(1, v_gp + v_gr) order by 1);
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

  v_gano := case when v_gp > v_gr then true when v_gp < v_gr then false else null end;

  p.partidos := p.partidos || jsonb_build_array(jsonb_build_object(
    'ronda', v_rival ->> 'ronda', 'rival', v_rival ->> 'equipo', 'division', v_rival ->> 'division',
    'goles_propios', v_gp, 'goles_rival', v_gr, 'penales', null, 'pendiente', v_gano is null,
    'gano', v_gano, 'goles', v_goles,
    'fuerza_propia', v_f ->> 'fuerza', 'fuerza_rival', v_rival ->> 'fuerza'));

  if v_gano is null then
    -- Empate: la tanda la juega el jugador (vdraft_penal).
    update public.vdraft_partidas set partidos = p.partidos, tanda = public._vdraft_tanda_nueva(v_n), updated_at = now()
     where id = p.id;
  else
    p.victorias := p.victorias + case when v_gano then 1 else 0 end;
    update public.vdraft_partidas set partidos = p.partidos, victorias = p.victorias, updated_at = now() where id = p.id;
    if not v_gano or p.victorias >= 4 then perform public._vdraft_terminar(p.id); end if;
  end if;

  select * into p from public.vdraft_partidas where id = p.id;
  return public._vdraft_vista(p) || jsonb_build_object('ultimo', p.partidos -> (jsonb_array_length(p.partidos) - 1));
end
$$;

-- Un tiro de la tanda. p_eleccion: el cuadrante (0-8) si patea el jugador; el
-- lado (0 izquierda, 1 centro, 2 derecha) si ataja.
create or replace function public.vdraft_penal(p_partida uuid, p_eleccion int, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  t jsonb;
  v_turno text;
  v_celda int;
  v_arquero int;
  v_gol boolean;
  v_motivo text;
  v_tiro jsonb;
  v_ganador text;
  v_np int;
  v_ultimo jsonb;
  v_n int;
  v_gano boolean;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.tanda is null then raise exception 'vdraft: no hay penales para patear' using errcode = 'P0001'; end if;
  t := p.tanda;
  v_turno := public._vdraft_tanda_turno(t);

  if v_turno = 'propio' then
    if p_eleccion is null or p_eleccion < 0 or p_eleccion > 8 then
      raise exception 'vdraft: elegí un cuadrante del arco (0 a 8)' using errcode = '22023';
    end if;
    v_celda := p_eleccion;
    v_arquero := floor(random() * 9)::int;
    if v_celda in (0, 2, 6, 8) and random() < (t ->> 'palo')::numeric then
      v_gol := false; v_motivo := 'palo';
    elsif v_arquero = v_celda then
      v_gol := false; v_motivo := 'atajada';
    elsif abs(v_arquero / 3 - v_celda / 3) <= 1 and abs(v_arquero % 3 - v_celda % 3) <= 1
          and random() < (t ->> 'alcance')::numeric then
      v_gol := false; v_motivo := 'atajada';
    else
      v_gol := true; v_motivo := 'gol';
    end if;
    v_tiro := jsonb_build_object('equipo', 'propio', 'celda', v_celda, 'arquero', v_arquero, 'gol', v_gol, 'motivo', v_motivo);
  else
    if p_eleccion is null or p_eleccion < 0 or p_eleccion > 2 then
      raise exception 'vdraft: elegí un lado para atajar (0, 1 o 2)' using errcode = '22023';
    end if;
    v_celda := floor(random() * 9)::int;
    if random() < (t ->> 'afuera')::numeric then
      v_gol := false; v_motivo := 'afuera';
    elsif v_celda % 3 = p_eleccion and random() < (t ->> 'ataja')::numeric then
      v_gol := false; v_motivo := 'atajada';
    else
      v_gol := true; v_motivo := 'gol';
    end if;
    v_tiro := jsonb_build_object('equipo', 'rival', 'celda', v_celda, 'lado', p_eleccion, 'gol', v_gol, 'motivo', v_motivo);
  end if;

  t := jsonb_set(t, '{tiros}', (t -> 'tiros') || jsonb_build_array(v_tiro));
  if v_gol then t := jsonb_set(t, array[v_turno], to_jsonb((t ->> v_turno)::int + 1)); end if;

  v_ganador := public._vdraft_tanda_ganador(t);
  select count(*) into v_np from jsonb_array_elements(t -> 'tiros') x where x ->> 'equipo' = 'propio';
  if v_ganador is null and v_np >= 20 and public._vdraft_tanda_turno(t) = t ->> 'primero' then
    v_ganador := case when random() < 0.5 then 'propio' else 'rival' end;   -- moneda
  end if;

  if v_ganador is null then
    update public.vdraft_partidas set tanda = t, updated_at = now() where id = p.id;
  else
    -- Se definió: el resultado va al partido y sigue el torneo como siempre.
    v_gano := v_ganador = 'propio';
    v_n := jsonb_array_length(p.partidos) - 1;
    v_ultimo := (p.partidos -> v_n)
      || jsonb_build_object('gano', v_gano, 'pendiente', false,
                            'penales', (t ->> 'propio') || '-' || (t ->> 'rival'), 'tanda', t -> 'tiros');
    p.partidos := jsonb_set(p.partidos, array[v_n::text], v_ultimo);
    p.victorias := p.victorias + case when v_gano then 1 else 0 end;
    update public.vdraft_partidas set partidos = p.partidos, victorias = p.victorias, tanda = null, updated_at = now()
     where id = p.id;
    if not v_gano or p.victorias >= 4 then perform public._vdraft_terminar(p.id); end if;
  end if;

  select * into p from public.vdraft_partidas where id = p.id;
  return public._vdraft_vista(p)
         || jsonb_build_object('tiro', v_tiro, 'marcador', jsonb_build_object('propio', t -> 'propio', 'rival', t -> 'rival'),
                               'definida', v_ganador is not null,
                               'ultimo', p.partidos -> (jsonb_array_length(p.partidos) - 1));
end
$$;

-- Abandonar con la tanda pendiente: ese partido cuenta como perdido.
create or replace function public.vdraft_abandonar(p_partida uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  v_n int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.estado = 'terminada' then raise exception 'vdraft: no hay partida en juego' using errcode = 'P0001'; end if;
  if p.tanda is not null then
    v_n := jsonb_array_length(p.partidos) - 1;
    update public.vdraft_partidas
       set tanda = null,
           partidos = jsonb_set(partidos, array[v_n::text], (partidos -> v_n) || '{"gano": false, "pendiente": false, "penales": "abandonó"}'::jsonb)
     where id = p.id;
  end if;
  perform public._vdraft_terminar(p.id);
  select * into p from public.vdraft_partidas where id = p.id;
  return public._vdraft_vista(p);
end
$$;

revoke all on function public._vdraft_tanda_nueva(int) from public, anon, authenticated;
revoke all on function public._vdraft_tanda_turno(jsonb) from public, anon, authenticated;
revoke all on function public._vdraft_tanda_ganador(jsonb) from public, anon, authenticated;
grant execute on function public.vdraft_jugar(uuid, uuid) to anon, authenticated;
grant execute on function public.vdraft_penal(uuid, int, uuid) to anon, authenticated;
grant execute on function public.vdraft_abandonar(uuid, uuid) to anon, authenticated;
