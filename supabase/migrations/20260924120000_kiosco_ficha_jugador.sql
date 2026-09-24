-- ════════════════════════════════════════════════════════════════════════════
--  KIOSCO: LA FICHA DEL JUGADOR QUE ENTRÓ
--
--  El kiosco es UNA sesión compartida del club (kiosco@…), no un usuario por
--  jugador. Por eso las tablas sensibles (lesiones, sanciones) no le abren
--  lectura: una política "sólo lo mío" no se puede expresar y abrirla le
--  mostraría los datos de todo el plantel.
--
--  La salida es la misma que ya usa el PIN: funciones SECURITY DEFINER que
--  hacen el recorte del lado del servidor.
--
--    1. kiosco_abrir_sesion(jugador, club, pin) valida el PIN y devuelve un
--       token. El token identifica a ESE jugador, y es lo único que el
--       navegador guarda (nunca el PIN).
--    2. kiosco_ficha(token) devuelve, en una sola llamada, todo lo del
--       jugador: datos, lesiones, sanciones, tarjetas, próximos partidos de
--       su categoría (con la citación), entrenamientos de la semana, su
--       wellness reciente y el torneo de su categoría.
--    3. kiosco_guardar_push(token, …) da de alta el teléfono del jugador
--       para recibir notificaciones personales (citación, recordatorio de
--       wellness, cumpleaños). Queda en push_subscriptions con jugador_id,
--       y el smart-service separa esas filas de las del staff.
--
--  Idempotente y aditiva: se puede correr más de una vez, y no cambia nada
--  de lo que ya existe (sólo agrega una columna nullable a push_subscriptions).
--
--  Los ids se comparan como texto (::text) a propósito: así funciona igual
--  sea jugadores.id bigint o uuid, y club_id uuid o text.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. SESIONES DEL KIOSCO ────────────────────────────────────────────────
create table if not exists public.kiosco_sesiones (
  token      uuid primary key default gen_random_uuid(),
  jugador_id text not null,
  club_id    text not null,
  creada_at  timestamptz not null default now(),
  expira_at  timestamptz not null default now() + interval '120 days'
);

-- Sin políticas: desde el navegador no se lee ni se escribe. Sólo la tocan
-- las funciones de abajo, que corren como su dueño.
alter table public.kiosco_sesiones enable row level security;

create index if not exists kiosco_sesiones_jugador_idx
    on public.kiosco_sesiones (jugador_id);

-- ── 2. PUSH POR JUGADOR ───────────────────────────────────────────────────
-- NULL = dispositivo del staff (lo de siempre). Con valor = teléfono de un
-- jugador, que recibe SÓLO sus avisos y nunca el digest del cuerpo técnico.
alter table public.push_subscriptions
  add column if not exists jugador_id text;

create index if not exists push_subscriptions_jugador_idx
    on public.push_subscriptions (jugador_id);

-- ── 3. FUNCIONES ──────────────────────────────────────────────────────────

