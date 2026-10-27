-- ═══════════════════════════════════════════════════════════════════════════
--  JUEGOS CON GMAIL: JUGADORES VINCULADOS E HINCHAS POR INVITACIÓN
--
--  Una cuenta de Google (o cualquier cuenta sin rol en el club) puede jugar:
--
--    · JUGADOR: entra al kiosco con su PIN y toca "ENTRÁ CON TU GMAIL". Desde
--      ahí su Gmail ES él en el juego: misma colección ('j:<jugador>'), mismas
--      V-Coins y misma racha. Con el Gmail ve sólo los juegos.
--    · HINCHA: entra por un link de invitación del club (lo arman el
--      superusuario o el manager) y juega con su propia colección
--      ('h:<uid>'), con las cartas de todas las categorías del club.
--
--    juegos_cuentas                 quién juega con qué club (una cuenta, un club)
--    juegos_invitaciones            los links para hinchas (vence / tope de usos opcionales)
--
--    juegos_mi_cuenta()             la cuenta de juego del que está logueado (o null)
--    juegos_vincular(p_token)       el Gmail pasa a ser el jugador de esa sesión del kiosco
--    juegos_invitacion_info(cod)    el club de un link (sin sesión, para la pantalla de entrada)
--    juegos_unirse(cod, nombre)     el hincha se suma al club del link
--    juegos_invitacion_crear / juegos_invitaciones_club / juegos_invitacion_activar
--    juegos_cuentas_club / juegos_cuenta_quitar          (superusuario y manager del club)
--
--  _sobres_ctx atiende estas cuentas (después del staff): todos los juegos
--  (sobres, V-Draft, penales, misiones) andan sin tocar cada función.
--  Recrea vdraft_estado y god_usuarios (el nombre de los hinchas) y
--  sobres_reiniciar_prueba (sólo el staff; un jugador nunca se reinicia).
--  Va después de 20261105120000_vcoins_eventos.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.juegos_cuentas (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  club_id    uuid not null references public.clubes (id) on delete cascade,
  tipo       text not null check (tipo in ('jugador', 'hincha')),
  jugador_id text,
  nombre     text,
  invitacion text,
  created_at timestamptz not null default now(),
  constraint juegos_cuentas_tipo_jugador check ((tipo = 'jugador') = (jugador_id is not null))
);
-- Un jugador, un Gmail.
create unique index if not exists juegos_cuentas_un_gmail_por_jugador
  on public.juegos_cuentas (club_id, jugador_id) where jugador_id is not null;
create index if not exists juegos_cuentas_club on public.juegos_cuentas (club_id);
alter table public.juegos_cuentas enable row level security;  -- sólo por las funciones

create table if not exists public.juegos_invitaciones (
  codigo     text primary key,
  club_id    uuid not null references public.clubes (id) on delete cascade,
  nombre     text,
  activa     boolean not null default true,
  vence      date,
  max_usos   int check (max_usos is null or max_usos > 0),
  usos       int not null default 0,
  creada_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists juegos_invitaciones_club on public.juegos_invitaciones (club_id);
alter table public.juegos_invitaciones enable row level security;

-- ── quién juega ─────────────────────────────────────────────────────────────
create or replace function public._sobres_ctx(p_token uuid)
returns table (o_club uuid, o_dueno text, o_jugador text)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.kiosco_sesiones;
  cu public.juegos_cuentas;
  v_club text;
  v_rol text;
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
    if auth.uid() is null then
      raise exception 'sobres: sin permiso' using errcode = '42501';
    end if;
    v_club := (select public.get_user_club_id());
    v_rol := (select public.get_user_rol());
    if v_club is not null and v_rol in ('ct', 'manager', 'admin') then
      v_club_u := v_club::uuid; v_dueno := 'u:' || auth.uid()::text; v_jugador := null;
    else
      -- Un Gmail vinculado a un jugador, o un hincha.
      select * into cu from public.juegos_cuentas where user_id = auth.uid();
      if not found then
        raise exception 'sobres: sin permiso' using errcode = '42501';
      end if;
      if cu.tipo = 'jugador' and not exists (
        select 1 from public.jugadores j where j.id::text = cu.jugador_id and j.club_id = cu.club_id and j.activo is not false) then
        raise exception 'sobres: tu jugador ya no está activo en el club' using errcode = '42501';
      end if;
      v_club_u := cu.club_id;
      v_dueno := case when cu.tipo = 'jugador' then 'j:' || cu.jugador_id else 'h:' || cu.user_id::text end;
      v_jugador := cu.jugador_id;
    end if;
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

-- Sólo el staff reinicia su prueba (con un Gmail de jugador borraría la colección del jugador).
create or replace function public.sobres_reiniciar_prueba()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(null);
  if c.o_dueno not like 'u:%' then
    raise exception 'sobres: sólo el cuerpo técnico puede reiniciar su prueba' using errcode = '42501';
  end if;
  delete from public.cartas_coleccion where club_id = c.o_club and dueno = c.o_dueno;
  delete from public.sobres_abiertos  where club_id = c.o_club and dueno = c.o_dueno;
  delete from public.sobres_perfil    where club_id = c.o_club and dueno = c.o_dueno;
end
$$;

-- Las cuentas con rol en un club (o el kiosco) no son cuentas de juego.
create or replace function public._juegos_es_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.get_user_rol()), 'jugador') in ('superuser', 'manager', 'admin', 'ct', 'kiosco')
$$;

