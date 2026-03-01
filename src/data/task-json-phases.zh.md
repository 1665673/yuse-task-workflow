## 任务 JSON 结构说明 — 六阶段

本文档描述 **任务 JSON 结构（v4.8）**：即 `TaskPackage` 的字段与类型，以及 **六个学习阶段** 在 JSON 中的定义方式。JSON 是唯一的数据源；demo 应用读取后会在内部生成用于界面一步步导航的 **流程**（例如扁平的「flow items」列表）。该流程是实现细节，**不属于** 任务 JSON 结构本身。

阅读目标：

- **JSON 各部分的含义**（字段、类型、引用关系）。
- **阶段与步骤在结构上如何组织**。
- **各区块之间如何通过 ID 引用**（资源、对话、子任务等）。

---

## 整体设计理念

任务包在整体上分为 **三部分**：

**（1）基础信息** — 标识任务本身及其语言语境。如 `version`、`id`、`title`、`description`，以及 `taskModelLanguage`（任务的目标语言，即被学习的语言）等字段位于顶层，属于任务元数据。

**（2）`taskPackage.taskModel` 中的核心学习素材** — 真正的学习内容：**words**（词汇）、**phrases**（短语）、**sentences**（句子）和 **dialogues**（对话）。当应用把学习任务在 App 中展现为一连串 **题目（question）** 时，题目数据结构 **不会重复** 这些内容，而是通过 **相应的 ID 从这里引用**。例如：词汇相关练习题通过 **word ID** 在这里查找词汇及其附加信息；角色扮演题通过 **dialogue ID** 在这里获取完整对话内容（轮次、角色等）。因此 `taskModel` 是词汇、短语、句子、对话的唯一定义处；阶段与题目只通过 ID 指向它们。

**（3）`taskPackage.phases` 中的学习流程** — 把 `taskModel` 里的内容 **组织成学习流程**。在这里定义完整的 **六个阶段**，每个阶段包含若干 **题型**（即 steps），每个题型包含 **1 至多道** 单独题目。即：阶段 → 步骤（题型）→ 题目，均通过 ID 引用 `taskModel` 中的内容。每个 **阶段**、每个 **题目** 都可以按需配备单独的 **guidance** 块（如 `guidance: { purpose, description }`），用于设置阶段或题目的引导语；**不一定存在，按需使用**。

概括：**（1）** 标识任务与目标语言；**（2）** 承载规范的词汇、短语、句子与对话；**（3）** 把这些内容组织成六阶段的一连串题目，并可在阶段或题目级别可选地配置引导语。

---

## 1. 顶层结构：`TaskPackage`

文件：`task-sample.json`  
类型：`TaskPackage`（`src/lib/types.ts`）

| 字段 | 结构含义 |
|------|----------|
| `version`、`id`、`title`、`description` | 任务元数据，可在阶段流程外展示。 |
| `taskModelLanguage`、`nativeLanguage` | 语言相关元数据。 |
| `taskModel` | 所有阶段共用的场景模型（见下）。 |
| `phases` | **阶段对象** 的有序数组；每项含 `type`、可选 `guidance` 与 `steps`。 |
| `translations` | 可选，按 ID 的本地化文案。 |

### `taskModel`（所有阶段共用）

| 字段 | 结构含义 |
|------|----------|
| `physicalScene`、`industry`、`roles` | 场景与角色。 |
| `tlts.words`、`tlts.phrases`、`tlts.sentences` | 按 ID 的规范字符串（如 `"w1"`、`"p1"`、`"s1"`），阶段 3、5 用于分组。 |
| `behavioralChain` | 高层任务步骤（可选）。 |
| `subtasks` | 子任务描述列表；ID（如 `"st1"`）被阶段 4 步骤引用。 |
| `dialogues` | 可复用对话（含 `turns`）；阶段 4、6 步骤通过 ID 引用。 |
| `assets.images`、`assets.audios` | 图片/音频元数据；JSON 中出现的 `imageAssetId` / `audioAssetId` 必须对应此处的 key。 |
| `completionCriteria`、`cultureModel`、`feedbackPrinciples` | 评分与教学策略元数据（本 demo 中可选）。 |

应用会将 `phases[*].steps[*]` 转成线性的 **界面流程** 用于导航；该转换不属于 JSON 结构定义。

---

## 2. 阶段与步骤在结构中的组织方式

在 JSON 中，流程是 **层级** 的：`phases[]` → `steps[]` → 各阶段特有的内容（题目、子任务、句子等）。每个阶段有 `type` 和 **steps** 数组；每个 step 的 `type` 决定其下有哪些字段。

