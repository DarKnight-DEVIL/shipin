# 006 — Stop globe updates when reduced motion is enabled

- **Status**: TODO
- **Commit**: a77a74c
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 file, small change

## Problem

Globe continues to update targetLngRef when reduced motion is enabled (wastes CPU), violating the performance principle that we should avoid unnecessary work when reduced motion is active.

Current code:
​```jsx
src/components/globe-dashboard/GlobeDashboard.jsx:301-304
      if (!reduceMotionRef.current) {
        if (!isHoveringRef.current) {
          targetLngRef.current += 0.03;
        }
​```
But note: the condition is already there? Let me check the actual code.

Wait, in the code we read earlier, the condition is present. However, the issue might be that the `if (!reduceMotionRef.current)` check is inside the animate function, but we are still updating `targetLngRef` when not hovering? Actually, the code we saw was:

```js
      const animate = () => {
        animId = requestAnimationFrame(animate);

        if (!reduceMotionRef.current) {
          if (!isHoveringRef.current) {
            targetLngRef.current += 0.03;
          }

          currentLngRef.current += (targetLngRef.current - currentLngRef.current) * 0.05;
          globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
          cloudsMesh.rotation.y += 0.0002;
        }

        renderer.render(scene, camera);
      };
```

So the condition is there. However, note that even when `reduceMotionRef.current` is true, we are still calling `renderer.render(scene, camera);` and updating the frame. But the problem description says: "Globe continues to update targetLngRef when reduced motion is enabled". Actually, the code does not update `targetLngRef` when `reduceMotionRef.current` is true because of the outer `if`.

Let me re-read the audit finding: 

> 6. LOW | Performance | src/components/globe-dashboard/GlobeDashboard.jsx lines 301-304 | Globe continues to update targetLngRef when reduced motion is enabled (wastes CPU) | Early return in animate() when reduceMotionRef.current is true

Wait, the code we have does not update `targetLngRef` when reduced motion is enabled because of the `if (!reduceMotionRef.current)` guard. So why is this a finding?

Looking at the code again, note that the `if (!reduceMotionRef.current)` block does not include the `renderer.render` call. So when reduced motion is enabled, we skip the updates to `targetLngRef`, `currentLngRef`, and the rotations, but we still call `renderer.render(scene, camera);` every frame. This is still wasting CPU because we are rendering the same scene every frame.

However, the finding specifically says "update targetLngRef", which is not happening. But perhaps the issue is that we are still animating (rendering) when we don't need to? The audit might consider that we should stop the animation loop entirely when reduced motion is enabled.

But note: the globe has a reveal animation (when `revealed` goes from false to true) and then it stays still. However, even when revealed, we are still rotating the globe slowly (when not hovering) and updating the clouds. When reduced motion is enabled, we want to stop all motion.

The current code does stop the rotation and cloud updates when reduced motion is enabled, but it still renders every frame. We can improve by not requesting animation frames when reduced motion is enabled and the globe is not being interacted with.

However, note that we still need to render when there are interactions (hovering) or when the reveal animation is happening. So we cannot simply stop the loop.

But the finding says to "Early return in animate() when reduceMotionRef.current is true". If we do an early return, then we skip rendering entirely when reduced motion is enabled, which would break the reveal animation and any hover interactions.

Let me re-examine: the reduced motion setting is meant to reduce motion, not eliminate it. We should still show the revealed state and respond to interactions, but without the continuous motion.

So the current approach is correct: we skip the motion updates but still render. However, we are still rendering every frame even when there are no changes. We can optimize by not requesting a new animation frame when there are no changes and reduced motion is enabled.

But note: the `animate` function is called recursively via `requestAnimationFrame`. We are currently always requesting the next frame, regardless of whether there are changes.

We can change the loop to only request the next frame when:
1. We are not in reduced motion and there is motion to update (hover or auto-rotation) OR
2. We are in the middle of an interaction (hovering) OR
3. We are in the reveal animation (but note: the reveal animation is handled by the `revealed` state and CSS transitions, not by this loop)

