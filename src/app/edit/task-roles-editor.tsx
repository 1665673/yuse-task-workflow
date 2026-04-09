"use client";

import { useEffect, useState } from "react";
import type { TaskPackage } from "@/lib/types";
import {
  dialoguesEditorRoleId,
  dialogueRoleIdForNewRole,
  summarizeDialogueRoleReferences,
} from "@/app/edit/task-editor-utils";
import {
  editorAddPrimaryButton,
  editorLabelL1,
  editorLabelL2Inline,
} from "@/app/edit/editor-labels";

export function TaskRolesEditor({
  task,
  setTask,
  disabled = false,
}: {
  task: TaskPackage;
  setTask: (t: TaskPackage) => void;
  disabled?: boolean;
}) {
  const roles = task.taskModel.roles ?? [];
  const update = (next: TaskPackage["taskModel"]["roles"]) =>
    setTask({ ...task, taskModel: { ...task.taskModel, roles: next } });

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addRoleId, setAddRoleId] = useState("");
  const [addError, setAddError] = useState("");

  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!addOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  useEffect(() => {
    if (deleteIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteIndex]);

  const openAdd = () => {
    setAddTitle("");
    setAddDescription("");
    setAddRoleId("");
    setAddError("");
    setAddOpen(true);
  };

  const submitAdd = () => {
    setAddError("");
    try {
      const id = dialogueRoleIdForNewRole(addTitle, addRoleId || undefined, roles);
      const title = addTitle.trim();
      const description = addDescription.trim() || undefined;
      update([...roles, { title, description, id }]);
      setAddOpen(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add role.");
    }
  };

  const deleteRoleId =
    deleteIndex !== null && deleteIndex >= 0 && deleteIndex < roles.length
      ? dialoguesEditorRoleId(roles[deleteIndex], deleteIndex)
      : "";
  const deleteSummary =
    deleteIndex !== null && deleteRoleId ? summarizeDialogueRoleReferences(task, deleteRoleId) : null;

  const confirmDelete = () => {
    if (deleteIndex === null) return;
    update(roles.filter((_, j) => j !== deleteIndex));
    setDeleteIndex(null);
  };

  return (
    <div className="space-y-3">
      <p className={editorLabelL1}>Dialogue Roles</p>
      <p className="text-sm text-slate-600">
        Speaker roles for dialogues, subtasks, and roleplay. Each role gets a stable internal id when added. To change a
        title or id, remove the role and add a new one — editing in place is disabled so dialogue and phase data are not
        accidentally broken.
      </p>
      <div className="space-y-3">
        {roles.map((r, i) => {
          const rid = dialoguesEditorRoleId(r, i);
          return (
            <div
              key={rid}
              className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 lg:grid-cols-[1fr_1fr_minmax(0,12rem)_auto] lg:items-center"
            >
              <div className="flex flex-col gap-0.5 text-sm">
                <span className={editorLabelL2Inline}>Title</span>
                <span className="text-slate-900">{r.title?.trim() || "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5 text-sm">
                <span className={editorLabelL2Inline}>Description</span>
                <span className="text-slate-700">{r.description?.trim() ? r.description : "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5 text-sm min-w-0">
                <span className={editorLabelL2Inline}>Role id</span>
                <span className="font-mono text-xs text-slate-600 break-all">{rid}</span>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => setDeleteIndex(i)}
                  className="text-sm text-red-600 hover:underline lg:justify-self-end"
                >
                  Remove
                </button>
              ) : (
                <span className="text-xs text-slate-400 lg:justify-self-end">—</span>
              )}
            </div>
          );
        })}
        {!disabled && (
          <button type="button" onClick={openAdd} className={editorAddPrimaryButton}>
            Add role
          </button>
        )}
      </div>

      {addOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-role-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <h2 id="add-role-title" className="text-lg font-semibold text-slate-900">
              Add dialogue role
            </h2>
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className={editorLabelL2Inline}>Title</span>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className={editorLabelL2Inline}>Description (optional)</span>
                <input
                  type="text"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className={editorLabelL2Inline}>Role id (optional)</span>
                <input
                  type="text"
                  value={addRoleId}
                  onChange={(e) => setAddRoleId(e.target.value)}
                  placeholder="Auto-generate from title if empty"
                  className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
                />
                <span className="text-xs text-slate-500">
                  Lowercase slug; must be unique. Leave blank to derive from the title automatically.
                </span>
              </label>
              {addError ? <p className="text-sm text-red-600">{addError}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAdd}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteIndex !== null && deleteSummary && deleteRoleId ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-role-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <h2 id="delete-role-title" className="text-lg font-semibold text-slate-900">
              Remove dialogue role?
            </h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                Role id <span className="font-mono text-slate-900">{deleteRoleId}</span> is stored in dialogue turns and
                in Phase 4 (subtasks) and Phase 6 (roleplay) allowed-role settings. Removing it can break those links if
                this id is still referenced.
              </p>
              {(deleteSummary.dialogueTurnCount > 0 ||
                deleteSummary.subtaskCount > 0 ||
                deleteSummary.roleplayCount > 0) && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                  <strong className="font-medium">Referenced in this task:</strong>{" "}
                  {[
                    deleteSummary.dialogueTurnCount > 0
                      ? `${deleteSummary.dialogueTurnCount} dialogue line${
                          deleteSummary.dialogueTurnCount === 1 ? "" : "s"
                        }`
                      : null,
                    deleteSummary.subtaskCount > 0
                      ? `${deleteSummary.subtaskCount} subtask allowed-role row${
                          deleteSummary.subtaskCount === 1 ? "" : "s"
                        }`
                      : null,
                    deleteSummary.roleplayCount > 0
                      ? `${deleteSummary.roleplayCount} roleplay row${deleteSummary.roleplayCount === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  .
                </p>
              )}
              {deleteSummary.dialogueTurnCount === 0 &&
                deleteSummary.subtaskCount === 0 &&
                deleteSummary.roleplayCount === 0 && (
                  <p className="text-slate-600">
                    No references were found in dialogue lines or phase rows for this task file. Other copies or manual
                    edits could still use this id.
                  </p>
                )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteIndex(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Remove role
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
