import type { Config, ReclaudeStatus, RunRecord, Status } from "./types";

const BASE = "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  status: () => req<Status>("/api/status"),
  getConfig: () => req<Config>("/api/config"),
  putConfig: (cfg: Config) =>
    req<Config>("/api/config", {
      method: "PUT",
      body: JSON.stringify(cfg),
    }),
  enable: () => req<Config>("/api/enable", { method: "POST" }),
  disable: () => req<Config>("/api/disable", { method: "POST" }),
  trigger: () => req<RunRecord>("/api/trigger", { method: "POST" }),
  runs: (limit = 50) => req<RunRecord[]>(`/api/runs?limit=${limit}`),
  addSchedulePoint: (scheduledAt: string) =>
    req<Config>("/api/schedule", {
      method: "POST",
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    }),
  deleteSchedulePoint: (id: string) =>
    req<Config>(`/api/schedule/${encodeURIComponent(id)}`, { method: "DELETE" }),
  reclaudeLogin: (email: string, password: string) =>
    req<ReclaudeStatus>("/api/reclaude/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  reclaudeSnapshot: () => req<ReclaudeStatus>("/api/reclaude/snapshot"),
  reclaudeRefresh: () =>
    req<ReclaudeStatus>("/api/reclaude/refresh", { method: "POST" }),
  reclaudeLogout: () =>
    req<Config>("/api/reclaude/credentials", { method: "DELETE" }),
};
