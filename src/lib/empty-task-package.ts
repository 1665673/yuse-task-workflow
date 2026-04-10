/**
 * Minimal task package used when creating an empty task from the admin UI.
 * Mirrors the structure of `dev/task-sample.v4.8.json` with all list/map content emptied.
 */

/** Slug from topic + time suffix so IDs stay readable and unlikely to collide. */
export function taskIdFromTopic(topic: string): string {
  const slug = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const base = slug || "task";
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return `task-${base}-${suffix}`;
}

/** Maps admin UI language label to `taskModelLanguage` (ISO-style code used in JSON). */
export function adminLanguageToTaskModelCode(languageLabel: string): string {
  if (languageLabel === "English") return "en";
  return "en";
}

/**
 * Barebones `TaskPackage`-compatible object: same phase/step ids/types as the reference sample,
 * with empty strings where text is required, empty arrays for lists, and empty objects for maps.
 */
export function buildEmptyTaskPackage(opts: {
  id: string;
  title: string;
  taskModelLanguage?: string;
  nativeLanguage?: string;
}): Record<string, unknown> {
  const taskModelLanguage = opts.taskModelLanguage ?? "en";
  const nativeLanguage = opts.nativeLanguage ?? "zh-CN";

  return {
    version: "4.8",
    id: opts.id,
    title: opts.title,
    description: "",
    taskModelLanguage,
    nativeLanguage,
    taskModel: {
      physicalScene: "",
      roles: [],
      tlts: {
        words: {},
        phrases: {},
        sentences: {},
      },
      behavioralChain: [],
      subtasks: [],
      dialogues: [],
      assets: {
        images: {},
        audios: {},
      },
      completionCriteria: {
        passScore: 0,
        dimensions: [],
      },
      cultureModel: "",
      feedbackPrinciples: [],
    },
    translations: {},
    phases: [
      {
        type: "phase1",
        steps: [
          {
            id: "phase1_entry",
            type: "phase1_task_entry",
            callToActionText: "",
            guidance: {
              purpose: "",
              description: "",
            },
          },
        ],
      },
      {
        type: "phase2",
        steps: [
          {
            id: "phase2_warmup",
            type: "phase2_warmup",
            warmupQuestions: [],
          },
        ],
      },
      {
        type: "phase3",
        steps: [
          {
            id: "phase3_words",
            type: "phase3_words",
            wordQuestions: {},
          },
          {
            id: "phase3_phrases",
            type: "phase3_phrases",
            phraseQuestions: {},
          },
          {
            id: "phase3_sentences",
            type: "phase3_sentences",
            sentenceQuestions: {},
          },
        ],
      },
      {
        type: "subtask_learning",
        steps: [
          {
            id: "phase4_subtasks",
            type: "phase4_subtasks",
            subtasks: [],
          },
        ],
      },
      {
        type: "reinforcement",
        steps: [
          {
            id: "phase5_words",
            type: "phase5_words",
            wordQuestions: {},
          },
          {
            id: "phase5_phrases",
            type: "phase5_phrases",
            phraseQuestions: {},
            phraseClozes: {},
          },
          {
            id: "phase5_sentences",
            type: "phase5_sentences",
            sentenceReconstructions: {},
          },
        ],
      },
      {
        type: "roleplay",
        steps: [
          {
            id: "phase6_roleplay",
            type: "phase6_roleplay",
            roleplays: [],
          },
        ],
      },
    ],
  };
}
