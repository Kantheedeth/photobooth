"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

type ApiError = { error: string };
type UploadOk = { url: string };
type UploadResp = ApiError | UploadOk;

const PRESETS = [
  {
    label: "Gov / Civil Service",
    text:
      "Formal Thai government ID photo. Black suit jacket, white dress shirt, conservative tie; neat short haircut. Keep same face/identity. Plain blue background, even lighting.",
  },
  {
    label: "Corporate",
    text:
      "Corporate headshot. Dark blazer, white shirt, neutral light-gray background. Clean flyaway hair; keep same face/identity; natural skin tone.",
  },
  {
    label: "Student ID",
    text:
      "Student ID photo. White collared shirt, tidy hair, plain white background. Keep same face/identity and proportions.",
  },
];

// Safe JSON parse without `any`
async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Type guard helpers
function isApiError(x: unknown): x is ApiError {
  return typeof x === "object" && x !== null && "error" in x;
}
function isUploadOk(x: unknown): x is UploadOk {
  return typeof x === "object" && x !== null && "url" in x;
}

export default function PhotoboothTest() {
  const [file, setFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState(PRESETS[0].text);
  const [loading, setLoading] = useState<"upload" | "edit" | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local preview for the chosen file
  const inputPreview = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  async function saveLocally() {
    if (!file) return;
    setLoading("upload");
    setError(null);
    setResultUrl(null);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/photobooth/upload", { method: "POST", body: form });
    const data = await safeJson<UploadResp>(res);

    if (!res.ok) {
      setError(isApiError(data) ? data.error : "Upload failed");
      setLoading(null);
      return;
    }

    if (isUploadOk(data)) {
      setResultUrl(data.url); // e.g., /uploads/xxxxx.png
    } else {
      setError("Upload failed");
    }
    setLoading(null);
  }

  async function editWithGemini() {
    if (!file) return;
    setLoading("edit");
    setError(null);
    setResultUrl(null);

    const form = new FormData();
    form.append("file", file);
    form.append("instruction", instruction);

    const res = await fetch("/api/photobooth/edit", { method: "POST", body: form });
    if (!res.ok) {
      const data = await safeJson<ApiError>(res);
      setError(data?.error ?? "Edit failed (check your /api/photobooth/edit backend)");
      setLoading(null);
      return;
    }

    // Response is raw image bytes -> blob -> object URL
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setResultUrl(url);
    setLoading(null);
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Photobooth • Upload & Edit</h1>

      {/* Step 1: Pick an image */}
      <section className="space-y-3">
        <p className="text-sm opacity-80">1) Choose a photo</p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {inputPreview && (
          <div className="mt-2 relative w-full max-w-xl aspect-[4/3]">
            <p className="text-sm opacity-80 mb-1">Preview (input)</p>
            <div className="relative w-full h-full rounded-lg overflow-hidden">
              <Image
                src={inputPreview}
                alt="input preview"
                fill
                // Using object URL or /uploads works fine; unoptimized avoids domain config.
                unoptimized
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-contain bg-black/5"
              />
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Prompt / instruction */}
      <section className="space-y-3">
        <p className="text-sm opacity-80">2) Prompt / Instruction</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setInstruction(p.text)}
              className="rounded-full border border-white/20 px-3 py-1 text-sm hover:bg-white/10"
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          className="w-full min-h-28 rounded bg-black/10 p-3"
          placeholder="Describe how to edit the image…"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
      </section>

      {/* Step 3: Actions */}
      <section className="flex flex-wrap gap-3">
        <button
          onClick={saveLocally}
          disabled={!file || !!loading}
          className="rounded bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-50"
        >
          {loading === "upload" ? "Saving…" : "Save locally"}
        </button>

        <button
          onClick={editWithGemini}
          disabled={!file || !!loading}
          className="rounded bg-indigo-500/20 px-4 py-2 hover:bg-indigo-500/30 disabled:opacity-50"
          title="Calls /api/photobooth/edit"
        >
          {loading === "edit" ? "Editing…" : "Edit with Gemini"}
        </button>
      </section>

      {/* Result + errors */}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {resultUrl && (
        <section className="space-y-2">
          <p className="text-sm opacity-80">Result</p>
          <div className="relative w-full max-w-xl aspect-[4/3]">
            <div className="relative w-full h-full rounded-lg overflow-hidden">
              <Image
                src={resultUrl}
                alt="result"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-contain bg-black/5"
              />
            </div>
          </div>

          {/* If resultUrl is /uploads/xxx, this will download that file */}
          <a
            href={resultUrl}
            download
            className="text-sm underline opacity-80 hover:opacity-100"
          >
            Download
          </a>
        </section>
      )}
    </main>
  );
}
