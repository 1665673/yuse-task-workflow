"use client";

import { useState } from "react";
import type { Phase5PhraseClozeItem } from "@/lib/task-utils";

interface Phase5PhraseClozeViewProps {
  item: Phase5PhraseClozeItem;
  onContinue: () => void;
}

export function Phase5PhraseClozeView({ item, onContinue }: Phase5PhraseClozeViewProps) {
  const { phraseId, roundIndex, totalRounds, sentence, answer, textHint } = item;
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const isCorrect = submitted && input.trim().toLowerCase() === answer.trim().toLowerCase();

  const handleSubmit = () => {
    if (submitted) return;
    setSubmitted(true);
  };

  return (
    <div className="flex flex-col space-y-6">
      <p className="text-sm text-slate-500">
        Phrase {phraseId} – Round {roundIndex + 1} of {totalRounds}
      </p>

      <p className="text-lg leading-relaxed text-slate-800">{sentence}</p>

      <div className="flex flex-col gap-1">
        {textHint && (
          <p className="text-sm text-slate-600">Hint 1: {textHint}</p>
        )}
        <p className="text-sm text-slate-600">
          Hint 2 (整句翻译):{" "}
          <span className="italic text-slate-400">(translation not found in Task Data)</span>
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Fill in the blank
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={submitted}
          placeholder="Type your answer…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-slate-800 disabled:opacity-70"
        />
        {submitted && (
          <p
            className={`text-sm font-medium ${
              isCorrect ? "text-green-600" : "text-red-600"
            }`}
          >
            {isCorrect ? "Correct!" : `Correct answer: ${answer}`}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
