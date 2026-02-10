"use client";

import { useState, useMemo } from "react";
import type { Phase5SentenceItem } from "@/lib/task-utils";

interface Phase5SentenceViewProps {
  item: Phase5SentenceItem;
  onContinue: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function Phase5SentenceView({ item, onContinue }: Phase5SentenceViewProps) {
  const { sentence } = item;
  const words = useMemo(
    () => (sentence ? sentence.trim().split(/\s+/) : []).filter(Boolean),
    [sentence]
  );
  const [shuffledWords, setShuffledWords] = useState<string[]>(() =>
    shuffle(words)
  );
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);

  const isEmpty = words.length === 0;
  const isComplete = !isEmpty && shuffledWords.length === 0 && selectedOrder.length > 0;
  const isCorrect =
    isComplete &&
    selectedOrder.join(" ") === words.join(" ");

  const handleWordClick = (word: string, idx: number) => {
    if (checked) return;
    setSelectedOrder((prev) => [...prev, word]);
    setShuffledWords((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleReset = () => {
    setSelectedOrder([]);
    setShuffledWords(shuffle(words));
    setChecked(false);
  };

  if (isEmpty) {
    return (
      <div className="flex flex-col space-y-4">
        <p className="text-slate-600">No sentence for this step.</p>
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

  return (
    <div className="flex flex-col space-y-6">
      <p className="text-sm text-slate-500">
        Sentence {item.sentenceIndex + 1}: Tap words in order to form the sentence.
      </p>

      {/* Built sentence (slots) */}
      <div className="min-h-[3rem] rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-3">
        {selectedOrder.length === 0 ? (
          <span className="text-slate-400">Click words below to build the sentence…</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedOrder.map((w, i) => (
              <span
                key={`${i}-${w}`}
                className="rounded bg-white px-2 py-1 text-slate-800 shadow-sm"
              >
                {w}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Word bank (shuffled) */}
      <div className="flex flex-wrap gap-2">
        {shuffledWords.map((word, idx) => (
          <button
            key={`${idx}-${word}`}
            type="button"
            disabled={checked}
            onClick={() => handleWordClick(word, idx)}
            className="rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-slate-800 shadow-sm hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            {word}
          </button>
        ))}
      </div>

      {/* Result + actions */}
      {isComplete && (
        <div className="space-y-2">
          <p
            className={`font-medium ${isCorrect ? "text-green-600" : "text-red-600"}`}
          >
            {isCorrect ? "Correct!" : "Not quite. Check the order and try again."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
