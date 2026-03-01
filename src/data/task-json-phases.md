## Task JSON Schema — Six-Phase Structure

This document describes the **task JSON schema (v4.8)**: the structure of `TaskPackage` and how each of the **six learning phases** is defined in the JSON. The schema is the single source of truth; the demo app reads it and builds an internal **flow** for the UI (e.g. a flat list of “flow items” used for step-by-step navigation). That flow is an implementation detail and is **not** part of the schema.

Goals for readers:

- **What each part of the JSON means** (fields, types, references).
- **How phases and steps are structured** in the schema.
- **How sections reference each other** (IDs, assets, dialogues, subtasks).

---

## Overall design

The task package is designed in **three parts**:

**(1) Basic information** — Identifies the task and its language context. Fields such as `version`, `id`, `title`, `description`, and `taskModelLanguage` (the **target language** of the task, i.e. the language being learned) live at the top level. This is metadata about the task itself.

**(2) Core learning content in `taskPackage.taskModel`** — The actual learning material: **words**, **phrases**, **sentences**, and **dialogues**. When the app presents the task as a sequence of questions, the **question** data does **not** duplicate this content. Instead, questions **reference** it by ID. For example: vocabulary exercises refer to **word IDs** to look up the word and any extra info here; roleplay steps refer to a **dialogue ID** to load the full dialogue (turns, roles, etc.). So `taskModel` is the single place where words, phrases, sentences, and dialogues are defined; phases and questions only point to them.

**(3) Learning flow in `taskPackage.phases`** — Takes the content in `taskModel` and **organizes it into a learning flow**. Here we define all **six phases**, each with one or more **question types** (steps), and each step with one to several **individual questions**. So: phases → steps (question types) → questions, all by reference (IDs) to the content in `taskModel`. Each **phase** and each **question** can optionally have a **guidance** block (e.g. `guidance: { purpose, description }`) for introductory or contextual text. Guidance is optional and used only when needed.

In short: **(1)** identifies the task and its target language; **(2)** holds the canonical words, phrases, sentences, and dialogues; **(3)** structures how that content is presented as a six-phase sequence of questions, with optional guidance at phase or question level.

---

## 1. Top-Level Schema: `TaskPackage`

File: `task-sample.json`  
Type: `TaskPackage` (`src/lib/types.ts`)

| Field | Schema meaning |
|-------|----------------|
| `version`, `id`, `title`, `description` | Task metadata; may be shown outside the phase flow. |
| `taskModelLanguage`, `nativeLanguage` | Language context. |
| `taskModel` | Shared scenario model used by **all phases** (see below). |
| `phases` | Ordered array of **phase objects**; each has `type`, optional `guidance`, and `steps`. |
| `translations` | Optional map of localized strings by ID. |

### `taskModel` (shared by all phases)

| Field | Schema meaning |
|-------|----------------|
| `physicalScene`, `industry`, `roles` | Scenario context and actor roles. |
| `tlts.words`, `tlts.phrases`, `tlts.sentences` | Canonical strings by ID (e.g. `"w1"`, `"p1"`, `"s1"`). Used for grouping in phase 3 and 5. |
| `behavioralChain` | High-level task steps (optional; not required by this demo). |
| `subtasks` | List of subtask descriptors; IDs (e.g. `"st1"`) are referenced by phase 4 steps. |
| `dialogues` | Reusable dialogues with `turns`; referenced by ID from phase 4 and 6 steps. |
| `assets.images`, `assets.audios` | Image/audio metadata; any `imageAssetId` or `audioAssetId` in the JSON must refer to a key here. |
| `completionCriteria`, `cultureModel`, `feedbackPrinciples` | Scoring and pedagogy metadata (optional for this demo). |

The app turns `phases[*].steps[*]` into a linear **UI flow** for navigation; that transformation is not part of the schema.

---

## 2. Phase and Step Structure in the Schema

In the schema, the flow is **hierarchical**: `phases[]` → `steps[]` → phase-specific content (questions, subtasks, sentences, etc.). Each phase has a `type` and an array of **steps**. Each step has a `type` that determines which fields are present.

