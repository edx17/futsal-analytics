-- ═══════════════════════════════════════════════════════════════════════════
--  JUEGOS · LO QUE PAGA CADA JUEGO (Configurador GOD › V-Coins)
--
--  Hasta ahora los premios estaban fijos adentro de cada función. Ahora cada
--  club puede cambiarlos (juegos_premios.valores); lo que no cambie sigue con
--  el valor de siempre (_juegos_premios_defecto):
--
--    penales_n0..n3       tanda ganada por nivel            20 · 35 · 50 · 80
--    penales_por_dia      tandas con premio por día         3
--    vdraft_v1..v4        partida normal por victorias      25 · 75 · 150 · 300
--    desafio_1..3, _resto desafío del día por puesto        1000 · 750 · 500 · 150
--    duelo_ganador        extra para el que gana un duelo   20
--    duelo_premios_dia    duelos ganados con extra por día  3
--    duelo_apuesta_max    apuesta máxima de un duelo        1000
--    rep_<rareza>         carta repetida en un sobre        bronce 5 · plata 10 · oro 25 · totw 40
--                                                           potw 50 · totm 60 · potm 75 · toty 100
--  Las misiones tienen su propio premio (20261115120000) y el torneo semanal
--  su configuración (god_torneo_config). El x2 de V-Coins sigue aplicando.
--
--    _juegos_premio(club, clave)        el valor que corre
--    god_premios(p_club)                → { valores, defecto, personalizados }
--    god_premios_guardar(p_club, json)  guarda los que se pasen (el resto, de siempre)
--    god_premios_restablecer(p_club)    vuelve todo a los de siempre
--
--  Las funciones que pagan se PARCHAN EN EL LUGAR: se toma su definición
--  actual (pg_get_functiondef) y se cambia sólo el número fijo por
--  _juegos_premio(...). Si no se encuentra el texto exacto, la migración
--  falla y no cambia nada. Parchadas: sobres_abrir, sobres_abrir_evento,
--  penales_tiro, penales_nueva, penales_estado, _vdraft_terminar,
--  _vdraft_desafio_cerrar, vdraft_estado, duelo_retar, duelo_responder,
--  duelos_estado. Además, penales_estado y vdraft_estado devuelven los
--  premios (premios_nivel, premios_victorias) para que la pantalla muestre
--  los del club. Va después de 20261115120000_juegos_misiones_config.sql.
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.juegos_premios (
  club_id    uuid primary key references public.clubes(id) on delete cascade,
  valores    jsonb not null default '{}'::jsonb check (jsonb_typeof(valores) = 'object'),
  updated_at timestamptz not null default now(),
  por        uuid default auth.uid()
);
alter table public.juegos_premios enable row level security;   -- sólo por las funciones
revoke all on table public.juegos_premios from anon, authenticated;
comment on table public.juegos_premios is 'Juegos: lo que paga cada juego en el club (Configurador GOD › V-Coins). Lo que no está, vale el de siempre.';

create or replace function public._juegos_premios_defecto()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'penales_n0', 20, 'penales_n1', 35, 'penales_n2', 50, 'penales_n3', 80, 'penales_por_dia', 3,
    'vdraft_v1', 25, 'vdraft_v2', 75, 'vdraft_v3', 150, 'vdraft_v4', 300,
    'desafio_1', 1000, 'desafio_2', 750, 'desafio_3', 500, 'desafio_resto', 150,
    'duelo_ganador', 20, 'duelo_premios_dia', 3, 'duelo_apuesta_max', 1000,
    'rep_bronce', 5, 'rep_plata', 10, 'rep_oro', 25, 'rep_totw', 40, 'rep_potw', 50, 'rep_totm', 60, 'rep_potm', 75, 'rep_toty', 100)
$$;

-- El valor que corre en el club para una clave (el del club o el de siempre).
create or replace function public._juegos_premio(p_club uuid, p_clave text)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (p.valores ->> p_clave)::int from public.juegos_premios p where p.club_id = p_club),
                  (public._juegos_premios_defecto() ->> p_clave)::int, 0)
$$;

