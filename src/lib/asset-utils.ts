/** Stable random ids for image/audio assets (matches task editor convention). */
export function genAssetId(prefix: string, existing: string[]): string {
  let id: string;
  do {
    id = `${prefix}_${Math.random().toString(16).slice(2, 12).padEnd(10, "0")}`;
  } while (existing.includes(id));
  return id;
}

export function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

/**
 * Stored task assets should use same-origin paths `/uploads/...` (see Next rewrite → API).
 * Older tasks may contain absolute dev URLs like `http://localhost:4000/uploads/...`; strip to the path.
 */
export function publicAssetUrl(url: string): string {
  const t = url.trim();
  if (!t || isDataUrl(t) || t.startsWith("blob:")) return t;
  if (t.startsWith("/")) return t;
  try {
    const u = new URL(t);
    if (u.pathname.startsWith("/uploads/")) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return t;
}
