## Task JSON → Six-Phase Workflow Mapping

This document explains **how a `TaskPackage` JSON (v4.8)** is interpreted by the demo app to drive the **six learning phases**, according to the TypeScript implementation in `page.tsx`, `task-utils.ts`, and the phase view components.

The goal is that a new engineer can open `task-sample.json`, this document, and the TypeScript files, and clearly see:

- **What each part of the JSON means**
- **How each phase is rendered as UI**
- **How different sections reference each other** (IDs, assets, dialogues, subtasks, etc.)

---

## 1. Top-Level Shape: `TaskPackage`

File: `task-sample.json`  
Type: `TaskPackage` (`src/lib/types.ts`)

Key fields:

- **`version` / `id` / `title` / `description`**: metadata, displayed mainly outside the phase flow.
- **`taskModelLanguage` / `nativeLanguage`**: language context metadata.
- **`taskModel`**: shared scenario model for **all phases**:
  - **`physicalScene`, `industry`, `roles`**: context and actor roles.
  - **`tlts.words|phrases|sentences`**: canonical strings by ID (e.g. `"w1"`, `"p1"`, `"s1"`). These IDs are used to group questions in phase 3 and 5.
  - **`behavioralChain`**: high‑level task steps (not used directly by the demo UI).
  - **`subtasks`**: subtask descriptors used conceptually in phase 4 (IDs must match what steps refer to, e.g. `"st1"`).
  - **`dialogues`**: reusable dialogues with `turns`, referenced by ID from phase 4 and 6.
  - **`assets.images` / `assets.audios`**: image/audio metadata used wherever `imageAssetId` / `audioAssetId` appears in questions or hints.
  - **`completionCriteria`, `cultureModel`, `feedbackPrinciples`**: scoring and pedagogy meta (not directly rendered in this prototype).
- **`phases`**: ordered list of **instructional phases** that the UI walks through.
- **`translations`**: optional localized strings keyed by ID (not essential for this demo).

The **runtime flow** is derived entirely from `phases` via `flattenTaskFlow(task)` (`src/lib/task-utils.ts`), which converts `phases[*].steps[*]` into a flat array of **flow items**.

---

## 2. Flow Engine Overview (`flattenTaskFlow`)

File: `src/lib/task-utils.ts`

The central idea:

- **Input**: `task: TaskPackage`
- **Output**:
  - **`phaseGuidanceItems`**: phases that have phase‑level guidance.
  - **`flowItems`**: flat ordered list of items the UI steps through (questions, subtasks, clozes, roleplays…).

`FlowItem` is a discriminated union:

- **`kind: "question"`** → generic multiple‑choice / cloze questions.
- **`kind: "phase4_subtask"`** → one entry per subtask in the phase 4 step.
- **`kind: "phase5_sentence"`** → one entry per sentence for word‑ordering.
- **`kind: "phase5_phrase_cloze"`** → one entry per cloze sentence (per phrase, per round).
- **`kind: "phase6_roleplay"`** → one entry for roleplay (first dialogue only).

Each item carries:

- **`phaseIndex` / `stepIndex`**: where it came from in `phases[*].steps[*]`.
- **`step` / `phase`**: the original objects.
- Additional fields depending on `kind` (e.g. `question`, `sentence`, `phraseId`, `roundIndex`).

The **screen controller** in `src/app/page.tsx` uses:

- `flattenTaskFlow(task)` to build `flowItems`.
- `getFlowItemNavLabel(item)` to show labels like `"phase3_phrases / phrase 2 / question 1"`.
- A simple state machine:
  - **Welcome → Loading → Phase Guidance? → Question/Activity → Complete**.

---

## 3. Phase 1 – Task Entry (`phase1`)

### JSON Structure

In `task-sample.json`:

- **Phase object**:
  - `type: "phase1"`
  - `steps: [ Phase1EntryStep ]`
- **Step object** (`Phase1EntryStep` type):
  - `type: "phase1_task_entry"`
  - `id`: e.g. `"phase1_entry"`
  - `callToActionText`: button label (shown in custom UIs; not currently rendered in `page.tsx`).
  - `guidance`: optional `Guidance` (purpose + description). Used as **step‑level guidance** in the question screen.
  - `entryQuestions: Question[]`: normal multiple‑choice questions.

