"use client";

import { useState, useMemo } from "react";
import type { Question, TaskModel } from "@/lib/types";
import { ImagePlaceholder, AudioPlaceholder } from "./AssetPlaceholder";

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface QuestionRendererProps {
  question: Question;
  taskModel: TaskModel;
  onAnswer?: () => void;
}

export function QuestionRenderer({ question, taskModel, onAnswer }: QuestionRendererProps) {
  const { stem, options, correctOptionIndexes } = question;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Shuffle options once per question; keep track of original index for correctness
  const { shuffledOptions, correctShuffledIndexes } = useMemo(() => {
    const withIndex = options.map((opt, i) => ({ opt, originalIndex: i }));
    const shuffled = shuffle(withIndex);
    const correctShuffledIndexes = correctOptionIndexes.map(
      (orig) => shuffled.findIndex((e) => e.originalIndex === orig)
    );
    return {
      shuffledOptions: shuffled.map((e) => e.opt),
      correctShuffledIndexes,
    };
  }, [options, correctOptionIndexes]);

  const handleSelect = (idx: number) => {
    if (selectedIndex !== null) return;
    setSelectedIndex(idx);
    onAnswer?.();
  };

  const isCorrect = (idx: number) => correctShuffledIndexes.includes(idx);
  const hasAnswered = selectedIndex !== null;
  const selectedOption =
    selectedIndex !== null ? shuffledOptions[selectedIndex] : null;

  return (
    <div className="space-y-6">
      {/* Stem (题干) */}
      <div className="space-y-3">
        {stem.text && (
          <p className="text-lg leading-relaxed">{stem.text}</p>
        )}
        {stem.imageAssetId && (
          <ImagePlaceholder
            taskModel={taskModel}
            imageAssetId={stem.imageAssetId}
          />
        )}
        {stem.audioAssetId && (
          <AudioPlaceholder
            taskModel={taskModel}
            audioAssetId={stem.audioAssetId}
          />
        )}
      </div>

      {/* Options (选项) - shuffled, interactive */}
      <div className="space-y-2">
        {shuffledOptions.map((opt, idx) => {
          const chosen = selectedIndex === idx;
          const correct = isCorrect(idx);
          const showCorrect = hasAnswered && correct;
          const showIncorrect = hasAnswered && chosen && !correct;
          const borderClass = showCorrect
            ? "border-green-500 bg-green-50"
            : showIncorrect
              ? "border-red-500 bg-red-50"
              : "border-gray-200 bg-gray-50";
          const isDisabled = hasAnswered;

          return (
            <button
              key={idx}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && handleSelect(idx)}
              className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${borderClass} ${!isDisabled ? "cursor-pointer hover:bg-gray-100" : "cursor-default"}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                  showCorrect
                    ? "bg-green-500 text-white"
                    : showIncorrect
                      ? "bg-red-500 text-white"
                      : "bg-gray-200"
                }`}
              >
                {showCorrect ? "✓" : showIncorrect ? "✗" : String.fromCharCode(65 + idx)}
              </span>
              {opt.text && <span>{opt.text}</span>}
              {opt.imageAssetId && (
                <ImagePlaceholder
                  taskModel={taskModel}
                  imageAssetId={opt.imageAssetId}
                />
              )}
              {opt.audioAssetId && (
                <AudioPlaceholder
                  taskModel={taskModel}
                  audioAssetId={opt.audioAssetId}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Explanations - show when any option has explanation (for correct or incorrect input) */}
      {hasAnswered &&
        (selectedOption?.explanation ||
          shuffledOptions.some((opt, idx) => isCorrect(idx) && opt.explanation)) && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">Explanations</p>
            {selectedOption?.explanation && (
              <p className="text-sm text-amber-800">
                Your choice: {selectedOption.explanation}
              </p>
            )}
            {selectedIndex !== null &&
              !isCorrect(selectedIndex) &&
              shuffledOptions
                .filter((_, idx) => isCorrect(idx) && shuffledOptions[idx].explanation)
                .map((opt, i) => (
                  <p key={i} className="text-sm text-amber-800">
                    Correct: {opt.explanation}
                  </p>
                ))}
          </div>
        )}

      {question.hint && !hasAnswered && (
        <p className="text-sm text-gray-500">Hint: {question.hint}</p>
      )}
    </div>
  );
}
