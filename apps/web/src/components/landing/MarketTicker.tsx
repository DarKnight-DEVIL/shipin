"use client";

import { useRef, useEffect } from "react";

interface MarketTickerProps {
  markets: string[];
}

export default function MarketTicker({ markets }: MarketTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const duplicatedMarkets = [...markets, ...markets, ...markets];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationId: number;
    let lastTime = 0;
    const speed = 30; // pixels per second

    function animate(time: number) {
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      const scrollWidth = container!.scrollWidth / 3; // One-third since we tripled
      const currentScroll = container!.scrollLeft;

      container!.scrollLeft = (currentScroll + speed * delta) % scrollWidth;

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div
      className="market-ticker"
      ref={containerRef}
      aria-hidden="true"
      role="img"
      aria-label="Markets served"
    >
      <div className="market-ticker__track">
        {duplicatedMarkets.map((market, index) => (
          <span key={index} className="market-ticker__item">
            {market}
          </span>
        ))}
      </div>
    </div>
  );
}