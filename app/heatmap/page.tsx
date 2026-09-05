"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreenerRow } from "@/lib/screener";

type Metric = "change" | "mom3m" | "score";
const METRICS: { key: Metric; label: string }[] = [
  { key: "change", label: "Zmiana dzienna" },
  { key: "mom3m", label: "Momentum 3M" },
  { key: "score", label: "Wynik atrakcyjności" },
];

/** Wartość metryki znormalizowana do [-1,1] (do koloru) + tekst na kaflu. */
function metricOf(r: ScreenerRow, m: Metric): { norm: number | null; text: string } {
  if (m === "change") {
    if (r.changePct == null) return { norm: null, text: "—" };
    return { norm: Math.max(-1, Math.min(1, r.changePct / 3)), text: `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}%` };
  }
  if (m === "mom3m") {
    if (r.r3m == null) return { norm: null, text: "—" };
    return { norm: Math.max(-1, Math.min(1, (r.r3m * 100) / 15)), text: `${r.r3m >= 0 ? "+" : ""}${(r.r3m * 100).toFixed(0)}%` };
  }
  if (r.score == null) return { norm: null, text: "—" };
  return { norm: Math.max(-1, Math.min(1, (r.score - 50) / 30)), text: String(r.score) };
}

function tileStyle(norm: number | null): React.CSSProperties {
  if (norm == null) return { background: "rgba(15,23,42,0.05)" };
  const a = 0.12 + Math.min(0.78, Math.abs(norm) * 0.78);
  const c = norm >= 0 ? `16,185,129` : `244,63,94`;
  return { background: `rgba(${c},${a})` };
}

export default function HeatmapPage() {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("change");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/screener", { cache: "no-store" }).then((r) => r.json());
      setRows((res.rows ?? []).filter((r: ScreenerRow) => r.market === "PL"));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const bySec = new Map<string, ScreenerRow[]>();
    for (const r of rows) {
      const arr = bySec.get(r.sector) ?? [];
      arr.push(r);
      bySec.set(r.sector, arr);
    }
    const capOf = (arr: ScreenerRow[]) => arr.reduce((s, r) => s + (r.marketCap ?? 0), 0);
    return [...bySec.entries()]
      .map(([sector, items]) => ({ sector, items: items.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)), cap: capOf(items) }))
      .sort((a, b) => b.cap - a.cap);
  }, [rows]);

  // Rozmiar kafla ~ sqrt(kapitalizacji), znormalizowany do zakresu px.
  const caps = rows.map((r) => r.marketCap ?? 0).filter((c) => c > 0);
  const sqrtMin = Math.sqrt(Math.min(...(caps.length ? caps : [1])));
  const sqrtMax = Math.sqrt(Math.max(...(caps.length ? caps : [1])));
  const dim = (cap: number | null) => {
    if (!cap || cap <= 0 || sqrtMax === sqrtMin) return 62;
    return Math.round(62 + (150 - 62) * (Math.sqrt(cap) - sqrtMin) / (sqrtMax - sqrtMin));
  };

  return (
    <main className="space-y-5">
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Mapa rynku</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">Heatmapa GPW</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Cały rynek na jeden rzut oka — kafle grupowane <strong className="text-neutral-800">sektorami</strong>,
              wielkość = kapitalizacja, kolor = wybrana metryka. Zielone rośnie, czerwone spada.
            </p>
          </div>
          <Link href="/screener" className="btn btn-ghost">☰ Screener</Link>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`navpill border ${metric === m.key ? "border-blue-500/40 bg-blue-500/10 text-blue-700" : "border-neutral-200 text-neutral-600 hover:text-neutral-200"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.sector} className="card p-3">
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">{g.sector}</h2>
              <span className="text-[10px] text-neutral-500">{g.items.length} · {(g.cap / 1e9).toFixed(0)} mld</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.items.map((r) => {
                const { norm, text } = metricOf(r, metric);
                const d = dim(r.marketCap);
                return (
                  <Link
                    key={r.ticker}
                    href="/ranking"
                    title={`${r.company} · kap. ${(r.marketCap ?? 0) / 1e9 >= 0.1 ? ((r.marketCap ?? 0) / 1e9).toFixed(1) + " mld" : "—"} · wynik ${r.score ?? "—"}`}
                    className="group relative flex flex-col items-center justify-center overflow-hidden rounded-md ring-1 ring-inset ring-neutral-200 transition hover:ring-neutral-300"
                    style={{ width: d, height: Math.max(48, d * 0.66), ...tileStyle(norm) }}
                  >
                    <span className="font-mono text-[11px] font-bold uppercase text-neutral-900 drop-shadow">{r.ticker}</span>
                    <span className="text-[10px] font-medium text-neutral-700">{text}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="text-[10px] text-neutral-500">
        Wielkość kafla ∝ pierwiastek z kapitalizacji. Klik → Ranking. Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
