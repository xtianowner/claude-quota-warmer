export type PointStatus = "pending" | "running" | "done" | "failed";
export type PointSource = "manual" | "auto";
export type Mode = "manual" | "auto_reclaude";

export interface SchedulePoint {
  id: string;
  scheduled_at: string;
  status: PointStatus;
  source: PointSource;
  run_id: string | null;
  note: string | null;
  created_at: string;
}

export interface Config {
  enabled: boolean;
  schedule_points: SchedulePoint[];
  mode: Mode;
  reclaude_email: string | null;
  auto_offset_seconds: number;
  command: string;
  extra_args: string[];
  prompt: string;
  expected_marker: string;
  timeout_seconds: number;
  max_retries: number;
  retry_backoff_seconds: number[];
}

export interface Attempt {
  started_at: string;
  ended_at: string;
  exit_code: number;
  duration_ms: number;
  output_tail: string;
  success: boolean;
  error: string | null;
}

export interface RunRecord {
  id: string;
  trigger: "schedule" | "manual";
  point_id: string | null;
  started_at: string;
  ended_at: string;
  status: "success" | "fail";
  attempts: Attempt[];
}

export interface QuotaSnapshot {
  used_usd: number;
  quota_usd: number;
  resets_at_ms: number;
  enabled: boolean;
  status: string;
  fetched_at: string;
}

export type ReclaudeError =
  | "not_configured"
  | "login_required"
  | "account_disabled"
  | "network";

export interface Status {
  enabled: boolean;
  config: Config;
  next_point: SchedulePoint | null;
  last_run: RunRecord | null;
  consecutive_successes: number;
  running: boolean;
  quota_snapshot: QuotaSnapshot | null;
  reclaude_error: ReclaudeError | null;
}

export interface ReclaudeStatus {
  has_password: boolean;
  email: string | null;
  snapshot: QuotaSnapshot | null;
  error: ReclaudeError | null;
}
