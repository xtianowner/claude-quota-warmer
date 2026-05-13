/* Date / time helpers. Backend stores ISO with offset; UI displays in local tz. */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Convert "YYYY-MM-DDTHH:mm" (datetime-local) interpreted in the user's
 *  local timezone into an ISO 8601 string (UTC). */
export function localInputToISO(local: string): string {
  // new Date("YYYY-MM-DDTHH:mm") is parsed in the local timezone.
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) throw new Error("invalid datetime");
  return d.toISOString();
}

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

export function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate(),
  )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtAbsoluteWithTZ(iso: string): string {
  const d = new Date(iso);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const oh = pad2(Math.floor(Math.abs(offset) / 60));
  const om = pad2(Math.abs(offset) % 60);
  return `${fmtAbsolute(iso)} UTC${sign}${oh}:${om}`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Coarse human countdown like "in 3h 42m" / "in 12s" / "past". */
export function countdown(
  iso: string,
  now: Date,
  t: (k: string) => string,
): { past: boolean; text: string } {
  const target = new Date(iso).getTime();
  const diff = target - now.getTime();
  if (diff < 0) return { past: true, text: t("in_past") };

  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  let body = "";
  if (d > 0) body = `${d}${t("days")} ${h}${t("hours")}`;
  else if (h > 0) body = `${h}${t("hours")} ${m}${t("minutes")}`;
  else if (m > 0) body = `${m}${t("minutes")} ${s}${t("seconds")}`;
  else body = `${s}${t("seconds")}`;
  return { past: false, text: `${t("in")} ${body}` };
}

/** Suggested default for the add form: tomorrow 05:30 local. */
export function defaultPointLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(5, 30, 0, 0);
  return isoToLocalInput(d.toISOString());
}
