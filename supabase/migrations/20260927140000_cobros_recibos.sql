-- ════════════════════════════════════════════════════════════════════════════
--  COBROS A PRUEBA DE ERRORES, ANULACIÓN CON RASTRO Y NÚMERO DE RECIBO
--
--  Antes, cobrar eran dos escrituras sueltas desde el navegador (el pago y
--  la deuda): si se cortaba en el medio, quedaban desparejos. Y anular
--  borraba el pago sin dejar rastro.
--
--  Ahora:
--   · registrar_cobro(deuda, monto, método): en una sola transacción bloquea
--     la deuda, valida que el monto no supere el saldo, le da al pago el
--     número de recibo que sigue en el club y actualiza la deuda.
--   · anular_cobro(pago, motivo): marca el pago como anulado (cuándo, quién
--     y por qué) y le devuelve el importe a la deuda. El pago queda en la
--     base; la caja y los reportes lo dejan de sumar.
--   · Los pagos no se pueden borrar (salvo el superuser o el servidor).
--   · kiosco_estado_cuenta() suma los pagos del jugador con su recibo.
--
--  Quién puede: superuser, admin, manager y tesorero del club de la deuda.
--  Idempotente. Requiere 20260927120000 (maneja_plata, kiosco_sesiones).
-- ════════════════════════════════════════════════════════════════════════════

set client_min_messages = warning;

-- ── 1. COLUMNAS ───────────────────────────────────────────────────────────
alter table public.tesoreria_pagos
  add column if not exists recibo_numero    integer,
  add column if not exists registrado_por   uuid,
  add column if not exists anulado_at       timestamptz,
  add column if not exists anulado_por      uuid,
  add column if not exists motivo_anulacion text;

create unique index if not exists tesoreria_pagos_recibo_idx
    on public.tesoreria_pagos (club_id, recibo_numero) where recibo_numero is not null;
create index if not exists tesoreria_pagos_jugador_idx
    on public.tesoreria_pagos (club_id, jugador_id, fecha_pago);

comment on column public.tesoreria_pagos.recibo_numero is 'Número de recibo, correlativo por club. Null en los pagos anteriores a los recibos.';
comment on column public.tesoreria_pagos.anulado_at is 'Si no es null, el cobro se anuló: no suma en caja ni en reportes.';

-- El último número de recibo de cada club.
create table if not exists public.tesoreria_contadores (
  club_id       uuid primary key,
  ultimo_recibo integer not null default 0
);
alter table public.tesoreria_contadores enable row level security;
drop policy if exists "Plata SELECT tesoreria_contadores" on public.tesoreria_contadores;
create policy "Plata SELECT tesoreria_contadores" on public.tesoreria_contadores for select to authenticated
  using ((select public.maneja_plata(club_id)) or (select public.get_user_rol()) = 'superuser');

-- ── 2. LOS PAGOS NO SE BORRAN ─────────────────────────────────────────────
create or replace function public.tesoreria_pagos_no_se_borran()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.get_user_rol() = 'superuser' then
    return old;
  end if;
  raise exception 'Los cobros no se borran: se anulan (anular_cobro)' using errcode = '42501';
end
$$;

drop trigger if exists tesoreria_pagos_no_se_borran on public.tesoreria_pagos;
create trigger tesoreria_pagos_no_se_borran
  before delete on public.tesoreria_pagos
  for each row execute function public.tesoreria_pagos_no_se_borran();

