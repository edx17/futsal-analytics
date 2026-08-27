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
--  ⚠️ ESTE ARCHIVO TIENE UN PLACEHOLDER A PROPÓSITO.
--  Pegalo en el SQL Editor de Supabase reemplazando el CRON_SECRET, y NO
--  subas la versión completada a git: ese sí es un secreto de verdad (a
--  diferencia de la anon key, que viaja en el navegador).
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
  -- El nombre de la función tiene que coincidir con el de `supabase functions
  -- list`. El cron viejo apuntaba a /tablon-push, que no existe, y encima a
  -- un host al que le faltaban dos caracteres del ref del proyecto: por eso
  -- las respuestas quedaban con status_code NULL, sin llegar a ningún lado.
  destino text := 'https://xwjskbhmwdeadgepsbns.supabase.co/functions/v1/smart-service';

  -- ↓↓↓ REEMPLAZAR ANTES DE CORRER ↓↓↓
  secreto_cron text := 'REEMPLAZAR_CRON_SECRET';  -- el mismo valor que
                                                  -- supabase secrets set CRON_SECRET=...
  -- ↑↑↑ REEMPLAZAR ANTES DE CORRER ↑↑↑
  encabezados jsonb;
  horario record;
begin
  if secreto_cron = 'REEMPLAZAR_CRON_SECRET' then
    raise exception 'Falta reemplazar el CRON_SECRET antes de correr esto';
  end if;

  /* Sin Authorization a propósito: la función se despliega con
     verify_jwt = false (ver supabase/config.toml), así que no hay JWT que
     mandar. Mandarlo era lo que devolvía 401 UNAUTHORIZED_INVALID_JWT_FORMAT
     antes de llegar al código. La autenticación es el x-cron-secret. */
  encabezados := jsonb_build_object(
    'Content-Type',  'application/json',
    'x-cron-secret', secreto_cron
  );

  for horario in
    select * from (values
      ('tablon-push-manana',   '0 11 * * *'),
      ('tablon-push-mediodia', '0 16 * * *'),
      ('tablon-push-tarde',    '0 21 * * *')
    ) as t(nombre, momento)
  loop
    /* timeout_milliseconds es imprescindible: el default de pg_net son 5
       segundos y el smart-service recorre todos los clubes calculando
       alertas, así que no entra ni cerca. Cuando vence, la fila de
       net._http_response queda con status_code NULL y timed_out = true, y
       el job del cron IGUAL figura 'succeeded' — que es la combinación que
       hace que esto parezca funcionar durante meses sin funcionar. */
    perform cron.schedule(horario.nombre, horario.momento, format($job$
      select net.http_post(
        url                  := %L,
        headers              := %L::jsonb,
        body                 := '{}'::jsonb,
        timeout_milliseconds := 120000
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
-- asíncrono: devuelve un id de pedido, no la respuesta). Mirar timed_out y
-- error_msg, no sólo status_code: un status_code NULL casi siempre es un
-- timeout, no una respuesta vacía:
--   select id, status_code, timed_out, error_msg, content, created
--     from net._http_response order by created desc limit 5;
