import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "/upgrader",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://upgrader_backend:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