### How it is rendered

1. `flattenTaskFlow`:
   - Uses `getQuestionsFromStep`:
     - For `type === "phase1_task_entry"`, returns `step.entryQuestions`.
   - Each question becomes a `FlowItem` with `kind: "question"`.
   - No hierarchy (`itemType`/`itemIndex` not set).

2. `page.tsx` (screen `"question"`):
   - Shows **step guidance** (`GuidanceBlock`) if `step.guidance` exists.
   - Renders the question with `QuestionRenderer`.
   - "Continue" is enabled after `onAnswer` fires.

### How to author phase 1 in JSON

- Put any **introductory comprehension / task‑framing questions** into `phases[0].steps[0].entryQuestions`.
- Use `stem.text` and `options[].text`, with `correctOptionIndexes` for grading.
- Attach a `guidance` block to explain **why this task matters** and what the learner will do.

---

## 4. Phase 2 – Warmup (`phase2`)

### JSON Structure

- Phase:
  - `type: "phase2"`
  - `steps: [ Phase2WarmupStep ]`
- Step (`Phase2WarmupStep`):
  - `type: "phase2_warmup"`
  - `warmupQuestions: Question[]`

### How it is rendered

1. `flattenTaskFlow`:
   - `getQuestionsFromStep` returns `step.warmupQuestions`.
   - Each becomes `FlowItem` with `kind: "question"`.

2. `page.tsx`:
   - Same `"question"` flow as phase 1: optional step guidance + `QuestionRenderer`.

### How to author phase 2

- Add **low‑stakes multiple‑choice** questions that activate prior knowledge or cultural/pragmatic awareness.
- Use `hint` on each `Question` to give learner tips before answering.

---

## 5. Phase 3 – Focused Language Items (`phase3`)

Phase 3 uses **grouped question banks** keyed by TLTS IDs and is where **words, phrases, and sentences** are explicitly practiced.

### JSON Structure

Phase:

- `type: "phase3"`
- `steps`: array of three step types:
  - `Phase3WordsStep` (`type: "phase3_words"`)
  - `Phase3PhrasesStep` (`type: "phase3_phrases"`)
  - `Phase3SentencesStep` (`type: "phase3_sentences"`)

Step shapes (`src/lib/types.ts`):

- **Words**:
  - `wordQuestions: { [wordId: string]: Question[] }`
  - Example: `"w1": [ Question, Question, ... ]`
- **Phrases**:
  - `phraseQuestions: { [phraseId: string]: Question[] }`
- **Sentences**:
  - `sentenceQuestions: { [sentenceId: string]: Question[] }`

IDs (`"w1"`, `"p1"`, `"sentence_csl_s3"`, etc.) are **keys for grouping and labeling only**. They do not need to match `tlts` keys, but it is good practice to do so.

### How it is flattened

`flattenTaskFlow` has dedicated logic:

- **Words (`phase3_words`)**:
  - For each `wordId`:
    - For each `Question` in `wordQuestions[wordId]`, push a `FlowItem`:
      - `kind: "question"`
      - `itemType: "word"` if there is more than one wordId.
      - `itemIndex` / `itemCount` encode **“which word out of how many”**.
- **Phrases (`phase3_phrases`)**:
  - Similar to words, but with `itemType: "phrase"`.
- **Sentences (`phase3_sentences`)**:
  - Similar, with `itemType: "sentence"`.

`getFlowItemNavLabel` uses these fields to build a label:

- If `itemType`/`itemIndex` present:
  - `"<step.type> / <itemType> <itemIndex> / question <questionIndex+1>"`
- Otherwise:
  - `"<step.type> / question <questionIndex+1>"`

### How it is rendered

- For all three step types, the `"question"` screen pipeline is used:
  - Optional `step.guidance`.
  - Optional per‑question `guidance`.
  - `QuestionRenderer` for interaction (text / image / audio stems and options).

### How to author phase 3

- **Decide item granularity**:
  - Use one key per TLTS entry (`"w1"`, `"p1"`, etc.).
  - Put multiple questions under each key for **spaced variation** on the same target item.
- **Visual / audio assets**:
  - Use `imageAssetId` / `audioAssetId` in `stem` or `options`.
  - Define the asset bodies under `taskModel.assets.images|audios`.
