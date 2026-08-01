"use client";

import { useCallback, useEffect, useState } from "react";
import type { RankingEntry, RankingComponent } from "@/lib/types";

interface View {
  ranking: RankingEntry[];
  usingDb: boolean;
}

function scoreColor(score: number): string {
  if (score >= 65) return "text-emerald-400";
  if (score >= 55) return "text-emerald-300";
  if (score <= 35) return "text-red-400";
  if (score <= 45) return "text-red-300";
  return "text-neutral-300";
}

function Chip({ c }: { c: RankingComponent }) {
  if (c.score === null)
    return (
      <span
        title={`${c.label}: brak danych`}
        className="rounded border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-600"
      >
        {c.label} —
      </span>
    );
  const pos = c.score > 0.05;
  const neg = c.score < -0.05;
  const cls = pos
    ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
    : neg
      ? "border-red-900 bg-red-950/40 text-red-300"
      : "border-neutral-700 bg-neutral-900 text-neutral-400";
  const sign = pos ? "▲" : neg ? "▼" : "–";
  return (
    <span title={`${c.label}: ${c.detail} (waga ${Math.round(c.weight * 100)}%)`} className={`rounded border px-1.5 py-0.5 text-[11px] ${cls}`}>
      {sign} {c.label}: <span className="text-neutral-300">{c.detail}</span>
    </span>
  );
}

function Bar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-800">
      <div
        className={`h-full rounded ${score >= 55 ? "bg-emerald-500" : score <= 45 ? "bg-red-500" : "bg-neutral-500"}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

export default function RankingPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ranking", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie policzyc rankingu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ranking atrakcyjności</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Wewnętrzny, deterministyczny wynik 0-100 (50 = neutralnie) liczony ze wszystkich
            zebranych sygnałów: rekomendacje, insiderzy, krótkie pozycje, wyniki r/r, znaczne
            pakiety, dywidenda. Bez AI. Najedź na chip, aby zobaczyć wagę i szczegół.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Liczę…" : "Przelicz"}
        </button>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Wymaga bazy (Vercel Postgres). Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>,
          potem odśwież źródła, aby ranking miał z czego liczyć.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          Błąd: {error}
        </div>
      )}

      {loading && !view && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      {view && view.ranking.length === 0 && !loading && view.usingDb && (
        <p className="text-sm text-neutral-500">
          Brak spółek albo danych. Dodaj spółki do watchlisty i odśwież źródła (rekomendacje,
          raporty, shorty…), aby ranking miał sygnały.
        </p>
      )}

      <ol className="space-y-3">
        {view?.ranking.map((e, i) => (
          <li key={e.ticker} className="rounded-lg border border-neutral-800 p-3">
            <div className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-center text-lg font-semibold text-neutral-500">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-neutral-100">
                    {e.company} <span className="text-neutral-600">({e.ticker})</span>
                    <span className="ml-1 text-[10px] text-neutral-600">{e.market}</span>
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className={`text-xl font-bold tabular-nums ${scoreColor(e.score)}`}>{e.score}</span>
                    <span className="text-xs text-neutral-600">/100</span>
                    {e.coverage < 0.5 && (
                      <span title="Mało danych — wynik oparty na niewielu sygnałach" className="text-[10px] text-amber-500">
                        skąpe dane
                      </span>
                    )}
                  </span>
                </div>
                <div className="my-1.5">
                  <Bar score={e.score} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {e.components.map((c) => (
                    <Chip key={c.key} c={c} />
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-[10px] text-neutral-600">
        Wynik heurystyczny — narzędzie informacyjne, nie doradztwo inwestycyjne. Wagi: rekomendacje
        25%, insiderzy 20%, wyniki r/r 20%, krótkie pozycje 18%, znaczne pakiety 12%, dywidenda 5%
        (renormalizowane do dostępnych danych).
      </p>
    </main>
  );
}
