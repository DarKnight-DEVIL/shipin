# 003 — Standardize hero section animation durations to UI budgets

- **Status**: TODO
- **Commit**: a77a74c
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, moderate change

## Problem

Hero section GSAP animations exceed recommended durations for UI elements (0.6s-1.4s vs 100-300ms budget), violating the easing & duration principle that UI animations should stay under 300ms for responsiveness.

Current code:
​```jsx
src/app/page.tsx:121-158
            gsap.fromTo("#header", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.6 });
            gsap.fromTo(".hero__title", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1, ease: "power3.out", delay: 1 });
            gsap.fromTo(".hero__subtitle", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 1.2 });
            gsap.fromTo(".hero__ctas", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", delay: 1.4 });
            gsap.fromTo(
              ".hero__globe",
              { opacity: 0, y: 40, scale: 0.92 },
              { opacity: 1, y: 0, scale: 1, duration: 1.4, ease: "power3.out", delay: 1.1, clearProps: "transform" }
            );
​```

## Target

Reduce durations to stay within UI budgets while maintaining the staggered entrance effect:
​```jsx
src/app/page.tsx:121-158
            gsap.fromTo("#header", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", delay: 0.3 });
            gsap.fromTo(".hero__title", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", delay: 0.5 });
            gsap.fromTo(".hero__subtitle", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", delay: 0.7 });
            gsap.fromTo(".hero__ctas", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", delay: 0.9 });
            gsap.fromTo(
              ".hero__globe",
              { opacity: 0, y: 25, scale: 0.95 },
              { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out", delay: 0.6, clearProps: "transform" }
            );
​```

## Repo conventions to follow

- UI animations stay under 300ms for most elements, with slightly longer for larger motions (globes can be up to 500ms)
- Use the existing easing convention (power3.out maps to similar curve as --ease-out)
- Maintain staggered entrance for visual hierarchy
- Follow the existing GSAP pattern in the codebase

## Steps

1. src/app/page.tsx:121-122: Reduce header duration from 0.8s to 0.5s, reduce delay from 0.6s to 0.3s, reduce y offset from -40 to -20
2. src/app/page.tsx:123-124: Reduce title duration from 1s to 0.5s, reduce delay from 1s to 0.5s, reduce y offset from 20 to 15
3. src/app/page.tsx:125-126: Reduce subtitle duration from 0.7s to 0.4s, reduce delay from 1.2s to 0.7s, reduce y offset from 20 to 15
4. src/app/page.tsx:127-129: Reduce CTA duration from 0.7s to 0.4s, reduce delay from 1.4s to 0.9s, reduce y offset from 20 to 15
5. src/app/page.tsx:130-136: Reduce globe duration from 1.4s to 0.6s, reduce delay from 1.1s to 0.6s, reduce y offset from 40 to 25, adjust scale from 0.92 to 0.95

## Boundaries

- Do NOT change the easing function (power3.out) as it's already appropriate
- Do NOT change the animation sequence or stagger pattern
- Do NOT add new dependencies
- If the exact lines don't match due to drift, STOP and report instead of improvising

## Verification

- **Mechanical**: Run `npm run dev` and check for console errors
- **Feel check**: 
  - Page loads and elements animate in with appropriate timing
  - Header appears first (~300ms), then title (~500ms), then subtitle/CTA (~700-900ms), then globe (~600ms with delay)
  - Animations feel snappy and responsive, not sluggish
  - Toggle `prefers-reduced-motion` and confirm animations are reduced appropriately (opacity only, clearProps: "transform")
- **Done when**: All hero section animations complete within appropriate time budgets and feel responsive

## Notes for the plan author

- These durations follow the audit guidelines: button feedback 100-160ms, small popovers 125-200ms, and we're treating these as slightly larger entrance animations
- The reduced offsets maintain the same visual effect but with less distance to travel
- Globe animation gets slightly longer duration (600ms) as it's a larger element but still within acceptable bounds