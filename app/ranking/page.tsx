"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { RankingEntry, RankingComponent } from "@/lib/types";

interface View {
  ranking: RankingEntry[];
  usingDb: boolean;
}

function scoreColor(score: number): string {
  if (score >= 65) return "text-emerald-600";
  if (score >= 55) return "text-emerald-700";
  if (score <= 35) return "text-rose-600";
  if (score <= 45) return "text-rose-700";
  return "text-neutral-700";
}

/** Okrągły wskaźnik wyniku 0-100 (jak gauge na platformie tradingowej). */
function ScoreGauge({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const stroke =
    score >= 55 ? "rgb(16 185 129)" : score <= 45 ? "rgb(244 63 94)" : "rgb(148 163 184)";
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 52 52" className="h-14 w-14 -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(15,23,42,0.09)" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={r} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <span className={`absolute text-base font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

function Chip({ c }: { c: RankingComponent }) {
  if (c.score === null)
    return (
      <span
        title={`${c.label}: brak danych`}
        className="inline-flex items-center rounded-md border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-500"
      >
        {c.label} —
      </span>
    );
  const pos = c.score > 0.05;
  const neg = c.score < -0.05;
  const cls = pos ? "badge-pos" : neg ? "badge-neg" : "badge-neutral";
  const sign = pos ? "▲" : neg ? "▼" : "–";
  return (
    <span title={`${c.label}: ${c.detail} (waga ${Math.round(c.weight * 100)}%)`} className={`badge ${cls}`}>
      <span className="opacity-70">{sign}</span> {c.label}:{" "}
      <span className="font-normal opacity-90">{c.detail}</span>
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: number }) {
  const color = accent != null ? scoreColor(accent) : "text-neutral-900";
  return (
    <div className="min-w-[120px] flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Bar({ score }: { score: number }) {
  const grad =
    score >= 55
      ? "from-emerald-500 to-emerald-400"
      : score <= 45
        ? "from-rose-500 to-rose-400"
        : "from-neutral-500 to-neutral-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${grad}`}
        style={{ width: `${score}%`, transition: "width .6s ease" }}
      />
    </div>
  );
}

// Kazde zrodlo odświeżamy OSOBNYM requestem — na Vercel Hobby (60s/funkcja)
// wolne insider/pakiety (PDF-y) dostaja wtedy wlasny budzet czasu i sie konczą.
// `busy` to przyjazny komunikat pokazywany uzytkownikowi w trakcie danego kroku.
const STEPS: { key: string; busy: string; url: string }[] = [
  { key: "prices", busy: "Pobieram notowania i momentum", url: "/api/prices/refresh" },
  { key: "recommendations", busy: "Analizuję rekomendacje", url: "/api/recommendations/refresh" },
  { key: "reports", busy: "Analizuję raporty okresowe", url: "/api/reports/refresh" },
  { key: "short", busy: "Analizuję krótkie pozycje", url: "/api/short/refresh" },
  { key: "dividends", busy: "Sprawdzam dywidendy", url: "/api/dividends/refresh" },
  { key: "holdings", busy: "Analizuję znaczne pakiety", url: "/api/holdings/refresh" },
  { key: "insider", busy: "Śledzę transakcje insiderów", url: "/api/insider/refresh" },
  { key: "financials", busy: "Liczę wyniki r/r", url: "/api/reports/extract-pending" },
  { key: "macro", busy: "Aktualizuję koniunkturę", url: "/api/macro" },
];

export default function RankingPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [phase, setPhase] = useState<{ i: number; label: string } | null>(null);
  const [doneMsg, setDoneMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ranking", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie policzyc rankingu.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Sekwencyjnie odświeża wszystkie zrodla dla calego katalogu (tylko nowe —
  // dedup). Zrodla z limitem na przebieg (insider/pakiety/wyniki) sa ZAPETLANE
  // az wyczerpia sie nowe wpisy — jedno klikniecie laduje komplet.
  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setDoneMsg(false);
    // ile razy max ponawiac dane zrodlo w jednym klikniecu (bounduje czas).
    const MAX_LOOPS: Record<string, number> = { insider: 8, holdings: 8, financials: 10 };

    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      setPhase({ i, label: s.busy });
      let total = 0;
      let loops = 0;
      // Błędy pojedynczych źródeł pomijamy po cichu — użytkownik widzi tylko
      // przyjazny postęp, a ranking i tak przelicza się z danych, które są.
      try {
        const maxLoops = MAX_LOOPS[s.key] ?? 1;
        for (;;) {
          const res = await fetch(s.url, { method: "POST" });
          const json = await res.json().catch(() => ({}));
          loops += 1;
          if (!res.ok) break;
          if (s.key === "financials") {
            if (json.needsKey) break;
            total += json.extracted ?? 0;
            if ((json.extracted ?? 0) < 6 || loops >= maxLoops) break;
          } else if (s.key === "macro") {
            break;
          } else {
            total += json.inserted ?? 0;
            const pending = json.pending ?? 0;
            if (pending <= 0 || loops >= maxLoops) break;
          }
        }
      } catch {
        // ignorujemy — kolejne źródło leci dalej
      }
    }
    setPhase(null);
    await load();
    setRefreshing(false);
    setDoneMsg(true);
    setTimeout(() => setDoneMsg(false), 4000);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const topScore = view?.ranking?.[0]?.score;
  const avgScore = view?.ranking?.length
    ? Math.round(view.ranking.reduce((a, e) => a + e.score, 0) / view.ranking.length)
    : null;

  return (
    <main className="space-y-6">
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="eyebrow">Screener · najlepsze do kupna na dziś</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
              Ranking atrakcyjności
            </h1>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <button
              onClick={refreshData}
              disabled={refreshing || loading}
              title="Pobiera wszystkie źródła dla całego katalogu (tylko nowe wpisy)"
              className="btn btn-primary"
            >
              {refreshing ? "Pobieram dane…" : "↻ Odśwież dane"}
            </button>
            <button
              onClick={load}
              disabled={loading || refreshing}
              title="Przelicza ranking na już zebranych danych (bez pobierania)"
              className="btn btn-ghost"
            >
              {loading ? "Liczę…" : "Przelicz"}
            </button>
          </div>
        </div>
        {view?.ranking?.length ? (
          <div className="relative mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
            <Stat label="Spółek" value={String(view.ranking.length)} />
            <Stat label="Najwyższy wynik" value={topScore != null ? String(topScore) : "—"} accent={topScore} />
            <Stat label="Mediana katalogu" value={avgScore != null ? String(avgScore) : "—"} />
            <Stat label="Lider" value={view.ranking[0]?.company ?? "—"} />
          </div>
        ) : null}
      </div>

      {refreshing && phase && (
        <div className="card flex items-center gap-3 px-4 py-3.5">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-800">{phase.label}…</p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                style={{ width: `${((phase.i + 1) / STEPS.length) * 100}%`, transition: "width .5s ease" }}
              />
            </div>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-neutral-400">
            {phase.i + 1}/{STEPS.length}
          </span>
        </div>
      )}

      {doneMsg && !refreshing && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          ✓ Dane odświeżone — ranking zaktualizowany.
        </div>
      )}

      {view && !view.usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Wymaga bazy (Vercel Postgres). Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>,
          potem odśwież źródła, aby ranking miał z czego liczyć.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
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

      <ol className="space-y-2.5">
        {view?.ranking.map((e, i) => (
          <li key={e.ticker} className="card card-hover p-3.5 sm:p-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold tabular-nums ${
                    i < 3 ? "bg-blue-500/15 text-blue-700 ring-1 ring-inset ring-blue-500/25" : "text-neutral-500"
                  }`}
                >
                  {i + 1}
                </span>
                <ScoreGauge score={e.score} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/company/${e.ticker}`} className="truncate text-[15px] font-semibold text-neutral-900 hover:text-blue-600 hover:underline">{e.company}</Link>
                    <span className="ml-1.5 font-mono text-xs uppercase text-neutral-500">{e.ticker}</span>
                    <span className="ml-1 rounded bg-neutral-100 px-1 py-px text-[9px] font-medium text-neutral-600">{e.market}</span>
                  </div>
                  {e.coverage < 0.5 && <span className="badge badge-warn">skąpe dane</span>}
                </div>
                <div className="my-2">
                  <Bar score={e.score} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {e.components.map((c) => (
                    <Chip key={c.key} c={c} />
                  ))}
                </div>
                <div className="mt-2.5 surface-2 px-3 py-2 text-xs">
                  <div className="font-semibold text-neutral-900">
                    <span className="mr-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">
                      Wniosek
                    </span>
                    {e.verdict}
                  </div>
                  {e.pros.length > 0 && (
                    <div className="mt-1.5 text-emerald-700">
                      <span className="text-neutral-500">▲ Za: </span>
                      {e.pros.join(" · ")}
                    </div>
                  )}
                  {e.cons.length > 0 && (
                    <div className="mt-0.5 text-rose-700">
                      <span className="text-neutral-500">▼ Przeciw: </span>
                      {e.cons.join(" · ")}
                    </div>
                  )}
                  {e.note && <div className="mt-1 text-amber-700">⚠ {e.note}</div>}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-[10px] text-neutral-500">
        Metodyka (wskaźnik złożony wg podejścia OECD/JRC — bez modelu nadzorowanego, bo brak
        etykiet/outcome): odporny z-score przekrojowy (mediana + MAD, winsoryzacja ±2,5σ), przy
        wycenie / jakości / zadłużeniu <strong>względem sektora</strong> → ważona średnia z rdzeniem
        Wycena 18% + Jakość/ROE 15% + Momentum 13% (dalej wyniki 10%, potencjał 8%, zadłużenie 7%,
        reszta 3–6% jako korekty) → redukcja wg pokrycia danymi <strong>i płynności</strong> (małe
        spółki ku neutralnemu) → dystrybuanta normalna. Wnioski (werdykt, za/przeciw) liczone
        deterministycznie z σ składowych — bez AI. Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
