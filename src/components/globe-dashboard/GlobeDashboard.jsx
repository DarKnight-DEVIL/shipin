"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";

import earthTextureUrl from "./earth-texture.webp";
import cloudsTextureUrl from "./clouds-texture.webp";

const DEFAULT_LOCATIONS = [
  { title: "United States", subtitle: "North America", lat: 37.09, lng: -95.71, keywords: ["usa", "us", "america", "new york", "california", "texas"] },
  { title: "United Kingdom", subtitle: "Europe", lat: 55.37, lng: -3.43, keywords: ["uk", "britain", "england", "london"] },
  { title: "United Arab Emirates", subtitle: "Middle East", lat: 23.42, lng: 53.84, keywords: ["uae", "dubai", "abu dhabi"] },
  { title: "Canada", subtitle: "North America", lat: 56.13, lng: -106.34, keywords: ["ca", "toronto", "vancouver"] },
  { title: "Germany", subtitle: "Europe", lat: 51.16, lng: 10.45, keywords: ["de", "berlin", "frankfurt", "munich"] },
  { title: "France", subtitle: "Europe", lat: 46.22, lng: 2.21, keywords: ["fr", "paris"] },
  { title: "Australia", subtitle: "Oceania", lat: -25.27, lng: 133.77, keywords: ["au", "sydney", "melbourne"] },
  { title: "Japan", subtitle: "Asia Pacific", lat: 36.20, lng: 138.25, keywords: ["jp", "tokyo", "osaka"] },
  { title: "Singapore", subtitle: "Southeast Asia", lat: 1.35, lng: 103.81, keywords: ["sg"] },
];

const INDIA_HUB = {
  title: "India",
  subtitle: "Operations Hub",
  lat: 20.5937,
  lng: 78.9629,
};

function getTheme(dark) {
  return {
    panelBg: dark
      ? "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.30) 100%)"
      : "linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.20) 100%)",
    panelBorder: dark ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.8)",
    panelSheen: dark
      ? "linear-gradient(120deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(255, 255, 255, 0) 100%)"
      : "linear-gradient(120deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0) 100%)",
    panelShadow: dark
      ? "0 10px 30px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.4)"
      : "0 10px 30px 0 rgba(31, 38, 135, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 0 rgba(255, 255, 255, 0.4)",
    rowHoverBg: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.45)",
    rowHoverShadow: dark
      ? "0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
      : "0 4px 12px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
    textPrimary: dark ? "rgba(255, 255, 255, 0.95)" : "#0F172A",
    textMuted: dark ? "rgba(255, 255, 255, 0.45)" : "#64748B",
    textSub: dark ? "rgba(255, 255, 255, 0.7)" : "#334155",
  };
}

