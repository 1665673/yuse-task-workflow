"use client";

import { useState } from "react";
import type { Phase5PhraseRecognitionItem } from "@/lib/task-utils";

interface Phase5PhraseRecognitionViewProps {
  item: Phase5PhraseRecognitionItem;
  onContinue: () => void;
}

export function Phase5PhraseRecognitionView({
  item,
  onContinue,
}: Phase5PhraseRecognitionViewProps) {
  const { phraseId, phraseText, phraseTranslation, phraseDistractor } = item;

  const [options] = useState(() => {
    const opts = [
      { text: phraseText, isCorrect: true },
      { text: phraseDistractor, isCorrect: false },
    ];
    return Math.random() > 0.5 ? [opts[1], opts[0]] : opts;
  });

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const submitted = selectedIndex !== null;
  const isCorrect = submitted && options[selectedIndex!].isCorrect;

  const handleSelect = (idx: number) => {
    if (submitted) return;
    setSelectedIndex(idx);
  };

  return (
    <div className="flex flex-col space-y-6">
      <p className="text-sm text-slate-500">
        Phrase Recognition – {phraseId}
      </p>

      <div>
        <p className="mb-2 text-base font-medium text-slate-700">请根据翻译选择正确的短语</p>
        <p className="text-xl font-semibold text-slate-800">
          {phraseTranslation || (
            <span className="italic text-slate-400">(no translation available in Task Data)</span>
          )}
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-slate-600">
          Which phrase matches this translation?
        </p>
        <div className="flex flex-col gap-3">
          {options.map((opt, idx) => {
            let btnClass =
              "rounded-lg border px-4 py-3 text-left font-medium transition-colors ";
            if (!submitted) {
              btnClass +=
                "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50";
            } else if (opt.isCorrect) {
              btnClass += "border-green-500 bg-green-50 text-green-800";
            } else if (idx === selectedIndex) {
              btnClass += "border-red-400 bg-red-50 text-red-800";
            } else {
              btnClass += "border-slate-200 bg-white text-slate-400 opacity-60";
            }
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(idx)}
                disabled={submitted}
                className={btnClass}
              >
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>

      {submitted && (
        <p
          className={`text-sm font-medium ${
            isCorrect ? "text-green-600" : "text-red-600"
          }`}
        >
          {isCorrect ? "Correct!" : `Correct answer: ${phraseText}`}
        </p>
      )}

      {submitted && (
        <div className="flex justify-end">
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
