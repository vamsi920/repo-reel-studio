/**
 * Formatting helpers shared by the Usage tabs.
 *
 * The rule everywhere here: an unknown value renders as a dash, never as zero.
 * "$0.00 saved" and "we could not price this" are different claims.
 */
export const UNKNOWN = "—";

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return UNKNOWN;
  }
  if (value === 0) return "$0.00";
  if (value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return UNKNOWN;
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return UNKNOWN;
  }
  return value.toLocaleString();
}

export function formatRelativeTime(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return UNKNOWN;

  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