function LocationsPanel({ theme, locations, selectedLocation, onSelect, accentColor, highlightColor, rightPanelPadding, onSearchChange, searchValue }) {
  return (
    <div style={{
      position: "relative",
      zIndex: 2,
      width: 220,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      maxHeight: "100%",
      borderRadius: 24,
      overflow: "hidden",
      marginLeft: -34,
      background: theme.panelBg,
      backdropFilter: "blur(24px) saturate(200%)",
      WebkitBackdropFilter: "blur(24px) saturate(200%)",
      border: `1px solid ${theme.panelBorder}`,
      boxShadow: theme.panelShadow,
    }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", background: theme.panelSheen }} />

      <div style={{
        position: "relative", zIndex: 1,
        fontSize: 10, fontWeight: 700,
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: theme.textMuted,
        padding: `20px ${rightPanelPadding}px 10px`,
      }}>
        Locations
      </div>

      <div style={{ padding: `0 ${rightPanelPadding}px 10px`, marginTop: 8 }}>
        <input
          type="text"
          placeholder="check availability..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "none",
            borderRadius: 12,
            background: theme.rowHoverBg,
            color: theme.textPrimary,
            fontSize: 12,
            outline: "none"
          }}
        />
      </div>

      <div data-lenis-prevent style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "0 10px 16px" }}>
        {locations.map((loc) => {
          const selected = selectedLocation && selectedLocation.title === loc.title;
          return (
            <div
              key={loc.title}
              onClick={() => onSelect(loc)}
              style={{
                padding: `10px ${Math.max(rightPanelPadding, 10)}px`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                borderRadius: 14,
                background: selected ? theme.rowHoverBg : "transparent",
                boxShadow: selected ? theme.rowHoverShadow : "none",
                transform: selected ? "translateX(3px)" : "none",
                transition: "background 0.2s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: selected ? highlightColor : accentColor,
                boxShadow: selected ? `0 0 8px ${highlightColor}` : "none",
                transform: selected ? "scale(1.4)" : "none",
                transition: "background 0.2s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease",
              }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: selected ? theme.textPrimary : theme.textSub, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                  {loc.title}
                </div>
                <div style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 2 }}>{loc.subtitle}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GlobeDashboard({
  locations = DEFAULT_LOCATIONS,
  dotColor = "#ffffff",
  accentColor = "#3B82F6",
  highlightColor = "#F59E0B",
  darkMode = true,
  rightPanelPadding = 16,
  style = {},
  bgColor = "transparent",
}) {
  const mountRef = useRef(null);
  const globeContainerRef = useRef(null);
  const pinMeshesRef = useRef([]); // FIXED: Added missing ref declaration
  const reduceMotionRef = useRef(false);
  const pathLineRef = useRef(null);
  const dragTargetRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showServicePopup, setShowServicePopup] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartLng, setDragStartLng] = useState(null);
  const [dragStartRotation, setDragStartRotation] = useState(0);

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);
  const targetLngRef = useRef(30);
  const currentLngRef = useRef(30);

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

    const handleClickOutside = (e) => {
      if (selectedLocation && !e.target.closest('[data-lenis-prevent]')) {
        onLocationDeselect();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    if (!document.getElementById('popup-animation-style')) {
      const style = document.createElement('style');
      style.id = 'popup-animation-style';
      style.textContent = `
        @keyframes popupFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', handleChange);
      }
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedLocation]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 340;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x2b4c7e });
    const earthMesh = new THREE.Mesh(sphereGeo, earthMat);
    globeGroup.add(earthMesh);

    const cloudsMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(new THREE.SphereGeometry(1.008, 64, 64), cloudsMat);
    globeGroup.add(cloudsMesh);

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

    const earthSrc = typeof earthTextureUrl === "string" ? earthTextureUrl : earthTextureUrl?.src;
    const cloudsSrc = typeof cloudsTextureUrl === "string" ? cloudsTextureUrl : cloudsTextureUrl?.src;
    const textureLoader = new THREE.TextureLoader();

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
      revealedOnce = true;
      setRevealed(true);
    } else {
      revealFallback = setTimeout(reveal, 1200);
    }

    if (earthSrc) {
      textureLoader.load(earthSrc, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earthMat.color.setHex(0xffffff);
        earthMat.map = tex;
        earthMat.needsUpdate = true;
        reveal();
      }, undefined, () => reveal());
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

    const pathMaterial = new THREE.LineBasicMaterial({ color: 0xffa500, linewidth: 3 });
    const pathGeometry = new THREE.BufferGeometry();
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    globeGroup.add(pathLine);
    pathLineRef.current = pathLine;

    let animId;
    const animate = () => {
      if (!reduceMotionRef.current) {
        targetLngRef.current += 0.03;
        currentLngRef.current += (targetLngRef.current - currentLngRef.current) * 0.05;
        globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
        cloudsMesh.rotation.y += 0.0002;
      }
      renderer.render(scene, camera);
      if (reduceMotionRef.current) return;
      animId = requestAnimationFrame(animate);
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

    const handleMouseDown = (e) => {
      dragTargetRef.current = e.target.closest('.globe-container');
      if (dragTargetRef.current) {
        setIsDragging(true);
        setDragStartLng(targetLngRef.current);
        setDragStartRotation(currentLngRef.current);
      }
    };

    const handleMouseMove = (e) => {
      if (!isDragging || !dragTargetRef.current) return;
      const deltaX = e.movementX || 0;
      const lngIncrement = deltaX * 0.5;
      targetLngRef.current = dragStartLng - lngIncrement;
      currentLngRef.current = dragStartRotation - lngIncrement;
      globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragTargetRef.current = null;
    };

    if (container) {
      container.classList.add('globe-container');
      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      pinMeshesRef.current = [];
      if (revealFallback) clearTimeout(revealFallback);
      window.removeEventListener("resize", handleResize);
      if (container) {
        container.classList.remove('globe-container');
        container.removeEventListener("mousedown", handleMouseDown);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      }
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [mounted, locations]);

  useEffect(() => {
    const selectedIndex = selectedLocation ? locations.findIndex(loc => loc.title === selectedLocation.title) : -1;
    pinMeshesRef.current.forEach((pin, i) => {
      if (pin && pin.material) {
        pin.material.color.set(selectedIndex === i ? highlightColor : dotColor);
      }
    });
  }, [selectedLocation, locations, highlightColor, dotColor]);

  const drawGreatCirclePath = (targetLocation) => {
    const indiaLocation = INDIA_HUB;
    if (!indiaLocation || !targetLocation) return;

    const latToRadians = (lat) => (lat * Math.PI) / 180;
    const lngToRadians = (lng) => (lng * Math.PI) / 180;

    const indiaLat = latToRadians(indiaLocation.lat);
    const indiaLng = lngToRadians(indiaLocation.lng);
    const targetLat = latToRadians(targetLocation.lat);
    const targetLng = lngToRadians(targetLocation.lng);
    const radius = 1.01;

    const points = [];
    const segments = 50;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const lat = Math.atan2(
        Math.sin(indiaLat) * Math.cos(t * Math.PI/2) + Math.cos(indiaLat) * Math.sin(t * Math.PI/2) * Math.cos(targetLng - indiaLng),
        Math.sqrt(
          Math.pow(Math.sin(indiaLat) * Math.sin(t * Math.PI/2) - Math.cos(indiaLat) * Math.cos(t * Math.PI/2) * Math.cos(targetLng - indiaLng), 2) +
          Math.pow(Math.cos(indiaLat) * Math.sin(t * Math.PI/2) * Math.sin(targetLng - indiaLng), 2)
        )
      );

      const lng = indiaLng + Math.atan2(
        Math.sin(targetLng - indiaLng) * Math.sin(t * Math.PI/2),
        Math.cos(indiaLat) * Math.cos(t * Math.PI/2) - Math.sin(indiaLat) * Math.sin(t * Math.PI/2) * Math.cos(targetLng - indiaLng)
      );

      points.push(radius * Math.cos(lat) * Math.cos(lng), radius * Math.sin(lat), radius * Math.cos(lat) * Math.sin(lng));
    }

    if (pathLineRef.current) {
      pathLineRef.current.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      pathLineRef.current.geometry.computeBoundingSphere();
    }
  };

  const clearPath = () => {
    if (pathLineRef.current) {
      pathLineRef.current.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    }
  };

  const onLocationSelect = (loc) => {
    if (selectedLocation) clearPath();
    setSelectedLocation(loc);
    setShowServicePopup(true);
    drawGreatCirclePath(loc);
  };

  const onLocationDeselect = () => {
    setShowServicePopup(false);
    setSelectedLocation(null);
    clearPath();
  };

  const onSearchChange = (value) => {
    setSearchValue(value);
    if (!value.trim()) return;

    const matchedLocation = locations.find(loc => 
      loc.title.toLowerCase().includes(value.toLowerCase()) ||
      (loc.keywords && loc.keywords.some(k => k.toLowerCase().includes(value.toLowerCase())))
    );

    if (matchedLocation) onLocationSelect(matchedLocation);
  };

  if (!mounted) {
    return <div style={{ width: "100%", height: "100%", minHeight: 480, background: "transparent", ...style }} />;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 480,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
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
      <div ref={globeContainerRef} style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden", background: "transparent", minHeight: 0, minWidth: 280 }}>
        <div ref={mountRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>

      <LocationsPanel
        theme={theme}
        locations={locations}
        selectedLocation={selectedLocation}
        onSelect={onLocationSelect}
        onDeselect={onLocationDeselect}
        accentColor={accentColor}
        highlightColor={highlightColor}
        rightPanelPadding={rightPanelPadding}
        onSearchChange={onSearchChange}
        searchValue={searchValue}
      />

      {showServicePopup && selectedLocation && (
        <div style={{
          position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(46, 125, 50, 0.9)', color: 'white', padding: '8px 16px',
          borderRadius: '20px', fontSize: '14px', fontWeight: '600',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10, pointerEvents: 'none',
          animation: 'popupFadeIn 0.3s ease-out'
        }}>
          Service available
        </div>
      )}
    </div>
  );
}