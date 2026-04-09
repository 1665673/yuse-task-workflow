import type { Phase4SubtasksStep, Phase6RoleplayStep, TaskModel, TaskPackage } from "@/lib/types";

/** Stable role id for dialogue / phase editors (matches dialogue turn `role` field). */
export function dialoguesEditorRoleId(r: { id?: string }, index: number): string {
  const t = r.id?.trim();
  return t || `role-${index + 1}`;
}

/**
 * Normalized id from a dialogue role title (lowercase slug).
 * Empty title yields "" so callers can fall back to `role-${index + 1}`.
 */
export function normalizeDialogueRoleIdFromTitle(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return s.slice(0, 64);
}

/** New role: optional explicit id (normalized); otherwise unique id from title. */
export function dialogueRoleIdForNewRole(
  title: string,
  explicitIdRaw: string | undefined,
  existingRoles: Array<{ id?: string; title: string }>
): string {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Role title is required.");
  }
  const explicit = explicitIdRaw?.trim()
    ? normalizeDialogueRoleIdFromTitle(explicitIdRaw.trim())
    : "";
  const taken = new Set<string>();
  for (let j = 0; j < existingRoles.length; j++) {
    taken.add(dialoguesEditorRoleId(existingRoles[j], j).toLowerCase());
  }
  if (explicit) {
    if (taken.has(explicit.toLowerCase())) {
      throw new Error(`Role id "${explicit}" is already in use.`);
    }
    return explicit;
  }
  const next = [...existingRoles, { title: trimmedTitle }];
  return dialogueRoleIdFromTitle(trimmedTitle, next, existingRoles.length);
}

export interface DialogueRoleReferenceSummary {
  dialogueTurnCount: number;
  subtaskCount: number;
  roleplayCount: number;
}

/** Counts where `roleId` appears in dialogue turns, Phase 4 allowed roles, Phase 6 allowed roles. */
export function summarizeDialogueRoleReferences(task: TaskPackage, roleId: string): DialogueRoleReferenceSummary {
  let dialogueTurnCount = 0;
  for (const d of task.taskModel?.dialogues ?? []) {
    for (const turn of d.turns ?? []) {
      if (turn.role === roleId) dialogueTurnCount++;
    }
  }
  let subtaskCount = 0;
  for (const p of task.phases) {
    if (p.type === "subtask_learning" && p.steps[0]) {
      const step = p.steps[0] as Phase4SubtasksStep;
      for (const st of step.subtasks ?? []) {
        if (st.allowedRoles?.includes(roleId)) subtaskCount++;
      }
    }
  }
  let roleplayCount = 0;
  for (const p of task.phases) {
    if (p.type === "roleplay" && p.steps[0]) {
      const step = p.steps[0] as Phase6RoleplayStep;
      for (const rp of step.roleplays ?? []) {
        if (rp.allowedRoles?.includes(roleId)) roleplayCount++;
      }
    }
  }
  return { dialogueTurnCount, subtaskCount, roleplayCount };
}

/** Assign a unique `id` derived from `title` among `roles` at `index` (other rows unchanged). */
export function dialogueRoleIdFromTitle(
  title: string,
  roles: Array<{ id?: string; title: string }>,
  index: number
): string {
  const slug = normalizeDialogueRoleIdFromTitle(title);
  const base = slug || `role-${index + 1}`;
  const taken = new Set<string>();
  for (let j = 0; j < roles.length; j++) {
    if (j === index) continue;
    taken.add(dialoguesEditorRoleId(roles[j], j).toLowerCase());
  }
  let c = base;
  let n = 2;
  while (taken.has(c.toLowerCase())) {
    c = `${base}-${n}`;
    n += 1;
  }
  return c;
}

/** Resolve stored role id to human title from task model roles. */
export function taskRoleTitle(roles: TaskModel["roles"] | undefined, roleId: string): string {
  const list = roles ?? [];
  for (let i = 0; i < list.length; i++) {
    if (dialoguesEditorRoleId(list[i], i) === roleId) {
      return list[i].title?.trim() || roleId;
    }
  }
  return roleId;
}

/** First TLTS word id not used as a key in `usedKeys` (for “Add word”). */
export function firstUnusedTltsKey(tlts: Record<string, string>, usedKeys: Set<string>): string | undefined {
  return Object.keys(tlts).find((k) => !usedKeys.has(k));
}
