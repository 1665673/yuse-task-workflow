"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  authJsonHeaders,
  getStoredToken,
  setStoredToken,
} from "@/lib/api";

type TaskStatus = "draft" | "pending_review" | "production";

interface AdminTaskRow {
  id: string;
  title: string;
  language: string;
  status: TaskStatus;
  createdAt: string; // ISO string
  /** Present when API returns it (admin sees assignee). */
  assignedReviewer?: string | null;
}

type AdminTab = "overview" | "tasks";

const TARGET_LANGUAGES = [
  { code: "cn", label: "Chinese", native: "简体中文" },
  { code: "jp", label: "Japanese", native: "日本語" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ar", label: "Arabic", native: "العربية" },
];

export default function AdminPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionUser, setSessionUser] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "reviewer" | null>(null);
  /** From API `/api/auth/me` and login; also treat username `admin` as admin. */
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [tasks, setTasks] = useState<AdminTaskRow[]>([]);

  useEffect(() => {
    const t = getStoredToken();
    if (!t) return;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => {
        if (!r.ok) throw new Error("session");
        return r.json() as Promise<{
          user: { username: string; role: "admin" | "reviewer"; isAdmin?: boolean };
        }>;
      })
      .then((data) => {
        setIsLoggedIn(true);
        setSessionUser(data.user.username);
        setUserRole(data.user.role);
        setIsAdmin(
          data.user.isAdmin ??
            (data.user.role === "admin" || data.user.username.toLowerCase() === "admin")
        );
      })
      .catch(() => {
        setStoredToken(null);
      });
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch("/api/tasks", { headers: authJsonHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load tasks");
        return r.json();
      })
      .then((data: AdminTaskRow[]) => setTasks(data))
      .catch((e) => console.error("Failed to load tasks", e));
  }, [isLoggedIn]);

  const [filterLanguage, setFilterLanguage] = useState<string>("English");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLanguage, setCreateLanguage] = useState("English");
  const [createTopic, setCreateTopic] = useState("");
  const [creating, setCreating] = useState(false);

  const [langModalTaskId, setLangModalTaskId] = useState<string | null>(null);

  const [assignTaskId, setAssignTaskId] = useState<string | null>(null);
  const [assignReviewers, setAssignReviewers] = useState<{ username: string }[]>([]);
  const [assignSelected, setAssignSelected] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const isAdminEffective =
    isAdmin ??
    (userRole === "admin" || sessionUser.toLowerCase() === "admin");

  const [aiWarning, setAiWarning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterLanguage && t.language !== filterLanguage) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterFrom) {
        const fromDate = new Date(filterFrom);
        if (new Date(t.createdAt) < fromDate) return false;
      }
      if (filterTo) {
        const toDate = new Date(filterTo);
        const taskDate = new Date(t.createdAt);
        if (taskDate > toDate) return false;
      }
      return true;
    });
  }, [tasks, filterLanguage, filterStatus, filterFrom, filterTo]);

  const totalTasks = tasks.length;
  const pendingCount = tasks.filter((t) => t.status === "pending_review").length;
  const draftCount = tasks.filter((t) => t.status === "draft").length;
  const productionCount = tasks.filter((t) => t.status === "production").length;

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUser.trim(),
          password: loginPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        user?: { username: string; role: "admin" | "reviewer"; isAdmin?: boolean };
      };
      if (!res.ok) {
        setLoginError(data.error ?? "Request failed");
        return;
      }
      if (data.token && data.user) {
        setStoredToken(data.token);
        setIsLoggedIn(true);
        setSessionUser(data.user.username);
        setUserRole(data.user.role);
        setIsAdmin(
          data.user.isAdmin ??
            (data.user.role === "admin" || data.user.username.toLowerCase() === "admin")
        );
        setLoginPassword("");
      }
    } catch {
      setLoginError("Network error");
    }
  };

  const handleSignOut = () => {
    setStoredToken(null);
    setIsLoggedIn(false);
    setSessionUser("");
    setUserRole(null);
    setIsAdmin(null);
    setLoginUser("");
    setLoginPassword("");
  };

  const openCreateModal = () => {
    setCreateTopic("");
    setCreateLanguage("English");
    setAiWarning(false);
    setImportError(null);
    setCreateModalOpen(true);
  };

  const handleDeleteTask = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        headers: authJsonHeaders(),
      });
      if (!res.ok) throw new Error("Server error");
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error("Failed to delete task", e);
      alert("Failed to delete the task. Please try again.");
    }
  };

  const openAssignModal = async (taskId: string, currentReviewer?: string | null) => {
    setAssignTaskId(taskId);
    setAssignError(null);
    setAssignSelected(currentReviewer ?? "");
    setAssignReviewers([]);
    try {
      const res = await fetch("/api/users/reviewers", { headers: authJsonHeaders() });
      if (!res.ok) throw new Error("Failed to load reviewers");
      const data = (await res.json()) as { reviewers?: { username: string }[] };
      setAssignReviewers(data.reviewers ?? []);
    } catch {
      setAssignError("Could not load reviewer list.");
    }
  };

  const submitAssign = async () => {
    if (!assignTaskId || !assignSelected.trim()) return;
    setAssignSaving(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/tasks/${assignTaskId}/assignment`, {
        method: "POST",
        headers: authJsonHeaders(),
        body: JSON.stringify({ reviewerUsername: assignSelected.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Assignment failed");
      const listRes = await fetch("/api/tasks", { headers: authJsonHeaders() });
      if (listRes.ok) {
        setTasks((await listRes.json()) as AdminTaskRow[]);
      }
      setAssignTaskId(null);
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setAssignSaving(false);
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const taskJson = JSON.parse(text);
      const id = taskJson.id ?? `task-${Date.now()}`;
      const title = taskJson.title ?? file.name.replace(/\.json$/i, "");
      const language =
        taskJson.taskModelLanguage === "en"
          ? "English"
          : (taskJson.taskModelLanguage ?? "English");
      const body = {
        id,
        title,
        language,
        status: "pending_review",
        createdAt: new Date().toISOString(),
        data: taskJson,
      };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: authJsonHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Server returned an error");
      const created = (await res.json()) as AdminTaskRow;
      setTasks((prev) => [
        { id: created.id, title: created.title, language: created.language, status: created.status, createdAt: created.createdAt },
        ...prev,
      ]);
      setCreateModalOpen(false);
      setAiWarning(false);
      setImportError(null);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import — check that the file is valid task JSON."
      );
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const handleConfirmCreate = async () => {
    if (!createTopic.trim()) return;
    setCreating(true);
    try {
      const body: AdminTaskRow = {
        id: `task-${Date.now()}`,
        title: createTopic.trim(),
        language: createLanguage,
        status: "draft",
        createdAt: new Date().toISOString(),
      };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: authJsonHeaders(),
        body: JSON.stringify(body),
      });
      const created = (await res.json()) as AdminTaskRow;
      setTasks((prev) => [created, ...prev]);
      setCreateModalOpen(false);
      router.push(`/edit/task/${created.id}`);
    } catch (e) {
      console.error("Failed to create task", e);
    } finally {
      setCreating(false);
    }
  };

  const renderOverview = () => {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-slate-900">Overview</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-slate-800">
            Signed in as <span className="font-mono text-slate-700">{sessionUser}</span>
            {" · "}
            Your role is:{" "}
            <span className="font-semibold">
              {isAdminEffective ? "Admin" : "Task Reviewer"}
            </span>
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Statistics
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total tasks
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{totalTasks}</p>
            <p className="mt-1 text-xs text-slate-500">
              Includes all draft, pending review, and production tasks.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Recently added / edited
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {Math.max(1, Math.min(totalTasks, 3))}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Dummy value; in a real system this would be based on audit logs.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Pending review
            </p>
            <p className="mt-2 text-2xl font-semibold text-amber-600">{pendingCount}</p>
            <p className="mt-1 text-xs text-slate-500">
              Tasks waiting for content or pedagogical review.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Draft tasks
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{draftCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Production tasks
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{productionCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Review SLA
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">24 hours</p>
            <p className="mt-1 text-xs text-slate-500">
              Placeholder target for internal content operations.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderTasks = () => {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Tasks</h2>
            <p className="text-sm text-slate-600">
              {isAdminEffective
                ? "Filter and manage all authoring tasks."
                : "Tasks assigned to you for review."}
            </p>
          </div>
          {isAdminEffective && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Create task
            </button>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs sm:text-sm">
              <span className="font-medium text-slate-700">Language</span>
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="English">English</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs sm:text-sm">
              <span className="font-medium text-slate-700">Status</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "all")}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Pending review</option>
                <option value="production">Production</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs sm:text-sm">
              <span className="font-medium text-slate-700">Created from</span>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs sm:text-sm">
              <span className="font-medium text-slate-700">Created to</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Language</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                  {isAdminEffective && (
                    <th className="px-3 py-2">Reviewer</th>
                  )}
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={isAdminEffective ? 6 : 5}
                      className="px-3 py-4 text-center text-sm text-slate-500"
                    >
                      No tasks match current filters.
                    </td>
                  </tr>
                )}
                {filteredTasks.map((t) => {
                  const created = new Date(t.createdAt);
                  const statusLabel =
                    t.status === "pending_review"
                      ? "Pending review"
                      : t.status === "draft"
                        ? "Draft"
                        : "Production";
                  const statusClass =
                    t.status === "pending_review"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : t.status === "draft"
                        ? "bg-slate-100 text-slate-700 border-slate-300"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200";
                  return (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-slate-900">{t.title}</div>
                        <div className="text-xs text-slate-500">{t.id}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">{t.language}</td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">
                        {created.toLocaleDateString()}{" "}
                        <span className="text-xs text-slate-400">
                          {created.toLocaleTimeString()}
                        </span>
                      </td>
                      {isAdminEffective && (
                        <td className="px-3 py-2 align-top text-slate-700">
                          {t.assignedReviewer ? (
                            <span className="font-mono text-xs">{t.assignedReviewer}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap justify-end gap-2">
                          {t.status === "pending_review" ? (
                            <button
                              type="button"
                              onClick={() => router.push(`/edit/task/${t.id}`)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              Review
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => router.push(`/edit/task/${t.id}`)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Open
                            </button>
                          )}
                          {isAdminEffective && (
                            <button
                              type="button"
                              onClick={() => openAssignModal(t.id, t.assignedReviewer)}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                            >
                              Assign
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setLangModalTaskId(t.id)}
                            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                          >
                            Language
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/tasks/${t.id}`)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Preview
                          </button>
                          {isAdminEffective && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(t.id, t.title)}
                            className="rounded-lg border border-red-200 bg-white p-1.5 text-red-400 hover:border-red-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete task"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-slate-900">
            {authMode === "login" ? "Sign in" : "Create account"}
          </h1>
          <p className="mb-4 text-sm text-slate-600">
            {authMode === "login"
              ? "Sign in with your reviewer or admin account."
              : "New accounts are reviewers. Admins are created separately."}
          </p>
          <div className="mb-4 flex gap-2 text-sm">
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${authMode === "login" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}
              onClick={() => { setAuthMode("login"); setLoginError(null); }}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${authMode === "register" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}
              onClick={() => { setAuthMode("register"); setLoginError(null); }}
            >
              Register
            </button>
          </div>
          {loginError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {loginError}
            </p>
          )}
          <form onSubmit={handleLogin} className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Username</span>
              <input
                type="text"
                autoComplete="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Enter username"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter password"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {authMode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 flex-shrink-0 border-r border-slate-200 bg-white p-4 sm:flex sm:flex-col">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-slate-900">Yuse Admin Portal</h1>
          <p className="text-xs text-slate-500">Task Content Management Dashboard</p>
        </div>
        <nav className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
              activeTab === "overview"
                ? "bg-blue-50 text-blue-700"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
              activeTab === "tasks"
                ? "bg-blue-50 text-blue-700"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span>Tasks</span>
          </button>
        </nav>
      </aside>

      <section className="flex-1 p-4 sm:p-6">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col space-y-4">
          {/* Mobile nav */}
          <div className="flex gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${
                activeTab === "overview"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${
                activeTab === "tasks"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              Tasks
            </button>
          </div>

          <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            {activeTab === "overview" ? renderOverview() : renderTasks()}
          </div>
        </div>
      </section>

      {createModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Create new task</h2>
            <p className="mb-4 text-sm text-slate-600">
              Choose the task language and enter a topic. AI backend will generate a new task based on the topic.
            </p>

            {/* AI create form */}
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Language</span>
                <select
                  value={createLanguage}
                  onChange={(e) => setCreateLanguage(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="English">English</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Task topic</span>
                <input
                  type="text"
                  value={createTopic}
                  onChange={(e) => setCreateTopic(e.target.value)}
                  placeholder="e.g. Negotiating shipping terms"
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            </div>

            {/* AI not-ready warning */}
            {aiWarning && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
                </svg>
                Create By AI is not ready. Please use the <strong className="mx-0.5">Import</strong> button below to manually import a task JSON.
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCreateModalOpen(false); setAiWarning(false); setImportError(null); }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setAiWarning(true)}
                disabled={!createTopic.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirm
              </button>
            </div>

            {/* Manual import divider */}
            <div className="my-5 flex items-center gap-3">
              <hr className="flex-1 border-slate-200" />
              <span className="text-xs text-slate-400">or</span>
              <hr className="flex-1 border-slate-200" />
            </div>

            {/* Manual import section */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Manual import from JSON</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Choose a local <code className="rounded bg-slate-100 px-1">.json</code> file containing a valid task package. It will be added to the task list immediately.
                </p>
              </div>

              {importError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-red-400">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  {importError}
                </div>
              )}

              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportJson}
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => importFileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importing ? (
                  "Importing…"
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614z" />
                      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                    </svg>
                    Choose JSON file to import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Assign reviewer (admin) */}
      {assignTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Assign reviewer</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{assignTaskId}</p>
            <p className="mt-2 text-sm text-slate-600">
              Choose which reviewer is responsible for this task.
            </p>
            {assignError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{assignError}</p>
            )}
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Reviewer</span>
              <select
                value={assignSelected}
                onChange={(e) => setAssignSelected(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select reviewer…</option>
                {assignReviewers.map((r) => (
                  <option key={r.username} value={r.username}>
                    {r.username}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                disabled={assignSaving}
                onClick={() => setAssignTaskId(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assignSaving || !assignSelected.trim()}
                onClick={submitAssign}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {assignSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Language selection modal */}
      {langModalTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Edit Learner Language</h2>
            <p className="mb-4 text-sm text-slate-500">Select a language to open the translation editor.</p>
            <div className="flex flex-col gap-2">
              {TARGET_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    router.push(`/edit/task/${langModalTaskId}?target_language=${lang.code}`);
                    setLangModalTaskId(null);
                  }}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50"
                >
                  <span className="font-medium text-slate-700">{lang.label}</span>
                  <span className="text-sm text-slate-400">{lang.native}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLangModalTaskId(null)}
              className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

