---
name: ShipIN
description: International shopping forwarding platform with 3D spatial hero and glassmorphism
colors:
  primary: "#a855f7"
  primary-deep: "#9333ea"
  primary-darker: "#7c3aed"
  accent-glow: "rgba(168, 85, 247, 0.35)"
  accent-soft: "rgba(168, 85, 247, 0.15)"
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
    backgroundColor: "linear-gradient(135deg, #9333ea 0%, #7c3aed 50%, #6d28d9 100%)"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.75rem 2rem"
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, #9333ea 0%, #7c3aed 50%, #6d28d9 100%)"
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

ShipIN's visual language balances professional reliability with playful energy. The system is built on a dark-first foundation (#020617) with vibrant purple gradients (#9333ea → #7c3aed → #6d28d9) that guide the eye and signal action. Glassmorphism surfaces, hover lifts, and generous purple glows create a sense of dimensionality without abandoning clarity.

Motion is purposeful and bouncy—elements respond with scale transforms, vertical lifts, and smooth cubic-bezier easing (0.22, 1, 0.36, 1)—giving the interface a lively, responsive personality that makes complex international logistics feel approachable. The 3D Spline hero anchors the landing experience in spatial depth, while the rest of the platform remains scannable and functional for operation-focused workflows.

This is a service interface with personality: confident in its purple voice, generous with feedback, and always dark-first.

**Key Characteristics:**
- Dark-first aesthetic with vibrant purple accent gradients
- Glassmorphism and backdrop blur for layered transparency
- Playful hover interactions with lift, scale, and glow
- Smooth cubic-bezier motion (0.22, 1, 0.36, 1)
- Geist Sans for clean, technical legibility
- 3D spatial hero contrasts with flat operational surfaces

## Colors

The palette is anchored by a vibrant purple gradient system that stands out against deep slate backgrounds. Dark mode is the default; light mode uses inverted tones.

