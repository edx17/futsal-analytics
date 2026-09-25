-- ════════════════════════════════════════════════════════════════════════════
--  BORRAR LAS CONTRASEÑAS GUARDADAS EN TEXTO PLANO (perfiles.password_clara)
--
--  La app no usa esta columna en ningún lado. Pero cualquiera del mismo club
--  que tenga usuario (incluidos los jugadores) puede leer los perfiles del
--  club, y con eso la contraseña de su admin o de su manager.
--
--  Esto vacía la columna. No borra la columna, para no romper nada que la
--  nombre, y no toca las contraseñas reales (esas están en auth.users,
--  cifradas): nadie pierde el acceso.
--
--  Después de correrla, lo recomendable es que quien tenía una contraseña
--  guardada acá la cambie, porque pudo haber sido leída.
-- ════════════════════════════════════════════════════════════════════════════

-- Cuántas había (se muestra antes de vaciarlas).
select count(*) as contrasenas_en_texto_plano
  from public.perfiles
 where password_clara is not null and password_clara <> '';

update public.perfiles set password_clara = null where password_clara is not null;

comment on column public.perfiles.password_clara is
  'EN DESUSO. Se vació el 27/09/2026: guardar contraseñas en texto plano es inseguro. No volver a escribir acá.';
