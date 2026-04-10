/**
 * Origin of the Express API (no trailing slash).
 *
 * - **Development** (`next dev`): defaults to `http://127.0.0.1:4000`.
 * - **Production** (`next build` / `next start`): set **`BACKEND_URL`** or **`NEXT_PUBLIC_BACKEND_URL`**
 *   to your deployed API, e.g. `https://api.example.com`. Next rewrites and server routes read this at build/runtime.
 */

export function getBackendBaseUrl(): string {
  const raw = process.env.BACKEND_URL?.trim() || process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BACKEND_URL or NEXT_PUBLIC_BACKEND_URL must be set to your API origin in production (e.g. https://api.example.com). See demo/.env.example."
    );
  }
  return "http://127.0.0.1:4000";
}
