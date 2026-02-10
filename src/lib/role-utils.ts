import type { TaskModel } from "./types";

/**
 * Get display title for a role id from taskModel.roles.
 * Falls back to roleId if not found.
 */
export function getRoleTitle(taskModel: TaskModel, roleId: string): string {
  const role = taskModel.roles?.find(
    (r) => r.id === roleId || r.title === roleId
  );
  return role?.title ?? roleId;
}
