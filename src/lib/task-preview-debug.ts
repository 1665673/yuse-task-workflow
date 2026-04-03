/**
 * Short console hints for /tasks/[id] — filter DevTools by "[yuse task preview]".
 */

const TAG = "[yuse task preview]";

function summarizeTaskLike(value: unknown): string {
  if (value == null) return "null";
  if (typeof value !== "object") return typeof value;
  const o = value as Record<string, unknown>;
  const id = o.id != null ? String(o.id) : "?";
  const phases = Array.isArray(o.phases) ? o.phases.length : "?";
  return `id=${id} phases=${phases}`;
}

export function logTaskPreviewFetch(
  context: string,
  payload: {
    routeTaskId?: string;
    requestUrl?: string;
    status?: number;
    ok?: boolean;
    raw?: unknown;
    normalized?: unknown;
  }
): void {
  const bits: string[] = [context];
  if (payload.routeTaskId != null) bits.push(`route=${payload.routeTaskId}`);
  if (payload.requestUrl != null) bits.push(payload.requestUrl);
  if (payload.status != null) bits.push(`status=${payload.status}`, `ok=${String(payload.ok)}`);
  if (payload.raw !== undefined) bits.push(`raw(${summarizeTaskLike(payload.raw)})`);
  if (payload.normalized !== undefined) {
    bits.push(
      payload.normalized === null ? "normalized=null" : `normalized(${summarizeTaskLike(payload.normalized)})`
    );
  }
  console.warn(TAG, bits.join(" · "));
}

export function logTaskPreviewFlattenError(task: unknown, err: unknown): void {
  console.error(TAG, "flattenTaskFlow:", err, "|", summarizeTaskLike(task));
}
