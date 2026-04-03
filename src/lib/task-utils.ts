/**
 * Utilities to extract and flatten flow items from phases/steps
 */

import type { Phase, Step, Question, TaskPackage } from "./types";
import type {
  Dialogue,
  Phase1EntryStep,
  Phase4SubtaskEntry,
  Phase4SubtasksStep,
  Phase5PhrasesStep,
  Phase5SentencesStep,
  Phase6RoleplayEntry,
  Phase6RoleplayStep,
} from "./types";

export interface Phase1EntryItem {
  kind: "phase1_entry";
  phaseIndex: number;
  stepIndex: number;
  step: Phase1EntryStep;
  phase: Phase;
}

export interface QuestionItem {
  kind: "question";
  phaseIndex: number;
  stepIndex: number;
  questionIndex: number;
  question: Question;
  step: Step;
  phase: Phase;
}

export interface Phase4SubtaskItem {
  kind: "phase4_subtask";
  phaseIndex: number;
  stepIndex: number;
  subtaskIndex: number;
  step: Phase4SubtasksStep;
  phase: Phase;
}

export interface Phase5SentenceItem {
  kind: "phase5_sentence";
  phaseIndex: number;
  stepIndex: number;
  sentenceIndex: number;
  sentence: string;
  step: Phase5SentencesStep;
  phase: Phase;
}

export interface Phase5PhraseClozeItem {
  kind: "phase5_phrase_cloze";
  phaseIndex: number;
  stepIndex: number;
  phraseId: string;
  roundIndex: number;
  totalRounds: number;
  sentence: string;
  answer: string;
  textHint?: string;
  audioHint?: string;
  step: Phase5PhrasesStep;
  phase: Phase;
}

export interface Phase5PhraseRecognitionItem {
  kind: "phase5_phrase_recognition";
  phaseIndex: number;
  stepIndex: number;
  phraseId: string;
  phraseText: string;
  phraseTranslation: string;
  phraseDistractor: string;
  step: Phase5PhrasesStep;
  phase: Phase;
}

export interface Phase6RoleplayItem {
  kind: "phase6_roleplay";
  phaseIndex: number;
  stepIndex: number;
  step: Phase6RoleplayStep;
  phase: Phase;
}

export interface Phase5SpeakPracticeItem {
  kind: "phase5_speak_practice";
  phaseIndex: number;
  stepIndex: number;
  textToSpeak: string;
  sourceType: "word" | "sentence" | "phrase";
  step: Step;
  phase: Phase;
}

export type FlowItem =
  | Phase1EntryItem
  | QuestionItem
  | Phase4SubtaskItem
  | Phase5SentenceItem
  | Phase5PhraseClozeItem
  | Phase5PhraseRecognitionItem
  | Phase6RoleplayItem
  | Phase5SpeakPracticeItem;

export interface PhaseGuidanceItem {
  phaseIndex: number;
  phase: Phase;
}

function getQuestionsFromStep(step: Step): Question[] {
  switch (step.type) {
    case "phase1_task_entry":
      return step.entryQuestions ?? [];
    case "phase2_warmup":
      return step.warmupQuestions ?? [];
    case "phase3_words":
      return Object.values(step.wordQuestions ?? {}).flat();
    case "phase3_phrases":
      return Object.values(step.phraseQuestions ?? {}).flat();
    case "phase3_sentences":
      return Object.values(step.sentenceQuestions ?? {}).flat();
    case "phase5_words":
      return Object.values(step.wordQuestions ?? {}).flat();
    case "phase5_phrases":
      return Object.values((step as Phase5PhrasesStep).phraseQuestions ?? {}).flat();
    case "phase4_subtasks":
    case "phase5_sentences":
    case "phase6_roleplay":
      return [];
    default:
      return [];
  }
}

/**
 * Flatten all phases/steps into a navigable list of flow items
 */
