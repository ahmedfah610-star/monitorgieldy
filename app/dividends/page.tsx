"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dividend } from "@/lib/types";

interface View {
  dividends: Dividend[];
  usingDb: boolean;
}

interface RefreshSummary {
  inserted: number;
  matched: number;
  errors: string[];
}

const TODAY = new Date().toISOString().slice(0, 10);

function fmtAmount(v: number | null, cur: string | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur ?? ""}`.trim();
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  const cls = /uchwal|wypłac|wyplac/.test(s)
    ? "border-emerald-800 bg-emerald-950 text-emerald-300"
    : /propon|projekt|rekomend/.test(s)
      ? "border-amber-900 bg-amber-950/60 text-amber-300"
      : "border-neutral-700 bg-neutral-800 text-neutral-300";
  return <span className={`rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{status ?? "—"}</span>;
}

function Row({ d }: { d: Dividend }) {
  const upcoming = d.recordDate !== null && d.recordDate >= TODAY;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
      <span className={`w-14 shrink-0 text-sm font-semibold tabular-nums ${upcoming ? "text-up" : "text-neutral-200"}`}>
        {d.year ?? "—"}
      </span>
      <span className="w-28 shrink-0 text-sm font-semibold tabular-nums text-neutral-100">
        {fmtAmount(d.amount, d.currency)}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-neutral-400">
        {d.yieldPct !== null ? `${d.yieldPct.toLocaleString("pl-PL")}%` : ""}
      </span>
      <span className="min-w-0 flex-1 text-xs text-neutral-500">
        {d.dividendType && <span className="text-neutral-400">{d.dividendType}</span>}
      </span>
      <span className="w-40 shrink-0 text-xs tabular-nums text-neutral-400">
        prawo: <span className="text-neutral-200">{d.recordDate ?? "—"}</span>
      </span>
      <span className="w-40 shrink-0 text-xs tabular-nums text-neutral-400">
        wypłata: <span className="text-neutral-200">{d.paymentDate ?? "—"}</span>
      </span>
      <StatusBadge status={d.status} />
    </li>
  );
}

interface CompanyDivs {
  key: string;
  company: string;
  upcoming: Dividend[];
  past: Dividend[];
}

function group(divs: Dividend[]): CompanyDivs[] {
  const byCompany = new Map<string, Dividend[]>();
  for (const d of divs) {
    const key = d.watchTicker ?? d.slug;
    (byCompany.get(key) ?? byCompany.set(key, []).get(key)!).push(d);
  }
  const out: CompanyDivs[] = [];
  for (const [key, rows] of byCompany) {
    const upcoming = rows.filter((d) => d.recordDate !== null && d.recordDate >= TODAY);
    const past = rows.filter((d) => !(d.recordDate !== null && d.recordDate >= TODAY));
    out.push({ key, company: rows[0].company ?? rows[0].slug, upcoming, past });
  }
  // Spolki z nadchodzaca dywidenda na gorze.
  return out.sort((a, b) => (b.upcoming.length ? 1 : 0) - (a.upcoming.length ? 1 : 0));
}

export default function DividendsPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RefreshSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dividends", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac dywidend.");
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
      const res = await fetch("/api/dividends/refresh", { method: "POST" });
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

  const groups = useMemo(() => group(view?.dividends ?? []), [view]);

  return (
    <main className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">Dywidendy</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Dywidendy spółek z watchlisty — zapowiedziane i historyczne, z dniem ustalenia prawa
            („prawo") i dniem wypłaty. Status „proponowana/projekt" = jeszcze niepewna,
            „uchwalona" = zatwierdzona. Dane z kalendarza bankier.pl, bez AI.
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
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Baza nie jest skonfigurowana — wymaga Vercel Postgres. Ustaw <code>POSTGRES_URL</code> i
          uruchom <code>/api/init-db</code>.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          Błąd: {error}
        </div>
      )}

      {summary && (
        <div className="rounded-md border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm">
          <p className="text-neutral-200">
            Z kalendarza: dopasowano {summary.matched}, nowych{" "}
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
          Brak zapisanych dywidend. Kliknij „Odśwież", aby pobrać kalendarz dla spółek PL z
          watchlisty (uwzględniane są spółki z ustawionym „Symbolem bankier").
        </p>
      )}

      {groups.map((c) => (
        <section key={c.key} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
            {c.company} <span className="text-neutral-600">({c.key})</span>
          </h2>
          {c.upcoming.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-400">Nadchodzące</p>
              <ul className="divide-y divide-neutral-900 rounded-lg border border-emerald-900/50">
                {c.upcoming.map((d, i) => (
                  <Row key={`u${i}`} d={d} />
                ))}
              </ul>
            </div>
          )}
          {c.past.length > 0 && (
            <ul className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
              {c.past.map((d, i) => (
                <Row key={`p${i}`} d={d} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="text-[10px] text-neutral-600">
        Źródło: kalendarz dywidend bankier.pl. Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
