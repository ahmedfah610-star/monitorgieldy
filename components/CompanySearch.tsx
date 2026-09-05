"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyAvatar } from "./CompanyAvatar";

interface Item {
  ticker: string;
  company: string;
  market: "PL" | "US";
  sector: string;
}

// Cache modulowy — listę katalogu pobieramy raz na sesję (kilkadziesiąt spółek).
let CACHE: Item[] | null = null;

export function CompanySearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(CACHE ?? []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (CACHE) return;
    let alive = true;
    fetch("/api/companies", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        CACHE = d.companies ?? [];
        setItems(CACHE!);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const scored = items
      .map((it) => {
        const name = it.company.toLowerCase();
        const tk = it.ticker.toLowerCase();
        let rank = -1;
        if (tk === s || name === s) rank = 0;
        else if (name.startsWith(s) || tk.startsWith(s)) rank = 1;
        else if (name.includes(s) || tk.includes(s) || it.sector.toLowerCase().includes(s)) rank = 2;
        return { it, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.it.company.localeCompare(b.it.company, "pl"))
      .slice(0, 8)
      .map((x) => x.it);
    return scored;
  }, [q, items]);

  useEffect(() => setHi(0), [q]);

  function go(it: Item) {
    setOpen(false);
    setQ("");
    router.push(`/company/${it.ticker}`);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[hi]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <svg
          viewBox="0 0 24 24" width="16" height="16"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={compact ? "Szukaj spółki…" : "Szukaj spółki — nazwa lub ticker…"}
          className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-neutral-900/10">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-neutral-500">Brak wyników dla „{q}”.</p>
          ) : (
            results.map((it, i) => (
              <button
                key={`${it.market}:${it.ticker}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => go(it)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${i === hi ? "bg-blue-50" : "hover:bg-neutral-50"}`}
              >
                <CompanyAvatar name={it.company} ticker={it.ticker} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">{it.company}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    <span className="font-mono uppercase">{it.ticker}</span> · {it.sector}
                  </span>
                </span>
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{it.market}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