-- ── 3. COBRAR ─────────────────────────────────────────────────────────────
create or replace function public.registrar_cobro(
  p_deuda_id uuid,
  p_monto    numeric,
  p_metodo   text,
  p_fecha    date default null,
  p_notas    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d        public.tesoreria_deudas;
  v_saldo  numeric;
  v_pagado numeric;
  v_estado text;
  v_recibo integer;
  v_pago   uuid;
begin
  select * into d from public.tesoreria_deudas where id = p_deuda_id for update;
  if not found then
    raise exception 'La cuota no existe' using errcode = 'P0002';
  end if;
  if not (public.maneja_plata(d.club_id) or public.get_user_rol() = 'superuser') then
    raise exception 'No tenés permiso para cobrar en este club' using errcode = '42501';
  end if;
  if d.estado not in ('Pendiente', 'Parcial') then
    raise exception 'Esta cuota no tiene saldo (%).', d.estado using errcode = '22023';
  end if;

  v_saldo := d.monto_original - coalesce(d.monto_pagado, 0);
  if p_monto is null or p_monto <= 0 then
    raise exception 'Ingresá un monto válido.' using errcode = '22023';
  end if;
  if p_monto > v_saldo + 0.005 then
    raise exception 'Esa cuota debe $%. No se puede cobrar más que eso.', trim(to_char(v_saldo, 'FM999G999G990')) using errcode = '22023';
  end if;

  insert into public.tesoreria_contadores as c (club_id, ultimo_recibo)
  values (d.club_id, 1)
  on conflict (club_id) do update set ultimo_recibo = c.ultimo_recibo + 1
  returning ultimo_recibo into v_recibo;

  insert into public.tesoreria_pagos (club_id, deuda_id, jugador_id, monto, metodo_pago, fecha_pago, notas, recibo_numero, registrado_por)
  values (d.club_id, d.id, d.jugador_id, p_monto, coalesce(nullif(p_metodo, ''), 'Efectivo'),
          coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
          p_notas, v_recibo, auth.uid())
  returning id into v_pago;

  v_pagado := coalesce(d.monto_pagado, 0) + p_monto;
  v_estado := case when v_pagado + 0.005 >= d.monto_original then 'Pagada' else 'Parcial' end;
  update public.tesoreria_deudas set monto_pagado = v_pagado, estado = v_estado where id = d.id;

  return jsonb_build_object('pago_id', v_pago, 'recibo_numero', v_recibo, 'monto_pagado', v_pagado, 'estado', v_estado);
end
$$;

-- ── 4. ANULAR ─────────────────────────────────────────────────────────────
create or replace function public.anular_cobro(p_pago_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.tesoreria_pagos;
  d public.tesoreria_deudas;
  v_pagado numeric;
  v_estado text;
begin
  select * into p from public.tesoreria_pagos where id = p_pago_id for update;
  if not found then
    raise exception 'El cobro no existe' using errcode = 'P0002';
  end if;
  if not (public.maneja_plata(p.club_id) or public.get_user_rol() = 'superuser') then
    raise exception 'No tenés permiso para anular cobros en este club' using errcode = '42501';
  end if;
  if p.anulado_at is not null then
    raise exception 'Ese cobro ya estaba anulado' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí el motivo de la anulación' using errcode = '22023';
  end if;

  update public.tesoreria_pagos
     set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo)
   where id = p.id;

  if p.deuda_id is not null then
    select * into d from public.tesoreria_deudas where id = p.deuda_id for update;
    if found and d.estado is distinct from 'Beca' then
      v_pagado := greatest(0, coalesce(d.monto_pagado, 0) - p.monto);
      v_estado := case when v_pagado > 0.005 then 'Parcial' else 'Pendiente' end;
      update public.tesoreria_deudas set monto_pagado = v_pagado, estado = v_estado where id = d.id;
    end if;
  end if;

  return jsonb_build_object('pago_id', p.id, 'deuda_id', p.deuda_id, 'estado', v_estado);
end
$$;

revoke execute on function public.registrar_cobro(uuid, numeric, text, date, text) from anon;
revoke execute on function public.anular_cobro(uuid, text) from anon;
grant execute on function public.registrar_cobro(uuid, numeric, text, date, text) to authenticated;
grant execute on function public.anular_cobro(uuid, text) to authenticated;

-- ── 5. KIOSCO: SALDO Y PAGOS DEL JUGADOR ──────────────────────────────────
create or replace function public.kiosco_estado_cuenta(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.kiosco_sesiones;
  v_club jsonb;
  v_deudas jsonb;
  v_pagos jsonb;
begin
  select * into s from public.kiosco_sesiones
   where token = p_token and expira_at > now();
  if not found then
    raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
  end if;

  select jsonb_build_object(
           'nombre', c.nombre, 'escudo_url', c.escudo_url, 'alias_cobro', c.alias_cobro,
           'cbu', c.cbu, 'cvu', c.cvu, 'whatsapp_tesoreria', c.whatsapp_tesoreria)
    into v_club
    from public.clubes c where c.id::text = s.club_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'concepto', d.concepto, 'monto_original', d.monto_original,
           'monto_pagado', coalesce(d.monto_pagado, 0), 'fecha_vencimiento', d.fecha_vencimiento,
           'mes_correspondiente', d.mes_correspondiente, 'estado', d.estado)
         order by d.fecha_vencimiento, d.created_at), '[]'::jsonb)
    into v_deudas
    from public.tesoreria_deudas d
   where d.jugador_id::text = s.jugador_id
     and d.club_id::text = s.club_id
     and d.estado in ('Pendiente', 'Parcial');

  select coalesce(jsonb_agg(x.fila order by x.fecha_pago desc, x.recibo_numero desc nulls last), '[]'::jsonb)
    into v_pagos
    from (
      select p.fecha_pago, p.recibo_numero,
             jsonb_build_object(
               'id', p.id, 'fecha_pago', p.fecha_pago, 'monto', p.monto, 'metodo_pago', p.metodo_pago,
               'recibo_numero', p.recibo_numero, 'concepto', d.concepto) as fila
        from public.tesoreria_pagos p
        left join public.tesoreria_deudas d on d.id = p.deuda_id
       where p.jugador_id::text = s.jugador_id
         and p.club_id::text = s.club_id
         and p.anulado_at is null
       order by p.fecha_pago desc
       limit 36
    ) x;

  return jsonb_build_object('club', coalesce(v_club, '{}'::jsonb), 'deudas', v_deudas, 'pagos', v_pagos);
end
$$;

grant execute on function public.kiosco_estado_cuenta(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
