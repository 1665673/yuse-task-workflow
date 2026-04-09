import type { NextConfig } from "next";

/** Proxy /api/* to the Express backend (see /backend). Override with BACKEND_URL in demo/.env.local */
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/edit", destination: "/admin", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
