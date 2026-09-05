"use client";

import { useCallback, useEffect, useState } from "react";
import type { HoldingNotification } from "@/lib/types";

interface View {
  notifications: HoldingNotification[];
  usingDb: boolean;
}

interface RefreshSummary {
  inserted: number;
  processed: number;
  skipped: number;
  pending: number;
  errors: string[];
}

function DirBadge({ d }: { d: HoldingNotification["direction"] }) {
  if (d === "increase")
    return <span className="rounded border border-emerald-800 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Wejście / zwiększenie</span>;
  if (d === "decrease")
    return <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Wyjście / zmniejszenie</span>;
  return <span className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">Zmiana</span>;
}

function Row({ n }: { n: HoldingNotification }) {
  const date = n.publishedAt?.slice(0, 10) ?? "—";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
      <span className="w-24 shrink-0 text-xs tabular-nums text-neutral-500">{date}</span>
      <DirBadge d={n.direction} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-900">
          {n.holder ?? <span className="text-neutral-600">podmiot w treści</span>}
          {n.pctAfter !== null && (
            <span className="text-neutral-600"> · po: {n.pctAfter.toLocaleString("pl-PL")}% głosów</span>
          )}
        </p>
        <p className="truncate text-xs text-neutral-500">
          {n.company ?? n.watchTicker ?? "—"}
          {n.watchTicker && <span className="text-neutral-500"> ({n.watchTicker})</span>}
          {n.thresholds.length > 0 && (
            <span className="text-neutral-500"> · progi: {n.thresholds.map((t) => `${t}%`).join(", ")}</span>
          )}
        </p>
      </div>
      <a
        href={n.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-xs text-neutral-500 hover:text-blue-400 hover:underline"
      >
        źródło →
      </a>
    </li>
  );
}

export default function HoldingsPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RefreshSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/holdings", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac zawiadomień.");
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
      const res = await fetch("/api/holdings/refresh", { method: "POST" });
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

  return (
    <main className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Znaczne pakiety (art. 69)</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Wejścia i wyjścia dużych akcjonariuszy Twoich spółek — zawiadomienia o przekroczeniu
            progów 5/10/…% (art. 69 ustawy o ofercie). Kierunek i progi z tytułu komunikatu;
            podmiot i udział po transakcji odczytywane best-effort z treści. Bez AI.
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
            Przetworzono {summary.processed} nowych zawiadomień, dodano{" "}
            <span className="font-semibold text-up">{summary.inserted}</span>.
            {summary.pending > 0 && (
              <span className="text-neutral-600"> Pozostało {summary.pending} — odśwież ponownie.</span>
            )}
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

      {view && view.notifications.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">
          Brak zapisanych zawiadomień. Kliknij „Odśwież", aby wyszukać komunikaty art. 69 dla
          spółek PL z watchlisty.
        </p>
      )}

      {view && view.notifications.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {view.notifications.map((n, i) => (
            <Row key={`${n.url}:${i}`} n={n} />
          ))}
        </ul>
      )}

      <p className="text-[10px] text-neutral-500">
        Dane z komunikatów ESPI (bankier.pl) — narzędzie informacyjne, nie doradztwo inwestycyjne.
        Dokładne wartości warto zweryfikować w oryginalnym zawiadomieniu.
      </p>
    </main>
  );
}