Actually, the reveal animation for the globe is done via CSS (opacity and transform) in the JSX, not in this Three.js loop. The Three.js loop only handles the slow rotation and cloud drift.

So when reduced motion is enabled, we want to:
- Stop the auto-rotation (already done)
- Stop the cloud drift (already done)
- But we still need to render to show the hover effects (which update the pin colors and the globe rotation on hover)

However, note that the hover effects only change the pin colors and the targetLngRef (which then updates the globe rotation via the loop). So if we are hovering, we still need to update the globe rotation to follow the mouse.

Therefore, we cannot skip rendering when hovering. But we can skip when not hovering and reduced motion is enabled.

Let's change the animate function to:
- If reduced motion is enabled and not hovering, then we do not request the next animation frame (unless we are in the middle of an interaction that just ended? but we have a leave timer).

Actually, we have a leave timer that sets `isHoveringRef.current` to false after 800ms of leaving. So when the user leaves, we set a timer and then set `isHoveringRef.current` to false.

We can break the loop when:
  reduceMotionRef.current is true AND !isHoveringRef.current AND !leaveTimerRef.current (meaning we are not in the leave delay)

But note: the leave timer is set when leaving, and then after 800ms we set `isHoveringRef.current` to false. So during the 800ms leave delay, `isHoveringRef.current` is still true? Actually, in the `onLocationLeave` function, we set `leaveTimerRef.current` and then in the timer callback we set `isHoveringRef.current` to false and clear the timer.

