"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/userProfile";

// ---------------------------------------------------------------------------
// WebGL Halftone Dot Shader
// ---------------------------------------------------------------------------
const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uBgColor;
uniform float uCellPx;
uniform float uAngle;
uniform float uContrast;
uniform float uWaveAmount;
uniform float uMouseInfluence;
uniform float uShape; // 0 = circle, 1 = square, 2 = line
uniform float uUseImage; // 0 or 1
uniform sampler2D uImage;
uniform vec2 uImageSize;

varying vec2 vUv;

vec2 coverUv(vec2 uv, vec2 res, vec2 texSize) {
  float resAspect = res.x / res.y;
  float texAspect = max(texSize.x, 1.0) / max(texSize.y, 1.0);
  vec2 scale = resAspect > texAspect
    ? vec2(1.0, resAspect / texAspect)
    : vec2(texAspect / resAspect, 1.0);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;

  // --- procedural source (used when no image, or blended toward image) ---
  float grad = uv.x * 0.5 + uv.y * 0.5;
  float wave = sin((uv.x + uv.y) * 3.0 + uTime) * 0.15 * uWaveAmount;
  float mouseDist = distance(uv, uMouse);
  float mouseGlow = uMouseInfluence * exp(-mouseDist * 6.0) * 0.4;
  float lumProcedural = clamp(grad + wave + mouseGlow, 0.0, 1.0);

  // --- image source ---
  vec2 iuv = coverUv(uv, uResolution, uImageSize);
  vec3 imgColor = texture2D(uImage, clamp(iuv, 0.0, 1.0)).rgb;
  float lumImage = dot(imgColor, vec3(0.299, 0.587, 0.114));

  float lum = mix(lumProcedural, lumImage, uUseImage);
  lum = clamp((lum - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // --- dot grid, rotated by uAngle, in pixel space ---
  vec2 center = uResolution * 0.5;
  vec2 p = gl_FragCoord.xy - center;
  float s = sin(uAngle);
  float c = cos(uAngle);
  vec2 rp = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

  // subtle organic drift of the grid itself, tied to the same wave/mouse
  rp += uWaveAmount * 8.0 * vec2(sin(uv.y * 6.0 + uTime), cos(uv.x * 6.0 + uTime));

  vec2 cell = mod(rp, uCellPx) - uCellPx * 0.5;

  // darker luminance -> bigger ink mark
  float radius = uCellPx * 0.5 * sqrt(clamp(1.0 - lum, 0.0, 1.0));

  float d;
  if (uShape < 0.5) {
    d = length(cell); // circle
  } else if (uShape < 1.5) {
    d = max(abs(cell.x), abs(cell.y)); // square
  } else {
    d = abs(cell.y); // horizontal line screen
  }

  float inside = smoothstep(radius, radius - 1.5, d);
  vec3 ink = mix(uColorB, uColorA, lum);
  vec3 color = mix(uBgColor, ink, inside);

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("HalftoneDotShader shader error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("HalftoneDotShader link error:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function parseColorToRgb01(input: string): [number, number, number] {
  const value = (input || "").trim();
  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgbMatch) {
    const r = parseFloat(rgbMatch[1]) / 255;
    const g = parseFloat(rgbMatch[2]) / 255;
    const b = parseFloat(rgbMatch[3]) / 255;
    return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
  }
  const clean = value.replace("#", "");
  const isHex = /^[0-9a-f]{3,8}$/i.test(clean);
  if (!isHex) {
    return [0, 0, 0];
  }
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
}

interface HalftoneDotShaderProps {
  colorA?: string;
  colorB?: string;
  backgroundColor?: string;
  dotShape?: "circle" | "square" | "line";
  cellSize?: number;
  angle?: number;
  contrast?: number;
  animate?: boolean;
  speed?: number;
  waveAmount?: number;
  mouseInteractive?: boolean;
  mouseStrength?: number;
}

function HalftoneDotShader({
  colorA = "#ff2a5f",
  colorB = "#8b5cf6",
  backgroundColor = "#09090b",
  dotShape = "circle",
  cellSize = 18,
  angle = 15,
  contrast = 1.2,
  animate = true,
  speed = 0.6,
  waveAmount = 0.7,
  mouseInteractive = true,
  mouseStrength = 0.9,
}: HalftoneDotShaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const textureRef = useRef<WebGLTexture | null>(null);
  const imageSizeRef = useRef<[number, number]>([1, 1]);
  const useImageRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const mouseRef = useRef<[number, number]>([0.5, 0.5]);
  const visibleRef = useRef<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const shouldAnimate = animate && !reducedMotion;

  const handlePointerMove = (e: PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const y = 1 - (e.clientY - rect.top) / Math.max(rect.height, 1);
    mouseRef.current = [x, y];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanupCurrent: (() => void) | null = null;

    function setup() {
      if (!canvas) return;
      const gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: true });
      if (!gl) {
        console.error("HalftoneDotShader: WebGL is not available in this context.");
        return;
      }
      glRef.current = gl;
      const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      if (!program) {
        glRef.current = null;
        return;
      }
      programRef.current = program;
      gl.useProgram(program);

      const posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      uniformsRef.current = {
        uResolution: gl.getUniformLocation(program, "uResolution"),
        uTime: gl.getUniformLocation(program, "uTime"),
        uMouse: gl.getUniformLocation(program, "uMouse"),
        uColorA: gl.getUniformLocation(program, "uColorA"),
        uColorB: gl.getUniformLocation(program, "uColorB"),
        uBgColor: gl.getUniformLocation(program, "uBgColor"),
        uCellPx: gl.getUniformLocation(program, "uCellPx"),
        uAngle: gl.getUniformLocation(program, "uAngle"),
        uContrast: gl.getUniformLocation(program, "uContrast"),
        uWaveAmount: gl.getUniformLocation(program, "uWaveAmount"),
        uMouseInfluence: gl.getUniformLocation(program, "uMouseInfluence"),
        uShape: gl.getUniformLocation(program, "uShape"),
        uUseImage: gl.getUniformLocation(program, "uUseImage"),
        uImage: gl.getUniformLocation(program, "uImage"),
        uImageSize: gl.getUniformLocation(program, "uImageSize"),
      };

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      textureRef.current = tex;
      useImageRef.current = 0;
      startRef.current = performance.now();

      cleanupCurrent = () => {
        if (!gl.isContextLost()) {
          gl.deleteProgram(program);
          gl.deleteBuffer(posBuffer);
          if (textureRef.current) gl.deleteTexture(textureRef.current);
        }
        glRef.current = null;
        programRef.current = null;
      };
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      glRef.current = null;
      programRef.current = null;
    };

    const handleContextRestored = () => {
      setup();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
    setup();

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      const gl = glRef.current;
      cleanupCurrent?.();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mouseInteractive) return;
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [mouseInteractive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(container.clientWidth * dpr));
      const h = Math.max(1, Math.round(container.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        glRef.current?.viewport(0, 0, w, h);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const [r1, g1, b1] = parseColorToRgb01(colorA);
    const [r2, g2, b2] = parseColorToRgb01(colorB);
    const [rb, gb, bb] = parseColorToRgb01(backgroundColor);
    const shapeIndex = dotShape === "circle" ? 0 : dotShape === "square" ? 1 : 2;
    let notReadyFrames = 0;
    const MAX_NOT_READY_FRAMES = 300;

    const draw = (now: number) => {
      const gl = glRef.current;
      const program = programRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;

      if (gl && program && canvas && visibleRef.current) {
        if (container) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const w = Math.max(1, Math.round(container.clientWidth * dpr));
          const h = Math.max(1, Math.round(container.clientHeight * dpr));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        const elapsed = (now - startRef.current) / 1000;
        const u = uniformsRef.current;
        gl.useProgram(program);
        if (u.uResolution) gl.uniform2f(u.uResolution, canvas.width, canvas.height);
        if (u.uTime) gl.uniform1f(u.uTime, shouldAnimate ? elapsed * speed : 0);
        if (u.uMouse) gl.uniform2f(u.uMouse, mouseRef.current[0], mouseRef.current[1]);
        if (u.uColorA) gl.uniform3f(u.uColorA, r1, g1, b1);
        if (u.uColorB) gl.uniform3f(u.uColorB, r2, g2, b2);
        if (u.uBgColor) gl.uniform3f(u.uBgColor, rb, gb, bb);
        if (u.uCellPx) gl.uniform1f(u.uCellPx, Math.max(2, cellSize));
        if (u.uAngle) gl.uniform1f(u.uAngle, (angle * Math.PI) / 180);
        if (u.uContrast) gl.uniform1f(u.uContrast, contrast);
        if (u.uWaveAmount) gl.uniform1f(u.uWaveAmount, shouldAnimate ? waveAmount : 0);
        if (u.uMouseInfluence) gl.uniform1f(u.uMouseInfluence, mouseInteractive ? mouseStrength : 0);
        if (u.uShape) gl.uniform1f(u.uShape, shapeIndex);
        if (u.uUseImage) gl.uniform1f(u.uUseImage, useImageRef.current);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        if (u.uImage) gl.uniform1i(u.uImage, 0);
        if (u.uImageSize) gl.uniform2f(u.uImageSize, imageSizeRef.current[0], imageSizeRef.current[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        notReadyFrames = 0;
      } else if (!gl || !program) {
        notReadyFrames++;
      }

      const stillWaitingForGl = (!gl || !program) && notReadyFrames < MAX_NOT_READY_FRAMES;
      if (shouldAnimate || mouseInteractive || stillWaitingForGl) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [
    colorA,
    colorB,
    backgroundColor,
    dotShape,
    cellSize,
    angle,
    contrast,
    shouldAnimate,
    speed,
    waveAmount,
    mouseInteractive,
    mouseStrength,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full overflow-hidden pointer-events-none"
      style={{ backgroundColor }}
    >
      <canvas ref={canvasRef} className="h-full w-full block" />
    </div>
  );
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const requestedNext = searchParams.get("next");
  const safeRequestedNext =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : null;

  async function redirect(uid: string) {
    let destination = "/dashboard";

    try {
      const profile = await getUserProfile(uid);

      if (profile?.role === "admin") {
        destination = safeRequestedNext || "/admin/dashboard";
      } else {
        destination =
          safeRequestedNext && !safeRequestedNext.startsWith("/admin")
            ? safeRequestedNext
            : "/dashboard";
      }
    } catch {
      destination =
        safeRequestedNext && !safeRequestedNext.startsWith("/admin")
          ? safeRequestedNext
          : "/dashboard";
    }

    router.replace(destination);
    router.refresh();
  }

  async function handleGoogleLogin() {
    try {
      setGoogleLoading(true);

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      toast.success(
        `Welcome${result.user.displayName ? `, ${result.user.displayName}` : ""}!`
      );

      await redirect(result.user.uid);
    } catch (error) {
      console.error("Google login failed:", error);
      toast.error("Unable to sign in with Google.");
      setGoogleLoading(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailLoading(true);

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      toast.success("Welcome back!");
      await redirect(result.user.uid);
    } catch (error) {
      console.error("Email login failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to sign in"
      );
      setEmailLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full overflow-hidden bg-[#09090b]">
      {/* LEFT: ShipIN branding and animated halftone */}
      <section
        className="relative hidden min-h-screen w-1/2 shrink-0 cursor-crosshair select-none overflow-hidden bg-[#09090b] lg:flex lg:items-center lg:justify-center"
        aria-label="ShipIN branding"
      >
        {/* Interactive Halftone Dot Shader */}
        <HalftoneDotShader
          colorA="#ff2a5f"
          colorB="#8b5cf6"
          backgroundColor="#09090b"
          dotShape="circle"
          cellSize={20}
          angle={15}
          contrast={1.3}
          speed={0.5}
          waveAmount={0.7}
          mouseInteractive={true}
          mouseStrength={1.2}
        />

        {/* Branding */}
        <div className="relative z-10 flex flex-col items-center gap-5 px-8 text-center pointer-events-none">
          <div className="relative h-[76px] w-[76px]">
            <div className="absolute left-0 top-0 h-[72px] w-[72px] rounded-[20px] border-2 border-violet-400/80 bg-violet-500/15 shadow-[0_0_30px_rgba(139,92,246,0.12)]" />
            <div className="absolute left-[9px] top-[9px] h-[72px] w-[72px] rounded-[20px] border-2 border-indigo-400/70 bg-[#211449]/90 shadow-[0_0_25px_rgba(139,92,246,0.15)]" />
          </div>

          <span className="mt-1 text-4xl font-bold tracking-tight text-white">
            ShipIN
          </span>

          <p className="max-w-[260px] text-base leading-relaxed text-white/45">
            Your global freight, simplified.
          </p>
        </div>

        {/* Subtle divider */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-px bg-gradient-to-b from-violet-500/50 via-violet-400/20 to-transparent" />
      </section>

      {/* RIGHT: Existing login card and pastel background */}
      <section
        className="relative flex min-h-screen min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8 sm:px-8 sm:py-12 lg:px-10"
        style={{
          backgroundColor: "#eef1f8",
          backgroundImage: [
            "radial-gradient(ellipse at 15% 20%, rgba(150,130,240,0.30) 0%, transparent 50%)",
            "radial-gradient(ellipse at 85% 15%, rgba(110,180,255,0.32) 0%, transparent 50%)",
            "radial-gradient(ellipse at 75% 75%, rgba(210,150,240,0.22) 0%, transparent 48%)",
            "radial-gradient(ellipse at 20% 80%, rgba(100,200,235,0.28) 0%, transparent 50%)",
          ].join(","),
        }}
      >
        <div
          className="relative w-full max-w-[460px] overflow-hidden rounded-[30px] px-6 py-8 sm:px-9 sm:py-9"
          style={{
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.88), rgba(239,244,255,0.76))",
            backdropFilter: "blur(32px) saturate(150%)",
            WebkitBackdropFilter: "blur(32px) saturate(150%)",
            border: "1px solid rgba(255,255,255,0.78)",
            boxShadow:
              "0 30px 90px rgba(15,42,77,0.18), inset 1.5px 1.5px 2px rgba(255,255,255,0.95), inset -1.5px -1.5px 3px rgba(16,17,23,0.04)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-[80px] -top-[130px] h-[260px] w-[260px]"
            style={{
              background:
                "radial-gradient(circle, rgba(156,196,251,0.45), transparent 68%)",
            }}
          />

          <div className="relative z-10 w-full text-center">
            {/* Branding shown on mobile only */}
            <div className="mb-7 flex items-center justify-center gap-3 lg:hidden">
              <div className="relative h-9 w-9">
                <div className="absolute left-0 top-0 h-8 w-8 rounded-lg border-2 border-violet-500 bg-violet-500/10" />
                <div className="absolute left-1 top-1 h-8 w-8 rounded-lg border-2 border-indigo-400/50 bg-indigo-500/10" />
              </div>
              <span className="text-xl font-bold text-slate-900">ShipIN</span>
            </div>

            <h1 className="mb-1 text-2xl font-bold text-slate-900">
              Sign in
            </h1>

            <p className="mb-8 text-sm text-slate-600">
              Welcome back! Please sign in to continue.
            </p>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-[rgba(16,17,23,0.08)] bg-white/55 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white/80 disabled:pointer-events-none disabled:opacity-50"
              style={{
                boxShadow:
                  "inset 1px 2px 5px rgba(16,17,23,0.05), inset -1px -1px 3px rgba(255,255,255,0.9)",
              }}
            >
              {googleLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              ) : (
                <svg
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {googleLoading ? "Signing in…" : "Continue with Google"}
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form
              onSubmit={handleEmailLogin}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5 text-left">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-slate-700"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="hello@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(16,17,23,0.08)] bg-white/55 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400/60 focus:border-violet-400 focus:bg-white/80 focus:ring-[3px] focus:ring-violet-500/15"
                  style={{
                    boxShadow:
                      "inset 1px 2px 5px rgba(16,17,23,0.05), inset -1px -1px 3px rgba(255,255,255,0.8)",
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5 text-left">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      toast.info(
                        "If you need to reset your password, contact support."
                      )
                    }
                    className="text-xs font-medium text-violet-600 hover:text-violet-700"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(16,17,23,0.08)] bg-white/55 px-4 py-3 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400/60 focus:border-violet-400 focus:bg-white/80 focus:ring-[3px] focus:ring-violet-500/15"
                    style={{
                      boxShadow:
                        "inset 1px 2px 5px rgba(16,17,23,0.05), inset -1px -1px 3px rgba(255,255,255,0.8)",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={emailLoading}
                className="mt-1 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition hover:bg-violet-700 hover:shadow-[0_4px_20px_rgba(124,58,237,0.45)] disabled:pointer-events-none disabled:opacity-60"
              >
                {emailLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in…
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link
                href="/"
                className="font-medium text-violet-600 hover:text-violet-700"
              >
                Sign up
              </Link>
            </p>

            <p className="mt-8 text-center text-xs text-slate-400">
              <Link href="/" className="hover:underline">
                © ShipIN
              </Link>
              {" · "}
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
              {" · "}
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}