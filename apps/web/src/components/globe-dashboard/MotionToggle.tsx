"use client";

import { useState } from "react";

interface MotionToggleProps {
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
  accentColor: string;
  motionEnabled: boolean;
  onToggleMotion: () => void;
}

function MotionToggle({
  theme,
  accentColor,
  motionEnabled,
  onToggleMotion,
}: MotionToggleProps) {
  const active = motionEnabled;
  const label = active ? "Animation on" : "Load the animation";
  const hint = active
    ? "The globe is animating. Turn this off to hold it still."
    : "Start the globe's animation";

  return (
    <button
      type="button"
      className="motion-toggle"
      onClick={onToggleMotion}
      aria-pressed={active}
      title={hint}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.01em",
        color: active ? "#FFFFFF" : theme.textPrimary,
        background: active ? accentColor : theme.rowHoverBg,
        border: `1px solid ${active ? "rgba(255, 255, 255, 0.35)" : theme.panelBorder}`,
        backdropFilter: "blur(14px) saturate(180%)",
        WebkitBackdropFilter: "blur(14px) saturate(180%)",
        boxShadow: active
          ? "0 6px 18px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
          : "inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 4px 14px rgba(31, 38, 135, 0.10)",
        transition:
          "background 0.25s ease, box-shadow 0.25s ease, color 0.25s ease, border-color 0.25s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: theme.panelSheen,
          opacity: active ? 0.5 : 1,
          pointerEvents: "none",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          width: 6,
          height: 6,
          borderRadius: "50%",
          flexShrink: 0,
          background: active ? "#FFFFFF" : accentColor,
          boxShadow: `0 0 8px ${active ? "#FFFFFF" : accentColor}`,
        }}
      />
      <span style={{ position: "relative" }}>{label}</span>
    </button>
  );
}

export default MotionToggle;