import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useT } from "./i18n";
import type { RunRecord, Status } from "./types";
import { Background } from "./components/Background";
import { StatusCard } from "./components/StatusCard";
import { ScheduleCard } from "./components/ScheduleCard";
import { ConfigCard } from "./components/ConfigCard";
import { HistoryCard } from "./components/HistoryCard";
import { Toggle } from "./components/ui";

function LocaleSwitcher() {
  const { locale, setLocale } = useT();
  return (
    <div
      role="tablist"
      aria-label="Language"
      className="inline-flex shrink-0 rounded-full border border-white/70 bg-white/60 p-0.5 text-[11px] font-medium backdrop-blur-sm"
    >
      {(["zh", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={locale === l}
          onClick={() => setLocale(l)}
          className={
            `cursor-pointer rounded-full px-2.5 py-1 transition-colors ` +
            `focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ` +
            (locale === l
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900")
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const { t } = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

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
    const poll = setInterval(refresh, 5000);
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const onToggleEnabled = useCallback(async () => {
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
    <>
      <Background />
      <div className="mx-auto min-h-screen max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="bg-gradient-to-br from-slate-900 via-indigo-900 to-fuchsia-800 bg-clip-text text-2xl font-bold leading-tight text-transparent sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">{t("subtitle")}</p>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2 self-start sm:self-auto">
            <LocaleSwitcher />
            {status && (
              <Toggle
                on={status.enabled}
                onToggle={onToggleEnabled}
                labelOn={t("enabled")}
                labelOff={t("disabled")}
              />
            )}
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-xl border border-rose-200/80 bg-rose-50/80 px-3.5 py-2.5 text-sm text-rose-700 backdrop-blur-sm">
            {err}
          </div>
        )}

        <div className="space-y-4">
          {status && (
            <>
              <StatusCard
                status={status}
                now={now}
                onTrigger={onTrigger}
                triggering={triggering}
              />
              <ScheduleCard
                points={status.config.schedule_points}
                now={now}
                onChanged={refresh}
              />
              <ConfigCard initial={status.config} onSaved={refresh} />
            </>
          )}
          <HistoryCard runs={runs} onRefresh={refresh} />
        </div>

        <footer className="mt-10 pb-4 text-center text-xs text-slate-400">
          claude-code-healthcheck · MIT
        </footer>
      </div>
    </>
  );
}
