-- ═══════════════════════════════════════════════════════════════════════════
--  PRUEBAS DE JUGADORES · EVALUACIÓN GUARDADA, LIGAS Y EVALUADOR POR PUESTO
--
--  1. pruebas_entregas: "GUARDAR EVALUACIÓN". Una por candidato, etapa y
--     evaluador. Con la entrega hecha, ese evaluador ya no carga ni corrige
--     puntajes del candidato en esa etapa (en ninguna sesión). Para corregir,
--     borra su entrega (CORREGIR), y eso sólo mientras la carga esté abierta.
--     Las entregas no tienen puntajes: todo el cuerpo técnico las ve (así se
--     sabe quién ya evaluó sin ver lo que puso).
--  2. pruebas_config.ligas: las ligas del club con el puntaje mínimo para
--     sugerirlas en el cierre ([{ "nombre": "AFA", "minimo": 3.8 }, …]).
--  3. pruebas_config.evaluadores_puesto: por puesto, cuántos evaluadores hacen
--     falta y, opcional, quién evalúa ({ "Arquero": { "min": 1, "asignado": uuid } }).
--     Si hay asignado, sólo esa persona (o el superusuario) carga puntajes de
--     los candidatos de ese puesto: lo controla la base, no sólo la pantalla.
--  4. pruebas_cierres.ligas: las ligas que tildó el DT al decidir.
--
--  Las evaluaciones que ya estaban cargadas se toman como guardadas (backfill),
--  así no cambian los cierres en curso; cada evaluador puede CORREGIR.
--  Idempotente. Depende de 20261117120000_pruebas_jugadores.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Configuración y cierres: columnas nuevas ──────────────────────────────
alter table public.pruebas_config  add column if not exists ligas jsonb not null default '[]'::jsonb;
alter table public.pruebas_config  add column if not exists evaluadores_puesto jsonb not null default '{}'::jsonb;
alter table public.pruebas_cierres add column if not exists ligas text[] not null default '{}';

-- ── Entregas ───────────────────────────────────────────────────────────────
create table if not exists public.pruebas_entregas (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubes(id) on delete cascade,
  categoria     text not null,
  candidato_id  uuid not null references public.pruebas_candidatos(id) on delete cascade,
  etapa         smallint not null check (etapa in (1, 2)),
  evaluador_id  uuid not null default auth.uid(),
  sesion_id     uuid references public.pruebas_sesiones(id) on delete set null,
  entregado_at  timestamptz not null default now(),
  unique (candidato_id, etapa, evaluador_id)
);
create index if not exists pruebas_entregas_club_cat on public.pruebas_entregas (club_id, categoria);

-- ¿Ya guardó este evaluador su evaluación del candidato en esa etapa?
create or replace function public._pruebas_entregado(p_candidato uuid, p_etapa smallint, p_evaluador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pruebas_entregas
                  where candidato_id = p_candidato and etapa = p_etapa and evaluador_id = p_evaluador)
$$;

-- La carga del candidato en la etapa sigue abierta (no hay cierre).
create or replace function public._pruebas_etapa_abierta(p_candidato uuid, p_etapa smallint)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.pruebas_cierres where candidato_id = p_candidato and etapa = p_etapa)
$$;

-- Quién tiene asignado el puesto de un candidato (null = cualquiera del cuerpo técnico).
-- Manda la configuración de la categoría; si no tiene ese puesto, la del club.
create or replace function public._pruebas_asignado(p_candidato uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(c.evaluadores_puesto -> k.puesto_principal ->> 'asignado', '')::uuid
       from public.pruebas_config c where c.club_id = k.club_id and c.categoria = k.categoria),
    (select nullif(c.evaluadores_puesto -> k.puesto_principal ->> 'asignado', '')::uuid
       from public.pruebas_config c where c.club_id = k.club_id and c.categoria is null))
  from public.pruebas_candidatos k where k.id = p_candidato
$$;

-- La entrega hereda club y categoría del candidato, y sólo vale con la carga abierta.
create or replace function public._pruebas_entrega_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k public.pruebas_candidatos;
begin
  select * into k from public.pruebas_candidatos where id = new.candidato_id;
  if k.id is null then raise exception 'pruebas: candidato inexistente' using errcode = 'P0001'; end if;
  if not public._pruebas_etapa_abierta(new.candidato_id, new.etapa) then
    raise exception 'pruebas: la carga de esta etapa ya se cerró' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pruebas_evaluaciones e join public.pruebas_sesiones s on s.id = e.sesion_id
                  where e.candidato_id = new.candidato_id and e.evaluador_id = new.evaluador_id and s.etapa = new.etapa) then
    raise exception 'pruebas: no hay puntajes para guardar' using errcode = 'P0001';
  end if;
  new.club_id := k.club_id;
  new.categoria := k.categoria;
  new.entregado_at := now();
  return new;
end
$$;
drop trigger if exists pruebas_entrega_antes on public.pruebas_entregas;
create trigger pruebas_entrega_antes before insert on public.pruebas_entregas
  for each row execute function public._pruebas_entrega_antes();

