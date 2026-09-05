"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Market, WatchlistItem } from "@/lib/types";
import { GPW_COMPANIES } from "@/lib/gpwCompanies";

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [market, setMarket] = useState<Market>("PL");
  const [bankierSymbol, setBankierSymbol] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [addingTicker, setAddingTicker] = useState<string | null>(null);

  // Tickery PL juz na watchliscie — do oznaczenia "dodane" w katalogu.
  const plTickers = useMemo(
    () => new Set(items.filter((i) => i.market === "PL").map((i) => i.ticker.toLowerCase())),
    [items],
  );
  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return GPW_COMPANIES;
    return GPW_COMPANIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.ticker.includes(q) || c.bankierSymbol.toLowerCase().includes(q),
    );
  }, [search]);

  // Klik w katalogu: dodaje spolke, a gdy juz jest na watchliscie — odznacza
  // (usuwa ja i jej dane). Dzieki temu „✓" dziala jak przelacznik.
  async function toggleCatalog(c: (typeof GPW_COMPANIES)[number]) {
    const existing = items.find(
      (i) => i.market === "PL" && i.ticker.toLowerCase() === c.ticker.toLowerCase(),
    );
    setAddingTicker(c.ticker);
    setError(null);
    try {
      if (existing) {
        const res = await fetch(`/api/watchlist?id=${existing.id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: c.ticker, name: c.name, market: "PL", bankierSymbol: c.bankierSymbol }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie zaktualizowac watchlisty.");
    } finally {
      setAddingTicker(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setItems(json.items ?? []);
      setUsingFallback(Boolean(json.usingFallback));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac watchlisty.");
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
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name, market, bankierSymbol }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setTicker("");
      setName("");
      setBankierSymbol("");
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
      const res = await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie usunac pozycji.");
    }
  }

  return (
    <main className="space-y-6">
      <div className="card p-5">
        <p className="eyebrow">Ustawienia</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">Watchlista</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Spółki, które śledzisz — zasilają ranking, screener i wszystkie sekcje.
        </p>
      </div>

      {usingFallback && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Tryb podglądu (bez bazy): widzisz domyślna liste tylko do odczytu.
          Podepnij Vercel Postgres (<code>POSTGRES_URL</code> + <code>/api/init-db</code>),
          aby dodawać i usuwać wlasne pozycje.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
      >
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Ticker
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="np. pkn / aapl"
            className="w-32 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Nazwa
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. PKN Orlen"
            className="w-48 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Rynek
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as Market)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
          >
            <option value="PL">PL (GPW)</option>
            <option value="US">US</option>
          </select>
        </label>
        {market === "PL" && (
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Symbol bankier
            <input
              value={bankierSymbol}
              onChange={(e) => setBankierSymbol(e.target.value)}
              placeholder="np. CDPROJEKT"
              className="w-40 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={saving || usingFallback}
          className="btn btn-primary"
        >
          {saving ? "Dodaje…" : "Dodaj"}
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        „Symbol bankier" (tylko PL) to slug z adresu strony spółki na bankier.pl, np. dla
        CD Projekt jest to <code className="text-neutral-400">CDPROJEKT</code>
        {" "}(z URL <code className="text-neutral-400">/gielda/notowania/akcje/CDPROJEKT/rekomendacje</code>).
        Bez niego nie pobierzemy rekomendacji dla tej spółki.
      </p>

      {/* --- Katalog największych spółek GPW (dodawanie klikiem) --- */}
      <section className="space-y-3 rounded-lg border border-neutral-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-200">
            Największe spółki GPW <span className="text-neutral-500">(kliknij, aby dodać)</span>
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj: nazwa lub ticker…"
            className="w-56 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
          />
        </div>
        <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {catalog.map((c) => {
            const added = plTickers.has(c.ticker);
            const busy = addingTicker === c.ticker;
            return (
              <button
                key={c.ticker}
                onClick={() => toggleCatalog(c)}
                disabled={busy || usingFallback}
                title={added ? "Na watchliście — kliknij, aby usunąć" : c.bankierSymbol}
                className={`group flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition disabled:opacity-50 ${
                  added
                    ? "border-emerald-900 bg-emerald-950/40 text-emerald-300 hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
                    : "border-neutral-700 text-neutral-200 hover:border-blue-600 hover:text-blue-300"
                }`}
              >
                <span className="truncate">
                  {c.name} <span className="text-xs text-neutral-500">{c.ticker.toUpperCase()}</span>
                </span>
                <span className="shrink-0 text-xs">
                  {busy ? "…" : added ? <span className="group-hover:hidden">✓</span> : "+"}
                  {added && !busy && <span className="hidden group-hover:inline">✕</span>}
                </span>
              </button>
            );
          })}
        </div>
        {catalog.length === 0 && (
          <p className="text-sm text-neutral-500">Brak dopasowań dla „{search}".</p>
        )}
      </section>

      {loading ? (
        <p className="text-sm text-neutral-500">Ładowanie…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">Watchlista jest pusta.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="px-3 py-2 font-medium">Nazwa</th>
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="px-3 py-2 font-medium">Rynek</th>
                <th className="px-3 py-2 font-medium">Bankier</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id ?? `${it.market}:${it.ticker}`}
                  className="border-b border-neutral-900 last:border-0"
                >
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 font-mono text-neutral-400">{it.ticker}</td>
                  <td className="px-3 py-2">{it.market}</td>
                  <td className="px-3 py-2 font-mono text-neutral-500">
                    {it.bankierSymbol ?? (it.market === "PL" ? "—" : "")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(it.id)}
                      disabled={usingFallback}
                      className="text-xs text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Usun
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
