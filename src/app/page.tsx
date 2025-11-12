"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type ApiError = { error: string };

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
      "Student ID photo. collared shirt, tidy hair, plain white background. Keep same face/identity and proportions.",
  },
];

const PRESET_GRADIENTS = [
  "from-[#5f8bff] to-[#3168ff]",
  "from-[#b15cff] to-[#7c3aed]",
  "from-[#3dd8a5] to-[#04a777]",
  "from-[#f7a24b] to-[#ef6c00]",
];

const CARD_SHELL =
  "rounded-[28px] border border-[#e3e9ff] bg-white/95 backdrop-blur-sm shadow-[0_30px_70px_rgba(29,53,87,0.08)]";
const PANEL_SHELL = "rounded-2xl border border-[#e4e9ff] bg-[#f6f8ff]";
const ACCENT_BUTTON =
  "rounded-2xl border border-transparent bg-gradient-to-r from-[#5f6bff] to-[#8f59f6] text-white shadow-[0_18px_40px_rgba(109,122,255,0.45)]";
const FRAME_DIMENSIONS = "mx-auto w-full max-w-lg aspect-[4/3]";

// Safe JSON parse without `any`
async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function PhotoboothTest() {
  const [file, setFile] = useState<File | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [loading, setLoading] = useState<"edit" | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCountingDown, setIsCountingDown] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const instruction = PRESETS[presetIndex].text;

  // Local preview for the chosen file
  const inputPreview = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const fileSizeLabel = useMemo(() => {
    if (!file) return null;
    if (file.size < 1024) return `${file.size} B`;
    if (file.size < 1024 * 1024) return `${(file.size / 1024).toFixed(1)} KB`;
    return `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  }, [file]);

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

  const renderPreview = (src: string, label: string) => (
    <div className={`relative ${FRAME_DIMENSIONS} overflow-hidden rounded-3xl border border-[#dfe4ff] bg-[#f5f7ff]`}>
      <Image
        src={src}
        alt={label}
        fill
        // Using camera capture, so no need for Next image optimization.
        unoptimized
        sizes="(max-width: 768px) 100vw, 640px"
        className="object-contain bg-[#eef1ff]"
      />
    </div>
  );

  const requestCamera = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera not supported in this environment.");
      return;
    }

    if (streamRef.current) {
      setCameraError(null);
      setCameraActive(true);
      return;
    }

    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err) {
      console.error(err);
      setCameraError("Unable to access camera. Check permissions.");
    }
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      cleanupCamera();
    } else {
      await requestCamera();
    }
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = (evt: ChangeEvent<HTMLInputElement>) => {
    const selected = evt.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResultUrl(null);
    setError(null);
  };

  const cleanupCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(
    () => () => {
      cleanupCamera();
      if (countdownTimer.current) {
        window.clearInterval(countdownTimer.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!cameraActive || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [cameraActive]);

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1024;
    const height = video.videoHeight || 768;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("Unable to capture photo.");
      return;
    }
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setCameraError("Failed to read camera frame.");
      return;
    }

    const capturedFile = new File([blob], `photobooth-${Date.now()}.png`, {
      type: "image/png",
    });
    setFile(capturedFile);
    setResultUrl(null);
    setError(null);
  };

  const startCountdown = () => {
    if (!streamRef.current || !videoRef.current) {
      setCameraError("Enable the camera first.");
      return;
    }

    if (isCountingDown) return;

    if (countdownTimer.current) {
      window.clearInterval(countdownTimer.current);
    }

    setIsCountingDown(true);
    setCountdown(5);

    countdownTimer.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (!prev) return prev;
        if (prev <= 1) {
          if (countdownTimer.current) {
            window.clearInterval(countdownTimer.current);
            countdownTimer.current = null;
          }
          setIsCountingDown(false);
          setCountdown(null);
          captureFrame();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen text-[#11172e]">
      <main className="mx-auto max-w-6xl px-4 py-12 space-y-10 sm:px-8">
        <header className={`${CARD_SHELL} p-8`}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#5061a6]">
                <span className="rounded-full border border-[#d9e0ff] px-3 py-1">Dev Sandbox</span>
                <span className="rounded-full border border-[#d9e0ff] px-3 py-1 text-[#4c5fff]">Live Iteration</span>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-[#8da0d7]">AI Photobooth</p>
                <h1 className="mt-2 text-3xl font-semibold text-[#0f172a] sm:text-4xl">Photobooth Edit Lab</h1>
                <p className="mt-3 max-w-2xl text-base text-[#4d5b83]">
                  Pick the preset that matches your purpose—we will handle lighting, background, and framing
                  automatically.
                </p>
              </div>
            </div>
            <div className="grid w-full gap-4 sm:grid-cols-3 lg:w-auto lg:grid-cols-1">
              {["Upload", "Prompt", "Render"].map((label) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[#dee5ff] bg-[#f7f8ff] px-4 py-3 text-center"
                >
                  <p className="text-[11px] uppercase tracking-[0.35em] text-[#93a5dc]">Step</p>
                  <p className="text-2xl font-semibold text-[#1a2445]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.05fr,0.95fr]">
          <section className="space-y-8">
            <div className={`${CARD_SHELL} p-6`}>
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-[#6d7bb8]">
                <span>Camera capture</span>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    cameraActive
                      ? "border-[#7d8bff] text-[#4f5fff]"
                      : "border-[#d7defc] text-[#7d8bb4]"
                  }`}
                >
                  {cameraActive ? "Live" : "Offline"}
                </span>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-[#0f172a]">Take a fresh portrait</h2>
              <p className="mt-1 text-sm text-[#5a6592]">
                Allow browser camera access, wait for the countdown, and we will capture a still for the workflow.
              </p>

              <div
                className={`mt-6 relative ${FRAME_DIMENSIONS} overflow-hidden rounded-3xl transition-all ${
                  cameraActive
                    ? "border border-transparent bg-transparent"
                    : "border border-[#dbe4ff] bg-[#eef2ff] px-4 py-4 sm:px-8"
                }`}
              >
                {cameraActive ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="h-full w-full object-contain [transform:scaleX(-1)]"
                    />
                    {countdown && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#000]/35 text-5xl font-semibold text-white">
                        {countdown}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-center text-[#7a89c4]">
                    <p className="text-base font-medium text-[#263261]">Camera is off</p>
                    <p className="text-sm text-[#5b6aa4]">Grant permission to preview yourself.</p>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={toggleCamera}
                  className="w-full rounded-2xl border border-[#dfe4ff] bg-white px-4 py-3 text-center text-sm font-semibold text-[#1f2a4f] transition hover:border-[#c8d1ff]"
                >
                  {cameraActive ? "Turn off camera" : "Enable camera"}
                </button>
                <button
                  type="button"
                  onClick={startCountdown}
                  disabled={!cameraActive || isCountingDown}
                  className={`${ACCENT_BUTTON} w-full px-4 py-3 text-center text-sm font-semibold transition enabled:hover:opacity-95 disabled:opacity-40`}
                >
                  {isCountingDown ? "Capturing…" : "Capture photo"}
                </button>
                <button
                  type="button"
                  onClick={triggerFilePicker}
                  className="w-full rounded-2xl border border-[#dfe4ff] bg-white px-4 py-3 text-center text-sm font-semibold text-[#1f2a4f] transition hover:border-[#c8d1ff]"
                >
                  Import from files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onFileSelected}
                />
              </div>

              <div className="mt-4 text-xs text-[#6975a3]">
                {file
                  ? `Latest capture: ${file.name} (${fileSizeLabel ?? "photo"})`
                  : "Captured photo preview will appear in the Live preview panel."}
              </div>

              {cameraError && <p className="mt-3 text-sm text-[#e24870]">{cameraError}</p>}
            </div>

            <div className={`${CARD_SHELL} p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6d7bb8]">Wardrobe</p>
                  <h3 className="text-xl font-semibold text-[#0f172a]">Choose a preset look</h3>
                </div>
                <span className="rounded-full border border-[#dee5ff] px-3 py-1 text-xs text-[#5d6aa0]">
                  Prompt handled server-side
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {PRESETS.map((p, idx) => {
                  const gradient = PRESET_GRADIENTS[idx % PRESET_GRADIENTS.length];
                  const active = presetIndex === idx;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setPresetIndex(idx)}
                      className={`w-full rounded-2xl border px-1 py-1 transition ${
                        active ? "border-transparent shadow-[0_15px_30px_rgba(94,107,255,0.25)]" : "border-[#e3e8ff]"
                      }`}
                    >
                      <div
                        className={`rounded-[18px] px-4 py-4 text-center text-sm font-semibold ${
                          active
                            ? `bg-gradient-to-br ${gradient} text-white`
                            : "bg-white text-[#1f2a4f]"
                        }`}
                      >
                        {p.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  onClick={editWithGemini}
                  disabled={!file || !!loading}
                  title="Calls /api/photobooth/edit"
                  className={`relative w-full max-w-xs overflow-hidden px-6 py-4 text-center text-sm font-semibold transition enabled:hover:opacity-95 disabled:opacity-40 ${ACCENT_BUTTON}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-base font-semibold text-white">Generate Photo</p>
                    <span className="text-xs text-white/80">AI edit preview</span>
                    {loading === "edit" ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <span className="text-xs text-white/90">⚡️ Ready</span>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-8">
            <div className={`${CARD_SHELL} p-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6d7bb8]">Workflow status</p>
                  <h3 className="text-xl font-semibold text-[#0f172a]">Live preview</h3>
                </div>
                {error && (
                  <span className="rounded-full border border-[#ff9ab0] bg-[#ffe1e8] px-3 py-1 text-xs text-[#7f1d38]">
                    {error}
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-5">
                <div className={`${PANEL_SHELL} p-4`}>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6d7bb8]">Input</p>
                  {inputPreview ? (
                    <div className="mt-3 space-y-3">
                      {renderPreview(inputPreview, "camera capture preview")}
                      <p className="text-sm text-[#536190]">Latest still captured from the camera feed.</p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className={`relative ${FRAME_DIMENSIONS} rounded-3xl border border-dashed border-[#dfe4ff] bg-[#f5f7ff]`} />
                      <p className="text-sm text-[#6d7bb8]">Capture a photo to unlock the preview.</p>
                    </div>
                  )}
                </div>

                <div className={`${PANEL_SHELL} p-5 text-center`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6d7bb8]">Result</p>
                    {resultUrl && (
                      <a
                        href={resultUrl}
                        download
                        className="text-xs font-semibold text-[#5160ff] underline-offset-4 hover:underline"
                      >
                        Download
                      </a>
                    )}
                  </div>

                  {resultUrl ? (
                    <div className="mt-4 space-y-4">
                      {renderPreview(resultUrl, "result preview")}
                      <p className="text-sm text-[#536190]">Gemini processed output.</p>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={editWithGemini}
                          disabled={!file || !!loading}
                          className={`${ACCENT_BUTTON} px-4 py-2 text-sm font-semibold transition enabled:hover:opacity-95 disabled:opacity-40`}
                        >
                          {loading === "edit" ? "Regenerating…" : "Regenerate"}
                        </button>
                        <button
                          type="button"
                          onClick={triggerFilePicker}
                          className="rounded-2xl border border-[#dfe4ff] bg-white px-4 py-2 text-sm font-semibold text-[#1f2a4f] transition hover:border-[#c8d1ff]"
                        >
                          Upload new file
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className={`relative ${FRAME_DIMENSIONS} rounded-3xl border border-dashed border-[#dfe4ff] bg-[#f5f7ff]`} />
                      <p className="text-sm text-[#6d7bb8]">
                        Run &ldquo;Generate Photo&rdquo; to render and compare the output.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
