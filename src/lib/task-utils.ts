/**
 * Utilities to extract and flatten flow items from phases/steps
 */

import type { Phase, Step, Question, TaskPackage } from "./types";
import type {
  Phase4SubtasksStep,
  Phase5PhrasesStep,
  Phase5SentencesStep,
  Phase6RoleplayStep,
} from "./types";

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
  sentence: string;
  answer: string;
  textHint?: string;
  audioHint?: string;
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

export type FlowItem =
  | QuestionItem
  | Phase4SubtaskItem
  | Phase5SentenceItem
  | Phase5PhraseClozeItem
  | Phase6RoleplayItem;

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
          const sentences = entry.sentences ?? [];
          sentences.forEach((sentence, roundIndex) => {
            flowItems.push({
              kind: "phase5_phrase_cloze",
              phaseIndex,
              stepIndex,
              phraseId,
              roundIndex,
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
