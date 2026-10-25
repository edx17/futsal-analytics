-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: USUARIOS Y V-COINS (Modo GOD · USUARIOS)
--
--  Para el superusuario:
--    · god_usuarios(club)      todos los del club (jugadores y staff) con sus
--                              V-Coins, cartas, sobres, partidas de V-Draft y
--                              última actividad;
--    · god_bloquear(…)         suspender o habilitar a alguien en el juego: el
--                              bloqueado no puede abrir sobres ni jugar al
--                              V-Draft (lo frena _sobres_ctx, la puerta de todo);
--    · god_vcoins(…)           sumar o restar V-Coins a uno, a varios o a todos
--                              (regalos masivos). Nunca queda en negativo.
--    · vcoins_multiplicadores  eventos de "V-Coins x2" (o x1,5, x3) con fecha:
--                              mientras corren, lo que se gana en sobres
--                              (repetidas) y en el V-Draft (premios) se
--                              multiplica. Sobres lo avisa (estado.multiplicador).
--  Todo movimiento hecho a mano queda en vcoins_movimientos (quién, cuánto, por qué).
--
--  Recrea sobres_abrir / sobres_estado (de 20261023120000), sobres_abrir_evento
--  (de 20261022140000) y _vdraft_terminar (de 20261020120000) cambiando SÓLO
--  las V-Coins que se ganan. Va después de 20261023120000. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.sobres_perfil add column if not exists bloqueado boolean not null default false;
alter table public.sobres_perfil add column if not exists bloqueo_motivo text;
alter table public.sobres_perfil add column if not exists bloqueado_at timestamptz;

