export function fmtPrice(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export function changeColor(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "text-neutral-400";
  if (v > 0) return "text-up";
  if (v < 0) return "text-down";
  return "text-neutral-300";
}
