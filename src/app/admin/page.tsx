"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TaskStatus = "draft" | "pending_review" | "production";

interface AdminTaskRow {
  id: string;
  title: string;
  language: string;
  status: TaskStatus;
  createdAt: string; // ISO string
}

type AdminTab = "overview" | "tasks";

const INITIAL_TASKS: AdminTaskRow[] = [
  {
    id: "task-logo-customization-required-assets-001",
    title: "Logo Customization – Prompt-only Assets",
    language: "English",
    status: "pending_review",
    // Hardcoded sample created date: 02/12/2026, 15:31:20
    createdAt: new Date("2026-02-12T15:31:20").toISOString(),
  },
];

export default function AdminPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [tasks, setTasks] = useState<AdminTaskRow[]>(INITIAL_TASKS);

  const [filterLanguage, setFilterLanguage] = useState<string>("English");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLanguage, setCreateLanguage] = useState("English");
  const [createTopic, setCreateTopic] = useState("");
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("adminLoggedIn");
    if (stored === "true") {
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loginUser === "admin" && loginPassword === "1234") {
      setIsLoggedIn(true);
      setLoginError(null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("adminLoggedIn", "true");
      }
    } else {
      setLoginError("Invalid username or password.");
    }
  };

  const handleSignOut = () => {
    setIsLoggedIn(false);
    setLoginUser("");
    setLoginPassword("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("adminLoggedIn");
    }
  };

  const openCreateModal = () => {
    setCreateTopic("");
    setCreateLanguage("English");
    setCreateModalOpen(true);
  };

  const handleConfirmCreate = () => {
    if (!createTopic.trim()) return;
    setCreating(true);

    const newTask: AdminTaskRow = {
      id: `task-${Date.now()}`,
      title: createTopic.trim(),
      language: createLanguage,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);

    setTimeout(() => {
      setCreating(false);
      setCreateModalOpen(false);
      router.push("/edit");
    }, 2000);
  };

  const renderOverview = () => {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-slate-900">Overview</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-slate-800">
            Your role is: <span className="font-semibold">Task Reviewer</span>
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
              Filter and review all authoring tasks.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Create task
          </button>
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
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
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
                      <td className="px-3 py-2 align-top">
                        <div className="flex justify-end gap-2">
                          {t.status === "pending_review" ? (
                            <button
                              type="button"
                              onClick={() => router.push("/edit")}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              Review
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => router.push("/edit")}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Open
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => router.push("/")}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            View
                          </button>
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
          <h1 className="mb-2 text-xl font-semibold text-slate-900">Admin login</h1>
          <p className="mb-4 text-sm text-slate-600">
            Please sign in to access the admin portal.
          </p>
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
              Sign in
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Create new task</h2>
            <p className="mb-4 text-sm text-slate-600">
              Choose the task language and enter a topic. AI backend will generate a new task based on the topic.
            </p>
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
            {creating && (
              <p className="mt-4 text-sm text-slate-600">Creating new task…</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !creating && setCreateModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreate}
                disabled={creating || !createTopic.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

