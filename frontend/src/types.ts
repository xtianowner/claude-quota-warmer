export type PointStatus = "pending" | "running" | "done" | "failed";

export interface SchedulePoint {
  id: string;
  scheduled_at: string;
  status: PointStatus;
  run_id: string | null;
  note: string | null;
  created_at: string;
}

export interface Config {
  enabled: boolean;
  schedule_points: SchedulePoint[];
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

export interface Status {
  enabled: boolean;
  config: Config;
  next_point: SchedulePoint | null;
  last_run: RunRecord | null;
  consecutive_successes: number;
  running: boolean;
}
