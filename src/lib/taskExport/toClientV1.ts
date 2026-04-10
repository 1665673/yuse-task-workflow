/**
 * Adapts internal task JSON (see demo/dev/task-schema-*.zh.ts) to the third-party
 * client export shape (demo/dev/task-export/task-export-sample-v1.json).
 *
 * Phase/step mapping follows product rules: locate by phase.type then step.type
 * (e.g. phase2 + phase2_warmup → warmup + step-warmup-1, with phase1 entry merged in).
 */

export interface TaskExportMeta {
  taskId: string;
  status?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function normalizeNativeLanguage(lang: unknown): string {
  const s = String(lang ?? "zh");
  if (s.toLowerCase() === "zh-cn" || s === "zh_CN") return "zh";
  return s;
}

function fmtExportTime(d?: Date | string): string {
  const x = d ? (typeof d === "string" ? new Date(d) : d) : new Date();
  if (Number.isNaN(x.getTime())) return new Date().toISOString().slice(0, 19);
  return x.toISOString().slice(0, 19);
}

function statusToClientCode(status: string | undefined): number {
  switch (status) {
    case "draft":
      return 0;
    case "pending_review":
      return 1;
    case "production":
      return 2;
    default:
      return 0;
  }
}

function hashTaskModelId(taskId: string): number {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  return (h % 999_999) + 1;
}

const PHASE_TITLE_EN: Record<string, { title: string; translation: string }> = {
  warmup: { title: "Warm up", translation: "热身" },
  wordLearning: { title: "Word learning", translation: "单词学习" },
  phraseLearning: { title: "Phrase learning", translation: "短语学习" },
  sentenceLearning: { title: "Sentence learning", translation: "句子学习" },
  subtaskDialogue: { title: "Subtask dialogue", translation: "子任务对话" },
  wordPractice: { title: "Word practice", translation: "单词强化" },
  phrasePractice: { title: "Phrase practice", translation: "短语强化" },
  sentencePractice: { title: "Sentence practice", translation: "句子强化" },
  finalPractice: { title: "Final practice", translation: "通关演练" },
};

function findPhaseByType(phases: unknown[], phaseType: string): Record<string, unknown> | null {
  for (const ph of phases) {
    const p = asRecord(ph);
    if (p && String(p.type) === phaseType) return p;
  }
  return null;
}

function findStepByType(phase: Record<string, unknown>, stepType: string): Record<string, unknown> | null {
  const steps = Array.isArray(phase.steps) ? phase.steps : [];
  for (const st of steps) {
    const s = asRecord(st);
    if (s && String(s.type) === stepType) return s;
  }
  return null;
}

function mergeGuidance(
  phaseG: Record<string, unknown> | null,
  stepG: Record<string, unknown> | null
): { purpose: string; description: string } {
  const p = stepG ?? phaseG;
  if (!p) return { purpose: "", description: "" };
  const purpose = String((p.purpose as string) ?? "");
  const description = String((p.description as string) ?? "");
  return { purpose, description };
}

/** Concatenate two guidance blocks (phase1 entry merged into warmup). */
function mergeTwoGuidances(
  a: { purpose: string; description: string } | null,
  b: { purpose: string; description: string } | null
): { purpose: string; description: string } {
  if (!a || (!a.purpose && !a.description)) return b ?? { purpose: "", description: "" };
  if (!b || (!b.purpose && !b.description)) return a;
  return {
    purpose: [a.purpose, b.purpose].filter(Boolean).join("\n\n"),
    description: [a.description, b.description].filter(Boolean).join("\n\n"),
  };
}

function flattenTranslations(translations: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const t = asRecord(translations);
  if (!t) return out;
  for (const [k, v] of Object.entries(t)) {
    const tr = asRecord(v);
    if (tr && typeof tr.native === "string") out[k] = tr.native;
    else if (typeof v === "string") out[k] = v;
  }
  return out;
}

function trFlat(flat: Record<string, string>, key: string): string {
  return flat[key] ?? "";
}

function tltsToClient(tlts: unknown): {
  words: Array<{ id: string; content: string }>;
  phrases: Array<{ id: string; content: string }>;
  sentences: Array<{ id: string; content: string }>;
} {
  const empty = {
    words: [] as Array<{ id: string; content: string }>,
    phrases: [] as Array<{ id: string; content: string }>,
    sentences: [] as Array<{ id: string; content: string }>,
  };
  const t = asRecord(tlts);
  if (!t) return empty;
  const mapBucket = (bucket: unknown): Array<{ id: string; content: string }> => {
    const b = asRecord(bucket);
    if (!b) return [];
    return Object.entries(b).map(([id, content]) => ({
      id,
      content: String(content ?? ""),
    }));
  };
  return {
    words: mapBucket(t.words),
    phrases: mapBucket(t.phrases),
    sentences: mapBucket(t.sentences),
  };
}

function assetsToClient(assets: unknown): Array<{
  id: string;
  type: string;
  prompt?: string;
  url?: string;
  base64?: string;
}> {
  const lib = asRecord(assets);
  if (!lib) return [];
  const out: Array<{ id: string; type: string; prompt?: string; url?: string; base64?: string }> = [];
  const images = asRecord(lib.images);
  if (images) {
    for (const [id, a] of Object.entries(images)) {
      const img = asRecord(a);
      const row: { id: string; type: string; prompt?: string; url?: string; base64?: string } = {
        id,
        type: "image",
      };
      if (img?.prompt != null) row.prompt = String(img.prompt);
      if (img?.url != null) row.url = String(img.url);
      if (img?.base64 != null) row.base64 = String(img.base64);
      out.push(row);
    }
  }
  const audios = asRecord(lib.audios);
  if (audios) {
    for (const [id, a] of Object.entries(audios)) {
      const au = asRecord(a);
      const row: { id: string; type: string; prompt?: string; url?: string; base64?: string } = {
        id,
        type: "audio",
      };
      if (au?.prompt != null) row.prompt = String(au.prompt);
      if (au?.url != null) row.url = String(au.url);
      if (au?.base64 != null) row.base64 = String(au.base64);
      out.push(row);
    }
  }
  return out;
}

function feedbackPrinciplesToClient(fp: unknown): Array<{ mode: string; strategies: string[] }> {
  if (!Array.isArray(fp)) return [{ mode: "immediate", strategies: [] }];
  if (fp.length === 0) return [{ mode: "immediate", strategies: [] }];
  const first = fp[0];
  if (typeof first === "object" && first !== null && "mode" in first) {
    return fp as Array<{ mode: string; strategies: string[] }>;
  }
  return [{ mode: "immediate", strategies: fp.map((s) => String(s)) }];
}

/**
 * Internal question.type → client export type (per conversion rules).
 * text_text, text_image, text_audio, text_cloze → text_choice (with stem/option asset ids preserved).
 * audio_text → audio_text.
 */
function mapQuestionType(internal: string): string {
  if (internal === "audio_text") return "audio_text";
  return "text_choice";
}

function mapQuestion(q: Record<string, unknown>, tr: Record<string, string>): Record<string, unknown> {
  const stem = asRecord(q.stem) ?? {};
  const stemText = stem.text != null ? String(stem.text) : "";
  const optionsRaw = Array.isArray(q.options) ? q.options : [];
  const options = optionsRaw.map((o, i) => {
    const op = asRecord(o) ?? {};
    const id = `opt${i + 1}`;
    const text = op.text != null ? String(op.text) : "";
    return {
      id,
      text,
      translation: trFlat(tr, text),
      imageAssetId: op.imageAssetId,
      audioAssetId: op.audioAssetId,
    };
  });
  const correctIndexes = Array.isArray(q.correctOptionIndexes) ? q.correctOptionIndexes : [];
  const correctOptionIds = correctIndexes
    .map((idx: unknown) => options[Number(idx)]?.id)
    .filter((x): x is string => typeof x === "string");
  const internalType = String(q.type ?? "text_text");
  const clientType = mapQuestionType(internalType);

  const out: Record<string, unknown> = {
    type: clientType,
    stem: stemText,
    translation: trFlat(tr, stemText),
    options,
    correctOptionIds,
    hint: q.hint != null ? String(q.hint) : "",
  };

  if (stem.audioAssetId != null) out.audioAssetId = stem.audioAssetId;
  if (stem.imageAssetId != null) out.imageAssetId = stem.imageAssetId;

  return out;
}

function flattenWordPhraseSentenceQuestions(bucket: unknown, tr: Record<string, string>): Record<string, unknown>[] {
  const b = asRecord(bucket);
  if (!b) return [];
  const out: Record<string, unknown>[] = [];
  for (const list of Object.values(b)) {
    if (!Array.isArray(list)) continue;
    for (const q of list) {
      const qr = asRecord(q);
      if (qr) out.push(mapQuestion(qr, tr));
    }
  }
  return out;
}

/** One subtask → distractor-driven questions (correct line = dialogue turn at index). */
function buildQuestionsForSubtask(
  sub: Record<string, unknown>,
  dialogues: Array<Record<string, unknown>>
): Record<string, unknown>[] {
  const dialogueId = String(sub.dialogueId ?? "");
  const dlg = dialogues.find((d) => String(d.id) === dialogueId);
  const turns = dlg && Array.isArray(dlg.turns) ? dlg.turns : [];
  const distractors = Array.isArray(sub.dialogDistractors) ? sub.dialogDistractors : [];
  const questions: Record<string, unknown>[] = [];

  for (const dist of distractors) {
    const d = asRecord(dist);
    if (!d) continue;
    const turnIndex = Number(d.index ?? 0);
    const turn = asRecord(turns[turnIndex]);
    const correctText = turn?.text != null ? String(turn.text) : "";
    const promptTurn = turnIndex > 0 ? asRecord(turns[turnIndex - 1]) : null;
    const stemText =
      promptTurn?.text != null ? String(promptTurn.text) : correctText || `Turn ${turnIndex}`;

    const optionsRaw = Array.isArray(d.options) ? d.options : [];
    const opts: Array<{ id: string; text: string; translation: string }> = [];
    let idCounter = 1;
    const pushOpt = (id: string, text: string) => {
      opts.push({ id, text, translation: "" });
    };

    const hasCorrect = optionsRaw.some((o) => String(asRecord(o)?.text ?? "") === correctText);
    if (correctText && !hasCorrect) {
      pushOpt(`opt${idCounter++}`, correctText);
    }
    for (const o of optionsRaw) {
      const op = asRecord(o) ?? {};
      pushOpt(String(op.id ?? `opt${idCounter++}`), String(op.text ?? ""));
    }

    const correctId =
      opts.find((o) => o.text === correctText)?.id ?? opts[0]?.id;

    questions.push({
      type: "text_choice",
      stem: stemText,
      translation: "",
      audioAssetId: promptTurn?.audioAssetId ?? turn?.audioAssetId,
      imageAssetId: undefined,
      options: opts.map((o) => ({
        id: o.id,
        text: o.text,
        translation: o.translation,
      })),
      correctOptionIds: correctId ? [correctId] : [],
      hint: "",
    });
  }
  return questions;
}

function phraseClozeToQuestions(clozeMap: unknown, tr: Record<string, string>): Record<string, unknown>[] {
  const m = asRecord(clozeMap);
  if (!m) return [];
  const out: Record<string, unknown>[] = [];
  for (const [phraseId, cloze] of Object.entries(m)) {
    const c = asRecord(cloze);
    if (!c) continue;
    const answer = String(c.answer ?? "");
    const words = answer.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const options = words.map((w, i) => ({
      id: `w${i + 1}`,
      text: w,
      translation: trFlat(tr, w),
    }));
    const correctOptionIds = words.map((_, i) => `w${i + 1}`);
    out.push({
      type: "sentence_sort",
      stem: `Sort the words (${phraseId})`,
      translation: "",
      options,
      correctOptionIds,
      hint: c.textHint != null ? String(c.textHint) : "",
    });
  }
  return out;
}

/** Each plain sentence → one sentence_sort question (tokenize by whitespace). */
function sentenceToSortQuestion(sentence: string, tr: Record<string, string>): Record<string, unknown> {
  const text = String(sentence).trim();
  const words = text.split(/\s+/).filter(Boolean);
  const options = words.map((w, i) => ({
    id: `w${i + 1}`,
    text: w,
    translation: trFlat(tr, w),
  }));
  const correctOptionIds = words.map((_, i) => `w${i + 1}`);
  const stemKey = "Sort the words to make a correct sentence";
  return {
    type: "sentence_sort",
    stem: stemKey,
    translation: trFlat(tr, stemKey),
    options,
    correctOptionIds,
    hint: "",
  };
}

function buildQuestionsForRoleplay(
  roleplay: Record<string, unknown>,
  dialogues: Array<Record<string, unknown>>,
  tr: Record<string, string>
): Record<string, unknown>[] {
  const dialogueId = String(roleplay.dialogueId ?? "");
  const dlg = dialogues.find((d) => String(d.id) === dialogueId);
  if (!dlg || !Array.isArray(dlg.turns)) return [];

  const turns = dlg.turns.map((t) => asRecord(t) ?? {});
  const learnerRole = String(
    (Array.isArray(roleplay.allowedRoles) ? roleplay.allowedRoles[0] : null) ?? "user"
  );

  const hints = Array.isArray(roleplay.dialogHints) ? roleplay.dialogHints : [];
  const questions: Record<string, unknown>[] = [];

  for (const h of hints) {
    const hi = asRecord(h);
    if (!hi) continue;
    const idx = Number(hi.index ?? -1);
    if (idx < 0 || idx >= turns.length) continue;

    const turn = turns[idx];
    const correctText = String(turn.text ?? "");
    const hintText = String(hi.text ?? "");

    const otherTexts: string[] = [];
    for (let j = 0; j < turns.length; j++) {
      if (j === idx) continue;
      const t = turns[j];
      if (String(t.role ?? "") !== learnerRole) continue;
      const tx = String(t.text ?? "");
      if (tx && tx !== correctText) otherTexts.push(tx);
    }
    const distractorPick = otherTexts.slice(0, 3);

    const opts: Array<{ id: string; text: string; translation: string }> = [];
    let n = 1;
    opts.push({ id: `opt${n++}`, text: correctText, translation: trFlat(tr, correctText) });
    for (const w of distractorPick) {
      opts.push({ id: `opt${n++}`, text: w, translation: trFlat(tr, w) });
    }

    const stem = hintText || correctText;

    questions.push({
      type: "text_choice",
      stem,
      translation: trFlat(tr, stem),
      audioAssetId: turn.audioAssetId,
      imageAssetId: undefined,
      options: opts,
      correctOptionIds: ["opt1"],
      hint: hintText,
    });
  }

  return questions;
}

/** Client phase wrapper: titles from labels; description from phase guidance; step carries its own guidance. */
function clientPhaseShell(
  clientType: string,
  step: Record<string, unknown>,
  phaseRecord: Record<string, unknown> | null,
  labels: { title: string; translation: string }
): Record<string, unknown> {
  const phaseG = phaseRecord ? asRecord(phaseRecord.guidance) : null;
  const desc = phaseG?.description != null ? String(phaseG.description) : "";
  const purpose = phaseG?.purpose != null ? String(phaseG.purpose) : "";
  return {
    audioAssetId: phaseRecord?.audioAssetId,
    imageAssetId: phaseRecord?.imageAssetId,
    title: labels.title,
    translation: labels.translation,
    description: desc || purpose || labels.title,
    type: clientType,
    steps: [step],
  };
}

function buildClientPhases(data: Record<string, unknown>, taskModel: Record<string, unknown>, tr: Record<string, string>): unknown[] {
  const phases = Array.isArray(data.phases) ? data.phases : [];
  const dialogues = Array.isArray(taskModel.dialogues)
    ? (taskModel.dialogues as unknown[]).map((d) => asRecord(d) ?? {})
    : [];

  const out: unknown[] = [];

  const phase1 = findPhaseByType(phases, "phase1");
  const entryStep = phase1 ? findStepByType(phase1, "phase1_task_entry") : null;
  const phase1G = entryStep ? mergeGuidance(asRecord(phase1?.guidance), asRecord(entryStep.guidance)) : null;
  const thumbnail = entryStep?.thumbnail != null ? String(entryStep.thumbnail) : "";

  const phase2 = findPhaseByType(phases, "phase2");
  const warmupStep = phase2 ? findStepByType(phase2, "phase2_warmup") : null;
  if (warmupStep) {
    const wG = mergeGuidance(asRecord(phase2?.guidance), asRecord(warmupStep.guidance));
    const mergedGuidance = mergeTwoGuidances(phase1G, wG);
    const warmupQuestions = Array.isArray(warmupStep.warmupQuestions) ? warmupStep.warmupQuestions : [];
    const questions = warmupQuestions.map((q) => mapQuestion(asRecord(q) ?? {}, tr));

    const stepOut: Record<string, unknown> = {
      uniImageAssetId: thumbnail || undefined,
      id: "step-warmup-1",
      type: "quiz",
      callToActionText: String(warmupStep.callToActionText ?? ""),
      guidance: { purpose: mergedGuidance.purpose, description: mergedGuidance.description },
      questions,
    };

    out.push(clientPhaseShell("warmup", stepOut, phase2, PHASE_TITLE_EN.warmup));
  }

  const phase3 = findPhaseByType(phases, "phase3");
  if (phase3 && Array.isArray(phase3.steps)) {
    const phase3G = asRecord(phase3.guidance);
    for (const st of phase3.steps) {
      const step = asRecord(st);
      if (!step) continue;
      const stype = String(step.type);
      if (stype === "phase3_words") {
        const questions = flattenWordPhraseSentenceQuestions(step.wordQuestions, tr);
        const stepOut = {
          id: "step-word-1",
          type: "quiz",
          callToActionText: String(step.callToActionText ?? ""),
          guidance: mergeGuidance(phase3G, asRecord(step.guidance)),
          questions,
        };
        out.push(clientPhaseShell("wordLearning", stepOut, phase3, PHASE_TITLE_EN.wordLearning));
      } else if (stype === "phase3_phrases") {
        const questions = flattenWordPhraseSentenceQuestions(step.phraseQuestions, tr);
        const stepOut = {
          id: "step-phrase-1",
          type: "quiz",
          callToActionText: String(step.callToActionText ?? ""),
          guidance: mergeGuidance(phase3G, asRecord(step.guidance)),
          questions,
        };
        out.push(clientPhaseShell("phraseLearning", stepOut, phase3, PHASE_TITLE_EN.phraseLearning));
      } else if (stype === "phase3_sentences") {
        const questions = flattenWordPhraseSentenceQuestions(step.sentenceQuestions, tr);
        const stepOut = {
          id: "step-sentence-1",
          type: "quiz",
          callToActionText: String(step.callToActionText ?? ""),
          guidance: mergeGuidance(phase3G, asRecord(step.guidance)),
          questions,
        };
        out.push(clientPhaseShell("sentenceLearning", stepOut, phase3, PHASE_TITLE_EN.sentenceLearning));
      }
    }
  }

  const subtaskPhase = findPhaseByType(phases, "subtask_learning");
  const p4step = subtaskPhase ? findStepByType(subtaskPhase, "phase4_subtasks") : null;
  if (p4step) {
    const subtasks = Array.isArray(p4step.subtasks) ? p4step.subtasks : [];
    subtasks.forEach((st, i) => {
      const sub = asRecord(st);
      if (!sub) return;
      const pageNum = i + 1;
      const questions = buildQuestionsForSubtask(sub, dialogues);
      const stepOut: Record<string, unknown> = {
        id: `step-dialogue-page-${pageNum}`,
        type: "quiz",
        callToActionText: String(p4step.callToActionText ?? ""),
        guidance: mergeGuidance(asRecord(subtaskPhase?.guidance), asRecord(p4step.guidance)),
        questions,
      };
      out.push(clientPhaseShell("subtaskDialogue", stepOut, subtaskPhase, PHASE_TITLE_EN.subtaskDialogue));
    });
  }

  const reinforcement = findPhaseByType(phases, "reinforcement");
  if (reinforcement && Array.isArray(reinforcement.steps)) {
    const phaseG = asRecord(reinforcement.guidance);
    for (const st of reinforcement.steps) {
      const step = asRecord(st);
      if (!step) continue;
      const stype = String(step.type);
      if (stype === "phase5_words") {
        const questions = flattenWordPhraseSentenceQuestions(step.wordQuestions, tr);
        const stepOut = {
          id: "step-word-practice-1",
          type: "quiz",
          callToActionText: String(step.callToActionText ?? ""),
          guidance: mergeGuidance(phaseG, asRecord(step.guidance)),
          questions,
        };
        out.push(clientPhaseShell("wordPractice", stepOut, reinforcement, PHASE_TITLE_EN.wordPractice));
      } else if (stype === "phase5_phrases") {
        const regular = flattenWordPhraseSentenceQuestions(step.phraseQuestions, tr);
        const cloze = phraseClozeToQuestions(step.phraseClozes, tr);
        const questions = [...regular, ...cloze];
        const stepOut = {
          id: "step-phrase-practice-1",
          type: "quiz",
          callToActionText: String(step.callToActionText ?? ""),
          guidance: mergeGuidance(phaseG, asRecord(step.guidance)),
          questions,
        };
        out.push(clientPhaseShell("phrasePractice", stepOut, reinforcement, PHASE_TITLE_EN.phrasePractice));
      } else if (stype === "phase5_sentences") {
        const tltsS = asRecord(asRecord(taskModel.tlts)?.sentences) ?? {};
        const sr = asRecord((step as { sentenceReconstructions?: unknown }).sentenceReconstructions) ?? {};
        const legacy = Array.isArray((step as { sentences?: unknown }).sentences)
          ? ((step as { sentences: unknown[] }).sentences as unknown[])
          : [];
        const idsFromDict = Object.keys(sr);
        const ids =
          idsFromDict.length > 0
            ? idsFromDict
            : legacy.map((s) => String(s));
        const questions = ids.map((id) => {
          const resolved = tltsS[id] != null ? String(tltsS[id]) : id;
          return sentenceToSortQuestion(resolved, tr);
        });
        const stepOut = {
          id: "step-sentence-practice-1",
          type: "quiz",
          callToActionText: String(step.callToActionText ?? ""),
          guidance: mergeGuidance(phaseG, asRecord(step.guidance)),
          questions,
        };
        out.push(clientPhaseShell("sentencePractice", stepOut, reinforcement, PHASE_TITLE_EN.sentencePractice));
      }
    }
  }

  const roleplayPh = findPhaseByType(phases, "roleplay");
  const p6step = roleplayPh ? findStepByType(roleplayPh, "phase6_roleplay") : null;
  if (p6step) {
    const roleplays = Array.isArray(p6step.roleplays) ? p6step.roleplays : [];
    roleplays.forEach((rp, i) => {
      const roleplay = asRecord(rp);
      if (!roleplay) return;
      const pageNum = i + 1;
      const questions = buildQuestionsForRoleplay(roleplay, dialogues, tr);
      const stepOut: Record<string, unknown> = {
        id: `step-final-${pageNum}`,
        type: "quiz",
        callToActionText: String(p6step.callToActionText ?? ""),
        guidance: mergeGuidance(asRecord(roleplayPh?.guidance), asRecord(p6step.guidance)),
        questions,
      };
      out.push(clientPhaseShell("finalPractice", stepOut, roleplayPh, PHASE_TITLE_EN.finalPractice));
    });
  }

  return out;
}

function pickImageAssetId(data: Record<string, unknown>, taskModel: Record<string, unknown>): string | undefined {
  const assets = asRecord(taskModel.assets);
  const images = assets ? asRecord(assets.images) : null;
  if (images && Object.keys(images).length > 0) return Object.keys(images)[0];
  const phases = Array.isArray(data.phases) ? data.phases : [];
  const phase1 = findPhaseByType(phases as unknown[], "phase1");
  const entry = phase1 ? findStepByType(phase1, "phase1_task_entry") : null;
  if (entry?.thumbnail != null && String(entry.thumbnail)) return String(entry.thumbnail);
  for (const ph of phases) {
    const p = asRecord(ph);
    if (!p) continue;
    const steps = Array.isArray(p.steps) ? p.steps : [];
    for (const st of steps) {
      const s = asRecord(st);
      if (s?.thumbnail != null && String(s.thumbnail)) return String(s.thumbnail);
    }
  }
  return undefined;
}

/**
 * Main entry: internal task document `data` + DB metadata → client v1 JSON object.
 */
export function toClientTaskExportV1(input: { data: Record<string, unknown>; taskMeta: TaskExportMeta }): Record<string, unknown> {
  const { data, taskMeta } = input;
  const taskModel = asRecord(data.taskModel) ?? {};
  const tltsClient = tltsToClient(taskModel.tlts);
  const flatTr = flattenTranslations(data.translations);
  const behavioral = Array.isArray(taskModel.behavioralChain)
    ? (taskModel.behavioralChain as string[]).slice(0, 20)
    : [];

  const taskModelOut: Record<string, unknown> = {
    physicalScene: String(taskModel.physicalScene ?? ""),
    industry: taskModel.industry != null ? String(taskModel.industry) : undefined,
    roles: Array.isArray(taskModel.roles)
      ? (taskModel.roles as unknown[]).map((r, i) => {
          const row = asRecord(r) ?? {};
          return {
            id: row.id != null ? String(row.id) : `role-${i + 1}`,
            title: String(row.title ?? ""),
            description: row.description != null ? String(row.description) : "",
          };
        })
      : [],
    tlts: tltsClient,
    behavioralChain: taskModel.behavioralChain,
    subtasks: taskModel.subtasks,
    dialogues: taskModel.dialogues,
    assets: assetsToClient(taskModel.assets),
    completionCriteria: taskModel.completionCriteria,
    cultureModel: taskModel.cultureModel,
    feedbackPrinciples: feedbackPrinciplesToClient(taskModel.feedbackPrinciples),
  };

  const phasesOut = buildClientPhases(data, taskModel, flatTr);

  const root: Record<string, unknown> = {
    taskId: taskMeta.taskId,
    version: "1.0",
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    imageAssetId: pickImageAssetId(data, taskModel),
    learningGoals: behavioral.length ? behavioral : [String(data.description ?? "").slice(0, 200)].filter(Boolean),
    taskModelLanguage: String(data.taskModelLanguage ?? "en"),
    nativeLanguage: normalizeNativeLanguage(data.nativeLanguage),
    industry: taskModel.industry != null ? String(taskModel.industry) : undefined,
    taskModelId: hashTaskModelId(taskMeta.taskId),
    taskModel: taskModelOut,
    phases: phasesOut,
    translations: flatTr,
    status: statusToClientCode(taskMeta.status),
    deleted: 0,
    createTime: fmtExportTime(taskMeta.createdAt),
    updateTime: fmtExportTime(taskMeta.updatedAt),
    sourceSchemaVersion: data.version != null ? String(data.version) : undefined,
    locales: data.locales,
  };

  if (root.learningGoals && Array.isArray(root.learningGoals) && (root.learningGoals as string[]).length === 0) {
    root.learningGoals = ["(no behavioral chain defined)"];
  }

  return root;
}
