"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { authMultipartHeaders } from "@/lib/api";

export interface AudioRecordModalProps {
  assetId: string;
  onClose: () => void;
  /** Called after a successful POST to `/api/upload` with the returned `url`. */
  onSaved: (url: string) => void;
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Modal: record microphone audio → replay → save via the same `/api/upload` route as file upload.
 */
export function AudioRecordModal({ assetId, onClose, onSaved }: AudioRecordModalProps) {
  const [phase, setPhase] = useState<"idle" | "recording" | "recorded">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanupStreams = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRecorderRef.current = null;
    stopTracks(streamRef.current);
    streamRef.current = null;
    chunksRef.current = [];
  }, []);

  const revokePreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(
    () => () => {
      cleanupStreams();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    [cleanupStreams]
  );

  const startRecording = async () => {
    setError(null);
    revokePreview();
    blobRef.current = null;
    setPhase("idle");
    cleanupStreams();
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pickMime = (): string | undefined => {
        for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
          if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return undefined;
      };
      const mime = pickMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stopTracks(streamRef.current);
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
        setPhase("recorded");
      };

      mr.start();
      setPhase("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not access microphone");
      setPhase("idle");
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") mr.stop();
  };

  const replay = () => {
    const el = audioRef.current;
    if (!el || !previewUrl) return;
    el.pause();
    el.src = previewUrl;
    el.currentTime = 0;
    el.play().catch(() => {});
  };

  const recordAgain = () => {
    blobRef.current = null;
    revokePreview();
    setPhase("idle");
  };

  const handleSave = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setSaving(true);
    setError(null);
    try {
      const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `record-${assetId.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`, {
        type: blob.type || "audio/webm",
      });
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: authMultipartHeaders(),
        body: fd,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      if (!data.url) throw new Error("No URL returned");
      onSaved(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-audio-record-modal=""
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="audio-record-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="audio-record-modal-title" className="text-lg font-semibold text-slate-900">
          Record audio
        </h2>
        <p className="mt-1 font-mono text-xs text-slate-500">{assetId}</p>

        <div className="mt-6 flex min-h-[140px] flex-col items-center justify-center gap-4">
          {phase === "idle" && (
            <button
              type="button"
              onClick={startRecording}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-red-700"
              aria-label="Start recording"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          )}

          {phase === "recording" && (
            <>
              <p className="text-sm font-medium text-red-600">Recording…</p>
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-full bg-slate-800 px-6 py-3 text-sm font-medium text-white hover:bg-slate-900"
              >
                Stop
              </button>
            </>
          )}

          {phase === "recorded" && previewUrl && (
            <div className="flex w-full flex-col items-center gap-3">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio ref={audioRef} src={previewUrl} className="hidden" />
              <button
                type="button"
                onClick={replay}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Replay
              </button>
              <button type="button" onClick={recordAgain} className="text-sm text-slate-600 underline hover:text-slate-900">
                Record again
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={phase !== "recorded" || saving}
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
