import { NextResponse } from "next/server";
import taskSample from "@/data/task-sample.json";

/**
 * Serves the sample task. The JSON is imported so it's bundled at build time,
 * which is required for serverless (e.g. Vercel / v0.dev) where the filesystem
 * may not include public/ at runtime.
 */
export async function GET() {
  try {
    return NextResponse.json(taskSample);
  } catch (error) {
    console.error("Failed to load task:", error);
    return NextResponse.json(
      { error: "Failed to load task" },
      { status: 500 }
    );
  }
}
