"use client";

import { useState, useCallback } from "react";
import type { TaskPackage } from "@/lib/types";
import {
  flattenTaskFlow,
  type FlowItem,
  type PhaseGuidanceItem,
} from "@/lib/task-utils";
import { GuidanceBlock } from "@/components/GuidanceBlock";
import { QuestionRenderer } from "@/components/QuestionRenderer";
import { Phase4SubtaskView } from "@/components/Phase4SubtaskView";
import { Phase5SentenceView } from "@/components/Phase5SentenceView";
import { Phase5PhraseClozeView } from "@/components/Phase5PhraseClozeView";
import { Phase6RoleplayView } from "@/components/Phase6RoleplayView";

type Screen = "welcome" | "loading" | "phase-guidance" | "question" | "complete";

export default function TaskDemoPage() {
  const [task, setTask] = useState<TaskPackage | null>(null);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [flowIndex, setFlowIndex] = useState(0);
  const [phaseGuidancePhaseIndex, setPhaseGuidancePhaseIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [questionAnswered, setQuestionAnswered] = useState(false);

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
      setScreen("welcome");
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

  if (screen === "welcome") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
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
          <button
            type="button"
            onClick={fetchTask}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Start Task
          </button>
        </div>
      </main>
    );
  }

  if (screen === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="text-slate-600">Loading task...</div>
      </main>
    );
  }

  if (screen === "phase-guidance" && task) {
    const phase = task.phases[phaseGuidancePhaseIndex];
    if (!phase?.guidance) return null;

    return (
      <main className="flex min-h-screen flex-col bg-slate-50 p-6">
        <div className="mx-auto flex max-w-2xl flex-1 flex-col">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">
            Phase: {phase.type}
          </h2>
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
    );
  }

  if (screen === "question" && task && flowItems[flowIndex]) {
    const item = flowItems[flowIndex];
    const { step, phaseIndex, stepIndex } = item;

    const showStepGuidance = step.guidance;
    const showQuestionGuidance = item.kind === "question" && item.question.guidance;

    return (
      <main className="flex min-h-screen flex-col bg-slate-50 p-6">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          {showStepGuidance && (
            <div className="mb-4">
              <GuidanceBlock
                guidance={step.guidance!}
                label={`Step: ${step.id}`}
              />
            </div>
          )}

          {showQuestionGuidance && item.kind === "question" && (
            <div className="mb-4">
              <GuidanceBlock
                guidance={item.question.guidance!}
                label="Question guidance"
              />
            </div>
          )}

          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {item.kind === "question" && (
              <>
                <p className="mb-4 text-sm text-slate-500">
                  Phase {phaseIndex + 1} / Step {stepIndex + 1} / Question{" "}
                  {item.questionIndex + 1}
                </p>
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

          {/* Continue button - for question items always at bottom; phase4/5/6 have Continue inside their view */}
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
