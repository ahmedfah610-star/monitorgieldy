"use client";

import { useCallback, useEffect, useState } from "react";
import type { InsiderTransaction } from "@/lib/types";

interface View {
  transactions: InsiderTransaction[];
  usingDb: boolean;
}

interface RefreshSummary {
  inserted: number;
  processed: number;
  skipped: number;
  pending: number;
  errors: string[];
}

function fmtInt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pl-PL");
}

function fmtValue(v: number | null, currency: string | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const cur = currency ?? "PLN";
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pl-PL", { maximumFractionDigits: 2 })} mln ${cur}`;
  if (abs >= 10_000) return `${(v / 1_000).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} tys. ${cur}`;
  return `${v.toLocaleString("pl-PL")} ${cur}`;
}

function DirBadge({ type }: { type: InsiderTransaction["txType"] }) {
  if (type === "nabycie")
    return <span className="rounded border border-emerald-800 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Kupno</span>;
  if (type === "zbycie")
    return <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Sprzedaż</span>;
  return <span className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">Transakcja</span>;
}

function Row({ t }: { t: InsiderTransaction }) {
  const date = t.txDate ?? t.publishedAt?.slice(0, 10) ?? "—";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
      <span className="w-24 shrink-0 text-xs tabular-nums text-neutral-500">{date}</span>
      <DirBadge type={t.txType} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-900">
          {t.person ?? "Osoba zarządzająca"}
          {t.role && <span className="text-neutral-500"> · {t.role}</span>}
        </p>
        <p className="truncate text-xs text-neutral-500">
          {t.company ?? t.watchTicker ?? "—"}
          {t.watchTicker && <span className="text-neutral-500"> ({t.watchTicker})</span>}
          {t.volume !== null && (
            <span className="text-neutral-500">
              {" · "}
              {fmtInt(t.volume)} {t.instrument ?? "szt."}
              {t.price !== null && ` × ${t.price.toLocaleString("pl-PL")} ${t.currency ?? ""}`}
            </span>
          )}
        </p>
      </div>
      <span
        className={`w-32 shrink-0 text-right text-sm font-semibold tabular-nums ${
          t.txType === "nabycie" ? "text-up" : t.txType === "zbycie" ? "text-down" : "text-neutral-700"
        }`}
      >
        {t.value !== null ? fmtValue(t.value, t.currency) : ""}
      </span>
      <a
        href={t.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-xs text-neutral-500 hover:text-blue-400 hover:underline"
      >
        {t.value !== null ? "źródło →" : "szczegóły w PDF →"}
      </a>
    </li>
  );
}

export default function InsiderPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RefreshSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insider", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac transakcji.");
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
      const res = await fetch("/api/insider/refresh", { method: "POST" });
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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Transakcje insiderów</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Powiadomienia art. 19 MAR dla spółek PL z watchlisty — kto z zarządu (lub osób
            powiązanych) kupuje/sprzedaje akcje i za ile. Kwoty czytane z formularza ESMA (PDF),
            bez AI. „Odśwież" wyszukuje tylko nowe zgłoszenia.
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
            Przetworzono {summary.processed} nowych zgłoszeń, dodano{" "}
            <span className="font-semibold text-up">{summary.inserted}</span> transakcji.
            {summary.pending > 0 && (
              <span className="text-neutral-600">
                {" "}
                Pozostało {summary.pending} — odśwież ponownie, aby doczytać.
              </span>
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

      {view && view.transactions.length === 0 && !loading && (
        <p className="text-sm text-neutral-500">
          Brak zapisanych transakcji. Kliknij „Odśwież", aby wyszukać powiadomienia art. 19 MAR
          dla spółek PL z watchlisty.
        </p>
      )}

      {view && view.transactions.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {view.transactions.map((t, i) => (
            <Row key={`${t.url}:${i}`} t={t} />
          ))}
        </ul>
      )}

      <p className="text-[10px] text-neutral-500">
        Dane z komunikatów ESPI (bankier.pl) — narzędzie informacyjne, nie doradztwo inwestycyjne.
        Kierunek i kwoty warto zweryfikować w oryginalnym komunikacie.
      </p>
    </main>
  );
}
