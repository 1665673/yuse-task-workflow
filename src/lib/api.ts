/** Stored JWT for API calls (set by admin login / register). */
export const AUTH_TOKEN_KEY = "yuse_auth_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

/** Headers for authenticated JSON requests. */
export function authJsonHeaders(): HeadersInit {
  const t = getStoredToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** Optional auth (e.g. upload) — sends Bearer if present. */
export function authOptionalHeaders(): HeadersInit {
  const t = getStoredToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

/** Multipart upload: only Bearer (do not set Content-Type). */
export function authMultipartHeaders(): HeadersInit {
  return authOptionalHeaders();
}
