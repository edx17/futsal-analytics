-- ════════════════════════════════════════════════════════════════════════════
--  Cron del smart-service (envío de notificaciones push)
--
--  El Edge Function no se ejecuta solo: alguien tiene que invocarlo. Sin este
--  cron, los dispositivos quedan bien dados de alta en push_subscriptions y no
--  llega ningún push nunca, que es exactamente el síntoma difícil de
--  diagnosticar (todo verde, nada que llegue).
--
--  ⚠️ ESTE ARCHIVO TIENE PLACEHOLDERS A PROPÓSITO.
--  Pegalo en el SQL Editor de Supabase reemplazando los dos valores, y NO
--  subas la versión completada a git: la service_role key es un secreto de
--  verdad (a diferencia de la anon key, que viaja en el navegador).
--
--  Horarios en UTC. Argentina es UTC-3, así que:
--     11:00 UTC = 08:00  · 16:00 UTC = 13:00 · 22:00 UTC = 19:00
--
--  Correr tres veces por día no manda tres digests: el digest está deduplicado
--  por día en tablon_notificado (run_key = 'digest-YYYY-MM-DD'). Las tres
--  corridas son para que la previa de partido (ventana de horas antes) tenga
--  varias chances de caer dentro de la ventana.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Si ya existían de una corrida anterior, se reemplazan sin duplicar.
select cron.unschedule(jobname)
  from cron.job
 where jobname in ('smart-service-manana', 'smart-service-tarde', 'smart-service-noche');

do $cron$
declare
  destino text := 'https://xwjskbhmwdeadgepsbns.supabase.co/functions/v1/smart-service';
  -- ↓↓↓ REEMPLAZAR ANTES DE CORRER ↓↓↓
  clave_service_role text := 'REEMPLAZAR_SERVICE_ROLE_KEY';
  secreto_cron       text := 'REEMPLAZAR_CRON_SECRET';  -- el mismo que pusiste en
                                                        -- supabase secrets set CRON_SECRET=...
                                                        -- Si no configuraste CRON_SECRET, dejalo
                                                        -- como está: la función no lo mira.
  -- ↑↑↑ REEMPLAZAR ANTES DE CORRER ↑↑↑
  encabezados jsonb;
  horario record;
begin
  if clave_service_role = 'REEMPLAZAR_SERVICE_ROLE_KEY' then
    raise exception 'Falta reemplazar la service_role key antes de correr esto';
  end if;

  encabezados := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || clave_service_role,
    'x-cron-secret', secreto_cron
  );

  for horario in
    select * from (values
      ('smart-service-manana', '0 11 * * *'),
      ('smart-service-tarde',  '0 16 * * *'),
      ('smart-service-noche',  '0 22 * * *')
    ) as t(nombre, momento)
  loop
    perform cron.schedule(horario.nombre, horario.momento, format($job$
      select net.http_post(
        url     := %L,
        headers := %L::jsonb,
        body    := '{}'::jsonb
      );
    $job$, destino, encabezados::text));
  end loop;
end
$cron$;

-- Para ver que quedaron programados:
--   select jobname, schedule, active from cron.job order by jobname;
-- Para ver si corrieron y qué devolvieron:
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
