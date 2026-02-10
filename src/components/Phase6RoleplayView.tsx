"use client";

import { useState } from "react";
import type { TaskPackage } from "@/lib/types";
import type { Phase6RoleplayItem } from "@/lib/task-utils";
import { getRoleTitle } from "@/lib/role-utils";

interface Phase6RoleplayViewProps {
  item: Phase6RoleplayItem;
  task: TaskPackage;
  onContinue: () => void;
}

export function Phase6RoleplayView({ item, task, onContinue }: Phase6RoleplayViewProps) {
  const { step } = item;
  const roleplay = step.roleplays[0];
  if (!roleplay) return null;

  const ourRole = roleplay.allowedRoles[0] ?? "user";
  const getTitle = (roleId: string) => getRoleTitle(task.taskModel, roleId);
  const dialogue = task.taskModel.dialogues.find(
    (d) => d.id === roleplay.dialogueId
  );
  const turns = dialogue?.turns ?? [];

  const hintByIndex = new Map<number, string>();
  (roleplay.dialogHints ?? []).forEach((h) => {
    hintByIndex.set(h.index, h.text);
  });

  const [turnIndex, setTurnIndex] = useState(0);
  const [input, setInput] = useState("");
  /** When user submitted wrong: show their answer + correct answer, and a Next button */
  const [wrongFeedback, setWrongFeedback] = useState<{
    userAnswer: string;
    correctAnswer: string;
  } | null>(null);

  if (turnIndex >= turns.length) {
    return (
      <div className="space-y-4">
        <p className="text-slate-600">Roleplay complete.</p>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    );
  }

  const turn = turns[turnIndex];
  const isOurTurn = turn.role === ourRole;
  const hint = hintByIndex.get(turnIndex);

  const handleSubmit = () => {
    if (!isOurTurn) {
      setTurnIndex((i) => i + 1);
      setWrongFeedback(null);
      return;
    }
    const correct = input.trim() === turn.text.trim();
    if (!correct) {
      setWrongFeedback({ userAnswer: input.trim(), correctAnswer: turn.text });
      setInput("");
      return;
    }
    setWrongFeedback(null);
    setInput("");
    setTurnIndex((i) => i + 1);
  };

  const handleNextAfterWrong = () => {
    setWrongFeedback(null);
    setTurnIndex((i) => i + 1);
  };

  return (
    <div className="flex flex-col space-y-4">
      <p className="text-sm text-slate-500">Roleplay (first dialogue)</p>

      {/* Chat bubbles up to current turn */}
      <div className="space-y-3">
        {turns.slice(0, turnIndex).map((t, i) => (
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

        {/* Current turn: show bubble or hint + input */}
        {!isOurTurn && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-slate-200 px-4 py-2 text-slate-800">
              <p className="text-xs opacity-80">{getTitle(turn.role)}</p>
              <p>{turn.text}</p>
            </div>
          </div>
        )}

        {isOurTurn && !wrongFeedback && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600">
              Your turn {hint ? `– ${hint}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Type your reply…"
                className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
              />
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {isOurTurn && wrongFeedback && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600">
              Your turn {hint ? `– ${hint}` : ""}
            </p>
            <div className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-slate-800">
              <p className="text-xs text-red-600">Your answer</p>
              <p>{wrongFeedback.userAnswer || "(empty)"}</p>
            </div>
            <p className="text-sm text-green-700">
              Correct answer: {wrongFeedback.correctAnswer}
            </p>
            <button
              type="button"
              onClick={handleNextAfterWrong}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {!isOurTurn && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setTurnIndex((i) => i + 1)}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
