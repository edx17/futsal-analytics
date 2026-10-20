-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: MODO GOD (SUPERUSUARIO)
--
--  Lo que el superusuario puede manejar de los sobres y las cartas del club,
--  sin tocar las probabilidades ni la economía:
--
--  1. Dar de baja / de alta cartas del catálogo SIN BORRARLAS
--     (`cartas_catalogo.activa`): una carta dada de baja no sale en ningún
--     sobre ni en el V-Draft, pero quien ya la tiene la conserva. Borrarla se
--     llevaría puesta la colección de los jugadores (cascade): por eso no.
--  2. Ajustar la media (OVR) de una carta cuando el cálculo da un número que
--     los datos no sostienen (`cartas_ajustes`). Se aplica al mostrarla (como
--     las fotos especiales); la rareza con la que salió no cambia.
--  3. Suspender tipos de sobre y activar un evento (`sobres_config`): un sobre
--     suspendido no aparece disponible y no se puede abrir; el evento activo
--     cambia sólo la puesta en escena de la apertura.
--  4. Las imágenes ya se cambian con `cartas_fotos` (sirve para cualquier
--     carta del catálogo, también las BASE: la clave es 'BASE|<jugador>').
--
--  Leer: el staff del club. Escribir: sólo el superusuario.
--  Recrea sobres_estado, sobres_abrir y _vdraft_oferta con el filtro de
--  `activa` (todo lo demás, igual). Va después de 20261021110000 y
--  20261022120000. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Cartas activas
alter table public.cartas_catalogo add column if not exists activa boolean not null default true;
create index if not exists cartas_catalogo_activas on public.cartas_catalogo (club_id, rareza) where activa;

-- 2. Ajustes de media
create table if not exists public.cartas_ajustes (
  club_id         uuid not null references public.clubes(id) on delete cascade,
  clave           text not null,
  ovr             integer not null check (ovr between 1 and 99),
  motivo          text,
  actualizado_por uuid default auth.uid(),
  actualizado_at  timestamptz not null default now(),
  primary key (club_id, clave)
);
comment on table public.cartas_ajustes is 'MySquad: media corregida a mano por el superusuario (clave = la del catálogo).';

-- 3. Configuración de sobres del club
create table if not exists public.sobres_config (
  club_id         uuid primary key references public.clubes(id) on delete cascade,
  suspendidos     text[] not null default '{}',
  evento_activo   text,
  actualizado_por uuid default auth.uid(),
  actualizado_at  timestamptz not null default now()
);
comment on table public.sobres_config is 'MySquad: sobres suspendidos y evento activo del club (lo maneja el superusuario).';

alter table public.cartas_ajustes enable row level security;
alter table public.sobres_config enable row level security;

drop policy if exists "Staff SELECT cartas_ajustes" on public.cartas_ajustes;
create policy "Staff SELECT cartas_ajustes" on public.cartas_ajustes for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin') and club_id::text = (select public.get_user_club_id())));
drop policy if exists "Superuser ALL cartas_ajustes" on public.cartas_ajustes;
create policy "Superuser ALL cartas_ajustes" on public.cartas_ajustes for all to authenticated
  using ((select public.get_user_rol()) = 'superuser') with check ((select public.get_user_rol()) = 'superuser');

drop policy if exists "Staff SELECT sobres_config" on public.sobres_config;
create policy "Staff SELECT sobres_config" on public.sobres_config for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin') and club_id::text = (select public.get_user_club_id())));
drop policy if exists "Superuser ALL sobres_config" on public.sobres_config;
create policy "Superuser ALL sobres_config" on public.sobres_config for all to authenticated
  using ((select public.get_user_rol()) = 'superuser') with check ((select public.get_user_rol()) = 'superuser');

-- La carta como se muestra: foto especial y media ajustada (la calculada queda en 'ovrCalculada').
create or replace function public._sobres_carta(k public.cartas_catalogo)
returns jsonb
language sql stable security definer set search_path = public as $$
  select k.carta
         || case when f.url is not null then jsonb_build_object('foto', f.url, 'fotoEspecial', true) else '{}'::jsonb end
         || case when a.ovr is not null then jsonb_build_object('ovr', a.ovr, 'ovrCalculada', k.carta -> 'ovr', 'ovrAjustada', true) else '{}'::jsonb end
    from (select 1) x
    left join public.cartas_fotos f on f.club_id = k.club_id and f.clave = k.clave
    left join public.cartas_ajustes a on a.club_id = k.club_id and a.clave = k.clave
