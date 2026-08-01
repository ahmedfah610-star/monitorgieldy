import { hasDb, getWatchlist, getExtractedReports, getMacroSnapshots } from "./db";
import { detectSector } from "./sectors";
import type { Market } from "./types";

/**
 * Prognoza przychodow MarketScope (Faza 16).
 *
 * Szacunek HEURYSTYCZNY, deterministyczny (bez AI), przejrzysty — laczy trzy
 * skladniki, kazdy pokazany osobno:
 *  1. TREND FIRMY: dynamika przychodow r/r z ostatniego przeanalizowanego raportu.
 *  2. BRANZA: typowa roczna dynamika przychodow dla sektora (prior).
 *  3. MAKRO: korekta wg koniunktury rynku (wzrost PKB vs trend), przemnozona przez
 *     wrazliwosc branzy na cykl (beta) — spolki cykliczne reaguja mocniej.
 *
 * Prognozowana dynamika = 0.5*firma + 0.35*branza + korekta_makro, przycieta do
 * rozsadnego zakresu. Nie jest to prognoza inwestycyjna — to model pogladowy,
 * ktory uczciwie pokazuje swoje zalozenia.
 */

// [typowa roczna dynamika przychodow, wrazliwosc na cykl (beta)]
const SECTOR: Record<string, { growth: number; beta: number }> = {
  Bankowość: { growth: 0.05, beta: 1.1 },
  "Finanse i ubezpieczenia": { growth: 0.06, beta: 0.9 },
  Energetyka: { growth: 0.03, beta: 0.6 },
  Paliwa: { growth: 0.02, beta: 1.2 },
  "Surowce i górnictwo": { growth: 0.02, beta: 1.4 },
  "Technologia i IT": { growth: 0.12, beta: 0.8 },
  Gaming: { growth: 0.1, beta: 0.6 },
  "E-commerce": { growth: 0.15, beta: 1.0 },
  "Handel detaliczny": { growth: 0.06, beta: 0.9 },
  Nieruchomości: { growth: 0.04, beta: 1.2 },
  Przemysł: { growth: 0.05, beta: 1.2 },
  Budownictwo: { growth: 0.05, beta: 1.3 },
  Telekomunikacja: { growth: 0.02, beta: 0.4 },
  Media: { growth: 0.05, beta: 0.9 },
  Motoryzacja: { growth: 0.05, beta: 1.3 },
  "Ochrona zdrowia": { growth: 0.08, beta: 0.4 },
  Gastronomia: { growth: 0.06, beta: 1.0 },
  Turystyka: { growth: 0.08, beta: 1.3 },
  Usługi: { growth: 0.07, beta: 0.9 },
  "Dobra konsumenckie": { growth: 0.04, beta: 0.5 },
  Inna: { growth: 0.05, beta: 1.0 },
};

const GDP_TREND = 0.025; // dlugookresowy trend wzrostu PKB (odniesienie dla korekty)
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface CompanyForecast {
  ticker: string;
  company: string;
  market: Market;
  sector: string;
  period: string | null;
  unit: string | null;
  currency: string | null;
  lastRevenue: number | null;
  companyGrowth: number | null; // dynamika r/r firmy (z raportu)
  sectorGrowth: number; // prior branzowy
  macroAdj: number; // korekta makro (pp jako ulamek)
  projectedGrowth: number; // wynikowa prognozowana dynamika
  projectedRevenue: number | null; // R0 * (1 + projectedGrowth)
  confidence: "wysoka" | "średnia" | "niska";
  note: string;
}

/** GDP (wzrost, ulamek) dla rynku z zapisanego snapshotu makro; null gdy brak. */
function gdpFraction(indicators: { key: string; value: number | null }[] | undefined): number | null {
  const g = indicators?.find((i) => i.key === "gdp")?.value;
  return g === null || g === undefined ? null : g / 100;
}

export function projectGrowth(
  companyGrowth: number | null,
  sector: string,
  gdp: number | null,
): { projectedGrowth: number; sectorGrowth: number; macroAdj: number } {
  const s = SECTOR[sector] ?? SECTOR.Inna;
  const macroAdj = gdp === null ? 0 : s.beta * (gdp - GDP_TREND);
  let g: number;
  if (companyGrowth === null) {
    // Brak danych firmy — opieramy sie na branzy + makro (slabsza prognoza).
    g = 0.85 * s.growth + macroAdj;
  } else {
    g = 0.5 * companyGrowth + 0.35 * s.growth + macroAdj;
  }
  return { projectedGrowth: clamp(g, -0.35, 0.6), sectorGrowth: s.growth, macroAdj };
}

export async function getForecastView(): Promise<{ forecasts: CompanyForecast[]; usingDb: boolean }> {
  if (!hasDb()) return { forecasts: [], usingDb: false };
  const [watchlist, macro] = await Promise.all([getWatchlist(), getMacroSnapshots()]);
  const gdp: Record<string, number | null> = {
    PL: gdpFraction(macro.PL?.indicators),
    US: gdpFraction(macro.US?.indicators),
  };

  const forecasts = await Promise.all(
    watchlist.map(async (w): Promise<CompanyForecast> => {
      const reports = await getExtractedReports(w.ticker, 1);
      const sector = detectSector(w.ticker, w.market, w.bankierSymbol ?? null);
      const f = reports[0]?.extractedJson ?? null;

      let companyGrowth: number | null = null;
      let lastRevenue: number | null = null;
      if (f && f.revenue !== null && f.revenuePrior !== null && f.revenuePrior !== 0) {
        companyGrowth = (f.revenue - f.revenuePrior) / Math.abs(f.revenuePrior);
        lastRevenue = f.revenue;
      } else if (f && f.revenue !== null) {
        lastRevenue = f.revenue;
      }

      const g = gdp[w.market];
      const { projectedGrowth, sectorGrowth, macroAdj } = projectGrowth(companyGrowth, sector, g);
      const projectedRevenue = lastRevenue !== null ? Math.round(lastRevenue * (1 + projectedGrowth)) : null;

      const confidence: CompanyForecast["confidence"] =
        companyGrowth !== null && g !== null ? "wysoka" : companyGrowth !== null || lastRevenue !== null ? "średnia" : "niska";
      const note =
        companyGrowth === null
          ? "Brak przeanalizowanego raportu — prognoza z branży i makro (przybliżona)."
          : g === null
            ? "Brak danych makro — odśwież sekcję Makro, aby uwzględnić koniunkturę."
            : "Trend firmy + prior branżowy + korekta makro.";

      return {
        ticker: w.ticker,
        company: w.name,
        market: w.market,
        sector,
        period: reports[0]?.period ?? f?.period ?? null,
        unit: f?.unit ?? null,
        currency: f?.currency ?? null,
        lastRevenue,
        companyGrowth,
        sectorGrowth,
        macroAdj,
        projectedGrowth,
        projectedRevenue,
        confidence,
        note,
      };
    }),
  );

  // Najpierw te z najwyzsza prognozowana dynamika.
  forecasts.sort((a, b) => b.projectedGrowth - a.projectedGrowth);
  return { forecasts, usingDb: true };
}
