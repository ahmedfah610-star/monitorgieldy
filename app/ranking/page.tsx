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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
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

  // Jednym klikiem pobiera WSZYSTKIE zrodla dla calej watchlisty (tylko nowe —
  // dedup). Zastepuje reczne odswiezanie kazdej sekcji osobno.
  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/refresh-all", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const c: Record<string, number> = json.counts ?? {};
      const n = (k: string, name: string) => `${name} +${c[k] ?? 0}`;
      const parts = [
        n("recommendations", "rekomendacje"),
        n("reports", "raporty"),
        json.financials?.needsKey ? "wyniki r/r: wymaga klucza AI" : n("financials", "wyniki r/r"),
        n("short", "shorty"),
        n("holdings", "pakiety"),
        n("insider", "insiderzy"),
        n("dividends", "dywidendy"),
      ];
      const failed = Object.keys(json.failed ?? {});
      setRefreshMsg(
        `Nowe wpisy — ${parts.join(" · ")}` + (failed.length ? ` · problemy: ${failed.join(", ")}` : ""),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie odswiezyc danych.");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ranking atrakcyjności</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Złożony wskaźnik 0-100 (50 = mediana rynku) liczony ze wszystkich zebranych sygnałów.
            Każdy sygnał jest standaryzowany <strong>względem grupy porównawczej</strong> (odporny
            z-score na medianie/MAD, winsoryzacja), agregowany wagowo i mapowany przez dystrybuantę
            normalną. Chip pokazuje odchylenie w <strong>σ</strong> od mediany (▲ powyżej, ▼ poniżej).
            Bez AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            disabled={refreshing || loading}
            title="Pobiera wszystkie źródła dla całej watchlisty naraz (tylko nowe wpisy)"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Pobieram dane…" : "Odśwież dane"}
          </button>
          <button
            onClick={load}
            disabled={loading || refreshing}
            title="Przelicza ranking na już zebranych danych (bez pobierania)"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Liczę…" : "Przelicz"}
          </button>
        </div>
      </div>

      {refreshing && (
        <div className="rounded-md border border-blue-900/50 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
          Pobieram nowe dane ze wszystkich źródeł (rekomendacje, raporty, shorty, pakiety, dywidendy,
          insiderzy, makro) dla całej watchlisty — to może potrwać kilkadziesiąt sekund…
        </div>
      )}

      {refreshMsg && !refreshing && (
        <div className="rounded-md border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-300">
          {refreshMsg}
        </div>
      )}

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
          Brak spółek albo danych. Dodaj spółki do watchlisty, a potem kliknij <strong>„Odśwież
          dane"</strong> powyżej — jednym kliknięciem pobierze wszystkie źródła dla całej watchlisty
          (kolejne odświeżenia dociągają tylko nowe wpisy).
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
        Metodyka (wskaźnik złożony wg podejścia OECD/JRC — bez modelu nadzorowanego, bo brak
        etykiet/outcome): odporny z-score przekrojowy (mediana + MAD, winsoryzacja ±2,5σ) →
        ważona średnia (rekomendacje 18%, potencjał 16%, prognoza wzrostu 12%, insiderzy 14%,
        krótkie pozycje 13%, wyniki r/r 10%, znaczne pakiety 7%, koniunktura 6%, dywidenda 4%) →
        redukcja wg pokrycia danymi →
        mapowanie przez dystrybuantę normalną. Rekomendacje mają tłumienie małej próby. Składowa
        „koniunktura" różnicuje dopiero spółki różnych rynków (PL vs US). Narzędzie informacyjne,
        nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
