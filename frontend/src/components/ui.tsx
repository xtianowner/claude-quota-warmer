/* Low-level glassmorphism UI primitives. */
import type { ReactNode } from "react";
import { IconCheck, IconClock, IconX } from "./icons";

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "relative rounded-2xl border border-white/60 bg-white/70 " +
        "shadow-glass backdrop-blur-xl " +
        className
      }
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/40 px-5 py-3.5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-800">
        {title}
      </h2>
      {action}
    </header>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  title?: string;
  "aria-label"?: string;
};

export function Button({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "primary",
  size = "md",
  className = "",
  title,
  ...aria
}: ButtonProps) {
  const sizeCls = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const v = {
    primary:
      "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-indigo-glow " +
      "hover:from-indigo-700 hover:to-indigo-600",
    secondary:
      "border border-white/70 bg-white/60 text-slate-700 " +
      "hover:bg-white/90 hover:border-white",
    ghost:
      "border border-transparent text-slate-600 " +
      "hover:bg-white/60 hover:text-slate-800",
    danger:
      "border border-rose-200/80 bg-rose-50/70 text-rose-700 " +
      "hover:bg-rose-100 hover:border-rose-300",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={aria["aria-label"]}
      className={
        `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl font-medium whitespace-nowrap ` +
        `transition-all duration-200 backdrop-blur-sm ` +
        `focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-white/50 ` +
        `disabled:cursor-not-allowed disabled:opacity-50 ` +
        `${sizeCls} ${v} ${className}`
      }
    >
      {children}
    </button>
  );
}

export type BadgeTone = "ok" | "fail" | "pending" | "running" | "neutral";

const BADGE_TONES: Record<BadgeTone, string> = {
  ok: "bg-emerald-100/80 text-emerald-700 border-emerald-200/80",
  fail: "bg-rose-100/80 text-rose-700 border-rose-200/80",
  pending: "bg-amber-100/80 text-amber-700 border-amber-200/80",
  running: "bg-indigo-100/80 text-indigo-700 border-indigo-200/80",
  neutral: "bg-slate-100/80 text-slate-600 border-slate-200/80",
};

export function Badge({
  tone,
  pulse,
  children,
}: {
  tone: BadgeTone;
  pulse?: boolean;
  children: ReactNode;
}) {
  const icon =
    tone === "ok" ? (
      <IconCheck width={11} height={11} strokeWidth={2.4} />
    ) : tone === "fail" ? (
      <IconX width={11} height={11} strokeWidth={2.4} />
    ) : tone === "running" || tone === "pending" ? (
      <IconClock width={11} height={11} strokeWidth={2.4} />
    ) : null;
  return (
    <span
      className={
        `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ` +
        `text-[11px] font-medium leading-none ${BADGE_TONES[tone]} ` +
        `${pulse ? "animate-pulse-soft" : ""}`
      }
    >
      {icon}
      {children}
    </span>
  );
}

export function Toggle({
  on,
  onToggle,
  disabled,
  labelOn,
  labelOff,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={
        `group inline-flex cursor-pointer items-center gap-2 rounded-full ` +
        `border border-white/70 bg-white/60 py-1 pl-1 pr-3 backdrop-blur-sm ` +
        `transition-all hover:bg-white/90 ` +
        `focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ` +
        `disabled:cursor-not-allowed disabled:opacity-50`
      }
    >
      <span
        className={
          `relative h-5 w-9 shrink-0 rounded-full transition-colors ` +
          (on ? "bg-emerald-500" : "bg-slate-300")
        }
      >
        <span
          className={
            `absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ` +
            (on ? "translate-x-4" : "translate-x-0.5")
          }
        />
      </span>
      <span className="whitespace-nowrap text-xs font-medium text-slate-700">
        {on ? labelOn ?? "On" : labelOff ?? "Off"}
      </span>
    </button>
  );
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        `w-full rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 ` +
        `text-sm text-slate-900 placeholder:text-slate-400 backdrop-blur-sm ` +
        `transition-all focus:border-transparent focus:outline-none ` +
        `focus:ring-2 focus:ring-indigo-400/60 ${className}`
      }
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        `w-full rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 ` +
        `text-sm text-slate-900 placeholder:text-slate-400 backdrop-blur-sm ` +
        `transition-all focus:border-transparent focus:outline-none ` +
        `focus:ring-2 focus:ring-indigo-400/60 ${className}`
      }
    />
  );
}
