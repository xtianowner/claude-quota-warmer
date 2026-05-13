import { useCallback, useState } from "react";
import { useT } from "../i18n";
import { api } from "../api";
import type { SchedulePoint } from "../types";
import {
  countdown,
  defaultPointLocal,
  fmtAbsolute,
  localInputToISO,
} from "../lib/datetime";
import { Badge, type BadgeTone, Button, CardBody, CardHeader, GlassCard, Input } from "./ui";
import { IconCalendar, IconPlus, IconTrash } from "./icons";

const POINT_TONE: Record<SchedulePoint["status"], BadgeTone> = {
  pending: "pending",
  running: "running",
  done: "ok",
  failed: "fail",
};

export function ScheduleCard({
  points,
  now,
  onChanged,
}: {
  points: SchedulePoint[];
  now: Date;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<string>(defaultPointLocal());
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onAdd = useCallback(async () => {
    setErr(null);
    setAdding(true);
    try {
      const iso = localInputToISO(draft);
      await api.addSchedulePoint(iso);
      onChanged();
      setDraft(defaultPointLocal());
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setAdding(false);
    }
  }, [draft, onChanged]);

  const onDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteSchedulePoint(id);
        onChanged();
      } catch (e) {
        setErr(String(e instanceof Error ? e.message : e));
      }
    },
    [onChanged],
  );

  // sort: pending/running by time asc, then done/failed by time desc
  const sorted = [...points].sort((a, b) => {
    const aActive = a.status === "pending" || a.status === "running";
    const bActive = b.status === "pending" || b.status === "running";
    if (aActive !== bActive) return aActive ? -1 : 1;
    const at = new Date(a.scheduled_at).getTime();
    const bt = new Date(b.scheduled_at).getTime();
    return aActive ? at - bt : bt - at;
  });

  return (
    <GlassCard>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <IconCalendar width={14} height={14} />
            {t("schedule_card")}
          </span>
        }
        action={
          points.length > 0 ? (
            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-100/80 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              {points.length}
            </span>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/40 px-4 py-6 text-center text-sm text-slate-500">
            {t("schedule_empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((p) => {
              const tone = POINT_TONE[p.status];
              const statusLabel = t(p.status);
              const isUpcoming = p.status === "pending";
              const cd = isUpcoming ? countdown(p.scheduled_at, now, t) : null;
              return (
                <li
                  key={p.id}
                  className="group flex items-center gap-3 rounded-xl border border-white/60 bg-white/50 px-3 py-3 backdrop-blur-md transition-colors hover:bg-white/75 sm:px-4"
                >
                  <Badge tone={tone} pulse={p.status === "running"}>
                    {statusLabel}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="break-all font-mono text-sm font-medium text-slate-900">
                      {fmtAbsolute(p.scheduled_at)}
                    </div>
                    {cd && !cd.past && (
                      <div className="break-all text-xs text-indigo-600">
                        {cd.text}
                      </div>
                    )}
                    {p.note && (
                      <div className="break-all text-xs text-slate-500">
                        {p.note}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(p.id)}
                    aria-label={t("delete")}
                    title={t("delete")}
                    className="shrink-0 !px-2"
                  >
                    <IconTrash width={14} height={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="rounded-xl border border-white/60 bg-white/50 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              {t("add_point")}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                type="datetime-local"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="font-mono"
              />
            </div>
            <Button
              onClick={onAdd}
              disabled={adding || !draft}
              className="self-end sm:self-auto sm:shrink-0"
            >
              <IconPlus width={14} height={14} />
              {t("add")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("picker_hint")}</p>
          {err && <p className="mt-1.5 text-xs text-rose-600">{err}</p>}
        </div>
      </CardBody>
    </GlassCard>
  );
}
