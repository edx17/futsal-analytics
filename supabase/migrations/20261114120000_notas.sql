-- ═══════════════════════════════════════════════════════════════════════════
--  ANOTADOR: NOTAS DEL CUERPO TÉCNICO
--
--  Notas cortas que se toman desde el anotador flotante (en cualquier
--  pantalla) y quedan vinculadas a lo que se estaba mirando:
--    vinculo_tipo   'general' | 'video' | 'rival' | 'microciclo' | 'sesion' | 'partido'
--    vinculo_id     el id de eso (el lunes de la semana para el microciclo)
--    vinculo_nombre cómo se llamaba al anotar (para listarlas sin buscarlo)
--    video_seg      en un video: el segundo (al tocar la nota, el video salta ahí)
--  Cada nota es del que la escribe; con `compartida` la ve todo el cuerpo
--  técnico del club (manager, admin, ct y el superusuario). Sólo el autor la
--  edita o la borra.
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.notas (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubes(id) on delete cascade,
  autor          uuid not null default auth.uid(),
  texto          text not null check (length(trim(texto)) between 1 and 4000),
  compartida     boolean not null default false,
  fijada         boolean not null default false,
  vinculo_tipo   text not null default 'general'
                 check (vinculo_tipo in ('general', 'video', 'rival', 'microciclo', 'sesion', 'partido')),
  vinculo_id     text,
  vinculo_nombre text,
  video_seg      numeric check (video_seg is null or video_seg >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists notas_vinculo on public.notas (club_id, vinculo_tipo, vinculo_id);
create index if not exists notas_autor on public.notas (autor, created_at desc);
comment on table public.notas is 'Anotador: notas del cuerpo técnico vinculadas a un video, rival, microciclo, sesión o partido.';

alter table public.notas enable row level security;

-- Ver: las mías, y las compartidas del cuerpo técnico de mi club.
drop policy if exists "Notas: ver" on public.notas;
create policy "Notas: ver" on public.notas for select to authenticated
  using (autor = auth.uid()
         or (compartida and club_id::text = (select public.get_user_club_id())
             and (select public.get_user_rol()) in ('superuser', 'manager', 'admin', 'ct')));

-- Escribir: sólo el cuerpo técnico, en su club y a su nombre.
drop policy if exists "Notas: crear" on public.notas;
create policy "Notas: crear" on public.notas for insert to authenticated
  with check (autor = auth.uid() and club_id::text = (select public.get_user_club_id())
              and (select public.get_user_rol()) in ('superuser', 'manager', 'admin', 'ct'));

drop policy if exists "Notas: editar" on public.notas;
create policy "Notas: editar" on public.notas for update to authenticated
  using (autor = auth.uid()) with check (autor = auth.uid());

drop policy if exists "Notas: borrar" on public.notas;
create policy "Notas: borrar" on public.notas for delete to authenticated
  using (autor = auth.uid());

create or replace function public._notas_tocada()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists notas_tocada on public.notas;
create trigger notas_tocada before update on public.notas for each row execute function public._notas_tocada();

grant select, insert, update, delete on public.notas to authenticated;
