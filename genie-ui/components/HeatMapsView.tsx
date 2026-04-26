"use client";

import { useState } from "react";

const MAP_LAYERS = [
  {
    key: "facility",
    label: "Facility Heatmap",
    emoji: "🏥",
    description: "Density of healthcare facilities across India",
    src: "/maps/map1_facility_heatmap.html",
  },
  {
    key: "population",
    label: "Population Overlay",
    emoji: "👥",
    description: "Population distribution vs. facility coverage",
    src: "/maps/map2_population_overlay.html",
  },
  {
    key: "underserved",
    label: "Underserved Areas",
    emoji: "⚠️",
    description: "Districts with insufficient healthcare access",
    src: "/maps/map3_underserved.html",
  },
  {
    key: "specialty",
    label: "Specialty Points",
    emoji: "🔬",
    description: "Specialist facility locations by type",
    src: "/maps/map5_specialty_points.html",
  },
];

export function HeatMapsView() {
  const [activeLayer, setActiveLayer] = useState(MAP_LAYERS[0]);

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 border-b"
        style={{ background: "#fff", borderColor: "var(--border)", height: "52px" }}
      >
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold mr-3" style={{ color: "var(--text-muted)" }}>
            Map Layer:
          </span>
          {MAP_LAYERS.map((layer) => {
            const isActive = layer.key === activeLayer.key;
            return (
              <button
                key={layer.key}
                onClick={() => setActiveLayer(layer)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={{
                  background: isActive ? "var(--accent-light)" : "transparent",
                  borderColor: isActive ? "var(--accent)" : "var(--border)",
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span>{layer.emoji}</span>
                <span>{layer.label}</span>
              </button>
            );
          })}
        </div>
        <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>
          {activeLayer.description}
        </span>
      </div>

      {/* Map iframe — fills remaining height */}
      <div className="flex-1 relative overflow-hidden">
        {MAP_LAYERS.map((layer) => (
          <iframe
            key={layer.key}
            src={layer.src}
            title={layer.label}
            className="absolute inset-0 w-full h-full border-0"
            style={{ display: layer.key === activeLayer.key ? "block" : "none" }}
            sandbox="allow-scripts allow-same-origin"
          />
        ))}
      </div>
    </div>
  );
}