- Keep the number of word/phrase/sentence IDs manageable so that the navigation label stays readable.

---

## 6. Phase 4 – Subtask Dialogue Learning (`subtask_learning`)

This phase connects **subtasks** to **dialogues** and injects **distractor replies** for the learner’s turns.

### JSON Structure

Phase:

- `type: "subtask_learning"`
- `steps: [ Phase4SubtasksStep ]`

Step (`Phase4SubtasksStep`):

- `type: "phase4_subtasks"`
- `subtasks: Phase4SubtaskEntry[]`

`Phase4SubtaskEntry`:

- `subtaskId`: links conceptually to `taskModel.subtasks[*].id` (e.g. `"st1"`).
- `allowedRoles: string[]`: allowed learner roles; the component currently uses the **first** value (e.g. `"user"`).
- `dialogueId`: must match `taskModel.dialogues[*].id` (e.g. `"dlg_st1"`).
- `dialogDistractors`: array of:
  - `index`: **turn index** within the dialogue where we replace the learner’s line with a choice.
  - `options`: array of wrong options `{ id, text }`.

### How it is flattened

In `flattenTaskFlow`:

- For `step.type === "phase4_subtasks"`:
  - For each `subtasks[index]`, push a `FlowItem`:
    - `kind: "phase4_subtask"`
    - `subtaskIndex` (0‑based).
    - `step` and `phase`.

### How it is rendered (`Phase4SubtaskView`)

File: `src/components/Phase4SubtaskView.tsx`

- Looks up:
  - `ourRole = subtask.allowedRoles[0] || "user"`.
  - `dialogue` by `dialogueId` from `taskModel.dialogues`.
- Builds a `Map` from `dialogDistractors[index]` to their options.
- Maintains `turnIndex` and decides:
  - If the **turn belongs to the other role**: show it as a bubble, auto‑advance after ~1.2s.
  - If it is **our role and has distractors**:
    - Show a **set of options**:
      - Correct option: the original dialogue text for that turn.
      - Incorrect options: `dialogDistractors[index].options[*].text`.
    - Learner picks one; correct/incorrect is indicated visually; auto‑advances after ~0.7s.
- Once the conversation ends (or last turn with no choices):
  - Show a **“Continue”** button to move to the next `FlowItem`.

### How to author phase 4

- For each subtask:
  - Create a matching `taskModel.dialogues` entry with `"scope": "subtask"` and `subtaskId`.
  - In the `subtasks` array:
    - Point `dialogueId` to that dialogue.
    - Add `dialogDistractors` where you want **multiple‑choice production**:
      - `index` is **0‑based index** in `dialogue.turns`.
      - `options[].text` are wrong but plausible alternatives.
- Ensure `allowedRoles[0]` is the role ID the learner should speak as (e.g. `"user"`).

---

## 7. Phase 5 – Reinforcement (`reinforcement`)

This phase mixes **audio‑driven word recognition**, **open cloze for phrases**, and a **sentence ordering** task.

### JSON Structure

Phase:

- `type: "reinforcement"`
- `steps`: includes three step types in the sample:
  - `Phase5WordsStep` (`type: "phase5_words"`)
  - `Phase5PhrasesStep` (`type: "phase5_phrases"`)
  - `Phase5SentencesStep` (`type: "phase5_sentences"`)

#### 7.1. Phase 5 – Words (`phase5_words`)

Step (`Phase5WordsStep`):

- `type: "phase5_words"`
- `wordQuestions: { [wordId: string]: Question[] }`

Flattening:

- `flattenTaskFlow` treats this like `phase3_words`:
  - Each `Question` becomes `FlowItem` with `kind: "question"` and `itemType: "word"` when multiple word IDs exist.

Rendering:

- Same question UI (`QuestionRenderer`) but typically with **audio stems** (e.g. `stem.audioAssetId`) and text options.

#### 7.2. Phase 5 – Phrases (`phase5_phrases`)

Step (`Phase5PhrasesStep`):

