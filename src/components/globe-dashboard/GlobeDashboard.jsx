"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";

import earthTextureUrl from "./earth-texture.webp";
import cloudsTextureUrl from "./clouds-texture.webp";

const DEFAULT_LOCATIONS = [
  { title: "New York", subtitle: "North America", lat: 40.71, lng: -74 },
  { title: "London", subtitle: "Europe", lat: 51.51, lng: -0.13 },
  { title: "Dubai", subtitle: "Middle East", lat: 25.2, lng: 55.27 },
  { title: "Tokyo", subtitle: "Asia Pacific", lat: 35.68, lng: 139.69 },
  { title: "São Paulo", subtitle: "Latin America", lat: -23.55, lng: -46.63 },
  { title: "Sydney", subtitle: "Oceania", lat: -33.87, lng: 151.21 },
];

function getTheme(dark) {
  return {
    panelBg: dark ? "rgba(20, 28, 48, 0.55)" : "rgba(255, 255, 255, 0.72)",
    panelBorder: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.55)",
    textPrimary: dark ? "rgba(255,255,255,0.92)" : "#111827",
    textMuted: dark ? "rgba(255,255,255,0.38)" : "#9CA3AF",
    textSub: dark ? "rgba(255,255,255,0.55)" : "#374151",
    divider: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
    hoverBg: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
    panelShadow: dark
      ? "0 2px 8px rgba(0,0,0,0.4), 0 16px 40px rgba(0,0,0,0.35)"
      : "0 1px 1px rgba(0,0,0,0.02), 0 4px 16px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.07)",
  };
}

