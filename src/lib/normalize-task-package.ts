import type { TaskModel, TaskPackage } from "./types";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Backend stores the learner JSON in Mongo `data`. Some proxies or mistakes may return
 * the envelope `{ taskId, title, data: TaskPackage }` instead of the inner package.
 * Normalize so UI always sees a single TaskPackage with required nested objects.
 */
function unwrapTaskPayload(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (Array.isArray(raw.phases)) return raw;
  const inner = raw.data;
  if (isRecord(inner) && Array.isArray(inner.phases)) return inner;
  return null;
}

function defaultTaskModel(partial: unknown): TaskModel {
  const tm = isRecord(partial) ? partial : {};
  const assetsIn = isRecord(tm.assets) ? tm.assets : {};
  const tltsIn = isRecord(tm.tlts) ? tm.tlts : {};
  const images = isRecord(assetsIn.images) ? assetsIn.images : {};
  const audios = isRecord(assetsIn.audios) ? assetsIn.audios : {};
  const words = isRecord(tltsIn.words) ? tltsIn.words : {};
  const phrases = isRecord(tltsIn.phrases) ? tltsIn.phrases : {};
  const sentences = isRecord(tltsIn.sentences) ? tltsIn.sentences : {};

  const completion = isRecord(tm.completionCriteria)
    ? (tm.completionCriteria as TaskModel["completionCriteria"])
    : { passScore: 0, dimensions: [] as string[] };

  return {
    physicalScene: String(tm.physicalScene ?? ""),
    industry: tm.industry !== undefined ? String(tm.industry) : undefined,
    roles: Array.isArray(tm.roles) ? (tm.roles as TaskModel["roles"]) : [],
    tlts: {
      words: words as TaskModel["tlts"]["words"],
      phrases: phrases as TaskModel["tlts"]["phrases"],
      sentences: sentences as TaskModel["tlts"]["sentences"],
    },
    behavioralChain: Array.isArray(tm.behavioralChain) ? (tm.behavioralChain as string[]) : [],
    subtasks: Array.isArray(tm.subtasks) ? (tm.subtasks as TaskModel["subtasks"]) : [],
    dialogues: Array.isArray(tm.dialogues) ? (tm.dialogues as TaskModel["dialogues"]) : [],
    assets: {
      images: images as TaskModel["assets"]["images"],
      audios: audios as TaskModel["assets"]["audios"],
    },
    completionCriteria: completion,
    cultureModel: String(tm.cultureModel ?? ""),
    feedbackPrinciples: Array.isArray(tm.feedbackPrinciples)
      ? (tm.feedbackPrinciples as string[])
      : [],
  };
}

export function normalizeTaskPackage(raw: unknown): TaskPackage | null {
  const base = unwrapTaskPayload(raw);
  if (!base) return null;

  const phasesRaw = base.phases;
  if (!Array.isArray(phasesRaw)) return null;

  const phases = phasesRaw.map((p) => {
    if (!isRecord(p)) return { type: "", steps: [] };
    return { ...p, steps: Array.isArray(p.steps) ? p.steps : [] };
  });

  const translations = isRecord(base.translations)
    ? (base.translations as TaskPackage["translations"])
    : {};

  return {
    version: String(base.version ?? "4.8"),
    id: String(base.id ?? ""),
    title: String(base.title ?? ""),
    description: String(base.description ?? ""),
    taskModelLanguage: String(base.taskModelLanguage ?? ""),
    nativeLanguage: String(base.nativeLanguage ?? ""),
    taskModel: defaultTaskModel(base.taskModel),
    phases: phases as TaskPackage["phases"],
    translations,
    locales: isRecord(base.locales) ? (base.locales as TaskPackage["locales"]) : undefined,
  };
}