- `type: "phase5_phrases"`
- Two mutually exclusive ways to express content:
  - **Preferred in this demo** – `phraseClozes`:
    - `phraseClozes: { [phraseId: string]: PhraseClozeEntry }`
    - `PhraseClozeEntry`:
      - `sentences: string[]` – each is a **round** (one `FlowItem` per sentence).
      - `answer: string` – the correct word/phrase to type.
      - `textHint?: string` – textual hint shown under the prompt.
      - `audioHint?: string` – `audioAssetId` used for a **hint playback** button.
  - **Fallback** – `phraseQuestions`:
    - `phraseQuestions?: { [phraseId: string]: Question[] }`
    - Used only if `phraseClozes` is empty.

Flattening (in `flattenTaskFlow`):

- If `phraseClozes` is **non‑empty**:
  - For each `[phraseId, entry]`:
    - For each `entry.sentences[roundIndex]`:
      - Push `FlowItem` with:
        - `kind: "phase5_phrase_cloze"`
        - `phraseId`, `roundIndex`
        - `sentence`, `answer`, `textHint`, `audioHint`
- Else (if `phraseClozes` is empty):
  - Fallback to questions:
    - For each `phraseId` / `Question`:
      - Push `FlowItem` with `kind: "question"` and `itemType: "phrase"` when multiple phrase IDs exist.

Rendering (`Phase5PhraseClozeView`):

- Displays:
  - Header: `"Phrase {phraseId} – Round {roundIndex+1} of 3"` (3 is a UI convention here).
  - `sentence` text as prompt.
  - Optional `textHint`.
  - Optional **audio hint button**:
    - Looks up `task.taskModel.assets.audios[audioHint]`.
    - Plays `url` or `base64` via `new Audio(...)`.
- Learner types their answer in an `<input>`.
  - On “Check”:
    - Case‑insensitive comparison with `answer`.
    - If correct: shows `"Correct!"`.
    - If incorrect: shows `"Correct answer: {answer}"`.
  - After checking, “Continue” proceeds to next `FlowItem`.

#### 7.3. Phase 5 – Sentences (`phase5_sentences`)

Step (`Phase5SentencesStep`):

- `type: "phase5_sentences"`
- `sentences: string[]`

Flattening:

- For each sentence at `sentenceIndex`:
  - Push `FlowItem` with `kind: "phase5_sentence"` and `sentence`.
- If `sentences` is empty:
  - Push a single item with `sentence: ""` to keep flow valid.

Rendering (`Phase5SentenceView`):

- If `sentence` is non‑empty:
  - Split into tokens with `sentence.trim().split(/\s+/)`.
  - Shuffle as a “word bank”.
  - Learner builds the sentence by clicking words in order.
  - When all words have been used:
    - If order matches original → `"Correct!"` and show **Reset** + **Continue**.
    - Otherwise → `"Not quite..."`, with same buttons.
- If `sentence` is empty:
  - Show `"No sentence for this step."` + a **Continue** button.

### How to author phase 5

- **Word questions**: like phase 3 words, but usually with **listening discrimination** (audio stem, text options).
- **Phrase clozes**:
  - Prefer `phraseClozes` for open input.
  - Provide 2–4 sentences per phrase to give varied contexts.
  - Provide `textHint` and, optionally, `audioHint` that refers to an ID in `taskModel.assets.audios`.
- **Sentence ordering**:
  - Write full target sentences in `sentences[]`.
  - Keep sentences short enough to be rearranged comfortably.

---

## 8. Phase 6 – Roleplay (`roleplay`)

This phase uses a **full task dialogue** with typed responses and optional hints.

### JSON Structure

Phase:

- `type: "roleplay"`
- `steps: [ Phase6RoleplayStep ]`

Step (`Phase6RoleplayStep`):

- `type: "phase6_roleplay"`
- `roleplays: Phase6RoleplayEntry[]`

`Phase6RoleplayEntry`:

- `allowedRoles: string[]`:
  - First role is the learner’s role (e.g. `"user"`).
- `dialogueId: string`:
  - Must match `taskModel.dialogues[*].id` with `"scope": "full_task"`.
- `difficulty: string`:
  - `"a" | "b" | "c"` etc.; used conceptually for level, not surfaced heavily in this prototype.
- `dialogHints: { index: number; text: string }[]`:
  - `index` is a **turn index** in the dialogue where we show extra guidance for the learner’s reply.

In the sample JSON:

