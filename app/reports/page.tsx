"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Report, ExtractedFinancials, Conclusion } from "@/lib/types";

interface View {
  reports: Report[];
  conclusions: Record<string, Conclusion>;
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

function fmtNum(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pl-PL");
}

function deltaPct(cur: number | null, prior: number | null): number | null {
  if (cur === null || prior === null || prior === 0) return null;
  return ((cur - prior) / Math.abs(prior)) * 100;
}

function Metric({ label, cur, prior }: { label: string; cur: number | null; prior: number | null }) {
  if (cur === null && prior === null) return null;
  const d = deltaPct(cur, prior);
  const dColor = d === null ? "text-neutral-500" : d > 0 ? "text-up" : d < 0 ? "text-down" : "text-neutral-300";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-neutral-900 py-1.5 last:border-0">
      <span className="text-sm text-neutral-300">{label}</span>
      <span className="flex items-baseline gap-3 tabular-nums">
        <span className="text-sm text-neutral-100">{fmtNum(cur)}</span>
        <span className="text-xs text-neutral-500">poprz. {fmtNum(prior)}</span>
        <span className={`w-16 text-right text-xs ${dColor}`}>
          {d === null ? "" : `${d > 0 ? "+" : ""}${d.toFixed(1)}%`}
        </span>
      </span>
    </div>
  );
}

function FinancialsPanel({ f }: { f: ExtractedFinancials }) {
  return (
    <div className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
      <p className="mb-2 text-xs text-neutral-500">
        {f.period}
        {f.comparativePeriod ? ` vs ${f.comparativePeriod}` : ""} · w {f.unit} {f.currency}
      </p>
      <div>
        <Metric label="Przychody" cur={f.revenue} prior={f.revenuePrior} />
        <Metric label="Zysk operacyjny (EBIT)" cur={f.operatingProfit} prior={f.operatingProfitPrior} />
        <Metric label="Zysk brutto" cur={f.grossProfit} prior={f.grossProfitPrior} />
        <Metric label="Zysk netto" cur={f.netProfit} prior={f.netProfitPrior} />
        {f.ebitda !== null && <Metric label="EBITDA" cur={f.ebitda} prior={null} />}
        <Metric label="Zysk na akcję" cur={f.eps} prior={f.epsPrior} />
      </div>
      {f.summary && <p className="mt-2 text-sm text-neutral-300">{f.summary}</p>}
      <p className="mt-2 text-[10px] text-neutral-600">
        Analiza AI — narzędzie informacyjne, nie doradztwo inwestycyjne. Zweryfikuj z raportem źródłowym.
      </p>
    </div>
  );
}

function CompanyConclusion({
  ticker,
  extractedCount,
  initial,
}: {
  ticker: string;
  extractedCount: number;
  initial?: Conclusion;
}) {
  const [conclusion, setConclusion] = useState<Conclusion | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canGenerate = extractedCount >= 2;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setConclusion({ text: json.text, period: json.period, createdAt: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie wygenerowac wnioskow.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-indigo-900/60 bg-indigo-950/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
          Wnioski AI (trendy)
        </span>
        <button
          onClick={generate}
          disabled={busy || !canGenerate}
          title={canGenerate ? "" : "Wymaga min. 2 przeanalizowanych raportów"}
          className="rounded-md border border-indigo-700 px-2.5 py-1 text-xs text-indigo-200 transition hover:border-indigo-500 hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Generuję…" : conclusion ? "Generuj ponownie" : "Generuj wnioski"}
        </button>
      </div>
      {!canGenerate && !conclusion && (
        <p className="mt-1 text-xs text-neutral-500">
          Kliknij „Analizuj" przy min. 2 raportach, aby porównać okresy.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {conclusion && (
        <>
          <p className="mt-2 text-sm text-neutral-200">{conclusion.text}</p>
          <p className="mt-1 text-[10px] text-neutral-600">
            AI na podstawie zapisanych raportów — nie doradztwo inwestycyjne.
          </p>
        </>
      )}
    </div>
  );
}

function ReportRow({ r }: { r: Report }) {
  const [extracted, setExtracted] = useState<ExtractedFinancials | null>(r.extractedJson ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: r.url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setExtracted(json.extracted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie przeanalizowac raportu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${typeClass(r.reportType)}`}>
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
        <span className="text-xs text-neutral-500">{r.publishedAt?.replace("T", " ") ?? "—"}</span>
        <button
          onClick={analyze}
          disabled={busy}
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 transition hover:border-blue-600 hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Analizuję…" : extracted ? "Analizuj ponownie" : "Analizuj"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {extracted && <FinancialsPanel f={extracted} />}
    </li>
  );
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
            Komunikaty ESPI/EBI dla spółek PL z watchlisty. „Analizuj" wyciąga kluczowe liczby przez AI.
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
          Baza nie jest skonfigurowana — raporty wymagają Vercel Postgres (do zapisu i wykrywania nowych).
          Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>.
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
            {reports[0]?.company ?? key} <span className="text-neutral-600">({key})</span>
          </h2>
          <CompanyConclusion
            ticker={key}
            extractedCount={reports.filter((r) => r.extractedJson).length}
            initial={view?.conclusions?.[key]}
          />
          <ul className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
            {reports.map((r, i) => (
              <ReportRow key={`${r.url}:${i}`} r={r} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
