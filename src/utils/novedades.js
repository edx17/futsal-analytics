/* Filtro PostgREST para `.or()` que deja afuera las novedades vencidas.

   Va en la consulta y no filtrando en JS después: con el `.limit()` del
   final, un filtro en el cliente se come los lugares con avisos vencidos y
   deja afuera novedades vigentes más viejas. Sin `fecha_vencimiento` no
   vence nunca. */
export const filtroNoVencidas = () =>
  `fecha_vencimiento.is.null,fecha_vencimiento.gt."${new Date().toISOString()}"`;
