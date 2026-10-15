---
name: ShipIN
description: International shopping forwarding platform with 3D spatial hero
colors:
  primary: "#10b981"
  primary-deep: "#059669"
  primary-darker: "#047857"
  accent-glow: "rgba(16, 185, 129, 0.2)"
  accent-soft: "rgba(16, 185, 129, 0.1)"
  background-dark: "#020617"
  background-light: "#f8fafc"
  surface-dark: "#0f172a"
  surface-light: "#ffffff"
  foreground-dark: "#f1f5f9"
  foreground-light: "#0f172a"
  muted-dark: "#94a3b8"
  muted-light: "#64748b"
  border-dark: "#1e293b"
  border-light: "#e2e8f0"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #059669 0%, #047857 100%)"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.75rem 2rem"
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, #047857 0%, #065f46 100%)"
    textColor: "#ffffff"
  card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.foreground-dark}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.foreground-dark}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem"
---

# Design System: ShipIN

## Overview

**Creative North Star: "The Trusted Courier"**

ShipIN's visual language balances professional reliability with understated confidence. The system is built on a dark-first foundation (#020617) with a restrained Emerald green palette (#10b981) that signals growth, trust, and precision. Glassmorphism surfaces and subtle hover lifts create dimensionality without relying on overused purple gradients.

Motion is purposeful—elements respond with gentle scale transforms and smooth cubic-bezier easing (0.22, 1, 0.36, 1). The 3D Spline hero anchors the experience in spatial depth, while the UI remains scannable and functional for logistics operations.

This is a service interface for global commerce: professional, reliable, and precise.

## Colors

### Primary
- **Emerald** (#10b981): Primary accent. Used for CTAs, focus states, and key brand signals.
- **Deep Emerald** (#059669): Gradient start for buttons.
- **Darker Emerald** (#047857): Gradient end for buttons.

### Neutral (Dark Mode Default)
- **Deep Slate Background** (#020617): Page canvas.
- **Slate Surface** (#0f172a): Cards and surfaces.
- **Slate Foreground** (#f1f5f9): Primary text.
- **Muted Slate** (#94a3b8): Secondary text.
- **Slate Border** (#1e293b): Structural borders.
