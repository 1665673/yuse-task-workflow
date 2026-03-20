import { NextRequest, NextResponse } from "next/server";
import { taskStore } from "../store";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/tasks/[id] — return full task JSON */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const record = taskStore.get(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(record.data);
}

/** PUT /api/tasks/[id] — replace task JSON, update title in record */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const record = taskStore.get(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await request.json()) as Record<string, any>;
    taskStore.set(id, {
      ...record,
      title: (data.title as string) ?? record.title,
      data,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

/** DELETE /api/tasks/[id] — remove task from store */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!taskStore.has(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  taskStore.delete(id);
  return NextResponse.json({ ok: true });
}
