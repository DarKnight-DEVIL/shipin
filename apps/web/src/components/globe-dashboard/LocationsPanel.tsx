"use client";

import { useState } from "react";
import { GlobeLocation, LocationEntry } from "./GlobeDashboard";

interface LocationsPanelProps {
  theme: {
    panelBg: string;
    panelBorder: string;
    panelSheen: string;
    panelShadow: string;
    rowHoverBg: string;
    rowHoverShadow: string;
    textPrimary: string;
    textMuted: string;
    textSub: string;
  };
  locations: LocationEntry[];
  selectedLocation: GlobeLocation | null;
  onSelect: (loc: GlobeLocation) => void;
  accentColor: string;
  rightPanelPadding: number;
  onSearchChange: (value: string) => void;
  searchValue: string;
}

function LocationsPanel({
  theme,
  locations,
  selectedLocation,
  onSelect,
  accentColor,
  rightPanelPadding,
  onSearchChange,
  searchValue,
}: LocationsPanelProps) {
  return (
    <div
      className="locations-panel"
      style={{
        position: "relative",
        zIndex: 2,
        flex: "0 1 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        maxHeight: "100%",
        borderRadius: 24,
        overflow: "hidden",
        background: theme.panelBg,
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        border: `1px solid ${theme.panelBorder}`,
        boxShadow: theme.panelShadow,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: theme.panelSheen,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: theme.textMuted,
          padding: `20px ${rightPanelPadding}px 10px`,
        }}
      >
        Locations
      </div>

      <div style={{ padding: `0 ${rightPanelPadding}px 10px`, marginTop: 4 }}>
        <input
          type="text"
          placeholder="search destination..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "none",
            borderRadius: 12,
            background: theme.rowHoverBg,
            color: theme.textPrimary,
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>

      <div
        data-lenis-prevent
        className="no-scrollbar"
        style={{
          position: "relative",
          zIndex: 1,
          flex: "0 1 auto",
          height: 54 * 5 + 16,
          boxSizing: "border-box",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: `0 10px 16px`,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {locations.map(({ location: loc, muted }) => {
          const selected =
            selectedLocation && selectedLocation.title === loc.title;
          const isSuspended = loc.status === "suspended";
          const dotBg = selected
            ? isSuspended
              ? "#EF4444"
              : "#10B981"
            : isSuspended
              ? "#F87171"
              : accentColor;

          return (
            <div
              key={loc.title}
              role="button"
              tabIndex={0}
              aria-label={`Select ${loc.title}`}
              onClick={() => onSelect(loc)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(loc);
                }
              }}
              style={{
                padding: `10px ${Math.max(rightPanelPadding, 10)}px`,
                height: 54,
                boxSizing: "border-box",
                overflow: "hidden",
                opacity: muted && !selected ? 0.55 : 1,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                borderRadius: 14,
                background: selected ? theme.rowHoverBg : "transparent",
                boxShadow: selected ? theme.rowHoverShadow : "none",
                transform: selected ? "translateX(3px)" : "none",
                transition:
                  "background 0.2s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: dotBg,
                  boxShadow: selected ? `0 0 8px ${dotBg}` : "none",
                  transform: selected ? "scale(1.4)" : "none",
                  transition:
                    "background 0.2s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: selected ? theme.textPrimary : theme.textSub,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {loc.title}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    lineHeight: 1.3,
                    color: theme.textMuted,
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {loc.subtitle}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default LocationsPanel;