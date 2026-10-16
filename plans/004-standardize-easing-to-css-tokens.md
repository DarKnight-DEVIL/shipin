# 004 — Standardize GSAP easing to match CSS tokens

- **Status**: TODO
- **Commit**: a77a74c
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 file, small change

## Problem

GSAP uses "power3.out" while CSS uses --ease-out (cubic-bezier(0.22,1,0.36,1)) - inconsistency violates the cohesion & tokens principle that curves should live as shared tokens.

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

Change GSAP easing to use a custom ease that matches the CSS --ease-out token (cubic-bezier(0.22,1,0.36,1)):
​```jsx
src/app/page.tsx:121-158
            gsap.fromTo("#header", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.8, ease: "cubic-bezier(0.22,1,0.36,1)", delay: 0.6 });
            gsap.fromTo(".hero__title", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1, ease: "cubic-bezier(0.22,1,0.36,1)", delay: 1 });
            gsap.fromTo(".hero__subtitle", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "cubic-bezier(0.22,1,0.36,1)", delay: 1.2 });
            gsap.fromTo(".hero__ctas", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "cubic-bezier(0.22,1,0.36,1)", delay: 1.4 });
            gsap.fromTo(
              ".hero__globe",
              { opacity: 0, y: 40, scale: 0.92 },
              { opacity: 1, y: 0, scale: 1, duration: 1.4, ease: "cubic-bezier(0.22,1,0.36,1)", delay: 1.1, clearProps: "transform" }
            );
​```

## Repo conventions to follow

- Easing tokens live in CSS (see lines 295: --ease-out: cubic-bezier(0.22, 1, 0.36, 1);)
- Use the same easing values in JS as in CSS for consistency
- Follow the existing pattern of using CSS tokens for shared values

## Steps

1. src/app/page.tsx:121-122: Change ease: "power3.out" to ease: "cubic-bezier(0.22,1,0.36,1)"
2. src/app/page.tsx:123-124: Change ease: "power3.out" to ease: "cubic-bezier(0.22,1,0.36,1)"
3. src/app/page.tsx:125-126: Change ease: "power3.out" to ease: "cubic-bezier(0.22,1,0.36,1)"
4. src/app/page.tsx:127-129: Change ease: "power3.out" to ease: "cubic-bezier(0.22,1,0.36,1)"
5. src/app/page.tsx:130-136: Change ease: "power3.out" to ease: "cubic-bezier(0.22,1,0.36,1)"

## Boundaries

- Do NOT change the durations or delays (those are addressed in another plan)
- Do NOT change the animation properties (opacity, y, scale)
- Do NOT add new dependencies
- If the exact lines don't match due to drift, STOP and report instead of improvising

## Verification

- **Mechanical**: Run `npm run dev` and check for console errors
- **Feel check**: 
  - Page loads and animations feel consistent with other hover/transition effects in the UI (e.g., product card hover)
  - The easing should feel smooth and responsive, matching the rest of the site
  - In DevTools, inspect the animation and confirm the timing function matches cubic-bezier(0.22,1,0.36,1)
- **Done when**: All GSAP animations use the same easing as the CSS --ease-out token

## Notes for the plan author

- This change ensures consistency between CSS and JS animations
- The value cubic-bezier(0.22,1,0.36,1) is already defined in the CSS as --ease-out
- We are keeping the same durations for now (to be adjusted in plan 003) but standardizing the easing