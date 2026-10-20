-- ═══════════════════════════════════════════════════════════════════════════
--  CATÁLOGO DE LOS SOBRES = HISTORIAL GUARDADO
--
--  Las cartas de premio (POTW, TOTW, POTM, TOTM, TOTY) que pueden salir en los
--  sobres tienen que estar en el historial de MySquad (cartas_destacadas).
--  Antes, si se publicaba una carta y después se quitaba ese premio del
--  historial, la carta seguía en el catálogo y salía en los sobres (por
--  ejemplo un TOTM de un mes que nunca quedó guardado).
--
--  1. Da de BAJA las cartas de premio del catálogo que ya no están en el
--     historial: dejan de salir en los sobres y en el V-Draft. No se borran
--     (borrarlas se llevaría, por la clave foránea, las copias que ya tienen
--     los jugadores). Es la misma baja del modo GOD (cartas_catalogo.activa).
--  2. Desde ahora, al quitar (o cambiar) un premio del historial, sus cartas se
--     dan de baja solas (si se vuelve a guardar, se dan de alta desde el modo GOD).
--
--  La clave de una carta de premio es "TIPO|periodo|id_jugador" (ver
--  catalogoDeCartas en src/analytics/sobres.js). Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cartas_catalogo add column if not exists activa boolean not null default true;

-- ¿La carta de premio del catálogo está en el historial del club?
create or replace function public._carta_premio_vigente(p_club uuid, p_clave text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cartas_destacadas d
     where d.club_id = p_club
       and d.tipo = split_part(p_clave, '|', 1)
       and d.periodo = split_part(p_clave, '|', 2)
       and exists (select 1 from jsonb_array_elements(d.jugadores) j
                    where j ->> 'id' = split_part(p_clave, '|', 3)))
$$;

-- 1. Baja de lo que quedó colgado.
update public.cartas_catalogo k set activa = false
 where k.tipo <> 'BASE' and k.activa
   and not public._carta_premio_vigente(k.club_id, k.clave);

-- 2. Al quitar o cambiar un premio del historial, sus cartas se dan de baja.
create or replace function public._cartas_destacadas_sincronizar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.cartas_catalogo k set activa = false
   where k.club_id = old.club_id
     and k.tipo <> 'BASE' and k.activa
     and split_part(k.clave, '|', 1) = old.tipo
     and split_part(k.clave, '|', 2) = old.periodo
     and not public._carta_premio_vigente(k.club_id, k.clave);
  return null;
end
$$;

drop trigger if exists cartas_destacadas_sincronizar on public.cartas_destacadas;
create trigger cartas_destacadas_sincronizar
  after delete or update on public.cartas_destacadas
  for each row execute function public._cartas_destacadas_sincronizar();

revoke all on function public._cartas_destacadas_sincronizar() from public, anon, authenticated;