-- ── la cuenta de juego ──────────────────────────────────────────────────────
create or replace function public.juegos_mi_cuenta()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'tipo', cu.tipo,
           'club_id', cu.club_id,
           'club_nombre', cl.nombre,
           'escudo_url', cl.escudo_url,
           'jugador_id', cu.jugador_id,
           'nombre', coalesce(
             (select trim(coalesce(j.nombre, '') || ' ' || coalesce(j.apellido, ''))
                from public.jugadores j where cu.tipo = 'jugador' and j.id::text = cu.jugador_id limit 1),
             cu.nombre, 'Hincha'))
    from public.juegos_cuentas cu
    join public.clubes cl on cl.id = cu.club_id
   where cu.user_id = auth.uid()
$$;

-- El Gmail pasa a ser el jugador de la sesión del kiosco (la del PIN).
create or replace function public.juegos_vincular(p_token uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s public.kiosco_sesiones;
begin
  if auth.uid() is null then
    raise exception 'juegos: entrá con tu Gmail' using errcode = '42501';
  end if;
  if public._juegos_es_staff() then
    raise exception 'juegos: ese Gmail es una cuenta del club; vinculá otro' using errcode = 'P0001';
  end if;
  select * into s from public.kiosco_sesiones where token = p_token and expira_at > now();
  if not found then
    raise exception 'juegos: la sesión del PIN venció; entrá de nuevo con tu PIN' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.juegos_cuentas
              where club_id = s.club_id::uuid and jugador_id = s.jugador_id and user_id <> auth.uid()) then
    raise exception 'juegos: ese jugador ya tiene otro Gmail vinculado; pedile al club que lo desvincule' using errcode = 'P0001';
  end if;

  insert into public.juegos_cuentas (user_id, club_id, tipo, jugador_id)
  values (auth.uid(), s.club_id::uuid, 'jugador', s.jugador_id)
  on conflict (user_id) do update
     set club_id = excluded.club_id, tipo = 'jugador', jugador_id = excluded.jugador_id;
  return public.juegos_mi_cuenta();
end
$$;

-- ── invitaciones de hinchas ─────────────────────────────────────────────────
create or replace function public._juegos_invitacion_motivo(i public.juegos_invitaciones)
returns text language sql stable set search_path = public as $$
  select case
    when not i.activa then 'Esta invitación está pausada.'
    when i.vence is not null and i.vence < public._sobres_hoy() then 'Esta invitación venció.'
    when i.max_usos is not null and i.usos >= i.max_usos then 'Esta invitación ya se usó todas las veces.'
  end
$$;

