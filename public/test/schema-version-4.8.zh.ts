/**
 * schema-version-4.8.zh.ts
 *
 * 运行态任务数据模型（纯数据，UI 无关）
 *
 * 核心原则
 * 1) 仅交付“任务所需的数据内容”，不交付任何 App 业务逻辑或运行决策
 * 2) 音效、重试策略、展示方式、提示时机等均属于 App 逻辑层，不出现在任务数据中
 * 3) 资源（image/audio）统一在 AssetLibrary 中去重保存；所有引用一律使用 assetId
 * 4) canonical 对话脚本集中保存在 taskModel.dialogues；steps 通过 id 引用
 */

/* =========================
 * 顶层 TaskPackage
 * =========================
 * 用途：团队间交接的唯一文件结构
 */

export enum DialogueScope {
  SUBTASK = "subtask",
  FULL_TASK = "full_task",
}
export enum Difficulty {
  A = "a",
  B = "b",
  C = "c",
}
export enum ResourceType {
  IMAGE = "image",
  AUDIO = "audio",
}

export interface Translation {
  native: string;
  ipa?: string;
}

export interface TaskPackage {
  version: string;
  id: string;

  title: string;
  description: string;

  taskModelLanguage: string;  // 此任务包本身的语言，例如英语
  nativeLanguage: string;  // 用户的母语，例如中文

  // Phase 0：任务建模结果，用来体现学习任务的基本素材
  // 我们的任务模型可以用于多种本地语言的教学任务，因此其中不包含本地语言的翻译数据
  taskModel: TaskModel;

  // Phase 1–6：学习流程， 把taskModel里的素材以题目的形式组织起来
  phases: Phase[];

  // 附加内容：提供人物模型素材到本地语言的翻译
  // 此项并非必要内容，并非任务中所有的文本素材都会提供本地语言的翻译
  // 如果未提供且前端需要，考虑使用第三方翻译服务
  translations: { [key: string]: Translation };
}

/* =========================
 * TaskModel（Phase 0）
 * =========================
 * 用途：保存“任务建模结果 + canonical 内容 + 目标清单 + 全局资源库”
 *
 * 说明：
 * - taskModel 对应 Phase 0（协议/建模层），本身不属于学习者流程的一步。
 * - taskModel 中有一部分字段属于“元数据/约束/设计信息”，前端运行时不必理解其含义；
 *   前端只需要能通过 steps 的引用拿到必要内容（例如 dialogueId、assetId 等）。
 */

export interface TaskModel {
  physicalScene: string;
  industry?: string;

  // 每个任务可能有不同的角色， 例如：boss和client，或者sales和customer
  roles: {
    id: string;
    title: string;
    description?: string;
  }[];

  // TLTS：词与短语目标清单（inline 定义）
  tlts: {
    words: { [wordId: string]: string };
    phrases: { [phraseId: string]: string };
    sentences: { [sentenceId: string]: string };
  };

  // 任务中涉及的语言沟通环节： 暂时为参考数据，在App中不体现
  behavioralChain: string[];

  // 子任务列表，会引用 dialogues 中的对话脚本
  subtasks: {
    id: string;
    title: string;
    goal: string;
    description: string;
  }[];

  // canonical 对话脚本库
  // 通用的数据结构，包含子任务对话脚本和全任务对话脚本，以及各种不同难度的脚本
  dialogues: Dialogue[];

  // 全局资源库：图片/音频统一在这里去重保存，其他地方只引用 assetId
  assets: AssetLibrary;

  // 通过标准与反馈原则（元数据/约束）
  completionCriteria: {
    passScore: number;
    dimensions: string[];
  };

  cultureModel: string;
  feedbackPrinciples: string[];
}

/* =========================
 * AssetLibrary
 * =========================
 * 用途：图片/音频等内容资源的全局去重与引用中心
 */

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

/* =========================
 * Dialogue
 * =========================
 * 用途：一段 canonical 对话脚本
 */

export interface Dialogue {
  id: string;
  scope: DialogueScope;
  difficulty?: Difficulty;   // 仅用于标注（元数据）
  subtaskId?: string;

  turns: DialogueTurn[];
}

/* =========================
 * DialogueTurn
 * =========================
 * 用途：对话中的最小发言单位
 *
 * 说明：
 * - ttsAudioId 仅表示“这段文本的语音内容资源”，不表达播放策略。
 * - 语音资源必须在 taskModel.assets.audios 中注册。
 */

