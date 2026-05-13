import type { Config, RunRecord, Status } from "./types";

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
};
