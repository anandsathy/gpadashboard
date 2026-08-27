import type { Settings } from "./types";

/** Display helpers. Nothing here computes — it only renders numbers as text. */

export function formatGpa(value: number | null | undefined, precision: 2 | 3 = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(precision);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${trimZeros(value.toFixed(decimals))}%`;
}

export function formatCredits(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return trimZeros(value.toFixed(2));
}

/** `+0.14`, `−0.03`, `even` — always signed, always the same width. */
export function formatDelta(value: number | null | undefined, precision = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(precision));
  if (rounded === 0) return "even";
  // U+2212 minus, not a hyphen: it lines up with the digits.
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(precision)}`;
}

export function formatBump(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "+0";
  return `${value > 0 ? "+" : "−"}${trimZeros(Math.abs(value).toFixed(1))}`;
}

export function formatScaleValue(
  reading: { gpa: number; percent: number; ten: number } | null,
  scale: "gpa" | "percent" | "ten",
  settings: Settings,
): string {
  if (!reading) return "—";
  switch (scale) {
    case "gpa":
      return formatGpa(reading.gpa, settings.precision);
    case "percent":
      return trimZeros(reading.percent.toFixed(1));
    case "ten":
      return reading.ten.toFixed(2);
  }
}

export const SCALE_SUFFIX: Record<"gpa" | "percent" | "ten", string> = {
  gpa: "/ 4.0",
  percent: "/ 100",
  ten: "/ 10",
};

export function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function relativeTime(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "never";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
