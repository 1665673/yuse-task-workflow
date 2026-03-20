"use client";

import { useEffect, useState } from "react";
import type {
  Question,
  TaskPackage,
  Phase,
  Step,
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

type TabKey =
  | "info"
  | "tlts"
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

interface QuestionListEditorProps {
  questions: Question[];
  onChange: (next: Question[]) => void;
}

function QuestionListEditor({ questions, onChange }: QuestionListEditorProps) {
  const updateQuestion = (idx: number, next: Question) => {
    const copy = [...questions];
    copy[idx] = next;
    onChange(copy);
  };

  const removeQuestion = (idx: number) => {
    const copy = questions.filter((_, i) => i !== idx);
    onChange(copy);
  };

  const addQuestion = () => {
    const q: Question = {
      type: "text_text",
      stem: { text: "" },
      options: [{ text: "" }],
      correctOptionIndexes: [0],
    };
    onChange([...questions, q]);
  };

  return (
    <div className="space-y-4">
      {questions.map((q, idx) => (
        <div key={idx} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-800">Question {idx + 1}</p>
            <button
              type="button"
              onClick={() => removeQuestion(idx)}
              className="text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Type</span>
              <select
                value={q.type}
                onChange={(e) => updateQuestion(idx, { ...q, type: e.target.value as Question["type"] })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="text_text">text_text</option>
                <option value="text_image">text_image</option>
                <option value="text_cloze">text_cloze</option>
                <option value="audio_text">audio_text</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Guidance purpose (optional)</span>
              <input
                type="text"
                value={q.guidance?.purpose ?? ""}
                onChange={(e) =>
                  updateQuestion(idx, {
                    ...q,
                    guidance: { ...(q.guidance ?? { description: "" }), purpose: e.target.value },
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Guidance description (optional)</span>
              <textarea
                value={q.guidance?.description ?? ""}
                onChange={(e) =>
                  updateQuestion(idx, {
                    ...q,
                    guidance: { ...(q.guidance ?? { purpose: "" }), description: e.target.value },
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-sm"
                rows={2}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Stem text</span>
              <input
                type="text"
                value={q.stem.text ?? ""}
                onChange={(e) => updateQuestion(idx, { ...q, stem: { ...q.stem, text: e.target.value } })}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Stem imageAssetId</span>
              <input
                type="text"
                value={q.stem.imageAssetId ?? ""}
                onChange={(e) =>
                  updateQuestion(idx, { ...q, stem: { ...q.stem, imageAssetId: e.target.value || undefined } })
                }
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Stem audioAssetId</span>
              <input
                type="text"
                value={q.stem.audioAssetId ?? ""}
                onChange={(e) =>
                  updateQuestion(idx, { ...q, stem: { ...q.stem, audioAssetId: e.target.value || undefined } })
                }
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Options</p>
            {q.options.map((opt, oIdx) => {
              const isCorrect = q.correctOptionIndexes.includes(oIdx);
              const toggleCorrect = () => {
                const set = new Set(q.correctOptionIndexes);
                if (set.has(oIdx)) set.delete(oIdx);
                else set.add(oIdx);
                updateQuestion(idx, { ...q, correctOptionIndexes: Array.from(set).sort((a, b) => a - b) });
              };
              const updateOption = (next: typeof opt) => {
                const opts = [...q.options];
                opts[oIdx] = next;
                updateQuestion(idx, { ...q, options: opts });
              };
              const removeOption = () => {
                const opts = q.options.filter((_, i) => i !== oIdx);
                const newCorrect = q.correctOptionIndexes
                  .filter((ci) => ci !== oIdx)
                  .map((ci) => (ci > oIdx ? ci - 1 : ci));
                updateQuestion(idx, { ...q, options: opts, correctOptionIndexes: newCorrect });
              };
              return (
                <div
                  key={oIdx}
                  className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm md:grid-cols-3"
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isCorrect}
                      onChange={toggleCorrect}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-slate-700">Correct</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Option text"
                    value={opt.text ?? ""}
                    onChange={(e) => updateOption({ ...opt, text: e.target.value })}
                    className="rounded border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="text"
                    placeholder="Explanation (optional)"
                    value={opt.explanation ?? ""}
                    onChange={(e) => updateOption({ ...opt, explanation: e.target.value || undefined })}
                    className="rounded border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="text"
                    placeholder="imageAssetId"
                    value={opt.imageAssetId ?? ""}
                    onChange={(e) => updateOption({ ...opt, imageAssetId: e.target.value || undefined })}
                    className="rounded border border-slate-300 px-2 py-1 md:col-span-1"
                  />
                  <input
                    type="text"
                    placeholder="audioAssetId"
                    value={opt.audioAssetId ?? ""}
                    onChange={(e) => updateOption({ ...opt, audioAssetId: e.target.value || undefined })}
                    className="rounded border border-slate-300 px-2 py-1 md:col-span-1"
                  />
                  <div className="flex justify-end md:col-span-1">
                    <button
                      type="button"
                      onClick={removeOption}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove option
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() =>
                updateQuestion(idx, {
                  ...q,
                  options: [...q.options, { text: "" }],
                })
              }
              className="text-sm text-blue-600 hover:underline"
            >
              Add option
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Hint (optional)</span>
            <input
              type="text"
              value={q.hint ?? ""}
              onChange={(e) => updateQuestion(idx, { ...q, hint: e.target.value || undefined })}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add question
      </button>
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

function Phase1Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Call to action text</span>
          <input
            type="text"
            value={step.callToActionText}
            onChange={(e) => updateStep({ ...step, callToActionText: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Step guidance purpose</span>
          <input
            type="text"
            value={step.guidance?.purpose ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { description: "" }), purpose: e.target.value },
              })
            }
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Step guidance description</span>
          <textarea
            value={step.guidance?.description ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { purpose: "" }), description: e.target.value },
              })
            }
            rows={3}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="font-medium text-slate-800">Entry questions</p>
        <QuestionListEditor
          questions={step.entryQuestions ?? []}
          onChange={(next) => updateStep({ ...step, entryQuestions: next })}
        />
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
          <input
            type="text"
            value={step.guidance?.purpose ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { description: "" }), purpose: e.target.value },
              })
            }
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Step guidance description</span>
          <textarea
            value={step.guidance?.description ?? ""}
            onChange={(e) =>
              updateStep({
                ...step,
                guidance: { ...(step.guidance ?? { purpose: "" }), description: e.target.value },
              })
            }
            rows={3}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="font-medium text-slate-800">Warmup questions</p>
        <QuestionListEditor
          questions={step.warmupQuestions ?? []}
          onChange={(next) => updateStep({ ...step, warmupQuestions: next })}
        />
      </div>
    </div>
  );
}

function Phase3Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { phase, index } = findPhase(task, "phase3");
  if (!phase) return <p className="text-sm text-slate-500">Phase \"phase3\" not found.</p>;

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
            <QuestionListEditor questions={qs} onChange={(nextQs) => updateQuestionsForKey(key, nextQs)} />
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

function Phase4Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { phase, index } = findPhase(task, "subtask_learning");
  if (!phase) return <p className="text-sm text-slate-500">Phase \"subtask_learning\" not found.</p>;
  const step = phase.steps.find((s) => s.type === "phase4_subtasks") as Phase4SubtasksStep | undefined;
  if (!step) return <p className="text-sm text-slate-500">No phase4_subtasks step found.</p>;

  const updateStep = (next: Phase4SubtasksStep) => {
    const phases = [...task.phases];
    const steps = [...phase.steps];
    const idx = steps.findIndex((s) => s.type === "phase4_subtasks");
    steps[idx] = next;
    phases[index] = { ...phase, steps };
    setTask({ ...task, phases });
  };

  const subtasks = step.subtasks ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Edit subtasks, linked dialogues, allowed roles, and distractor options for each learner turn.
      </p>

      <div className="space-y-3">
        {subtasks.map((st, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-800">Subtask {i + 1}</p>
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

            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Subtask ID</span>
                <input
                  type="text"
                  value={st.subtaskId}
                  onChange={(e) => {
                    const next = [...subtasks];
                    next[i] = { ...st, subtaskId: e.target.value };
                    updateStep({ ...step, subtasks: next });
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Dialogue ID</span>
                <input
                  type="text"
                  value={st.dialogueId}
                  onChange={(e) => {
                    const next = [...subtasks];
                    next[i] = { ...st, dialogueId: e.target.value };
                    updateStep({ ...step, subtasks: next });
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
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

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Distractor turns</p>
              {(st.dialogDistractors ?? []).map((d, dIdx) => (
                <div key={dIdx} className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium text-slate-700">Turn index</span>
                      <input
                        type="number"
                        value={d.index}
                        onChange={(e) => {
                          const indexNum = Number(e.target.value) || 0;
                          const next = [...(st.dialogDistractors ?? [])];
                          next[dIdx] = { ...d, index: indexNum };
                          const subtasksNext = [...subtasks];
                          subtasksNext[i] = { ...st, dialogDistractors: next };
                          updateStep({ ...step, subtasks: subtasksNext });
                        }}
                        className="w-24 rounded border border-slate-300 px-2 py-1"
                      />
                    </label>
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
                          placeholder="Option ID"
                          value={o.id}
                          onChange={(e) => {
                            const opts = [...(d.options ?? [])];
                            opts[oIdx] = { ...o, id: e.target.value };
                            const ds = [...(st.dialogDistractors ?? [])];
                            ds[dIdx] = { ...d, options: opts };
                            const subtasksNext = [...subtasks];
                            subtasksNext[i] = { ...st, dialogDistractors: ds };
                            updateStep({ ...step, subtasks: subtasksNext });
                          }}
                          className="w-32 rounded border border-slate-300 px-2 py-1"
                        />
                        <input
                          type="text"
                          placeholder="Option text"
                          value={o.text}
                          onChange={(e) => {
                            const opts = [...(d.options ?? [])];
                            opts[oIdx] = { ...o, text: e.target.value };
                            const ds = [...(st.dialogDistractors ?? [])];
                            ds[dIdx] = { ...d, options: opts };
                            const subtasksNext = [...subtasks];
                            subtasksNext[i] = { ...st, dialogDistractors: ds };
                            updateStep({ ...step, subtasks: subtasksNext });
                          }}
                          className="flex-1 rounded border border-slate-300 px-2 py-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const opts = (d.options ?? []).filter((_, idx) => idx !== oIdx);
                            const ds = [...(st.dialogDistractors ?? [])];
                            ds[dIdx] = { ...d, options: opts };
                            const subtasksNext = [...subtasks];
                            subtasksNext[i] = { ...st, dialogDistractors: ds };
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
                        const opts = [...(d.options ?? []), { id: "", text: "" }];
                        const ds = [...(st.dialogDistractors ?? [])];
                        ds[dIdx] = { ...d, options: opts };
                        const subtasksNext = [...subtasks];
                        subtasksNext[i] = { ...st, dialogDistractors: ds };
                        updateStep({ ...step, subtasks: subtasksNext });
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Add option
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = [...(st.dialogDistractors ?? []), { index: 0, options: [] }];
                  const subtasksNext = [...subtasks];
                  subtasksNext[i] = { ...st, dialogDistractors: next };
                  updateStep({ ...step, subtasks: subtasksNext });
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Add distractor turn
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => updateStep({ ...step, subtasks: [...subtasks, { subtaskId: "", allowedRoles: ["user"], dialogueId: "", dialogDistractors: [] }] })}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add subtask
      </button>
    </div>
  );
}

function Phase5Editor({ task, setTask }: { task: TaskPackage; setTask: (t: TaskPackage) => void }) {
  const { phase, index } = findPhase(task, "reinforcement");
  if (!phase) return <p className="text-sm text-slate-500">Phase \"reinforcement\" not found.</p>;

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

  const updateStep = (next: Phase6RoleplayStep) => {
    const phases = [...task.phases];
    const steps = [...phase.steps];
    const idx = steps.findIndex((s) => s.type === "phase6_roleplay");
    steps[idx] = next;
    phases[index] = { ...phase, steps };
    setTask({ ...task, phases });
  };

  const roleplays = step.roleplays ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Configure roleplay entries, linking each to a full-task dialogue and specifying learner hints.
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
                <span className="font-medium text-slate-700">Dialogue ID</span>
                <input
                  type="text"
                  value={rp.dialogueId}
                  onChange={(e) => {
                    const next = [...roleplays];
                    next[i] = { ...rp, dialogueId: e.target.value };
                    updateStep({ ...step, roleplays: next });
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Difficulty</span>
                <input
                  type="text"
                  value={rp.difficulty}
                  onChange={(e) => {
                    const next = [...roleplays];
                    next[i] = { ...rp, difficulty: e.target.value };
                    updateStep({ ...step, roleplays: next });
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
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
              <p className="text-sm font-medium text-slate-700">Hints by turn index</p>
              {(rp.dialogHints ?? []).map((h, hIdx) => (
                <div key={hIdx} className="flex items-center gap-2 text-sm">
                  <input
                    type="number"
                    value={h.index}
                    onChange={(e) => {
                      const hints = [...(rp.dialogHints ?? [])];
                      hints[hIdx] = { ...h, index: Number(e.target.value) || 0 };
                      const next = [...roleplays];
                      next[i] = { ...rp, dialogHints: hints };
                      updateStep({ ...step, roleplays: next });
                    }}
                    className="w-24 rounded border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="text"
                    value={h.text}
                    onChange={(e) => {
                      const hints = [...(rp.dialogHints ?? [])];
                      hints[hIdx] = { ...h, text: e.target.value };
                      const next = [...roleplays];
                      next[i] = { ...rp, dialogHints: hints };
                      updateStep({ ...step, roleplays: next });
                    }}
                    className="flex-1 rounded border border-slate-300 px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const hints = (rp.dialogHints ?? []).filter((_, idx) => idx !== hIdx);
                      const next = [...roleplays];
                      next[i] = { ...rp, dialogHints: hints };
                      updateStep({ ...step, roleplays: next });
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
                  const hints = [...(rp.dialogHints ?? []), { index: 0, text: "" }];
                  const next = [...roleplays];
                  next[i] = { ...rp, dialogHints: hints };
                  updateStep({ ...step, roleplays: next });
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Add hint
              </button>
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
              { allowedRoles: ["user"], dialogueId: "", difficulty: "a", dialogHints: [] },
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
  const [task, setTask] = useState<TaskPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/task");
        if (!res.ok) throw new Error("Failed to load task");
        const data = (await res.json()) as TaskPackage;
        setTask(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCopyJson = () => {
    if (!task) return;
    const json = JSON.stringify(task, null, 2);
    navigator.clipboard
      .writeText(json)
      .catch(() => alert("Failed to copy JSON to clipboard"));
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
      case "tlts":
        return <TltsEditor task={task} setTask={setTask} />;
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
    <main className="flex min-h-screen flex-col bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Edit Task</h1>
            <p className="text-sm text-slate-600">
              Edit the sample task JSON through structured phase editors. Changes are local in the browser; copy
              the JSON when you're done.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyJson}
              disabled={!task}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Copy JSON to clipboard
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
                  { key: "tlts", label: "TLTS" },
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
  );
}

