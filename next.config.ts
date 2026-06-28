import type { NextConfig } from "next";

const apiInternal = process.env.API_INTERNAL_URL || "http://go-api:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  compress: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternal}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Allow Tauri webview and same origin to frame the app
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' tauri://localhost tauri://rnv.renace.tech",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

