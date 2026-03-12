import React from 'react';

const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0">
    <style>{`
      .tooltip-container { position: relative; display: inline-flex; cursor: help; z-index: 10; align-items: center; margin-left: 6px; }
      .tooltip-container:hover { z-index: 9999; }
      .tooltip-text { 
        visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; 
        position: absolute; top: 150%; left: 50%; transform: translateX(-50%); 
        background: #111; color: #fff; padding: 10px; border-radius: 6px; 
        font-size: 0.75rem; width: 220px; text-align: center; border: 1px solid #444; 
        pointer-events: none; box-shadow: 0 8px 20px rgba(0,0,0,0.9); 
        font-weight: normal; line-height: 1.4; text-transform: none; letter-spacing: normal; 
        z-index: 99999;
      }
      .tooltip-text::after {
        content: ""; position: absolute; bottom: 100%; left: 50%; margin-left: -5px;
        border-width: 5px; border-style: solid; border-color: transparent transparent #444 transparent;
      }
      .tooltip-container:hover .tooltip-text, .tooltip-container:focus .tooltip-text { visibility: visible; opacity: 1; }
    `}</style>
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
    <div className="tooltip-text">
      {texto}
    </div>
  </div>
);

export default InfoBox;