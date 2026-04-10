"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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

/** Matches `useState` setter so we can use functional updates and avoid clobbering when chaining with `appendTaskAsset`. */
type SetTask = Dispatch<SetStateAction<TaskPackage | null>>;

function safeAppendTaskAsset(
  prev: TaskPackage | null,
  kind: "image" | "audio",
  asset: AssetSelectItem
): TaskPackage | null {
  if (!prev) return prev;
  return appendTaskAsset(prev, kind, asset);
}

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
import {
  editorAddPrimaryButton,
  editorAddSecondaryButton,
  editorAddSecondaryButtonSm,
  editorLabelL1,
  editorLabelL2,
  editorLabelL2Inline,
  editorLabelL3,
} from "@/app/edit/editor-labels";
import { TaskRolesEditor } from "@/app/edit/task-roles-editor";
import {
  dialoguesEditorRoleId,
  firstUnusedTltsKey,
  taskRoleTitle,
} from "@/app/edit/task-editor-utils";

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

/** New “Add question” rows use a default type per phase/section; users can still switch type in the dropdown. */
function createEmptyQuestion(type: Question["type"]): Question {
  const correctOptionIndexes = [0];
  switch (type) {
    case "audio_text":
      return { type: "audio_text", stem: {}, options: [{ text: "" }], correctOptionIndexes };
    case "text_image":
      return { type: "text_image", stem: { text: "" }, options: [{}], correctOptionIndexes };
    case "text_cloze":
      return { type: "text_cloze", stem: { text: "" }, options: [{ text: "" }], correctOptionIndexes };
    case "text_text":
      return { type: "text_text", stem: { text: "" }, options: [{ text: "" }], correctOptionIndexes };
    default: {
      const _x: never = type;
      return _x;
    }
  }
}

interface QuestionListEditorProps {
  questions: Question[];
  onChange: (next: Question[]) => void;
  imageAssets: AssetSelectItem[];
  audioAssets: AssetSelectItem[];
  onCreateImageAsset: (asset: AssetSelectItem) => void;
  onCreateAudioAsset: (asset: AssetSelectItem) => void;
  /**
   * Use "primary" only for a tab-level block (e.g. phase2 warmup). Nested editors (phase3/5 groups) use "secondary"
   * so the main “Add question” matches other nested controls.
   */
  addQuestionButtonLevel?: "primary" | "secondary";
  /** Default type for newly added questions (existing rows keep their type). */
  defaultQuestionType?: Question["type"];
}

