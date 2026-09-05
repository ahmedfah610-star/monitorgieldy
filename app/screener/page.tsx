"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SECTORS } from "@/lib/sectors";
import type { ScreenerRow } from "@/lib/screener";

type Dir = "asc" | "desc";
interface Filters {
  sector: string;
  market: string;
  scoreMin: string;
  peMax: string;
  roeMin: string;
  divMin: string;
  mom3mMin: string;
  capMin: string;
  hideSoe: boolean;
  liquidOnly: boolean;
}
const EMPTY: Filters = {
  sector: "", market: "", scoreMin: "", peMax: "", roeMin: "", divMin: "", mom3mMin: "", capMin: "",
  hideSoe: false, liquidOnly: false,
};

const fmt = (v: number | null, dp = 1) => (v == null ? "—" : v.toFixed(dp));
const pct = (v: number | null, dp = 0) => (v == null ? "—" : `${v >= 0 ? "" : ""}${(v * 100).toFixed(dp)}%`);
const cap = (v: number | null) => (v == null ? "—" : `${(v / 1e9).toFixed(1)}`);

function scoreColor(s: number | null) {
  if (s == null) return "text-neutral-500";
  if (s >= 65) return "text-emerald-600";
  if (s >= 55) return "text-emerald-700";
  if (s <= 35) return "text-rose-600";
  if (s <= 45) return "text-rose-700";
  return "text-neutral-700";
}
const chgColor = (v: number | null) => (v == null ? "text-neutral-500" : v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-600" : "text-neutral-600");

interface Col {
  key: keyof ScreenerRow;
  label: string;
  align?: "right";
  render: (r: ScreenerRow) => React.ReactNode;
  cls?: (r: ScreenerRow) => string;
}
const COLS: Col[] = [
  { key: "score", label: "Wynik", align: "right", render: (r) => r.score ?? "—", cls: (r) => `font-bold ${scoreColor(r.score)}` },
  { key: "company", label: "Spółka", render: (r) => (
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-neutral-900">{r.company}</span>
        <span className="font-mono text-[10px] uppercase text-neutral-500">{r.ticker}</span>
        {r.soe && <span className="rounded bg-amber-500/10 px-1 text-[9px] text-amber-700">SP</span>}
      </span>
    ) },
  { key: "sector", label: "Sektor", render: (r) => <span className="text-neutral-600">{r.sector}</span> },
  { key: "close", label: "Kurs", align: "right", render: (r) => (r.close == null ? "—" : `${r.close.toFixed(2)}`) },
  { key: "changePct", label: "Zm.", align: "right", render: (r) => (r.changePct == null ? "—" : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}%`), cls: (r) => chgColor(r.changePct) },
  { key: "pe", label: "C/Z", align: "right", render: (r) => fmt(r.pe) },
  { key: "pbv", label: "C/WK", align: "right", render: (r) => fmt(r.pbv) },
  { key: "evEbitda", label: "EV/EBITDA", align: "right", render: (r) => fmt(r.evEbitda) },
  { key: "roe", label: "ROE", align: "right", render: (r) => pct(r.roe), cls: (r) => (r.roe != null && r.roe > 0.15 ? "text-emerald-700" : "") },
  { key: "dte", label: "D/E", align: "right", render: (r) => (r.dte == null ? "—" : `${r.dte.toFixed(0)}%`) },
  { key: "divYield", label: "Dyw.", align: "right", render: (r) => (r.divYield == null ? "—" : `${r.divYield.toFixed(1)}%`), cls: (r) => (r.divYield ? "text-emerald-700" : "") },
  { key: "r3m", label: "Mom 3M", align: "right", render: (r) => (r.r3m == null ? "—" : `${r.r3m >= 0 ? "+" : ""}${(r.r3m * 100).toFixed(0)}%`), cls: (r) => chgColor(r.r3m) },
  { key: "marketCap", label: "Kap. (mld)", align: "right", render: (r) => cap(r.marketCap) },
];

const PRESETS: { label: string; apply: () => { f: Filters; sort: keyof ScreenerRow; dir: Dir } }[] = [
  { label: "Nasz Top", apply: () => ({ f: { ...EMPTY }, sort: "score", dir: "desc" }) },
  { label: "Tanie i rentowne", apply: () => ({ f: { ...EMPTY, peMax: "15", roeMin: "12" }, sort: "score", dir: "desc" }) },
  { label: "Dywidendowe", apply: () => ({ f: { ...EMPTY, divMin: "4" }, sort: "divYield", dir: "desc" }) },
  { label: "Momentum", apply: () => ({ f: { ...EMPTY, mom3mMin: "5" }, sort: "r3m", dir: "desc" }) },
  { label: "Duże i płynne", apply: () => ({ f: { ...EMPTY, capMin: "5", liquidOnly: true }, sort: "marketCap", dir: "desc" }) },
];

export default function ScreenerPage() {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDb, setUsingDb] = useState(true);
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<keyof ScreenerRow>("score");
  const [dir, setDir] = useState<Dir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/screener", { cache: "no-store" }).then((r) => r.json());
      setRows(res.rows ?? []);
      setUsingDb(res.usingDb ?? true);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof Filters, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  const filtered = useMemo(() => {
    const scoreMin = num(f.scoreMin), peMax = num(f.peMax), roeMin = num(f.roeMin);
    const divMin = num(f.divMin), mom3mMin = num(f.mom3mMin), capMin = num(f.capMin);
    const out = rows.filter((r) => {
      if (f.sector && r.sector !== f.sector) return false;
      if (f.market && r.market !== f.market) return false;
      if (scoreMin != null && (r.score == null || r.score < scoreMin)) return false;
      if (peMax != null && (r.pe == null || r.pe <= 0 || r.pe > peMax)) return false;
      if (roeMin != null && (r.roe == null || r.roe * 100 < roeMin)) return false;
      if (divMin != null && (r.divYield == null || r.divYield < divMin)) return false;
      if (mom3mMin != null && (r.r3m == null || r.r3m * 100 < mom3mMin)) return false;
      if (capMin != null && (r.marketCap == null || r.marketCap / 1e9 < capMin)) return false;
      if (f.hideSoe && r.soe) return false;
      if (f.liquidOnly && (r.turnover == null || r.turnover < 5e6)) return false;
      return true;
    });
    out.sort((a, b) => {
      const av = a[sort], bv = b[sort];
      const an = typeof av === "number" ? av : av == null ? -Infinity : String(av);
      const bn = typeof bv === "number" ? bv : bv == null ? -Infinity : String(bv);
      if (typeof an === "number" && typeof bn === "number") return dir === "desc" ? bn - an : an - bn;
      return dir === "desc" ? String(bn).localeCompare(String(an)) : String(an).localeCompare(String(bn));
    });
    return out;
  }, [rows, f, sort, dir]);

  function toggleSort(k: keyof ScreenerRow) {
    if (sort === k) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(k);
      setDir("desc");
    }
  }

  function exportCsv() {
    const head = COLS.map((c) => c.label).join(",");
    const body = filtered
      .map((r) => COLS.map((c) => {
        const v = r[c.key];
        return typeof v === "number" ? v : `"${String(v ?? "")}"`;
      }).join(","))
      .join("\n");
    const blob = new Blob([`${head}\n${body}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "screener-gpw.csv";
    a.click();
  }

  return (
    <main className="space-y-5">
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Skaner rynku</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">Screener GPW</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Filtruj cały katalog wg własnych kryteriów — wycena, jakość, momentum, dywidenda,
              wielkość — z naszym <strong className="text-neutral-800">wynikiem atrakcyjności</strong> w
              każdym wierszu. Kliknij nagłówek, by sortować.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/heatmap" className="btn btn-ghost">🗺 Heatmapa</Link>
            <button onClick={exportCsv} className="btn btn-ghost">↓ CSV</button>
          </div>
        </div>

        {/* Presety */}
        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { const { f: nf, sort: s, dir: d } = p.apply(); setF(nf); setSort(s); setDir(d); }}
              className="navpill border border-neutral-200 text-neutral-700 hover:border-blue-500/40 hover:text-neutral-900"
            >
              {p.label}
            </button>
          ))}
          <button onClick={() => setF(EMPTY)} className="navpill text-neutral-500 hover:text-neutral-200">
            Wyczyść
          </button>
        </div>

        {/* Filtry */}
        <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Select label="Sektor" value={f.sector} onChange={(v) => set("sector", v)} options={["", ...SECTORS]} labels={{ "": "wszystkie" }} />
          <Select label="Rynek" value={f.market} onChange={(v) => set("market", v)} options={["", "PL", "US"]} labels={{ "": "wszystkie" }} />
          <NumIn label="Wynik ≥" value={f.scoreMin} onChange={(v) => set("scoreMin", v)} ph="np. 55" />
          <NumIn label="C/Z ≤" value={f.peMax} onChange={(v) => set("peMax", v)} ph="np. 15" />
          <NumIn label="ROE % ≥" value={f.roeMin} onChange={(v) => set("roeMin", v)} ph="np. 12" />
          <NumIn label="Dyw. % ≥" value={f.divMin} onChange={(v) => set("divMin", v)} ph="np. 4" />
          <NumIn label="Mom 3M % ≥" value={f.mom3mMin} onChange={(v) => set("mom3mMin", v)} ph="np. 5" />
          <NumIn label="Kap. mld ≥" value={f.capMin} onChange={(v) => set("capMin", v)} ph="np. 5" />
          <Toggle label="Bez spółek SP" checked={f.hideSoe} onChange={(v) => set("hideSoe", v)} />
          <Toggle label="Tylko płynne" checked={f.liquidOnly} onChange={(v) => set("liquidOnly", v)} />
        </div>
      </div>

      {!usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Wymaga bazy. Uruchom <code>/api/init-db</code> i odśwież „Notowania" w Rankingu.
        </div>
      )}

      <div className="flex items-center justify-between px-1 text-xs text-neutral-500">
        <span>{loading ? "Ładowanie…" : `${filtered.length} z ${rows.length} spółek`}</span>
        <span>Kliknij spółkę → szczegóły w Rankingu</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500">
              {COLS.map((c) => (
                <th
                  key={String(c.key)}
                  onClick={() => toggleSort(c.key)}
                  className={`cursor-pointer select-none px-2.5 py-2.5 font-medium hover:text-neutral-300 ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  {c.label}
                  {sort === c.key && <span className="ml-0.5 text-blue-600">{dir === "desc" ? "▾" : "▴"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ticker} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50">
                {COLS.map((c) => (
                  <td
                    key={String(c.key)}
                    className={`whitespace-nowrap px-2.5 py-2 tabular-nums ${c.align === "right" ? "text-right" : "text-left"} ${c.cls?.(r) ?? "text-neutral-800"}`}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-neutral-500">Brak spółek dla tych filtrów.</p>
        )}
      </div>
    </main>
  );
}

function Select({ label, value, onChange, options, labels }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 outline-none focus:border-blue-500/50"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-white">
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumIn({ label, value, onChange, ph }: { label: string; value: string; onChange: (v: string) => void; ph?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ph}
        className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500/50"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 self-end rounded-lg border px-2 py-1.5 text-xs transition ${
        checked ? "border-blue-500/40 bg-blue-500/10 text-blue-700" : "border-neutral-200 bg-white text-neutral-600 hover:text-neutral-200"
      }`}
    >
      <span className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border ${checked ? "border-blue-400 bg-blue-500 text-white" : "border-neutral-300"}`}>
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