create table if not exists public.vcoins_movimientos (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubes(id) on delete cascade,
  dueno      text not null,
  cantidad   integer not null,
  motivo     text,
  por        uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists vcoins_movimientos_club on public.vcoins_movimientos (club_id, created_at desc);
comment on table public.vcoins_movimientos is 'MySquad: V-Coins dadas o quitadas a mano por el superusuario.';

create table if not exists public.vcoins_multiplicadores (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubes(id) on delete cascade,
  nombre     text not null check (length(trim(nombre)) between 1 and 60),
  factor     numeric not null check (factor >= 1 and factor <= 5),
  desde      timestamptz not null,
  hasta      timestamptz not null,
  activo     boolean not null default true,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (hasta > desde)
);
create index if not exists vcoins_multiplicadores_club on public.vcoins_multiplicadores (club_id, activo, desde, hasta);
comment on table public.vcoins_multiplicadores is 'MySquad: eventos de V-Coins multiplicadas (x2…), con fecha.';

alter table public.vcoins_movimientos enable row level security;
alter table public.vcoins_multiplicadores enable row level security;
drop policy if exists "Superuser SELECT vcoins_movimientos" on public.vcoins_movimientos;
create policy "Superuser SELECT vcoins_movimientos" on public.vcoins_movimientos for select to authenticated
  using ((select public.get_user_rol()) = 'superuser');
drop policy if exists "Staff SELECT vcoins_multiplicadores" on public.vcoins_multiplicadores;
create policy "Staff SELECT vcoins_multiplicadores" on public.vcoins_multiplicadores for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin') and club_id::text = (select public.get_user_club_id())));
drop policy if exists "Superuser ALL vcoins_multiplicadores" on public.vcoins_multiplicadores;
create policy "Superuser ALL vcoins_multiplicadores" on public.vcoins_multiplicadores for all to authenticated
  using ((select public.get_user_rol()) = 'superuser') with check ((select public.get_user_rol()) = 'superuser');

-- El factor que corre ahora en el club (1 si no hay ningún evento).
create or replace function public._vcoins_factor(p_club uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(max(m.factor), 1) from public.vcoins_multiplicadores m
   where m.club_id = p_club and m.activo and now() between m.desde and m.hasta
$$;

-- El evento que corre (para mostrarlo): { nombre, factor, hasta } o null.
create or replace function public._vcoins_evento(p_club uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nombre', m.nombre, 'factor', m.factor, 'hasta', m.hasta)
    from public.vcoins_multiplicadores m
   where m.club_id = p_club and m.activo and now() between m.desde and m.hasta
   order by m.factor desc, m.hasta limit 1
$$;

-- La puerta de todo el juego: ahora también frena a los bloqueados.
create or replace function public._sobres_ctx(p_token uuid)
returns table (o_club uuid, o_dueno text, o_jugador text)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.kiosco_sesiones;
  v_club text;
  v_club_u uuid;
  v_dueno text;
  v_jugador text;
  v_motivo text;
begin
  if p_token is not null then
    select * into s from public.kiosco_sesiones where token = p_token and expira_at > now();
    if not found then
      raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
    end if;
    v_club_u := s.club_id::uuid; v_dueno := 'j:' || s.jugador_id; v_jugador := s.jugador_id;
  else
    v_club := (select public.get_user_club_id());
    if auth.uid() is null or v_club is null
       or (select public.get_user_rol()) not in ('ct', 'manager', 'admin') then
      raise exception 'sobres: sin permiso' using errcode = '42501';
    end if;
    v_club_u := v_club::uuid; v_dueno := 'u:' || auth.uid()::text; v_jugador := null;
  end if;

  select bloqueo_motivo into v_motivo from public.sobres_perfil
   where club_id = v_club_u and dueno = v_dueno and bloqueado;
  if found then
    raise exception 'sobres: tu cuenta está suspendida en el juego%', coalesce(' (' || nullif(trim(v_motivo), '') || ')', '')
      using errcode = 'P0001';
  end if;
  return query select v_club_u, v_dueno, v_jugador;
end
$$;

-- ── lo que llama el Modo GOD ────────────────────────────────────────────────

create or replace function public._god_o_error()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select public.get_user_rol()), '') <> 'superuser' then
    raise exception 'god: sólo el superusuario' using errcode = '42501';
  end if;
end
$$;

-- Todos los del club: jugadores (activos o con actividad) y staff, con su actividad en el juego.
create or replace function public.god_usuarios(p_club uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._god_o_error();
  return coalesce((
    with gente as (
      select 'j:' || j.id::text as dueno,
             trim(coalesce(j.apellido, '') || ', ' || coalesce(j.nombre, ''), ', ') as nombre,
             'jugador' as tipo, j.categoria as detalle, j.activo is not false as activo
        from public.jugadores j where j.club_id = p_club
      union all
      select 'u:' || pf.id::text, coalesce(nullif(trim(pf.nombre_completo), ''), pf.username, 'Staff'), 'staff', pf.rol, true
        from public.perfiles pf where pf.club_id = p_club
      union all
      select sp.dueno, sp.dueno, case when sp.dueno like 'j:%' then 'jugador' else 'staff' end, null, true
        from public.sobres_perfil sp
       where sp.club_id = p_club
         and not exists (select 1 from public.jugadores j where j.club_id = p_club and 'j:' || j.id::text = sp.dueno)
         and not exists (select 1 from public.perfiles pf where pf.club_id = p_club and 'u:' || pf.id::text = sp.dueno)
    )
    select jsonb_agg(jsonb_build_object(
             'dueno', g.dueno, 'nombre', g.nombre, 'tipo', g.tipo, 'detalle', g.detalle, 'activo', g.activo,
             'puntos', coalesce(sp.puntos, 0), 'bloqueado', coalesce(sp.bloqueado, false), 'motivo', sp.bloqueo_motivo,
             'racha', coalesce(sp.racha, 0), 'ultima_visita', sp.ultima_visita,
             'cartas', (select count(*) from public.cartas_coleccion cc where cc.club_id = p_club and cc.dueno = g.dueno),
             'sobres', (select count(*) from public.sobres_abiertos sa where sa.club_id = p_club and sa.dueno = g.dueno),
             'ultimo_sobre', (select max(sa.dia) from public.sobres_abiertos sa where sa.club_id = p_club and sa.dueno = g.dueno),
             'vdraft', (select count(*) from public.vdraft_partidas vp where vp.club_id = p_club and vp.dueno = g.dueno))
           order by coalesce(sp.puntos, 0) desc, g.nombre)
      from gente g
      left join public.sobres_perfil sp on sp.club_id = p_club and sp.dueno = g.dueno
     where g.activo or sp.dueno is not null), '[]'::jsonb);
end
$$;

-- Suspender o habilitar a alguien en el juego.
create or replace function public.god_bloquear(p_club uuid, p_dueno text, p_bloquear boolean, p_motivo text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public._god_o_error();
  insert into public.sobres_perfil (club_id, dueno) values (p_club, p_dueno) on conflict do nothing;
  update public.sobres_perfil
     set bloqueado = p_bloquear,
         bloqueo_motivo = case when p_bloquear then nullif(trim(coalesce(p_motivo, '')), '') else null end,
         bloqueado_at = case when p_bloquear then now() else null end
   where club_id = p_club and dueno = p_dueno;
end
$$;

-- Sumar (o restar) V-Coins. p_duenos null = a todos: los jugadores activos y
-- cualquiera que ya haya jugado. Devuelve a cuántos les llegó.
create or replace function public.god_vcoins(p_club uuid, p_duenos text[], p_cantidad int, p_motivo text default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_lista text[];
begin
  perform public._god_o_error();
  if p_cantidad is null or p_cantidad = 0 or abs(p_cantidad) > 100000 then
    raise exception 'god: la cantidad tiene que estar entre -100000 y 100000 (y no ser 0)' using errcode = '22023';
  end if;
  v_lista := coalesce(p_duenos, array(
    select 'j:' || j.id::text from public.jugadores j where j.club_id = p_club and j.activo is not false
    union
    select sp.dueno from public.sobres_perfil sp where sp.club_id = p_club));
  insert into public.sobres_perfil (club_id, dueno)
    select p_club, d from unnest(v_lista) d on conflict do nothing;
  update public.sobres_perfil set puntos = greatest(0, puntos + p_cantidad)
   where club_id = p_club and dueno = any (v_lista);
  insert into public.vcoins_movimientos (club_id, dueno, cantidad, motivo)
    select p_club, d, p_cantidad, nullif(trim(coalesce(p_motivo, '')), '') from unnest(v_lista) d;
  return coalesce(array_length(v_lista, 1), 0);
end
$$;

-- ── lo que se gana, con el multiplicador ────────────────────────────────────

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
    'multiplicador', public._vcoins_evento(c.o_club),
    'suspendidos', to_jsonb(v_sus),
    'evento', cfg.evento_activo,
    'eventos', public._sobres_eventos_de(c.o_club, c.o_dueno, v_puntos, v_hoy),
    'es_superuser', c.o_jugador is null and (select public.get_user_rol()) = 'superuser',
    'wellness_hecho', public._sobres_wellness_hoy(c.o_jugador)
  );
end
$$;

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

create or replace function public.sobres_abrir_evento(p_evento uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  e public.sobres_eventos;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_cantidad int;
  v_costo int;
  v_por_dia int;
  v_ids uuid[] := '{}';
  v_rareza text;
  v_tirada double precision;
  k public.cartas_catalogo;
  v_tiene boolean;
  v_pts int;
  v_ganados int := 0;
  v_cartas jsonb := '[]'::jsonb;
  v_sobre uuid := gen_random_uuid();
  i int;
begin
  select * into c from public._sobres_ctx(p_token);

  select * into e from public.sobres_eventos where id = p_evento and club_id = c.o_club;
  if not found or not e.activo
     or (e.desde is not null and e.desde > v_hoy) or (e.hasta is not null and e.hasta < v_hoy) then
    raise exception 'sobres: ese evento no está activo' using errcode = 'P0001';
  end if;

  v_cantidad := public._evento_regla(e, 'cartas', 3, 1, 10);
  v_costo := public._evento_regla(e, 'costo', 0, 0, 5000);
  v_por_dia := public._evento_regla(e, 'por_dia', 1, 1, 5);

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
  select * into p from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;

  if (select count(*) from public.sobres_abiertos
       where club_id = c.o_club and dueno = c.o_dueno and evento_id = e.id and dia = v_hoy) >= v_por_dia then
    raise exception 'sobres: ya abriste los sobres de este evento hoy' using errcode = 'P0001';
  end if;
  if v_costo > 0 and p.puntos < v_costo then
    raise exception 'sobres: te faltan V-Coins (hacen falta %)', v_costo using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.cartas_catalogo
                  where club_id = c.o_club and activa and clave = any (e.cartas)) then
    raise exception 'sobres: el evento todavía no tiene cartas' using errcode = 'P0001';
  end if;

  for i in 1..v_cantidad loop
    v_tirada := random();
    with pesos(rareza, peso, orden) as (values
      ('bronce', 42.0, 1), ('plata', 30.0, 2), ('oro', 15.0, 3), ('totw', 5.0, 4),
      ('potw', 3.0, 5), ('totm', 2.5, 6), ('potm', 1.5, 7), ('toty', 1.0, 8)),
    disp as (
      select pe.rareza, pe.peso, pe.orden from pesos pe
       where exists (select 1 from public.cartas_catalogo x
                      where x.club_id = c.o_club and x.activa and x.clave = any (e.cartas)
                        and x.rareza = pe.rareza and not (x.id = any (v_ids)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza from acum a where a.hasta > v_tirada * a.total order by a.hasta limit 1;

    exit when v_rareza is null;

    select * into k from public.cartas_catalogo
     where club_id = c.o_club and activa and clave = any (e.cartas) and rareza = v_rareza and not (id = any (v_ids))
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

  insert into public.sobres_abiertos (id, club_id, dueno, tipo, dia, cartas, puntos_ganados, evento_id)
    values (v_sobre, c.o_club, c.o_dueno, 'evento', v_hoy, v_cartas, v_ganados, e.id);

  insert into public.cartas_coleccion (club_id, dueno, catalogo_id, sobre_id)
    select c.o_club, c.o_dueno, (x ->> 'catalogo_id')::uuid, v_sobre
      from jsonb_array_elements(v_cartas) x where (x ->> 'nueva')::boolean
    on conflict do nothing;

  update public.sobres_perfil set puntos = puntos + v_ganados - v_costo
   where club_id = c.o_club and dueno = c.o_dueno;

  return jsonb_build_object('sobre_id', v_sobre, 'tipo', 'evento', 'cartas', v_cartas, 'puntos_ganados', v_ganados,
                            'evento', jsonb_build_object('id', e.id, 'nombre', e.nombre, 'escena', e.escena))
         || jsonb_build_object('estado', public.sobres_estado(p_token));
end
$$;

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
  v_coins := round(v_coins * public._vcoins_factor(p.club_id))::int;   -- evento de V-Coins dobles
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

revoke all on function public._vcoins_factor(uuid) from public, anon, authenticated;
revoke all on function public._vcoins_evento(uuid) from public, anon, authenticated;
revoke all on function public._god_o_error() from public, anon;
revoke all on function public._vdraft_terminar(uuid) from public, anon, authenticated;
revoke all on function public._sobres_ctx(uuid) from public, anon, authenticated;
revoke all on function public.god_usuarios(uuid) from public, anon;
revoke all on function public.god_bloquear(uuid, text, boolean, text) from public, anon;
revoke all on function public.god_vcoins(uuid, text[], int, text) from public, anon;
grant execute on function public.god_usuarios(uuid) to authenticated;
grant execute on function public.god_bloquear(uuid, text, boolean, text) to authenticated;
grant execute on function public.god_vcoins(uuid, text[], int, text) to authenticated;
grant execute on function public.sobres_estado(uuid) to anon, authenticated;
grant execute on function public.sobres_abrir(text, uuid) to anon, authenticated;
grant execute on function public.sobres_abrir_evento(uuid, uuid) to anon, authenticated;
