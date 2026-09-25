-- ════════════════════════════════════════════════════════════════════════
--  Sueldos y viáticos enlazados al empleado por id, no por el nombre
--
--  Hasta ahora el pago de un sueldo se reconocía comparando el texto de
--  `responsable` con el nombre del empleado: si se corregía el nombre, el
--  sueldo volvía a figurar como impago. `empleado_id` lo ata a la ficha.
--  Los egresos viejos quedan en null y la app los sigue reconociendo por
--  nombre.
--
--  El tipo de la columna se copia del id de tesoreria_empleados (puede ser
--  bigint o uuid según cómo se creó la tabla).
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  tipo text;
begin
  select format_type(a.atttypid, a.atttypmod) into tipo
  from pg_attribute a
  where a.attrelid = 'public.tesoreria_empleados'::regclass and a.attname = 'id';

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tesoreria_egresos' and column_name = 'empleado_id'
  ) then
    execute format(
      'alter table public.tesoreria_egresos add column empleado_id %s references public.tesoreria_empleados(id) on delete set null',
      tipo);
  end if;
end $$;

create index if not exists tesoreria_egresos_empleado_idx on public.tesoreria_egresos (empleado_id);

comment on column public.tesoreria_egresos.empleado_id is
  'Empleado (staff o jugador con viático) al que corresponde el sueldo, viático o comisión. Null en gastos generales y en pagos viejos.';

notify pgrst, 'reload schema';