### Primary
- **Vibrant Purple** (#a855f7): Primary accent. Used for CTAs, focus states, and brand moments. Appears in gradients, glows, and interactive highlights.
- **Deep Purple** (#9333ea): Gradient start for primary buttons. The boldest expression of the brand.
- **Darker Purple** (#7c3aed → #6d28d9): Gradient midpoint and end. Creates dimensional button depth.

### Neutral (Dark Mode Default)
- **Deep Slate Background** (#020617): Page canvas. Near-black with a cool tint.
- **Slate Surface** (#0f172a): Cards, modals, inputs. One step lighter than the background.
- **Slate Foreground** (#f1f5f9): Body text and headlines. High contrast on dark surfaces.
- **Muted Slate** (#94a3b8): Labels, secondary text, placeholder hints.
- **Slate Border** (#1e293b): Dividers, card outlines, input strokes. Subtle separation.

### Neutral (Light Mode)
- **Cool White Background** (#f8fafc): Page canvas in light mode.
- **Pure White Surface** (#ffffff): Cards and inputs on light backgrounds.
- **Deep Slate Foreground** (#0f172a): Text in light mode.
- **Muted Blue-Gray** (#64748b): Secondary text in light mode.
- **Light Border** (#e2e8f0): Borders and dividers in light mode.

### Accent Effects
- **Purple Glow** (rgba(168, 85, 247, 0.35)): Box-shadow glow on hover and focus. Adds dimensionality.
- **Soft Purple Wash** (rgba(168, 85, 247, 0.15)): Translucent purple tint for focus rings and subtle highlights.

### Named Rules
**The Purple Voice Rule.** Purple is used for primary actions, focus states, and brand moments only. Status badges use semantic hues (blue, amber, emerald, red). Purple is the call to action, not the decoration.

**The Dark-First Rule.** All surfaces are designed for dark mode first. Light mode exists but is not the design priority; dark variants define the aesthetic.

## Typography

**Display Font:** Geist Sans (with system-ui fallback)  
**Body Font:** Geist Sans (with system-ui fallback)  
**Mono Font:** Geist Mono (for tracking IDs and technical data)

**Character:** Geist Sans is a modern, geometric sans-serif with excellent legibility at small sizes and strong presence at display scales. Its technical precision matches the logistics domain while remaining approachable. The tight letter-spacing on display text (-0.02em) and expanded tracking on labels (0.08em) create rhythm and hierarchy.

### Hierarchy
- **Display** (700, clamp(2.5rem, 7vw, 4.5rem), 1.1, -0.02em): Hero headlines on the landing page. Large, bold, and tightly tracked.
- **Headline** (700, clamp(1.875rem, 4vw, 3rem), 1.2, -0.02em): Section titles and page headers. Commands attention without overwhelming.
- **Title** (600, 1.125rem, 1.4): Card headers, modal titles, subsection labels. Semibold for structure.
- **Body** (400, 1rem, 1.6): Paragraphs, descriptions, list items. Generous line-height for comfortable reading (65-75ch max width recommended).
- **Label** (600, 0.6875rem, 1.4, 0.08em uppercase): Form labels, status indicators, metadata tags. All-caps with wide tracking for density.

### Named Rules
**The Scale Step Rule.** Font sizes follow a clear scale: 0.6875rem (label) → 1rem (body) → 1.125rem (title) → 1.875rem+ (headline/display). No arbitrary in-between sizes.

## Layout

ShipIN uses a centered container model with a 6xl max-width (1280px) for content-heavy pages and full-bleed sections for the hero and testimonials. Padding is responsive: 1.5rem (24px) on mobile, 2rem (32px) on desktop.

Spacing follows an 8px base rhythm (0.5rem, 0.75rem, 1rem, 1.5rem, 2rem) with generous vertical gaps between sections (3.5rem to 4rem). Cards and surfaces get internal padding of 1.5rem (24px) on mobile and 1.75rem (28px) on desktop.

Grid layouts are sparse: 1 column on mobile, 2 on tablets (640px+), up to 4 on desktop (1024px+) for features and testimonials. The admin dashboard uses a sidebar + main split with fixed 280px sidebar.

Breakpoints align with Tailwind defaults: sm (640px), md (768px), lg (1024px), xl (1280px). The landing hero is locked to 100dvh with vertical centering; all other layouts flow naturally.

## Elevation & Depth

The system uses shadows, hover lifts, and glassmorphism to create tactile dimensionality. Cards float at rest and rise on hover. Depth is structural, not decorative—it signals interactivity.

### Shadow Vocabulary
- **Card Shadow at Rest** (`border: 1px solid var(--border)`): Subtle stroke defines the surface. No shadow until hover.
- **Card Hover Glow** (`0 12px 40px -12px var(--glow)`): Purple-tinted glow lifts the card 2px upward. Creates a sense of elevation and focus.
- **Button Glow** (`0 8px 24px -8px var(--glow)` at rest, `0 12px 32px -8px var(--glow)` on hover): Persistent glow anchors the primary button. Intensifies on hover.
- **Modal Shadow** (`shadow-2xl shadow-black/20` in light mode, `shadow-black/50` in dark mode): Deep, ambient shadow separates modal from the blurred backdrop.

### Glassmorphism
Cards with `.shipin-glass` use `backdrop-filter: blur(16px)` and 80% opacity to create translucent layering. Seen in overlays and hero sections where content sits above the Spline 3D background.

### Named Rules
**The Hover Lift Rule.** Interactive surfaces (cards, buttons) translate upward on hover: `translateY(-1px)` for buttons, `translateY(-2px)` for cards. Elevation is motion, not just shadow.

**The Glow Authority Rule.** Purple glows signal interactivity. Static informational cards use strokes; actionable surfaces get glows.

## Shapes

**Corner Radius Strategy:** Generous, friendly curves that soften the technical subject matter.

- **Buttons:** 0.75rem (12px)—medium curves, tactile
- **Cards:** 1rem (16px)—soft, approachable containers
- **Modals:** 1.5rem (24px)—pronounced radius for elevated surfaces
- **Inputs:** 0.75rem (12px)—matches button radius for consistency
- **Badges:** Full radius (9999px)—pill-shaped status indicators

**Border Treatment:** Cards and inputs use 1px strokes at rest. On hover or focus, borders blend toward purple using `color-mix(in srgb, var(--accent) 35%, var(--border))` for a smooth color shift without hard jumps.

## Components

### Buttons
- **Shape:** Rounded corners (0.75rem), no sharp edges
- **Primary:** Purple gradient background (135deg, #9333ea → #7c3aed → #6d28d9), white text, semibold weight (600), horizontal padding 2rem, vertical padding 0.75rem. Persistent purple glow shadow.
- **Hover:** Lifts 1px with `scale(1.01)`, brightens via `filter: brightness(1.08)`, glow intensifies
- **Active:** Pressed state with `translateY(0) scale(0.99)` for tactile feedback
- **Secondary:** Slate background (#334155), white text, same shape and padding
- **Danger:** Red background (#dc2626), white text
- **Success:** Green background (#16a34a), white text
- **Motion:** `transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease, filter 0.2s ease`

### Status Badges
- **Style:** Pill-shaped (full radius), 10% opacity background with 20% opacity ring, colored text. Each status gets a semantic hue (blue for submitted, amber for review, emerald for paid, etc.)
- **Typography:** 0.75rem text, semibold weight, all-caps with expanded tracking
- **Sizing:** Inline-flex with 0.625rem vertical padding, 0.625rem horizontal padding

### Cards
- **Corner Style:** 1rem radius, soft and approachable
- **Background:** `var(--card)` (#0f172a dark, #ffffff light)
- **Border:** 1px solid `var(--border)`, shifts toward purple on hover via color-mix
- **Shadow Strategy:** No shadow at rest; purple glow on hover (0 12px 40px -12px)
- **Hover Motion:** `translateY(-2px)` with 0.35s cubic-bezier easing
- **Internal Padding:** 1.5rem (24px)

### Glassmorphism Surfaces
- **Background:** `color-mix(in srgb, var(--card) 80%, transparent)` for 80% opacity
- **Backdrop Filter:** `blur(16px)` creates depth through transparency
- **Border:** 1px solid `var(--border)`
- **Usage:** Overlays, hero navigation, floating panels above 3D scenes

### Inputs
- **Style:** 1px border, rounded corners (0.75rem), background matches card surface
- **Focus:** Border shifts toward purple (55% mix), soft purple ring (0 0 0 3px accent-soft)
- **Placeholder:** Muted text color (#64748b light, #475569 dark)
- **Transition:** `border-color 0.15s ease, box-shadow 0.15s ease`

### Modals
- **Backdrop:** Fixed overlay with slate-950/60 background and backdrop-blur-sm
- **Surface:** Rounded 1.5rem (24px), white background (dark: slate-950), 1px border, shadow-2xl
- **Header:** Bordered bottom separator, 1.5rem padding, bold title, close button in top-right
- **Body:** 1.5rem to 1.75rem padding
- **Motion:** Escape key closes, click-outside closes, body scroll locked when open

### Navigation
- **Landing Nav:** Transparent with glassmorphism, fixed at top, logo + text links + CTA button. Purple accent on "IN" in logo.
- **Dashboard Nav:** Sidebar 280px wide, slate background, icon + label links, purple highlight on active route.
- **Typography:** 0.875rem body text for links, muted at rest, foreground on hover
- **Hover:** Smooth color transition (0.2s ease)

## Do's and Don'ts

### Do:
- **Do** use the primary purple gradient for CTAs and brand moments. It's the strongest voice.
- **Do** lift interactive surfaces on hover (`translateY(-1px)` for buttons, `-2px` for cards) to signal affordance.
- **Do** apply purple glows to actionable elements. Shadows mean interactivity.
- **Do** use 0.75rem to 1rem radius on UI components. Consistency in curves creates rhythm.
- **Do** design for dark mode first. Light mode is a secondary variant.
- **Do** use the cubic-bezier easing (0.22, 1, 0.36, 1) for all hover and focus transitions. Smooth, natural motion.
- **Do** use Geist Sans for all text. Geist Mono only for tracking IDs and technical codes.
- **Do** apply backdrop-filter blur (16px) to glassmorphism overlays. Depth through transparency.

### Don't:
- **Don't** use purple for status indicators. Status badges are semantic (blue, amber, red, green).
- **Don't** apply shadows to static informational cards. Elevation signals interaction.
- **Don't** mix border radius values arbitrarily. Stick to 0.5rem, 0.75rem, 1rem, 1.5rem scale.
- **Don't** use light mode as the design reference. It's an inversion, not the foundation.
- **Don't** add motion without purpose. Hover and focus get feedback; everything else stays still.
- **Don't** forget the 8px spacing rhythm. Use 0.5rem, 0.75rem, 1rem, 1.5rem, 2rem for vertical and horizontal gaps.
- **Don't** use generic sans-serif fallbacks before system-ui. Geist Sans → system-ui → sans-serif.
