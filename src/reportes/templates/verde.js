// src/reportes/templates/verde.js
import texturaPapel from '../../assets/textura-papel.png';

const verde = {
  width: 1080,
  height: 1350,
  background: "#08911b",
  elements: [
    // ==========================================
    // CAPA 99: TEXTURA DE PAPEL GENERAL
    // ==========================================
    {
      type: "image",
      id: "deco-1",
      src: texturaPapel,
      x: 0,
      y: 0,
      width: 1080,
      height: 1350,
      objectFit: "cover",
      mixBlendMode: "multiply", 
      opacity: 0.3, 
      zIndex: 99
    },

    // ==========================================
    // CAPA 2: APELLIDO GIGANTE DE FONDO
    // ==========================================
    {
      type: "text",
      id: "apellido-fondo",
      text: "{jugador.apellido}",
      x: 0,
      y: 90,
      width: 1080,
      align: "center",
      fontFamily: "Anton",
      fontSize: 270,
      color: "#a3e8a5", 
      textTransform: "uppercase",
      letterSpacing: "-2px",
      zIndex: 2 
    },

    // ==========================================
    // CAPA 3: FOTO DEL JUGADOR (Con "screen" para borrar el negro)
    // ==========================================
    {
      type: "image",
      id: "foto-jugador",
      src: "{jugador.foto}",
      x: 0,
      y: 180,
      width: 1080,
      height: 1150,
      objectFit: "contain",
      mixBlendMode: "screen", // <-- ¡Esto borra el fondo negro de la foto cuadrada!
      zIndex: 3 
    },

    // Nombre sobrepuesto chico
    {
      type: "text",
      id: "nombre-chico",
      text: "{jugador.nombre}",
      x: 620,
      y: 310,
      fontFamily: "Anton",
      fontSize: 60,
      color: "#000",
      textTransform: "uppercase",
      zIndex: 4 
    },

    // ==========================================
    // HEADER (Club y Torneo)
    // ==========================================
    {
      // Antes era el nombre del club escrito a mano: en multi-club eso hacía
      // que todos exportaran el nombre del mismo club.
      type: "text",
      id: "club-nombre",
      text: "{club.nombre}",
      x: 60,
      y: 50,
      fontFamily: "Anton",
      fontSize: 24,
      color: "#000",
      lineHeight: 1.1,
      zIndex: 10
    },
    {
      type: "image",
      id: "logo-club",
      src: "{club.logo}",
      x: 500,
      y: 35,
      width: 80,
      height: 80,
      objectFit: "contain",
      zIndex: 10
    },
    {
      // Ídem: la división salía fija para cualquier categoría.
      type: "text",
      id: "jugador-categoria",
      text: "{jugador.categoria}",
      x: 770,
      y: 50,
      width: 250,
      align: "right",
      fontFamily: "Anton",
      fontSize: 24,
      color: "#000",
      lineHeight: 1.1,
      zIndex: 10
    },

    // ==========================================
    // BLOQUE IZQUIERDO: OFENSIVA (Goles, Remates, Asistencias)
    // ==========================================
    {
      type: "circle",
      id: "deco-4",
      x: 70,
      y: 380,
      radius: 110, 
      color: "transparent",
      border: "5px solid #000",
      zIndex: 10
    },
    {
      type: "text",
      id: "stat-goles",
      text: "{stats.goles}",
      x: 70,
      y: 410,
      width: 220,
      align: "center",
      fontFamily: "Anton",
      fontSize: 100,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "deco-5",
      text: "Goles",
      x: 70,
      y: 520,
      width: 220,
      align: "center",
      fontFamily: "Montserrat",
      fontSize: 18,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },

    // Remates
    {
      type: "rectangle",
      id: "deco-6",
      x: 50,
      y: 640,
      width: 130,
      height: 140,
      color: "transparent",
      border: "5px solid #e2f018",
      zIndex: 10
    },
    {
      type: "text",
      id: "stat-remates",
      text: "{stats.remates}",
      x: 50,
      y: 665,
      width: 130,
      align: "center",
      fontFamily: "Anton",
      fontSize: 65,
      color: "#e2f018",
      zIndex: 11
    },
    {
      type: "text",
      id: "deco-7",
      text: "Remates",
      x: 50,
      y: 745,
      width: 130,
      align: "center",
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },

    // Asistencias
    {
      type: "rectangle",
      id: "deco-8",
      x: 200,
      y: 640,
      width: 130,
      height: 140,
      color: "transparent",
      border: "5px solid #e2f018",
      zIndex: 10
    },
    {
      type: "text",
      id: "stat-asistencias",
      text: "{stats.asistencias}",
      x: 200,
      y: 665,
      width: 130,
      align: "center",
      fontFamily: "Anton",
      fontSize: 65,
      color: "#e2f018",
      zIndex: 11
    },
    {
      type: "text",
      id: "deco-9",
      text: "Asistencias",
      x: 200,
      y: 745,
      width: 130,
      align: "center",
      fontFamily: "Montserrat",
      fontSize: 14,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },

    // ==========================================
    // BLOQUE DERECHO: PARTICIPACIÓN (Fondo Amarillo)
    // ==========================================
    {
      type: "rectangle",
      id: "deco-10",
      x: 640,
      y: 380,
      width: 380,
      height: 180,
      color: "#e2f018",
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-11",
      text: "Partidos Jugados",
      x: 660,
      y: 405,
      fontFamily: "Montserrat",
      fontSize: 18,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "stat-partidos-jugados",
      text: "{stats.partidosJugados}",
      x: 660,
      y: 393,
      width: 340,
      align: "right",
      fontFamily: "Anton",
      fontSize: 42,
      color: "#000",
      zIndex: 11
    },
    {
      type: "rectangle",
      id: "deco-12",
      x: 660,
      y: 450,
      width: 340,
      height: 2,
      color: "rgba(0,0,0,0.2)",
      zIndex: 11
    },
    {
      type: "text",
      id: "deco-13",
      text: "Minutos",
      x: 660,
      y: 470,
      fontFamily: "Montserrat",
      fontSize: 18,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "stat-minutos",
      text: "{stats.minutos}",
      x: 660,
      y: 458,
      width: 340,
      align: "right",
      fontFamily: "Anton",
      fontSize: 42,
      color: "#000",
      zIndex: 11
    },
    {
      type: "rectangle",
      id: "deco-14",
      x: 660,
      y: 515,
      width: 340,
      height: 2,
      color: "rgba(0,0,0,0.2)",
      zIndex: 11
    },
    {
      type: "text",
      id: "deco-15",
      text: "Titularidades",
      x: 660,
      y: 535,
      fontFamily: "Montserrat",
      fontSize: 18,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "stat-titularidades",
      text: "{stats.titularidades}",
      x: 660,
      y: 523,
      width: 340,
      align: "right",
      fontFamily: "Anton",
      fontSize: 42,
      color: "#000",
      zIndex: 11
    },

    // ==========================================
    // ETIQUETAS BLANCAS DERECHAS (Recuperaciones, Pérdidas, Faltas)
    // ==========================================
    {
      type: "rectangle",
      id: "deco-16",
      x: 620,
      y: 630,
      width: 270,
      height: 36,
      color: "#fff",
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-17",
      text: "Recuperaciones",
      x: 635,
      y: 638,
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "stat-recuperaciones",
      text: "{stats.recuperaciones}",
      x: 910,
      y: 608,
      fontFamily: "Anton",
      fontSize: 50,
      color: "#fff",
      textShadow: "2px 2px 0 #000",
      zIndex: 11
    },

    {
      type: "rectangle",
      id: "deco-18",
      x: 660,
      y: 695,
      width: 210,
      height: 36,
      color: "#fff",
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-19",
      text: "Perdidas",
      x: 675,
      y: 703,
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "stat-perdidas",
      text: "{stats.perdidas}",
      x: 890,
      y: 673,
      fontFamily: "Anton",
      fontSize: 50,
      color: "#fff",
      textShadow: "2px 2px 0 #000",
      zIndex: 11
    },

    {
      type: "rectangle",
      id: "deco-20",
      x: 600,
      y: 760,
      width: 270,
      height: 36,
      color: "#fff",
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-21",
      text: "Faltas recibidas",
      x: 615,
      y: 768,
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "stat-faltas-recibidas",
      text: "{stats.faltasRecibidas}",
      x: 890,
      y: 738,
      fontFamily: "Anton",
      fontSize: 50,
      color: "#fff",
      textShadow: "2px 2px 0 #000",
      zIndex: 11
    },

    {
      type: "rectangle",
      id: "deco-22",
      x: 580,
      y: 825,
      width: 290,
      height: 36,
      color: "#fff",
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-23",
      text: "Faltas cometidas",
      x: 595,
      y: 833,
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 900,
      color: "#000",
      zIndex: 11
    },
    {
      type: "text",
      id: "stat-faltas-cometidas",
      text: "{stats.faltasCometidas}",
      x: 890,
      y: 803,
      fontFamily: "Anton",
      fontSize: 50,
      color: "#fff",
      textShadow: "2px 2px 0 #000",
      zIndex: 11
    },

    // ==========================================
    // TARJETAS (Amarillas y Rojas)
    // ==========================================
    {
      type: "rectangle",
      id: "deco-24",
      x: 300,
      y: 820,
      width: 150,
      height: 50,
      color: "#222",
      zIndex: 10
    },
    {
      type: "text",
      id: "stat-amarillas",
      text: "{stats.amarillas}",
      x: 315,
      y: 824,
      fontFamily: "Anton",
      fontSize: 38,
      color: "#fff",
      zIndex: 11
    },
    {
      type: "text",
      id: "deco-25",
      text: "Amarillas",
      x: 365,
      y: 837,
      fontFamily: "Montserrat",
      fontSize: 14,
      color: "#fff",
      zIndex: 11
    },

    {
      type: "rectangle",
      id: "deco-26",
      x: 300,
      y: 880,
      width: 150,
      height: 50,
      color: "#444",
      zIndex: 10
    },
    {
      type: "text",
      id: "stat-rojas",
      text: "{stats.rojas}",
      x: 315,
      y: 884,
      fontFamily: "Anton",
      fontSize: 38,
      color: "#fff",
      zIndex: 11
    },
    {
      type: "text",
      id: "deco-27",
      text: "Rojas",
      x: 365,
      y: 897,
      fontFamily: "Montserrat",
      fontSize: 14,
      color: "#fff",
      zIndex: 11
    },

    // ==========================================
    // ZONA INFERIOR (RATING, POSICIÓN Y ESTADÍSTICAS EXTRA)
    // ==========================================
    {
      type: "text",
      id: "deco-28",
      text: "RATING",
      x: -40,
      y: 1110,
      fontFamily: "Montserrat",
      fontSize: 32,
      fontWeight: 900,
      color: "#000",
      rotate: -90,
      zIndex: 10
    },
    {
      type: "text",
      id: "stat-rating",
      text: "{stats.rating}",
      x: 80,
      y: 950,
      fontFamily: "Anton",
      fontSize: 240,
      color: "#fff",
      textShadow: "6px 6px 0 #000",
      zIndex: 10
    },
    {
      type: "text",
      id: "jugador-posicion",
      text: "{jugador.posicion}",
      x: 0,
      y: 1130,
      width: 1080,
      align: "center",
      fontFamily: "Montserrat",
      fontSize: 22,
      fontWeight: 900,
      color: "#fff",
      textTransform: "uppercase",
      zIndex: 10
    },

    // Atajadas y Goles Recibidos (solo se muestra si el jugador es arquero)
    {
      type: "text",
      id: "stat-atajadas",
      text: "{stats.atajadas}",
      x: 380,
      y: 1170,
      width: 140,
      align: "center",
      fontFamily: "Anton",
      fontSize: 45,
      color: "#000",
      condicion: { campo: "jugador.posicion", operador: "incluye", valor: "arquero" },
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-29",
      text: "atajadas",
      x: 380,
      y: 1215,
      width: 140,
      align: "center",
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 900,
      color: "#000",
      condicion: { campo: "jugador.posicion", operador: "incluye", valor: "arquero" },
      zIndex: 10
    },
    {
      type: "text",
      id: "stat-goles-recibidos",
      text: "{stats.golesRecibidos}",
      x: 540,
      y: 1170,
      width: 140,
      align: "center",
      fontFamily: "Anton",
      fontSize: 45,
      color: "#000",
      condicion: { campo: "jugador.posicion", operador: "incluye", valor: "arquero" },
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-30",
      text: "goles recibidos",
      x: 540,
      y: 1215,
      width: 140,
      align: "center",
      fontFamily: "Montserrat",
      fontSize: 15,
      fontWeight: 900,
      color: "#000",
      condicion: { campo: "jugador.posicion", operador: "incluye", valor: "arquero" },
      zIndex: 10
    },

    // ==========================================
    // FOOTER
    // ==========================================
    {
      type: "text",
      id: "deco-31",
      text: "POWERED BY",
      x: 60,
      y: 1270,
      fontFamily: "Anton",
      fontSize: 26,
      color: "#000",
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-32",
      text: "VIRTUAL.CLUB",
      x: 220,
      y: 1270,
      fontFamily: "Anton",
      fontSize: 26,
      color: "#fff",
      zIndex: 10
    },
    {
      type: "image",
      id: "deco-33",
      src: "/android-chrome-512x512.png",
      x: 760,
      y: 1255,
      width: 42,
      height: 42,
      objectFit: "contain",
      zIndex: 10
    },
    {
      type: "text",
      id: "deco-34",
      text: "@VIRTUALFUTSAL",
      x: 815,
      y: 1270,
      fontFamily: "Anton",
      fontSize: 26,
      color: "#000",
      zIndex: 10
    }
  ]
};

export default verde;