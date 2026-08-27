-- ════════════════════════════════════════════════════════════════════════════
--  Cron del smart-service (envío de notificaciones push)
--
--  El Edge Function no se ejecuta solo: alguien tiene que invocarlo. Sin este
--  cron, los dispositivos quedan bien dados de alta en push_subscriptions y no
--  llega ningún push nunca, que es exactamente el síntoma difícil de
--  diagnosticar (todo verde, nada que llegue).
--
--  ⚠️ EN LA BASE DE PRODUCCIÓN ESTO YA ESTÁ HECHO. Los tres jobs existen y
--  están activos. Este archivo queda versionado para poder reconstruirlos en
--  un entorno nuevo, y usa EXACTAMENTE los mismos nombres y horarios que los
--  de producción: correrlo ahí los reemplaza en su lugar, no los duplica.
--  Antes de correrlo en cualquier lado, mirá qué hay:
--      select jobname, schedule, active from cron.job order by jobname;
--
--  ⚠️ ESTE ARCHIVO TIENE PLACEHOLDERS A PROPÓSITO.
--  Pegalo en el SQL Editor de Supabase reemplazando los dos valores, y NO
--  subas la versión completada a git: la service_role key es un secreto de
--  verdad (a diferencia de la anon key, que viaja en el navegador).
--
--  Horarios en UTC. Argentina es UTC-3, así que:
--     11:00 UTC = 08:00  · 16:00 UTC = 13:00 · 21:00 UTC = 18:00
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
 where jobname in ('tablon-push-manana', 'tablon-push-mediodia', 'tablon-push-tarde');

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
      ('tablon-push-manana',   '0 11 * * *'),
      ('tablon-push-mediodia', '0 16 * * *'),
      ('tablon-push-tarde',    '0 21 * * *')
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
--
-- Para ver si corrieron. Ojo: job_run_details NO tiene jobname, sólo jobid,
-- así que hay que unirlo con cron.job:
--   select j.jobname, d.status, d.return_message, d.start_time
--     from cron.job_run_details d
--     join cron.job j using (jobid)
--    order by d.start_time desc limit 10;
--
-- Y para ver qué contestó el Edge Function de verdad (net.http_post es
-- asíncrono: devuelve un id de pedido, no la respuesta):
--   select id, status_code, content, created
--     from net._http_response order by created desc limit 5;
