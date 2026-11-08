import { useEffect, useRef, useState } from "react";

export default function useCountUp(target: number, duration = 650) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (target === 0) {
      raf.current = requestAnimationFrame(() => setValue(0));
      return () => cancelAnimationFrame(raf.current);
    }

    // Respect reduced-motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf.current = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(raf.current);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // expo out
      setValue(Math.round(ease * target));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}
