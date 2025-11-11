import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // Read file into a Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure /public/uploads exists
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    // Make a unique filename
    const ext = (file.name?.split(".").pop() || "png").toLowerCase();
    const filename = `${Date.now()}-${randomUUID()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);

    // Write file
    await fs.writeFile(filepath, buffer);

    // Public URL (because it's in /public)
    const url = `/uploads/${filename}`;

    return NextResponse.json({ url }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