function QuestionListEditor({
  questions,
  onChange,
  imageAssets,
  audioAssets,
  onCreateImageAsset,
  onCreateAudioAsset,
  addQuestionButtonLevel = "secondary",
  defaultQuestionType = "text_text",
}: QuestionListEditorProps) {
  const addQuestionBtnClass =
    addQuestionButtonLevel === "primary" ? editorAddPrimaryButton : editorAddSecondaryButton;
  const { isTargetMode } = useContext(TargetLangContext);
  const updateQuestion = (idx: number, next: Question) => {
    const copy = [...questions];
    copy[idx] = next;
    onChange(copy);
  };

  const removeQuestion = (idx: number) => onChange(questions.filter((_, i) => i !== idx));

  const addQuestion = () => {
    onChange([...questions, createEmptyQuestion(defaultQuestionType)]);
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
        <div
          key={idx}
          className="space-y-3 rounded-lg border border-slate-200 border-t-[3px] border-t-violet-400/90 bg-white p-4 shadow-sm"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <span className={editorLabelL3}>Question {idx + 1}</span>
            {!isTargetMode && (
              <button type="button" onClick={() => removeQuestion(idx)} className="text-sm text-red-600 hover:underline">
                Remove
              </button>
            )}
          </div>

          {/* Type — single compact row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className={editorLabelL2Inline}>Type</span>
            <select
              value={q.type}
              disabled={isTargetMode}
              onChange={(e) => changeType(idx, e.target.value as Question["type"])}
              className="min-h-[2rem] min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-500 sm:max-w-xl"
            >
              <option value="text_text">Stem as text, Options as text</option>
              <option value="text_image">Stem as text, Options as image</option>
              <option value="text_cloze">Stem as text, Options as text (cloze)</option>
              <option value="audio_text">Stem as audio, Options as text</option>
            </select>
          </div>

          {/* Stem */}
          <div className="space-y-1.5">
            <p className={editorLabelL2}>Stem</p>
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
            <p className={editorLabelL2}>Options</p>
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
                      <span className={editorLabelL2Inline}>Correct</span>
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
                className={editorAddSecondaryButtonSm}
              >
                Add option
              </button>
            )}
          </div>

          {/* Hint */}
          <label className="flex flex-col gap-1 text-sm">
            <span className={editorLabelL2Inline}>Hint (optional)</span>
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
          className={addQuestionBtnClass}
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
  /** Row index for the next `change` event (set when opening the picker; cleared on change or cancel). */
  const pendingUploadRowRef = useRef<number | null>(null);
  /** Clears pending row if the file dialog was cancelled (`change` never runs). */
  const cancelPickTimerRef = useRef<number | null>(null);
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
    const t = cancelPickTimerRef.current;
    if (t != null) {
      window.clearTimeout(t);
      cancelPickTimerRef.current = null;
    }
    pendingUploadRowRef.current = idx;
    const input = fileInputRef.current;
    if (!input) return;

    const onWindowFocus = () => {
      window.removeEventListener("focus", onWindowFocus);
      const timerId = window.setTimeout(() => {
        cancelPickTimerRef.current = null;
        if (pendingUploadRowRef.current === idx) {
          pendingUploadRowRef.current = null;
        }
      }, 300);
      cancelPickTimerRef.current = timerId as unknown as number;
    };
    window.addEventListener("focus", onWindowFocus, { once: true });
    input.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (cancelPickTimerRef.current != null) {
      clearTimeout(cancelPickTimerRef.current);
      cancelPickTimerRef.current = null;
    }
    const row = pendingUploadRowRef.current;
    pendingUploadRowRef.current = null;
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || row === null) return;

    setUploadingIdx(row);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: authMultipartHeaders(),
        body: fd,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) updateItem(row, { url: data.url });
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploadingIdx(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className={editorLabelL1}>{label}</p>
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
                  <span className={editorLabelL2Inline}>Prompt</span>
                  <textarea
                    value={item.prompt}
                    onChange={(e) => updateItem(idx, { prompt: e.target.value })}
                    rows={1}
                    placeholder="Describe asset for generation…"
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className={editorLabelL2Inline}>URL</span>
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
        className={editorAddPrimaryButton}
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

function AssetsEditor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
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
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDraft, setBatchDraft] = useState("");

  const addItem = () => {
    const id = genTltId(prefix, items.map((i) => i.id));
    onChange([...items, { id, text: "" }]);
  };

  const applyBatchAdd = () => {
    const lines = batchDraft.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    setBatchOpen(false);
    setBatchDraft("");
    if (lines.length === 0) return;
    const ids = items.map((i) => i.id);
    const next = [...items];
    for (const text of lines) {
      const id = genTltId(prefix, ids);
      ids.push(id);
      next.push({ id, text });
    }
    onChange(next);
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
  const batchModalTitleId = `tlt-batch-modal-${prefix}`;

  return (
    <>
    <div className="space-y-3">
      <div
        className={`${editorLabelL1} flex w-full min-w-0 flex-wrap items-center justify-between gap-2 pr-3`}
      >
        <span className="min-w-0">{label}</span>
        <button
          type="button"
          onClick={() => {
            setBatchDraft("");
            setBatchOpen(true);
          }}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          aria-haspopup="dialog"
          aria-expanded={batchOpen}
        >
          Batch add
        </button>
      </div>
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
        className={editorAddPrimaryButton}
      >
        Add {singular}
      </button>
    </div>

    {batchOpen ? (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && setBatchOpen(false)}
      >
        <div
          className="flex w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby={batchModalTitleId}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id={batchModalTitleId} className="text-base font-semibold text-slate-900">
            Batch add {label.toLowerCase()}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Paste or type one entry per line. Empty lines are skipped.
          </p>
          <textarea
            value={batchDraft}
            onChange={(e) => setBatchDraft(e.target.value)}
            rows={12}
            className="mt-3 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={"Line 1\nLine 2\n…"}
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => {
                setBatchOpen(false);
                setBatchDraft("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyBatchAdd}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add items
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

function TltsEditor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
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

function AllowedRolesMultiSelect({
  task,
  value,
  onChange,
  disabled,
}: {
  task: TaskPackage;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const roles = task.taskModel.roles ?? [];
  if (roles.length === 0) {
    return <p className="text-xs text-amber-700">Add dialogue roles on the Dialogues tab first.</p>;
  }
  const toggle = (id: string) => {
    const set = new Set(value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((r, i) => {
        const id = dialoguesEditorRoleId(r, i);
        const checked = value.includes(id);
        return (
          <label
            key={id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              checked ? "border-indigo-400 bg-indigo-50 text-indigo-950" : "border-slate-200 bg-white text-slate-700"
            } ${disabled ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={checked}
              onChange={() => toggle(id)}
              disabled={disabled}
            />
            <span>{r.title?.trim() || id}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Split script lines into turns, cycling roles starting from `firstRoleId`. */
function turnsFromScriptLines(
  lines: string[],
  roleIds: string[],
  firstRoleId: string
): DialogueTurn[] {
  if (roleIds.length === 0 || lines.length === 0) return [];
  const start = roleIds.includes(firstRoleId) ? roleIds.indexOf(firstRoleId) : 0;
  return lines.map((text, i) => ({
    role: roleIds[(start + i) % roleIds.length],
    text,
  }));
}

function AddDialogueByScriptModal({
  roles,
  onClose,
  onConfirm,
}: {
  roles: NonNullable<TaskPackage["taskModel"]["roles"]>;
  onClose: () => void;
  onConfirm: (turns: DialogueTurn[]) => void;
}) {
  const roleIds = useMemo(() => roles.map((r, i) => dialoguesEditorRoleId(r, i)), [roles]);
  const [draft, setDraft] = useState("");
  const [firstRoleId, setFirstRoleId] = useState(roleIds[0] ?? "");

  const lines = useMemo(
    () => draft.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [draft]
  );

  const previewTurns = useMemo(
    () => turnsFromScriptLines(lines, roleIds, firstRoleId),
    [lines, roleIds, firstRoleId]
  );

  const canConfirm = lines.length > 0 && roleIds.length > 0 && roleIds.includes(firstRoleId);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(turnsFromScriptLines(lines, roleIds, firstRoleId));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogue-script-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="dialogue-script-modal-title" className="text-lg font-semibold text-slate-900">
            Add by script
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Creates a new dialogue with one turn per line. Speakers alternate in role order, starting with whoever speaks
            first below.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid min-h-[16rem] gap-4 md:grid-cols-2 md:gap-6">
            <div className="flex min-h-0 flex-col gap-3">
              <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
                <span className={editorLabelL2Inline}>Script</span>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={12}
                  className="min-h-[12rem] w-full flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={"First line…\nSecond line…"}
                />
              </label>

              <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                <legend className="px-0.5 text-sm font-medium text-slate-800">Who speaks first</legend>
                {roleIds.length === 0 ? (
                  <p className="text-xs text-amber-700">Add dialogue roles above first.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {roles.map((r, i) => {
                      const id = roleIds[i];
                      const label = r.title?.trim() || id;
                      return (
                        <label
                          key={id}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-sm text-slate-800 hover:bg-white"
                        >
                          <input
                            type="radio"
                            name="script-first-role"
                            className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={firstRoleId === id}
                            onChange={() => setFirstRoleId(id)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            </div>

            <div className="flex min-h-0 flex-col gap-1.5">
              <span className={editorLabelL2Inline}>Preview</span>
              <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {roleIds.length === 0 ? (
                  <p className="text-sm text-slate-500">Add roles to preview.</p>
                ) : !roleIds.includes(firstRoleId) ? (
                  <p className="text-sm text-slate-500">Choose who speaks first.</p>
                ) : previewTurns.length === 0 ? (
                  <p className="text-sm text-slate-400">Type script lines on the left to preview turns.</p>
                ) : (
                  <ul className="space-y-3">
                    {previewTurns.map((turn, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-2">
                        <span className="shrink-0 rounded-md border border-violet-200 bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-950">
                          {taskRoleTitle(roles, turn.role)}
                        </span>
                        <span className="min-w-0 flex-1 text-sm leading-relaxed text-slate-800">{turn.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function DialoguesEditor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
  const { isTargetMode } = useContext(TargetLangContext);
  const dialogues = task.taskModel.dialogues ?? [];
  const audios = taskAudioAssets(task);
  const roles = task.taskModel.roles ?? [];
  const roleIds = roles.map((r, i) => dialoguesEditorRoleId(r, i));
  const defaultRoleId = roles.length ? dialoguesEditorRoleId(roles[0], 0) : "user";
  const [scriptModalOpen, setScriptModalOpen] = useState(false);

  const setDialogues = (next: Dialogue[]) => {
    setTask((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        taskModel: { ...prev.taskModel, dialogues: next },
      };
    });
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
    <div className="space-y-8">
      <TaskRolesEditor task={task} setTask={setTask} disabled={isTargetMode} />

      <section className="space-y-4">
        <p className={editorLabelL1}>Dialogues</p>
        <p className="text-sm text-slate-600">
          Dialogues are referenced by id from Phase 4 (subtasks) and Phase 6 (roleplay). Edit lines and audio assets here;
          add or remove whole dialogues and turns as needed.
        </p>
        {dialogues.length === 0 && (
          <p className="text-sm italic text-slate-400">No dialogues yet. Add one to attach subtask or roleplay flows.</p>
        )}
      {dialogues.map((dlg, di) => (
        <div
          key={dlg.id}
          className="space-y-4 rounded-xl border border-slate-200 border-l-4 border-l-violet-400 bg-slate-50/80 p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={editorLabelL3}>Dialogue {di + 1}</span>
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
              <span className={editorLabelL2Inline}>Id</span>
              <input
                type="text"
                value={dlg.id}
                onChange={(e) => updateDialogue(di, { ...dlg, id: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 font-mono text-sm w-full"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm min-w-0">
              <span className={editorLabelL2Inline}>Scope</span>
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
            <p className={editorLabelL2}>Turns</p>
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
                    <span className={editorLabelL2Inline}>Role</span>
                    {roles.length === 0 ? (
                      <p className="text-xs text-amber-700">Add dialogue roles above to choose speaker roles.</p>
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
                    <span className={editorLabelL2Inline}>Text</span>
                    <TLInput
                      value={turn.text}
                      onChange={(e) => updateTurn(di, ti, { ...turn, text: e.target.value })}
                      className="w-full"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-3">
                    <span className={editorLabelL2Inline}>Audio asset</span>
                    <AssetSelect
                      type="audio"
                      value={turn.audioAssetId}
                      options={audios}
                      onChange={(id) => updateTurn(di, ti, { ...turn, audioAssetId: id })}
                      allowAddAsset={!isTargetMode}
                      disabled={isTargetMode}
                      onCreateAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "audio", a))}
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
              className={editorAddSecondaryButton}
            >
              Add turn
            </button>
          </div>
        </div>
      ))}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addDialogue}
            className={editorAddPrimaryButton}
          >
            Add dialogue
          </button>
          <button
            type="button"
            disabled={isTargetMode || roles.length === 0}
            onClick={() => setScriptModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-300 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add by Script
          </button>
        </div>
      </section>

      {scriptModalOpen ? (
        <AddDialogueByScriptModal
          roles={roles}
          onClose={() => setScriptModalOpen(false)}
          onConfirm={(newTurns) => {
            setDialogues([
              ...dialogues,
              {
                id: `dlg_${Date.now()}`,
                scope: "subtask",
                turns: newTurns,
              },
            ]);
          }}
        />
      ) : null}
    </div>
  );
}

function Phase1Editor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
  const { isTargetMode } = useContext(TargetLangContext);
  const { phase, index } = findPhase(task, "phase1");
  if (!phase) return <p className="text-sm text-slate-500">Phase "phase1" not found.</p>;
  const step = phase.steps[0] as Phase1EntryStep | undefined;
  if (!step) return <p className="text-sm text-slate-500">No steps in phase1.</p>;

  const updateStep = (next: Phase1EntryStep) => {
    setTask((prev) => {
      if (!prev) return prev;
      const { phase: ph, index: i } = findPhase(prev, "phase1");
      if (i < 0 || !ph) return prev;
      const steps = [...ph.steps];
      steps[0] = next;
      const phases = [...prev.phases];
      phases[i] = { ...ph, steps };
      return { ...prev, phases };
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className={editorLabelL2Inline}>Thumbnail</span>
          <AssetSelect
            type="image"
            value={step.thumbnail}
            options={taskImageAssets(task)}
            onChange={(id) => updateStep({ ...step, thumbnail: id })}
            allowAddAsset={!isTargetMode}
            disabled={isTargetMode}
            onCreateAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "image", a))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className={editorLabelL2Inline}>Task purpose</span>
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
          <span className={editorLabelL2Inline}>Task description</span>
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
          <span className={editorLabelL2Inline}>Button text</span>
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

function Phase2Editor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
  const { phase, index } = findPhase(task, "phase2");
  if (!phase) return <p className="text-sm text-slate-500">Phase "phase2" not found.</p>;
  const step = phase.steps[0] as Phase2WarmupStep | undefined;
  if (!step) return <p className="text-sm text-slate-500">No steps in phase2.</p>;

  const updateStep = (next: Phase2WarmupStep) => {
    setTask((prev) => {
      if (!prev) return prev;
      const { phase: ph, index: i } = findPhase(prev, "phase2");
      if (i < 0 || !ph) return prev;
      const steps = [...ph.steps];
      steps[0] = next;
      const phases = [...prev.phases];
      phases[i] = { ...ph, steps };
      return { ...prev, phases };
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className={editorLabelL1}>Warmup questions</p>
        <QuestionListEditor
          questions={step.warmupQuestions ?? []}
          onChange={(next) => updateStep({ ...step, warmupQuestions: next })}
          imageAssets={taskImageAssets(task)}
          audioAssets={taskAudioAssets(task)}
          onCreateImageAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "image", a))}
          onCreateAudioAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "audio", a))}
          addQuestionButtonLevel="primary"
          defaultQuestionType="text_text"
        />
      </div>
    </div>
  );
}

/** Optional copy when Phase3Editor is embedded for Phase 5 words (`wordQuestions` is still keyed by word id). */
type Phase3WordGroupCopy = {
  sectionLabel: string;
  /** Label for the TLTS picker (e.g. “Word”) — ids are never shown. */
  itemIdLabel: string;
  addGroupLabel: string;
  removeGroupLabel: string;
};

function Phase3Editor({
  task,
  setTask,
  onCreateImageAsset: onCreateImageProp,
  onCreateAudioAsset: onCreateAudioProp,
  wordGroupCopy,
  wordTltsWords,
}: {
  task: TaskPackage;
  setTask: SetTask;
  /** When embedding Phase 3 UI (e.g. phase 5), attach new assets to the real task */
  onCreateImageAsset?: (a: AssetSelectItem) => void;
  onCreateAudioAsset?: (a: AssetSelectItem) => void;
  /** Phase 5 words: use “Words” / “Word ID” instead of duplicate “Phase 5” + “Word questions” + “Item”. */
  wordGroupCopy?: Phase3WordGroupCopy;
  /** When set with phase 5 words, pick words from TLTS text instead of raw ids. */
  wordTltsWords?: Record<string, string>;
}) {
  const { phase, index } = findPhase(task, "phase3");
  if (!phase) return <p className="text-sm text-slate-500">Phase "phase3" not found.</p>;

  const onCreateImageAsset =
    onCreateImageProp ?? ((a: AssetSelectItem) => setTask((prev) => safeAppendTaskAsset(prev, "image", a)));
  const onCreateAudioAsset =
    onCreateAudioProp ?? ((a: AssetSelectItem) => setTask((prev) => safeAppendTaskAsset(prev, "audio", a)));

  const updatePhase = (nextPhase: Phase) => {
    setTask((prev) => {
      if (!prev) return prev;
      const { phase: ph, index: i } = findPhase(prev, "phase3");
      if (i < 0 || !ph) return prev;
      const phases = [...prev.phases];
      phases[i] = nextPhase;
      return { ...prev, phases };
    });
  };

  const updateStepAt = <T extends Phase3WordsStep | Phase3PhrasesStep | Phase3SentencesStep>(
    stepIndex: number,
    nextStep: T
  ) => {
    setTask((prev) => {
      if (!prev) return prev;
      const { phase: ph, index: i } = findPhase(prev, "phase3");
      if (i < 0 || !ph) return prev;
      const steps = [...ph.steps];
      steps[stepIndex] = nextStep;
      const phases = [...prev.phases];
      phases[i] = { ...ph, steps };
      return { ...prev, phases };
    });
  };

  const wordsStep = phase.steps.find((s) => s.type === "phase3_words") as Phase3WordsStep | undefined;
  const phrasesStep = phase.steps.find((s) => s.type === "phase3_phrases") as Phase3PhrasesStep | undefined;
  const sentencesStep = phase.steps.find((s) => s.type === "phase3_sentences") as Phase3SentencesStep | undefined;

  const renderGroupedQuestions = (
    label: string,
    map: Record<string, Question[]>,
    onChange: (next: Record<string, Question[]>) => void,
    groupUi?: { selectLabel: string; add: string; remove: string },
    tltsLookup?: Record<string, string>,
    defaultQuestionType: Question["type"] = "text_text"
  ) => {
    const selectLabel = groupUi?.selectLabel ?? "Item";
    const addLabel = groupUi?.add ?? "Add group";
    const removeLabel = groupUi?.remove ?? "Remove group";
    const tlts = tltsLookup ?? {};
    const hasTlts = Object.keys(tlts).length > 0;
    const entries = Object.entries(map);

    const textForTltsKey = (k: string) => {
      const t = (tlts[k] ?? "").trim();
      return t || "—";
    };

    const addKey = () => {
      if (!hasTlts) return;
      const used = new Set(Object.keys(map));
      const free = firstUnusedTltsKey(tlts, used);
      if (free) onChange({ ...map, [free]: [] });
    };

    const canAddAnother = () =>
      hasTlts && firstUnusedTltsKey(tlts, new Set(Object.keys(map))) !== undefined;

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

    const pickerForRow = (key: string) => {
      const inTlts = Object.prototype.hasOwnProperty.call(tlts, key);
      if (hasTlts && inTlts) {
        return (
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className={editorLabelL2Inline}>{selectLabel}</span>
            <select
              value={key}
              onChange={(e) => updateKey(key, e.target.value)}
              className="w-full max-w-lg rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {Object.keys(tlts)
                .filter((k) => k === key || !(k in map))
                .map((k) => (
                  <option key={k} value={k}>
                    {textForTltsKey(k)}
                  </option>
                ))}
            </select>
          </label>
        );
      }
      if (hasTlts && !inTlts) {
        const freeKeys = Object.keys(tlts).filter((k) => !(k in map));
        return (
          <div className="min-w-0 flex-1 space-y-2">
            <span className={editorLabelL2Inline}>{selectLabel}</span>
            <p className="text-sm text-amber-800">
              This group is not linked to the current TLTS list. Choose a {selectLabel.toLowerCase()} below or remove the
              group.
            </p>
            {freeKeys.length === 0 ? (
              <p className="text-sm text-amber-800">
                No free TLTS slots. Remove another question group or add entries in the TLTS tab.
              </p>
            ) : (
              <select
                value=""
                onChange={(e) => {
                  const nk = e.target.value;
                  if (nk) updateKey(key, nk);
                }}
                className="w-full max-w-lg rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Choose from TLTS…</option>
                {freeKeys.map((k) => (
                  <option key={k} value={k}>
                    {textForTltsKey(k)}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      }
      return (
        <div className="min-w-0 flex-1 space-y-1">
          <span className={editorLabelL2Inline}>{selectLabel}</span>
          <p className="text-sm text-amber-800">
            Add {selectLabel.toLowerCase()} entries in the TLTS tab first. Internal ids are not shown or edited here.
          </p>
        </div>
      );
    };

    return (
      <div className="space-y-3">
        <p className={editorLabelL1}>{label}</p>
        {!hasTlts && entries.length === 0 ? (
          <p className="text-sm text-slate-600">
            No TLTS {selectLabel.toLowerCase()} entries yet. Add them under the TLTS tab, then add question groups here.
          </p>
        ) : null}
        {entries.map(([key, qs]) => (
          <div
            key={key}
            className="space-y-2 rounded-lg border border-teal-200/90 border-l-[3px] border-l-teal-500 bg-gradient-to-br from-teal-50/40 to-slate-50 p-3 shadow-sm"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              {pickerForRow(key)}
              <button
                type="button"
                onClick={() => removeKey(key)}
                className="shrink-0 text-sm text-red-600 hover:underline"
              >
                {removeLabel}
              </button>
            </div>
            <QuestionListEditor
              questions={qs}
              onChange={(nextQs) => updateQuestionsForKey(key, nextQs)}
              imageAssets={taskImageAssets(task)}
              audioAssets={taskAudioAssets(task)}
              onCreateImageAsset={onCreateImageAsset}
              onCreateAudioAsset={onCreateAudioAsset}
              defaultQuestionType={defaultQuestionType}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addKey}
          disabled={!canAddAnother()}
          title={!hasTlts ? "Add TLTS entries first" : !canAddAnother() ? "Every TLTS item already has a group" : undefined}
          className={`${editorAddPrimaryButton} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {addLabel}
        </button>
      </div>
    );
  };

  const wordGroupUi = wordGroupCopy
    ? {
        selectLabel: wordGroupCopy.itemIdLabel,
        add: wordGroupCopy.addGroupLabel,
        remove: wordGroupCopy.removeGroupLabel,
      }
    : undefined;

  const tltsWords = wordTltsWords ?? task.taskModel.tlts.words ?? {};

  return (
    <div className="space-y-6">
      {wordsStep && (
        <div className="space-y-3">
          {renderGroupedQuestions(
            wordGroupCopy?.sectionLabel ?? "Word questions",
            wordsStep.wordQuestions ?? {},
            (next) =>
              updateStepAt(
                phase.steps.findIndex((s) => s.type === "phase3_words"),
                { ...wordsStep, wordQuestions: next }
              ),
            wordGroupUi ??
              (!wordGroupCopy
                ? { selectLabel: "Word", add: "Add word", remove: "Remove word" }
                : undefined),
            tltsWords,
            wordGroupCopy ? "audio_text" : "text_image"
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
              ),
            { selectLabel: "Phrase", add: "Add phrase", remove: "Remove phrase" },
            task.taskModel.tlts.phrases ?? {},
            "text_cloze"
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
              ),
            { selectLabel: "Sentence", add: "Add sentence", remove: "Remove sentence" },
            task.taskModel.tlts.sentences ?? {},
            "text_text"
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

function Phase4Editor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
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
          <div
            key={i}
            className="space-y-3 rounded-lg border border-slate-200 border-l-4 border-l-amber-400 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={editorLabelL3}>Subtask {i + 1}</p>
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
                <span className={editorLabelL2Inline}>Dialogue</span>
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
              <div className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className={editorLabelL2Inline}>Allowed roles</span>
                <AllowedRolesMultiSelect
                  task={task}
                  value={st.allowedRoles}
                  onChange={(roles) => {
                    const next = [...subtasks];
                    next[i] = { ...st, allowedRoles: roles };
                    updateStep({ ...step, subtasks: next });
                  }}
                />
              </div>
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
                  <p className={editorLabelL2}>Dialogue — distractor turns</p>
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
                            <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                              {taskRoleTitle(task.taskModel.roles, turn.role)}
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
                                  className={editorAddSecondaryButtonSm}
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
        className={editorAddPrimaryButton}
      >
        Add subtask
      </button>
    </div>
  );
}

function Phase5Editor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
  const { isTargetMode } = useContext(TargetLangContext);
  const { phase, index } = findPhase(task, "reinforcement");
  if (!phase) return <p className="text-sm text-slate-500">Phase "reinforcement" not found.</p>;

  const findStep = <T,>(type: string) =>
    phase.steps.find((s) => s.type === type) as T | undefined;

  const updateStep = <T extends { type: string }>(type: string, updater: (current: T) => T) => {
    setTask((prev) => {
      if (!prev) return prev;
      const { phase: ph, index: i } = findPhase(prev, "reinforcement");
      if (i < 0 || !ph) return prev;
      const steps = [...ph.steps];
      const idx = steps.findIndex((s) => s.type === type);
      if (idx === -1) return prev;
      const current = steps[idx] as unknown as T;
      steps[idx] = updater(current) as unknown as Step;
      const phases = [...prev.phases];
      phases[i] = { ...ph, steps };
      return { ...prev, phases };
    });
  };

  const wordsStep = findStep<Phase5WordsStep>("phase5_words");
  const phrasesStep = findStep<Phase5PhrasesStep>("phase5_phrases");
  const sentencesStep = findStep<Phase5SentencesStep>("phase5_sentences");

  /** Phase3Editor uses functional `setTask` updates; bridge them onto `phase5_words` on the real task. */
  const phase5WordsSetTask: SetTask | undefined = wordsStep
    ? (arg) => {
        if (typeof arg === "function") {
          setTask((prev) => {
            if (!prev) return prev;
            const { phase: reinforcePh, index: ri } = findPhase(prev, "reinforcement");
            if (ri < 0 || !reinforcePh) return prev;
            const curWs = reinforcePh.steps.find((s) => s.type === "phase5_words") as Phase5WordsStep | undefined;
            if (!curWs) return prev;

            const synthetic: TaskPackage = {
              ...prev,
              phases: [
                {
                  type: "phase3",
                  steps: [{ ...curWs, type: "phase3_words" } as unknown as Phase3WordsStep],
                } as Phase,
              ],
            };

            const next = arg(synthetic);
            if (!next) return prev;

            const phase3 = next.phases[0];
            if (!phase3) return prev;
            const inner = phase3.steps.find((s) => s.type === "phase3_words") as Phase3WordsStep | undefined;
            if (!inner) return prev;

            const steps = [...reinforcePh.steps];
            const si = steps.findIndex((s) => s.type === "phase5_words");
            if (si < 0) return prev;
            steps[si] = {
              ...(steps[si] as Phase5WordsStep),
              wordQuestions: inner.wordQuestions,
            } as Step;
            const phases = [...prev.phases];
            phases[ri] = { ...reinforcePh, steps };
            return { ...prev, phases };
          });
        } else if (arg === null) {
          setTask(null);
        } else {
          const phase3 = arg.phases[0];
          if (!phase3) return;
          const ws =
            (phase3.steps.find((s) => s.type === "phase3_words") as Phase3WordsStep | undefined) ?? wordsStep;
          updateStep<Phase5WordsStep>("phase5_words", (cur) => ({
            ...cur,
            wordQuestions: ws.wordQuestions,
          }));
        }
      }
    : undefined;

  return (
    <div className="space-y-6">
      {wordsStep && phase5WordsSetTask && (
        <div className="space-y-3">
          <Phase3Editor
            wordTltsWords={task.taskModel.tlts.words ?? {}}
            wordGroupCopy={{
              sectionLabel: "Words",
              itemIdLabel: "Word",
              addGroupLabel: "Add Phase5 Word",
              removeGroupLabel: "Remove word",
            }}
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
            setTask={phase5WordsSetTask}
            onCreateImageAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "image", a))}
            onCreateAudioAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "audio", a))}
          />
        </div>
      )}

      {phrasesStep && (
        <div className="space-y-3">
          <p className={editorLabelL1}>Phrases</p>
          <div className="space-y-3">
            {Object.entries(phrasesStep.phraseClozes ?? {}).map(([phraseId, entry], idx) => {
              const tltsPhrases = task.taskModel.tlts.phrases ?? {};
              const clozeMap = phrasesStep.phraseClozes ?? {};
              return (
              <div
                key={phraseId}
                className="space-y-2 rounded-lg border border-slate-200 border-l-4 border-l-teal-500 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                    <span className={editorLabelL2Inline}>Phrase</span>
                    <select
                      value={phraseId}
                      onChange={(e) => {
                        const newKey = e.target.value;
                        if (!newKey || newKey === phraseId) return;
                        if (clozeMap[newKey]) return;
                        const next: Record<string, typeof entry> = {};
                        for (const [k, v] of Object.entries(clozeMap)) {
                          next[k === phraseId ? newKey : k] = v;
                        }
                        updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => {
                          const pq0 = cur.phraseQuestions ?? {};
                          const nextPq: { [k: string]: Question[] } = {};
                          for (const [k, v] of Object.entries(pq0)) {
                            nextPq[k === phraseId ? newKey : k] = v;
                          }
                          return { ...cur, phraseClozes: next, phraseQuestions: nextPq };
                        });
                      }}
                      className="max-w-lg rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    >
                      {Object.entries(tltsPhrases)
                        .filter(([k]) => k === phraseId || !(k in clozeMap))
                        .map(([k, text]) => (
                          <option key={k} value={k}>
                            {(text ?? "").trim() || "—"}
                          </option>
                        ))}
                      {!Object.prototype.hasOwnProperty.call(tltsPhrases, phraseId) ? (
                        <option value={phraseId}>Not in TLTS — add or fix in TLTS tab</option>
                      ) : null}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, typeof entry> = {};
                      for (const [k, v] of Object.entries(phrasesStep.phraseClozes ?? {})) {
                        if (k !== phraseId) next[k] = v;
                      }
                      updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => {
                        const pq0 = { ...(cur.phraseQuestions ?? {}) };
                        delete pq0[phraseId];
                        return { ...cur, phraseClozes: next, phraseQuestions: pq0 };
                      });
                    }}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove phrase
                  </button>
                </div>
                <div className="space-y-2 hidden">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className={editorLabelL2Inline}>Text hint</span>
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
                    <span className={editorLabelL2Inline}>Audio hint</span>
                    <AssetSelect
                      type="audio"
                      value={entry.audioHint}
                      options={taskAudioAssets(task)}
                      onChange={(id) => {
                        updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                          ...cur,
                          phraseClozes: {
                            ...(cur.phraseClozes ?? {}),
                            [phraseId]: { ...entry, audioHint: id || undefined },
                          },
                        }));
                      }}
                      allowAddAsset={!isTargetMode}
                      disabled={isTargetMode}
                      onCreateAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "audio", a))}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className={editorLabelL2Inline}>Phrase distractor</span>
                    <input
                      type="text"
                      value={entry.phraseDistractor ?? ""}
                      onChange={(e) => {
                        updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                          ...cur,
                          phraseClozes: {
                            ...(cur.phraseClozes ?? {}),
                            [phraseId]: { ...entry, phraseDistractor: e.target.value || undefined },
                          },
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <div className="space-y-3">
                  <p className={editorLabelL2}>Phrase questions</p>
                  <QuestionListEditor
                    questions={phrasesStep.phraseQuestions?.[phraseId] ?? []}
                    onChange={(nextQs) =>
                      updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                        ...cur,
                        phraseQuestions: { ...(cur.phraseQuestions ?? {}), [phraseId]: nextQs },
                      }))
                    }
                    imageAssets={taskImageAssets(task)}
                    audioAssets={taskAudioAssets(task)}
                    onCreateImageAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "image", a))}
                    onCreateAudioAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "audio", a))}
                    defaultQuestionType="audio_text"
                  />
                </div>
                <div className="space-y-2">
                  <p className={editorLabelL2}>Cloze Sentences (one question per sentence)</p>
                  {(entry.sentences ?? []).map((s, sIdx) => (
                    <div key={sIdx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-20 shrink-0">Sentence {sIdx + 1}</span>
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
                    className={editorAddSecondaryButtonSm}
                  >
                    Add sentence
                  </button>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span className={editorLabelL2Inline}>Answer</span>
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
              </div>
              );
            })}
            <button
              type="button"
              onClick={() => {
                const map = phrasesStep.phraseClozes ?? {};
                const tltsP = task.taskModel.tlts.phrases ?? {};
                const used = new Set(Object.keys(map));
                const free = firstUnusedTltsKey(tltsP, used);
                let key: string;
                if (free) {
                  key = free;
                } else {
                  let i = 1;
                  do {
                    key = `p${i}`;
                    i += 1;
                  } while (map[key]);
                }
                updateStep<Phase5PhrasesStep>("phase5_phrases", (cur) => ({
                  ...cur,
                  phraseClozes: {
                    ...(cur.phraseClozes ?? {}),
                    [key]: { sentences: [""], answer: "" },
                  },
                }));
              }}
              className={editorAddPrimaryButton}
            >
              Add Phase5 Phrase
            </button>
          </div>
        </div>
      )}

      {sentencesStep && (
        <div className="space-y-3">
          <p className={editorLabelL1}>Sentences</p>
          <p className="text-sm text-slate-600">
            Each card picks a TLTS sentence id; the learner sees the sentence text from TLTS for word-order practice.
          </p>
          {(() => {
            const tltsSentences = task.taskModel.tlts.sentences ?? {};
            const map = sentencesStep.sentenceReconstructions ?? {};
            const hasTlts = Object.keys(tltsSentences).length > 0;
            const labelForKey = (k: string) => (tltsSentences[k] ?? "").trim() || "—";

            return (
              <div className="space-y-3">
                {!hasTlts && Object.keys(map).length === 0 ? (
                  <p className="text-sm text-slate-600">
                    Add sentence entries in the TLTS tab first, then add cards here.
                  </p>
                ) : null}
                {Object.entries(map).map(([sentenceId, entry]) => {
                  const inTlts = Object.prototype.hasOwnProperty.call(tltsSentences, sentenceId);
                  const takenElsewhere = new Set(Object.keys(map).filter((k) => k !== sentenceId));
                  const optionKeys = Object.keys(tltsSentences).filter(
                    (k) => k === sentenceId || !takenElsewhere.has(k)
                  );
                  return (
                    <div
                      key={sentenceId}
                      className="space-y-3 rounded-lg border border-slate-200 border-l-4 border-l-teal-500 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        {hasTlts && inTlts ? (
                          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                            <span className={editorLabelL2Inline}>Sentence</span>
                            <select
                              value={sentenceId}
                              onChange={(e) => {
                                const newKey = e.target.value;
                                if (!newKey || newKey === sentenceId) return;
                                if (map[newKey]) return;
                                const next: typeof map = {};
                                for (const [k, v] of Object.entries(map)) {
                                  next[k === sentenceId ? newKey : k] = v;
                                }
                                updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => ({
                                  ...cur,
                                  sentenceReconstructions: next,
                                }));
                              }}
                              className="max-w-lg rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                            >
                              {optionKeys.map((k) => (
                                <option key={k} value={k}>
                                  {labelForKey(k)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : hasTlts && !inTlts ? (
                          <div className="min-w-0 flex-1 space-y-2">
                            <span className={editorLabelL2Inline}>Sentence</span>
                            <p className="text-sm text-amber-800">
                              This card is not linked to TLTS. Pick a sentence below or remove the card.
                            </p>
                            {optionKeys.length === 0 ? (
                              <p className="text-sm text-amber-800">
                                No free TLTS slots. Remove another card or add entries in the TLTS tab.
                              </p>
                            ) : (
                              <select
                                value=""
                                onChange={(e) => {
                                  const nk = e.target.value;
                                  if (!nk) return;
                                  const next: typeof map = {};
                                  for (const [k, v] of Object.entries(map)) {
                                    next[k === sentenceId ? nk : k] = v;
                                  }
                                  updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => ({
                                    ...cur,
                                    sentenceReconstructions: next,
                                  }));
                                }}
                                className="max-w-lg rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                              >
                                <option value="">Choose from TLTS…</option>
                                {optionKeys.map((k) => (
                                  <option key={k} value={k}>
                                    {labelForKey(k)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1 space-y-1">
                            <span className={editorLabelL2Inline}>Sentence</span>
                            <p className="text-sm text-amber-800">
                              Add sentences in the TLTS tab first. Cards reference TLTS sentence ids.
                            </p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const next: typeof map = { ...map };
                            delete next[sentenceId];
                            updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => ({
                              ...cur,
                              sentenceReconstructions: next,
                            }));
                          }}
                          className="shrink-0 text-sm text-red-600 hover:underline sm:mb-0.5"
                        >
                          Remove sentence
                        </button>
                      </div>
                      <label className="flex flex-col gap-1 text-sm">
                        <span className={editorLabelL2Inline}>Sentence Audio</span>
                        <AssetSelect
                          type="audio"
                          value={entry.audioAssetId}
                          options={taskAudioAssets(task)}
                          onChange={(id) =>
                            updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => ({
                              ...cur,
                              sentenceReconstructions: {
                                ...(cur.sentenceReconstructions ?? {}),
                                [sentenceId]: { ...entry, audioAssetId: id || undefined },
                              },
                            }))
                          }
                          allowAddAsset={!isTargetMode}
                          disabled={isTargetMode}
                          onCreateAsset={(a) => setTask((prev) => safeAppendTaskAsset(prev, "audio", a))}
                        />
                      </label>
                    </div>
                  );
                })}
                <button
                  type="button"
                  disabled={
                    !hasTlts ||
                    firstUnusedTltsKey(tltsSentences, new Set(Object.keys(map))) === undefined
                  }
                  title={
                    !hasTlts
                      ? "Add TLTS sentences first"
                      : firstUnusedTltsKey(tltsSentences, new Set(Object.keys(map))) === undefined
                        ? "Every TLTS sentence is already used in a card"
                        : undefined
                  }
                  onClick={() => {
                    const free = firstUnusedTltsKey(tltsSentences, new Set(Object.keys(map)));
                    if (!free) return;
                    updateStep<Phase5SentencesStep>("phase5_sentences", (cur) => ({
                      ...cur,
                      sentenceReconstructions: { ...(cur.sentenceReconstructions ?? {}), [free]: {} },
                    }));
                  }}
                  className={`${editorAddPrimaryButton} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Add Phase5 Sentence
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Phase6Editor({ task, setTask }: { task: TaskPackage; setTask: SetTask }) {
  const { isTargetMode } = useContext(TargetLangContext);
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
          <div
            key={i}
            className="space-y-3 rounded-lg border border-slate-200 border-l-4 border-l-sky-500 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className={editorLabelL3}>Roleplay {i + 1}</p>
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
                <span className={editorLabelL2Inline}>Dialogue</span>
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
                <span className={editorLabelL2Inline}>Difficulty</span>
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
              <div className="flex flex-col gap-1 text-sm md:col-span-3">
                <span className={editorLabelL2Inline}>Allowed roles</span>
                <AllowedRolesMultiSelect
                  task={task}
                  value={rp.allowedRoles}
                  disabled={isTargetMode}
                  onChange={(roles) => {
                    const next = [...roleplays];
                    next[i] = { ...rp, allowedRoles: roles };
                    updateStep({ ...step, roleplays: next });
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className={editorLabelL2}>Learner hints by turn</p>
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
                              <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                                {taskRoleTitle(task.taskModel.roles, turn.role)}
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
        className={editorAddPrimaryButton}
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
              <span className={editorLabelL2Inline}>Task ID</span>
              <input
                type="text"
                value={task.id}
                onChange={(e) => setTask({ ...task, id: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={editorLabelL2Inline}>Title</span>
              <input
                type="text"
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className={editorLabelL2Inline}>Description</span>
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

