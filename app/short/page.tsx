"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShortPosition } from "@/lib/types";

interface View {
  positions: ShortPosition[];
  usingDb: boolean;
}

interface RefreshSummary {
  inserted: number;
  fetched: number;
  matched: number;
  errors: string[];
}

const DAY = 86_400_000;
function daysAgo(date: string | null): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / DAY) : null;
}

interface CompanyShorts {
  key: string;
  company: string;
  current: ShortPosition[]; // najnowszy wpis per posiadacz
  total: number; // suma % biezacych pozycji
  lastDate: string | null;
}

/** Grupuje po spolce i redukuje do biezacej pozycji per posiadacz (najnowszy wpis). */
function groupCurrent(positions: ShortPosition[]): CompanyShorts[] {
  const byCompany = new Map<string, ShortPosition[]>();
  for (const p of positions) {
    const key = p.watchTicker ?? p.issuerName;
    (byCompany.get(key) ?? byCompany.set(key, []).get(key)!).push(p);
  }
  const out: CompanyShorts[] = [];
  for (const [key, rows] of byCompany) {
    const latestByHolder = new Map<string, ShortPosition>();
    for (const r of rows) {
      const prev = latestByHolder.get(r.holder);
      if (!prev || (r.positionDate ?? "") > (prev.positionDate ?? "")) latestByHolder.set(r.holder, r);
    }
    const current = [...latestByHolder.values()].sort((a, b) => (b.netShortPct ?? 0) - (a.netShortPct ?? 0));
    const total = current.reduce((s, r) => s + (r.netShortPct ?? 0), 0);
    const lastDate = current.reduce<string | null>(
      (mx, r) => ((r.positionDate ?? "") > (mx ?? "") ? r.positionDate : mx),
      null,
    );
    out.push({ key, company: rows[0].company ?? rows[0].issuerName, current, total, lastDate });
  }
  return out.sort((a, b) => b.total - a.total);
}

function CompanyCard({ c }: { c: CompanyShorts }) {
  const stale = (daysAgo(c.lastDate) ?? 999) > 45;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          {c.company} <span className="text-neutral-500">({c.key})</span>
        </h2>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          łączna krótka pozycja
          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold tabular-nums text-rose-700">
            {c.total.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
          </span>
          {stale && <span className="text-neutral-500">(ost. {c.lastDate})</span>}
        </span>
      </div>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {c.current.map((p, i) => {
          const d = daysAgo(p.positionDate);
          const active = d !== null && d <= 30;
          return (
            <li key={`${p.holder}:${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span
                className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${
                  (p.netShortPct ?? 0) >= 1 ? "text-rose-600" : "text-red-300/80"
                }`}
              >
                {p.netShortPct !== null ? `${p.netShortPct.toLocaleString("pl-PL")}%` : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{p.holder}</span>
              {active && (
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  aktywna
                </span>
              )}
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-neutral-500">
                {p.positionDate ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ShortPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RefreshSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/short", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac pozycji.");
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
      const res = await fetch("/api/short/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSummary(json);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie odświeżyc.");
    } finally {
      setRefreshing(false);
    }
  }

  const groups = useMemo(() => groupCurrent(view?.positions ?? []), [view]);

  return (
    <main className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Krótkie pozycje (KNF)</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Kto gra na spadek Twoich spółek — z rejestru krótkiej sprzedaży KNF (pozycje netto
            ≥0,5%). Dane publiczne, bez AI. „Łączna" sumuje bieżące pozycje funduszy;
            „aktywna" = zgłoszenie z ostatnich 30 dni.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="btn btn-primary"
        >
          {refreshing ? "Odświeżam…" : "Odśwież"}
        </button>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Baza nie jest skonfigurowana — wymaga Vercel Postgres. Ustaw <code>POSTGRES_URL</code> i
          uruchom <code>/api/init-db</code>.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          Błąd: {error}
        </div>
      )}

      {summary && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
          <p className="text-neutral-800">
            Z rejestru KNF: dopasowano {summary.matched} wpisów, nowych{" "}
            <span className="font-semibold text-up">{summary.inserted}</span>.
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-neutral-500">
              {summary.errors.slice(0, 6).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && !view && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      {view && groups.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">
          Brak zapisanych pozycji. Kliknij „Odśwież", aby pobrać rejestr KNF dla spółek PL z
          watchlisty (uwzględniane są spółki z ustawionym „Symbolem bankier").
        </p>
      )}

      {groups.map((c) => (
        <CompanyCard key={c.key} c={c} />
      ))}

      <p className="text-[10px] text-neutral-500">
        Źródło: rejestr krótkiej sprzedaży KNF (rss.knf.gov.pl). Narzędzie informacyjne, nie
        doradztwo inwestycyjne. Pozycja może być już zamknięta, jeśli data zgłoszenia jest odległa.
      </p>
    </main>
  );
}
