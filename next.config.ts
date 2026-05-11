import type { NextConfig } from "next";

// Static-export build for nginx hosting under /hilo/ alongside other RGS games.
// `npm run build` produces ./out, which is what gets served.
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/hilo",
  assetPrefix: "/hilo",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
