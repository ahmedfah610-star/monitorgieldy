"use client";

import { useCallback, useEffect, useState } from "react";
import type { CompanyForecast } from "@/lib/forecast";

interface View {
  forecasts: CompanyForecast[];
  usingDb: boolean;
}

function pct(v: number | null, withSign = true): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const s = (v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 });
  return `${withSign && v >= 0 ? "+" : ""}${s}%`;
}

function growthColor(v: number): string {
  return v > 0.005 ? "text-up" : v < -0.005 ? "text-down" : "text-neutral-700";
}

function ConfBadge({ c }: { c: CompanyForecast["confidence"] }) {
  const cls =
    c === "wysoka"
      ? "border-emerald-800 bg-emerald-50 text-emerald-700"
      : c === "średnia"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-neutral-300 bg-neutral-100 text-neutral-600";
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>pewność: {c}</span>;
}

function Factor({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-2" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-sm text-neutral-800">{value}</p>
    </div>
  );
}

function Card({ f }: { f: CompanyForecast }) {
  const rev = (v: number | null) =>
    v === null ? "—" : v.toLocaleString("pl-PL") + (f.unit ? ` ${f.unit}` : "") + (f.currency ? ` ${f.currency}` : "");
  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
          {f.company} <span className="text-neutral-500">({f.ticker})</span>
          <span className="ml-1.5 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-normal normal-case text-neutral-600">
            {f.sector}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <ConfBadge c={f.confidence} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">Prognozowana dynamika przychodów</p>
          <p className={`text-2xl font-bold tabular-nums ${growthColor(f.projectedGrowth)}`}>{pct(f.projectedGrowth)}</p>
          <p className="text-[10px] text-neutral-500">r/r</p>
        </div>
        {f.lastRevenue !== null && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">
              Przychód: {f.period ?? "ost. okres"} → prognoza
            </p>
            <p className="text-sm tabular-nums text-neutral-700">
              {rev(f.lastRevenue)} <span className="text-neutral-500">→</span>{" "}
              <span className="font-semibold text-neutral-900">{rev(f.projectedRevenue)}</span>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Factor
          label="Trend firmy (r/r)"
          value={pct(f.companyGrowth)}
          hint="Dynamika przychodów z ostatniego przeanalizowanego raportu"
        />
        <Factor label="Typowo w branży" value={pct(f.sectorGrowth)} hint="Prior branżowy — typowa roczna dynamika sektora" />
        <Factor
          label="Korekta makro"
          value={pct(f.macroAdj)}
          hint="Wpływ koniunktury (wzrost PKB vs trend) × wrażliwość branży na cykl"
        />
      </div>

      <p className="text-[10px] text-neutral-500">{f.note}</p>
    </section>
  );
}

export default function ForecastPage() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/forecast", { cache: "no-store" }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setView(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie policzyc prognoz.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Prognozy przychodów</h1>
          <p className="max-w-2xl text-xs text-neutral-500">
            Szacunek MarketScope: prognozowana dynamika przychodów = <strong>trend firmy</strong> (z
            raportów) + <strong>typowa dynamika branży</strong> + <strong>korekta makro</strong>
            (koniunktura × wrażliwość sektora na cykl). Każdy składnik pokazany osobno. Deterministyczne,
            bez AI. Szacunek poglądowy — nie prognoza inwestycyjna.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? "Liczę…" : "Przelicz"}
        </button>
      </div>

      {view && !view.usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Wymaga bazy (Vercel Postgres). Najlepsze prognozy po analizie raportów (przycisk „Analizuj"
          na Raportach) i odświeżeniu sekcji Makro.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          Błąd: {error}
        </div>
      )}

      {loading && !view && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      {view && view.forecasts.length === 0 && !loading && view.usingDb && (
        <p className="text-sm text-neutral-500">Watchlista jest pusta — dodaj spółki, aby zobaczyć prognozy.</p>
      )}

      <div className="space-y-4">
        {view?.forecasts.map((f) => (
          <Card key={`${f.market}:${f.ticker}`} f={f} />
        ))}
      </div>

      <p className="text-[10px] text-neutral-500">
        Model poglądowy: prognoza = 0,5·trend firmy + 0,35·branża + korekta makro (przycięta do
        rozsądnego zakresu). Najdokładniejszy, gdy spółka ma przeanalizowany raport i odświeżone makro.
        Narzędzie informacyjne, nie doradztwo inwestycyjne.
      </p>
    </main>
  );
}
