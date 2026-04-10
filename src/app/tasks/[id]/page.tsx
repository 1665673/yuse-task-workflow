"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import type { TaskPackage } from "@/lib/types";
import { normalizeTaskPackage } from "@/lib/normalize-task-package";
import {
  flattenTaskFlow,
  type FlowItem,
  type PhaseGuidanceItem,
  type Phase1EntryItem,
} from "@/lib/task-utils";
import { GuidanceBlock } from "@/components/GuidanceBlock";
import { QuestionRenderer } from "@/components/QuestionRenderer";
import { Phase4SubtaskView } from "@/components/Phase4SubtaskView";
import { Phase5SentenceView } from "@/components/Phase5SentenceView";
import { Phase5PhraseClozeView } from "@/components/Phase5PhraseClozeView";
import { Phase6RoleplayView } from "@/components/Phase6RoleplayView";
import { SpeakPracticeView } from "@/components/SpeakPracticeView";
import { logTaskPreviewFetch, logTaskPreviewFlattenError } from "@/lib/task-preview-debug";

const TASK_PREVIEW_BUILD_MARK = "[yuse task preview] page ready";

type Screen = "welcome" | "loading" | "phase-guidance" | "question" | "complete";

const PHASE_NAMES = [
  "Phase 1",
  "Phase 2",
  "Phase 3",
  "Phase 4",
  "Phase 5",
  "Phase 6",
];

const TARGET_LANG_LABELS: Record<string, string> = {
  cn: "Chinese (简体中文)",
  jp: "Japanese (日本語)",
  ko: "Korean (한국어)",
  es: "Spanish (Español)",
  fr: "French (Français)",
  de: "German (Deutsch)",
  pt: "Portuguese (Português)",
  ar: "Arabic (العربية)",
};