-- Valida el PIN y abre una sesión. NULL si el PIN no corresponde.
create or replace function public.kiosco_abrir_sesion(
  p_jugador_id text, p_club_id text, p_pin text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_token uuid;
begin
  if coalesce(p_pin, '') !~ '^\d{4}$' then
    return null;
  end if;

  if not exists (
    select 1 from public.jugadores j
     where j.id::text = p_jugador_id
       and j.club_id::text = p_club_id
       and j.pin_kiosco::text = p_pin
  ) then
    return null;
  end if;

  delete from public.kiosco_sesiones where expira_at < now();

  insert into public.kiosco_sesiones (jugador_id, club_id)
  values (p_jugador_id, p_club_id)
  returning token into v_token;

  return v_token;
end
$$;

create or replace function public.kiosco_cerrar_sesion(p_token uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.kiosco_sesiones where token = p_token;
$$;

-- Todo lo del jugador, en un solo viaje. Cada bloque va en su propio
-- begin/exception: si una tabla todavía no existe en este proyecto (una
-- migración sin correr), ese bloque vuelve vacío y el resto se muestra igual.
create or replace function public.kiosco_ficha(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s          public.kiosco_sesiones;
  v_jug      jsonb;
  v_cat      text;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_anio     text := to_char(v_hoy, 'YYYY');
  v_club     jsonb := '{}'::jsonb;
  v_lesiones jsonb := '[]'::jsonb;
  v_sanc     jsonb := '[]'::jsonb;
  v_tarjetas jsonb := '[]'::jsonb;
  v_partidos jsonb := '[]'::jsonb;
  v_sesiones jsonb := '[]'::jsonb;
  v_wellness jsonb := '[]'::jsonb;
  v_torneo   jsonb := null;
  v_fixture  jsonb := '[]'::jsonb;
  v_torneo_id text;
begin
  select * into s from public.kiosco_sesiones
   where token = p_token and expira_at > now();
  if not found then
    raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
  end if;

  select to_jsonb(j) into v_jug
    from public.jugadores j
   where j.id::text = s.jugador_id and j.club_id::text = s.club_id;
  if v_jug is null then
    raise exception 'kiosco: el jugador ya no existe' using errcode = '28000';
  end if;
  v_cat := v_jug->>'categoria';

  -- Sólo lo que la pantalla muestra: nada de PIN ni de contacto.
  v_jug := jsonb_build_object(
    'id', v_jug->'id', 'nombre', v_jug->'nombre', 'apellido', v_jug->'apellido',
    'dorsal', v_jug->'dorsal', 'posicion', v_jug->'posicion',
    'categoria', v_jug->'categoria', 'fechanac', v_jug->'fechanac',
    'vencimiento_apto', v_jug->'vencimiento_apto', 'foto', v_jug->'foto'
  );

  begin
    select jsonb_build_object('nombre', c.nombre) into v_club
      from public.clubes c where c.id::text = s.club_id;
  exception when others then null;
  end;

  begin
    select coalesce(jsonb_agg(to_jsonb(l) order by l.fecha_lesion desc), '[]'::jsonb)
      into v_lesiones
      from public.lesiones l
     where l.jugador_id::text = s.jugador_id and l.club_id::text = s.club_id;
  exception when others then v_lesiones := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_sanc
      from public.disciplina_sanciones d
     where d.jugador_id::text = s.jugador_id and d.club_id::text = s.club_id;
  exception when others then v_sanc := '[]'::jsonb;
  end;

  -- Tarjetas de la temporada, con la categoría del partido: las amarillas se
  -- acumulan por categoría, igual que en Disciplina y en el Inicio.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'accion', e.accion, 'categoria', coalesce(p.categoria, 'Sin categoría'),
             'fecha', left(p.fecha::text, 10), 'rival', p.rival)), '[]'::jsonb)
      into v_tarjetas
      from public.eventos e
      join public.partidos p on p.id = e.id_partido
     where e.id_jugador::text = s.jugador_id
       and e.club_id::text = s.club_id
       and e.equipo = 'Propio'
       and e.accion in ('Tarjeta Amarilla', 'Tarjeta Roja')
       and left(p.fecha::text, 4) = v_anio;
  exception when others then v_tarjetas := '[]'::jsonb;
  end;

  -- Próximos partidos de su categoría. Van enteros (to_jsonb) para no
  -- depender de que las columnas de la citación existan.
  begin
    select coalesce(jsonb_agg(x.fila order by x.fecha, x.id), '[]'::jsonb) into v_partidos
      from (
        select to_jsonb(p) as fila, left(p.fecha::text, 10) as fecha, p.id
          from public.partidos p
         where p.club_id::text = s.club_id
           and p.estado = 'Pendiente'
           and left(p.fecha::text, 10) >= v_hoy::text
           and (v_cat is null or p.categoria is null or p.categoria = v_cat)
         order by left(p.fecha::text, 10), p.id
         limit 8
      ) x;
  exception when others then v_partidos := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'fecha', left(x.fecha::text, 10), 'tipo_sesion', x.tipo_sesion,
             'objetivo', x.objetivo, 'nivel_carga', x.nivel_carga)
             order by left(x.fecha::text, 10), x.id), '[]'::jsonb)
      into v_sesiones
      from public.sesiones x
     where x.club_id::text = s.club_id
       and (v_cat is null or x.categoria_equipo = v_cat)
       and left(x.fecha::text, 10) between v_hoy::text and (v_hoy + 6)::text;
  exception when others then v_sesiones := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(to_jsonb(w) order by w.fecha desc), '[]'::jsonb) into v_wellness
      from public.wellness w
     where w.jugador_id::text = s.jugador_id
       and left(w.fecha::text, 10) >= (v_hoy - 13)::text;
  exception when others then v_wellness := '[]'::jsonb;
  end;

  -- El torneo más nuevo de su categoría, con todo el fixture (los cruces
  -- entre terceros incluidos: sin ellos la tabla de posiciones no se arma).
  begin
    select to_jsonb(t), t.id::text into v_torneo, v_torneo_id
      from public.torneos t
     where t.club_id::text = s.club_id
       and (v_cat is null or t.categoria = v_cat)
     order by t.id desc
     limit 1;

    if v_torneo_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'fecha', p.fecha, 'jornada', p.jornada, 'rival', p.rival,
               'nombre_propio', p.nombre_propio, 'condicion', p.condicion,
               'goles_propios', p.goles_propios, 'goles_rival', p.goles_rival,
               'estado', p.estado, 'horario', p.horario, 'lugar', p.lugar)), '[]'::jsonb)
        into v_fixture
        from public.partidos p
       where p.torneo_id::text = v_torneo_id
         and (v_torneo->>'categoria' is null or p.categoria = v_torneo->>'categoria');
    end if;
  exception when others then v_torneo := null; v_fixture := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'hoy', v_hoy,
    'club', v_club,
    'jugador', v_jug,
    'lesiones', v_lesiones,
    'sanciones', v_sanc,
    'tarjetas', v_tarjetas,
    'partidos', v_partidos,
    'sesiones', v_sesiones,
    'wellness', v_wellness,
    'torneo', v_torneo,
    'fixture', v_fixture
  );