- **Phase 1** (`type: "phase1"`): one step type, `phase1_task_entry`, with `entryQuestions`.
- **Phase 2** (`type: "phase2"`): one step type, `phase2_warmup`, with `warmupQuestions`.
- **Phase 3** (`type: "phase3"`): three step types (words, phrases, sentences), each with grouped question banks keyed by ID.
- **Phase 4** (`type: "subtask_learning"`): one step type, `phase4_subtasks`, with `subtasks[]` linking to dialogues.
- **Phase 5** (`type: "reinforcement"`): three step types (words, phrases, sentences) with different shapes.
- **Phase 6** (`type: "roleplay"`): one step type, `phase6_roleplay`, with `roleplays[]` linking to full-task dialogues.

There is **no** “flow item” or “flow index” in the JSON; the app derives a flat list of items from this structure for its own UI state.

---

## 3. Phase 1 – Task Entry (`phase1`)

### Schema

- **Phase**: `type: "phase1"`, `steps: [ Phase1EntryStep ]`
- **Step** (`Phase1EntryStep`):
  - `type: "phase1_task_entry"`
  - `id`: string (e.g. `"phase1_entry"`)
  - `callToActionText`: string (optional; button label in custom UIs)
  - `guidance`: optional `{ purpose, description }` — step-level guidance
  - `entryQuestions`: array of **Question** objects

### Question shape (used in phase 1 and elsewhere)

- `type`: `"text_text"` | `"text_image"` | `"text_cloze"` | `"audio_text"`
- `stem`: `{ text?, imageAssetId?, audioAssetId? }`
- `options`: array of `{ text?, imageAssetId?, audioAssetId?, explanation? }`
- `correctOptionIndexes`: number[]
- `guidance`, `hint`: optional

### Authoring

- Put introductory or task-framing questions in `phases[0].steps[0].entryQuestions`.
- Use `stem.text` and `options[].text` with `correctOptionIndexes` for grading.
- Attach `guidance` to explain the task and what the learner will do.

---

## 4. Phase 2 – Warmup (`phase2`)

### Schema

- **Phase**: `type: "phase2"`, `steps: [ Phase2WarmupStep ]`
- **Step** (`Phase2WarmupStep`):
  - `type: "phase2_warmup"`
  - `guidance`: optional
  - `warmupQuestions`: array of **Question** objects

### Authoring

- Add low-stakes multiple-choice questions; use `hint` on each question for tips.

---

## 5. Phase 3 – Focused Language Items (`phase3`)

Phase 3 defines **grouped question banks** for words, phrases, and sentences, keyed by IDs.

### Schema

- **Phase**: `type: "phase3"`, `steps`: array of three step types:
  - **Words**: `type: "phase3_words"`, `wordQuestions: { [wordId: string]: Question[] }`
  - **Phrases**: `type: "phase3_phrases"`, `phraseQuestions: { [phraseId: string]: Question[] }`
  - **Sentences**: `type: "phase3_sentences"`, `sentenceQuestions: { [sentenceId: string]: Question[] }`

IDs (e.g. `"w1"`, `"p1"`, `"sentence_csl_s3"`) are **schema keys for grouping**; they need not match `tlts` keys but it is good practice.

### Authoring

- Use one key per target item; put multiple questions per key for variation.
- Use `imageAssetId` / `audioAssetId` in stems or options; define assets under `taskModel.assets`.

---

## 6. Phase 4 – Subtask Dialogue Learning (`subtask_learning`)

This phase links **subtasks** to **dialogues** and defines **distractor options** for specific learner turns.

### Schema

- **Phase**: `type: "subtask_learning"`, `steps: [ Phase4SubtasksStep ]`
- **Step** (`Phase4SubtasksStep`):
  - `type: "phase4_subtasks"`
  - `subtasks`: array of **Phase4SubtaskEntry**

**Phase4SubtaskEntry**:

| Field | Schema meaning |
|-------|----------------|
| `subtaskId` | Must match a `taskModel.subtasks[*].id` (e.g. `"st1"`). |
| `allowedRoles` | Array of role IDs the learner may play; first is typically used (e.g. `"user"`). |
| `dialogueId` | Must match `taskModel.dialogues[*].id` (e.g. `"dlg_st1"`). |
| `dialogDistractors` | Array of `{ index: number, options: { id, text }[] }`. `index` is **0-based turn index** in `dialogue.turns` where the learner’s line is replaced with a choice; `options` are wrong alternatives. |

