import type { NextConfig } from "next";
import { getBackendBaseUrl } from "./src/lib/backend-url";

/** Proxy selected /api/* paths to the Express backend. `getBackendBaseUrl()` reads BACKEND_URL (required in production).
 *  Do NOT proxy /api/export/* — those are Next.js Route Handlers (e.g. task export v1). */

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/edit", destination: "/admin", permanent: false }];
  },
  async rewrites() {
    const b = getBackendBaseUrl();
    return [
      { source: "/api/auth/:path*", destination: `${b}/api/auth/:path*` },
      { source: "/api/tasks", destination: `${b}/api/tasks` },
      { source: "/api/tasks/:path*", destination: `${b}/api/tasks/:path*` },
      { source: "/api/upload", destination: `${b}/api/upload` },
      { source: "/api/task", destination: `${b}/api/task` },
      { source: "/uploads/:path*", destination: `${b}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