function LocationsPanel({ theme, locations, hoveredIdx, onEnter, onLeave, accentColor, highlightColor, rightPanelPadding }) {
  return (
    <div style={{
      background: theme.panelBg,
      backdropFilter: "blur(28px) saturate(160%)",
      WebkitBackdropFilter: "blur(28px) saturate(160%)",
      borderRadius: 18,
      border: `1px solid ${theme.panelBorder}`,
      boxShadow: theme.panelShadow,
      width: 220,
      flexShrink: 0,
      padding: "20px 0 16px",
      overflowY: "auto",
      maxHeight: "100%",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.textMuted, padding: `0 ${rightPanelPadding}px`, marginBottom: 12 }}>
        Locations
      </div>
      {locations.map((loc, i) => {
        const active = hoveredIdx === i;
        return (
          <div
            key={i}
            onMouseEnter={() => onEnter(loc, i)}
            onMouseLeave={onLeave}
            style={{
              padding: `9px ${rightPanelPadding}px`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "default",
              background: active ? theme.hoverBg : "transparent",
              transition: "background 0.15s ease",
              borderBottom: i < locations.length - 1 ? `1px solid ${theme.divider}` : "none",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: active ? highlightColor : accentColor, transition: "background 0.2s ease" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: active ? theme.textPrimary : theme.textSub, letterSpacing: "-0.01em", lineHeight: 1.2, transition: "color 0.15s ease" }}>
                {loc.title}
              </div>
              <div style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 1 }}>{loc.subtitle}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GlobeDashboard({
  locations = DEFAULT_LOCATIONS,
  dotColor = "#ffffff",
  accentColor = "#3B82F6",
  highlightColor = "#F59E0B",
  darkMode = true,
  rightPanelPadding = 18,
  style = {},
  bgColor = "transparent",
}) {
  const mountRef = useRef(null);
  const globeContainerRef = useRef(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [revealed, setRevealed] = useState(false);    // ← add
  const reduceMotionRef = useRef(false);

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);
  const targetLngRef = useRef(30);
  const currentLngRef = useRef(30);
  const isHoveringRef = useRef(false);
  const leaveTimerRef = useRef(null);
  const pinMeshesRef = useRef([]);

  // Track system preference for reduced motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e) => {
      reduceMotionRef.current = e.matches;
      setReduceMotion(e.matches);
    };

    reduceMotionRef.current = mq.matches;
    setReduceMotion(mq.matches);

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        reduceMotionRef.current = mq.matches;
        setReduceMotion(mq.matches);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', handleChange);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 340;
    const height = container.clientHeight || 480;

    // 1. Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. Globe Group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const sphereGeo = new THREE.SphereGeometry(1, 24, 24);

    const earthMat = new THREE.MeshBasicMaterial({ color: 0x2b4c7e });
    const earthMesh = new THREE.Mesh(sphereGeo, earthMat);
    globeGroup.add(earthMesh);

    // Clouds Mesh
    const cloudsMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(new THREE.SphereGeometry(1.008, 64, 64), cloudsMat);
    globeGroup.add(cloudsMesh);

    // 3. Add Location Pins
    pinMeshesRef.current = [];
    const pinGeo = new THREE.SphereGeometry(0.022, 16, 16);
    const pinMatDefault = new THREE.MeshBasicMaterial({ color: 0xffffff });

    locations.forEach((loc) => {
      const phi = (90 - loc.lat) * (Math.PI / 180);
      const theta = (loc.lng + 180) * (Math.PI / 180);

      const x = -(Math.sin(phi) * Math.cos(theta));
      const z = Math.sin(phi) * Math.sin(theta);
      const y = Math.cos(phi);

      const pinMesh = new THREE.Mesh(pinGeo, pinMatDefault.clone());
      pinMesh.position.set(x * 1.005, y * 1.005, z * 1.005);
      globeGroup.add(pinMesh);
      pinMeshesRef.current.push(pinMesh);
    });

    // Load Textures safely
    const earthSrc = typeof earthTextureUrl === "string" ? earthTextureUrl : earthTextureUrl?.src;
    const cloudsSrc = typeof cloudsTextureUrl === "string" ? cloudsTextureUrl : cloudsTextureUrl?.src;

    const textureLoader = new THREE.TextureLoader();

    // ── Entrance: reveal once the globe actually has pixels (handles late chunk loads) ──
    let disposed = false;
    let revealedOnce = false;
    let revealFallback;
    const reveal = () => {
      if (disposed || revealedOnce) return;
      revealedOnce = true;
      if (revealFallback) clearTimeout(revealFallback);
      setRevealed(true);
    };

    if (reduceMotionRef.current) {
      // Respect reduced motion: show instantly, no transition.
      revealedOnce = true;
      setRevealed(true);
    } else {
      // Safety net if the texture never resolves (offline / decode failure).
      revealFallback = setTimeout(reveal, 1200);
    }

    if (earthSrc) {
      textureLoader.load(
        earthSrc,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          earthMat.color.setHex(0xffffff);
          earthMat.map = tex;
          earthMat.needsUpdate = true;
          reveal();
        },
        undefined,
        () => reveal()
      );
    } else {
      reveal();
    }

    if (cloudsSrc) {
      textureLoader.load(cloudsSrc, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        cloudsMat.map = tex;
        cloudsMat.needsUpdate = true;
      });
    }

    // 4. Animation loop & rotation
    let animId;
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
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      if (revealFallback) clearTimeout(revealFallback);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [mounted, locations]);

  // Update pin colors when hover changes
  useEffect(() => {
    pinMeshesRef.current.forEach((pin, i) => {
      if (pin && pin.material) {
        pin.material.color.set(hoveredIdx === i ? highlightColor : dotColor);
      }
    });
  }, [hoveredIdx, highlightColor, dotColor]);

  const onLocationEnter = (loc, idx) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    isHoveringRef.current = true;
    setHoveredIdx(idx);
    targetLngRef.current = -loc.lng - 90;
  };

  const onLocationLeave = () => {
    setHoveredIdx(null);
    leaveTimerRef.current = setTimeout(() => {
      isHoveringRef.current = false;
      leaveTimerRef.current = null;
    }, 800);
  };

  if (!mounted) {
    return <div style={{ width: "100%", height: "100%", minHeight: 480, background: "transparent", ...style }} />;
  }

  // Reduced motion notice
  const reduceMotionNotice = reduceMotion ? (
    <div style={{
      position: 'absolute',
      bottom: 10,
      left: 10,
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      padding: '4px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontFamily: 'system-ui, sans-serif',
      pointerEvents: 'none',
      zIndex: 10
    }}>
      Globe motion paused (reduce motion enabled)
    </div>
  ) : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 480,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: bgColor,
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0) scale(1)" : "translateY(28px) scale(0.94)",
        transition: reduceMotion
          ? "none"
          : "opacity 1.1s cubic-bezier(0.22, 1, 0.36, 1), transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "opacity, transform",
        ...style,
      }}
    >
      {/* Globe Container */}
      <div ref={globeContainerRef} style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden", background: "transparent", minHeight: 0, minWidth: 280 }}>
        <div ref={mountRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        {reduceMotionNotice}
      </div>

      {/* Locations Panel */}
      <LocationsPanel
        theme={theme}
        locations={locations}
        hoveredIdx={hoveredIdx}
        onEnter={onLocationEnter}
        onLeave={onLocationLeave}
        accentColor={accentColor}
        highlightColor={highlightColor}
        rightPanelPadding={rightPanelPadding}
      />
    </div>
  );
}