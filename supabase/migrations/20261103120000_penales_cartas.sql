-- ═══════════════════════════════════════════════════════════════════════════
--  JUEGOS · PENALES CON CARTAS (Y CON PREMIO)
--
--  El modo Penales deja de ser sólo práctica: elegís un pateador y un arquero
--  de TU colección (cartas_coleccion) y jugás una tanda contra la CPU, tiro por
--  tiro. Como da V-Coins, la tanda corre acá: la app sólo manda la elección.
--
--    Patear:  1 de 9 cuadrantes. El pateador vale 0,6·TIR + 0,4·IMP. El arquero
--             de la CPU (según el nivel) a veces lee el tiro; si va al mismo
--             cuadrante o a uno de al lado, ataja según su nivel contra el
--             pateador. Los ángulos pueden ir al palo (menos con buen pateador).
--    Atajar:  1 de 9 cuadrantes. El arquero vale (ATA + SAL + EVI) / 3. Si
--             adivinás el cuadrante (o llegás a uno de al lado), atajás según
--             tu arquero contra el pateador de la CPU.
--    Reloj:   5 s por tiro en la app. Sin elección (-1): el tiro va a cualquier
--             lado (30 % afuera) o el arquero se queda en el medio.
--    Tanda:   5 tiros cada uno (se corta si ya no se alcanza), muerte súbita y,
--             a los 20 cada uno, moneda (las mismas reglas que el V-Draft).
--    Premio:  ganar da V-Coins según el nivel (20 / 35 / 50 / 80), hasta 3
--             tandas premiadas por día (día de Argentina). Después se sigue
--             jugando, sin premio.
--  Y una misión diaria más: "Ganá 1 tanda de penales" (25 V-Coins).
--
--  El espejo de los números está en src/analytics/penalesCartas.js.
--  Necesita las migraciones de sobres, V-Draft (penales) y misiones. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.penales_tandas (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  dueno       text not null,
  dia         date not null default public._sobres_hoy(),
  nivel       int  not null check (nivel between 0 and 3),
  pateador    jsonb not null,                -- { catalogo_id, rareza, carta, valor }
  arquero     jsonb not null,
  primero     text not null check (primero in ('propio', 'rival')),
  tiros       jsonb not null default '[]'::jsonb,
  propio      int  not null default 0,
  rival       int  not null default 0,
  estado      text not null default 'jugando' check (estado in ('jugando', 'terminada', 'abandonada')),
  gano        boolean,
  premio      int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists penales_tandas_dueno on public.penales_tandas (club_id, dueno, dia);
alter table public.penales_tandas enable row level security;  -- sólo por las funciones
comment on table public.penales_tandas is 'Juegos: tandas de penales con cartas (con premio en V-Coins).';

-- Los números de cada nivel: la CPU (arquero y pateador) y el premio.
create or replace function public._penales_cpu(p_nivel int)
returns int language sql immutable as $$ select (array[58, 66, 74, 82])[least(3, greatest(0, p_nivel)) + 1] $$;
create or replace function public._penales_premio(p_nivel int)
returns int language sql immutable as $$ select (array[20, 35, 50, 80])[least(3, greatest(0, p_nivel)) + 1] $$;

-- Un atributo de la carta ('TIR', 'SAL'…): carta.atributos es [["TIR", 85], …].
create or replace function public._penales_atr(p_carta jsonb, p_clave text)
returns numeric language sql immutable as $$
  select (x ->> 1)::numeric from jsonb_array_elements(coalesce(p_carta -> 'atributos', '[]'::jsonb)) x
   where x ->> 0 = p_clave limit 1
$$;

create or replace function public._penales_valor_pateador(p_carta jsonb)
returns int language sql immutable as $$
  select coalesce(round(0.6 * public._penales_atr(p_carta, 'TIR') + 0.4 * public._penales_atr(p_carta, 'IMP')),
                  round(coalesce((p_carta ->> 'ovr')::numeric, 60)))::int
$$;

create or replace function public._penales_valor_arquero(p_carta jsonb)
returns int language sql immutable as $$
  select coalesce(round((public._penales_atr(p_carta, 'ATA') + public._penales_atr(p_carta, 'SAL') + public._penales_atr(p_carta, 'EVI')) / 3),
                  round(coalesce((p_carta ->> 'ovr')::numeric, 60)))::int
$$;

create or replace function public._penales_limitar(x numeric, a numeric, b numeric)
returns numeric language sql immutable as $$ select greatest(a, least(b, x)) $$;

create or replace function public._penales_vecinos(a int, b int)
returns boolean language sql immutable as $$ select abs(a / 3 - b / 3) <= 1 and abs(a % 3 - b % 3) <= 1 $$;

-- Cuántas tandas premiadas lleva hoy.
create or replace function public._penales_premiadas_hoy(p_club uuid, p_dueno text)
returns int language sql stable as $$
  select count(*)::int from public.penales_tandas
   where club_id = p_club and dueno = p_dueno and dia = public._sobres_hoy() and premio > 0
$$;

-- La tanda como la ve el jugador (mismo formato que la del V-Draft, más las cartas).
create or replace function public._penales_vista(t public.penales_tandas)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', t.id, 'nivel', t.nivel, 'estado', t.estado, 'gano', t.gano, 'premio', t.premio,
    'pateador', t.pateador, 'arquero', t.arquero, 'cpu', public._penales_cpu(t.nivel),
    'primero', t.primero, 'tiros', t.tiros, 'propio', t.propio, 'rival', t.rival,
    'turno', public._vdraft_tanda_turno(jsonb_build_object('primero', t.primero, 'tiros', t.tiros)))
