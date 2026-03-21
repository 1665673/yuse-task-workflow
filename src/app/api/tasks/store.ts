import { readFileSync } from "fs";
import path from "path";

export type TaskStatus = "draft" | "pending_review" | "production";

export interface TaskRecord {
  id: string;
  title: string;
  language: string;
  status: TaskStatus;
  createdAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

/**
 * In-memory task store keyed by task ID.
 * Attached to `globalThis` so that Next.js HMR module re-evaluations during
 * development do not wipe tasks that were added at runtime.
 * TODO: replace with real MongoDB driver when backend is ready.
 */
declare global {
  // eslint-disable-next-line no-var
  var __taskStore: Map<string, TaskRecord> | undefined;
}

if (!globalThis.__taskStore) {
  globalThis.__taskStore = new Map<string, TaskRecord>();
  seedStore(globalThis.__taskStore);
}

const taskStore = globalThis.__taskStore;

function seedStore(store: Map<string, TaskRecord>) {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "test",
      "yuse-task-sample.v4.8.json"
    );
    const raw = readFileSync(filePath, "utf-8");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = JSON.parse(raw) as Record<string, any>;
    const id = task.id as string;
    if (id && !store.has(id)) {
      store.set(id, {
        id,
        title: (task.title as string) ?? "Untitled",
        language:
          task.taskModelLanguage === "en"
            ? "English"
            : (task.taskModelLanguage as string),
        status: "pending_review",
        createdAt: new Date("2026-02-12T15:31:20").toISOString(),
        data: task,
      });
    }
  } catch (err) {
    console.error("[task-store] Failed to seed sample task:", err);
  }
}

export { taskStore };
