"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authMultipartHeaders } from "@/lib/api";
import { genAssetId, isDataUrl } from "@/lib/asset-utils";
import { AudioRecordModal } from "@/components/AudioRecordModal";

/** Mark portaled new-asset UI so AssetSelect’s document listener ignores pointer events there. */
const ASSET_SELECT_NEW_MODAL_ATTR = "data-asset-select-new-modal";

const NEW_ASSET_PROMPT_REQUIRED_MSG = "Enter a description (prompt) for this asset.";

function extFromDataUrl(url: string): string | null {
  const m = /^data:([^;,]+)/i.exec(url);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("x-m4a")) return "m4a";
  return null;
}

function extFromHttpUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url, "https://example.com").pathname;
    const dot = path.lastIndexOf(".");
    if (dot >= 0) {
      const ext = path
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (ext.length >= 2 && ext.length <= 8) return ext;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function formatSuffixForAsset(url: string, kind: "image" | "audio"): string {
  const trimmed = url.trim();
  if (!trimmed) return kind === "image" ? "png" : "mp3";
  if (isDataUrl(trimmed)) {
    const e = extFromDataUrl(trimmed);
    if (e) return e;
  }
  const fb = kind === "image" ? "png" : "mp3";
  if (/^https?:/i.test(trimmed)) return extFromHttpUrl(trimmed, fb);
  return fb;
}

function sanitizeFilenameSegment(s: string): string {
  const t = s
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return t || "untitled";
}

function buildAssetDownloadFilename(id: string, prompt: string, url: string, kind: "image" | "audio"): string {
  const suffix = formatSuffixForAsset(url, kind);
  const p = sanitizeFilenameSegment(prompt || "untitled");
  const safeId = id.replace(/[/\\?%*:|"<>]/g, "_");
  return `${safeId}-${p}.${suffix}`;
}

async function triggerAssetDownload(opt: AssetSelectItem, kind: "image" | "audio"): Promise<void> {
  const url = opt.url?.trim();
  if (!url) return;
  const filename = buildAssetDownloadFilename(opt.id, opt.prompt, url, kind);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className ?? "h-4 w-4"}>
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  );
}

export interface AssetSelectItem {
  id: string;
  prompt: string;
  url: string;
}

export interface AssetSelectProps {
  type: "image" | "audio";
  value: string | undefined;
  options: AssetSelectItem[];
  onChange: (id: string | undefined) => void;
  /** When false, hide the “New asset” control. Pair with `disabled` when the field is read-only. */
  allowAddAsset?: boolean;
  /** Disables the dropdown; add is hidden. */
  disabled?: boolean;
  /** Required for the add flow — persist the new asset, then selection updates to its id. */
  onCreateAsset?: (asset: AssetSelectItem) => void;
}

function AudioInlinePlay({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  const toggle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el || !url) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!url) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      toggle(e);
    }
  };

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={url || undefined} onEnded={() => setPlaying(false)} />
      <span
        role="button"
        tabIndex={url ? 0 : -1}
        aria-disabled={!url}
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause" : "Play"}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={`shrink-0 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 ${!url ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
      >
        {playing ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5zM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M7 4a3 3 0 0 1 6 0v6a3 3 0 1 1-6 0V4z" />
            <path d="M5.5 9.643a.75.75 0 0 0-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-1.5v-1.546A6.001 6.001 0 0 0 16 10v-.357a.75.75 0 0 0-1.5 0V10a4.5 4.5 0 0 1-9 0v-.357z" />
          </svg>
        )}
      </span>
    </>
  );
}