export interface DialogueTurn {
  role: string;
  text: string;
  audioAssetId?: string;  // 引用 taskModel.assets.audios 的 key
}

/* =========================
 * GuidanceBlock
 * =========================
 * 用途：记录一些步骤中的提示信息，可以出现在
 */

export interface Guidance {
  purpose: string;  // 某一个phase/step/question的设计意图
  description: string;  // 对设计意图的详细描述
}

/* =========================
 * Phase
 * =========================
 * 用途：学习流程分组
 */

export enum PhaseType {
  PHASE1 = "phase1",
  PHASE2 = "phase2",
  PHASE3 = "phase3",
  PHASE4 = "phase4",
  PHASE5 = "phase5",
  PHASE6 = "phase6",
}

export interface Phase {
  type: PhaseType;
  guidance?: Guidance;
  steps: Step[];
}

/* =========================
 * Question
 * =========================
 * 用途：以通用的方式定义phase中一个问题。我们的每个phase中可以包含多种类型的step，每个step中可以包含一个或多个问题
 * 题干：可能包含文字，语音，图片
 * 选项：可能包含文字，语音，图片
 * 正确答案：用数组表明正确选项，大小为1则为单选，大于1则为多选
 * 提示：文字提示
 * 
 */
export enum QuestionType {
  TEXT_TEXT = "text_text",  // 题目是文字，选项是文字
  TEXT_IMAGE = "text_image", // 题目是文字，选项是图片
  TEXT_CLOZE = "text_cloze", // 题目是文字，选项是文字，形式为完形填空
  AUDIO_TEXT = "audio_text", // 题目是发音，选项是文字
}
export interface Question {
  type: QuestionType;
  guidance?: Guidance;
  stem: {
    text?: string;
    audioAssetId?: string;
    imageAssetId?: string;
  }
  options: {
    text?: string;
    audioAssetId?: string;
    imageAssetId?: string;
    explanation?: string;  // 用于提供此选项的解释， 为什么正确，或为什么错误，App可选择将其展现给用户
  }[];
  // 正确答案索引（基于 options 数组）
  // 单选题：数组长度为 1；多选题：长度 >= 1
  correctOptionIndexes: number[];
  hint?: string;
}

export enum StepType {
  PHASE1_TASK_ENTRY = "phase1_task_entry",
  PHASE2_WARMUP = "phase2_warmup",
  PHASE3_WORDS = "phase3_words",
  PHASE3_PHRASES = "phase3_phrases",
  PHASE3_SENTENCES = "phase3_sentences",
  PHASE4_SUBTASKS = "phase4_subtasks",
  PHASE5_WORDS = "phase5_words",
  PHASE5_PHRASES = "phase5_phrases",
  PHASE5_SENTENCES = "phase5_sentences",
  PHASE6_ROLEPLAY = "phase6_roleplay",
}

export interface Step {
  id: string;
  type: StepType;
  guidance?: Guidance;
}


/* =========================
 * Phase1EntryStep
 * 用于 Phase：Phase 1（任务入口）
 * ========================= */

// 本step的主体是： guidance和entryQuestions
// guidance会保存3-4行关于此任务的描述
// questions会有1题， 题型为 Question.type = TEXT_TEXT： 题干为文字，选项为文字
export interface Phase1EntryStep extends Step {
  type: StepType.PHASE1_TASK_ENTRY;
  callToActionText: string;
  entryQuestions: Question[];  // 目前来看数组大小固定为1
}

/* =========================
 * Phase2WarmupStep
 * 用于 Phase：Phase 2（热身）
 * ========================= */

// 本step的主体是： warmupQuestions
// questions会有3题， 题型为 Question.type = TEXT_TEXT： 题干为文字，选项为文字
export interface Phase2WarmupStep extends Step {
  type: StepType.PHASE2_WARMUP;
  warmupQuestions: Question[];
}

/* =========================
 * Phase3WordsStep
 * 用于 Phase：Phase 3（CSL）
 * ========================= */

// 本step的主体是： wordQuestions
// wordQuestions是一个map，key为wordId，value为关于该词汇的题目
// 对于每个wordId，会有3道题目代表3个rounds，题型为 TEXT_IMAGE： 题干为单词，选项为图片
export interface Phase3WordsStep extends Step {
  type: StepType.PHASE3_WORDS;
  wordQuestions: { [wordId: string]: Question[] };
}

/* =========================
 * PhraseClozeStep
 * 用于 Phase：Phase 3（CSL）
 * ========================= */

