"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import { ALL_LOCATIONS, INDIA_HUB } from "@/config/shippingDestinations";

import earthTextureUrl from "./earth-texture.webp";
import cloudsTextureUrl from "./clouds-texture.webp";

function latLngToVector3(lat, lng, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(Math.sin(phi) * Math.cos(theta));
  const z = Math.sin(phi) * Math.sin(theta);
  const y = Math.cos(phi);
  return new THREE.Vector3(x * radius, y * radius, z * radius);
}

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
    <div 
      className="locations-panel"
      style={{
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
      }}
    >
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

      <div style={{ padding: `0 ${rightPanelPadding}px 10px`, marginTop: 4 }}>
        <input
          type="text"
          placeholder="search destination..."
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

      <div 
        data-lenis-prevent 
        className="no-scrollbar"
        style={{ 
          position: "relative", 
          zIndex: 1, 
          flex: 1, 
          minHeight: 0, 
          overflowY: "auto", 
          overscrollBehavior: "contain", 
          padding: "0 10px 16px",
          scrollbarWidth: "none",
          msOverflowStyle: "none"
        }}
      >
        {locations.map((loc) => {
          const selected = selectedLocation && selectedLocation.title === loc.title;
          const isSuspended = loc.status === "suspended";
          const dotBg = selected 
            ? (isSuspended ? "#EF4444" : "#10B981")
            : (isSuspended ? "#F87171" : accentColor);

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
                background: dotBg,
                boxShadow: selected ? `0 0 8px ${dotBg}` : "none",
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
  accentColor = "#3B82F6",
  highlightColor = "#10B981",
  darkMode = true,
  rightPanelPadding = 16,
  style = {},
  bgColor = "transparent",
}) {
  const mountRef = useRef(null);
  const globeContainerRef = useRef(null);
  const mainWrapperRef = useRef(null);
  const globeGroupRef = useRef(null);
  const activePinsGroupRef = useRef(null);
  const reduceMotionRef = useRef(false);
  const arcLineRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showServicePopup, setShowServicePopup] = useState(false);

  // Rotation & Dragging State
  const targetLngRef = useRef(30);
  const currentLngRef = useRef(30);

  // Vertical Tilt (Latitude) State
  const targetLatRef = useRef(0);
  const currentLatRef = useRef(0);

  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);

  const visibleLocations = useMemo(() => {
    const trimmed = searchValue.trim().toLowerCase();
    if (!trimmed) {
      return ALL_LOCATIONS.filter(loc => loc.isDefault);
    }
    return ALL_LOCATIONS.filter(loc =>
      loc.title.toLowerCase().includes(trimmed) ||
      (loc.keywords && loc.keywords.some(k => k.toLowerCase().includes(trimmed)))
    );
  }, [searchValue]);

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
      if (mainWrapperRef.current && !mainWrapperRef.current.contains(e.target)) {
        onLocationDeselect();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    if (!document.getElementById('globe-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'globe-styles';
      styleEl.textContent = `
        @keyframes popupFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `;
      document.head.appendChild(styleEl);
    }

    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', handleChange);
      }
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
    globeGroupRef.current = globeGroup;

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

    const activePinsGroup = new THREE.Group();
    globeGroup.add(activePinsGroup);
    activePinsGroupRef.current = activePinsGroup;

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

    const lineMat = new THREE.LineDashedMaterial({
      color: 0x3B82F6,
      linewidth: 2,
      dashSize: 0.08,
      gapSize: 0.04,
      scale: 1,
      transparent: true,
      opacity: 0.9,
    });
    const arcGeometry = new THREE.BufferGeometry();
    const arcLine = new THREE.Line(arcGeometry, lineMat);
    globeGroup.add(arcLine);
    arcLineRef.current = arcLine;

    let animId;
    const animate = () => {
      if (!reduceMotionRef.current) {
        if (!isDraggingRef.current) {
          // Auto rotate longitude horizontally
          targetLngRef.current += 0.03;
          // Smoothly spring target latitude back to neutral horizon (0)
          targetLatRef.current += (0 - targetLatRef.current) * 0.08;
        }

        currentLngRef.current += (targetLngRef.current - currentLngRef.current) * 0.08;
        currentLatRef.current += (targetLatRef.current - currentLatRef.current) * 0.08;

        globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
        globeGroup.rotation.x = THREE.MathUtils.degToRad(currentLatRef.current);
        cloudsMesh.rotation.y += 0.0002;

        if (arcLineRef.current && arcLineRef.current.material.isLineDashedMaterial) {
          arcLineRef.current.material.dashOffset -= 0.004;
        }
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

    const onMouseDown = (e) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      targetLngRef.current += deltaX * 0.45;
      targetLatRef.current = Math.max(-60, Math.min(60, targetLatRef.current + deltaY * 0.35));

      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - previousMousePositionRef.current.x;
      const deltaY = e.touches[0].clientY - previousMousePositionRef.current.y;

      targetLngRef.current += deltaX * 0.45;
      targetLatRef.current = Math.max(-60, Math.min(60, targetLatRef.current + deltaY * 0.35));

      previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    const targetContainer = globeContainerRef.current;
    if (targetContainer) {
      targetContainer.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      targetContainer.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      if (revealFallback) clearTimeout(revealFallback);
      window.removeEventListener("resize", handleResize);
      if (targetContainer) {
        targetContainer.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        targetContainer.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      }
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [mounted]);

  // Clean Great-Circle Geographic Midpoint Calculation
  const focusCameraOnArcCenter = (targetLocation) => {
    if (!targetLocation) return;

    const lat1 = (INDIA_HUB.lat * Math.PI) / 180;
    const lng1 = (INDIA_HUB.lng * Math.PI) / 180;
    const lat2 = (targetLocation.lat * Math.PI) / 180;
    const lng2 = (targetLocation.lng * Math.PI) / 180;

    const dLng = lng2 - lng1;

    const Bx = Math.cos(lat2) * Math.cos(dLng);
    const By = Math.cos(lat2) * Math.sin(dLng);

    const midLatRad = Math.atan2(
      Math.sin(lat1) + Math.sin(lat2),
      Math.sqrt((Math.cos(lat1) + Bx) * (Math.cos(lat1) + Bx) + By * By)
    );
    const midLngRad = lng1 + Math.atan2(By, Math.cos(lat1) + Bx);

    const midLat = (midLatRad * 180) / Math.PI;
    const midLng = (midLngRad * 180) / Math.PI;

    // To bring midLng to camera view facing +Z (front):
    // In Three.js geometry coordinates with rotation.y = degToRad(lngRef):
    const desiredRotationY = -midLng;

    // Find shortest angular rotation path
    let currentDeg = currentLngRef.current;
    let diff = (desiredRotationY - currentDeg) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    targetLngRef.current = currentDeg + diff;
    // Align pitch latitude directly to center the peak of the arc vertically
    targetLatRef.current = Math.max(-30, Math.min(30, -midLat * 0.5));
  };

  const renderActivePins = (targetLocation) => {
    if (!activePinsGroupRef.current) return;

    while (activePinsGroupRef.current.children.length > 0) {
      const child = activePinsGroupRef.current.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      activePinsGroupRef.current.remove(child);
    }

    if (!targetLocation) return;

    // 1. India Surface Dot (Blue)
    const hubPos = latLngToVector3(INDIA_HUB.lat, INDIA_HUB.lng, 1.008);
    const hubDotMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x3B82F6 })
    );
    hubDotMesh.position.copy(hubPos);
    activePinsGroupRef.current.add(hubDotMesh);

    // 2. Destination Surface Dot (Green if serviceable, Red if suspended)
    const targetPos = latLngToVector3(targetLocation.lat, targetLocation.lng, 1.008);
    const isSuspended = targetLocation.status === "suspended";
    const destColor = isSuspended ? 0xEF4444 : 0x10B981;
    const targetDotMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 16, 16),
      new THREE.MeshBasicMaterial({ color: destColor })
    );
    targetDotMesh.position.copy(targetPos);
    activePinsGroupRef.current.add(targetDotMesh);
  };

  const drawTravellingArc = (targetLocation) => {
    if (!targetLocation || !arcLineRef.current) return;

    const startVec = latLngToVector3(INDIA_HUB.lat, INDIA_HUB.lng, 1.01);
    const endVec = latLngToVector3(targetLocation.lat, targetLocation.lng, 1.01);

    const distance = startVec.distanceTo(endVec);
    const midVec = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

    const altitude = 1 + Math.max(0.2, distance * 0.45);
    midVec.normalize().multiplyScalar(altitude);

    const curve = new THREE.QuadraticBezierCurve3(startVec, midVec, endVec);
    const points = curve.getPoints(64);

    const isSuspended = targetLocation.status === "suspended";
    arcLineRef.current.material.color.setHex(isSuspended ? 0xEF4444 : 0x3B82F6);

    arcLineRef.current.geometry.dispose();
    arcLineRef.current.geometry = new THREE.BufferGeometry().setFromPoints(points);
    arcLineRef.current.computeLineDistances();
  };

  const clearArcAndPins = () => {
    if (arcLineRef.current) {
      arcLineRef.current.geometry.dispose();
      arcLineRef.current.geometry = new THREE.BufferGeometry();
    }
    renderActivePins(null);
  };

  const onLocationSelect = (loc) => {
    setSelectedLocation(loc);
    setShowServicePopup(true);
    renderActivePins(loc);
    drawTravellingArc(loc);
    focusCameraOnArcCenter(loc);
  };

  const onLocationDeselect = () => {
    setShowServicePopup(false);
    setSelectedLocation(null);
    clearArcAndPins();
  };

  const onSearchChange = (value) => {
    setSearchValue(value);
    if (!value.trim()) return;

    const matchedLocation = ALL_LOCATIONS.find(loc => 
      loc.title.toLowerCase().includes(value.trim().toLowerCase()) ||
      (loc.keywords && loc.keywords.some(k => k.toLowerCase().includes(value.trim().toLowerCase())))
    );

    if (matchedLocation) onLocationSelect(matchedLocation);
  };

  if (!mounted) {
    return <div style={{ width: "100%", height: "100%", minHeight: 480, background: "transparent", ...style }} />;
  }

  const isSuspended = selectedLocation?.status === "suspended";

  return (
    <div
      ref={mainWrapperRef}
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
      <div 
        ref={globeContainerRef} 
        style={{ 
          flex: 1, 
          height: "100%", 
          position: "relative", 
          overflow: "hidden", 
          background: "transparent", 
          minHeight: 0, 
          minWidth: 280,
          cursor: "grab"
        }}
      >
        <div ref={mountRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>

      <LocationsPanel
        theme={theme}
        locations={visibleLocations}
        selectedLocation={selectedLocation}
        onSelect={onLocationSelect}
        accentColor={accentColor}
        highlightColor={highlightColor}
        rightPanelPadding={rightPanelPadding}
        onSearchChange={onSearchChange}
        searchValue={searchValue}
      />

      {showServicePopup && selectedLocation && (
        <div style={{
          position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: isSuspended ? 'rgba(185, 28, 28, 0.92)' : 'rgba(22, 101, 52, 0.92)',
          color: 'white', padding: '8px 18px',
          borderRadius: '20px', fontSize: '13px', fontWeight: '600',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)', zIndex: 10, pointerEvents: 'none',
          backdropFilter: 'blur(12px)',
          animation: 'popupFadeIn 0.3s ease-out',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: isSuspended ? '#FECACA' : '#86EFAC',
            boxShadow: `0 0 8px ${isSuspended ? '#EF4444' : '#22C55E'}`
          }} />
          {isSuspended 
            ? `Service to ${selectedLocation.title} currently suspended` 
            : `Service available to ${selectedLocation.title}`}
        </div>
      )}
    </div>
  );
}