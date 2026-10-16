"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import { ALL_LOCATIONS, INDIA_HUB } from "@/config/shippingDestinations";

import earthTextureUrl from "./earth-texture.webp";
import cloudsTextureUrl from "./clouds-texture.webp";

// The globe's on-screen size is fixed by the camera, so its bounds can be
// derived rather than guessed. With a radius of 1, this vertical FOV and the
// camera at this distance, the globe spans exactly this fraction of the
// container's height — the side column is sized from it so its top and bottom
// edges line up with the globe's.
const GLOBE_RADIUS = 1;
const GLOBE_FOV = 45;
const GLOBE_CAMERA_Z = 3.2;
const GLOBE_PROJECTED_DIAMETER =
  (GLOBE_RADIUS * 2) / (2 * Math.tan((GLOBE_FOV * Math.PI) / 360) * GLOBE_CAMERA_Z);

// Optional optical nudge for the toggle + panel column. 0 keeps the column
// exactly centred on the globe, which is where the alignment comes from.
const SIDE_COLUMN_OFFSET = 0;

// The list always shows exactly this many rows, so the panel never grows,
// shrinks or scrolls as the search changes. Short result sets are padded with
// the remaining destinations, drawn muted so it stays clear which ones matched.
const LOCATION_ROW_COUNT = 5;
const LOCATION_ROW_HEIGHT = 54;
const LOCATION_LIST_PADDING_BOTTOM = 16;

// The globe's animation is opt-in: it holds still for every visitor until they
// press the button, regardless of the OS reduced-motion setting. Flip this to
// true to have it animate for everyone instead (the button then stops it).
const ANIMATION_STARTS_ON = false;

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

/**
 * Opt-in control for the globe's animation.
 *
 * The OS reduced-motion setting is deliberately not consulted: every visitor
 * gets the same starting state and the same button, so the behaviour never
 * depends on a system preference that can change underneath us.
 */
function MotionToggle({ theme, accentColor, motionEnabled, onToggleMotion }) {
  const active = motionEnabled;
  const label = active ? "Animation on" : "Load the animation";
  const hint = active
    ? "The globe is animating. Turn this off to hold it still."
    : "Start the globe's animation.";

  return (
    <button
      type="button"
      className="motion-toggle"
      onClick={onToggleMotion}
      aria-pressed={active}
      title={hint}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.01em",
        color: active ? "#FFFFFF" : theme.textPrimary,
        background: active ? accentColor : theme.rowHoverBg,
        border: `1px solid ${active ? "rgba(255, 255, 255, 0.35)" : theme.panelBorder}`,
        backdropFilter: "blur(14px) saturate(180%)",
        WebkitBackdropFilter: "blur(14px) saturate(180%)",
        boxShadow: active
          ? "0 6px 18px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
          : "inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 4px 14px rgba(31, 38, 135, 0.10)",
        transition: "background 0.25s ease, box-shadow 0.25s ease, color 0.25s ease, border-color 0.25s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: theme.panelSheen,
          opacity: active ? 0.5 : 1,
          pointerEvents: "none",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          width: 6,
          height: 6,
          borderRadius: "50%",
          flexShrink: 0,
          background: active ? "#FFFFFF" : accentColor,
          boxShadow: `0 0 8px ${active ? "#FFFFFF" : accentColor}`,
        }}
      />
      <span style={{ position: "relative" }}>{label}</span>
    </button>
  );
}

