import { NextRequest, NextResponse } from "next/server";
import { taskStore, TaskRecord, TaskStatus } from "./store";

/** GET /api/tasks — return summary list of all tasks */
export async function GET() {
  const rows = Array.from(taskStore.values()).map((r) => ({
    id: r.id,
    title: r.title,
    language: r.language,
    status: r.status,
    createdAt: r.createdAt,
  }));
  return NextResponse.json(rows);
}

/** POST /api/tasks — create a new task record */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<TaskRecord>;
    const id = (body.id as string) || `task-${Date.now()}`;
    const record: TaskRecord = {
      id,
      title: body.title ?? "Untitled",
      language: body.language ?? "English",
      status: (body.status as TaskStatus) ?? "draft",
      createdAt: body.createdAt ?? new Date().toISOString(),
      data: body.data ?? { id, title: body.title ?? "Untitled", version: "4.8" },
    };
    taskStore.set(id, record);
    return NextResponse.json(record, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
