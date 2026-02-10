"use client";

import { useState, useEffect } from "react";
import type { TaskPackage } from "@/lib/types";
import type { Phase4SubtaskItem } from "@/lib/task-utils";
import { getRoleTitle } from "@/lib/role-utils";

interface Phase4SubtaskViewProps {
  item: Phase4SubtaskItem;
  task: TaskPackage;
  onContinue: () => void;
}

export function Phase4SubtaskView({ item, task, onContinue }: Phase4SubtaskViewProps) {
  const { step, subtaskIndex } = item;
  const subtask = step.subtasks[subtaskIndex];
  if (!subtask) return null;

  const ourRole = subtask.allowedRoles[0] ?? "user";
  const getTitle = (roleId: string) => getRoleTitle(task.taskModel, roleId);
  const dialogue = task.taskModel.dialogues.find(
    (d) => d.id === subtask.dialogueId
  );
  const turns = dialogue?.turns ?? [];

  const distractorByIndex = new Map<number, { id: string; text: string }[]>();
  (subtask.dialogDistractors ?? []).forEach((d) => {
    distractorByIndex.set(d.index, d.options ?? []);
  });

  const [turnIndex, setTurnIndex] = useState(0);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [choiceRevealed, setChoiceRevealed] = useState(false);

  const turn = turns[turnIndex] ?? null;
  const isOurTurn = turn ? turn.role === ourRole : false;
  const distractorOptions = turn != null ? distractorByIndex.get(turnIndex) : undefined;
  const showChoices =
    isOurTurn && distractorOptions && distractorOptions.length > 0;
  const options = showChoices && turn
    ? [{ text: turn.text, isCorrect: true }, ...distractorOptions!.map((o) => ({ text: o.text, isCorrect: false }))]
    : [];

  const handleChoice = (idx: number) => {
    if (choiceRevealed) return;
    setSelectedChoiceIndex(idx);
    setChoiceRevealed(true);
  };

  // Auto-advance after user selects a choice (show feedback then move to next turn)
  useEffect(() => {
    if (!showChoices || !choiceRevealed) return;
    const t = setTimeout(() => {
      setTurnIndex((i) => i + 1);
      setSelectedChoiceIndex(null);
      setChoiceRevealed(false);
    }, 700);
    return () => clearTimeout(t);
  }, [showChoices, choiceRevealed]);

  // When the other role speaks (or our turn with no options), auto-advance so our options show next.
  // Do NOT auto-advance when we're on the last turn: stay so user can review and click Continue.
  useEffect(() => {
    if (showChoices || turnIndex >= turns.length || turnIndex >= turns.length - 1) return;
    const t = setTimeout(() => {
      setTurnIndex((i) => i + 1);
    }, 1200);
    return () => clearTimeout(t);
  }, [turnIndex, showChoices, turns.length]);

  const dialogueComplete = turnIndex >= turns.length;
  const showContinueButton =
    dialogueComplete || (turnIndex === turns.length - 1 && !showChoices);

  return (
    <div className="flex flex-col space-y-4">
      <p className="text-sm text-slate-500">
        Subtask {subtaskIndex + 1}: {subtask.subtaskId}
      </p>

      {/* Chat bubbles: full dialogue when complete, otherwise up to current turn */}
      <div className="space-y-3">
        {(dialogueComplete ? turns : turns.slice(0, turnIndex)).map((t, i) => (
          <div
            key={i}
            className={`flex ${t.role === ourRole ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                t.role === ourRole
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-800"
              }`}
            >
              <p className="text-xs opacity-80">{getTitle(t.role)}</p>
              <p>{t.text}</p>
            </div>
          </div>
        ))}

        {/* Current turn: show bubble or choices (only when dialogue not complete) */}
        {!dialogueComplete && !showChoices && turn && (
          <div
            className={`flex ${turn.role === ourRole ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                turn.role === ourRole
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-800"
              }`}
            >
              <p className="text-xs opacity-80">{getTitle(turn.role)}</p>
              <p>{turn.text}</p>
            </div>
          </div>
        )}

        {!dialogueComplete && showChoices && (
          <div className="flex flex-col items-end space-y-2">
            <p className="text-sm font-medium text-slate-600">Your reply (choose one):</p>
            <div className="flex max-w-[85%] flex-col items-end gap-2">
              {options.map((opt, idx) => {
                const chosen = selectedChoiceIndex === idx;
                const correct = opt.isCorrect;
                const showCorrect = choiceRevealed && correct;
                const showIncorrect = choiceRevealed && chosen && !correct;
                const borderClass = showCorrect
                  ? "border-green-500 bg-green-50"
                  : showIncorrect
                    ? "border-red-500 bg-red-50"
                    : "border-gray-200 bg-gray-50";

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={choiceRevealed}
                    onClick={() => handleChoice(idx)}
                    className={`flex w-full min-w-[200px] items-center gap-2 rounded-2xl border-2 p-3 text-left ${borderClass} ${!choiceRevealed ? "hover:bg-gray-100" : ""}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${
                        showCorrect ? "bg-green-500 text-white" : showIncorrect ? "bg-red-500 text-white" : "bg-gray-200"
                      }`}
                    >
                      {showCorrect ? "✓" : showIncorrect ? "✗" : String.fromCharCode(65 + idx)}
                    </span>
                    <span>{opt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showContinueButton && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
