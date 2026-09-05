"use client";

import { useCallback, useEffect, useState } from "react";
import type { Market, PortfolioPosition, PortfolioSummary } from "@/lib/types";
import { SECTORS } from "@/lib/sectors";

interface View {
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
  usdPln: number;
  usingDb: boolean;
}

const PLN = (v: number) =>
  v.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) + " zł";

function AllocationBar({ pct }: { pct: number }) {
  const color = pct >= 40 ? "bg-amber-500" : pct >= 25 ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-neutral-800">
      <div className={`h-full rounded ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function PortfolioPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [market, setMarket] = useState<Market>("PL");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"PLN" | "USD">("PLN");
  const [sector, setSector] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac portfela.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ticker, market, amount: Number(amount), currency, sector }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setName("");
      setTicker("");
      setAmount("");
      setSector("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie dodac pozycji.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id?: number) {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`/api/portfolio?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie usunac.");
    }
  }

  const summary = view?.summary;

  return (
    <main className="space-y-6">
      <div className="card p-5">
        <p className="eyebrow">Portfel</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">Twoje portfolio</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Wpisz spółki, które masz, i wielkość pozycji w PLN lub USD (USD przeliczamy na PLN po
          kursie {view?.usdPln ?? 3.75}). Branża podpina się automatycznie; poniżej rozbicie
          portfela na branże z sugestią dywersyfikacji. Bez AI.
        </p>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Portfel wymaga bazy (Vercel Postgres). Ustaw <code>POSTGRES_URL</code> i uruchom{" "}
          <code>/api/init-db</code>, aby zapisywać pozycje.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Spółka
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. CD Projekt" required
            className="w-40 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Ticker
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="np. cdr / AAPL" required
            className="w-28 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Rynek
          <select value={market} onChange={(e) => setMarket(e.target.value as Market)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500">
            <option value="PL">PL (GPW)</option>
            <option value="US">US</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Kwota
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="any" placeholder="np. 10000" required
            className="w-28 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Waluta
          <select value={currency} onChange={(e) => setCurrency(e.target.value as "PLN" | "USD")}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500">
            <option value="PLN">PLN</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Branża
          <select value={sector} onChange={(e) => setSector(e.target.value)}
            className="w-44 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500">
            <option value="">— automatycznie —</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saving || (view != null && !view.usingDb)}
          className="btn btn-primary">
          {saving ? "Dodaję…" : "Dodaj"}
        </button>
      </form>

      {/* --- Podsumowanie --- */}
      {summary && view && view.positions.length > 0 && (
        <section className="space-y-3 rounded-lg border border-neutral-800 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">Rozbicie na branże</h2>
            <span className="text-sm text-neutral-400">
              Wartość portfela: <span className="font-semibold text-neutral-100">{PLN(summary.totalPln)}</span>
            </span>
          </div>
          <div className="space-y-2">
            {summary.allocations.map((a) => (
              <div key={a.sector} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-sm text-neutral-300">{a.sector}</span>
                <div className="flex-1"><AllocationBar pct={a.pct} /></div>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                  {a.pct.toFixed(1)}% · {PLN(a.amountPln)}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-indigo-900/60 bg-indigo-950/30 p-3 text-sm text-neutral-200">
            💡 {summary.suggestion}
          </div>
        </section>
      )}

      {/* --- Pozycje --- */}
      {loading && !view && <p className="text-sm text-neutral-500">Ładowanie…</p>}
      {view && view.positions.length === 0 && !loading && view.usingDb && (
        <p className="text-sm text-neutral-500">Portfel pusty — dodaj pierwszą pozycję powyżej.</p>
      )}
      {view && view.positions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="px-3 py-2 font-medium">Spółka</th>
                <th className="px-3 py-2 font-medium">Rynek</th>
                <th className="px-3 py-2 font-medium">Branża</th>
                <th className="px-3 py-2 text-right font-medium">Kwota</th>
                <th className="px-3 py-2 text-right font-medium">W PLN</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {view.positions.map((p) => (
                <tr key={p.id} className="border-b border-neutral-900 last:border-0">
                  <td className="px-3 py-2">
                    {p.name} <span className="font-mono text-xs text-neutral-500">{p.ticker.toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-2 text-neutral-400">{p.market}</td>
                  <td className="px-3 py-2 text-neutral-300">{p.sector}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.amount.toLocaleString("pl-PL")} {p.currency}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-200">{PLN(p.amountPln)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(p.id)} className="text-xs text-red-400 hover:text-red-300">
                      Usuń
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-neutral-600">
        Kurs USD/PLN stały ({view?.usdPln ?? 3.75}). Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
