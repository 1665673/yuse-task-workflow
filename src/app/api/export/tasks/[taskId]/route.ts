import { NextResponse } from "next/server";
import { toClientTaskExportV1 } from "@/lib/taskExport/toClientV1";

function backendBase(): string {
  return process.env.BACKEND_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
}

/**
 * GET /api/export/tasks/:taskId — client v1 task JSON (adaptation runs in Next.js).
 * Fetches opaque storage from the API server, then adapts in this route.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
): Promise<NextResponse> {
  const { taskId } = await context.params;
  if (!taskId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res = await fetch(`${backendBase()}/api/tasks/${encodeURIComponent(taskId)}/storage`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: "Upstream task fetch failed" }, { status: 502 });
  }

  const doc = (await res.json()) as {
    taskId: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    data: Record<string, unknown>;
  };

  const payload = toClientTaskExportV1({
    data: doc.data,
    taskMeta: {
      taskId: doc.taskId,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
  });

  return NextResponse.json(payload);
}