// 本step的主体是： phraseQuestions
// phraseQuestions是一个map，key为phraseId，value为关于该短语的题目
// 对于每个phraseId，会有3道题目代表3个rounds，题型为 TEXT_TEXT： 题干为短语，选项为文字
export interface Phase3PhrasesStep extends Step {
  type: StepType.PHASE3_PHRASES;
  phraseQuestions: { [phraseId: string]: Question[] };
}

/* =========================
 * Phase3SentencesStep
 * 用于 Phase：Phase 3（CSL）
 * ========================= */

// 本step的主体是： sentenceQuestions
// sentenceQuestions是一个map，key为sentenceId，value为关于该句子的题目
// 对于每个sentenceId，会有3道题目代表3个rounds，题型为 TEXT_TEXT： 题干为句子，选项为文字
export interface Phase3SentencesStep extends Step {
  type: StepType.PHASE3_SENTENCES;
  sentenceQuestions: { [sentenceId: string]: Question[] };
}

/* =========================
 * SubtaskIntroStep
 * 用于 Phase：Phase 4（子任务学习）
 * ========================= */

// 本step的主体是： subtasks
// subtasks将有3个，每个subtask会引用一段dialogue，
export interface Phase4SubtasksStep extends Step {
  type: StepType.PHASE4_SUBTASKS;
  subtasks: {
    subtaskId: string;
    allowedRoles: string[];
    dialogueId: string;
    // 对于一个dialogue，我们为其中某些turn提供distractor选项
    // index代表包含distractor的turn的index
    // options代表distractor选项，
    // 当App对该dialogue进行角色扮演时，dialogue中原本的turn作为正确答案，distractor选项作为干扰项
    dialogDistractors: {
      index: number;
      options: { id: string; text: string; }[];
    }[];
  }[];
}

/* =========================
 * Phase5WordsStep
 * 用于 Phase：Phase 5（复习：单词→听音辨写）
 * ========================= */

// 本step的主体是： wordQuestions
// wordQuestions是一个map，key为wordId，value为关于该词汇的题目
// 对于每个wordId，会有3道题目代表3个rounds，题型为 AUDIO_TEXT： 题干为发音，选项为文字
export interface Phase5WordsStep extends Step {
  type: StepType.PHASE5_WORDS;
  wordQuestions: { [wordId: string]: Question[] };
}

/* =========================
 * Phase5PhrasesStep
 * 用于 Phase：Phase 5（复习：短语→完形填空）
 * ========================= */

// 本step的主体是： phraseQuestions
// phraseClozes是一个map，key为phraseId，value为关于该短语的完形填空所需的数据
// 对于每个phraseId，需要3轮完形填空，每轮都使用存在sentences中的不同的句子，
// 这些句子都被挖除了同一个关键词，而App可以通过textHint和audioHint来提示用户该关键词是什么
// 这个关键词是构成短语的重要成分，通过这个完形填空练习来强化短语学习。

export interface Phase5PhrasesStep extends Step {
  type: StepType.PHASE5_PHRASES;
  phraseClozes: {
    [phraseId: string]: {
      sentences: string[];  // 3轮完形填空，每轮都使用不同的句子
      answer: string;
      textHint: string;
      audioHint: string;
    }
  };
}


/* =========================
 * Phase5SentencesStep
 * 用于 Phase：Phase 5（复习：句子→排序）
 * ========================= */

// 本step的主体是： sentences
// 数据很简单，就是phase3中学习过的sentences
// App需要把这些句子的单词打乱，然后让用户排序

export interface Phase5SentencesStep extends Step {
  type: StepType.PHASE5_SENTENCES;
  sentences: string[];
}


/* =========================
 * Phase6RoleplayStep
 * 用于 Phase：Phase 6（角色扮演）
 * ========================= */

// 本step的主体是： roleplays
// roleplay将会有3个，对应3个不同的difficulty
// App需要通过dialogueId引用taskModel.dialogues中的对话脚本，
export interface Phase6RoleplayStep extends Step {
  type: StepType.PHASE6_ROLEPLAY;
  roleplays: {
    allowedRoles: string[];
    dialogueId: string;
    difficulty: Difficulty;  // 对应taskModel.dialogues中的difficulty
    // 对于一个dialogue，我们为其中某些turn提供hints
    // index代表包含hint的turn的index
    // text代表hint的文字
    // 轮到带有hints的turn时，app应该隐藏该turn的内容，并显示hint
    // 用户需要根据hint在App提供的input box中写出正确的回复
    dialogHints: {
      index: number;
      text: string;
    }[];
  }[];
}
