-- ═══════════════════════════════════════════════════════════════════════════
--  REPORTE DEL JUGADOR · DEVOLUCIÓN POR ÁREA Y STAFF AL PIE
--
--  reportes_devoluciones: lo que escribe cada área sobre el jugador en la
--    temporada (como la "devolución anual" en papel). Una fila por jugador,
--    temporada y área. Guarda quién la escribió y cuándo.
--      áreas: tactico (táctico-técnico), fisico (preparación física),
--             nutricion, conductual, medico (cuerpo médico), datos (análisis de datos)
--  reportes_staff: el cuerpo técnico de una categoría en la temporada, para
--    el pie del reporte ([{ "cargo": "DT", "nombre": "…" }, …]).
--
--  Leer y escribir: el staff del club (CT, admin, manager) y el superusuario,
--  igual que las lesiones y el resto de los datos deportivos.
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.reportes_devoluciones (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubes(id) on delete cascade,
  jugador_id   bigint not null,
  temporada    int not null,
  area         text not null check (area in ('tactico', 'fisico', 'nutricion', 'conductual', 'medico', 'datos')),
  texto        text not null default '',
  autor_id     uuid default auth.uid(),
  autor_nombre text,
  updated_at   timestamptz not null default now(),
  unique (club_id, jugador_id, temporada, area)
);
create index if not exists reportes_devoluciones_jugador on public.reportes_devoluciones (club_id, jugador_id, temporada);

create table if not exists public.reportes_staff (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  categoria   text not null,
  temporada   int not null,
  integrantes jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (club_id, categoria, temporada)
);

-- Autor y fecha los pone la base (no la pantalla).
create or replace function public._reportes_devolucion_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := coalesce(auth.uid(), new.autor_id);
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists reportes_devolucion_antes on public.reportes_devoluciones;
create trigger reportes_devolucion_antes before insert or update on public.reportes_devoluciones
  for each row execute function public._reportes_devolucion_antes();

alter table public.reportes_devoluciones enable row level security;
alter table public.reportes_staff enable row level security;

do $rls$
declare t text;
begin
  foreach t in array array['reportes_devoluciones', 'reportes_staff'] loop
    execute format('drop policy if exists "Staff lee %1$s" on public.%1$I', t);
    execute format('create policy "Staff lee %1$s" on public.%1$I for select to authenticated using (
      get_user_rol() = ''superuser'' or (get_user_rol() = any (array[''ct'', ''admin'', ''manager'']) and club_id::text = get_user_club_id()))', t);
    execute format('drop policy if exists "Staff escribe %1$s" on public.%1$I', t);
    execute format('create policy "Staff escribe %1$s" on public.%1$I for all to authenticated using (
      get_user_rol() = ''superuser'' or (get_user_rol() = any (array[''ct'', ''admin'', ''manager'']) and club_id::text = get_user_club_id()))
      with check (get_user_rol() = ''superuser'' or (get_user_rol() = any (array[''ct'', ''admin'', ''manager'']) and club_id::text = get_user_club_id()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end
$rls$;
