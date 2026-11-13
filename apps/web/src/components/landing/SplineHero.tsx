"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

export const SHIPIN_SPLINE_SCENE =
  "https://prod.spline.design/YX2rEgWTG3n3kgnJ/scene.splinecode";

const Spline = dynamic(
  () =>
    import("@splinetool/react-spline").catch((err) => {
      console.error("Failed to load Spline:", err);
      // Return a dummy component so the page still works
      return { default: () => null };
    }),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-[#05050a]" />,
  }
);

export default function SplineHero({
  scene = SHIPIN_SPLINE_SCENE,
}: {
  scene?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // This runs exactly when the Spline scene successfully mounts
  const handleSplineLoad = () => {
    const canvas = rootRef.current?.querySelector("canvas");
    if (!canvas) return;

    // 1. Force the canvas to fit the wrapper
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    // 2. THE SECRET FIX: Block "mouse left" events!
    // By capturing and stopping these events before Spline gets them, 
    // Spline never realizes the mouse is hovering over a React button.
    const blockLeave = (e: Event) => e.stopPropagation();
    canvas.addEventListener("pointerleave", blockLeave, true);
    canvas.addEventListener("pointerout", blockLeave, true);
    canvas.addEventListener("mouseleave", blockLeave, true);
    canvas.addEventListener("mouseout", blockLeave, true);
  };

  useEffect(() => {
    // 3. Forward the pointer movements from the window to the canvas
    const forwardPointerMove = (e: PointerEvent) => {
      const canvas = rootRef.current?.querySelector("canvas");
      if (!canvas) return;

      // If we are directly hovering the canvas, native events handle it fine
      if (e.target === canvas) return;

      const rect = canvas.getBoundingClientRect();

      // Create a synthetic pointer event
      const clonedEvent = new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        movementX: e.movementX,
        movementY: e.movementY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        isPrimary: e.isPrimary,
      });

      // Spline's Three.js engine strictly reads these properties.
      // Injecting them via Object.defineProperties bypasses TypeScript errors
      // AND bypasses the browser stripping them out of synthetic events.
      Object.defineProperties(clonedEvent, {
        offsetX: { get: () => e.clientX - rect.left },
        offsetY: { get: () => e.clientY - rect.top },
        pageX: { get: () => e.pageX },
        pageY: { get: () => e.pageY },
      });

      canvas.dispatchEvent(clonedEvent);
    };

    window.addEventListener("pointermove", forwardPointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", forwardPointerMove);
    };
  }, []);

  if (failed) {
    return <div className="absolute inset-0 bg-[#05050a]" />;
  }

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#05050a]">
      {/* Zoomed + cropped Spline scene */}
      <div
        ref={rootRef}
        className="absolute overflow-hidden"
        style={{
          width: "120%",
          height: "120%",
          left: "-10%",
          top: "-10%",
          pointerEvents: "auto", // Ensure the div actively accepts pointer events
        }}
      >
        <Spline
          key={scene}
          scene={scene}
          onLoad={handleSplineLoad} // Safely hook into Spline once it's fully ready
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            inset: 0,
          }}
        />
      </div>

      {/* Bottom-right fade used to hide the Spline badge */}
      <div
        className="pointer-events-none absolute bottom-0 right-0 z-10"
        style={{
          width: "260px",
          height: "110px",
          background:
            "linear-gradient(135deg, transparent 0%, rgba(5,5,10,0.35) 30%, #05050a 75%, #05050a 100%)",
        }}
      />
    </div>
  );
}