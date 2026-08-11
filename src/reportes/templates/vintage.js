// src/reportes/templates/vintage.js
const vintage = {
  width: 1080,
  height: 1350,
  background: "#E8DFCC",
  elements: [
    {
      // Rectángulo verde de fondo
      type: "rectangle",
      x: 190, // (1080 - 700) / 2 para centrar al medio
      y: 350, // 1350 - 900(height) - 100(bottom)
      width: 700,
      height: 900,
      color: "#7BC765",
      borderRadius: "30px 30px 0 0",
      zIndex: 2
    },
    {
      // Linita decorativa
      type: "rectangle",
      x: 80,
      y: 60,
      width: 120,
      height: 5,
      color: "#7BC765",
      zIndex: 10
    },
    {
      // Nombre y Apellido arriba
      type: "text",
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
      // Párrafo descriptivo
      type: "text",
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
      // Nombre gigante de fondo (el \n reemplaza tu <br/>)
      type: "text",
      text: "{jugador.nombre}\n{jugador.apellido}",
      x: 0,
      y: 230,
      width: 1080, // Le damos todo el ancho y alineamos al centro
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
      // Foto del jugador
      type: "image",
      src: "{jugador.foto}",
      x: 0,
      y: 203, // 1350 - 1147 (aprox el 85% de height que tenías)
      width: 1080,
      height: 1147,
      objectFit: "contain",
      zIndex: 20
    }
  ]
};

export default vintage;