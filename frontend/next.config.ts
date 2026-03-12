import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// On GitHub Pages, project sites live at /<repo-name>/
// Set NEXT_PUBLIC_BASE_PATH in the Actions workflow if your repo name changes.
const basePath = isProd ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  output: "export",      // Static HTML export — no Node.js server needed
  trailingSlash: true,   // /trip/abc/ instead of /trip/abc  (GH Pages friendly)
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
    ],
  },
};

export default nextConfig;
