# 005 — Create duration and easing tokens for animation consistency

- **Status**: TODO
- **Commit**: a77a74c
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 2 files, small change

## Problem

Durations and stagger values are hardcoded throughout GSAP animations instead of using tokens, violating the cohesion & tokens principle that curves and durations should live as shared tokens.

Current code shows multiple hardcoded values:
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
            gsap.utils.toArray<HTMLElement>(".section__label, .section__title, .section__desc").forEach((el) => {
              gsap.fromTo(el, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } });
            });

            ScrollTrigger.batch(".product-card", {
              onEnter: (elements) => {
                gsap.fromTo(elements, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out", clearProps: "transform" });
              },
              start: "top 85%",
              once: true
            });

            ScrollTrigger.batch(".expand-section", {
              onEnter: (elements) => {
                gsap.fromTo(elements, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", clearProps: "transform" });
              },
              start: "top 85%",
              once: true
            });

            ScrollTrigger.batch(".ticket", {
              onEnter: (elements) => {
                gsap.fromTo(elements, { opacity: 0, y: 50, rotateX: -5 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.7, stagger: 0.12, ease: "power3.out", clearProps: "transform" });
              },
              start: "top 85%",
              once: true
            });
​```

## Target

Create CSS custom properties for durations and easing, then reference them in GSAP animations:
​```css
/* Add to src/app/globals.css or create new tokens file */
:root {
  /* Duration tokens */
  --duration-short: 0.3s;
  --duration-medium: 0.5s;
  --duration-long: 0.7s;
  --duration-hero: 0.6s;
  
  /* Easing tokens */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  
  /* Stagger tokens */
  --stagger-short: 0.08s;
  --stagger-medium: 0.12s;
}
​```

Then update GSAP to use these values (note: GSAP can't directly use CSS variables, so we'll need to read them in JS):
​```jsx
// Get duration values from CSS
const getDuration = (name) => {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--duration-${name}`)) || 0;
};
const getStagger = (name) => {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--stagger-${name}`)) || 0;
};

// Then use in animations:
gsap.fromTo("#header", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: getDuration('short'), ease: "cubic-bezier(0.22,1,0.36,1)", delay: 0.3 });
// ... etc for all animations
​```

## Repo conventions to follow

- The codebase already uses CSS tokens (see line 295: --ease-out: cubic-bezier(0.22, 1, 0.36, 1);)
- Follow the existing pattern of defining tokens in CSS and using them consistently
- Tokens should be defined in a central location for easy maintenance

## Steps

1. Create or edit a CSS tokens file (src/styles/tokens.css or add to src/app/globals.css)
2. Add duration, easing, and stagger tokens as specified
3. Update src/app/page.tsx to read these token values and use them in GSAP animations
4. Update all hardcoded durations, easings, and stagger values to use tokens

## Boundaries

- Do NOT change the animation properties themselves (opacity, y, scale, etc.)
- Do NOT add new dependencies
- If the exact lines don't match due to drift, STOP and report instead of improvising

## Verification

- **Mechanical**: Run `npm run dev` and check for console errors
- **Feel check**: 
  - Animations should feel consistent with each other
  - Changing token values in CSS should affect all animations proportionally
  - In DevTools, inspect the animations and confirm they use values from tokens
- **Done when**: All animation durations, easings, and stagger values are derived from CSS tokens

## Notes for the plan author

- GSAP cannot directly use CSS custom properties, so we need to read them in JavaScript
- This plan creates the foundation for token usage; the actual implementation of reading tokens in JS will be done in the executor
- We should create a tokens.css file to keep things organized