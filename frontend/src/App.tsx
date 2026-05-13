import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useT } from "./i18n";
import type { Config, RunRecord, Status } from "./types";

function fmtLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function splitInterval(seconds: number): { h: number; m: number } {
  return { h: Math.floor(seconds / 3600), m: Math.floor((seconds % 3600) / 60) };
}

function joinInterval(h: number, m: number): number {
  const total = Math.max(0, h) * 3600 + Math.max(0, m) * 60;
  return Math.max(60, total);
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-700">
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "ok" | "fail" | "neutral" | "running";
  children: React.ReactNode;
}) {
  const cls = {
    ok: "bg-emerald-100 text-emerald-800",
    fail: "bg-rose-100 text-rose-800",
    neutral: "bg-slate-100 text-slate-700",
    running: "bg-amber-100 text-amber-800 animate-pulse",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function LocaleSwitcher() {
  const { locale, setLocale } = useT();
  return (
    <div className="flex rounded-md border border-slate-200 bg-white text-xs">
      {(["zh", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`px-2.5 py-1 ${
            locale === l ? "bg-slate-800 text-white" : "text-slate-600"
          } first:rounded-l-md last:rounded-r-md`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function StatusCard({
  status,
  onToggle,
  onTrigger,
  triggering,
}: {
  status: Status;
  onToggle: () => void;
  onTrigger: () => void;
  triggering: boolean;
}) {
  const { t } = useT();
  const last = status.last_run;
  return (
    <Card
      title={t("status_card")}
      action={
        <div className="flex items-center gap-2">
          {status.running ? (
            <Badge tone="running">{t("in_flight")}</Badge>
          ) : (
            <Badge tone="neutral">{t("idle")}</Badge>
          )}
          <Badge tone={status.enabled ? "ok" : "neutral"}>
            {status.enabled ? t("enabled") : t("disabled")}
          </Badge>
        </div>
      }
    >
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">{t("next_run")}</dt>
          <dd className="mt-1 break-all text-sm font-medium">
            {status.next_run_at ? fmtLocal(status.next_run_at) : t("none")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{t("last_result")}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
            {last ? (
              <>
                <Badge tone={last.status === "success" ? "ok" : "fail"}>
                  {last.status === "success" ? t("success") : t("fail")}
                </Badge>
                <span className="break-all text-slate-700">
                  {fmtLocal(last.ended_at)}
                </span>
              </>
            ) : (
              t("none")
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{t("streak")}</dt>
          <dd className="mt-1 text-sm font-medium">
            {status.consecutive_successes}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onToggle}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            status.enabled
              ? "bg-slate-200 text-slate-800 hover:bg-slate-300"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {status.enabled ? t("disable") : t("enable")}
        </button>
        <button
          onClick={onTrigger}
          disabled={triggering || status.running}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {triggering ? t("triggering") : t("trigger_now")}
        </button>
      </div>
    </Card>
  );
}

function ConfigCard({
  initial,
  onSaved,
}: {
  initial: Config;
  onSaved: (c: Config) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<Config>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const { h, m } = useMemo(() => splitInterval(draft.interval_seconds), [
    draft.interval_seconds,
  ]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setErr(null);
    try {
      const saved = await api.putConfig(draft);
      onSaved(saved);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved]);

  const warnQuota = draft.interval_seconds > 5 * 3600;

  return (
    <Card title={t("config_card")}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600">
            {t("interval_label")}
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              max={11}
              value={h}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  interval_seconds: joinInterval(Number(e.target.value), m),
                })
              }
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate-600">{t("hours")}</span>
            <input
              type="number"
              min={0}
              max={59}
              value={m}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  interval_seconds: joinInterval(h, Number(e.target.value)),
                })
              }
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate-600">{t("minutes")}</span>
          </div>
          {warnQuota && (
            <p className="mt-1 text-xs text-amber-700">
              {t("warn_quota_window")}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">
            {t("command_label")}
          </label>
          <input
            type="text"
            value={draft.command}
            onChange={(e) => setDraft({ ...draft, command: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">
            {t("timeout_label")}
          </label>
          <input
            type="number"
            min={10}
            max={600}
            value={draft.timeout_seconds}
            onChange={(e) =>
              setDraft({ ...draft, timeout_seconds: Number(e.target.value) })
            }
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600">
            {t("prompt_label")}
          </label>
          <textarea
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">
            {t("marker_label")}
          </label>
          <input
            type="text"
            value={draft.expected_marker}
            onChange={(e) =>
              setDraft({ ...draft, expected_marker: e.target.value })
            }
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">
            {t("retries_label")}
          </label>
          <input
            type="number"
            min={0}
            max={10}
            value={draft.max_retries}
            onChange={(e) =>
              setDraft({ ...draft, max_retries: Number(e.target.value) })
            }
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600">
            {t("backoff_label")}
          </label>
          <input
            type="text"
            value={draft.retry_backoff_seconds.join(",")}
            onChange={(e) =>
              setDraft({
                ...draft,
                retry_backoff_seconds: e.target.value
                  .split(",")
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n) && n >= 0),
              })
            }
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? t("saving") : t("save_config")}
        </button>
        {err && <span className="text-xs text-rose-600">{err}</span>}
      </div>
    </Card>
  );
}

function HistoryCard({
  runs,
  onRefresh,
}: {
  runs: RunRecord[];
  onRefresh: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card
      title={t("history_card")}
      action={
        <button
          onClick={onRefresh}
          className="text-xs text-slate-600 underline-offset-2 hover:underline"
        >
          {t("refresh")}
        </button>
      }
    >
      {runs.length === 0 ? (
        <p className="text-sm text-slate-500">{t("history_empty")}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {runs.map((r) => {
            const dur =
              new Date(r.ended_at).getTime() -
              new Date(r.started_at).getTime();
            const expanded = open === r.id;
            return (
              <li key={r.id} className="py-2">
                <button
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.status === "success" ? "ok" : "fail"}>
                      {r.status === "success" ? t("success") : t("fail")}
                    </Badge>
                    <span className="text-sm text-slate-700">
                      {fmtLocal(r.started_at)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {r.trigger === "manual"
                      ? t("trigger_manual")
                      : t("trigger_schedule")}{" "}
                    · {r.attempts.length} {t("attempts")} ·{" "}
                    {fmtDuration(dur)}
                  </span>
                </button>
                {expanded && (
                  <div className="mt-2 space-y-2">
                    {r.attempts.map((a, i) => (
                      <div
                        key={i}
                        className="rounded border border-slate-200 bg-slate-50 p-2"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge tone={a.success ? "ok" : "fail"}>
                            #{i + 1}
                          </Badge>
                          <span className="text-slate-600">
                            {t("exit_code")}: {a.exit_code}
                          </span>
                          <span className="text-slate-600">
                            {fmtDuration(a.duration_ms)}
                          </span>
                          {a.error && (
                            <span className="text-rose-600">
                              {t("error")}: {a.error}
                            </span>
                          )}
                        </div>
                        {a.output_tail && (
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900 p-2 font-mono text-[11px] leading-relaxed text-slate-100">
                            {a.output_tail}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default function App() {
  const { t } = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.status(), api.runs(30)]);
      setStatus(s);
      setRuns(r);
      setErr(null);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const onToggle = useCallback(async () => {
    if (!status) return;
    try {
      if (status.enabled) await api.disable();
      else await api.enable();
      refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }, [status, refresh]);

  const onTrigger = useCallback(async () => {
    setTriggering(true);
    try {
      await api.trigger();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setTriggering(false);
      refresh();
    }
  }, [refresh]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>

      {err && (
        <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}

      <div className="space-y-4">
        {status && (
          <>
            <StatusCard
              status={status}
              onToggle={onToggle}
              onTrigger={onTrigger}
              triggering={triggering}
            />
            <ConfigCard initial={status.config} onSaved={() => refresh()} />
          </>
        )}
        <HistoryCard runs={runs} onRefresh={refresh} />
      </div>

      <footer className="mt-8 text-center text-xs text-slate-400">
        claude-code-healthcheck · MIT
      </footer>
    </div>
  );
}
