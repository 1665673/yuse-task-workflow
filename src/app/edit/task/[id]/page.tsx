"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type {
  Question,
  TaskPackage,
  Phase,
  Step,
  Dialogue,
  DialogueTurn,
  Phase1EntryStep,
  Phase2WarmupStep,
  Phase3WordsStep,
  Phase3PhrasesStep,
  Phase3SentencesStep,
  Phase4SubtasksStep,
  Phase5WordsStep,
  Phase5PhrasesStep,
  Phase5SentencesStep,
  Phase6RoleplayStep,
} from "@/lib/types";
import {
  appendTaskAsset,
  ensurePhase4SubtaskIds,
  newPhase4DistractorOptionId,
  newPhase4SubtaskId,
  syncDialogueSubtaskIdsFromPhase4,
  syncPhase6RoleplayDifficultiesFromDialogues,
} from "@/lib/task-utils";
import { authJsonHeaders, authMultipartHeaders } from "@/lib/api";
import { normalizeTaskPackage } from "@/lib/normalize-task-package";
import { AudioRecordModal } from "@/components/AudioRecordModal";
import { AssetSelect, type AssetSelectItem } from "@/components/AssetSelect";
import { genAssetId, isDataUrl } from "@/lib/asset-utils";

type TabKey =
  | "info"
  | "assets"
  | "tlts"
  | "dialogues"
  | "phase1"
  | "phase2"
  | "phase3"
  | "subtask_learning"
  | "reinforcement"
  | "roleplay";

function findPhase(task: TaskPackage | null, type: string): { phase: Phase | null; index: number } {
  if (!task) return { phase: null, index: -1 };
  const index = task.phases.findIndex((p) => p.type === type);
  return { phase: index >= 0 ? task.phases[index] : null, index };
}

// ── Target-language mode context & helpers ────────────────────────────────────

interface TargetLangCtx {
  isTargetMode: boolean;
  targetLanguage: string;
  /** Flat dict: { [originalText]: translation } — the sole output of target-language mode. */
  translations: Record<string, string>;
  setTranslation: (key: string, value: string) => void;
}

const TargetLangContext = createContext<TargetLangCtx>({
  isTargetMode: false,
  targetLanguage: "",
  translations: {},
  setTranslation: () => {},
});

interface TLInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  className?: string;
}

/**
 * In target-language mode: shows the original text (from `value`) in a grey box,
 * then renders a separate input driven by the translations dict.
 * The `value` prop serves as both the display original AND the dict key.
 * Outside target mode it is a plain <input>.
 */
function TLInput({ className, ...props }: TLInputProps) {
  const { isTargetMode, translations, setTranslation } = useContext(TargetLangContext);
  const base = `rounded border border-slate-300 px-2 py-1 text-sm ${className ?? ""}`;
  if (!isTargetMode) return <input className={base} {...props} />;

  const key = typeof props.value === "string" ? props.value : "";
  if (!key) return <input className={base} {...props} disabled />;
  return (
    <div className="flex flex-col gap-1">
      <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-400 select-none">
        {key}
      </span>
      <input
        className={base}
        type={props.type}
        placeholder="Translation…"
        value={translations[key] ?? ""}
        onChange={(e) => setTranslation(key, e.target.value)}
      />
    </div>
  );
}

interface TLTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  className?: string;
}

/** Same semantics as TLInput but for <textarea>. */
function TLTextarea({ className, ...props }: TLTextareaProps) {
  const { isTargetMode, translations, setTranslation } = useContext(TargetLangContext);
  const base = `rounded border border-slate-300 px-2 py-1 text-sm ${className ?? ""}`;
  if (!isTargetMode) return <textarea className={base} {...props} />;

  const key = typeof props.value === "string" ? props.value : "";
  if (!key) return <textarea className={base} {...props} disabled />;
  return (
    <div className="flex flex-col gap-1">
      <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-400 whitespace-pre-wrap select-none">
        {key}
      </span>
      <textarea
        className={base}
        rows={props.rows}
        placeholder="Translation…"
        value={translations[key] ?? ""}
        onChange={(e) => setTranslation(key, e.target.value)}
      />
    </div>
  );
}

// ── Shared asset types & helpers ─────────────────────────────────────────────

function taskImageAssets(task: TaskPackage): AssetSelectItem[] {
  return Object.entries(task.taskModel.assets.images ?? {}).map(([id, a]) => ({
    id,
    prompt: a.prompt ?? "",
    url: a.url ?? "",
  }));
}

function taskAudioAssets(task: TaskPackage): AssetSelectItem[] {
  return Object.entries(task.taskModel.assets.audios ?? {}).map(([id, a]) => ({
    id,
    prompt: a.prompt ?? "",
    url: a.url ?? "",
  }));
}

// ── Question Editor Components ────────────────────────────────────────────────

interface QuestionListEditorProps {
  questions: Question[];
  onChange: (next: Question[]) => void;
  imageAssets: AssetSelectItem[];
  audioAssets: AssetSelectItem[];
  onCreateImageAsset: (asset: AssetSelectItem) => void;
  onCreateAudioAsset: (asset: AssetSelectItem) => void;
}

