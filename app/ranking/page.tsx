"use client";

import { useCallback, useEffect, useState } from "react";
import type { RankingEntry, RankingComponent } from "@/lib/types";

interface View {
  ranking: RankingEntry[];
  usingDb: boolean;
}

function scoreColor(score: number): string {
  if (score >= 65) return "text-emerald-400";
  if (score >= 55) return "text-emerald-300";
  if (score <= 35) return "text-red-400";
  if (score <= 45) return "text-red-300";
  return "text-neutral-300";
}

function Chip({ c }: { c: RankingComponent }) {
  if (c.score === null)
    return (
      <span
        title={`${c.label}: brak danych`}
        className="rounded border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-600"
      >
        {c.label} —
      </span>
    );
  const pos = c.score > 0.05;
  const neg = c.score < -0.05;
  const cls = pos
    ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
    : neg
      ? "border-red-900 bg-red-950/40 text-red-300"
      : "border-neutral-700 bg-neutral-900 text-neutral-400";
  const sign = pos ? "▲" : neg ? "▼" : "–";
  return (
    <span title={`${c.label}: ${c.detail} (waga ${Math.round(c.weight * 100)}%)`} className={`rounded border px-1.5 py-0.5 text-[11px] ${cls}`}>
      {sign} {c.label}: <span className="text-neutral-300">{c.detail}</span>
    </span>
  );
}

