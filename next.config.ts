import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Strict Mode to prevent WebGPU texture destruction on mount
  reactStrictMode: false, 
  
  // ... any other config you already have
};

export default nextConfig;