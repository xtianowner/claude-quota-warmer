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
  subtitle: "在你设定的时刻发送真实请求，保持 5 小时配额窗口活跃",
  enabled: "已启用",
  disabled: "已停用",
  enable: "启用",
  disable: "停用",
  trigger_now: "立即触发",
  triggering: "执行中…",
  // status card
  status_card: "运行状态",
  next_run: "下次触发",
  last_result: "上次结果",
  streak: "连续成功",
  in_flight: "运行中",
  idle: "空闲",
  none: "—",
  success: "成功",
  fail: "失败",
  pending: "待触发",
  running: "执行中",
  done: "已完成",
  failed: "失败",
  // schedule card
  schedule_card: "触发时间点",
  schedule_empty: "暂无触发点。在下面添加你想刷新限额的具体时刻。",
  add_point: "添加触发点",
  add: "添加",
  date_label: "日期",
  time_label: "时间",
  picker_hint: "本地时区时间。一次性触发，触发后状态变为已完成。",
  delete: "删除",
  in_past: "已过期",
  in: "还有",
  days: "天",
  hours: "小时",
  minutes: "分钟",
  seconds: "秒",
  // config card
  config_card: "高级配置",
  show_config: "展开配置",
  hide_config: "收起",
  command_label: "命令",
  prompt_label: "Prompt 内容",
  marker_label: "期望输出标记",
  timeout_label: "单次超时 (秒)",
  retries_label: "最多重试次数",
  backoff_label: "重试退避 (秒，逗号分隔)",
  save_config: "保存配置",
  saving: "保存中…",
  // history
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
};

const en: Messages = {
  title: "Claude Code Quota Keep-Alive",
  subtitle:
    "Send a real request at the moments you choose, so the 5h window stays warm",
  enabled: "Enabled",
  disabled: "Disabled",
  enable: "Enable",
  disable: "Disable",
  trigger_now: "Trigger now",
  triggering: "Running…",
  status_card: "Runtime",
  next_run: "Next trigger",
  last_result: "Last result",
  streak: "Streak",
  in_flight: "Running",
  idle: "Idle",
  none: "—",
  success: "Success",
  fail: "Failed",
  pending: "Pending",
  running: "Running",
  done: "Done",
  failed: "Failed",
  schedule_card: "Trigger schedule",
  schedule_empty: "No trigger points yet. Add one below.",
  add_point: "Add a trigger point",
  add: "Add",
  date_label: "Date",
  time_label: "Time",
  picker_hint:
    "Local timezone. One-shot trigger; status flips to Done once executed.",
  delete: "Delete",
  in_past: "Past",
  in: "in",
  days: "d",
  hours: "h",
  minutes: "m",
  seconds: "s",
  config_card: "Advanced config",
  show_config: "Show",
  hide_config: "Hide",
  command_label: "Command",
  prompt_label: "Prompt",
  marker_label: "Expected marker",
  timeout_label: "Per-attempt timeout (s)",
  retries_label: "Max retries",
  backoff_label: "Retry backoff (s, comma-separated)",
  save_config: "Save config",
  saving: "Saving…",
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
  const initial =
    (typeof window !== "undefined"
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