function Bar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-800">
      <div
        className={`h-full rounded ${score >= 55 ? "bg-emerald-500" : score <= 45 ? "bg-red-500" : "bg-neutral-500"}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

// Kazde zrodlo odswiezamy OSOBNYM requestem — na Vercel Hobby (60s/funkcja)
// wolne insider/pakiety (PDF-y) dostaja wtedy wlasny budzet czasu i sie konczą.
const STEPS: { key: string; label: string; url: string }[] = [
  { key: "recommendations", label: "Rekomendacje", url: "/api/recommendations/refresh" },
  { key: "reports", label: "Raporty", url: "/api/reports/refresh" },
  { key: "short", label: "Krótkie pozycje", url: "/api/short/refresh" },
  { key: "dividends", label: "Dywidendy", url: "/api/dividends/refresh" },
  { key: "holdings", label: "Znaczne pakiety", url: "/api/holdings/refresh" },
  { key: "insider", label: "Insiderzy", url: "/api/insider/refresh" },
  { key: "financials", label: "Wyniki r/r (AI)", url: "/api/reports/extract-pending" },
  { key: "macro", label: "Koniunktura", url: "/api/macro" },
];

interface StepState {
  label: string;
  status: "pending" | "running" | "ok" | "err";
  detail: string;
}

export default function RankingPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<StepState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ranking", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udalo sie policzyc rankingu.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Sekwencyjnie odswieza wszystkie zrodla dla calego katalogu (tylko nowe —
  // dedup). Zrodla z limitem na przebieg (insider/pakiety/wyniki) sa ZAPETLANE
  // az wyczerpia sie nowe wpisy — jedno klikniecie laduje komplet.
  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setProgress(STEPS.map((s) => ({ label: s.label, status: "pending", detail: "" })));
    // ile razy max ponawiac dane zrodlo w jednym klikniecu (bounduje czas).
    const MAX_LOOPS: Record<string, number> = { insider: 8, holdings: 8, financials: 10 };

    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      setProgress((p) => p.map((x, j) => (j === i ? { ...x, status: "running", detail: "" } : x)));
      let total = 0;
      let loops = 0;
      let status: StepState["status"] = "ok";
      let detail = "";
      try {
        const maxLoops = MAX_LOOPS[s.key] ?? 1;
        for (;;) {
          const res = await fetch(s.url, { method: "POST" });
          const json = await res.json().catch(() => ({}));
          loops += 1;
          if (!res.ok) {
            status = "err";
            detail = json.error ? String(json.error).slice(0, 60) : `HTTP ${res.status}`;
            break;
          }
          if (s.key === "financials") {
            if (json.needsKey) { detail = "wymaga klucza AI"; break; }
            total += json.extracted ?? 0;
            setProgress((p) => p.map((x, j) => (j === i ? { ...x, detail: `+${total}…` } : x)));
            if ((json.extracted ?? 0) < 6 || loops >= maxLoops) { detail = `+${total}`; break; }
          } else if (s.key === "macro") {
            detail = "✓";
            break;
          } else {
            total += json.inserted ?? 0;
            const pending = json.pending ?? 0;
            setProgress((p) => p.map((x, j) => (j === i ? { ...x, detail: `+${total}${pending ? "…" : ""}` } : x)));
            if (pending <= 0 || loops >= maxLoops) { detail = `+${total}`; break; }
          }
        }
        setProgress((p) => p.map((x, j) => (j === i ? { ...x, status, detail } : x)));
      } catch (e) {
        setProgress((p) =>
          p.map((x, j) => (j === i ? { ...x, status: "err", detail: e instanceof Error ? e.message.slice(0, 60) : "błąd" } : x)),
        );
      }
    }
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ranking atrakcyjności</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Obejmuje <strong>automatycznie cały katalog GPW (WIG20 + mWIG40)</strong> plus Twoją
            watchlistę — nic nie trzeba dodawać. Złożony wskaźnik 0-100 (50 = mediana rynku): każdy
            sygnał standaryzowany <strong>względem grupy porównawczej</strong> (odporny z-score,
            winsoryzacja), agregowany wagowo i mapowany przez dystrybuantę normalną. Chip pokazuje
            odchylenie w <strong>σ</strong> od mediany. Kliknij „Odśwież dane", aby dociągnąć sygnały.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            disabled={refreshing || loading}
            title="Pobiera wszystkie źródła dla całej watchlisty naraz (tylko nowe wpisy)"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Pobieram dane…" : "Odśwież dane"}
          </button>
          <button
            onClick={load}
            disabled={loading || refreshing}
            title="Przelicza ranking na już zebranych danych (bez pobierania)"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Liczę…" : "Przelicz"}
          </button>
        </div>
      </div>

      {progress.length > 0 && (
        <div className="rounded-md border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <p className="mb-2 text-xs text-neutral-400">
            {refreshing
              ? "Pobieram dane ze źródeł (każde osobno, by nie ucięło na limicie czasu)…"
              : "Odświeżanie zakończone. Liczby to nowe wpisy; +0 oznacza brak nowych zgłoszeń (nie błąd)."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {progress.map((s) => {
              const cls =
                s.status === "ok"
                  ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
                  : s.status === "err"
                    ? "border-red-900 bg-red-950/40 text-red-300"
                    : s.status === "running"
                      ? "border-blue-800 bg-blue-950/40 text-blue-300"
                      : "border-neutral-800 text-neutral-600";
              const icon = s.status === "ok" ? "✓" : s.status === "err" ? "✕" : s.status === "running" ? "…" : "·";
              return (
                <span key={s.label} className={`rounded border px-2 py-0.5 text-xs ${cls}`} title={s.detail}>
                  {icon} {s.label} {s.detail && s.status !== "running" ? <span className="text-neutral-400">{s.detail}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {view && !view.usingDb && (
        <div className="rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Wymaga bazy (Vercel Postgres). Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>,
          potem odśwież źródła, aby ranking miał z czego liczyć.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
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

      <ol className="space-y-3">
        {view?.ranking.map((e, i) => (
          <li key={e.ticker} className="rounded-lg border border-neutral-800 p-3">
            <div className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-center text-lg font-semibold text-neutral-500">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-neutral-100">
                    {e.company} <span className="text-neutral-600">({e.ticker})</span>
                    <span className="ml-1 text-[10px] text-neutral-600">{e.market}</span>
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className={`text-xl font-bold tabular-nums ${scoreColor(e.score)}`}>{e.score}</span>
                    <span className="text-xs text-neutral-600">/100</span>
                    {e.coverage < 0.5 && (
                      <span title="Mało danych — wynik oparty na niewielu sygnałach" className="text-[10px] text-amber-500">
                        skąpe dane
                      </span>
                    )}
                  </span>
                </div>
                <div className="my-1.5">
                  <Bar score={e.score} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {e.components.map((c) => (
                    <Chip key={c.key} c={c} />
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-[10px] text-neutral-600">
        Metodyka (wskaźnik złożony wg podejścia OECD/JRC — bez modelu nadzorowanego, bo brak
        etykiet/outcome): odporny z-score przekrojowy (mediana + MAD, winsoryzacja ±2,5σ) →
        ważona średnia (rekomendacje 18%, potencjał 16%, prognoza wzrostu 12%, insiderzy 14%,
        krótkie pozycje 13%, wyniki 10% — dynamika r/r i k/k przychodów oraz zysku, znaczne pakiety
        7%, koniunktura 6%, dywidenda 4%) → redukcja wg pokrycia danymi →
        mapowanie przez dystrybuantę normalną. Rekomendacje mają tłumienie małej próby. Składowa
        „koniunktura" różnicuje dopiero spółki różnych rynków (PL vs US). Narzędzie informacyjne,
        nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