- Three roleplays (`dlg_full_a`, `dlg_full_b`, `dlg_full_c`) with different difficulty; the UI currently uses the **first** (`roleplays[0]`).

### How it is flattened

In `flattenTaskFlow`:

- For `type === "phase6_roleplay"`:
  - If `roleplays.length > 0`, push a single `FlowItem`:
    - `kind: "phase6_roleplay"`
    - `step`, `phase`.

### How it is rendered (`Phase6RoleplayView`)

File: `src/components/Phase6RoleplayView.tsx`

- Selects:
  - `roleplay = step.roleplays[0]` (first only).
  - `ourRole = roleplay.allowedRoles[0] || "user"`.
  - `dialogue` via `dialogueId` from `taskModel.dialogues`.
  - `hintByIndex` from `dialogHints`.
- Maintains a `turnIndex` and `input`:
  - If `turn.role !== ourRole`:
    - Show the partner’s line as a bubble.
    - “Next” button advances `turnIndex`.
  - If `turn.role === ourRole`:
    - If no existing `wrongFeedback`:
      - Show an input box and optional hint text.
      - On “Submit”:
        - If `input.trim() === turn.text.trim()`:
          - Advance to the next turn.
        - Else:
          - Store `{ userAnswer, correctAnswer }` in `wrongFeedback`.
          - Clear input.
    - If `wrongFeedback` is present:
      - Show:
        - The learner’s previous answer.
        - The correct answer.
      - “Next” button clears feedback and advances.
- After last turn:
  - Show `"Roleplay complete."` + **Continue** to next phase.

### How to author phase 6

- Choose 1–3 **full dialogues** under `taskModel.dialogues` with `"scope": "full_task"`.
- In `phases[*].steps[0].roleplays`:
  - Point to those dialogues by ID.
  - Set `allowedRoles[0]` to the learner’s persona (e.g. `"user"`).
  - Add `dialogHints` where you want **prompting on specific turns**:
    - `index` is the **0‑based turn index** in the dialogue.

---

## 9. Asset and ID Referencing Summary

- **Image and audio IDs**:
  - Wherever you see `imageAssetId` / `audioAssetId` (in stems, options, hints, or phrase clozes):
    - They must reference keys in `taskModel.assets.images` / `taskModel.assets.audios`.
  - UI components:
    - `QuestionRenderer` uses `ImagePlaceholder` / `AudioPlaceholder` to render stems/options.
    - `Phase5PhraseClozeView` manually plays audio hints using `new Audio(...)`.
- **Dialogue IDs**:
  - `Phase4SubtasksStep.subtasks[*].dialogueId` and `Phase6RoleplayStep.roleplays[*].dialogueId` must match `taskModel.dialogues[*].id`.
- **Subtask IDs**:
  - `Phase4SubtasksStep.subtasks[*].subtaskId` should match `taskModel.subtasks[*].id` for conceptual consistency (even if not strictly required by the UI).
- **Turn indexes**:
  - `dialogDistractors[].index` and `dialogHints[].index` are **0‑based indexes** into `dialogue.turns`.

---

## 10. Checklist for Creating a New Task JSON

When authoring a new task JSON that should work with this demo:

- **Task model**
  - Define `taskModel.roles`, `tlts`, `subtasks`, `dialogues`, and `assets` first.
- **Phase 1 & 2**
  - Ensure `phase1` and `phase2` contain steps with `type: "phase1_task_entry"` / `"phase2_warmup"` and valid `entryQuestions` / `warmupQuestions`.
- **Phase 3**
  - Populate `phase3_words`, `phase3_phrases`, `phase3_sentences` with grouped question banks keyed by IDs.
- **Phase 4**
  - Link each subtask to a dialogue via `dialogueId`, and add `dialogDistractors` at specific `turn` indexes.
- **Phase 5**
  - For `phase5_words`, reuse the word‑question pattern.
  - For `phase5_phrases`, prefer `phraseClozes` with `sentences`, `answer`, and hints.
  - For `phase5_sentences`, provide one or more target sentences for reordering.
- **Phase 6**
  - Provide at least one `roleplays` entry pointing to a full‑task dialogue, with optional `dialogHints`.

With these rules, the JSON will be correctly transformed into the **six‑phase learning workflow** by `flattenTaskFlow` and rendered by `page.tsx` and the associated phase components.

