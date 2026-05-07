import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a native binary; keep it external so webpack /
  // turbopack don't try to bundle it.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
