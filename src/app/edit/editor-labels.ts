/**
 * Visual hierarchy for task editor section titles (Tailwind classes).
 * L1 = major groups, L2 = subsections within a group, L3 = numbered units (questions, dialogues, …).
 */

/** Level 1 — Major groups: Word questions, Warmup questions, Phase 5 blocks, Assets / TLTS headings */
export const editorLabelL1 =
  "mb-2 text-base font-semibold tracking-tight text-indigo-950 border-l-4 border-indigo-500 pl-3 py-2 bg-gradient-to-r from-indigo-50 to-indigo-50/40 rounded-r-lg shadow-sm";

/** Level 2 — Subsections: Stem, Options, Turns, Dialogue — distractor turns, … */
export const editorLabelL2 =
  "mb-1.5 text-sm font-semibold text-teal-900 border-b-2 border-teal-400/60 pb-1";

/** Level 3 — Repeatable units: Question n, Dialogue n, Subtask n, Roleplay n */
export const editorLabelL3 =
  "rounded-md border border-violet-300/90 bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-950 shadow-sm";

/** Inline emphasis for nested labels (Item ID, hint rows) without full-width rule */
export const editorLabelL2Inline = "text-sm font-semibold text-teal-800";

/** Primary CTA for main “Add …” actions (question, dialogue, item, asset row, subtask, roleplay, …) */
export const editorAddPrimaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/30 transition hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-600/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:bg-indigo-700";

/** Compact primary for nested adds (option, distractor turn, sentence line, …) */
export const editorAddPrimaryButtonSm =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:bg-indigo-700";
