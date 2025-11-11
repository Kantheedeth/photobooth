// src/app/api/photobooth/edit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// If you run on Edge, Buffer isn't available. Force Node runtime to be safe.
export const runtime = "nodejs";

async function fileToBase64(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

// A tiny helper type for parts that may contain image bytes
type InlineImagePart = {
  inlineData?: {
    mimeType?: string;
    data?: string; // base64
  };
  text?: string;
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const instruction = String(form.get("instruction") ?? "");

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (!instruction) {
      return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const base64 = await fileToBase64(file);

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: file.type || "image/jpeg",
                data: base64,
              },
            },
            { text: instruction },
          ],
        },
      ],
    });

    // Make TypeScript happy: treat parts as InlineImagePart[]
    const parts = (response.candidates?.[0]?.content?.parts ?? []) as InlineImagePart[];

    // Find the first returned image
    const imgPart = parts.find((p) => p.inlineData?.data !== undefined);

    if (!imgPart?.inlineData?.data) {
      return NextResponse.json(
        { error: "No image returned from model" },
        { status: 502 }
      );
    }

    const outBase64 = imgPart.inlineData.data;
    const bytes = Buffer.from(outBase64, "base64");

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": imgPart.inlineData.mimeType || "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
