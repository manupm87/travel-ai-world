import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// Production is served from the domain root (S3 + CloudFront, ADR 0009). Only CI's
// PR build still sets NEXT_PUBLIC_BASE_PATH, a leftover of the GitHub Pages era.
const basePath = isProd ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  output: "export",      // Static HTML export — no Node.js server needed
  trailingSlash: true,   // /plan/ is plan/index.html: CloudFront's index function and nginx serve it
  basePath,
  images: {
    // next/image optimisation requires a server; for static export we skip it.
    // Images are still lazy-loaded and sized correctly — just not resized server-side.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
