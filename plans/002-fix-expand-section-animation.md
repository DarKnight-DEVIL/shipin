# 002 — Fix expand section animation to use transform instead of height

- **Status**: TODO
- **Commit**: a77a74c
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 1 file, small change

## Problem

Expand sections animate the height property (layout) instead of transform, which triggers layout + paint + composite instead of just composite, causing poor performance. According to the audit, we should only animate transform and opacity.

Current code:
​```css
src/app/page.tsx:560-563
.landing-page-root .expand-row__body { display: grid; grid-template-rows: 0fr; overflow: hidden; transition: grid-template-rows 0.45s var(--ease-out); }
.landing-page-root .expand-row.is-open .expand-row__body { grid-template-rows: 1fr; }
​```

## Target

Change to animate using transform: scaleY() with transform-origin: top, which only triggers composite:
​```css
src/app/page.tsx:560-563
.landing-page-root .expand-row__body { 
  overflow: hidden; 
  transform-origin: top;
  transform: scaleY(0);
  transition: transform 0.45s var(--ease-out);
}
.landing-page-root .expand-row.is-open .expand-row__body { 
  transform: scaleY(1);
}
​```

## Repo conventions to follow

- Animate transform and opacity only (see lines 507-512 for product card hover using transform)
- Use existing --ease-out token for consistency
- Follow the pattern of using transform for animations that affect layout

## Steps

1. src/app/page.tsx:560-563: Change the expand-row__body styles to use transform instead of grid-template-rows
2. src/app/page.tsx:560-563: Update the is-open state to use transform: scaleY(1) instead of grid-template-rows: 1fr

## Boundaries

- Do NOT touch the HTML structure of expand sections
- Do NOT change the timing or easing (0.45s var(--ease-out))
- Do NOT add new dependencies
- If the exact lines don't match due to drift, STOP and report instead of improvising

## Verification

- **Mechanical**: Run `npm run dev` and check for console errors
- **Feel check**: 
  - Click to expand a section and confirm smooth animation
  - Click to collapse and confirm smooth reverse animation
  - In DevTools Performance tab, record expanding/collapsing and confirm no layout shifts
  - Toggle `prefers-reduced-motion` and confirm animation is reduced appropriately
- **Done when**: Expand/collapse animations work smoothly without triggering layout shifts

## Notes for the plan author

- This change maintains the same visual effect but improves performance by avoiding layout thrashing
- The transform-origin: top ensures the animation expands from the top as expected
- We maintain the same duration and easing for consistency