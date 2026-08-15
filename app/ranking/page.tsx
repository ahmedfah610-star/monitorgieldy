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

/** Okrągły wskaźnik wyniku 0-100 (jak gauge na platformie tradingowej). */
function ScoreGauge({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const stroke =
    score >= 55 ? "rgb(16 185 129)" : score <= 45 ? "rgb(244 63 94)" : "rgb(148 163 184)";
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 52 52" className="h-14 w-14 -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
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
        className="inline-flex items-center rounded-md border border-white/[0.05] px-1.5 py-0.5 text-[11px] text-neutral-600"
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
  const color = accent != null ? scoreColor(accent) : "text-neutral-100";
  return (
    <div className="min-w-[120px] flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${grad}`}
        style={{ width: `${score}%`, transition: "width .6s ease" }}
      />
    </div>
  );
}

// Kazde zrodlo odswiezamy OSOBNYM requestem — na Vercel Hobby (60s/funkcja)
// wolne insider/pakiety (PDF-y) dostaja wtedy wlasny budzet czasu i sie konczą.
const STEPS: { key: string; label: string; url: string }[] = [
  { key: "prices", label: "Notowania (kurs + momentum)", url: "/api/prices/refresh" },
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
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-50">
              Ranking atrakcyjności
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Najwyższa oczekiwana stopa zwrotu od <strong className="text-neutral-200">bieżącej
              ceny</strong>, przy zdrowych fundamentach i sygnałach smart money. Rdzeń wskaźnika:{" "}
              <strong className="text-neutral-200">Wycena (C/Z + EV/EBITDA + C/WK) · Jakość (ROE) ·
              Momentum</strong>, wszystko względem sektora. Cały katalog GPW automatycznie.
            </p>
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
          <div className="relative mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
            <Stat label="Spółek" value={String(view.ranking.length)} />
            <Stat label="Najwyższy wynik" value={topScore != null ? String(topScore) : "—"} accent={topScore} />
            <Stat label="Mediana katalogu" value={avgScore != null ? String(avgScore) : "—"} />
            <Stat label="Lider" value={view.ranking[0]?.company ?? "—"} />
          </div>
        ) : null}
      </div>

      {progress.length > 0 && (
        <div className="card px-4 py-3">
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
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Wymaga bazy (Vercel Postgres). Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>,
          potem odśwież źródła, aby ranking miał z czego liczyć.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
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
                    i < 3 ? "bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25" : "text-neutral-500"
                  }`}
                >
                  {i + 1}
                </span>
                <ScoreGauge score={e.score} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="truncate text-[15px] font-semibold text-neutral-50">{e.company}</span>
                    <span className="ml-1.5 font-mono text-xs uppercase text-neutral-500">{e.ticker}</span>
                    <span className="ml-1 rounded bg-white/[0.05] px-1 py-px text-[9px] font-medium text-neutral-400">{e.market}</span>
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
                  <div className="font-semibold text-neutral-100">
                    <span className="mr-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-300">
                      Wniosek
                    </span>
                    {e.verdict}
                  </div>
                  {e.pros.length > 0 && (
                    <div className="mt-1.5 text-emerald-300/90">
                      <span className="text-neutral-500">▲ Za: </span>
                      {e.pros.join(" · ")}
                    </div>
                  )}
                  {e.cons.length > 0 && (
                    <div className="mt-0.5 text-rose-300/90">
                      <span className="text-neutral-500">▼ Przeciw: </span>
                      {e.cons.join(" · ")}
                    </div>
                  )}
                  {e.note && <div className="mt-1 text-amber-400/90">⚠ {e.note}</div>}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-[10px] text-neutral-600">
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
