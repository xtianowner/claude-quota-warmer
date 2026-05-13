import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import { api } from "../api";
import type { Config } from "../types";
import {
  Button,
  CardBody,
  CardHeader,
  GlassCard,
  Input,
  Textarea,
} from "./ui";
import { IconChevron } from "./icons";

export function ConfigCard({
  initial,
  onSaved,
}: {
  initial: Config;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Config>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.putConfig(draft);
      onSaved();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved]);

  return (
    <GlassCard>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between rounded-2xl px-5 py-3.5 text-left transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold tracking-wide text-slate-800">
          {t("config_card")}
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          {open ? t("hide_config") : t("show_config")}
          <IconChevron open={open} width={14} height={14} />
        </span>
      </button>
      {open && (
        <>
          <div className="border-t border-white/40" />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("command_label")}
                </label>
                <Input
                  type="text"
                  value={draft.command}
                  onChange={(e) =>
                    setDraft({ ...draft, command: e.target.value })
                  }
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("timeout_label")}
                </label>
                <Input
                  type="number"
                  min={10}
                  max={600}
                  value={draft.timeout_seconds}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      timeout_seconds: Number(e.target.value),
                    })
                  }
                  className="font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("prompt_label")}
                </label>
                <Textarea
                  value={draft.prompt}
                  onChange={(e) =>
                    setDraft({ ...draft, prompt: e.target.value })
                  }
                  rows={2}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("marker_label")}
                </label>
                <Input
                  type="text"
                  value={draft.expected_marker}
                  onChange={(e) =>
                    setDraft({ ...draft, expected_marker: e.target.value })
                  }
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("retries_label")}
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={draft.max_retries}
                  onChange={(e) =>
                    setDraft({ ...draft, max_retries: Number(e.target.value) })
                  }
                  className="font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("backoff_label")}
                </label>
                <Input
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
                  className="font-mono"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={onSave} disabled={saving} variant="primary">
                {saving ? t("saving") : t("save_config")}
              </Button>
              {err && <span className="text-xs text-rose-600">{err}</span>}
            </div>
          </CardBody>
        </>
      )}
    </GlassCard>
  );
}