-- ── Evaluaciones: con la entrega hecha no se tocan; con asignado, sólo él ──
create or replace function public._pruebas_eval_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.pruebas_sesiones;
  k public.pruebas_candidatos;
  asignado uuid;
begin
  select * into s from public.pruebas_sesiones where id = new.sesion_id;
  select * into k from public.pruebas_candidatos where id = new.candidato_id;
  if s.id is null or k.id is null then raise exception 'pruebas: sesión o candidato inexistente' using errcode = 'P0001'; end if;
  if s.club_id <> k.club_id or s.categoria <> k.categoria then
    raise exception 'pruebas: el candidato no es de la categoría de la sesión' using errcode = 'P0001';
  end if;
  if new.bloque = 'juego_real' and s.etapa <> 2 then
    raise exception 'pruebas: el juego real se evalúa en la etapa 2' using errcode = 'P0001';
  end if;
  if s.etapa = 2 and exists (select 1 from public.pruebas_cierres c where c.candidato_id = k.id and c.etapa = 1
                                and c.estado = 'decidido' and c.decision = 'no_incorporar') then
    raise exception 'pruebas: en la etapa 1 se decidió no incorporarlo' using errcode = 'P0001';
  end if;
  if public._pruebas_entregado(k.id, s.etapa, new.evaluador_id) then
    raise exception 'pruebas: ya guardaste tu evaluación de este candidato en esta etapa (usá CORREGIR)' using errcode = 'P0001';
  end if;
  asignado := public._pruebas_asignado(k.id);
  if asignado is not null and asignado <> new.evaluador_id and coalesce((select public.get_user_rol()), '') <> 'superuser' then
    raise exception 'pruebas: los candidatos de este puesto los evalúa sólo quien tiene asignado el puesto' using errcode = 'P0001';
  end if;
  new.club_id := s.club_id;
  new.categoria := s.categoria;
  new.updated_at := now();
  return new;
end
$$;

-- Borrar un puntaje propio tampoco, si la evaluación está guardada.
drop policy if exists "Pruebas evaluaciones: borrar" on public.pruebas_evaluaciones;
create policy "Pruebas evaluaciones: borrar" on public.pruebas_evaluaciones for delete to authenticated
  using (evaluador_id = auth.uid() and public._pruebas_carga(club_id) and public._pruebas_carga_abierta(sesion_id, candidato_id)
         and not public._pruebas_entregado(candidato_id, (select s.etapa from public.pruebas_sesiones s where s.id = sesion_id), evaluador_id));

-- ── RLS de entregas ────────────────────────────────────────────────────────
alter table public.pruebas_entregas enable row level security;
drop policy if exists "Pruebas entregas: ver" on public.pruebas_entregas;
create policy "Pruebas entregas: ver" on public.pruebas_entregas for select to authenticated using (public._pruebas_ve(club_id));
drop policy if exists "Pruebas entregas: guardar" on public.pruebas_entregas;
create policy "Pruebas entregas: guardar" on public.pruebas_entregas for insert to authenticated
  with check (evaluador_id = auth.uid()
              and public._pruebas_carga((select k.club_id from public.pruebas_candidatos k where k.id = candidato_id)));
drop policy if exists "Pruebas entregas: corregir" on public.pruebas_entregas;
create policy "Pruebas entregas: corregir" on public.pruebas_entregas for delete to authenticated
  using ((evaluador_id = auth.uid() or coalesce((select public.get_user_rol()), '') = 'superuser')
         and public._pruebas_carga(club_id) and public._pruebas_etapa_abierta(candidato_id, etapa));

grant select, insert, delete on public.pruebas_entregas to authenticated;
revoke all on public.pruebas_entregas from anon;
revoke all on function public._pruebas_entregado(uuid, smallint, uuid) from public, anon;
revoke all on function public._pruebas_etapa_abierta(uuid, smallint) from public, anon;
revoke all on function public._pruebas_asignado(uuid) from public, anon;
grant execute on function public._pruebas_entregado(uuid, smallint, uuid) to authenticated;
grant execute on function public._pruebas_etapa_abierta(uuid, smallint) to authenticated;
grant execute on function public._pruebas_asignado(uuid) to authenticated;

-- ── Backfill: lo ya cargado cuenta como guardado (sólo donde la carga sigue abierta) ──
insert into public.pruebas_entregas (club_id, categoria, candidato_id, etapa, evaluador_id, sesion_id, entregado_at)
select distinct on (e.candidato_id, s.etapa, e.evaluador_id)
       e.club_id, e.categoria, e.candidato_id, s.etapa, e.evaluador_id, e.sesion_id, max(e.updated_at) over (partition by e.candidato_id, s.etapa, e.evaluador_id)
  from public.pruebas_evaluaciones e join public.pruebas_sesiones s on s.id = e.sesion_id
 where public._pruebas_etapa_abierta(e.candidato_id, s.etapa)
 order by e.candidato_id, s.etapa, e.evaluador_id, e.updated_at desc
on conflict (candidato_id, etapa, evaluador_id) do nothing;
