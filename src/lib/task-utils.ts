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

export type ItemType = "word" | "phrase" | "sentence";

export interface QuestionItem {
  kind: "question";
  phaseIndex: number;
  stepIndex: number;
  questionIndex: number;
  question: Question;
  step: Step;
  phase: Phase;
  /** When step has hierarchy (e.g. multiple words each with rounds) */
  itemType?: ItemType;
  itemIndex?: number; // 1-based
  itemCount?: number;
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

/**
 * Navigation label: <step_type_name> / <item #> / <question #>
 * Omit the item level when there's only one item in that step.
 */
export function getFlowItemNavLabel(item: FlowItem): string {
  const stepType = item.step.type;
  switch (item.kind) {
    case "phase4_subtask": {
      const st = item.step as Phase4SubtasksStep;
      const count = st.subtasks?.length ?? 0;
      if (count <= 1) return `${stepType} / -`;
      return `${stepType} / subtask ${item.subtaskIndex + 1} / -`;
    }
    case "phase5_sentence": {
      const st = item.step as Phase5SentencesStep;
      const count = st.sentences?.length ?? 0;
      if (count <= 1) return `${stepType} / -`;
      return `${stepType} / sentence ${item.sentenceIndex + 1} / -`;
    }
    case "phase5_phrase_cloze": {
      const st = item.step as Phase5PhrasesStep;
      const phraseIds = Object.keys(st.phraseClozes ?? {});
      const roundLabel = `round ${item.roundIndex + 1}`;
      if (phraseIds.length <= 1) return `${stepType} / ${roundLabel}`;
      return `${stepType} / phrase ${item.phraseId} / ${roundLabel}`;
    }
    case "phase6_roleplay":
      return `${stepType} / roleplay 1 / -`;
    case "question": {
      const q = item;
      const questionNum = `question ${q.questionIndex + 1}`;
      if (q.itemCount != null && q.itemCount > 1 && q.itemType && q.itemIndex != null) {
        const label = `${q.itemType} ${q.itemIndex}`;
        return `${stepType} / ${label} / ${questionNum}`;
      }
      return `${stepType} / ${questionNum}`;
    }
    default:
      return stepType;
  }
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
          const phraseQuestions = (step as Phase5PhrasesStep).phraseQuestions ?? {};
          const entries = Object.entries(phraseQuestions);
          const totalPhrases = entries.length;
          entries.forEach(([, questions], phraseIndex) => {
            (questions ?? []).forEach((question, questionIndex) => {
              flowItems.push({
                kind: "question",
                phaseIndex,
                stepIndex,
                questionIndex,
                question,
                step,
                phase,
                itemType: totalPhrases > 1 ? "phrase" : undefined,
                itemIndex: totalPhrases > 1 ? phraseIndex + 1 : undefined,
                itemCount: totalPhrases > 1 ? totalPhrases : undefined,
              });
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

      // Steps with hierarchy: word/phrase/sentence -> multiple questions per item
      if (step.type === "phase3_words") {
        const wordQuestions = (step as import("./types").Phase3WordsStep).wordQuestions ?? {};
        const entries = Object.entries(wordQuestions);
        const total = entries.length;
        entries.forEach(([, questions], wordIndex) => {
          (questions ?? []).forEach((question, questionIndex) => {
            flowItems.push({
              kind: "question",
              phaseIndex,
              stepIndex,
              questionIndex,
              question,
              step,
              phase,
              itemType: total > 1 ? "word" : undefined,
              itemIndex: total > 1 ? wordIndex + 1 : undefined,
              itemCount: total > 1 ? total : undefined,
            });
          });
        });
        return;
      }
      if (step.type === "phase3_phrases") {
        const phraseQuestions = (step as import("./types").Phase3PhrasesStep).phraseQuestions ?? {};
        const entries = Object.entries(phraseQuestions);
        const total = entries.length;
        entries.forEach(([, questions], phraseIndex) => {
          (questions ?? []).forEach((question, questionIndex) => {
            flowItems.push({
              kind: "question",
              phaseIndex,
              stepIndex,
              questionIndex,
              question,
              step,
              phase,
              itemType: total > 1 ? "phrase" : undefined,
              itemIndex: total > 1 ? phraseIndex + 1 : undefined,
              itemCount: total > 1 ? total : undefined,
            });
          });
        });
        return;
      }
      if (step.type === "phase3_sentences") {
        const sentenceQuestions = (step as import("./types").Phase3SentencesStep).sentenceQuestions ?? {};
        const entries = Object.entries(sentenceQuestions);
        const total = entries.length;
        entries.forEach(([, questions], sentenceIndex) => {
          (questions ?? []).forEach((question, questionIndex) => {
            flowItems.push({
              kind: "question",
              phaseIndex,
              stepIndex,
              questionIndex,
              question,
              step,
              phase,
              itemType: total > 1 ? "sentence" : undefined,
              itemIndex: total > 1 ? sentenceIndex + 1 : undefined,
              itemCount: total > 1 ? total : undefined,
            });
          });
        });
        return;
      }
      if (step.type === "phase5_words") {
        const wordQuestions = (step as import("./types").Phase5WordsStep).wordQuestions ?? {};
        const entries = Object.entries(wordQuestions);
        const total = entries.length;
        entries.forEach(([, questions], wordIndex) => {
          (questions ?? []).forEach((question, questionIndex) => {
            flowItems.push({
              kind: "question",
              phaseIndex,
              stepIndex,
              questionIndex,
              question,
              step,
              phase,
              itemType: total > 1 ? "word" : undefined,
              itemIndex: total > 1 ? wordIndex + 1 : undefined,
              itemCount: total > 1 ? total : undefined,
            });
          });
        });
        return;
      }

      // Steps with no hierarchy: flat list of questions (phase1_task_entry, phase2_warmup)
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
