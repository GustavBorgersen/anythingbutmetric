import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent SSR crashes from react-force-graph-2d's transitive canvas import
  serverExternalPackages: ["canvas"],
  turbopack: {},
};

export default nextConfig;
