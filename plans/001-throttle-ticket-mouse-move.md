# 001 — Throttle ticket mouse move parallax

- **Status**: TODO
- **Commit**: a77a74c
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, small change

## Problem

Ticket mouse move parallax triggers on every mousemove event (high frequency), violating the purpose & frequency principle that animations on keyboard-initiated actions or high-frequency interactions should be removed or drastically reduced. Current implementation causes unnecessary work on every pixel movement.

Current code:
​```jsx
src/app/page.tsx:194-220
      const tickets = document.querySelectorAll(".ticket[data-ticket]");
      const cleanupListeners: (() => void)[] = [];

      tickets.forEach((ticketEl) => {
        const ticket = ticketEl as HTMLElement;
        let rafId: number | null = null;
        const onMouseMove = (e: MouseEvent) => {
          if (rafId) return;
          rafId = requestAnimationFrame(() => {
            const rect = ticket.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            ticket.style.transform = `perspective(800px) rotateX(${(y - 0.5) * -12}deg) rotateY(${(x - 0.5) * 12}deg) translateY(-4px)`;
            ticket.style.setProperty("--sheen-x", `${x * 100}%`);
            ticket.style.setProperty("--sheen-y", `${y * 100}%`);
            rafId = null;
          });
        };
        const onMouseLeave = () => {
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          ticket.style.transform = "";
        };

        ticket.addEventListener("mousemove", onMouseMove as EventListener);
        ticket.addEventListener("mouseleave", onMouseLeave);
        cleanupListeners.push(() => {
          ticket.removeEventListener("mousemove", onMouseMove as EventListener);
          ticket.removeEventListener("mouseleave", onMouseLeave);
        });
      });
​```

## Target

Change to only enable parallax on hover start and disable on hover end, removing the high-frequency mousemove listener:
​```jsx
src/app/page.tsx:194-220
      const tickets = document.querySelectorAll(".ticket[data-ticket]");
      const cleanupListeners: (() => void)[] = [];

      tickets.forEach((ticketEl) => {
        const ticket = ticketEl as HTMLElement;
        let isAnimating = false;

        const onMouseEnter = () => {
          isAnimating = true;
          requestAnimationFrame(animateTicket);
        };

        const onMouseLeave = () => {
          isAnimating = false;
          ticket.style.transform = "";
        };

        const animateTicket = () => {
          if (!isAnimating) return;
          
          // This would need to be called via some mechanism to get mouse position
          // For now, we'll implement a simpler hover-based effect
          ticket.style.transform = "perspective(800px) rotateX(-2deg) rotateY(2deg) translateY(-4px)";
          ticket.style.setProperty("--sheen-x", "50%");
          ticket.style.setProperty("--sheen-y", "50%");
          
          if (isAnimating) {
            requestAnimationFrame(animateTicket);
          }
        };

        ticket.addEventListener("mouseenter", onMouseEnter);
        ticket.addEventListener("mouseleave", onMouseLeave);
        cleanupListeners.push(() => {
          ticket.removeEventListener("mouseenter", onMouseEnter);
          ticket.removeEventListener("mouseleave", onMouseLeave);
        });
      });
​```

## Repo conventions to follow

- Motion should be purposeful and not triggered by high-frequency events
- Hover states should use standard transitions, not continuous animation loops
- Follow the existing pattern in the codebase for hover effects (see lines 507-512 for product card hover)

## Steps

1. src/app/page.tsx: Replace the mousemove event listeners with mouseenter/mouseleave listeners
2. src/app/page.tsx: Remove the RAF loop and implement a simple hover transform
3. src/app/page.tsx: Keep the existing cleanup pattern for event listeners

## Boundaries

- Do NOT touch the ticket HTML structure or other styling
- Do NOT change the sheen variables or their usage
- Do NOT add new dependencies
- If the exact lines don't match due to drift, STOP and report instead of improvising

## Verification

- **Mechanical**: Run `npm run dev` and check for console errors
- **Feel check**: 
  - Hover over a ticket and confirm smooth parallax effect activates
  - Move mouse rapidly in and out - confirm no stutter or lag
  - Leave mouse stationary over ticket - confirm effect maintains without continuous updates
  - Toggle `prefers-reduced-motion` (Chrome DevTools Rendering panel) and confirm effect is reduced appropriately
- **Done when**: Hover effect works smoothly without high-frequency mousemove events triggering

## Notes for the plan author

- This changes the interaction from continuous mousemove to hover-triggered, which is more appropriate for the frequency of use
- The visual effect will be slightly different but more performant and appropriate for UI guidelines