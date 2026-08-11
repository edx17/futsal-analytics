// src/reportes/components/RenderCircle.jsx
import React from 'react';

export default function RenderCircle({ element }) {
  return (
    <div
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.radius * 2,
        height: element.radius * 2,
        borderRadius: "50%",
        backgroundColor: element.color || "transparent",
        border: element.border,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        opacity: element.opacity ?? 1,
        zIndex: element.zIndex || 1,
      }}
    />
  );
}