### Authoring

- For each subtask, add a dialogue in `taskModel.dialogues` with `scope: "subtask"` and matching `subtaskId`.
- Set `dialogueId` in the subtask entry; add `dialogDistractors` at the turn indexes where you want multiple-choice production.

---

## 7. Phase 5 – Reinforcement (`reinforcement`)

Phase 5 combines word (often audio) questions, phrase clozes, and sentence ordering.

### Schema

- **Phase**: `type: "reinforcement"`, `steps`: array of:
  - **Words**: `type: "phase5_words"`, `wordQuestions: { [wordId: string]: Question[] }`
  - **Phrases**: `type: "phase5_phrases"` with either:
    - **Preferred** — `phraseClozes: { [phraseId: string]: PhraseClozeEntry }`
      - `PhraseClozeEntry`: `sentences: string[]`, `answer: string`, optional `textHint`, `audioHint` (asset ID)
    - **Fallback** — `phraseQuestions: { [phraseId: string]: Question[] }` (used if `phraseClozes` is empty)
  - **Sentences**: `type: "phase5_sentences"`, `sentences: string[]`

### Authoring

- **Words**: same question shape as phase 3; often use `stem.audioAssetId` for listening.
- **Phrases**: prefer `phraseClozes` with 2–4 sentences per phrase and optional `textHint` / `audioHint`.
- **Sentences**: list full target sentences in `sentences[]`.

---

## 8. Phase 6 – Roleplay (`roleplay`)

This phase uses **full-task dialogues** with typed learner responses and optional per-turn hints.

### Schema

- **Phase**: `type: "roleplay"`, `steps: [ Phase6RoleplayStep ]`
- **Step** (`Phase6RoleplayStep`):
  - `type: "phase6_roleplay"`
  - `roleplays`: array of **Phase6RoleplayEntry**

**Phase6RoleplayEntry**:

| Field | Schema meaning |
|-------|----------------|
| `allowedRoles` | First role is the learner’s (e.g. `"user"`). |
| `dialogueId` | Must match `taskModel.dialogues[*].id` with `scope: "full_task"`. |
| `difficulty` | Optional level label (e.g. `"a"`, `"b"`, `"c"`). |
| `dialogHints` | Array of `{ index: number, text: string }`; `index` is **0-based turn index** for hint text. |

### Authoring

- Add 1–3 full-task dialogues in `taskModel.dialogues`; reference them by `dialogueId` in `roleplays`.
- Set `allowedRoles[0]` to the learner role; add `dialogHints` for turns where you want prompting.

---

## 9. ID and Reference Rules (Schema)

- **Assets**: Every `imageAssetId` or `audioAssetId` in the JSON must be a key in `taskModel.assets.images` or `taskModel.assets.audios`.
- **Dialogues**: `Phase4SubtaskEntry.dialogueId` and `Phase6RoleplayEntry.dialogueId` must equal some `taskModel.dialogues[*].id`.
- **Subtasks**: `Phase4SubtaskEntry.subtaskId` should match `taskModel.subtasks[*].id` for consistency.
- **Turn indexes**: `dialogDistractors[].index` and `dialogHints[].index` are **0-based** indexes into the referenced dialogue’s `turns` array.

---

## 10. Checklist for a New Task JSON

- **Task model**: Define `taskModel.roles`, `tlts`, `subtasks`, `dialogues`, and `assets`.
- **Phase 1 & 2**: Include steps with `type: "phase1_task_entry"` / `"phase2_warmup"` and valid `entryQuestions` / `warmupQuestions`.
- **Phase 3**: Populate `phase3_words`, `phase3_phrases`, `phase3_sentences` with question banks keyed by IDs.
- **Phase 4**: Link each subtask to a dialogue via `dialogueId`; add `dialogDistractors` at the desired turn indexes.
- **Phase 5**: Use `phase5_words` (word questions), `phase5_phrases` (prefer `phraseClozes`), and `phase5_sentences` (list of sentences).
- **Phase 6**: At least one `roleplays` entry with `dialogueId` pointing to a full-task dialogue; optional `dialogHints`.

The demo app reads this schema and builds its own **UI flow** (e.g. a flat list of “flow items”) for navigation; that representation is not part of the task JSON schema.
