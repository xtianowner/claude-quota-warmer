import { useT } from "../i18n";
import type { Status } from "../types";
import { countdown, fmtAbsolute } from "../lib/datetime";
import { Badge, Button, CardBody, CardHeader, GlassCard } from "./ui";
import { IconPlay } from "./icons";

export function StatusCard({
  status,
  now,
  onTrigger,
  triggering,
}: {
  status: Status;
  now: Date;
  onTrigger: () => void;
  triggering: boolean;
}) {
  const { t } = useT();
  const last = status.last_run;
  const next = status.next_point;
  const cd = next ? countdown(next.scheduled_at, now, t) : null;

  return (
    <GlassCard>
      <CardHeader
        title={t("status_card")}
        action={
          <div className="flex items-center gap-2">
            {status.running ? (
              <Badge tone="running" pulse>
                {t("in_flight")}
              </Badge>
            ) : (
              <Badge tone="neutral">{t("idle")}</Badge>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={onTrigger}
              disabled={triggering || status.running}
            >
              <IconPlay width={11} height={11} />
              {triggering ? t("triggering") : t("trigger_now")}
            </Button>
          </div>
        }
      />
      <CardBody>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:gap-6">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {t("next_run")}
            </dt>
            <dd className="mt-1.5">
              {next ? (
                <>
                  <div className="break-all font-mono text-sm font-medium text-slate-900">
                    {fmtAbsolute(next.scheduled_at)}
                  </div>
                  {cd && (
                    <div className="mt-0.5 break-all text-xs text-indigo-600">
                      {cd.text}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-slate-400">{t("none")}</div>
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {t("last_result")}
            </dt>
            <dd className="mt-1.5 flex flex-wrap items-center gap-2">
              {last ? (
                <>
                  <Badge tone={last.status === "success" ? "ok" : "fail"}>
                    {last.status === "success" ? t("success") : t("fail")}
                  </Badge>
                  <span className="break-all font-mono text-xs text-slate-600">
                    {fmtAbsolute(last.ended_at)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-slate-400">{t("none")}</span>
              )}
            </dd>
          </div>
          <div className="sm:text-right">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {t("streak")}
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-1 sm:justify-end">
              <span className="font-mono text-2xl font-semibold leading-none text-emerald-600">
                {status.consecutive_successes}
              </span>
            </dd>
          </div>
        </dl>
      </CardBody>
    </GlassCard>
  );
}
