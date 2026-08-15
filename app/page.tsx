"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QuotesTable } from "@/components/QuotesTable";
import { RecommendationsTable } from "@/components/RecommendationsTable";
import type { Quote, Recommendation, Report, Conclusion } from "@/lib/types";

interface QuotesPayload {
  indices: Quote[];
  pl: Quote[];
  us: Quote[];
  usingFallbackWatchlist: boolean;
  fetchedAt: string;
}
interface RecsPayload {
  watchlist: Recommendation[];
  market: Recommendation[];
  usingDb: boolean;
}
interface ReportsPayload {
  reports: Report[];
  conclusions: Record<string, Conclusion>;
  usingDb: boolean;
}

const REPORT_DOT: Record<string, string> = {
  roczny: "bg-blue-400",
  polroczny: "bg-purple-400",
  kwartalny: "bg-emerald-400",
  inny: "bg-neutral-400",
};

export default function DashboardPage() {
  const [quotes, setQuotes] = useState<QuotesPayload | null>(null);
  const [recs, setRecs] = useState<RecsPayload | null>(null);
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [q, r, rep] = await Promise.allSettled([
      fetch("/api/quotes", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/recommendations", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/reports", { cache: "no-store" }).then((res) => res.json()),
    ]);
    if (q.status === "fulfilled" && !q.value.error) setQuotes(q.value);
    else setError("Nie udalo sie pobrac notowan.");
    if (r.status === "fulfilled" && !r.value.error) setRecs(r.value);
    if (rep.status === "fulfilled" && !rep.value.error) setReports(rep.value);
    setFetchedAt(new Date().toISOString());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const latestRecs = (recs?.watchlist?.length ? recs.watchlist : recs?.market ?? []).slice(0, 6);
  const latestReports = (reports?.reports ?? []).slice(0, 6);
  const conclusions = Object.entries(reports?.conclusions ?? {});
  const dbEmpty = (recs && !recs.usingDb) || (reports && !reports.usingDb);

  return (
    <main className="space-y-8">
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Pulpit rynkowy</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-50">Rynek dzisiaj</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Indeksy, notowania GPW i USA, najnowsze rekomendacje i raporty — w jednym miejscu.
            </p>
            {fetchedAt && (
              <p className="mt-2 text-xs text-neutral-500">
                Odświeżono {new Date(fetchedAt).toLocaleString("pl-PL")} · źródło: Yahoo Finance
              </p>
            )}
          </div>
          <button onClick={load} disabled={loading} className="btn btn-primary">
            {loading ? "Odświeżam…" : "↻ Odśwież wszystko"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {dbEmpty && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Baza nie jest skonfigurowana — sekcje rekomendacji i raportów są puste. Ustaw{" "}
          <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>.
        </div>
      )}

      {!quotes && !error && <p className="text-sm text-neutral-500">Ladowanie…</p>}

      {/* --- Notowania --- */}
      {quotes && (
        <>
          <Section title="Indeksy">
            <QuotesTable quotes={quotes.indices} />
          </Section>
          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Rynek PL (GPW)">
              <QuotesTable quotes={quotes.pl} />
            </Section>
            <Section title="Rynek USA">
              <QuotesTable quotes={quotes.us} />
            </Section>
          </div>
        </>
      )}

      {/* --- Rekomendacje --- */}
      <Section title="Najnowsze rekomendacje" href="/recommendations" hrefLabel="Wszystkie →">
        {latestRecs.length > 0 ? (
          <RecommendationsTable recs={latestRecs} showCompany />
        ) : (
          <p className="text-sm text-neutral-500">
            Brak. Wejdź na <Link href="/recommendations" className="text-blue-400 hover:underline">Rekomendacje</Link> i odśwież.
          </p>
        )}
      </Section>

      {/* --- Raporty + wnioski AI --- */}
      <Section title="Najnowsze raporty okresowe" href="/reports" hrefLabel="Wszystkie →">
        {latestReports.length > 0 ? (
          <ul className="card divide-y divide-white/[0.05]">
            {latestReports.map((r, i) => (
              <li key={`${r.url}:${i}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${REPORT_DOT[r.reportType] ?? "bg-neutral-400"}`} />
                <span className="font-mono text-xs text-neutral-500">{r.watchTicker}</span>
                <span className="text-xs text-neutral-500">{r.period}</span>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-sm text-neutral-200 hover:text-blue-400 hover:underline"
                >
                  {r.title}
                </a>
                <span className="text-xs text-neutral-500">
                  {r.publishedAt?.slice(0, 10) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">
            Brak. Wejdź na <Link href="/reports" className="text-blue-400 hover:underline">Raporty</Link> i odśwież.
          </p>
        )}

        {conclusions.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-indigo-300">Wnioski AI</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {conclusions.map(([ticker, c]) => (
                <div key={ticker} className="rounded-md border border-indigo-900/60 bg-indigo-950/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                    {ticker} <span className="text-neutral-600">{c.period}</span>
                  </p>
                  <p className="mt-1 text-sm text-neutral-200">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <p className="border-t border-neutral-900 pt-4 text-xs text-neutral-600">
        Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}

function Section({
  title,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-neutral-300">
          <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-blue-500 to-indigo-500" />
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-xs font-medium text-neutral-400 transition hover:text-blue-400">
            {hrefLabel ?? "Więcej →"}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
