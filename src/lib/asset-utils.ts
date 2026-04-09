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
