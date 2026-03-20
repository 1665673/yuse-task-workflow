import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/upload
 *
 * Accepts a multipart form-data payload with a single "file" field.
 * When the real storage backend is ready, replace the body of this handler
 * with a call to that service and return its public access URL instead.
 *
 * For now, converts the uploaded file to a data URL and returns it so the
 * frontend can round-trip the asset without a real backend.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    // TODO: replace with real backend upload and return the public URL
    return NextResponse.json({ url: dataUrl });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
