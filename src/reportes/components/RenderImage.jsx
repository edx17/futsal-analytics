// src/reportes/components/RenderImage.jsx
import React, { useState, useEffect } from 'react';

// Placeholder embebido (SVG en data URI): no depende de un servicio externo.
// via.placeholder.com dejó de estar operativo, así que un placeholder "vivo"
// es el único que no rompe la exportación en producción.
const PLACEHOLDER_SRC =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200">
      <rect width="100%" height="100%" fill="#1a1a1a"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="42" fill="#666" text-anchor="middle" dominant-baseline="middle">SIN FOTO</text>
    </svg>`
  );

export default function RenderImage({ element }) {
  const srcOriginal = element.src || PLACEHOLDER_SRC;
  const [src, setSrc] = useState(srcOriginal);

  // Si cambia el elemento (otro jugador, otra plantilla), reseteamos el estado
  // de error para volver a intentar cargar la imagen nueva.
  useEffect(() => {
    setSrc(element.src || PLACEHOLDER_SRC);
  }, [element.src]);

  return (
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      onError={() => {
        // Foto rota, URL vencida o CORS bloqueado: caemos al placeholder
        // en vez de mostrar el ícono roto del navegador en el PNG exportado.
        if (src !== PLACEHOLDER_SRC) setSrc(PLACEHOLDER_SRC);
      }}
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        objectFit: element.objectFit || "contain",
        borderRadius: element.borderRadius,
        opacity: element.opacity ?? 1,
        mixBlendMode: element.mixBlendMode || "normal",
        transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
        zIndex: element.zIndex || 1,
      }}
    />
  );
}