import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "test",
      "yuse-task-sample.v4.8.json"
    );
    const content = await readFile(filePath, "utf-8");
    const task = JSON.parse(content);
    return NextResponse.json(task);
  } catch (error) {
    console.error("Failed to load task:", error);
    return NextResponse.json(
      { error: "Failed to load task" },
      { status: 500 }
    );
  }
}