$$;
revoke all on function public._sobres_carta(public.cartas_catalogo) from public, anon, authenticated;

-- Estado de los sobres: cuenta sólo cartas activas, avisa qué está suspendido y el evento.
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
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno;
  select * into cfg from public.sobres_config where club_id = c.o_club;
  v_sus := coalesce(cfg.suspendidos, '{}');

  v_diario := not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'diario' and dia = v_hoy);
  v_wellness := public._sobres_wellness_hoy(c.o_jugador) and not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'wellness' and dia = v_hoy);
  v_racha := coalesce(p.premio_racha_dia = v_hoy, false) and not exists (select 1 from public.sobres_abiertos
    where club_id = c.o_club and dueno = c.o_dueno and tipo = 'racha' and dia = v_hoy);

  select count(*) into v_tiene from public.cartas_coleccion where club_id = c.o_club and dueno = c.o_dueno;
  select count(*) into v_total from public.cartas_catalogo where club_id = c.o_club and activa;
  select count(*) into v_especiales from public.cartas_catalogo
   where club_id = c.o_club and activa and rareza in ('totw', 'potw', 'totm', 'potm', 'toty');

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
      'diario', v_diario and not 'diario' = any (v_sus),
      'wellness', v_wellness and not 'wellness' = any (v_sus),
      'racha', v_racha and not 'racha' = any (v_sus),
      'puntos', coalesce(p.puntos, 0) >= 50 and v_total > 0 and not 'puntos' = any (v_sus),
      'mega', coalesce(p.puntos, 0) >= 500 and v_especiales > 0 and not 'mega' = any (v_sus),
      'premio', coalesce(p.sobres_premio, 0) > 0 and v_total > 0 and not 'premio' = any (v_sus),
      'premio_especial', coalesce(p.sobres_especiales, 0) > 0 and v_especiales > 0 and not 'premio_especial' = any (v_sus)),
    'suspendidos', to_jsonb(v_sus),
    'evento', cfg.evento_activo,
    'es_superuser', c.o_jugador is null and (select public.get_user_rol()) = 'superuser',
    'wellness_hecho', public._sobres_wellness_hoy(c.o_jugador)
  );
end
$$;

-- Abrir: sólo cartas activas; un sobre suspendido no se abre.
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

  if exists (select 1 from public.sobres_config where club_id = c.o_club and p_tipo = any (suspendidos)) then
    raise exception 'sobres: este sobre está suspendido por el club' using errcode = 'P0001';
  end if;

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno)
    on conflict do nothing;
  select * into p from public.sobres_perfil
   where club_id = c.o_club and dueno = c.o_dueno for update;

  if not exists (select 1 from public.cartas_catalogo where club_id = c.o_club and activa) then
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
       where club_id = c.o_club and activa and rareza in ('totw', 'potw', 'totm', 'potm', 'toty')) then
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
                      where x.club_id = c.o_club and x.activa and x.rareza = pe.rareza and not (x.id = any (v_ids)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza
      from acum a
     where a.hasta > v_tirada * a.total
     order by a.hasta limit 1;

    exit when v_rareza is null;

    select * into k from public.cartas_catalogo
     where club_id = c.o_club and activa and rareza = v_rareza and not (id = any (v_ids))
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

-- V-Draft: sólo cartas activas.
create or replace function public._vdraft_oferta(p_club uuid, p_n int, p_roles text[], p_excluir text[],
                                                p_tipo text, p_campo boolean)
returns jsonb language sql volatile security definer set search_path = public as $$
  select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select c from (
      select distinct on (k.jugador_id) public._vdraft_carta(k) as c
        from public.cartas_catalogo k
       where k.club_id = p_club and k.activa
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

grant execute on function public.sobres_estado(uuid)      to anon, authenticated;
grant execute on function public.sobres_abrir(text, uuid) to anon, authenticated;
revoke all on function public._vdraft_oferta(uuid, int, text[], text[], text, boolean) from public, anon, authenticated;
