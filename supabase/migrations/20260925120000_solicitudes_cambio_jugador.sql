-- ════════════════════════════════════════════════════════════════════════════
--  EL JUGADOR PROPONE, EL CLUB APRUEBA
--
--  Desde "Mis datos" en el kiosco, el jugador (o su familia) puede corregir
--  su teléfono, su contacto de emergencia, su obra social y su grupo
--  sanguíneo. Nada se escribe en la ficha hasta que un admin, manager o
--  superuser del club lo aprueba, dato por dato si quiere.
--
--  Mismo esquema que la ficha del kiosco (migración 20260924120000): la
--  sesión del kiosco es compartida, así que el jugador no toca tablas: pasa
--  por funciones SECURITY DEFINER que reciben su token.
--
--  Idempotente y aditiva. Requiere la migración 20260924120000 (kiosco_
--  sesiones) y los helpers get_user_rol() / get_user_club_id().
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. LA TABLA ───────────────────────────────────────────────────────────
create table if not exists public.jugador_solicitudes_cambio (
  id           bigint generated always as identity primary key,
  club_id      text not null,
  jugador_id   text not null,
  -- { campo: { antes, despues } } — el "antes" se guarda al pedir, para que
  -- quien aprueba vea contra qué se compara aunque la ficha cambie después.
  cambios      jsonb not null,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'aprobada', 'parcial', 'rechazada')),
  nota         text,
  creada_at    timestamptz not null default now(),
  resuelta_at  timestamptz,
  resuelta_por uuid
);

create index if not exists jugador_solicitudes_pendientes_idx
    on public.jugador_solicitudes_cambio (club_id, estado);

-- Un jugador tiene como mucho una solicitud pendiente: si vuelve a pedir,
-- se reemplaza la anterior (ver kiosco_proponer_cambios).
create unique index if not exists jugador_solicitudes_una_pendiente
    on public.jugador_solicitudes_cambio (jugador_id) where estado = 'pendiente';

-- ── 2. RLS: la leen los que aprueban; nadie escribe directo ───────────────
alter table public.jugador_solicitudes_cambio enable row level security;

do $rls$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'jugador_solicitudes_cambio'
                    and policyname = 'Admin SELECT solicitudes') then
    create policy "Admin SELECT solicitudes" on public.jugador_solicitudes_cambio
      for select using (
        get_user_rol() = any (array['admin'::text, 'manager'::text, 'superuser'::text])
        and (club_id = get_user_club_id() or get_user_rol() = 'superuser'::text)
      );
  end if;
end
$rls$;

-- ── 3. LOS CAMPOS QUE SE PUEDEN PEDIR ─────────────────────────────────────
-- Una sola lista, usada al pedir y al aprobar: aunque alguien arme el pedido
-- a mano, lo que no esté acá no llega nunca a la ficha.
create or replace function public._campos_editables_jugador()
returns text[] language sql immutable as $$
  select array['contacto', 'contacto_emergencia', 'obra_social', 'grupo_sanguineo'];
$$;

