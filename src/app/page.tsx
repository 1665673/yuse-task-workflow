"use client";

import { useState, useCallback, useEffect } from "react";
import type { TaskPackage, Phase } from "@/lib/types";
import {
  flattenTaskFlow,
  getFlowItemNavLabel,
  type FlowItem,
  type PhaseGuidanceItem,
} from "@/lib/task-utils";
import { GuidanceBlock } from "@/components/GuidanceBlock";
import { QuestionRenderer } from "@/components/QuestionRenderer";
import { Phase4SubtaskView } from "@/components/Phase4SubtaskView";
import { Phase5SentenceView } from "@/components/Phase5SentenceView";
import { Phase5PhraseClozeView } from "@/components/Phase5PhraseClozeView";
import { Phase6RoleplayView } from "@/components/Phase6RoleplayView";

type Screen = "loading" | "phase-guidance" | "question" | "complete" | "error";

export default function TaskDemoPage() {
  const [task, setTask] = useState<TaskPackage | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [flowIndex, setFlowIndex] = useState(0);
  const [phaseGuidancePhaseIndex, setPhaseGuidancePhaseIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [questionAnswered, setQuestionAnswered] = useState(false);
  const [phaseJsonModalPhase, setPhaseJsonModalPhase] = useState<Phase | null>(null);

  const { phaseGuidanceItems, flowItems } = task
    ? flattenTaskFlow(task)
    : { phaseGuidanceItems: [] as PhaseGuidanceItem[], flowItems: [] as FlowItem[] };

  const getFirstFlowIndexForPhase = useCallback(
    (phaseIdx: number) =>
      flowItems.findIndex((item) => item.phaseIndex === phaseIdx),
    [flowItems]
  );

  const fetchTask = async () => {
    setScreen("loading");
    setError(null);
    try {
      const res = await fetch("/api/task");
      if (!res.ok) throw new Error("Failed to load task");
      const data: TaskPackage = await res.json();
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
      setScreen("error");
    }
  };

  const handlePhaseGuidanceContinue = () => {
    const phaseIdx = phaseGuidancePhaseIndex;
    const firstIdx = getFirstFlowIndexForPhase(phaseIdx);
    setFlowIndex(firstIdx);
    setQuestionAnswered(false);
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

  useEffect(() => {
    fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (screen === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="text-slate-600">Loading task...</div>
      </main>
    );
  }

  if (screen === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold text-slate-800">
            Failed to load task
          </h1>
          <p className="mb-4 text-sm text-slate-600">
            {error ?? "An unknown error occurred while loading the sample task."}
          </p>
          <button
            type="button"
            onClick={fetchTask}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (screen === "phase-guidance" && task) {
    const phase = task.phases[phaseGuidancePhaseIndex];
    if (!phase?.guidance) return null;

    return (
      <>
        <main className="flex min-h-screen flex-col bg-slate-50 p-6">
        <div className="mx-auto flex max-w-2xl flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-800">
              Phase: {phase.type}
            </h2>
            <button
              type="button"
              onClick={() => setPhaseJsonModalPhase(phase)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="View phase JSON"
              aria-label="View phase JSON"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
          </div>
          <GuidanceBlock guidance={phase.guidance} label="Phase guidance" />
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
      {phaseJsonModalPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Phase data (JSON)</h3>
              <button
                type="button"
                onClick={() => setPhaseJsonModalPhase(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs text-slate-800">
              {JSON.stringify(phaseJsonModalPhase, null, 2)}
            </pre>
          </div>
        </div>
      )}
      </>
    );
  }

  if (screen === "question" && task && flowItems[flowIndex]) {
    const item = flowItems[flowIndex];
    const { step, phaseIndex, stepIndex } = item;

    const showStepGuidance = step.guidance;
    const showQuestionGuidance = item.kind === "question" && item.question.guidance;

    return (
      <>
      <main className="flex min-h-screen flex-col bg-slate-50 p-4 sm:p-6">
        <div className="mb-4 mx-auto flex w-full max-w-2xl flex-1 flex-col min-h-0">
          {showStepGuidance && (
            <div className="mb-3 flex-shrink-0">
              <GuidanceBlock
                guidance={step.guidance!}
                label={`Step: ${step.id}`}
              />
            </div>
          )}

          {showQuestionGuidance && item.kind === "question" && (
            <div className="mb-3 flex-shrink-0">
              <GuidanceBlock
                guidance={item.question.guidance!}
                label="Question guidance"
              />
            </div>
          )}

<div className="mb-4 max-h-[85vh] min-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                {getFlowItemNavLabel(item)}
              </p>
              <button
                type="button"
                onClick={() => setPhaseJsonModalPhase(item.phase)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                title="View phase JSON"
                aria-label="View phase JSON"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </button>
            </div>
            {item.kind === "question" && (
              <>
                <QuestionRenderer
                  key={`flow-${flowIndex}`}
                  question={item.question}
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
                task={task}
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
          </div>

          {/* Continue button - for question items; kept in view on small screens */}
          {item.kind === "question" && (
            <div className="mb-4 flex flex-shrink-0 justify-end">
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
      {phaseJsonModalPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Phase data (JSON)</h3>
              <button
                type="button"
                onClick={() => setPhaseJsonModalPhase(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs text-slate-800">
              {JSON.stringify(phaseJsonModalPhase, null, 2)}
            </pre>
          </div>
        </div>
      )}
      </>
    );
  }

  if (screen === "complete") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
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
              setScreen("loading");
              setTask(null);
              setFlowIndex(0);
              fetchTask();
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
