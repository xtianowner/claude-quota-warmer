import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Locale = "zh" | "en";

type Messages = Record<string, string>;

const zh: Messages = {
  title: "Claude Code 限额刷新",
  subtitle: "定时发送一次真实请求，保持 5 小时配额窗口活跃",
  enabled: "已启用",
  disabled: "已停用",
  enable: "启用调度",
  disable: "停用调度",
  trigger_now: "立即触发一次",
  triggering: "执行中…",
  save_config: "保存配置",
  saving: "保存中…",
  status_card: "运行状态",
  next_run: "下次触发",
  last_result: "上次结果",
  streak: "连续成功",
  in_flight: "运行中",
  idle: "空闲",
  none: "无",
  success: "成功",
  fail: "失败",
  config_card: "调度配置",
  interval_label: "触发周期",
  hours: "小时",
  minutes: "分钟",
  command_label: "命令",
  prompt_label: "Prompt 内容",
  marker_label: "期望标记 (必须出现在输出中)",
  timeout_label: "单次超时 (秒)",
  retries_label: "最多重试次数",
  backoff_label: "重试退避 (秒，逗号分隔)",
  history_card: "历史记录",
  history_empty: "暂无历史",
  attempts: "尝试",
  duration: "用时",
  trigger_manual: "手动",
  trigger_schedule: "定时",
  exit_code: "退出码",
  output_tail: "输出尾部",
  refresh: "刷新",
  error: "错误",
  warn_quota_window:
    "提示：建议周期略小于 5 小时，否则可能错过限额窗口。",
};

const en: Messages = {
  title: "Claude Code Quota Keep-Alive",
  subtitle: "Send one real request on a schedule to keep the 5h window warm",
  enabled: "Enabled",
  disabled: "Disabled",
  enable: "Enable schedule",
  disable: "Disable schedule",
  trigger_now: "Trigger once now",
  triggering: "Running…",
  save_config: "Save config",
  saving: "Saving…",
  status_card: "Runtime status",
  next_run: "Next run",
  last_result: "Last result",
  streak: "Success streak",
  in_flight: "Running",
  idle: "Idle",
  none: "—",
  success: "Success",
  fail: "Failed",
  config_card: "Schedule config",
  interval_label: "Interval",
  hours: "h",
  minutes: "m",
  command_label: "Command",
  prompt_label: "Prompt",
  marker_label: "Expected marker (must appear in output)",
  timeout_label: "Per-attempt timeout (s)",
  retries_label: "Max retries",
  backoff_label: "Retry backoff (seconds, comma-separated)",
  history_card: "History",
  history_empty: "No runs yet",
  attempts: "attempts",
  duration: "duration",
  trigger_manual: "manual",
  trigger_schedule: "scheduled",
  exit_code: "exit",
  output_tail: "Output tail",
  refresh: "Refresh",
  error: "Error",
  warn_quota_window:
    "Tip: keep the interval just under 5h, otherwise the window may close.",
};

const TABLES: Record<Locale, Messages> = { zh, en };

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof typeof zh) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "cch.locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const initial = (typeof window !== "undefined"
    ? (window.localStorage.getItem(STORAGE_KEY) as Locale | null)
    : null) ?? "zh";
  const [locale, setLocaleState] = useState<Locale>(initial);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const t = useCallback(
    (key: keyof typeof zh) => TABLES[locale][key] ?? String(key),
    [locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("LocaleProvider missing");
  return ctx;
}
