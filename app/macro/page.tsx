"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketMacro } from "@/lib/types";

interface View {
  pl: MarketMacro | null;
  us: MarketMacro | null;
  usingDb: boolean;
}

function scoreColor(score: number): string {
  if (score >= 60) return "text-emerald-400";
  if (score <= 40) return "text-red-400";
  return "text-neutral-300";
}

function MarketCard({ m, flag, title }: { m: MarketMacro | null; flag: string; title: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
          {flag} {title}
        </h2>
        {m && (
          <span className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold tabular-nums ${scoreColor(m.score)}`}>{m.score}</span>
            <span className="text-xs text-neutral-600">/100 klimat</span>
          </span>
        )}
      </div>

      {!m ? (
        <p className="text-sm text-neutral-500">Brak danych — kliknij „Odswiez".</p>
      ) : (
        <>
          <div className="space-y-2">
            {m.indicators.map((i) => (
              <div key={i.key} className="flex items-center justify-between border-b border-neutral-900 py-1 text-sm last:border-0">
                <span className="text-neutral-400">
                  {i.label} {i.year && <span className="text-neutral-600">({i.year})</span>}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-neutral-100">{i.value !== null ? `${i.value.toFixed(1)}${i.unit}` : "—"}</span>
                  {i.value !== null && i.prevValue !== null && (
                    <span className={`text-xs ${i.value < i.prevValue ? "text-emerald-400" : i.value > i.prevValue ? "text-red-400" : "text-neutral-500"}`}>
                      {i.value < i.prevValue ? "↓" : i.value > i.prevValue ? "↑" : "="} {i.prevValue.toFixed(1)}{i.unit}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {m.fx?.usdPln && (
            <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-300">
              Kursy NBP{m.fx.date ? ` (${m.fx.date})` : ""}: USD/PLN{" "}
              <span className="font-semibold text-neutral-100">{m.fx.usdPln.toFixed(4)}</span>
              {m.fx.eurPln && (
                <>
                  {" · "}EUR/PLN <span className="font-semibold text-neutral-100">{m.fx.eurPln.toFixed(4)}</span>
                </>
              )}
            </div>
          )}
          {m.updatedAt && <p className="text-[10px] text-neutral-600">Zaktualizowano: {m.updatedAt.replace("T", " ")}</p>}
        </>
      )}
    </section>
  );
}

export default function MacroPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/macro", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie pobrac makro.");
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
    try {
      const res = await fetch("/api/macro", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie odswiezyc.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Koniunktura makro</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Klimat makroekonomiczny Polski i USA — inflacja, wzrost PKB, bezrobocie (World Bank,
            ostatnie dostępne roczne) + kursy NBP. „Klimat" 0-100 wchodzi też jako czynnik do
            rankingu atrakcyjności (wspólny dla spółek danego rynku). Bez AI.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Odswiezam…" : "Odswiez"}
        </button>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Wymaga bazy (Vercel Postgres). Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          Błąd: {error}
        </div>
      )}

      {loading && !view && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <MarketCard m={view?.pl ?? null} flag="🇵🇱" title="Polska" />
        <MarketCard m={view?.us ?? null} flag="🇺🇸" title="USA" />
      </div>

      <p className="text-[10px] text-neutral-600">
        Źródła: World Bank (wskaźniki roczne, ostatnie dostępne) + NBP (kursy dzienne). To kluczowe
        odczyty makro, nie live feed wydarzeń. Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