- **阶段 1**（`type: "phase1"`）：一步类型 `phase1_task_entry`，含 `entryQuestions`。
- **阶段 2**（`type: "phase2"`）：一步类型 `phase2_warmup`，含 `warmupQuestions`。
- **阶段 3**（`type: "phase3"`）：三种 step 类型（单词、短语、句子），各自为按 ID 分组的题目库。
- **阶段 4**（`type: "subtask_learning"`）：一步类型 `phase4_subtasks`，含 `subtasks[]` 引用对话。
- **阶段 5**（`type: "reinforcement"`）：三种 step 类型（单词、短语、句子），结构不同。
- **阶段 6**（`type: "roleplay"`）：一步类型 `phase6_roleplay`，含 `roleplays[]` 引用完整任务对话。

JSON 中 **没有**「flow item」或「flow index」；应用根据上述结构自行生成扁平的 UI 状态列表。

---

## 3. 阶段 1 – 任务入口（`phase1`）

### 结构

- **阶段**：`type: "phase1"`，`steps: [ Phase1EntryStep ]`
- **步骤**（`Phase1EntryStep`）：
  - `type: "phase1_task_entry"`
  - `id`：字符串（如 `"phase1_entry"`）
  - `callToActionText`：字符串（可选；自定义 UI 中的按钮文案）
  - `guidance`：可选 `{ purpose, description }`，步骤级引导
  - `entryQuestions`：**Question** 对象数组

### Question 形状（阶段 1 及多处复用）

- `type`：`"text_text"` | `"text_image"` | `"text_cloze"` | `"audio_text"`
- `stem`：`{ text?, imageAssetId?, audioAssetId? }`
- `options`：`{ text?, imageAssetId?, audioAssetId?, explanation? }[]`
- `correctOptionIndexes`：number[]
- `guidance`、`hint`：可选

### 编写建议

- 将入门或任务框架类题目放在 `phases[0].steps[0].entryQuestions`。
- 用 `stem.text`、`options[].text` 和 `correctOptionIndexes` 判对错；可用 `guidance` 说明任务目的。

---

## 4. 阶段 2 – 热身（`phase2`）

### 结构

- **阶段**：`type: "phase2"`，`steps: [ Phase2WarmupStep ]`
- **步骤**（`Phase2WarmupStep`）：
  - `type: "phase2_warmup"`
  - `guidance`：可选
  - `warmupQuestions`：**Question** 对象数组

### 编写建议

- 添加低压力选择题；每题可设 `hint` 作为提示。

---

## 5. 阶段 3 – 语言项目聚焦（`phase3`）

阶段 3 定义按 ID 分组的 **单词、短语、句子** 题目库。

### 结构

- **阶段**：`type: "phase3"`，`steps` 为三种步骤类型组成的数组：
  - **单词**：`type: "phase3_words"`，`wordQuestions: { [wordId: string]: Question[] }`
  - **短语**：`type: "phase3_phrases"`，`phraseQuestions: { [phraseId: string]: Question[] }`
  - **句子**：`type: "phase3_sentences"`，`sentenceQuestions: { [sentenceId: string]: Question[] }`

ID（如 `"w1"`、`"p1"`、`"sentence_csl_s3"`）为 **结构上的分组 key**；不必与 `tlts` 的 key 一致，但建议一致。

### 编写建议

- 每个目标项一个 key；同一 key 下可放多道题做变化。
- 在题干或选项中用 `imageAssetId` / `audioAssetId`；在 `taskModel.assets` 中定义资源。

---

## 6. 阶段 4 – 子任务对话学习（`subtask_learning`）

本阶段在结构中 **将子任务与对话关联**，并定义特定轮次的 **干扰选项**。

### 结构

- **阶段**：`type: "subtask_learning"`，`steps: [ Phase4SubtasksStep ]`
- **步骤**（`Phase4SubtasksStep`）：
  - `type: "phase4_subtasks"`
  - `subtasks`：**Phase4SubtaskEntry** 数组

**Phase4SubtaskEntry**：

| 字段 | 结构含义 |
|------|----------|
| `subtaskId` | 须与某条 `taskModel.subtasks[*].id` 一致（如 `"st1"`）。 |
| `allowedRoles` | 学习者可扮演的角色 ID 数组；通常使用第一个（如 `"user"`）。 |
| `dialogueId` | 须与 `taskModel.dialogues[*].id` 一致（如 `"dlg_st1"`）。 |
| `dialogDistractors` | `{ index: number, options: { id, text }[] }[]`。`index` 为 `dialogue.turns` 的 **从 0 起的轮次下标**，在该轮用选项替换学习者原句；`options` 为错误选项。 |

