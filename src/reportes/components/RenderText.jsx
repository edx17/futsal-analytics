// src/reportes/components/RenderText.jsx
import React from 'react';

export default function RenderText({ element }) {
  return (
    <div
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        color: element.color || "#000",
        fontSize: element.fontSize || 20,
        fontFamily: element.fontFamily || "Arial",
        fontWeight: element.fontWeight || 400,
        textAlign: element.align || "left",
        width: element.width,
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing,
        textTransform: element.textTransform,
        textShadow: element.textShadow, 
        whiteSpace: "pre-line",
        zIndex: element.zIndex || 1,
        transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined
      }}
    >
      {element.text}
    </div>
  );
}