-- ── 4. KIOSCO: VER MIS DATOS Y PROPONER ───────────────────────────────────
create or replace function public.kiosco_mis_datos(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s     public.kiosco_sesiones;
  v_jug jsonb;
  v_pend jsonb;
  v_ult  jsonb;
begin
  select * into s from public.kiosco_sesiones where token = p_token and expira_at > now();
  if not found then
    raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
  end if;

  select to_jsonb(j) into v_jug from public.jugadores j
   where j.id::text = s.jugador_id and j.club_id::text = s.club_id;

  select to_jsonb(x) into v_pend from (
    select id, cambios, creada_at from public.jugador_solicitudes_cambio
     where jugador_id = s.jugador_id and estado = 'pendiente'
  ) x;

  -- La última resuelta, para avisarle al jugador cómo terminó.
  select to_jsonb(x) into v_ult from (
    select id, cambios, estado, nota, resuelta_at from public.jugador_solicitudes_cambio
     where jugador_id = s.jugador_id and estado <> 'pendiente'
     order by resuelta_at desc nulls last limit 1
  ) x;

  return jsonb_build_object(
    'datos', jsonb_build_object(
      'contacto', v_jug->'contacto',
      'contacto_emergencia', v_jug->'contacto_emergencia',
      'obra_social', v_jug->'obra_social',
      'grupo_sanguineo', v_jug->'grupo_sanguineo'
    ),
    'pendiente', v_pend,
    'ultima', v_ult
  );
end
$$;

create or replace function public.kiosco_proponer_cambios(p_token uuid, p_cambios jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  s        public.kiosco_sesiones;
  v_jug    jsonb;
  v_campo  text;
  v_valor  text;
  v_antes  text;
  v_final  jsonb := '{}'::jsonb;
  v_id     bigint;
begin
  select * into s from public.kiosco_sesiones where token = p_token and expira_at > now();
  if not found then
    raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
  end if;

  if jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'kiosco: formato de cambios inválido' using errcode = '22023';
  end if;

  select to_jsonb(j) into v_jug from public.jugadores j
   where j.id::text = s.jugador_id and j.club_id::text = s.club_id;

  for v_campo, v_valor in select key, value #>> '{}' from jsonb_each(p_cambios) loop
    if not v_campo = any (public._campos_editables_jugador()) then
      continue; -- lo que no está en la lista, se ignora
    end if;
    v_valor := nullif(btrim(coalesce(v_valor, '')), '');
    if v_valor is not null and length(v_valor) > 120 then
      raise exception 'kiosco: el dato "%" es demasiado largo', v_campo using errcode = '22001';
    end if;
    v_antes := nullif(btrim(coalesce(v_jug ->> v_campo, '')), '');
    if v_valor is distinct from v_antes then
      v_final := v_final || jsonb_build_object(v_campo, jsonb_build_object('antes', v_antes, 'despues', v_valor));
    end if;
  end loop;

  if v_final = '{}'::jsonb then
    return null; -- no cambió nada
  end if;

  -- Un pedido nuevo reemplaza al que estaba pendiente.
  delete from public.jugador_solicitudes_cambio
   where jugador_id = s.jugador_id and estado = 'pendiente';

  insert into public.jugador_solicitudes_cambio (club_id, jugador_id, cambios)
  values (s.club_id, s.jugador_id, v_final)
  returning id into v_id;

  return v_id;
end
$$;

create or replace function public.kiosco_cancelar_cambios(p_token uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.jugador_solicitudes_cambio c
   using public.kiosco_sesiones s
   where s.token = p_token and s.expira_at > now()
     and c.jugador_id = s.jugador_id and c.estado = 'pendiente';
$$;

-- ── 5. EL CLUB: APROBAR O RECHAZAR ────────────────────────────────────────
-- p_aprobados: los campos que se aceptan. Vacío = rechazar todo.
create or replace function public.resolver_solicitud_cambio(
  p_id bigint, p_aprobados text[], p_nota text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_sol    public.jugador_solicitudes_cambio;
  v_rol    text := get_user_rol();
  v_campos text[];
  v_campo  text;
  v_estado text;
begin
  if v_rol is null or not v_rol = any (array['admin', 'manager', 'superuser']) then
    raise exception 'Sólo admin, manager o superuser pueden aprobar cambios' using errcode = '42501';
  end if;

  select * into v_sol from public.jugador_solicitudes_cambio where id = p_id for update;
  if not found or v_sol.estado <> 'pendiente' then
    raise exception 'La solicitud ya no está pendiente' using errcode = 'P0002';
  end if;
  if v_rol <> 'superuser' and v_sol.club_id <> get_user_club_id() then
    raise exception 'La solicitud no es de tu club' using errcode = '42501';
  end if;

  -- Sólo los campos que el jugador pidió Y que están en la lista blanca.
  select coalesce(array_agg(k), '{}') into v_campos
    from unnest(coalesce(p_aprobados, '{}')) k
   where k = any (public._campos_editables_jugador())
     and v_sol.cambios ? k;

  foreach v_campo in array v_campos loop
    execute format('update public.jugadores set %I = $1 where id::text = $2 and club_id::text = $3', v_campo)
      using v_sol.cambios -> v_campo ->> 'despues', v_sol.jugador_id, v_sol.club_id;
  end loop;

  v_estado := case
    when coalesce(array_length(v_campos, 1), 0) = 0 then 'rechazada'
    when array_length(v_campos, 1) = (select count(*) from jsonb_object_keys(v_sol.cambios)) then 'aprobada'
    else 'parcial'
  end;

  update public.jugador_solicitudes_cambio
     set estado = v_estado,
         nota = nullif(btrim(coalesce(p_nota, '')), ''),
         resuelta_at = now(),
         resuelta_por = auth.uid()
   where id = p_id;

  return v_estado;
end
$$;

-- ── 6. PERMISOS ───────────────────────────────────────────────────────────
revoke all on function public.kiosco_mis_datos(uuid)                   from public;
revoke all on function public.kiosco_proponer_cambios(uuid, jsonb)     from public;
revoke all on function public.kiosco_cancelar_cambios(uuid)            from public;
revoke all on function public.resolver_solicitud_cambio(bigint, text[], text) from public;

grant execute on function public.kiosco_mis_datos(uuid)                   to authenticated;
grant execute on function public.kiosco_proponer_cambios(uuid, jsonb)     to authenticated;
grant execute on function public.kiosco_cancelar_cambios(uuid)            to authenticated;
grant execute on function public.resolver_solicitud_cambio(bigint, text[], text) to authenticated;

grant select on public.jugador_solicitudes_cambio to authenticated;
