import { useState } from "react";
import { useT } from "../i18n";
import type { RunRecord } from "../types";
import { fmtAbsolute, fmtDuration } from "../lib/datetime";
import { Badge, Button, CardBody, CardHeader, GlassCard } from "./ui";

export function HistoryCard({
  runs,
  onRefresh,
}: {
  runs: RunRecord[];
  onRefresh: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <GlassCard>
      <CardHeader
        title={t("history_card")}
        action={
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            {t("refresh")}
          </Button>
        }
      />
      <CardBody>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">{t("history_empty")}</p>
        ) : (
          <ul className="divide-y divide-white/40">
            {runs.map((r) => {
              const dur =
                new Date(r.ended_at).getTime() -
                new Date(r.started_at).getTime();
              const expanded = open === r.id;
              return (
                <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.id)}
                    className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge tone={r.status === "success" ? "ok" : "fail"}>
                        {r.status === "success" ? t("success") : t("fail")}
                      </Badge>
                      <span className="break-all font-mono text-xs text-slate-700">
                        {fmtAbsolute(r.started_at)}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-slate-500">
                      {r.trigger === "manual"
                        ? t("trigger_manual")
                        : t("trigger_schedule")}{" "}
                      · {r.attempts.length} {t("attempts")} ·{" "}
                      {fmtDuration(dur)}
                    </span>
                  </button>
                  {expanded && (
                    <div className="mt-2 space-y-2 pl-2">
                      {r.attempts.map((a, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-white/60 bg-white/60 px-3 py-2.5 backdrop-blur-sm"
                        >
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
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
                              <span className="break-all text-rose-600">
                                {t("error")}: {a.error}
                              </span>
                            )}
                          </div>
                          {a.output_tail && (
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/95 px-3.5 py-3 font-mono text-[11px] leading-relaxed text-slate-100 shadow-inner">
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
      </CardBody>
    </GlassCard>
  );
}
