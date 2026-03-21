export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatRating(value: number): string {
  return value.toFixed(2);
}

export function formatDate(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function toFixedSafe(value: number, precision = 2): number {
  return Number(value.toFixed(precision));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
