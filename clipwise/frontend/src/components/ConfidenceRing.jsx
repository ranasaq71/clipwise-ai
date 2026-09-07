import React from "react";
import { confidenceColor } from "@/lib/constants";

/**
 * Conic confidence ring used for face matches and AI scores.
 * pct: 0-100, size in px, label rendered in center.
 */
export default function ConfidenceRing({ pct = 0, size = 56, label, sublabel, src, testid, onClick }) {
  const color = confidenceColor(pct);
  const inner = size - 8;
  return (
    <div
      className={`relative inline-flex items-center justify-center conic-ring rounded-full ${onClick ? "cursor-pointer" : ""}`}
      style={{ width: size, height: size, "--pct": pct, "--conic-color": color }}
      data-testid={testid}
      onClick={onClick}
    >
      <div
        className="absolute rounded-full bg-[#0E0E12] overflow-hidden flex items-center justify-center"
        style={{ width: inner, height: inner }}
      >
        {src ? (
          <img src={src} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="font-mono text-xs text-white">{label}</span>
        )}
      </div>
      {sublabel && (
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-sm font-mono text-[10px] font-bold"
          style={{ background: color, color: "#050505" }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}
