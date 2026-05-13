export interface Config {
  enabled: boolean;
  interval_seconds: number;
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
  started_at: string;
  ended_at: string;
  status: "success" | "fail";
  attempts: Attempt[];
}

export interface Status {
  enabled: boolean;
  config: Config;
  next_run_at: string | null;
  last_run: RunRecord | null;
  consecutive_successes: number;
  running: boolean;
}
