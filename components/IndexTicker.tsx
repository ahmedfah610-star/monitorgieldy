"use client";

import { useEffect, useState } from "react";

interface Q { label: string; symbol: string; close: number | null; changePct: number | null; error?: string }

export function IndexTicker() {
  const [items, setItems] = useState<Q[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/quotes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const idx: Q[] = d.indices ?? [];
        const pl: Q[] = (d.pl ?? []).slice(0, 6);
        const us: Q[] = (d.us ?? []).slice(0, 4);
        setItems([...idx, ...pl, ...us].filter((q) => q.close != null));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (items.length === 0) return null;

  // Dublujemy listę, żeby taśma przewijała się w nieskończoność bez skoku
  // (animacja przesuwa track o -50%, czyli dokładnie o jedną kopię).
  const loop = [...items, ...items];

  return (
    <div className="-mx-4 overflow-hidden border-t border-neutral-200 bg-neutral-100/70">
      <div className="ticker-track flex gap-6 py-1.5 pl-4">
        {loop.map((q, i) => {
          const up = (q.changePct ?? 0) > 0;
          const down = (q.changePct ?? 0) < 0;
          return (
            <span key={`${q.symbol}:${i}`} className="flex shrink-0 items-baseline gap-1.5 text-xs" aria-hidden={i >= items.length}>
              <span className="font-medium text-neutral-700">{q.label}</span>
              <span className="tabular-nums text-neutral-500">
                {q.close?.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}
              </span>
              <span className={`tabular-nums font-medium ${up ? "text-emerald-600" : down ? "text-rose-600" : "text-neutral-500"}`}>
                {up ? "▲" : down ? "▼" : ""}{q.changePct == null ? "" : `${Math.abs(q.changePct).toFixed(2)}%`}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