end
$$;

-- Alta del teléfono del jugador para push. Un endpoint es un dispositivo:
-- si ese teléfono ya estaba dado de alta (para otro jugador o para el staff),
-- pasa a ser de este jugador.
create or replace function public.kiosco_guardar_push(
  p_token uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s public.kiosco_sesiones;
begin
  select * into s from public.kiosco_sesiones
   where token = p_token and expira_at > now();
  if not found then
    raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;

  -- club_id se castea al tipo real de la columna (uuid o text).
  execute format(
    'insert into public.push_subscriptions (club_id, jugador_id, endpoint, p256dh, auth, user_agent)
     values ($1::%s, $2, $3, $4, $5, $6)',
    (select format_type(a.atttypid, a.atttypmod)
       from pg_attribute a
      where a.attrelid = 'public.push_subscriptions'::regclass and a.attname = 'club_id'))
  using s.club_id, s.jugador_id, p_endpoint, p_p256dh, p_auth, p_user_agent;

  return true;
end
$$;

create or replace function public.kiosco_quitar_push(p_token uuid, p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions ps
   using public.kiosco_sesiones s
   where s.token = p_token and ps.endpoint = p_endpoint and ps.jugador_id = s.jugador_id;
$$;

-- ── 4. PERMISOS ───────────────────────────────────────────────────────────
-- El kiosco entra con una sesión autenticada; anon no las necesita.
revoke all on function public.kiosco_abrir_sesion(text, text, text) from public;
revoke all on function public.kiosco_cerrar_sesion(uuid)             from public;
revoke all on function public.kiosco_ficha(uuid)                     from public;
revoke all on function public.kiosco_guardar_push(uuid, text, text, text, text) from public;
revoke all on function public.kiosco_quitar_push(uuid, text)         from public;

grant execute on function public.kiosco_abrir_sesion(text, text, text) to authenticated;
grant execute on function public.kiosco_cerrar_sesion(uuid)             to authenticated;
grant execute on function public.kiosco_ficha(uuid)                     to authenticated;
grant execute on function public.kiosco_guardar_push(uuid, text, text, text, text) to authenticated;
grant execute on function public.kiosco_quitar_push(uuid, text)         to authenticated;
