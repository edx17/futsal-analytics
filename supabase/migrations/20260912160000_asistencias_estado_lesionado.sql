-- ═══════════════════════════════════════════════════════════════════════════
--  PRESENTISMO: HABILITAR EL ESTADO 'lesionado'
--
--  La migración 20260911170000 sumó el estado 'lesionado' al presentismo y
--  dejó escrito que "no necesita migración porque la columna es texto libre".
--  Eso estaba MAL: `asistencias.estado` tiene un CHECK que sólo admite los
--  cuatro estados originales, así que guardar la planilla terminaba en
--
--      new row for relation "asistencias" violates check constraint
--      "asistencias_estado_check"
--
--  Y como la planilla se guarda con un upsert de TODOS los jugadores del día,
--  alcanzaba con un solo lesionado en la lista para que no se pudiera guardar
--  la asistencia de nadie. O sea: el presentismo quedó rota entera.
--
--  El constraint se busca por su definición y no por su nombre, porque el
--  nombre puede variar según cómo se haya creado la tabla.
-- ═══════════════════════════════════════════════════════════════════════════

do $lesionado$
declare
  c record;
begin
  -- 1. Sacar el/los CHECK que haya sobre `estado`, se llamen como se llamen.
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.asistencias'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table public.asistencias drop constraint %I', c.conname);
  end loop;

  -- 2. Volver a ponerlo con el quinto estado incluido.
  alter table public.asistencias
    add constraint asistencias_estado_check
    check (estado in ('presente', 'ausente', 'tarde', 'justificado', 'lesionado'));
end
$lesionado$;
