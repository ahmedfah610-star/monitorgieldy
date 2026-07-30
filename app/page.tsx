"use client";

import { useCallback, useEffect, useState } from "react";
import { QuotesTable } from "@/components/QuotesTable";
import type { Quote } from "@/lib/types";

interface QuotesPayload {
  indices: Quote[];
  pl: Quote[];
  us: Quote[];
  usingFallbackWatchlist: boolean;
  fetchedAt: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<QuotesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie pobrac danych.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rynek dzisiaj</h1>
          {data && (
            <p className="text-xs text-neutral-500">
              Odswiezono: {new Date(data.fetchedAt).toLocaleString("pl-PL")}
              {" · dane z Yahoo Finance"}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Odswiezam…" : "Odswiez teraz"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          Blad: {error}
        </div>
      )}

      {data?.usingFallbackWatchlist && (
        <div className="rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Baza nie jest jeszcze skonfigurowana — pokazuje domyslna watchliste.
          Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>, aby
          zapisywac wlasne pozycje.
        </div>
      )}

      {!data && !error && (
        <p className="text-sm text-neutral-500">Ladowanie danych…</p>
      )}

      {data && (
        <>
          <Section title="Indeksy">
            <QuotesTable quotes={data.indices} />
          </Section>
          <Section title="Rynek PL (GPW)">
            <QuotesTable quotes={data.pl} />
          </Section>
          <Section title="Rynek USA">
            <QuotesTable quotes={data.us} />
          </Section>
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-200">{title}</h2>
      {children}
    </section>
  );
}
