/** Next.js config: a static export with trailing slashes and unoptimised images. */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,   // /plan/ is plan/index.html: CloudFront's index function and nginx serve it
  images: {
    // next/image optimisation needs a server, which a static export doesn't have
    unoptimized: true,
  },
};

export default nextConfig;