function LocationsPanel({ theme, locations, selectedLocation, onSelect, accentColor, highlightColor, rightPanelPadding, onSearchChange, searchValue }) {
  return (
    <div 
      className="locations-panel"
      style={{
        position: "relative",
        zIndex: 2,
        // Hugs its five rows instead of stretching, so the locked list really
        // does fix the panel's size.
        flex: "0 1 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        maxHeight: "100%",
        borderRadius: 24,
        overflow: "hidden",
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
          // Exactly five rows tall, so the list never grows, shrinks or scrolls.
          // It can still shrink and scroll if a short viewport squeezes the panel.
          flex: "0 1 auto",
          height: LOCATION_ROW_HEIGHT * LOCATION_ROW_COUNT + LOCATION_LIST_PADDING_BOTTOM,
          boxSizing: "border-box",
          minHeight: 0, 
          overflowY: "auto", 
          overscrollBehavior: "contain", 
          padding: `0 10px ${LOCATION_LIST_PADDING_BOTTOM}px`,
          scrollbarWidth: "none",
          msOverflowStyle: "none"
        }}
      >
        {locations.map(({ location: loc, muted }) => {
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
                height: LOCATION_ROW_HEIGHT,
                boxSizing: "border-box",
                overflow: "hidden",
                opacity: muted && !selected ? 0.55 : 1,
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: selected ? theme.textPrimary : theme.textSub, letterSpacing: "-0.01em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {loc.title}
                </div>
                <div style={{ fontSize: 10.5, lineHeight: 1.3, color: theme.textMuted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loc.subtitle}</div>
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
  // The render loop reads this ref instead of state, so toggling the animation
  // never requires tearing the loop down and rebuilding it.
  const motionEnabledRef = useRef(ANIMATION_STARTS_ON);
  const arcLineRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(ANIMATION_STARTS_ON);
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
    const searchActive = trimmed.length > 0;

    const matched = searchActive
      ? ALL_LOCATIONS.filter(loc =>
          loc.title.toLowerCase().includes(trimmed) ||
          (loc.keywords && loc.keywords.some(k => k.toLowerCase().includes(trimmed)))
        )
      : ALL_LOCATIONS.filter(loc => loc.isDefault);

    const entries = matched
      .slice(0, LOCATION_ROW_COUNT)
      .map(location => ({ location, muted: false }));

    // Pad back up to the fixed row count so the list is always the same height.
    // Padding rows are only muted when they follow an actual search.
    if (entries.length < LOCATION_ROW_COUNT) {
      const taken = new Set(entries.map(entry => entry.location.title));
      for (const location of ALL_LOCATIONS) {
        if (entries.length >= LOCATION_ROW_COUNT) break;
        if (taken.has(location.title)) continue;
        taken.add(location.title);
        entries.push({ location, muted: searchActive });
      }
    }

    return entries;
  }, [searchValue]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const target = e.target;

      // Allow clicking the animation toggle or inside the UI panel without
      // deselecting. The toggle lives outside the panel now, so it needs its
      // own exemption.
      if (target.closest && (target.closest('.locations-panel') || target.closest('.motion-toggle'))) {
        return;
      }

      // Check distance if clicking on the canvas
      if (mountRef.current && target.tagName && target.tagName.toLowerCase() === 'canvas') {
        const rect = mountRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY);
        
        // Exact projected radius rather than the old "about 38%" guess.
        const globeRadius = rect.height * (GLOBE_PROJECTED_DIAMETER / 2);

        // If click was outside the physical globe sphere radius, deselect
        if (distance > globeRadius) {
          onLocationDeselect();
        }
        return;
      }

      // Deselect for any other click outside
      onLocationDeselect();
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
        .motion-toggle:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 3px;
        }
      `;
      document.head.appendChild(styleEl);
    }

    return () => {
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
    const camera = new THREE.PerspectiveCamera(GLOBE_FOV, width / height, 0.1, 1000);
    camera.position.set(0, 0, GLOBE_CAMERA_Z);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    const sphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 24, 24);
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
    const cloudsMesh = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 64, 64),
      cloudsMat
    );
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

    // Unconditional: with no OS listener, the entrance is identical for everyone.
    revealFallback = setTimeout(reveal, 1200);

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
      color: 0x38BDF8,
      linewidth: 3,
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
      // Reschedule first: the loop must outlive the animation being toggled,
      // otherwise turning it back on could never restart it without a refresh.
      animId = requestAnimationFrame(animate);

      if (motionEnabledRef.current) {
        if (!isDraggingRef.current) {
          targetLngRef.current += 0.03;
          targetLatRef.current += (0 - targetLatRef.current) * 0.08;
        }

        currentLngRef.current += (targetLngRef.current - currentLngRef.current) * 0.08;
        currentLatRef.current += (targetLatRef.current - currentLatRef.current) * 0.08;

        cloudsMesh.rotation.y += 0.0002;

        if (arcLineRef.current && arcLineRef.current.material.isLineDashedMaterial) {
          arcLineRef.current.material.dashOffset -= 0.004;
        }
      } else {
        // Animation held still: no ambient drift, but direct manipulation still
        // works. The globe follows the pointer on both axes, and once the drag
        // ends it repositions itself vertically the same way it does while the
        // animation is running.
        if (!isDraggingRef.current) {
          targetLatRef.current += (0 - targetLatRef.current) * 0.08;
        }
        currentLngRef.current = targetLngRef.current;
        currentLatRef.current = targetLatRef.current;
      }

      globeGroup.rotation.y = THREE.MathUtils.degToRad(currentLngRef.current);
      globeGroup.rotation.x = THREE.MathUtils.degToRad(currentLatRef.current);

      // Always render: pins and arcs are only ever drawn from here.
      renderer.render(scene, camera);
    };
    animate();

    // Shared by the mouse and touch drag handlers. While the animation is held
    // still the live rotation is updated here too, so dragging the globe never
    // depends on the render loop's easing to take effect.
    const applyDrag = (deltaX, deltaY) => {
      targetLngRef.current += deltaX * 0.45;
      targetLatRef.current = Math.max(-60, Math.min(60, targetLatRef.current + deltaY * 0.35));
      if (!motionEnabledRef.current) {
        currentLngRef.current = targetLngRef.current;
        currentLatRef.current = targetLatRef.current;
      }
    };

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
      applyDrag(
        e.clientX - previousMousePositionRef.current.x,
        e.clientY - previousMousePositionRef.current.y
      );
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
      applyDrag(
        e.touches[0].clientX - previousMousePositionRef.current.x,
        e.touches[0].clientY - previousMousePositionRef.current.y
      );
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

    const desiredRotationY = -(midLng + 180) + 60;

    let currentDeg = currentLngRef.current;
    let diff = (desiredRotationY - currentDeg) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    targetLngRef.current = currentDeg + diff;
    targetLatRef.current = Math.max(-25, Math.min(25, -midLat * 0.45));
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

    const hubPos = latLngToVector3(INDIA_HUB.lat, INDIA_HUB.lng, 1.008);
    const hubDotMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x3B82F6 })
    );
    hubDotMesh.position.copy(hubPos);
    activePinsGroupRef.current.add(hubDotMesh);

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

  // Searching only filters the list. It deliberately does not select anything:
  // auto-applying the first match meant a destination the visitor never chose
  // got selected (and the globe flew to it) as soon as they typed.
  const onSearchChange = (value) => {
    setSearchValue(value);
  };

  const onToggleMotion = () => {
    const next = !motionEnabledRef.current;
    // Resolve immediately so the very next rendered frame reflects the choice.
    motionEnabledRef.current = next;
    setMotionEnabled(next);
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
        transition: "opacity 1.1s cubic-bezier(0.22, 1, 0.36, 1), transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
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
        }}
      >
        <div 
          ref={mountRef} 
          style={{ 
            position: "absolute", 
            inset: 0, 
            width: "100%", 
            height: "100%", 
            cursor: "grab" 
          }} 
        />
      </div>

      {/* The animation toggle is deliberately its own element, sitting above and
          outside the locations panel, so the two never read as one control. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 14,
          width: 220,
          flexShrink: 0,
          // Span the globe's rendered bounds and centre the pair on the globe's
          // middle, so the toggle and the panel sit level with the globe.
          height: `${GLOBE_PROJECTED_DIAMETER * 100}%`,
          maxHeight: "100%",
          minHeight: 0,
          marginLeft: -34,
          transform: `translateY(${SIDE_COLUMN_OFFSET}px)`,
        }}
      >
        <MotionToggle
          theme={theme}
          accentColor={accentColor}
          motionEnabled={motionEnabled}
          onToggleMotion={onToggleMotion}
        />

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
      </div>

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