export function flattenTaskFlow(task: TaskPackage): {
  phaseGuidanceItems: PhaseGuidanceItem[];
  flowItems: FlowItem[];
} {
  const phaseGuidanceItems: PhaseGuidanceItem[] = [];
  const flowItems: FlowItem[] = [];

  task.phases.forEach((phase, phaseIndex) => {
    phase.steps.forEach((step, stepIndex) => {
      if (step.type === "phase4_subtasks") {
        const st = step as Phase4SubtasksStep;
        (st.subtasks ?? []).forEach((_, subtaskIndex) => {
          flowItems.push({
            kind: "phase4_subtask",
            phaseIndex,
            stepIndex,
            subtaskIndex,
            step: st,
            phase,
          });
        });
        return;
      }
      if (step.type === "phase5_sentences") {
        const st = step as Phase5SentencesStep;
        const sentences = st.sentences ?? [];
        sentences.forEach((sentence, sentenceIndex) => {
          flowItems.push({
            kind: "phase5_sentence",
            phaseIndex,
            stepIndex,
            sentenceIndex,
            sentence,
            step: st,
            phase,
          });
          // Add speak practice after each sentence practice
          if (sentence) {
            flowItems.push({
              kind: "phase5_speak_practice",
              phaseIndex,
              stepIndex,
              textToSpeak: sentence,
              sourceType: "sentence",
              step: st,
              phase,
            });
          }
        });
        if (sentences.length === 0) {
          flowItems.push({
            kind: "phase5_sentence",
            phaseIndex,
            stepIndex,
            sentenceIndex: 0,
            sentence: "",
            step: st,
            phase,
          });
        }
        return;
      }
      if (step.type === "phase5_phrases") {
        const st = step as Phase5PhrasesStep;
        const phraseClozes = st.phraseClozes ?? {};
        Object.entries(phraseClozes).forEach(([phraseId, entry]) => {
          if (entry.phraseDistractor) {
            const phraseText = task.taskModel.tlts.phrases[phraseId] ?? phraseId;
            const phraseTranslation = task.translations[phraseId]?.native ?? "";
            flowItems.push({
              kind: "phase5_phrase_recognition",
              phaseIndex,
              stepIndex,
              phraseId,
              phraseText,
              phraseTranslation,
              phraseDistractor: entry.phraseDistractor,
              step: st,
              phase,
            });
          }
          const sentences = entry.sentences ?? [];
          const totalRounds = sentences.length;
          sentences.forEach((sentence, roundIndex) => {
            flowItems.push({
              kind: "phase5_phrase_cloze",
              phaseIndex,
              stepIndex,
              phraseId,
              roundIndex,
              totalRounds,
              sentence,
              answer: entry.answer ?? "",
              textHint: entry.textHint,
              audioHint: entry.audioHint,
              step: st,
              phase,
            });
          });
        });
        if (Object.keys(phraseClozes).length === 0) {
          const questions = getQuestionsFromStep(step);
          questions.forEach((question, questionIndex) => {
            flowItems.push({
              kind: "question",
              phaseIndex,
              stepIndex,
              questionIndex,
              question,
              step,
              phase,
            });
          });
        }
        return;
      }
      if (step.type === "phase6_roleplay") {
        const st = step as Phase6RoleplayStep;
        const roleplays = st.roleplays ?? [];
        if (roleplays.length > 0) {
          flowItems.push({
            kind: "phase6_roleplay",
            phaseIndex,
            stepIndex,
            step: st,
            phase,
          });
        }
        return;
      }

      // Handle phase5_words specially to add speak practice after each question
      if (step.type === "phase5_words") {
        const wordQuestions = step.wordQuestions ?? {};
        Object.entries(wordQuestions).forEach(([wordId, questions]) => {
          // Get the word text from tlts
          const wordText = task.taskModel.tlts.words[wordId] ?? wordId;
          questions.forEach((question, questionIndex) => {
            flowItems.push({
              kind: "question",
              phaseIndex,
              stepIndex,
              questionIndex,
              question,
              step,
              phase,
            });
            // Add speak practice after each question for this word
            flowItems.push({
              kind: "phase5_speak_practice",
              phaseIndex,
              stepIndex,
              textToSpeak: wordText,
              sourceType: "word",
              step,
              phase,
            });
          });
        });
        return;
      }

      // Phase 1 entry: always add an entry card, then any optional questions
      if (step.type === "phase1_task_entry") {
        flowItems.push({
          kind: "phase1_entry",
          phaseIndex,
          stepIndex,
          step: step as Phase1EntryStep,
          phase,
        });
        (step.entryQuestions ?? []).forEach((question, questionIndex) => {
          flowItems.push({ kind: "question", phaseIndex, stepIndex, questionIndex, question, step, phase });
        });
        return;
      }

      const questions = getQuestionsFromStep(step);
      questions.forEach((question, questionIndex) => {
        flowItems.push({
          kind: "question",
          phaseIndex,
          stepIndex,
          questionIndex,
          question,
          step,
          phase,
        });
      });
    });

    if (phase.guidance) {
      phaseGuidanceItems.push({ phaseIndex, phase });
    }
  });

  return { phaseGuidanceItems, flowItems };
}

/** Storage id for phase-4 distractor options (schema still requires `id`; hidden in admin). */
export function newPhase4DistractorOptionId(existing: readonly { id?: string }[]): string {
  const used = new Set(existing.map((o) => (o.id ?? "").trim()).filter(Boolean));
  for (;;) {
    const id = `opt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    if (!used.has(id)) return id;
  }
}

/** Unique subtask id for phase 4 (admin does not edit; stored in JSON). */
export function newPhase4SubtaskId(used: ReadonlySet<string>): string {
  for (;;) {
    const id = `st_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    if (!used.has(id)) return id;
  }
}

/** Fills missing `subtaskId` values so every subtask row has a stable generated id. */
export function ensurePhase4SubtaskIds(subtasks: Phase4SubtaskEntry[]): Phase4SubtaskEntry[] {
  const taken = new Set<string>();
  for (const s of subtasks) {
    const t = s.subtaskId.trim();
    if (t) taken.add(t);
  }
  return subtasks.map((s) => {
    const t = s.subtaskId.trim();
    if (t) return s;
    const id = newPhase4SubtaskId(taken);
    taken.add(id);
    return { ...s, subtaskId: id };
  });
}

/** Keeps `difficulty` on each roleplay in sync with the selected dialogue in the task model. */
export function syncPhase6RoleplayDifficultiesFromDialogues(
  roleplays: Phase6RoleplayEntry[],
  dialogues: Dialogue[]
): Phase6RoleplayEntry[] {
  return roleplays.map((rp) => {
    if (!rp.dialogueId.trim()) return { ...rp, difficulty: "" };
    const d = dialogues.find((x) => x.id === rp.dialogueId);
    if (!d) return rp;
    return { ...rp, difficulty: d.difficulty ?? "" };
  });
}