function QuestionListEditor({
  questions,
  onChange,
  imageAssets,
  audioAssets,
  onCreateImageAsset,
  onCreateAudioAsset,
}: QuestionListEditorProps) {
  const { isTargetMode } = useContext(TargetLangContext);
  const updateQuestion = (idx: number, next: Question) => {
    const copy = [...questions];
    copy[idx] = next;
    onChange(copy);
  };

  const removeQuestion = (idx: number) => onChange(questions.filter((_, i) => i !== idx));

  const addQuestion = () => {
    onChange([...questions, { type: "text_text", stem: { text: "" }, options: [{ text: "" }], correctOptionIndexes: [0] }]);
  };

  const changeType = (idx: number, newType: Question["type"]) => {
    const q = questions[idx];
    let stem = { ...q.stem };
    let options = q.options.map((o) => ({ ...o }));
    if (newType === "audio_text") {
      stem = { audioAssetId: stem.audioAssetId };
      options = options.map((o) => ({ text: o.text ?? "", explanation: o.explanation }));
    } else {
      stem = { text: stem.text ?? "" };
      if (newType === "text_image") {
        options = options.map((o) => ({ imageAssetId: o.imageAssetId, explanation: o.explanation }));
      } else {
        options = options.map((o) => ({ text: o.text ?? "", explanation: o.explanation }));
      }
    }
    updateQuestion(idx, { ...q, type: newType, stem, options });
  };

  return (
    <div className="space-y-4">
      {questions.map((q, idx) => (
        <div key={idx} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-800">Question {idx + 1}</p>
            {!isTargetMode && (
              <button type="button" onClick={() => removeQuestion(idx)} className="text-sm text-red-600 hover:underline">
                Remove
              </button>
            )}
          </div>

          {/* Type + Guidance */}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Type</span>
              <select
                value={q.type}
                disabled={isTargetMode}
                onChange={(e) => changeType(idx, e.target.value as Question["type"])}
                className="rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="text_text">Stem as text, Options as text</option>
                <option value="text_image">Stem as text, Options as image</option>
                <option value="text_cloze">Stem as text, Options as text (cloze)</option>
                <option value="audio_text">Stem as audio, Options as text</option>
              </select>
            </label>
            {/* Guidance fields hidden for now — data preserved */}
            {false && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Guidance purpose (optional)</span>
                  <input
                    type="text"
                    value={q.guidance?.purpose ?? ""}
                    onChange={(e) =>
                      updateQuestion(idx, { ...q, guidance: { ...(q.guidance ?? { description: "" }), purpose: e.target.value } })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="font-medium text-slate-700">Guidance description (optional)</span>
                  <textarea
                    value={q.guidance?.description ?? ""}
                    onChange={(e) =>
                      updateQuestion(idx, { ...q, guidance: { ...(q.guidance ?? { purpose: "" }), description: e.target.value } })
                    }
                    rows={2}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
              </>
            )}
          </div>

          {/* Stem */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">Stem</p>
            {q.type !== "audio_text" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Text</span>
                <TLInput
                  type="text"
                  value={q.stem.text ?? ""}
                  onChange={(e) => updateQuestion(idx, { ...q, stem: { text: e.target.value } })}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Audio asset</span>
                <AssetSelect
                  type="audio"
                  value={q.stem.audioAssetId}
                  options={audioAssets}
                  onChange={(id) => updateQuestion(idx, { ...q, stem: { audioAssetId: id } })}
                  allowAddAsset={!isTargetMode}
                  disabled={isTargetMode}
                  onCreateAsset={onCreateAudioAsset}
                />
              </label>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Options</p>
            {q.options.map((opt, oIdx) => {
              const isCorrect = q.correctOptionIndexes.includes(oIdx);
              const toggleCorrect = () => {
                const set = new Set(q.correctOptionIndexes);
                if (set.has(oIdx)) set.delete(oIdx); else set.add(oIdx);
                updateQuestion(idx, { ...q, correctOptionIndexes: Array.from(set).sort((a, b) => a - b) });
              };
              const updateOpt = (patch: Partial<typeof opt>) => {
                const opts = [...q.options];
                opts[oIdx] = { ...opt, ...patch };
                updateQuestion(idx, { ...q, options: opts });
              };
              const removeOpt = () => {
                const opts = q.options.filter((_, i) => i !== oIdx);
                const newCorrect = q.correctOptionIndexes
                  .filter((ci) => ci !== oIdx)
                  .map((ci) => (ci > oIdx ? ci - 1 : ci));
                updateQuestion(idx, { ...q, options: opts, correctOptionIndexes: newCorrect });
              };
              return (
                <div key={oIdx} className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={isCorrect} onChange={toggleCorrect} disabled={isTargetMode} className="h-4 w-4" />
                      <span className="font-medium text-slate-700">Correct</span>
                    </label>
                    {!isTargetMode && (
                      <button type="button" onClick={removeOpt} className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  {q.type === "text_image" ? (
                    <AssetSelect
                      type="image"
                      value={opt.imageAssetId}
                      options={imageAssets}
                      onChange={(id) => updateOpt({ imageAssetId: id })}
                      allowAddAsset={!isTargetMode}
                      disabled={isTargetMode}
                      onCreateAsset={onCreateImageAsset}
                    />
                  ) : (
                    <TLInput
                      type="text"
                      placeholder="Option text"
                      value={opt.text ?? ""}
                      onChange={(e) => updateOpt({ text: e.target.value })}
                      className="w-full"
                    />
                  )}
                  <input
                    type="text"
                    placeholder="Explanation (optional)"
                    value={opt.explanation ?? ""}
                    onChange={(e) => updateOpt({ explanation: e.target.value || undefined })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
              );
            })}
            {!isTargetMode && (
              <button
                type="button"
                onClick={() => {
                  const newOpt = q.type === "text_image" ? {} : { text: "" };
                  updateQuestion(idx, { ...q, options: [...q.options, newOpt] });
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Add option
              </button>
            )}
          </div>

          {/* Hint */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Hint (optional)</span>
            <TLInput
              type="text"
              value={q.hint ?? ""}
              onChange={(e) => updateQuestion(idx, { ...q, hint: e.target.value || undefined })}
            />
          </label>
        </div>
      ))}

      {!isTargetMode && (
        <button
          type="button"
          onClick={addQuestion}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Add question
        </button>
      )}
    </div>
  );
}

// ── Assets Editor ────────────────────────────────────────────────────────────

function ImagePreview({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);

  if (!url || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-xs text-slate-400">no preview</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}

function AudioPreview({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => setPlaying(false);
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (el) { el.pause(); el.load(); }
    setPlaying(false);
  }, [url]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el || !url) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={url || undefined} />
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        title={playing ? "Pause" : "Play audio"}
        className={`rounded-full p-3 transition-colors ${
          url
            ? "bg-slate-200 hover:bg-slate-300 text-slate-700"
            : "cursor-not-allowed bg-slate-100 text-slate-300"
        }`}
      >
        {playing ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5z" />
            <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5z" />
          </svg>
        )}
      </button>
      {!url && <span className="text-xs text-slate-400">no audio</span>}
    </div>
  );
}

interface AssetSectionProps {
  label: string;
  assetType: "image" | "audio";
  items: AssetSelectItem[];
  onChange: (next: AssetSelectItem[]) => void;
}

function AssetSection({ label, assetType, items, onChange }: AssetSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [recordModalIdx, setRecordModalIdx] = useState<number | null>(null);

  const prefix = assetType === "image" ? "img" : "aud";
  const accept = assetType === "image" ? "image/*" : "audio/*";

  const addItem = () => {
    const id = genAssetId(prefix, items.map((i) => i.id));
    onChange([...items, { id, prompt: "", url: "" }]);
  };

  const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, patch: Partial<AssetSelectItem>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const handleUploadClick = (idx: number) => {
    setUploadingIdx(idx);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingIdx === null) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: authMultipartHeaders(),
        body: fd,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) updateItem(uploadingIdx, { url: data.url });
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploadingIdx(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <p className="font-semibold text-slate-800">{label}</p>
      <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />

      {items.length === 0 && (
        <p className="text-sm italic text-slate-400">No {label.toLowerCase()} yet.</p>
      )}

      {items.map((item, idx) => {
        const isData = isDataUrl(item.url);
        const isUploading = uploadingIdx === idx;
        return (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-400">{item.id}</span>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>

            {/* Body: preview + fields */}
            <div className="flex gap-3">
              {/* Square preview */}
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded border border-slate-200 bg-white">
                {assetType === "image"
                  ? <ImagePreview url={item.url} />
                  : <AudioPreview url={item.url} />}
              </div>

              {/* Fields */}
              <div className="flex flex-1 flex-col gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Prompt</span>
                  <textarea
                    value={item.prompt}
                    onChange={(e) => updateItem(idx, { prompt: e.target.value })}
                    rows={1}
                    placeholder="Describe asset for generation…"
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">URL</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={isData ? "" : item.url}
                      placeholder={isData ? "<data-url>" : "https://…"}
                      disabled={isData}
                      onChange={(e) => updateItem(idx, { url: e.target.value })}
                      className={`flex-1 rounded border px-2 py-1 text-sm ${
                        isData
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-slate-300"
                      }`}
                    />
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => handleUploadClick(idx)}
                      className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploading ? "Uploading…" : "Upload"}
                    </button>
                    {assetType === "audio" && (
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => setRecordModalIdx(idx)}
                        className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Record
                      </button>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addItem}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add {assetType}
      </button>

      {assetType === "audio" && recordModalIdx !== null && items[recordModalIdx] != null && (
        <AudioRecordModal
          assetId={items[recordModalIdx].id}
          onClose={() => setRecordModalIdx(null)}
          onSaved={(url) => {
            updateItem(recordModalIdx, { url });
            setRecordModalIdx(null);
          }}
        />
      )}
    </div>
  );
}

function AssetsEditor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { isTargetMode } = useContext(TargetLangContext);
  const { assets } = task.taskModel;

  const toItems = (dict: Record<string, { prompt?: string; url?: string }>): AssetSelectItem[] =>
    Object.entries(dict).map(([id, a]) => ({ id, prompt: a.prompt ?? "", url: a.url ?? "" }));

  const toDict = (items: AssetSelectItem[]): Record<string, { prompt?: string; url?: string }> =>
    Object.fromEntries(
      items.map(({ id, prompt, url }) => [
        id,
        {
          ...(prompt ? { prompt } : {}),
          ...(url ? { url } : {}),
        },
      ])
    );

  const imagesArr = toItems(assets.images ?? {});
  const audiosArr = toItems(assets.audios ?? {});

  const updateImages = (next: AssetSelectItem[]) =>
    setTask({
      ...task,
      taskModel: { ...task.taskModel, assets: { ...assets, images: toDict(next) } },
    });

  const updateAudios = (next: AssetSelectItem[]) =>
    setTask({
      ...task,
      taskModel: { ...task.taskModel, assets: { ...assets, audios: toDict(next) } },
    });

  if (isTargetMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
            <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" clipRule="evenodd" />
          </svg>
          Assets are view-only in target language mode.
        </div>
        <div className="pointer-events-none opacity-60 space-y-8">
          <AssetSection label="Images" assetType="image" items={imagesArr} onChange={() => {}} />
          <hr className="border-slate-200" />
          <AssetSection label="Audios" assetType="audio" items={audiosArr} onChange={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AssetSection label="Images" assetType="image" items={imagesArr} onChange={updateImages} />
      <hr className="border-slate-200" />
      <AssetSection label="Audios" assetType="audio" items={audiosArr} onChange={updateAudios} />
    </div>
  );
}

// ── TLTS Editor ──────────────────────────────────────────────────────────────

interface TltItem {
  id: string;
  text: string;
}

function genTltId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

interface TltSectionProps {
  label: string;
  items: TltItem[];
  prefix: string;
  onChange: (next: TltItem[]) => void;
}

function TltSection({ label, items, prefix, onChange }: TltSectionProps) {
  const addItem = () => {
    const id = genTltId(prefix, items.map((i) => i.id));
    onChange([...items, { id, text: "" }]);
  };

  const updateItem = (idx: number, text: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], text };
    onChange(next);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const singular = label.slice(0, -1).toLowerCase();

  return (
    <div className="space-y-3">
      <p className="font-semibold text-slate-800">{label}</p>
      {items.length === 0 && (
        <p className="text-sm italic text-slate-400">No {label.toLowerCase()} yet.</p>
      )}
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs text-slate-400">{idx + 1}.</span>
          <input
            type="text"
            value={item.text}
            onChange={(e) => updateItem(idx, e.target.value)}
            placeholder={`Enter ${singular}…`}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => removeItem(idx)}
            className="text-sm text-red-600 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add {singular}
      </button>
    </div>
  );
}

function TltsEditor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { tlts } = task.taskModel;

  const wordsArr: TltItem[] = Object.entries(tlts.words).map(([id, text]) => ({ id, text }));
  const phrasesArr: TltItem[] = Object.entries(tlts.phrases).map(([id, text]) => ({ id, text }));
  const sentencesArr: TltItem[] = Object.entries(tlts.sentences).map(([id, text]) => ({ id, text }));

  const toDict = (items: TltItem[]) => Object.fromEntries(items.map(({ id, text }) => [id, text]));

  const updateWords = (next: TltItem[]) =>
    setTask({ ...task, taskModel: { ...task.taskModel, tlts: { ...tlts, words: toDict(next) } } });

  const updatePhrases = (next: TltItem[]) =>
    setTask({ ...task, taskModel: { ...task.taskModel, tlts: { ...tlts, phrases: toDict(next) } } });

  const updateSentences = (next: TltItem[]) =>
    setTask({ ...task, taskModel: { ...task.taskModel, tlts: { ...tlts, sentences: toDict(next) } } });

  return (
    <div className="space-y-8">
      <TltSection label="Words" items={wordsArr} prefix="w" onChange={updateWords} />
      <hr className="border-slate-200" />
      <TltSection label="Phrases" items={phrasesArr} prefix="p" onChange={updatePhrases} />
      <hr className="border-slate-200" />
      <TltSection label="Sentences" items={sentencesArr} prefix="s" onChange={updateSentences} />
    </div>
  );
}

function dialoguesEditorRoleId(r: { id?: string }, index: number): string {
  const t = r.id?.trim();
  return t || `role-${index + 1}`;
}

function DialoguesEditor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { isTargetMode } = useContext(TargetLangContext);
  const dialogues = task.taskModel.dialogues ?? [];
  const audios = taskAudioAssets(task);
  const roles = task.taskModel.roles ?? [];
  const roleIds = roles.map((r, i) => dialoguesEditorRoleId(r, i));
  const defaultRoleId = roles.length ? dialoguesEditorRoleId(roles[0], 0) : "user";

  const setDialogues = (next: Dialogue[]) => {
    setTask({ ...task, taskModel: { ...task.taskModel, dialogues: next } });
  };

  const normalizeDialogueDifficulty = (d: Dialogue): Dialogue =>
    d.scope === "full_task" ? d : { ...d, difficulty: undefined };

  const updateDialogue = (i: number, d: Dialogue) => {
    const next = [...dialogues];
    next[i] = normalizeDialogueDifficulty(d);
    setDialogues(next);
  };

  const addDialogue = () => {
    setDialogues([
      ...dialogues,
      {
        id: `dlg_${Date.now()}`,
        scope: "subtask",
        turns: [{ role: defaultRoleId, text: "" }],
      },
    ]);
  };

  const removeDialogue = (i: number) => {
    setDialogues(dialogues.filter((_, j) => j !== i));
  };

  const updateTurn = (dialogueIndex: number, turnIndex: number, turn: DialogueTurn) => {
    const d = dialogues[dialogueIndex];
    const turns = [...d.turns];
    turns[turnIndex] = turn;
    updateDialogue(dialogueIndex, { ...d, turns });
  };

  const addTurn = (dialogueIndex: number) => {
    const d = dialogues[dialogueIndex];
    updateDialogue(dialogueIndex, {
      ...d,
      turns: [...d.turns, { role: defaultRoleId, text: "" }],
    });
  };

  const removeTurn = (dialogueIndex: number, turnIndex: number) => {
    const d = dialogues[dialogueIndex];
    updateDialogue(dialogueIndex, {
      ...d,
      turns: d.turns.filter((_, j) => j !== turnIndex),
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Dialogues are referenced by id from Phase 4 (subtasks) and Phase 6 (roleplay). Edit lines and audio assets here;
        add or remove whole dialogues and turns as needed.
      </p>
      {dialogues.length === 0 && (
        <p className="text-sm italic text-slate-400">No dialogues yet. Add one to attach subtask or roleplay flows.</p>
      )}
      {dialogues.map((dlg, di) => (
        <div key={dlg.id} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-800">Dialogue {di + 1}</p>
            <button
              type="button"
              onClick={() => removeDialogue(di)}
              className="text-sm text-red-600 hover:underline"
            >
              Remove dialogue
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm min-w-0">
              <span className="font-medium text-slate-700">Id</span>
              <input
                type="text"
                value={dlg.id}
                onChange={(e) => updateDialogue(di, { ...dlg, id: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 font-mono text-sm w-full"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm min-w-0">
              <span className="font-medium text-slate-700">Scope</span>
              <select
                value={dlg.scope === "full_task" ? "full_task" : "subtask"}
                onChange={(e) => {
                  const scope = e.target.value as "subtask" | "full_task";
                  updateDialogue(di, {
                    ...dlg,
                    scope,
                    ...(scope === "subtask" ? { difficulty: undefined } : {}),
                  });
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm w-full"
              >
                <option value="subtask">For Subtask</option>
                <option value="full_task">For Full Dialogue</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm min-w-0">
              <span
                className={`font-medium ${dlg.scope === "full_task" ? "text-slate-700" : "text-slate-400"}`}
              >
                Difficulty
              </span>
              <select
                disabled={dlg.scope !== "full_task"}
                value={
                  dlg.scope === "full_task" &&
                  (dlg.difficulty === "a" || dlg.difficulty === "b" || dlg.difficulty === "c")
                    ? dlg.difficulty
                    : ""
                }
                onChange={(e) =>
                  updateDialogue(di, {
                    ...dlg,
                    difficulty: e.target.value ? (e.target.value as "a" | "b" | "c") : undefined,
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-sm w-full font-mono disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 bg-white"
              >
                <option value="">—</option>
                <option value="a">a</option>
                <option value="b">b</option>
                <option value="c">c</option>
              </select>
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Turns</p>
            {dlg.turns.length === 0 && (
              <p className="text-sm text-slate-500">No turns — add at least one line of dialogue.</p>
            )}
            {dlg.turns.map((turn, ti) => (
              <div
                key={ti}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-start md:gap-3"
              >
                <span className="shrink-0 pt-2 text-xs text-slate-400 md:w-6">{ti + 1}.</span>
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Role</span>
                    {roles.length === 0 ? (
                      <p className="text-xs text-amber-700">Add roles under Info (task model) to choose speaker roles.</p>
                    ) : null}
                    <select
                      value={roleIds.includes(turn.role) ? turn.role : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) updateTurn(di, ti, { ...turn, role: v });
                      }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    >
                      <option value="">— Select role —</option>
                      {roles.map((r, ri) => {
                        const id = dialoguesEditorRoleId(r, ri);
                        return (
                          <option key={id} value={id}>
                            {r.title}
                          </option>
                        );
                      })}
                    </select>
                    {turn.role && !roleIds.includes(turn.role) ? (
                      <span className="text-xs text-amber-700">
                        Current id &quot;{turn.role}&quot; does not match any role — pick a role above.
                      </span>
                    ) : null}
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    <span className="font-medium text-slate-700">Text</span>
                    <TLInput
                      value={turn.text}
                      onChange={(e) => updateTurn(di, ti, { ...turn, text: e.target.value })}
                      className="w-full"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-3">
                    <span className="font-medium text-slate-700">Audio asset</span>
                    <AssetSelect
                      type="audio"
                      value={turn.audioAssetId}
                      options={audios}
                      onChange={(id) => updateTurn(di, ti, { ...turn, audioAssetId: id })}
                      allowAddAsset={!isTargetMode}
                      disabled={isTargetMode}
                      onCreateAsset={(a) => setTask(appendTaskAsset(task, "audio", a))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeTurn(di, ti)}
                  className="shrink-0 text-sm text-red-600 hover:underline md:pt-2"
                >
                  Remove turn
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addTurn(di)}
              className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add turn
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addDialogue}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add dialogue
      </button>
    </div>
  );
}

function Phase1Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { isTargetMode } = useContext(TargetLangContext);
  const { phase, index } = findPhase(task, "phase1");
  if (!phase) return <p className="text-sm text-slate-500">Phase "phase1" not found.</p>;
  const step = phase.steps[0] as Phase1EntryStep | undefined;
  if (!step) return <p className="text-sm text-slate-500">No steps in phase1.</p>;

  const updateStep = (next: Phase1EntryStep) => {
    const phases = [...task.phases];
    const steps = [...phase.steps];
    steps[0] = next;
    phases[index] = { ...phase, steps };
    setTask({ ...task, phases });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Thumbnail</span>
          <AssetSelect
            type="image"
            value={step.thumbnail}
            options={taskImageAssets(task)}
            onChange={(id) => updateStep({ ...step, thumbnail: id })}
            allowAddAsset={!isTargetMode}
            disabled={isTargetMode}
            onCreateAsset={(a) => setTask(appendTaskAsset(task, "image", a))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Task purpose</span>
          <TLTextarea
            value={step.guidance?.purpose ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { description: "" }), purpose: e.target.value },
              })
            }
            rows={3}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Task description</span>
          <TLTextarea
            value={step.guidance?.description ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { purpose: "" }), description: e.target.value },
              })
            }
            rows={3}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Button text</span>
          <TLInput
            type="text"
            value={step.callToActionText}
            onChange={(e) => updateStep({ ...step, callToActionText: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

function Phase2Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { phase, index } = findPhase(task, "phase2");
  if (!phase) return <p className="text-sm text-slate-500">Phase "phase2" not found.</p>;
  const step = phase.steps[0] as Phase2WarmupStep | undefined;
  if (!step) return <p className="text-sm text-slate-500">No steps in phase2.</p>;

  const updateStep = (next: Phase2WarmupStep) => {
    const phases = [...task.phases];
    const steps = [...phase.steps];
    steps[0] = next;
    phases[index] = { ...phase, steps };
    setTask({ ...task, phases });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Step guidance purpose</span>
          <TLInput
            type="text"
            value={step.guidance?.purpose ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { description: "" }), purpose: e.target.value },
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Step guidance description</span>
          <TLTextarea
            value={step.guidance?.description ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { purpose: "" }), description: e.target.value },
              })
            }
            rows={3}
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="font-medium text-slate-800">Warmup questions</p>
        <QuestionListEditor
          questions={step.warmupQuestions ?? []}
          onChange={(next) => updateStep({ ...step, warmupQuestions: next })}
          imageAssets={taskImageAssets(task)}
          audioAssets={taskAudioAssets(task)}
          onCreateImageAsset={(a) => setTask(appendTaskAsset(task, "image", a))}
          onCreateAudioAsset={(a) => setTask(appendTaskAsset(task, "audio", a))}
        />
      </div>
    </div>
  );
}

function Phase3Editor({
  task,
  setTask,
  onCreateImageAsset: onCreateImageProp,
  onCreateAudioAsset: onCreateAudioProp,
}: {
  task: TaskPackage;
  setTask: (t: TaskPackage) => void;
  /** When embedding Phase 3 UI (e.g. phase 5), attach new assets to the real task */
  onCreateImageAsset?: (a: AssetSelectItem) => void;
  onCreateAudioAsset?: (a: AssetSelectItem) => void;
}) {
  const { phase, index } = findPhase(task, "phase3");
  if (!phase) return <p className="text-sm text-slate-500">Phase "phase3" not found.</p>;

  const onCreateImageAsset = onCreateImageProp ?? ((a: AssetSelectItem) => setTask(appendTaskAsset(task, "image", a)));
  const onCreateAudioAsset = onCreateAudioProp ?? ((a: AssetSelectItem) => setTask(appendTaskAsset(task, "audio", a)));

  const updatePhase = (nextPhase: Phase) => {
    const phases = [...task.phases];
    phases[index] = nextPhase;
    setTask({ ...task, phases });
  };

  const updateStepAt = <T extends Phase3WordsStep | Phase3PhrasesStep | Phase3SentencesStep>(
    stepIndex: number,
    nextStep: T
  ) => {
    const steps = [...phase.steps];
    steps[stepIndex] = nextStep;
    updatePhase({ ...phase, steps });
  };

  const wordsStep = phase.steps.find((s) => s.type === "phase3_words") as Phase3WordsStep | undefined;
  const phrasesStep = phase.steps.find((s) => s.type === "phase3_phrases") as Phase3PhrasesStep | undefined;
  const sentencesStep = phase.steps.find((s) => s.type === "phase3_sentences") as Phase3SentencesStep | undefined;

  const renderGroupedQuestions = (
    label: string,
    map: Record<string, Question[]>,
    onChange: (next: Record<string, Question[]>) => void
  ) => {
    const entries = Object.entries(map);
    const addKey = () => {
      let i = 1;
      let key: string;
      do {
        key = `id_${i}`;
        i += 1;
      } while (map[key]);
      onChange({ ...map, [key]: [] });
    };
    const updateKey = (oldKey: string, newKey: string) => {
      if (!newKey || newKey === oldKey || map[newKey]) return;
      const next: Record<string, Question[]> = {};
      for (const [k, v] of Object.entries(map)) {
        next[k === oldKey ? newKey : k] = v;
      }
      onChange(next);
    };
    const updateQuestionsForKey = (key: string, qs: Question[]) => {
      onChange({ ...map, [key]: qs });
    };
    const removeKey = (key: string) => {
      const next: Record<string, Question[]> = {};
      for (const [k, v] of Object.entries(map)) {
        if (k !== key) next[k] = v;
      }
      onChange(next);
    };

    return (
      <div className="space-y-3">
        <p className="font-medium text-slate-800">{label}</p>
        {entries.map(([key, qs]) => (
          <div key={key} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Item ID</span>
                <input
                  type="text"
                  value={key}
                  onChange={(e) => updateKey(key, e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => removeKey(key)}
                className="text-sm text-red-600 hover:underline"
              >
                Remove item
              </button>
            </div>
            <QuestionListEditor
              questions={qs}
              onChange={(nextQs) => updateQuestionsForKey(key, nextQs)}
              imageAssets={taskImageAssets(task)}
              audioAssets={taskAudioAssets(task)}
              onCreateImageAsset={onCreateImageAsset}
              onCreateAudioAsset={onCreateAudioAsset}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addKey}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Add item
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {wordsStep && (
        <div className="space-y-3">
          {renderGroupedQuestions(
            "Word questions",
            wordsStep.wordQuestions ?? {},
            (next) =>
              updateStepAt(
                phase.steps.findIndex((s) => s.type === "phase3_words"),
                { ...wordsStep, wordQuestions: next }
              )
          )}
        </div>
      )}
      {phrasesStep && (
        <div className="space-y-3">
          {renderGroupedQuestions(
            "Phrase questions",
            phrasesStep.phraseQuestions ?? {},
            (next) =>
              updateStepAt(
                phase.steps.findIndex((s) => s.type === "phase3_phrases"),
                { ...phrasesStep, phraseQuestions: next }
              )
          )}
        </div>
      )}
      {sentencesStep && (
        <div className="space-y-3">
          {renderGroupedQuestions(
            "Sentence questions",
            sentencesStep.sentenceQuestions ?? {},
            (next) =>
              updateStepAt(
                phase.steps.findIndex((s) => s.type === "phase3_sentences"),
                { ...sentencesStep, sentenceQuestions: next }
              )
          )}
        </div>
      )}
    </div>
  );
}

/** Plus-in-circle — add this dialogue turn to distractor editing. */
function Phase4AddTurnIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Phase4Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { phase, index } = findPhase(task, "subtask_learning");
  if (!phase) return <p className="text-sm text-slate-500">Phase \"subtask_learning\" not found.</p>;
  const step = phase.steps.find((s) => s.type === "phase4_subtasks") as Phase4SubtasksStep | undefined;
  if (!step) return <p className="text-sm text-slate-500">No phase4_subtasks step found.</p>;

  const updateStep = (next: Phase4SubtasksStep) => {
    const withIds = { ...next, subtasks: ensurePhase4SubtaskIds(next.subtasks ?? []) };
    const phases = [...task.phases];
    const steps = [...phase.steps];
    const idx = steps.findIndex((s) => s.type === "phase4_subtasks");
    steps[idx] = withIds;
    phases[index] = { ...phase, steps };
    setTask(syncDialogueSubtaskIdsFromPhase4({ ...task, phases }));
  };

  useEffect(() => {
    const sub = step.subtasks ?? [];
    if (sub.every((s) => s.subtaskId.trim())) return;
    const ensured = ensurePhase4SubtaskIds(sub);
    if (JSON.stringify(ensured) === JSON.stringify(sub)) return;
    const phases = [...task.phases];
    const steps = [...phase.steps];
    const idx = steps.findIndex((s) => s.type === "phase4_subtasks");
    if (idx === -1) return;
    steps[idx] = { ...step, subtasks: ensured };
    phases[index] = { ...phase, steps };
    setTask(syncDialogueSubtaskIdsFromPhase4({ ...task, phases }));
  }, [task, phase, index, step]);

  const subtasks = step.subtasks ?? [];
  const dialogues = task.taskModel?.dialogues ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Edit subtasks, linked dialogues, allowed roles, and distractor options. For each subtask, the full dialogue is
        shown below; use the + button on a line to attach distractor options to that turn (by turn index).
      </p>

      <div className="space-y-3">
        {subtasks.map((st, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-800">Subtask {i + 1}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500" title="Stored on save; not editable">
                  ID: {st.subtaskId || "…"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = subtasks.filter((_, idx) => idx !== i);
                  updateStep({ ...step, subtasks: next });
                }}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Dialogue</span>
                <select
                  value={st.dialogueId}
                  onChange={(e) => {
                    const next = [...subtasks];
                    next[i] = { ...st, dialogueId: e.target.value };
                    updateStep({ ...step, subtasks: next });
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  <option value="">— Select dialogue —</option>
                  {dialogues.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id}
                      {d.turns?.length != null ? ` (${d.turns.length} turns)` : ""}
                    </option>
                  ))}
                  {st.dialogueId && !dialogues.some((d) => d.id === st.dialogueId) ? (
                    <option value={st.dialogueId}>
                      {st.dialogueId} (not in task model — add dialogue or pick another)
                    </option>
                  ) : null}
                </select>
                {dialogues.length === 0 ? (
                  <span className="text-xs text-amber-700">No dialogues yet. Add them in the Dialogues tab.</span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Allowed roles (comma-separated)</span>
                <input
                  type="text"
                  value={st.allowedRoles.join(", ")}
                  onChange={(e) => {
                    const roles = e.target.value
                      .split(",")
                      .map((r) => r.trim())
                      .filter(Boolean);
                    const next = [...subtasks];
                    next[i] = { ...st, allowedRoles: roles };
                    updateStep({ ...step, subtasks: next });
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            </div>

            {(() => {
              const dlg = dialogues.find((d) => d.id === st.dialogueId);
              const turns = dlg?.turns ?? [];

              if (!st.dialogueId.trim()) {
                return (
                  <p className="text-sm text-slate-500">Select a dialogue above to preview turns and set distractors.</p>
                );
              }
              if (!dlg) {
                return (
                  <p className="text-sm text-amber-700">
                    No dialogue with id &quot;{st.dialogueId}&quot;. Add or fix it in the Dialogues tab,
                    or fix the ID.
                  </p>
                );
              }
              if (turns.length === 0) {
                return <p className="text-sm text-slate-500">This dialogue has no turns.</p>;
              }

              return (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Dialogue — distractor turns</p>
                  <p className="text-xs text-slate-500">
                    Each line is one speak turn (index matches task JSON). Click + to edit distractor options for that
                    turn.
                  </p>
                  <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                    {turns.map((turn, turnIdx) => {
                      const ds = st.dialogDistractors ?? [];
                      const dIdx = ds.findIndex((d) => d.index === turnIdx);
                      const hasDistractor = dIdx >= 0;
                      const d = hasDistractor ? ds[dIdx] : null;

                      return (
                        <div
                          key={turnIdx}
                          className={`rounded-md border bg-white ${hasDistractor ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-100"}`}
                        >
                          <div className="flex items-start gap-2 py-2 pl-2 pr-1">
                            <span
                              className="mt-0.5 w-7 shrink-0 text-right text-xs tabular-nums text-slate-400"
                              title="Turn index"
                            >
                              {turnIdx}
                            </span>
                            <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium uppercase text-slate-600">
                              {turn.role}
                            </span>
                            <span className="min-w-0 flex-1 text-sm leading-snug text-slate-800">{turn.text}</span>
                            {!hasDistractor && (
                              <button
                                type="button"
                                title="Add distractor options for this turn"
                                aria-label={`Add distractor options for turn ${turnIdx}`}
                                onClick={() => {
                                  const cur = st.dialogDistractors ?? [];
                                  if (cur.some((x) => x.index === turnIdx)) return;
                                  const subtasksNext = [...subtasks];
                                  subtasksNext[i] = {
                                    ...st,
                                    dialogDistractors: [...cur, { index: turnIdx, options: [] }],
                                  };
                                  updateStep({ ...step, subtasks: subtasksNext });
                                }}
                                className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                              >
                                <Phase4AddTurnIcon />
                              </button>
                            )}
                          </div>
                          {hasDistractor && d && (
                            <div className="space-y-2 border-t border-slate-100 bg-slate-50/90 p-2 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-slate-600">
                                  Distractor options (turn index {turnIdx})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (st.dialogDistractors ?? []).filter((_, idx) => idx !== dIdx);
                                    const subtasksNext = [...subtasks];
                                    subtasksNext[i] = { ...st, dialogDistractors: next };
                                    updateStep({ ...step, subtasks: subtasksNext });
                                  }}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Remove distractor
                                </button>
                              </div>
                              <div className="space-y-1">
                                {(d.options ?? []).map((o, oIdx) => (
                                  <div key={oIdx} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder="Distractor text"
                                      value={o.text}
                                      onChange={(e) => {
                                        const opts = [...(d.options ?? [])];
                                        const prev = opts[oIdx];
                                        opts[oIdx] = {
                                          ...prev,
                                          id: prev.id?.trim() || newPhase4DistractorOptionId(opts),
                                          text: e.target.value,
                                        };
                                        const dsNext = [...(st.dialogDistractors ?? [])];
                                        dsNext[dIdx] = { ...d, options: opts };
                                        const subtasksNext = [...subtasks];
                                        subtasksNext[i] = { ...st, dialogDistractors: dsNext };
                                        updateStep({ ...step, subtasks: subtasksNext });
                                      }}
                                      className="flex-1 rounded border border-slate-300 px-2 py-1"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const opts = (d.options ?? []).filter((_, idx) => idx !== oIdx);
                                        const dsNext = [...(st.dialogDistractors ?? [])];
                                        dsNext[dIdx] = { ...d, options: opts };
                                        const subtasksNext = [...subtasks];
                                        subtasksNext[i] = { ...st, dialogDistractors: dsNext };
                                        updateStep({ ...step, subtasks: subtasksNext });
                                      }}
                                      className="text-xs text-red-600 hover:underline"
                                    >
                                      Remove option
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const base = d.options ?? [];
                                    const opts = [
                                      ...base,
                                      { id: newPhase4DistractorOptionId(base), text: "" },
                                    ];
                                    const dsNext = [...(st.dialogDistractors ?? [])];
                                    dsNext[dIdx] = { ...d, options: opts };
                                    const subtasksNext = [...subtasks];
                                    subtasksNext[i] = { ...st, dialogDistractors: dsNext };
                                    updateStep({ ...step, subtasks: subtasksNext });
                                  }}
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  Add option
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          const taken = new Set(subtasks.map((s) => s.subtaskId.trim()).filter(Boolean));
          updateStep({
            ...step,
            subtasks: [
              ...subtasks,
              {
                subtaskId: newPhase4SubtaskId(taken),
                allowedRoles: ["user"],
                dialogueId: "",
                dialogDistractors: [],
              },
            ],
          });
        }}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add subtask
      </button>
    </div>
  );
}

function Phase5Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { phase, index } = findPhase(task, "reinforcement");
  if (!phase) return <p className="text-sm text-slate-500">Phase "reinforcement" not found.</p>;

  const updatePhase = (nextPhase: Phase) => {
    const phases = [...task.phases];
    phases[index] = nextPhase;
    setTask({ ...task, phases });
  };

  const findStep = <T,>(type: string) =>
    phase.steps.find((s) => s.type === type) as T | undefined;

  const updateStep = <T extends { type: string }>(type: string, updater: (current: T) => T) => {
    const steps = [...phase.steps];
    const idx = steps.findIndex((s) => s.type === type);
    if (idx === -1) return;
    const current = steps[idx] as unknown as T;
    steps[idx] = updater(current) as unknown as Step;
    updatePhase({ ...phase, steps });
  };

  const wordsStep = findStep<Phase5WordsStep>("phase5_words");
  const phrasesStep = findStep<Phase5PhrasesStep>("phase5_phrases");
  const sentencesStep = findStep<Phase5SentencesStep>("phase5_sentences");

  return (
    <div className="space-y-6">
      {wordsStep && (
        <div className="space-y-3">
          <p className="font-medium text-slate-800">Phase 5 words</p>
          <Phase3Editor
            task={{
              ...task,
              phases: [
                {
                  type: "phase3",
                  steps: [
                    {
                      ...wordsStep,
                      type: "phase3_words",
                    } as unknown as Phase3WordsStep,
                  ],
                } as Phase,
              ],
            }}
            setTask={(nextTask) => {
              const phase3 = nextTask.phases[0];
              const ws = (phase3.steps.find((s) => s.type === "phase3_words") as Phase3WordsStep) ?? wordsStep;
              updateStep<Phase5WordsStep>("phase5_words", () => ({
                ...wordsStep,
                wordQuestions: ws.wordQuestions,
              }));
            }}
            onCreateImageAsset={(a) => setTask(appendTaskAsset(task, "image", a))}
            onCreateAudioAsset={(a) => setTask(appendTaskAsset(task, "audio", a))}
          />
        </div>
      )}

      {phrasesStep && (
        <div className="space-y-3">
          <p className="font-medium text-slate-800">Phase 5 phrase clozes</p>
          <div className="space-y-3">
            {Object.entries(phrasesStep.phraseClozes ?? {}).map(([phraseId, entry], idx) => (
              <div key={phraseId} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Phrase ID</span>
                    <input
                      type="text"
                      value={phraseId}
                      onChange={(e) => {
                        const next: Record<string, typeof entry> = {};
                        for (const [k, v] of Object.entries(phrasesStep.phraseClozes ?? {})) {
                          next[k === phraseId ? e.target.value : k] = v;
                        }
                        updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                          ...cur,
                          phraseClozes: next,
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, typeof entry> = {};
                      for (const [k, v] of Object.entries(phrasesStep.phraseClozes ?? {})) {
                        if (k !== phraseId) next[k] = v;
                      }
                      updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                        ...cur,
                        phraseClozes: next,
                      }));
                    }}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove phrase
                  </button>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Answer</span>
                  <input
                    type="text"
                    value={entry.answer}
                    onChange={(e) => {
                      updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                        ...cur,
                        phraseClozes: {
                          ...(cur.phraseClozes ?? {}),
                          [phraseId]: { ...entry, answer: e.target.value },
                        },
                      }));
                    }}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Text hint</span>
                  <input
                    type="text"
                    value={entry.textHint ?? ""}
                    onChange={(e) => {
                      updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                        ...cur,
                        phraseClozes: {
                          ...(cur.phraseClozes ?? {}),
                          [phraseId]: { ...entry, textHint: e.target.value || undefined },
                        },
                      }));
                    }}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Audio hint asset ID</span>
                  <input
                    type="text"
                    value={entry.audioHint ?? ""}
                    onChange={(e) => {
                      updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                        ...cur,
                        phraseClozes: {
                          ...(cur.phraseClozes ?? {}),
                          [phraseId]: { ...entry, audioHint: e.target.value || undefined },
                        },
                      }));
                    }}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Sentences (one per round)</p>
                  {(entry.sentences ?? []).map((s, sIdx) => (
                    <div key={sIdx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-14">Round {sIdx + 1}</span>
                      <input
                        type="text"
                        value={s}
                        onChange={(e) => {
                          const nextSentences = [...(entry.sentences ?? [])];
                          nextSentences[sIdx] = e.target.value;
                          updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                            ...cur,
                            phraseClozes: {
                              ...(cur.phraseClozes ?? {}),
                              [phraseId]: { ...entry, sentences: nextSentences },
                            },
                          }));
                        }}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextSentences = (entry.sentences ?? []).filter((_, idx) => idx !== sIdx);
                          updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                            ...cur,
                            phraseClozes: {
                              ...(cur.phraseClozes ?? {}),
                              [phraseId]: { ...entry, sentences: nextSentences },
                            },
                          }));
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const nextSentences = [...(entry.sentences ?? []), ""];
                      updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                        ...cur,
                        phraseClozes: {
                          ...(cur.phraseClozes ?? {}),
                          [phraseId]: { ...entry, sentences: nextSentences },
                        },
                      }));
                    }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Add sentence
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const map = phrasesStep.phraseClozes ?? {};
                let i = 1;
                let key: string;
                do {
                  key = `p${i}`;
                  i += 1;
                } while (map[key]);
                updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                  ...cur,
                  phraseClozes: {
                    ...(cur.phraseClozes ?? {}),
                    [key]: { sentences: [""], answer: "" },
                  },
                }));
              }}
              className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add phrase cloze
            </button>
          </div>
        </div>
      )}

      {sentencesStep && (
        <div className="space-y-3">
          <p className="font-medium text-slate-800">Phase 5 sentences</p>
          <div className="space-y-2">
            {(sentencesStep.sentences ?? []).map((s, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-14">#{idx + 1}</span>
                <input
                  type="text"
                  value={s}
                  onChange={(e) =>
                    updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => {
                      const next = [...(cur.sentences ?? [])];
                      next[idx] = e.target.value;
                      return { ...cur, sentences: next };
                    })
                  }
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => ({
                      ...cur,
                      sentences: (cur.sentences ?? []).filter((_, i) => i !== idx),
                    }))
                  }
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => ({
                  ...cur,
                  sentences: [...(cur.sentences ?? []), ""],
                }))
              }
              className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add sentence
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Phase6Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { phase, index } = findPhase(task, "roleplay");
  if (!phase) return <p className="text-sm text-slate-500">Phase \"roleplay\" not found.</p>;
  const step = phase.steps.find((s) => s.type === "phase6_roleplay") as Phase6RoleplayStep | undefined;
  if (!step) return <p className="text-sm text-slate-500">No phase6_roleplay step found.</p>;

  const dialogues = task.taskModel?.dialogues ?? [];

  const updateStep = (next: Phase6RoleplayStep) => {
    const synced: Phase6RoleplayStep = {
      ...next,
      roleplays: syncPhase6RoleplayDifficultiesFromDialogues(next.roleplays ?? [], dialogues),
    };
    const phases = [...task.phases];
    const steps = [...phase.steps];
    const idx = steps.findIndex((s) => s.type === "phase6_roleplay");
    steps[idx] = synced;
    phases[index] = { ...phase, steps };
    setTask({ ...task, phases });
  };

  useEffect(() => {
    const dlgList = task.taskModel?.dialogues ?? [];
    const r = step.roleplays ?? [];
    const synced = syncPhase6RoleplayDifficultiesFromDialogues(r, dlgList);
    if (JSON.stringify(synced) === JSON.stringify(r)) return;
    const phases = [...task.phases];
    const steps = [...phase.steps];
    const idx = steps.findIndex((s) => s.type === "phase6_roleplay");
    if (idx === -1) return;
    steps[idx] = { ...step, roleplays: synced };
    phases[index] = { ...phase, steps };
    setTask({ ...task, phases });
  }, [task, phase, index, step]);

  const roleplays = step.roleplays ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Configure roleplay entries: pick a dialogue (difficulty comes from that dialogue), allowed roles, and learner
        hints by turn index.
      </p>
      <div className="space-y-3">
        {roleplays.map((rp, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-800">Roleplay {i + 1}</p>
              <button
                type="button"
                onClick={() => {
                  const next = roleplays.filter((_, idx) => idx !== i);
                  updateStep({ ...step, roleplays: next });
                }}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Dialogue</span>
                <select
                  value={rp.dialogueId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const dlg = dialogues.find((d) => d.id === id);
                    const next = [...roleplays];
                    next[i] = {
                      ...rp,
                      dialogueId: id,
                      difficulty: dlg?.difficulty ?? "",
                    };
                    updateStep({ ...step, roleplays: next });
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  <option value="">— Select dialogue —</option>
                  {dialogues.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id}
                      {d.scope ? ` · ${d.scope}` : ""}
                      {d.difficulty ? ` · ${d.difficulty}` : ""}
                      {d.turns?.length != null ? ` (${d.turns.length} turns)` : ""}
                    </option>
                  ))}
                  {rp.dialogueId && !dialogues.some((d) => d.id === rp.dialogueId) ? (
                    <option value={rp.dialogueId}>
                      {rp.dialogueId} (not in task model — add dialogue or pick another)
                    </option>
                  ) : null}
                </select>
                {dialogues.length === 0 ? (
                  <span className="text-xs text-amber-700">No dialogues yet. Add them in the Dialogues tab.</span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Difficulty</span>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={rp.difficulty}
                  placeholder="—"
                  title="Taken from the selected dialogue (Dialogues tab)"
                  className="cursor-not-allowed rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-600"
                />
                <span className="text-xs text-slate-500">From dialogue; edit in the Dialogues tab.</span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Allowed roles (comma-separated)</span>
                <input
                  type="text"
                  value={rp.allowedRoles.join(", ")}
                  onChange={(e) => {
                    const roles = e.target.value
                      .split(",")
                      .map((r) => r.trim())
                      .filter(Boolean);
                    const next = [...roleplays];
                    next[i] = { ...rp, allowedRoles: roles };
                    updateStep({ ...step, roleplays: next });
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Learner hints by turn</p>
              {(() => {
                const dlg = dialogues.find((d) => d.id === rp.dialogueId);
                const turns = dlg?.turns ?? [];
                const hints = rp.dialogHints ?? [];

                if (!rp.dialogueId.trim()) {
                  return (
                    <p className="text-sm text-slate-500">Select a dialogue above to map hints to speak turns.</p>
                  );
                }
                if (!dlg) {
                  return (
                    <p className="text-sm text-amber-700">
                      No dialogue with id &quot;{rp.dialogueId}&quot;. Add or fix it in the Dialogues tab first.
                    </p>
                  );
                }
                if (turns.length === 0) {
                  return <p className="text-sm text-slate-500">This dialogue has no turns.</p>;
                }

                const seenTurnIndex = new Set<number>();
                const orphanEntries = hints
                  .map((h, globalIdx) => ({ h, globalIdx }))
                  .filter(({ h }) => {
                    if (h.index < 0 || h.index >= turns.length) return true;
                    if (seenTurnIndex.has(h.index)) return true;
                    seenTurnIndex.add(h.index);
                    return false;
                  });

                return (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Each line is one speak turn. At most one hint per turn — use + to add, or edit below.
                    </p>
                    <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                      {turns.map((turn, turnIdx) => {
                        const hintGlobalIdx = hints.findIndex((h) => h.index === turnIdx);
                        const hasHint = hintGlobalIdx >= 0;
                        const h = hasHint ? hints[hintGlobalIdx] : null;

                        return (
                          <div
                            key={turnIdx}
                            className={`rounded-md border bg-white ${hasHint ? "border-violet-200 ring-1 ring-violet-100" : "border-slate-100"}`}
                          >
                            <div className="flex items-start gap-2 py-2 pl-2 pr-1">
                              <span
                                className="mt-0.5 w-7 shrink-0 text-right text-xs tabular-nums text-slate-400"
                                title="Turn index"
                              >
                                {turnIdx}
                              </span>
                              <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium uppercase text-slate-600">
                                {turn.role}
                              </span>
                              <span className="min-w-0 flex-1 text-sm leading-snug text-slate-800">{turn.text}</span>
                              {!hasHint && (
                                <button
                                  type="button"
                                  title="Add hint for this turn"
                                  aria-label={`Add hint for turn ${turnIdx}`}
                                  onClick={() => {
                                    const nextHints = [...hints, { index: turnIdx, text: "" }];
                                    const nextRp = [...roleplays];
                                    nextRp[i] = { ...rp, dialogHints: nextHints };
                                    updateStep({ ...step, roleplays: nextRp });
                                  }}
                                  className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-violet-600"
                                >
                                  <Phase4AddTurnIcon />
                                </button>
                              )}
                            </div>
                            {hasHint && h && (
                              <div className="space-y-2 border-t border-slate-100 bg-slate-50/90 p-2 text-sm">
                                <p className="text-xs font-medium text-slate-600">Hint for turn {turnIdx}</p>
                                <div className="flex items-start gap-2">
                                  <input
                                    type="text"
                                    placeholder="Hint text"
                                    value={h.text}
                                    onChange={(e) => {
                                      const nextHints = [...hints];
                                      nextHints[hintGlobalIdx] = { ...h, text: e.target.value };
                                      const nextRp = [...roleplays];
                                      nextRp[i] = { ...rp, dialogHints: nextHints };
                                      updateStep({ ...step, roleplays: nextRp });
                                    }}
                                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextHints = hints.filter((x) => x.index !== turnIdx);
                                      const nextRp = [...roleplays];
                                      nextRp[i] = { ...rp, dialogHints: nextHints };
                                      updateStep({ ...step, roleplays: nextRp });
                                    }}
                                    className="shrink-0 text-xs text-red-600 hover:underline"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {orphanEntries.length > 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm">
                        <p className="mb-2 font-medium text-amber-900">
                          Extra hints (invalid turn index, or duplicate index — only one hint per turn is used above)
                        </p>
                        <div className="space-y-2">
                          {orphanEntries.map(({ h, globalIdx }) => (
                            <div key={globalIdx} className="flex flex-wrap items-start gap-2">
                              <span className="shrink-0 pt-1.5 font-mono text-xs text-amber-800">
                                index {h.index}
                              </span>
                              <input
                                type="text"
                                value={h.text}
                                onChange={(e) => {
                                  const nextHints = [...hints];
                                  nextHints[globalIdx] = { ...h, text: e.target.value };
                                  const nextRp = [...roleplays];
                                  nextRp[i] = { ...rp, dialogHints: nextHints };
                                  updateStep({ ...step, roleplays: nextRp });
                                }}
                                className="min-w-[12rem] flex-1 rounded border border-amber-300/80 bg-white px-2 py-1"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextHints = hints.filter((_, idx) => idx !== globalIdx);
                                  const nextRp = [...roleplays];
                                  nextRp[i] = { ...rp, dialogHints: nextHints };
                                  updateStep({ ...step, roleplays: nextRp });
                                }}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          updateStep({
            ...step,
            roleplays: [
              ...roleplays,
              { allowedRoles: ["user"], dialogueId: "", difficulty: "", dialogHints: [] },
            ],
          })
        }
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add roleplay
      </button>
    </div>
  );
}

export default function TaskEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetLanguage = searchParams.get("target_language") ?? "";
  const isTargetMode = !!targetLanguage;

  const [task, setTask] = useState<TaskPackage | null>(null);
  /** Flat translation dict: { [originalText]: translation } — the output of target-language mode. */
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  const setTranslation = (key: string, value: string) =>
    setTranslations((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tasks/${id}`);
        if (!res.ok) throw new Error("Failed to load task");
        const raw = await res.json();
        const data = normalizeTaskPackage(raw);
        if (!data) throw new Error("Invalid task JSON from API");
        setTask(data);
        // Seed translations from an existing locale if one is already saved.
        setTranslations(
          isTargetMode ? (data.locales?.[targetLanguage] ?? {}) : {}
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isTargetMode, targetLanguage]);

  const handleCopyJson = () => {
    if (!task) return;
    const json = isTargetMode
      ? JSON.stringify(translations, null, 2)
      : JSON.stringify(task, null, 2);
    navigator.clipboard
      .writeText(json)
      .catch(() => alert("Failed to copy JSON to clipboard"));
  };

  const handleExport = async () => {
    if (!id) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/export/tasks/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text().then((t) => t || `HTTP ${res.status}`));
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `task-export-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!task || !id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = isTargetMode
        ? {
            ...task,
            locales: {
              ...(task.locales ?? {}),
              [targetLanguage]: translations,
            },
          }
        : task;
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: authJsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      // Update local task state so the newly saved locales are reflected.
      if (isTargetMode) setTask(payload);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const renderTabContent = () => {
    if (!task) return null;
    switch (activeTab) {
      case "info":
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Task ID</span>
              <input
                type="text"
                value={task.id}
                onChange={(e) => setTask({ ...task, id: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Title</span>
              <input
                type="text"
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Description</span>
              <textarea
                value={task.description}
                onChange={(e) => setTask({ ...task, description: e.target.value })}
                rows={3}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          </div>
        );
      case "assets":
        return <AssetsEditor task={task} setTask={setTask} />;
      case "tlts":
        return <TltsEditor task={task} setTask={setTask} />;
      case "dialogues":
        return <DialoguesEditor task={task} setTask={setTask} />;
      case "phase1":
        return <Phase1Editor task={task} setTask={setTask} />;
      case "phase2":
        return <Phase2Editor task={task} setTask={setTask} />;
      case "phase3":
        return <Phase3Editor task={task} setTask={setTask} />;
      case "subtask_learning":
        return <Phase4Editor task={task} setTask={setTask} />;
      case "reinforcement":
        return <Phase5Editor task={task} setTask={setTask} />;
      case "roleplay":
        return <Phase6Editor task={task} setTask={setTask} />;
      default:
        return null;
    }
  };

  return (
    <TargetLangContext.Provider value={{ isTargetMode, targetLanguage, translations, setTranslation }}>
    <main className="flex flex-col bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col space-y-4">
        {isTargetMode && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-amber-500">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
            </svg>
            <span>
              <strong>Target language mode:</strong> <span className="font-mono uppercase">{targetLanguage}</span>
              {" — "}original text is shown above each field in grey. Edit the translation below.
            </span>
          </div>
        )}

        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10z" clipRule="evenodd" />
                </svg>
                Admin
              </button>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {isTargetMode
                ? <>Create Learner Language for task: <span className="text-violet-700">{task?.title ?? id}</span>, id: <span className="font-mono text-base text-slate-500">{id}</span></>
                : <>Edit Task: <span className="text-blue-700">{task?.title ?? id}</span>, id: <span className="font-mono text-base text-slate-500">{id}</span></>}
            </h1>
            <p className="text-sm text-slate-600">
              {isTargetMode
                ? "Translate learner-facing text fields into the target language. Add/remove controls are hidden; only text edits are saved."
                : "Edit the task content through structured phase editors. Changes are saved to the in-memory store."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span className={`text-sm font-medium ${saveMsg === "Saved" ? "text-emerald-600" : "text-red-600"}`}>
                {saveMsg}
              </span>
            )}
            <button
              type="button"
              onClick={handleCopyJson}
              disabled={!task}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isTargetMode ? "Copy Translations" : "Copy JSON"}
            </button>
            {!isTargetMode && (
              <button
                type="button"
                onClick={handleExport}
                disabled={!task || exporting || !id}
                className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? "Exporting…" : "Export"}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!task || saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-slate-600">Loading task…</p>
          </div>
        )}

        {!loading && task && (
          <>
            <section className="flex flex-col space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "info", label: "Info" },
                  { key: "assets", label: "Assets" },
                  { key: "tlts", label: "TLTS" },
                  { key: "dialogues", label: "Dialogues" },
                  { key: "phase1", label: "Phase 1 – Entry" },
                  { key: "phase2", label: "Phase 2 – Warmup" },
                  { key: "phase3", label: "Phase 3 – Language items" },
                  { key: "subtask_learning", label: "Phase 4 – Subtasks" },
                  { key: "reinforcement", label: "Phase 5 – Reinforcement" },
                  { key: "roleplay", label: "Phase 6 – Roleplay" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`rounded-full px-3 py-1 text-sm font-medium border ${
                      activeTab === tab.key
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[300px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {renderTabContent()}
              </div>
            </section>

          </>
        )}
      </div>
    </main>
    </TargetLangContext.Provider>
  );
}

