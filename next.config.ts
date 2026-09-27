import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  poweredByHeader: false,
};

export default nextConfig;