-- Sin sesión: de qué club es el link (para la pantalla de entrada).
create or replace function public.juegos_invitacion_info(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  i public.juegos_invitaciones;
  cl public.clubes;
begin
  select * into i from public.juegos_invitaciones where codigo = upper(trim(p_codigo));
  if not found then return null; end if;
  select * into cl from public.clubes where id = i.club_id;
  return jsonb_build_object('club_nombre', cl.nombre, 'escudo_url', cl.escudo_url, 'nombre', i.nombre,
                            'motivo', public._juegos_invitacion_motivo(i));
end
$$;

create or replace function public.juegos_unirse(p_codigo text, p_nombre text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  i public.juegos_invitaciones;
  cu public.juegos_cuentas;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception 'juegos: entrá con tu Gmail' using errcode = '42501';
  end if;
  if public._juegos_es_staff() then
    raise exception 'juegos: ese Gmail es una cuenta del club; para jugar como hincha usá otro' using errcode = 'P0001';
  end if;
  select * into i from public.juegos_invitaciones where codigo = upper(trim(p_codigo)) for update;
  if not found then
    raise exception 'juegos: esa invitación no existe' using errcode = 'P0001';
  end if;

  select * into cu from public.juegos_cuentas where user_id = auth.uid();
  if found then
    if cu.club_id = i.club_id then return public.juegos_mi_cuenta(); end if;  -- ya está
    raise exception 'juegos: tu Gmail ya juega con otro club' using errcode = 'P0001';
  end if;

  v_motivo := public._juegos_invitacion_motivo(i);
  if v_motivo is not null then
    raise exception 'juegos: %', v_motivo using errcode = 'P0001';
  end if;

  insert into public.juegos_cuentas (user_id, club_id, tipo, nombre, invitacion)
  values (auth.uid(), i.club_id, 'hincha',
          left(coalesce(nullif(trim(p_nombre), ''),
                        (select nullif(trim(u.raw_user_meta_data ->> 'full_name'), '') from auth.users u where u.id = auth.uid()),
                        'Hincha'), 60),
          i.codigo);
  update public.juegos_invitaciones set usos = usos + 1 where codigo = i.codigo;
  return public.juegos_mi_cuenta();
end
$$;

-- El superusuario, o el manager de ese club.
create or replace function public._juegos_admin_o_error(p_club uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_rol text := coalesce((select public.get_user_rol()), '');
begin
  if not (v_rol = 'superuser' or (v_rol = 'manager' and (select public.get_user_club_id()) = p_club::text)) then
    raise exception 'juegos: sólo el superusuario o el manager del club' using errcode = '42501';
  end if;
end
$$;

create or replace function public.juegos_invitacion_crear(p_club uuid, p_nombre text default null, p_vence date default null, p_max int default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_codigo text;
  i public.juegos_invitaciones;
begin
  perform public._juegos_admin_o_error(p_club);
  if p_max is not null and p_max < 1 then
    raise exception 'juegos: el tope de usos tiene que ser 1 o más' using errcode = 'P0001';
  end if;
  loop
    -- 8 letras y números sin los que se confunden (0/O, 1/I/L).
    v_codigo := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
                   from generate_series(1, 8));
    exit when not exists (select 1 from public.juegos_invitaciones where codigo = v_codigo);
  end loop;
  insert into public.juegos_invitaciones (codigo, club_id, nombre, vence, max_usos, creada_por)
  values (v_codigo, p_club, nullif(left(trim(coalesce(p_nombre, '')), 60), ''), p_vence, p_max, auth.uid())
  returning * into i;
  return to_jsonb(i);
end
$$;

create or replace function public.juegos_invitaciones_club(p_club uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._juegos_admin_o_error(p_club);
  return coalesce((
    select jsonb_agg(to_jsonb(i) || jsonb_build_object('motivo', public._juegos_invitacion_motivo(i)) order by i.created_at desc)
      from public.juegos_invitaciones i where i.club_id = p_club), '[]'::jsonb);
end
$$;

create or replace function public.juegos_invitacion_activar(p_codigo text, p_activa boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_club uuid;
begin
  select club_id into v_club from public.juegos_invitaciones where codigo = p_codigo;
  if not found then raise exception 'juegos: esa invitación no existe' using errcode = 'P0001'; end if;
  perform public._juegos_admin_o_error(v_club);
  update public.juegos_invitaciones set activa = p_activa where codigo = p_codigo;
end
$$;

-- Los que juegan con Gmail en el club (jugadores vinculados e hinchas).
create or replace function public.juegos_cuentas_club(p_club uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._juegos_admin_o_error(p_club);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id', cu.user_id, 'tipo', cu.tipo, 'jugador_id', cu.jugador_id, 'invitacion', cu.invitacion,
             'created_at', cu.created_at, 'email', u.email,
             'nombre', coalesce(
               (select trim(coalesce(j.apellido, '') || ', ' || coalesce(j.nombre, ''), ', ')
                  from public.jugadores j where cu.tipo = 'jugador' and j.id::text = cu.jugador_id limit 1),
               cu.nombre, 'Hincha'),
             'cartas', (select count(*) from public.cartas_coleccion cc where cc.club_id = p_club
                          and cc.dueno = case when cu.tipo = 'jugador' then 'j:' || cu.jugador_id else 'h:' || cu.user_id::text end))
           order by cu.tipo, cu.created_at desc)
      from public.juegos_cuentas cu
      left join auth.users u on u.id = cu.user_id
     where cu.club_id = p_club), '[]'::jsonb);
end
$$;

-- Desvincular un Gmail (la colección del jugador queda: es del jugador, no del mail).
create or replace function public.juegos_cuenta_quitar(p_user uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_club uuid;
begin
  select club_id into v_club from public.juegos_cuentas where user_id = p_user;
  if not found then return; end if;
  perform public._juegos_admin_o_error(v_club);
  delete from public.juegos_cuentas where user_id = p_user;
end
$$;

-- ── los nombres de los hinchas ──────────────────────────────────────────────
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
                     (select jc.nombre from public.juegos_cuentas jc
                       where v.dueno like 'h:%' and jc.user_id::text = substring(v.dueno from 3) limit 1),
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

-- Modo GOD · USUARIOS: los hinchas aparecen con su nombre.
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
      select 'h:' || cu.user_id::text, coalesce(nullif(trim(cu.nombre), ''), 'Hincha'), 'hincha', 'HINCHA', true
        from public.juegos_cuentas cu where cu.club_id = p_club and cu.tipo = 'hincha'
      union all
      select sp.dueno, sp.dueno, case when sp.dueno like 'j:%' then 'jugador' when sp.dueno like 'h:%' then 'hincha' else 'staff' end, null, true
        from public.sobres_perfil sp
       where sp.club_id = p_club
         and not exists (select 1 from public.jugadores j where j.club_id = p_club and 'j:' || j.id::text = sp.dueno)
         and not exists (select 1 from public.perfiles pf where pf.club_id = p_club and 'u:' || pf.id::text = sp.dueno)
         and not exists (select 1 from public.juegos_cuentas cu where cu.club_id = p_club and 'h:' || cu.user_id::text = sp.dueno)
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

-- ── permisos ────────────────────────────────────────────────────────────────
revoke all on function public._sobres_ctx(uuid) from public, anon, authenticated;
revoke all on function public._juegos_es_staff() from public, anon, authenticated;
revoke all on function public._juegos_invitacion_motivo(public.juegos_invitaciones) from public, anon, authenticated;
revoke all on function public._juegos_admin_o_error(uuid) from public, anon, authenticated;
revoke all on function public.juegos_mi_cuenta() from public, anon;
revoke all on function public.juegos_vincular(uuid) from public, anon;
revoke all on function public.juegos_unirse(text, text) from public, anon;
revoke all on function public.juegos_invitacion_crear(uuid, text, date, int) from public, anon;
revoke all on function public.juegos_invitaciones_club(uuid) from public, anon;
revoke all on function public.juegos_invitacion_activar(text, boolean) from public, anon;
revoke all on function public.juegos_cuentas_club(uuid) from public, anon;
revoke all on function public.juegos_cuenta_quitar(uuid) from public, anon;
grant execute on function public.juegos_mi_cuenta() to authenticated;
grant execute on function public.juegos_vincular(uuid) to authenticated;
grant execute on function public.juegos_invitacion_info(text) to anon, authenticated;
grant execute on function public.juegos_unirse(text, text) to authenticated;
grant execute on function public.juegos_invitacion_crear(uuid, text, date, int) to authenticated;
grant execute on function public.juegos_invitaciones_club(uuid) to authenticated;
grant execute on function public.juegos_invitacion_activar(text, boolean) to authenticated;
grant execute on function public.juegos_cuentas_club(uuid) to authenticated;
grant execute on function public.juegos_cuenta_quitar(uuid) to authenticated;
grant execute on function public.vdraft_estado(uuid) to anon, authenticated;
grant execute on function public.god_usuarios(uuid) to authenticated;
grant execute on function public.sobres_reiniciar_prueba() to authenticated;
