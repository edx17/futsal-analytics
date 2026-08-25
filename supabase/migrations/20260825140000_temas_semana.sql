-- ═══════════════════════════════════════════════════════════════════════════
--  TEMA / HILO CONDUCTOR DE LA SEMANA
--
--  Una línea por semana y por categoría con el patrón, la temática o el foco
--  que atraviesa todo el microciclo ("presión alta tras pérdida", "salidas
--  con arquero", "finalización de segunda jugada"...).
--
--  Vive aparte de `sesiones` a propósito: el tema es de la SEMANA, no de un
--  día. Guardarlo en cada sesión obligaría a repetirlo y a mantenerlo
--  sincronizado en cuatro filas distintas.
--
--  La semana se identifica por el LUNES (`fecha_inicio`), que es como el
--  planificador arma la grilla. Un único tema por club + categoría + lunes.
--
--  Es aditivo: nada de lo que existe cambia. Si esta migración no se corre,
--  el planificador sigue funcionando igual, solo que sin la barra de tema.
-- ═══════════════════════════════════════════════════════════════════════════

-- El tipo de club_id se copia de `sesiones` en tiempo de migración, para no
-- adivinarlo (uuid vs text) ni quedar desfasado si alguna vez cambia.
do $tabla$
declare
  tipo_club text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into tipo_club
    from pg_attribute a
   where a.attrelid = 'public.sesiones'::regclass
     and a.attname = 'club_id'
     and a.attnum > 0;

  execute format($t$
    create table if not exists public.temas_semana (
      id uuid primary key default gen_random_uuid(),
      club_id %s not null,

      -- Categoría del plantel (Primera, Tercera, Sub 17...). El tema es por
      -- categoría: cada plantel puede estar trabajando algo distinto.
      categoria_equipo text not null,

      -- LUNES de la semana. Siempre lunes: lo normaliza el front antes de
      -- escribir, y el índice único de abajo se apoya en eso.
      fecha_inicio date not null,

      -- La línea que se ve cruzando la semana en el planificador.
      titulo text not null,

      -- Bajada opcional: qué se busca, contra qué rival, qué se mide.
      detalle text,

      -- Color del hilo en la grilla (hex). Solo estético.
      color text,

      created_at timestamptz not null default now()
    )
  $t$, tipo_club);
end
$tabla$;

-- Un solo tema por club + categoría + semana. Es además el conflict target
-- del upsert que usa "copiar semana" para arrastrar el tema al microciclo
-- siguiente sin duplicarlo.
create unique index if not exists temas_semana_unico
  on public.temas_semana (club_id, categoria_equipo, fecha_inicio);

-- El planificador siempre pide un rango de semanas de un club.
create index if not exists temas_semana_club_fecha
  on public.temas_semana (club_id, fecha_inicio);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Las mismas tres políticas que ya usan sesiones, eventos y jugadores, con
-- las mismas funciones helper. get_user_club_id() devuelve text, por eso el
-- club_id se castea.
do $rls$
begin
  alter table public.temas_semana enable row level security;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'temas_semana'
                    and policyname = 'Staff SELECT temas_semana') then
    create policy "Staff SELECT temas_semana" on public.temas_semana
      for select using ((club_id)::text = get_user_club_id());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'temas_semana'
                    and policyname = 'CT/Admin ALL temas_semana') then
    create policy "CT/Admin ALL temas_semana" on public.temas_semana
      for all using (
        (get_user_rol() = any (array['ct'::text, 'admin'::text, 'manager'::text]))
        and ((club_id)::text = get_user_club_id())
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'temas_semana'
                    and policyname = 'Superuser ALL temas_semana') then
    create policy "Superuser ALL temas_semana" on public.temas_semana
      for all using (get_user_rol() = 'superuser'::text);
  end if;
end
$rls$;
