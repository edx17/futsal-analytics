-- ════════════════════════════════════════════════════════════════════════════
--  PUSH DE JUGADORES: perfil_id deja de ser obligatorio
--
--  push_subscriptions nació para el cuerpo técnico, con perfil_id NOT NULL.
--  Cuando se sumaron los avisos al teléfono del jugador (kiosco_guardar_push,
--  migración 20260924120000) esas filas se guardan con jugador_id y SIN
--  perfil_id, porque el jugador no tiene usuario: el insert fallaba siempre
--  con 23502 ("null value in column perfil_id ... violates not-null
--  constraint") y ningún jugador podía activar los avisos.
--
--  Ahora cada fila tiene que tener uno de los dos: perfil_id (staff) o
--  jugador_id (jugador). El smart-service ya las separa por jugador_id.
--
--  Idempotente: se puede correr más de una vez.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.push_subscriptions
  alter column perfil_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'push_subscriptions_dueno_chk'
       and conrelid = 'public.push_subscriptions'::regclass
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_dueno_chk
      check (perfil_id is not null or jugador_id is not null);
  end if;
end $$;