$$;

-- La carta de la colección del dueño, en el formato de la app (o null si no es suya).
create or replace function public._penales_carta_mia(p_club uuid, p_dueno text, p_catalogo uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object('catalogo_id', k.id, 'rareza', k.rareza, 'carta', public._sobres_carta(k))
    from public.cartas_coleccion cc join public.cartas_catalogo k on k.id = cc.catalogo_id
   where cc.club_id = p_club and cc.dueno = p_dueno and cc.catalogo_id = p_catalogo
$$;

-- Lo que necesita la pantalla: tus cartas, los premios de hoy y la tanda a medias.
create or replace function public.penales_estado(p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  t public.penales_tandas;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into t from public.penales_tandas
   where club_id = c.o_club and dueno = c.o_dueno and estado = 'jugando' order by created_at desc limit 1;
  return jsonb_build_object(
    'cartas', coalesce((
      select jsonb_agg(jsonb_build_object('catalogo_id', k.id, 'rareza', k.rareza, 'carta', public._sobres_carta(k)))
        from public.cartas_coleccion cc join public.cartas_catalogo k on k.id = cc.catalogo_id
       where cc.club_id = c.o_club and cc.dueno = c.o_dueno), '[]'::jsonb),
    'premiadas_hoy', public._penales_premiadas_hoy(c.o_club, c.o_dueno),
    'limite', 3,
    'puntos', coalesce((select puntos from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno), 0),
    'record', (select jsonb_build_object('jugadas', count(*), 'ganadas', count(*) filter (where gano))
                 from public.penales_tandas where club_id = c.o_club and dueno = c.o_dueno and estado <> 'jugando'),
    'tanda', case when t.id is null then null else public._penales_vista(t) end);
end
$$;

-- Empezar una tanda: con un pateador y un arquero tuyos. Si había una a medias, queda abandonada.
create or replace function public.penales_nueva(p_pateador uuid, p_arquero uuid, p_nivel int, p_primero text default 'sorteo', p_token uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_pat jsonb;
  v_arq jsonb;
  t public.penales_tandas;
begin
  select * into c from public._sobres_ctx(p_token);
  if p_nivel is null or p_nivel < 0 or p_nivel > 3 then raise exception 'penales: elegí un nivel' using errcode = '22023'; end if;
  v_pat := public._penales_carta_mia(c.o_club, c.o_dueno, p_pateador);
  v_arq := public._penales_carta_mia(c.o_club, c.o_dueno, p_arquero);
  if v_pat is null or v_arq is null then raise exception 'penales: esas cartas no son tuyas' using errcode = 'P0001'; end if;
  if v_pat -> 'carta' ->> 'rol' = 'ARQ' then raise exception 'penales: el pateador tiene que ser un jugador de campo' using errcode = 'P0001'; end if;
  if v_arq -> 'carta' ->> 'rol' is distinct from 'ARQ' then raise exception 'penales: el arquero tiene que ser una carta de arquero' using errcode = 'P0001'; end if;

  update public.penales_tandas set estado = 'abandonada', gano = false, updated_at = now()
   where club_id = c.o_club and dueno = c.o_dueno and estado = 'jugando';

  insert into public.penales_tandas (club_id, dueno, nivel, pateador, arquero, primero)
  values (c.o_club, c.o_dueno, p_nivel,
          v_pat || jsonb_build_object('valor', public._penales_valor_pateador(v_pat -> 'carta')),
          v_arq || jsonb_build_object('valor', public._penales_valor_arquero(v_arq -> 'carta')),
          case when p_primero in ('propio', 'rival') then p_primero
               else case when random() < 0.5 then 'propio' else 'rival' end end)
  returning * into t;
  return public._penales_vista(t)
         || jsonb_build_object('premiadas_hoy', public._penales_premiadas_hoy(c.o_club, c.o_dueno), 'limite', 3);
end
$$;

-- Un tiro. p_eleccion: el cuadrante (0-8) al que pateás o al que te tirás; -1 si se acabó el tiempo.
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
      v_premio := public._penales_premio(t.nivel);
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

-- Dejar la tanda: cuenta como perdida, sin premio.
create or replace function public.penales_abandonar(p_tanda uuid, p_token uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  update public.penales_tandas set estado = 'abandonada', gano = false, updated_at = now()
   where id = p_tanda and club_id = c.o_club and dueno = c.o_dueno and estado = 'jugando';
  return jsonb_build_object('ok', true);
end
$$;

-- Las misiones del día, ahora con la de penales.
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
           'id', p.id, 'titulo', p.titulo, 'meta', p.meta, 'premio', p.premio,
           'progreso', least(p.progreso, p.meta),
           'cobrada', exists (select 1 from public.juegos_misiones_cobradas c, hoy
                               where c.club_id = p_club and c.dueno = p_dueno and c.dia = hoy.d and c.mision = p.id))
         order by p.orden), '[]'::jsonb)
    from prog p
$$;

revoke all on table public.penales_tandas from anon, authenticated;
revoke all on function public._juegos_misiones(uuid, text) from public, anon, authenticated;
revoke all on function public._penales_premiadas_hoy(uuid, text) from public, anon, authenticated;
revoke all on function public._penales_carta_mia(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public._penales_vista(public.penales_tandas) from public, anon, authenticated;
grant execute on function public.penales_estado(uuid) to anon, authenticated;
grant execute on function public.penales_nueva(uuid, uuid, int, text, uuid) to anon, authenticated;
grant execute on function public.penales_tiro(uuid, int, uuid) to anon, authenticated;
grant execute on function public.penales_abandonar(uuid, uuid) to anon, authenticated;