export default function TaskDemoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskPackage | null>(null);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [flowIndex, setFlowIndex] = useState(0);
  const [phaseGuidancePhaseIndex, setPhaseGuidancePhaseIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [questionAnswered, setQuestionAnswered] = useState(false);
  const [showPhaseSelector, setShowPhaseSelector] = useState(false);
  /** Currently selected display locale; empty string = original. */
  const [locale, setLocale] = useState<string>("");
  /** Resets after choosing a phase in the top-right "Jump to phase" control. */
  const [phaseJumpValue, setPhaseJumpValue] = useState("");

  const { phaseGuidanceItems, flowItems, flattenError } = useMemo(() => {
    if (!task) {
      return {
        phaseGuidanceItems: [] as PhaseGuidanceItem[],
        flowItems: [] as FlowItem[],
        flattenError: null as string | null,
      };
    }
    try {
      const out = flattenTaskFlow(task);
      return { ...out, flattenError: null };
    } catch (err) {
      logTaskPreviewFlattenError(task, err);
      return {
        phaseGuidanceItems: [] as PhaseGuidanceItem[],
        flowItems: [] as FlowItem[],
        flattenError: err instanceof Error ? err.message : String(err),
      };
    }
  }, [task]);

  const fetchTask = useCallback(async () => {
    setScreen("loading");
    setError(null);
    try {
      const requestUrl = `/api/tasks/${id}`;
      const res = await fetch(requestUrl);
      const raw = await res.json();
      logTaskPreviewFetch("fetchTask (Start Task)", {
        routeTaskId: id,
        requestUrl,
        status: res.status,
        ok: res.ok,
        raw,
      });
      if (!res.ok) throw new Error("Failed to load task");
      const data = normalizeTaskPackage(raw);
      logTaskPreviewFetch("fetchTask (after normalize)", {
        routeTaskId: id,
        requestUrl,
        normalized: data,
      });
      if (!data) {
        throw new Error("Invalid task JSON (missing phases or wrong shape from API)");
      }
      setTask(data);

      const { flowItems: items } = flattenTaskFlow(data);
      const firstIdx = items.findIndex((item) => item.phaseIndex === 0);

      if (data.phases[0]?.guidance) {
        setPhaseGuidancePhaseIndex(0);
        setScreen("phase-guidance");
      } else {
        setFlowIndex(firstIdx >= 0 ? firstIdx : 0);
        setQuestionAnswered(false);
        setScreen("question");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setScreen("welcome");
    }
  }, [id]);

  useEffect(() => {
    console.warn(TASK_PREVIEW_BUILD_MARK);
  }, []);

  /** Visiting `/tasks/<id>` loads the task immediately (no need to click Start). */
  useEffect(() => {
    if (!id) return;
    void fetchTask();
  }, [id, fetchTask]);

  const getFirstFlowIndexForPhase = useCallback(
    (phaseIdx: number) =>
      flowItems.findIndex((item) => item.phaseIndex === phaseIdx),
    [flowItems]
  );

  const jumpToPhase = async (phaseIdx: number) => {
    setShowPhaseSelector(false);
    setScreen("loading");
    setError(null);
    try {
      const requestUrl = `/api/tasks/${id}`;
      const res = await fetch(requestUrl);
      const raw = await res.json();
      logTaskPreviewFetch("jumpToPhase", {
        routeTaskId: id,
        requestUrl,
        status: res.status,
        ok: res.ok,
        raw,
      });
      if (!res.ok) throw new Error("Failed to load task");
      const data = normalizeTaskPackage(raw);
      logTaskPreviewFetch("jumpToPhase (after normalize)", { normalized: data });
      if (!data) {
        throw new Error("Invalid task JSON (missing phases or wrong shape from API)");
      }
      setTask(data);

      const { flowItems: items } = flattenTaskFlow(data);
      const firstIdx = items.findIndex((item) => item.phaseIndex === phaseIdx);

      if (firstIdx === -1) {
        setError(`Phase ${phaseIdx + 1} not found in task`);
        setScreen("welcome");
        return;
      }

      if (data.phases[phaseIdx]?.guidance) {
        setPhaseGuidancePhaseIndex(phaseIdx);
        setScreen("phase-guidance");
      } else {
        setFlowIndex(firstIdx);
        setQuestionAnswered(false);
        setScreen("question");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setScreen("welcome");
    }
  };

  const handlePhaseGuidanceContinue = () => {
    const phaseIdx = phaseGuidancePhaseIndex;
    const firstIdx = getFirstFlowIndexForPhase(phaseIdx);
    setQuestionAnswered(false);
    if (firstIdx === -1) {
      // Phase has guidance but no flow items — skip to next phase
      const nextPhaseIdx = phaseIdx + 1;
      if (!task || nextPhaseIdx >= task.phases.length) {
        setScreen("complete");
      } else if (task.phases[nextPhaseIdx]?.guidance) {
        setPhaseGuidancePhaseIndex(nextPhaseIdx);
        // screen stays "phase-guidance"
      } else {
        const nextFirstIdx = getFirstFlowIndexForPhase(nextPhaseIdx);
        setFlowIndex(nextFirstIdx >= 0 ? nextFirstIdx : 0);
        setScreen("question");
      }
      return;
    }
    setFlowIndex(firstIdx);
    setScreen("question");
  };

  const handleFlowContinue = () => {
    setQuestionAnswered(false);
    const current = flowItems[flowIndex];
    if (!current) return;

    const isLastOverall = flowIndex === flowItems.length - 1;

    if (isLastOverall) {
      setScreen("complete");
      return;
    }

    const nextItem = flowItems[flowIndex + 1];
    const isLastInPhase = nextItem.phaseIndex !== current.phaseIndex;

    if (isLastInPhase) {
      const nextPhaseIndex = current.phaseIndex + 1;
      const nextPhase = task?.phases[nextPhaseIndex];
      if (nextPhase?.guidance) {
        setPhaseGuidancePhaseIndex(nextPhaseIndex);
        setScreen("phase-guidance");
      } else {
        setFlowIndex(flowIndex + 1);
      }
    } else {
      setFlowIndex(flowIndex + 1);
    }
  };

  // ── Translation helpers ────────────────────────────────────────────────────
  const localeDict = locale && task?.locales?.[locale];
  const tr = (text: string | undefined): string => {
    if (!text) return text ?? "";
    if (!localeDict || typeof localeDict !== "object" || Array.isArray(localeDict)) return text;
    return (localeDict as Record<string, string>)[text] ?? text;
  };
  const translateGuidance = (g: { purpose: string; description: string }) => ({
    ...g,
    purpose: tr(g.purpose),
    description: tr(g.description),
  });
  const translateQuestion = (q: import("@/lib/types").Question): import("@/lib/types").Question => {
    if (!q?.stem) {
      console.warn("[yuse task preview] translateQuestion: missing stem");
    }
    return {
      ...q,
      stem: q.stem?.text ? { ...q.stem, text: tr(q.stem.text) } : q.stem,
      options: (q.options ?? []).map((o) => (o?.text ? { ...o, text: tr(o.text) } : o)),
      hint: q.hint ? tr(q.hint) : q.hint,
    };
  };

  // Available languages: those that exist in task.locales
  const availableLocales = task?.locales ? Object.keys(task.locales) : [];

  const backToAdmin = (
    <button
      type="button"
      onClick={() => router.push("/admin")}
      className="fixed left-4 top-4 z-50 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10z" clipRule="evenodd" />
      </svg>
      Admin
    </button>
  );

  /** Language + phase jump — fixed top-right whenever a task is loaded */
  const taskPreviewTools = task && (
    <div className="fixed right-4 top-4 z-50 flex flex-col items-end gap-2">
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        aria-label="Display language"
      >
        <option value="">Original</option>
        {availableLocales.map((code) => (
          <option key={code} value={code}>
            {TARGET_LANG_LABELS[code] ?? code.toUpperCase()}
          </option>
        ))}
      </select>
      <div className="flex min-w-[11rem] flex-col gap-1.5 rounded-lg border-2 border-red-300 bg-white px-3 py-2 shadow-md">
        <span className="text-xs font-bold leading-tight text-red-600">
          Jump to phase — preview tool
        </span>
        <select
          value={phaseJumpValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return;
            const idx = Number(v);
            setPhaseJumpValue("");
            void jumpToPhase(idx);
          }}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-400"
          aria-label="Jump to phase"
        >
          <option value="">Choose phase…</option>
          {PHASE_NAMES.map((name, idx) => (
            <option key={idx} value={idx}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  if (screen === "welcome") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        {backToAdmin}
        {taskPreviewTools}
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold text-slate-800">
            Language Learning Demo
          </h1>
          <p className="mb-6 text-slate-600">
            Click below to start the task workflow. The task will be loaded from
            the sample file.
          </p>
          {error && (
            <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={fetchTask}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Start Task
            </button>
            <button
              type="button"
              onClick={() => setShowPhaseSelector(true)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Jump to Phase
            </button>
          </div>
        </div>

        {/* Phase Selector Modal */}
        {showPhaseSelector && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">
                Select a Phase
              </h2>
              <div className="flex flex-col gap-2">
                {PHASE_NAMES.map((name, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => jumpToPhase(idx)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowPhaseSelector(false)}
                className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (screen === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        {backToAdmin}
        <div className="text-slate-600">Loading task...</div>
      </main>
    );
  }

  if (task && flattenError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        {backToAdmin}
        <div className="w-full max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
          <p className="font-semibold text-red-950">Could not build task flow</p>
          <p className="mt-2 font-mono text-xs text-red-800">{flattenError}</p>
          <p className="mt-3 text-red-800">
            Open DevTools → Console and filter by <code className="rounded bg-red-100 px-1">[yuse task preview]</code> for
            the full task JSON and API response.
          </p>
          <button
            type="button"
            onClick={() => {
              setTask(null);
              setScreen("welcome");
            }}
            className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-900 hover:bg-red-100"
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  if (screen === "phase-guidance" && task) {
    const phase = task.phases[phaseGuidancePhaseIndex];
    if (!phase?.guidance) return null;

    return (
      <main className="flex min-h-screen flex-col bg-slate-50 p-6">
        {backToAdmin}
        {taskPreviewTools}
        <div className="mx-auto flex max-w-2xl flex-1 flex-col">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">
            Phase: {phase.type}
          </h2>
          <GuidanceBlock guidance={translateGuidance(phase.guidance)} label="Phase guidance" />
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={handlePhaseGuidanceContinue}
              className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (screen === "question" && task && flowItems[flowIndex]) {
    const item = flowItems[flowIndex];
    const { step, phaseIndex, stepIndex } = item;

    const showStepGuidance = step.guidance && item.kind !== "phase1_entry";
    const showQuestionGuidance = item.kind === "question" && item.question.guidance;

    return (
      <main className="flex min-h-screen flex-col bg-slate-50 p-6">
        {backToAdmin}
        {taskPreviewTools}
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          {showStepGuidance && (
            <div className="mb-4">
              <GuidanceBlock
                guidance={translateGuidance(step.guidance!)}
                label={`Step: ${step.id}`}
              />
            </div>
          )}

          {showQuestionGuidance && item.kind === "question" && (
            <div className="mb-4">
              <GuidanceBlock
                guidance={translateGuidance(item.question.guidance!)}
                label="Question guidance"
              />
            </div>
          )}

          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {item.kind === "phase1_entry" && (() => {
              const entry = item as Phase1EntryItem;
              return (
                <div className="flex flex-col gap-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Phase 1 — Entry</p>
                  {(() => {
                    const imgUrl = entry.step.thumbnail
                      ? task.taskModel.assets.images?.[entry.step.thumbnail]?.url
                      : undefined;
                    return imgUrl ? (
                      <div className="aspect-square w-full overflow-hidden rounded-xl">
                        <img
                          src={imgUrl}
                          alt="Task thumbnail"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-square w-full flex items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
                        <p className="text-sm text-slate-400">task thumbnail not found</p>
                      </div>
                    );
                  })()}
                  {entry.step.guidance?.description && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-500">任务概述</p>
                      <p className="text-slate-700 leading-relaxed">{tr(entry.step.guidance.description)}</p>
                    </div>
                  )}
                  {entry.step.guidance?.purpose && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-500">学习目标</p>
                      <p className="text-slate-700 leading-relaxed">{tr(entry.step.guidance.purpose)}</p>
                    </div>
                  )}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleFlowContinue}
                      className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      {tr(entry.step.callToActionText) || "Start"}
                    </button>
                  </div>
                </div>
              );
            })()}
            {item.kind === "question" && (
              <>
                <p className="mb-4 text-sm text-slate-500">
                  Phase {phaseIndex + 1} / Step {stepIndex + 1} / Question{" "}
                  {item.questionIndex + 1}
                </p>
                <QuestionRenderer
                  key={`flow-${flowIndex}`}
                  question={translateQuestion(item.question)}
                  taskModel={task.taskModel}
                  onAnswer={() => setQuestionAnswered(true)}
                />
              </>
            )}
            {item.kind === "phase4_subtask" && (
              <Phase4SubtaskView
                key={`flow-${flowIndex}`}
                item={item}
                task={task}
                onContinue={handleFlowContinue}
              />
            )}
            {item.kind === "phase5_sentence" && (
              <Phase5SentenceView
                key={`flow-${flowIndex}`}
                item={item}
                onContinue={handleFlowContinue}
              />
            )}
            {item.kind === "phase5_phrase_cloze" && (
              <Phase5PhraseClozeView
                key={`flow-${flowIndex}`}
                item={item}
                onContinue={handleFlowContinue}
              />
            )}
            {item.kind === "phase6_roleplay" && (
              <Phase6RoleplayView
                key={`flow-${flowIndex}`}
                item={item}
                task={task}
                onContinue={handleFlowContinue}
              />
            )}
            {item.kind === "phase5_speak_practice" && (
              <>
                <p className="mb-4 text-sm text-slate-500">
                  Phase {phaseIndex + 1} / Step {stepIndex + 1} / Speaking Practice
                </p>
                <SpeakPracticeView
                  key={`flow-${flowIndex}`}
                  textToSpeak={item.textToSpeak}
                  onContinue={handleFlowContinue}
                />
              </>
            )}
          </div>

          {/* Continue button — question items only; all other kinds handle it internally */}
          {item.kind === "question" && (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleFlowContinue}
                disabled={!questionAnswered}
                className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (screen === "complete") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        {backToAdmin}
        {taskPreviewTools}
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold text-slate-800">
            Task Complete
          </h1>
          <p className="mb-6 text-slate-600">
            You have completed all phases. Great job!
          </p>
          <button
            type="button"
            onClick={() => {
              setScreen("welcome");
              setTask(null);
              setFlowIndex(0);
            }}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Start Over
          </button>
        </div>
      </main>
    );
  }

  return null;
}
