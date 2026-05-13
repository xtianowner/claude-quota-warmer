import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { api } from "../api";
import type { Config, Mode, ReclaudeError, QuotaSnapshot } from "../types";
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
  reclaudeError,
  quotaSnapshot,
  onSaved,
}: {
  initial: Config;
  reclaudeError: ReclaudeError | null;
  quotaSnapshot: QuotaSnapshot | null;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Config>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Auto-mode is "bound" once an email is persisted; we only treat config as
  // the source of truth here — login mutates it.
  const isBound = !!initial.reclaude_email;
  const [draftMode, setDraftMode] = useState<Mode>(initial.mode);
  const [email, setEmail] = useState(initial.reclaude_email ?? "");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);
  // Mode and email are tracked separately so the 5s polling refresh doesn't
  // clobber a user mid-action. Each only resets when its own server value
  // actually changes (e.g. after login/logout).
  useEffect(() => {
    setDraftMode(initial.mode);
  }, [initial.mode]);
  useEffect(() => {
    setEmail(initial.reclaude_email ?? "");
  }, [initial.reclaude_email]);

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

  const onModeChange = useCallback(
    async (next: Mode) => {
      setDraftMode(next);
      setAuthErr(null);
      // Persist the mode immediately. Without this, the 5s polling refresh
      // would reload initial.mode from the server and snap draftMode back.
      // Switching to auto without credentials is fine — the poll job will
      // surface reclaude_error="not_configured" until the user logs in.
      try {
        await api.putConfig({ ...initial, mode: next });
        onSaved();
      } catch (e) {
        setAuthErr(String(e instanceof Error ? e.message : e));
        // revert local state so it doesn't lie about server reality
        setDraftMode(initial.mode);
      }
    },
    [initial, onSaved],
  );

  const onLogin = useCallback(async () => {
    setLoggingIn(true);
    setAuthErr(null);
    try {
      await api.reclaudeLogin(email.trim(), password);
      setPassword("");
      onSaved();
    } catch (e) {
      setAuthErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoggingIn(false);
    }
  }, [email, password, onSaved]);

  const onLogout = useCallback(async () => {
    setLoggingIn(true);
    setAuthErr(null);
    try {
      await api.reclaudeLogout();
      setPassword("");
      onSaved();
    } catch (e) {
      setAuthErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoggingIn(false);
    }
  }, [onSaved]);

  const onRefresh = useCallback(async () => {
    setLoggingIn(true);
    setAuthErr(null);
    try {
      await api.reclaudeRefresh();
      onSaved();
    } catch (e) {
      setAuthErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoggingIn(false);
    }
  }, [onSaved]);

  const errMsg = useMemo(() => {
    if (!reclaudeError) return null;
    return t(`err_${reclaudeError}` as never);
  }, [reclaudeError, t]);

  return (
    <GlassCard>
      <CardHeader title={t("mode_label")} />
      <CardBody>
        <ModeRadio value={draftMode} onChange={onModeChange} />
        <p className="mt-1.5 text-xs text-slate-500">
          {draftMode === "auto_reclaude" ? t("mode_auto_hint") : t("mode_manual_hint")}
        </p>

        {draftMode === "auto_reclaude" && (
          <div className="mt-3 rounded-xl border border-white/50 bg-white/40 p-3">
            {!isBound ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("reclaude_email_label")}
                  </label>
                  <Input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("reclaude_password_label")}
                  </label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 mt-1 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={onLogin}
                    disabled={loggingIn || !email.trim() || !password}
                    variant="primary"
                  >
                    {loggingIn ? t("reclaude_logging_in") : t("reclaude_login")}
                  </Button>
                  {authErr && <span className="text-xs text-rose-600">{authErr}</span>}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-slate-700">
                    <span className="text-xs text-slate-500">{t("reclaude_bound")} </span>
                    <span className="font-mono">{initial.reclaude_email}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={onRefresh} disabled={loggingIn} variant="ghost">
                      {t("reclaude_refresh")}
                    </Button>
                    <Button onClick={onLogout} disabled={loggingIn} variant="ghost">
                      {t("reclaude_logout")}
                    </Button>
                  </div>
                </div>
                {quotaSnapshot && <QuotaPanel snap={quotaSnapshot} />}
                {errMsg && (
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                    {errMsg}
                  </div>
                )}
                {authErr && <span className="text-xs text-rose-600">{authErr}</span>}
              </div>
            )}
          </div>
        )}
      </CardBody>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between border-t border-white/40 px-5 py-3 text-left transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
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

function ModeRadio({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
  const { t } = useT();
  const opts: { id: Mode; label: string }[] = [
    { id: "manual", label: t("mode_manual") },
    { id: "auto_reclaude", label: t("mode_auto") },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("mode_label")}
      className="inline-flex rounded-full border border-white/70 bg-white/60 p-0.5 text-xs font-medium backdrop-blur-sm"
    >
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={
              `cursor-pointer rounded-full px-3 py-1.5 transition-colors ` +
              `focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ` +
              (active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function QuotaPanel({ snap }: { snap: QuotaSnapshot }) {
  const { t } = useT();
  const pct =
    snap.quota_usd > 0
      ? Math.min(100, Math.round((snap.used_usd / snap.quota_usd) * 100))
      : 0;
  const resetsLocal = new Date(snap.resets_at_ms).toLocaleString();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{t("reclaude_quota")}</span>
        <span className="font-mono text-slate-800">
          ${snap.used_usd.toFixed(2)} / ${snap.quota_usd.toFixed(2)} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{t("reclaude_resets_at")}</span>
        <span className="font-mono text-slate-800">{resetsLocal}</span>
      </div>
    </div>
  );
}