### 编写建议

- 每个子任务在 `taskModel.dialogues` 中有一条 `scope: "subtask"` 且 `subtaskId` 匹配的对话。
- 在子任务项中设置 `dialogueId`；在需要选择题产出的轮次下标处添加 `dialogDistractors`。

---

## 7. 阶段 5 – 巩固（`reinforcement`）

阶段 5 包含单词题（常为听辨）、短语填空和句子排序。

### 结构

- **阶段**：`type: "reinforcement"`，`steps` 为以下类型组成的数组：
  - **单词**：`type: "phase5_words"`，`wordQuestions: { [wordId: string]: Question[] }`
  - **短语**：`type: "phase5_phrases"`，二选一：
    - **推荐** — `phraseClozes: { [phraseId: string]: PhraseClozeEntry }`
      - `PhraseClozeEntry`：`sentences: string[]`，`answer: string`，可选 `textHint`、`audioHint`（资源 ID）
    - **兜底** — `phraseQuestions: { [phraseId: string]: Question[] }`（仅当 `phraseClozes` 为空时使用）
  - **句子**：`type: "phase5_sentences"`，`sentences: string[]`

### 编写建议

- **单词**：与阶段 3 题目形状相同；常用 `stem.audioAssetId` 做听辨。
- **短语**：优先用 `phraseClozes`，每短语 2–4 句，可选 `textHint` / `audioHint`。
- **句子**：在 `sentences[]` 中列出完整目标句。

---

## 8. 阶段 6 – 角色扮演（`roleplay`）

本阶段使用 **完整任务对话**，学习者输入回复，可配轮次提示。

### 结构

- **阶段**：`type: "roleplay"`，`steps: [ Phase6RoleplayStep ]`
- **步骤**（`Phase6RoleplayStep`）：
  - `type: "phase6_roleplay"`
  - `roleplays`：**Phase6RoleplayEntry** 数组

**Phase6RoleplayEntry**：

| 字段 | 结构含义 |
|------|----------|
| `allowedRoles` | 第一个为学习者角色（如 `"user"`）。 |
| `dialogueId` | 须与某条 `taskModel.dialogues[*].id` 一致，且该对话 `scope: "full_task"`。 |
| `difficulty` | 可选难度标签（如 `"a"`、`"b"`、`"c"`）。 |
| `dialogHints` | `{ index: number, text: string }[]`；`index` 为 **从 0 起的轮次下标**，在该轮显示提示文案。 |

### 编写建议

- 在 `taskModel.dialogues` 中定义 1–3 条完整任务对话；在 `roleplays` 中通过 `dialogueId` 引用。
- 将 `allowedRoles[0]` 设为学习者角色；在需要提示的轮次添加 `dialogHints`。

---

## 9. ID 与引用规则（结构层面）

- **资源**：JSON 中出现的每个 `imageAssetId` / `audioAssetId` 必须是 `taskModel.assets.images` 或 `taskModel.assets.audios` 的 key。
- **对话**：`Phase4SubtaskEntry.dialogueId` 与 `Phase6RoleplayEntry.dialogueId` 必须等于某条 `taskModel.dialogues[*].id`。
- **子任务**：`Phase4SubtaskEntry.subtaskId` 建议与 `taskModel.subtasks[*].id` 一致。
- **轮次下标**：`dialogDistractors[].index` 与 `dialogHints[].index` 均为所引用对话 `turns` 数组的 **从 0 起** 的下标。

---

## 10. 新建任务 JSON 检查清单

- **任务模型**：定义 `taskModel.roles`、`tlts`、`subtasks`、`dialogues`、`assets`。
- **阶段 1、2**：包含 `type` 为 `"phase1_task_entry"` / `"phase2_warmup"` 的步骤及有效的 `entryQuestions` / `warmupQuestions`。
- **阶段 3**：用 ID 分组填写 `phase3_words`、`phase3_phrases`、`phase3_sentences` 题目库。
- **阶段 4**：每个子任务通过 `dialogueId` 关联对话，在对应轮次下标处添加 `dialogDistractors`。
- **阶段 5**：使用 `phase5_words`（单词题）、`phase5_phrases`（推荐 `phraseClozes`）、`phase5_sentences`（句子列表）。
- **阶段 6**：至少一条 `roleplays`，`dialogueId` 指向完整任务对话；可选 `dialogHints`。

Demo 应用读取上述结构后，会自行生成 **界面流程**（例如扁平的「flow items」）用于导航；该表示不属于任务 JSON 结构定义。
