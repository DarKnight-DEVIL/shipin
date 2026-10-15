---
name: reduced-motion-implementation
description: Implemented reduced motion support for globe component with user notice
metadata:
  type: project
---

Implemented reduced motion support for the GlobeDashboard component following accessibility audit recommendations.

## Changes Made

1. **Fixed TypeScript redeclaration error** in `src/components/globe-dashboard/GlobeDashboard.jsx`:
   - Removed duplicate `reduceMotionNotice` variable declaration that was causing "Cannot redeclare block-scoped variable" error
   - Cleaned up the component to ensure proper scope

2. **Enhanced reduced motion implementation**:
   - Added `useState` hook to track `reduceMotion` state (moved from local useEffect variable to component state)
   - Added `useEffect` hook to listen for `prefers-reduced-motion: reduce` media query changes
   - Wrapped globe animation loop in conditional check: `if (!reduceMotion) { /* animation code */ }`
   - Added user notice component that appears when reduced motion is enabled:
     - Shows message: "Globe motion paused (reduce motion enabled)"
     - Positioned in bottom-left corner of globe container
     - Styled with dark background, white text, padding, border radius, and small font size
     - Only renders when `reduceMotion` state is true

3. **Verified build success**:
   - Ran `npm run build` successfully with no TypeScript errors
   - All routes compiled and generated correctly
   - No warnings or errors in production build

## Technical Details

- Uses `window.matchMedia('(prefers-reduced-motion: reduce)')` to detect system preference
- Updates state when media query changes via event listener
- Cleanup function removes event listener on component unmount
- Animation loop (globe rotation and cloud movement) only runs when `reduceMotion` is false
- Notice is absolutely positioned within the globe container, non-interactive (pointerEvents: none)
- Respects user's system accessibility settings while providing clear feedback

## User Experience

When users have reduced motion enabled in their OS settings:
- Globe animation pauses automatically
- Clear notice informs users why motion is paused
- Notice provides subtle visual feedback without being intrusive
- Users can adjust settings in:
  - Windows: Settings > Accessibility > Visual effects > "Show animations in Windows"
  - macOS: System Settings > Accessibility > Display > "Reduce motion"

This implementation honors user preferences while maintaining transparency about why animations are paused.