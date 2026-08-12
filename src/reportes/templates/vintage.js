// src/reportes/templates/vintage.js
//
// Convención de ids (misma que verde.js):
//   - `deco-*`  : elementos puramente decorativos, van al grupo "Decoración"
//   - el resto  : elementos que muestran datos, van al grupo "Datos"
//
// Sin `id` un elemento es invisible para el editor: no se puede seleccionar,
// mover, ocultar ni guardar. Por eso todos lo llevan.

const vintage = {
  width: 1080,
  height: 1350,
  background: "#E8DFCC",
  elements: [
    {
      // Rectángulo verde de fondo
      type: "rectangle",
      id: "deco-1",
      x: 190, // (1080 - 700) / 2 para centrar
      y: 350,
      width: 700,
      height: 900,
      color: "#7BC765",
      borderRadius: "30px 30px 0 0",
      zIndex: 2
    },
    {
      // Linita decorativa
      type: "rectangle",
      id: "deco-2",
      x: 80,
      y: 60,
      width: 120,
      height: 5,
      color: "#7BC765",
      zIndex: 10
    },
    {
      // Nombre y apellido arriba
      type: "text",
      id: "nombre-header",
      text: "{jugador.nombre} {jugador.apellido}",
      x: 80,
      y: 75,
      fontFamily: "Montserrat",
      fontSize: 18,
      fontWeight: 900,
      color: "#000",
      textTransform: "uppercase",
      zIndex: 10
    },
    {
      // Párrafo descriptivo.
      // El "PRIMERA RUEDA DEL TORNEO" sigue siendo texto fijo a propósito:
      // es una frase editorial, no un dato. Se edita desde el panel, o se
      // reemplaza por {club.torneo} si el club quiere el nombre real.
      type: "text",
      id: "resumen-texto",
      text: "JUGÓ {stats.partidosJugados} PARTIDOS DURANTE LA PRIMERA RUEDA DEL TORNEO. CONVIRTIÓ {stats.goles} GOLES, ASISTIÓ EN {stats.asistencias} OPORTUNIDADES Y OBTUVO UN RATING GENERAL DE {stats.rating}/10.",
      x: 80,
      y: 110,
      width: 650,
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 700,
      color: "#222",
      lineHeight: 1.4,
      zIndex: 10
    },
    {
      // Nombre gigante de fondo
      type: "text",
      id: "nombre-fondo",
      text: "{jugador.nombre}\n{jugador.apellido}",
      x: 0,
      y: 230,
      width: 1080,
      align: "center",
      fontFamily: "Anton",
      fontSize: 220,
      color: "#4A4A4A",
      lineHeight: 0.85,
      letterSpacing: "-2px",
      textTransform: "uppercase",
      zIndex: 5
    },
    {
      // Dorsal
      type: "text",
      id: "jugador-dorsal",
      text: "{jugador.dorsal}",
      x: 210,
      y: 480,
      fontFamily: "Anton",
      fontSize: 160,
      color: "#C4E137",
      textShadow: "2px 2px 0 #000",
      zIndex: 10
    },
    {
      // Escudo del club (no estaba: la plantilla no mostraba de qué club era)
      type: "image",
      id: "logo-club",
      src: "{club.logo}",
      x: 940,
      y: 55,
      width: 70,
      height: 70,
      objectFit: "contain",
      zIndex: 10
    },
    {
      // Foto del jugador
      type: "image",
      id: "foto-jugador",
      src: "{jugador.foto}",
      x: 0,
      y: 203,
      width: 1080,
      height: 1147,
      objectFit: "contain",
      zIndex: 20
    },
    {
      // Pie con la marca
      type: "text",
      id: "deco-3",
      text: "POWERED BY VIRTUAL.CLUB",
      x: 0,
      y: 1295,
      width: 1080,
      align: "center",
      fontFamily: "Montserrat",
      fontSize: 14,
      fontWeight: 900,
      color: "rgba(0,0,0,0.45)",
      letterSpacing: "2px",
      zIndex: 30
    }
  ]
};

export default vintage;