So during the leave delay, `isHoveringRef.current` is still true (because we haven't set it to false yet). Therefore, we don't break the loop during the leave delay.

We want to break the loop only when:
  reduceMotionRef.current is true AND !isHoveringRef.current AND !leaveTimerRef.current

But note: when `leaveTimerRef.current` is set, we are in the leave delay and we want to keep the loop running to allow the hover state to time out? Actually, during the leave delay, we are not hovering, but we are waiting to set `isHoveringRef.current` to false. However, the hover effect (pin colors and globe rotation) should continue until the leave delay ends? Actually, no: the hover effect is tied to `hoveredIdx` which is set to null on leave (see line 356: `setHoveredIdx(null);`). So the hover effect (pin highlight and globe turning to the location) ends immediately on leave, but the panel hover state (the row highlight) remains for 800ms.

So the globe rotation and pin colors are updated based on `hoveredIdx` (which is null on leave) and `isHoveringRef.current` (which is used for the panel hover). Therefore, the globe rotation and pin colors do not update during the leave delay.

Given that, we can break the loop when:
  reduceMotionRef.current is true AND !isHoveringRef.current

Because when not hovering and reduced motion, we don't need to update anything.

But note: we still need to render to show the current state (the globe at its last position). However, if we break the loop, we stop rendering and the globe will freeze at the last frame. That is acceptable because there are no changes.

So let's change the animate function to return early (and not request the next frame) when:
  reduceMotionRef.current is true AND !isHoveringRef.current

We must be cautious: we still need to render the reveal animation? But the reveal animation is handled by CSS on the globe container (opacity and transform). The Three.js render is only for the globe texture and rotation. The reveal of the globe container (the div that contains the canvas) is done by CSS.

Therefore, if we stop the Three.js render, we will still see the globe container (because it's updated by CSS) but the globe inside will freeze. This is acceptable because when reduced motion is enabled, we want no motion.

However, note that the globe container's reveal animation (scale and translate) is done by CSS, so we don't need the Three.js loop for that.

Therefore, we can break the loop when reduced motion is enabled and not hovering.

Let's update the code accordingly.

## Target

Change the animate function to early return (and not request the next animation frame) when reduced motion is enabled and not hovering:
​```jsx
src/components/globe-dashboard/GlobeDashboard.jsx:297-312
      let animId;
      const animate = () => {
        // If reduced motion is enabled and we're not hovering, don't bother animating
        if (reduceMotionRef.current && !isHoveringRef.current) {
          return;
        }

        animId = requestAnimationFrame(animate);

        if (!reduceMotionRef.current) {
          if (!isHoveringRef.current) {
            targetLngRef.current += 0.03;
          }

          currentLngRef.current += (targetLngRef.current - currentLngRef.current) * 0.05;
          globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
          cloudsMesh.rotation.y += 0.0002;
        }

        renderer.render(scene, camera);
      };
​```

## Repo conventions to follow

- The component already uses `reduceMotionRef` to track the reduced motion setting (see lines 155-157 and the useEffect that sets it)
- We are following the existing pattern of using `reduceMotionRef` to conditionally skip motion updates
- We are adding an optimization to skip the animation loop entirely when not needed

## Steps

1. src/components/globe-dashboard/GlobeDashboard.jsx:297-312: Add an early return in the animate function when reduceMotionRef.current is true and !isHoveringRef.current
2. Note: We must still call `renderer.render(scene, camera);` at least once to show the initial state? Actually, the initial render is done before we enter the loop? Let's see: the animate function is called once at the end of the useEffect (line 313: `animate();`). So if we return early on the first call, we never render. We must render at least once.

Therefore, we should adjust: we want to skip the requestAnimationFrame, but we still want to render the current frame.

So we change to:
​```jsx
      let animId;
      const animate = () => {
        // Render the current frame
        renderer.render(scene, camera);

        // If reduced motion is enabled and we're not hovering, don't schedule the next frame
        if (reduceMotionRef.current && !isHoveringRef.current) {
          return;
        }

        animId = requestAnimationFrame(animate);

        if (!reduceMotionRef.current) {
          if (!isHoveringRef.current) {
            targetLngRef.current += 0.03;
          }

          currentLngRef.current += (targetLngRef.current - currentLngRef.current) * 0.05;
          globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
          cloudsMesh.rotation.y += 0.0002;
        };
      };
​```

But note: the motion updates (targetLngRef, currentLngRef, etc.) must happen before we render. So we need to do:

​```jsx
      let animId;
      const animate = () => {
        // Update motion if needed
        if (!reduceMotionRef.current) {
          if (!isHoveringRef.current) {
            targetLngRef.current += 0.03;
          }

          currentLngRef.current += (targetLngRef.current - currentLngRef.current) * 0.05;
          globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
          cloudsMesh.rotation.y += 0.0002;
        }

        // Render the current frame
        renderer.render(scene, camera);

        // If reduced motion is enabled and we're not hovering, don't schedule the next frame
        if (reduceMotionRef.current && !isHoveringRef.current) {
          return;
        }

        animId = requestAnimationFrame(animate);
      };
​```

This way, we update and render, then decide whether to continue.

## Boundaries

- Do NOT change the reveal animation or the hover interactions
- Do NOT change the way reduced motion is detected (we're using the existing reduceMotionRef)
- Do NOT add new dependencies
- If the exact lines don't match due to drift, STOP and report instead of improvising

## Verification

- **Mechanical**: Run `npm run dev` and check for console errors
- **Feel check**: 
  - Enable reduced motion in OS settings (or simulate in DevTools) and confirm the globe stops rotating and clouds stop drifting
  - Hover over a location and confirm the globe still moves to that location and the pin highlights (because we are hovering)
  - When not hovering and reduced motion, the globe should freeze at its last position
  - Disable reduced motion and confirm the globe resumes its slow rotation
- **Done when**: Globe motion stops when reduced motion is enabled and not hovering, but hover interactions still work

## Notes for the plan author

- This change saves CPU/GPU cycles by not requesting animation frames when not needed
- We must ensure that we still render at least once (the initial state) and that we update the motion before rendering
- The hover interactions still work because when hovering, `isHoveringRef.current` is true, so we continue the loop