function NewAssetModal({
  open,
  assetKind,
  existingIds,
  onClose,
  onComplete,
}: {
  open: boolean;
  assetKind: "image" | "audio";
  existingIds: string[];
  onClose: () => void;
  onComplete: (asset: AssetSelectItem) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [assetId, setAssetId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prefix = assetKind === "image" ? "img" : "aud";
    setAssetId(genAssetId(prefix, existingIds));
    setPrompt("");
    setUrl("");
    setError(null);
    setUploading(false);
    setRecordOpen(false);
  }, [open, assetKind, existingIds]);

  const accept = assetKind === "image" ? "image/*" : "audio/*";

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
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
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handlePick = () => fileRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  };

  const handleCreate = () => {
    if (!url.trim()) return;
    const p = prompt.trim();
    if (!p) {
      setError(NEW_ASSET_PROMPT_REQUIRED_MSG);
      return;
    }
    setError(null);
    onComplete({ id: assetId, prompt: p, url: url.trim() });
    onClose();
  };

  const canCreate = Boolean(url.trim() && prompt.trim() && !uploading);

  if (!open || typeof document === "undefined") return null;

  const title = assetKind === "image" ? "New image asset" : "New audio asset";

  const modal = (
    <>
      <div
        {...{ [ASSET_SELECT_NEW_MODAL_ATTR]: "" }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && !uploading && onClose()}
      >
        <div
          className="flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          role="dialog"
          aria-labelledby="new-asset-title"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id="new-asset-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{assetId}</p>

          <label className="mt-4 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              Prompt / description{" "}
              <span className="font-normal text-red-600" title="Required when creating a new asset">
                (required)
              </span>
            </span>
            <span className="text-xs font-normal text-slate-500">
              Shown in dropdowns and editors; optional in raw JSON, but required here when adding.
            </span>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError((prev) => (prev === NEW_ASSET_PROMPT_REQUIRED_MSG ? null : prev));
              }}
              rows={2}
              required
              aria-required
              placeholder="Short description of this asset…"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>

          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={handlePick}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload file"}
            </button>
            {assetKind === "audio" && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => setRecordOpen(true)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                Record
              </button>
            )}
          </div>

          {assetKind === "image" && url ? (
            <div className="mt-4 flex justify-center">
              <img src={url} alt="" className="max-h-40 rounded border border-slate-200 object-contain" />
            </div>
          ) : null}
          {assetKind === "audio" && url ? (
            <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={url} className="w-full" />
            </div>
          ) : null}

          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          {!url ? (
            <p className="mt-2 text-xs text-slate-500">Upload or record to attach media before creating.</p>
          ) : !prompt.trim() ? (
            <p className="mt-2 text-xs text-amber-800">Add a description (prompt) above, then create.</p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={handleCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create & select
            </button>
          </div>
        </div>
      </div>

      {assetKind === "audio" && recordOpen && (
        <AudioRecordModal
          assetId={assetId}
          onClose={() => setRecordOpen(false)}
          onSaved={(u) => {
            setUrl(u);
            setRecordOpen(false);
          }}
        />
      )}
    </>
  );

  return createPortal(modal, document.body);
}

export function AssetSelect({
  type,
  value,
  options,
  onChange,
  allowAddAsset = false,
  disabled = false,
  onCreateAsset,
}: AssetSelectProps) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element) {
        if (t.closest(`[${ASSET_SELECT_NEW_MODAL_ATTR}]`)) return;
        if (t.closest("[data-audio-record-modal]")) return;
      }
      if (ref.current && !ref.current.contains(t as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.id === value);
  const showAdd = allowAddAsset && !disabled && Boolean(onCreateAsset);

  const handleCreated = (asset: AssetSelectItem) => {
    onCreateAsset?.(asset);
    onChange(asset.id);
  };

  const MicIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400">
      <path d="M7 4a3 3 0 0 1 6 0v6a3 3 0 1 1-6 0V4z" />
      <path d="M5.5 9.643a.75.75 0 0 0-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0-1.5h-1.5v-1.546A6.001 6.001 0 0 0 16 10v-.357a.75.75 0 0 0-1.5 0V10a4.5 4.5 0 0 1-9 0v-.357z" />
    </svg>
  );

  return (
    <div ref={ref} className="flex min-w-0 items-stretch gap-2">
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={`flex w-full items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1 text-left text-sm hover:bg-slate-50 ${
            disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""
          }`}
        >
          {selected ? (
            <>
              {type === "image" && (
                <img src={selected.url || undefined} alt="" className="h-5 w-5 shrink-0 rounded bg-slate-100 object-cover" />
              )}
              {type === "audio" && <MicIcon />}
              <span className="flex-1 truncate text-slate-700">{selected.prompt || selected.id}</span>
              <span className="shrink-0 font-mono text-xs text-slate-400">{selected.id}</span>
            </>
          ) : (
            <span className="flex-1 text-slate-400">— none —</span>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {open && !disabled && (
          <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="flex w-full items-center px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-50"
            >
              — none —
            </button>
            {options.map((opt) => (
              <div
                key={opt.id}
                className="flex w-full min-w-0 items-center gap-1 px-1 py-0.5 hover:bg-blue-50"
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-sm"
                >
                  {type === "image" && (
                    <img src={opt.url || undefined} alt="" className="h-7 w-7 shrink-0 rounded bg-slate-100 object-cover" />
                  )}
                  {type === "audio" && <AudioInlinePlay url={opt.url} />}
                  <span className="min-w-0 flex-1 truncate text-slate-700">{opt.prompt || opt.id}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">{opt.id}</span>
                </button>
                <button
                  type="button"
                  title="Download file"
                  disabled={!opt.url?.trim()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void triggerAssetDownload(opt, type);
                  }}
                  className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Download ${opt.id}`}
                >
                  <DownloadIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd ? (
        <button
          type="button"
          title="New asset"
          onClick={() => {
            setOpen(false);
            setCreateOpen(true);
          }}
          className="shrink-0 rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          New
        </button>
      ) : null}

      <NewAssetModal
        open={createOpen}
        assetKind={type}
        existingIds={options.map((o) => o.id)}
        onClose={() => setCreateOpen(false)}
        onComplete={handleCreated}
      />
    </div>
  );
}
