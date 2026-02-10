"use client";

import { useState } from "react";
import type { TaskPackage } from "@/lib/types";
import type { Phase5PhraseClozeItem } from "@/lib/task-utils";

interface Phase5PhraseClozeViewProps {
  item: Phase5PhraseClozeItem;
  task: TaskPackage;
  onContinue: () => void;
}

export function Phase5PhraseClozeView({ item, task, onContinue }: Phase5PhraseClozeViewProps) {
  const { phraseId, roundIndex, sentence, answer, textHint, audioHint } = item;
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const isCorrect = submitted && input.trim().toLowerCase() === answer.trim().toLowerCase();

  const handleSubmit = () => {
    if (submitted) return;
    setSubmitted(true);
  };

  const handleAudioClick = () => {
    const asset = audioHint ? task.taskModel.assets.audios[audioHint] : null;
    const hasUrl = asset?.url ?? asset?.base64;
    if (!asset || !hasUrl) {
      alert("audio does not exists");
      return;
    }
    const audio = new Audio(asset.url ?? asset.base64);
    audio.play().catch(console.error);
  };

  return (
    <div className="flex flex-col space-y-6">
      <p className="text-sm text-slate-500">
        Phrase {phraseId} – Round {roundIndex + 1} of 3
      </p>

      <p className="text-lg leading-relaxed text-slate-800">{sentence}</p>

      {(textHint || audioHint) && (
        <div className="flex flex-wrap items-center gap-3">
          {textHint && (
            <p className="text-sm text-slate-600">Hint: {textHint}</p>
          )}
          {audioHint && (
            <button
              type="button"
              onClick={handleAudioClick}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition-colors hover:bg-gray-100"
              aria-label="Play audio hint"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-6 w-6 text-blue-600"
              >
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              <span className="text-sm text-slate-700">Play Audio Hint</span>
            </button>
          )}
        </div>
      )}

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
