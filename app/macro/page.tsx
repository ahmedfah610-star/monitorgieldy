"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketMacro } from "@/lib/types";

interface View {
  pl: MarketMacro | null;
  us: MarketMacro | null;
  usingDb: boolean;
}

function scoreColor(score: number): string {
  if (score >= 60) return "text-emerald-400";
  if (score <= 40) return "text-red-400";
  return "text-neutral-300";
}

function MarketCard({ m, flag, title }: { m: MarketMacro | null; flag: string; title: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">
          {flag} {title}
        </h2>
        {m && (
          <span className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold tabular-nums ${scoreColor(m.score)}`}>{m.score}</span>
            <span className="text-xs text-neutral-600">/100 klimat</span>
          </span>
        )}
      </div>

      {!m ? (
        <p className="text-sm text-neutral-500">Brak danych — kliknij „Odśwież".</p>
      ) : (
        <>
          <div className="space-y-2">
            {m.indicators.map((i) => (
              <div key={i.key} className="flex items-center justify-between border-b border-neutral-900 py-1 text-sm last:border-0">
                <span className="text-neutral-400">
                  {i.label} {i.year && <span className="text-neutral-600">({i.year})</span>}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-neutral-100">{i.value !== null ? `${i.value.toFixed(1)}${i.unit}` : "—"}</span>
                  {i.value !== null && i.prevValue !== null && (
                    <span className={`text-xs ${i.value < i.prevValue ? "text-emerald-400" : i.value > i.prevValue ? "text-red-400" : "text-neutral-500"}`}>
                      {i.value < i.prevValue ? "↓" : i.value > i.prevValue ? "↑" : "="} {i.prevValue.toFixed(1)}{i.unit}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {m.fx?.usdPln && (
            <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-300">
              Kursy NBP{m.fx.date ? ` (${m.fx.date})` : ""}: USD/PLN{" "}
              <span className="font-semibold text-neutral-100">{m.fx.usdPln.toFixed(4)}</span>
              {m.fx.eurPln && (
                <>
                  {" · "}EUR/PLN <span className="font-semibold text-neutral-100">{m.fx.eurPln.toFixed(4)}</span>
                </>
              )}
            </div>
          )}
          {m.updatedAt && <p className="text-[10px] text-neutral-600">Zaktualizowano: {m.updatedAt.replace("T", " ")}</p>}
        </>
      )}
    </section>
  );
}

interface SectorAI {
  attractiveness: number;
  verdict: string;
  summary: string;
  strengths: string[];
  threats: string[];
  drivers: { label: string; value: string }[];
  updatedAt: string;
}
interface SectorRow {
  sector: string;
  members: number;
  companies: string[];
  climate100: number;
  note: string;
  ai: SectorAI | null;
}

/** Koniunktura sektorów — ŻYWA (porusza się z rynkiem) + analiza AI: zalety,
 *  zagrożenia, ocena atrakcyjności i wprost pokazane, co złożyło się na ocenę. */
function SectorClimateSection() {
  const [rows, setRows] = useState<SectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sector-analysis", { cache: "no-store" }).then((r) => r.json());
      setRows(res.sectors ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sector-analysis", { method: "POST" });
      const j = await res.json();
      if (j.needsKey) setMsg("Analiza AI wymaga ANTHROPIC_API_KEY w zmiennych Vercela.");
      else {
        setMsg(`Zanalizowano ${j.analyzed} sektorów${j.failed ? `, błędów: ${j.failed}` : ""}.`);
        await load();
      }
    } catch {
      setMsg("Nie udało się wygenerować analizy.");
    } finally {
      setGenerating(false);
    }
  }

  const hasAI = rows.some((r) => r.ai);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-neutral-200">
            <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-blue-500 to-indigo-500" />
            Koniunktura sektorów
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            <strong className="text-neutral-300">Żywa</strong> — 60% z bieżącej siły kursów sektora
            (3M/1M + szerokość rynku), 40% prior strukturalny. Kliknij sektor, by zobaczyć{" "}
            <strong className="text-neutral-300">co złożyło się na ocenę</strong> i analizę AI.
          </p>
        </div>
        <button onClick={generate} disabled={generating} className="btn btn-primary">
          {generating ? "Analizuję…" : hasAI ? "↻ Odśwież analizę AI" : "✨ Analiza AI sektorów"}
        </button>
      </div>

      {msg && <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-neutral-300">{msg}</p>}
      {loading && <p className="mt-3 text-sm text-neutral-500">Ładowanie…</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-3 text-sm text-neutral-500">Brak danych sektorów — odśwież „Notowania" w Rankingu.</p>
      )}

      <div className="mt-3 space-y-2">
        {rows.map((r) => {
          const isOpen = open === r.sector;
          const att = r.ai?.attractiveness;
          return (
            <div key={r.sector} className="surface-2 overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : r.sector)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="w-40 shrink-0 truncate text-sm font-medium text-neutral-100">{r.sector}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${r.climate100 >= 60 ? "bg-emerald-500" : r.climate100 <= 40 ? "bg-rose-500" : "bg-neutral-500"}`}
                    style={{ width: `${r.climate100}%`, transition: "width .5s ease" }}
                  />
                </div>
                <span className={`w-8 shrink-0 text-right text-sm font-semibold tabular-nums ${scoreColor(r.climate100)}`}>
                  {r.climate100}
                </span>
                {att != null && (
                  <span className={`badge ${att >= 60 ? "badge-pos" : att <= 40 ? "badge-neg" : "badge-neutral"} hidden sm:inline-flex`}>
                    AI {att}
                  </span>
                )}
                <span className="w-4 shrink-0 text-center text-neutral-500">{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div className="border-t border-white/[0.06] px-3 py-3">
                  {r.ai ? (
                    <>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`badge ${att! >= 60 ? "badge-pos" : att! <= 40 ? "badge-neg" : "badge-neutral"}`}>
                          Atrakcyjność {att}/100
                        </span>
                        <span className="text-sm font-medium text-neutral-100">{r.ai.verdict}</span>
                      </div>
                      <p className="mb-3 text-xs text-neutral-300">{r.ai.summary}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">Zalety</p>
                          <ul className="space-y-1 text-xs text-neutral-300">
                            {r.ai.strengths.map((s, i) => <li key={i}>▲ {s}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-400">Zagrożenia</p>
                          <ul className="space-y-1 text-xs text-neutral-300">
                            {r.ai.threats.map((s, i) => <li key={i}>▼ {s}</li>)}
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mb-3 text-xs text-neutral-500">
                      Brak analizy AI dla tego sektora — kliknij „Analiza AI sektorów" powyżej.
                    </p>
                  )}

                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      Co złożyło się na ocenę
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                      {(r.ai?.drivers ?? []).map((d, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-1 border-b border-white/[0.04] py-0.5">
                          <span className="text-[11px] text-neutral-500">{d.label}</span>
                          <span className="text-xs font-medium tabular-nums text-neutral-200">{d.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-600">
                      Spółki: {r.companies.join(", ")}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function MacroPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/macro", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac makro.");
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
    try {
      const res = await fetch("/api/macro", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie odświeżyc.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="space-y-6">
      <div className="card relative flex flex-wrap items-start justify-between gap-4 overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="eyebrow">Makro & sektory</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-50">Koniunktura makro</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Klimat makroekonomiczny Polski i USA — inflacja, wzrost PKB, bezrobocie (World Bank,
            ostatnie dostępne roczne) + kursy NBP. Wskaźnik informacyjny. W rankingu atrakcyjności
            koniunkturę reprezentuje teraz <strong>koniunktura sektora</strong> (poniżej) — żywa,
            porusza się z rynkiem — a nie wspólny klimat kraju. Sekcja sektorów ma też{" "}
            <strong>analizę AI</strong>: zalety, zagrożenia i ocenę atrakcyjności każdego rynku.
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn btn-primary relative">
          {refreshing ? "Odświeżam…" : "↻ Odśwież makro"}
        </button>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Wymaga bazy (Vercel Postgres). Ustaw <code>POSTGRES_URL</code> i uruchom <code>/api/init-db</code>.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          Błąd: {error}
        </div>
      )}

      {loading && !view && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <MarketCard m={view?.pl ?? null} flag="🇵🇱" title="Polska" />
        <MarketCard m={view?.us ?? null} flag="🇺🇸" title="USA" />
      </div>

      <SectorClimateSection />

      <p className="text-[10px] text-neutral-600">
        Źródła: World Bank (wskaźniki roczne, ostatnie dostępne) + NBP (kursy dzienne). To kluczowe
        odczyty makro, nie live feed wydarzeń. Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
