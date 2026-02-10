/**
 * Schema types for task data (from schema-version-4.8.zh.ts)
 */

export interface Translation {
  native: string;
  ipa?: string;
}

export interface TaskPackage {
  version: string;
  id: string;
  title: string;
  description: string;
  taskModelLanguage: string;
  nativeLanguage: string;
  taskModel: TaskModel;
  phases: Phase[];
  translations: { [key: string]: Translation };
}

export interface DialogueTurn {
  role: string;
  text: string;
  audioAssetId?: string;
}

export interface Dialogue {
  id: string;
  scope: string;
  subtaskId?: string;
  difficulty?: string;
  turns: DialogueTurn[];
}

export interface TaskModel {
  physicalScene: string;
  industry?: string;
  roles: Array<{ id?: string; title: string; description?: string }>;
  tlts: {
    words: { [wordId: string]: string };
    phrases: { [phraseId: string]: string };
    sentences: { [sentenceId: string]: string };
  };
  behavioralChain: string[];
  subtasks: { id: string; title: string; goal: string; description: string }[];
  dialogues: Dialogue[];
  assets: AssetLibrary;
  completionCriteria: { passScore: number; dimensions: string[] };
  cultureModel: string;
  feedbackPrinciples: string[];
}

export interface AssetLibrary {
  images: { [assetId: string]: ImageAsset };
  audios: { [assetId: string]: AudioAsset };
}

export interface ImageAsset {
  prompt?: string;
  url?: string;
  base64?: string;
}

export interface AudioAsset {
  prompt?: string;
  url?: string;
  base64?: string;
}

export interface Guidance {
  purpose: string;
  description: string;
}

export interface Phase {
  type: string;
  guidance?: Guidance;
  steps: Step[];
}

export type QuestionType =
  | "text_text"
  | "text_image"
  | "text_cloze"
  | "audio_text";

export interface Question {
  type: QuestionType;
  guidance?: Guidance;
  stem: {
    text?: string;
    audioAssetId?: string;
    imageAssetId?: string;
  };
  options: {
    text?: string;
    audioAssetId?: string;
    imageAssetId?: string;
    explanation?: string;
  }[];
  correctOptionIndexes: number[];
  hint?: string;
}

export type Step =
  | Phase1EntryStep
  | Phase2WarmupStep
  | Phase3WordsStep
  | Phase3PhrasesStep
  | Phase3SentencesStep
  | Phase4SubtasksStep
  | Phase5WordsStep
  | Phase5PhrasesStep
  | Phase5SentencesStep
  | Phase6RoleplayStep;

export interface BaseStep {
  id: string;
  type: string;
  guidance?: Guidance;
}

export interface Phase1EntryStep extends BaseStep {
  type: "phase1_task_entry";
  callToActionText: string;
  entryQuestions: Question[];
}

export interface Phase2WarmupStep extends BaseStep {
  type: "phase2_warmup";
  warmupQuestions: Question[];
}

export interface Phase3WordsStep extends BaseStep {
  type: "phase3_words";
  wordQuestions: { [wordId: string]: Question[] };
}

export interface Phase3PhrasesStep extends BaseStep {
  type: "phase3_phrases";
  phraseQuestions: { [phraseId: string]: Question[] };
}

export interface Phase3SentencesStep extends BaseStep {
  type: "phase3_sentences";
  sentenceQuestions: { [sentenceId: string]: Question[] };
}

export interface Phase4SubtaskEntry {
  subtaskId: string;
  allowedRoles: string[];
  dialogueId: string;
  dialogDistractors: {
    index: number;
    options: { id: string; text: string }[];
  }[];
}

export interface Phase4SubtasksStep extends BaseStep {
  type: "phase4_subtasks";
  subtasks: Phase4SubtaskEntry[];
}

export interface Phase5WordsStep extends BaseStep {
  type: "phase5_words";
  wordQuestions: { [wordId: string]: Question[] };
}

export interface PhraseClozeEntry {
  sentences: string[];
  answer: string;
  textHint?: string;
  audioHint?: string;
}

export interface Phase5PhrasesStep extends BaseStep {
  type: "phase5_phrases";
  phraseQuestions?: { [phraseId: string]: Question[] };
  phraseClozes?: { [phraseId: string]: PhraseClozeEntry };
}

export interface Phase5SentencesStep extends BaseStep {
  type: "phase5_sentences";
  sentences: string[];
}

export interface Phase6RoleplayEntry {
  allowedRoles: string[];
  dialogueId: string;
  difficulty: string;
  dialogHints: { index: number; text: string }[];
}

export interface Phase6RoleplayStep extends BaseStep {
  type: "phase6_roleplay";
  roleplays: Phase6RoleplayEntry[];
}