-- Versiones con club de los ayudantes de siempre (las de un solo argumento quedan como estaban).
create or replace function public._sobres_puntos(p_rareza text, p_club uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when p_rareza in ('bronce', 'plata', 'oro', 'totw', 'potw', 'totm', 'potm', 'toty')
              then public._juegos_premio(p_club, 'rep_' || p_rareza)
              else public._sobres_puntos(p_rareza) end
$$;

create or replace function public._penales_premio(p_nivel int, p_club uuid)
returns int language sql stable security definer set search_path = public as $$
  select public._juegos_premio(p_club, 'penales_n' || least(3, greatest(0, p_nivel)))
$$;

-- ── Parches en el lugar ─────────────────────────────────────────────────────
create or replace function pg_temp.parchear(p_fn regprocedure, p_viejo text, p_nuevo text)
returns void language plpgsql as $$
declare
  d text := pg_get_functiondef(p_fn);
begin
  if position(p_nuevo in d) > 0 then return; end if;   -- ya estaba parchada
  if position(p_viejo in d) = 0 then
    raise exception 'juegos_premios: no encontré «%» en %', p_viejo, p_fn;
  end if;
  execute replace(d, p_viejo, p_nuevo);
end
$$;

-- Repetidas
select pg_temp.parchear('public.sobres_abrir(text, uuid)'::regprocedure,
  'public._sobres_puntos(k.rareza) *', 'public._sobres_puntos(k.rareza, c.o_club) *');
select pg_temp.parchear('public.sobres_abrir_evento(uuid, uuid)'::regprocedure,
  'public._sobres_puntos(k.rareza) *', 'public._sobres_puntos(k.rareza, c.o_club) *');

-- Penales
select pg_temp.parchear('public.penales_tiro(uuid, integer, uuid)'::regprocedure,
  'public._penales_premio(t.nivel) *', 'public._penales_premio(t.nivel, c.o_club) *');
select pg_temp.parchear('public.penales_tiro(uuid, integer, uuid)'::regprocedure,
  'public._penales_premiadas_hoy(c.o_club, c.o_dueno) < 3 then',
  'public._penales_premiadas_hoy(c.o_club, c.o_dueno) < public._juegos_premio(c.o_club, ''penales_por_dia'') then');
select pg_temp.parchear('public.penales_tiro(uuid, integer, uuid)'::regprocedure,
  '''limite'', 3)', '''limite'', public._juegos_premio(c.o_club, ''penales_por_dia''))');
select pg_temp.parchear('public.penales_nueva(uuid, uuid, integer, text, uuid)'::regprocedure,
  '''limite'', 3)', '''limite'', public._juegos_premio(c.o_club, ''penales_por_dia''))');
select pg_temp.parchear('public.penales_estado(uuid)'::regprocedure,
  '''limite'', 3,',
  '''limite'', public._juegos_premio(c.o_club, ''penales_por_dia''), ''premios_nivel'', jsonb_build_array(public._juegos_premio(c.o_club, ''penales_n0''), public._juegos_premio(c.o_club, ''penales_n1''), public._juegos_premio(c.o_club, ''penales_n2''), public._juegos_premio(c.o_club, ''penales_n3'')),');

-- V-Draft: partida normal por victorias
select pg_temp.parchear('public._vdraft_terminar(uuid)'::regprocedure,
  'case p.victorias when 1 then 25 when 2 then 75 when 3 then 150 when 4 then 300 else 0 end',
  'case when p.victorias between 1 and 4 then public._juegos_premio(p.club_id, ''vdraft_v'' || p.victorias) else 0 end');
select pg_temp.parchear('public.vdraft_estado(uuid)'::regprocedure,
  '''gratis_hoy'', v_gratis,',
  '''gratis_hoy'', v_gratis, ''premios_victorias'', jsonb_build_array(public._juegos_premio(c.o_club, ''vdraft_v1''), public._juegos_premio(c.o_club, ''vdraft_v2''), public._juegos_premio(c.o_club, ''vdraft_v3''), public._juegos_premio(c.o_club, ''vdraft_v4'')),');

-- V-Draft: desafío del día por puesto
select pg_temp.parchear('public._vdraft_desafio_cerrar(uuid)'::regprocedure,
  'when t.puesto = 1 then 1000 when t.puesto = 2 then 750 when t.puesto = 3 then 500',
  'when t.puesto = 1 then public._juegos_premio(p_club, ''desafio_1'') when t.puesto = 2 then public._juegos_premio(p_club, ''desafio_2'') when t.puesto = 3 then public._juegos_premio(p_club, ''desafio_3'')');
select pg_temp.parchear('public._vdraft_desafio_cerrar(uuid)'::regprocedure,
  'else 150 end;', 'else public._juegos_premio(p_club, ''desafio_resto'') end;');
select pg_temp.parchear('public.vdraft_estado(uuid)'::regprocedure,
  '''premios'', jsonb_build_array(1000, 750, 500, 150),',
  '''premios'', jsonb_build_array(public._juegos_premio(c.o_club, ''desafio_1''), public._juegos_premio(c.o_club, ''desafio_2''), public._juegos_premio(c.o_club, ''desafio_3''), public._juegos_premio(c.o_club, ''desafio_resto'')),');

-- Duelos
select pg_temp.parchear('public.duelo_retar(text, text, uuid[], integer, uuid)'::regprocedure,
  'if v_apuesta < 0 or v_apuesta > 1000 then raise exception ''duelo: la apuesta va de 0 a 1000'' using',
  'if v_apuesta < 0 or v_apuesta > public._juegos_premio(c.o_club, ''duelo_apuesta_max'') then raise exception ''duelo: la apuesta va de 0 a %'', public._juegos_premio(c.o_club, ''duelo_apuesta_max'') using');
select pg_temp.parchear('public.duelo_responder(uuid, text, uuid[], uuid)'::regprocedure,
  'v_base := case when v_ganados < 3 then 20 else 0 end;',
  'v_base := case when v_ganados < public._juegos_premio(c.o_club, ''duelo_premios_dia'') then public._juegos_premio(c.o_club, ''duelo_ganador'') else 0 end;');
select pg_temp.parchear('public.duelos_estado(uuid)'::regprocedure,
  '''apuesta_max'', 1000, ''abiertos_max'', 5, ''premio_ganador'', 20, ''premios_por_dia'', 3,',
  '''apuesta_max'', public._juegos_premio(c.o_club, ''duelo_apuesta_max''), ''abiertos_max'', 5, ''premio_ganador'', public._juegos_premio(c.o_club, ''duelo_ganador''), ''premios_por_dia'', public._juegos_premio(c.o_club, ''duelo_premios_dia''),');

-- ── CONFIGURADOR GOD (sólo el superusuario) ─────────────────────────────────

create or replace function public.god_premios(p_club uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_club jsonb := coalesce((select valores from public.juegos_premios where club_id = p_club), '{}'::jsonb);
begin
  perform public._god_o_error();
  return jsonb_build_object('defecto', public._juegos_premios_defecto(),
                            'valores', public._juegos_premios_defecto() || v_club,
                            'personalizados', v_club);
end
$$;

-- Guarda los valores que se pasen ({ clave: número }). Sólo claves conocidas y
-- números enteros: de 0 a 50 los topes por día, de 0 a 100000 el resto.
-- Los que quedan igual al de siempre no se guardan (así siguen al de siempre).
create or replace function public.god_premios_guardar(p_club uuid, p_valores jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_def jsonb := public._juegos_premios_defecto();
  v_nuevo jsonb := '{}'::jsonb;
  k text; v jsonb; n numeric; v_max int;
begin
  perform public._god_o_error();
  if jsonb_typeof(p_valores) <> 'object' then raise exception 'god: los premios van como { clave: número }' using errcode = 'P0001'; end if;
  for k, v in select * from jsonb_each(p_valores) loop
    if not v_def ? k then raise exception 'god: no conozco el premio «%»', k using errcode = 'P0001'; end if;
    if jsonb_typeof(v) <> 'number' then raise exception 'god: «%» tiene que ser un número', k using errcode = 'P0001'; end if;
    n := (v #>> '{}')::numeric;
    v_max := case when k in ('penales_por_dia', 'duelo_premios_dia') then 50 else 100000 end;
    if n <> trunc(n) or n < 0 or n > v_max then
      raise exception 'god: «%» va de 0 a % (entero)', k, v_max using errcode = 'P0001';
    end if;
    if n::int <> (v_def ->> k)::int then v_nuevo := v_nuevo || jsonb_build_object(k, n::int); end if;
  end loop;

  if v_nuevo = '{}'::jsonb then
    delete from public.juegos_premios where club_id = p_club;
  else
    insert into public.juegos_premios (club_id, valores, updated_at, por) values (p_club, v_nuevo, now(), auth.uid())
    on conflict (club_id) do update set valores = excluded.valores, updated_at = now(), por = auth.uid();
  end if;
  return public.god_premios(p_club);
end
$$;

create or replace function public.god_premios_restablecer(p_club uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._god_o_error();
  delete from public.juegos_premios where club_id = p_club;
  return public.god_premios(p_club);
end
$$;

revoke all on function public._juegos_premios_defecto() from public, anon, authenticated;
revoke all on function public._juegos_premio(uuid, text) from public, anon, authenticated;
revoke all on function public._sobres_puntos(text, uuid) from public, anon, authenticated;
revoke all on function public._penales_premio(integer, uuid) from public, anon, authenticated;
revoke all on function public.god_premios(uuid) from public, anon;
revoke all on function public.god_premios_guardar(uuid, jsonb) from public, anon;
revoke all on function public.god_premios_restablecer(uuid) from public, anon;
grant execute on function public.god_premios(uuid) to authenticated;
grant execute on function public.god_premios_guardar(uuid, jsonb) to authenticated;
grant execute on function public.god_premios_restablecer(uuid) to authenticated;
