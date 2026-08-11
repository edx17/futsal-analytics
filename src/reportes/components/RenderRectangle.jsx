// src/reportes/components/RenderRectangle.jsx
import React from 'react';

export default function RenderRectangle({ element }) {
  return (
    <div
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        backgroundColor: element.color || "transparent",
        border: element.border,
        borderRadius: element.borderRadius,
        opacity: element.opacity ?? 1,
        boxShadow: element.shadow,
        zIndex: element.zIndex || 1,
        transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined
      }}
    />
  );
}