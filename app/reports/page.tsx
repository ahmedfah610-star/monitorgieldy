"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Report } from "@/lib/types";

interface View {
  reports: Report[];
  usingDb: boolean;
}

interface RefreshSummary {
  inserted: number;
  fetched: number;
  sources: Record<string, number>;
  errors: string[];
}

const TYPE_LABEL: Record<string, string> = {
  kwartalny: "Kwartalny",
  polroczny: "Półroczny",
  roczny: "Roczny",
  inny: "Inny",
};

function typeClass(t: string): string {
  if (t === "roczny") return "bg-blue-950 text-blue-300 border-blue-800";
  if (t === "polroczny") return "bg-purple-950 text-purple-300 border-purple-800";
  if (t === "kwartalny") return "bg-emerald-950 text-emerald-300 border-emerald-800";
  return "bg-neutral-800 text-neutral-300 border-neutral-700";
}

export default function ReportsPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RefreshSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setView(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie pobrac raportow.");
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
      const res = await fetch("/api/reports/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSummary(json);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie odswiezyc raportow.");
    } finally {
      setRefreshing(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of view?.reports ?? []) {
      const key = r.watchTicker ?? r.company ?? "?";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [view]);

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Raporty okresowe</h1>
          <p className="text-xs text-neutral-500">
            Komunikaty ESPI/EBI (kwartalne / półroczne / roczne) dla spółek PL z watchlisty.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Odswiezam…" : "Odswiez raporty"}
        </button>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Baza nie jest skonfigurowana — raporty wymagają Vercel Postgres (do zapisu i
          wykrywania nowych). Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>.
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
            Odswiezono: znaleziono {summary.fetched}, nowych{" "}
            <span className="font-semibold text-up">{summary.inserted}</span>.
          </p>
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

      {view && grouped.length === 0 && (
        <p className="text-sm text-neutral-500">
          Brak zapisanych raportów. Kliknij „Odswiez raporty", aby pobrać komunikaty.
        </p>
      )}

      {grouped.map(([key, reports]) => (
        <section key={key} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {reports[0]?.company ?? key}{" "}
            <span className="text-neutral-600">({key})</span>
          </h2>
          <ul className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
            {reports.map((r, i) => (
              <li key={`${r.url}:${i}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span
                  className={`rounded border px-2 py-0.5 text-xs font-medium ${typeClass(r.reportType)}`}
                >
                  {TYPE_LABEL[r.reportType] ?? r.reportType}
                </span>
                <span className="text-xs text-neutral-500">{r.period}</span>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-neutral-200 hover:text-blue-400 hover:underline"
                >
                  {r.title}
                </a>
                <span className="text-xs text-neutral-500">
                  {r.publishedAt?.replace("T", " ") ?? "—"}
                </span>
                <span className="text-[10px] uppercase text-neutral-600">{r.source}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
