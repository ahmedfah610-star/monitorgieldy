"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RecommendationsTable } from "@/components/RecommendationsTable";
import type { Recommendation } from "@/lib/types";

interface View {
  watchlist: Recommendation[];
  market: Recommendation[];
  usingDb: boolean;
}

interface RefreshSummary {
  inserted: number;
  fetched: number;
  sources: Record<string, number>;
  errors: string[];
  finnhubConfigured: boolean;
}

export default function RecommendationsPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RefreshSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setView(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie pobrac rekomendacji.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/recommendations/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSummary(json);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie odswiezyc rekomendacji.");
    } finally {
      setRefreshing(false);
    }
  }

  // Grupowanie rekomendacji watchlisty po spolce.
  const grouped = useMemo(() => {
    const map = new Map<string, Recommendation[]>();
    for (const r of view?.watchlist ?? []) {
      const key = r.watchTicker ?? r.symbol;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [view]);

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Rekomendacje analityków</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Odswiezam…" : "Odswiez rekomendacje"}
        </button>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Baza nie jest skonfigurowana — rekomendacje wymagają Vercel Postgres (do zapisu
          historii i wykrywania nowych). Ustaw <code>POSTGRES_URL</code> i uruchom{" "}
          <code>/api/init-db</code>.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          Błąd: {error}
        </div>
      )}

      {summary && (
        <div className="rounded-md border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm">
          <p className="text-neutral-200">
            Odswiezono: pobrano {summary.fetched}, nowych{" "}
            <span className="font-semibold text-up">{summary.inserted}</span>.
          </p>
          {!summary.finnhubConfigured && (
            <p className="mt-1 text-xs text-amber-400">
              Finnhub nieaktywny (brak FINNHUB_API_KEY) — rekomendacje US pominięte.
            </p>
          )}
          {summary.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-neutral-500">
              {summary.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && !view && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      {view && (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-medium text-neutral-200">Twoja watchlista</h2>
            {grouped.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Brak zapisanych rekomendacji. Kliknij „Odswiez rekomendacje", aby pobrać dane.
              </p>
            ) : (
              grouped.map(([ticker, recs]) => (
                <div key={ticker} className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                    {ticker} <span className="text-neutral-600">({recs[0]?.market})</span>
                  </h3>
                  <RecommendationsTable recs={recs} />
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-neutral-200">
              Najnowsze z rynku (bankier.pl)
            </h2>
            <RecommendationsTable recs={view.market} showCompany />
          </section>
        </>
      )}
    </main>
  );
}
