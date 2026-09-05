import {
  hasDb,
  getLatestPrices,
  getCompanySignals,
  getCompanyReports,
  getOutlook,
  getMacroSnapshots,
  type PriceSnapshot,
  type CompanySignals,
} from "./db";
import { getUniverse } from "./universe";
import { detectSector } from "./sectors";
import { computeRankings } from "./ranking";
import { projectGrowth, type CompanyForecast } from "./forecast";
import type {
  Market,
  RankingEntry,
  CompanyOutlook,
  Report,
  ExtractedFinancials,
} from "./types";

/** Lekki wpis katalogu — do wyszukiwarki spolek. */
export interface CompanyListItem {
  ticker: string;
  company: string;
  market: Market;
  sector: string;
}

/** Caly katalog (uniwersum) jako lekka lista do wyszukiwania. */
export async function getCompanyList(): Promise<CompanyListItem[]> {
  const universe = await getUniverse();
  return universe
    .map((w) => ({
      ticker: w.ticker,
      company: w.name,
      market: w.market,
      sector: detectSector(w.ticker, w.market, w.bankierSymbol ?? null),
    }))
    .sort((a, b) => a.company.localeCompare(b.company, "pl"));
}

/** Kompletny profil jednej spolki — wszystko, co zbieramy, w jednym miejscu. */
export interface CompanyProfile {
  ticker: string;
  company: string;
  market: Market;
  sector: string;
  bankierSymbol: string | null;
  price: PriceSnapshot | null;
  ranking: RankingEntry | null;
  outlook: CompanyOutlook | null;
  forecast: CompanyForecast | null;
  reports: Report[];
  signals: CompanySignals;
  usingDb: boolean;
}

function gdpFraction(indicators: { key: string; value: number | null }[] | undefined): number | null {
  const g = indicators?.find((i) => i.key === "gdp")?.value;
  return g === null || g === undefined ? null : g / 100;
}

/**
 * Buduje profil spolki: dane rynkowe (cache notowan), wynik i rozbicie rankingu,
 * perspektywy AI, prognoze przychodow oraz wszystkie sygnaly (rekomendacje,
 * raporty, insiderzy, shorty, pakiety, dywidendy). Zwraca null, gdy tickera nie
 * ma w uniwersum.
 */
export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const t = ticker.trim().toLowerCase();
  const universe = await getUniverse();
  const item = universe.find((w) => w.ticker.toLowerCase() === t);
  if (!item) return null;

  const sector = detectSector(item.ticker, item.market, item.bankierSymbol ?? null);

  if (!hasDb()) {
    return {
      ticker: item.ticker,
      company: item.name,
      market: item.market,
      sector,
      bankierSymbol: item.bankierSymbol ?? null,
      price: null,
      ranking: null,
      outlook: null,
      forecast: null,
      reports: [],
      signals: { financials: [], recommendations: [], insider: [], shorts: [], holdings: [], dividends: [] },
      usingDb: false,
    };
  }

  const [prices, ranked, signals, reports, outlook, macro] = await Promise.all([
    getLatestPrices(),
    computeRankings(),
    getCompanySignals(item.ticker),
    getCompanyReports(item.ticker, 20),
    getOutlook(item.ticker),
    getMacroSnapshots(),
  ]);

  const price = prices.get(item.ticker) ?? null;
  const ranking = ranked.ranking.find((e) => e.ticker === item.ticker) ?? null;

  // Prognoza przychodow dla tej jednej spolki (z ostatniego raportu + makro).
  const f: ExtractedFinancials | null = signals.financials[0]?.extractedJson ?? null;
  let companyGrowth: number | null = null;
  let lastRevenue: number | null = null;
  if (f && f.revenue !== null && f.revenuePrior !== null && f.revenuePrior !== 0) {
    companyGrowth = (f.revenue - f.revenuePrior) / Math.abs(f.revenuePrior);
    lastRevenue = f.revenue;
  } else if (f && f.revenue !== null) {
    lastRevenue = f.revenue;
  }
  const gdp = gdpFraction(macro[item.market]?.indicators);
  const { projectedGrowth, sectorGrowth, macroAdj } = projectGrowth(companyGrowth, sector, gdp);
  const projectedRevenue = lastRevenue !== null ? Math.round(lastRevenue * (1 + projectedGrowth)) : null;
  const forecast: CompanyForecast = {
    ticker: item.ticker,
    company: item.name,
    market: item.market,
    sector,
    period: signals.financials[0]?.period ?? f?.period ?? null,
    unit: f?.unit ?? null,
    currency: f?.currency ?? null,
    lastRevenue,
    companyGrowth,
    sectorGrowth,
    macroAdj,
    projectedGrowth,
    projectedRevenue,
    confidence: companyGrowth !== null && gdp !== null ? "wysoka" : companyGrowth !== null || lastRevenue !== null ? "średnia" : "niska",
    note:
      companyGrowth === null
        ? "Brak przeanalizowanego raportu — prognoza z branży i makro (przybliżona)."
        : gdp === null
          ? "Brak danych makro — odśwież sekcję Makro, aby uwzględnić koniunkturę."
          : "Trend firmy + prior branżowy + korekta makro.",
  };

  return {
    ticker: item.ticker,
    company: item.name,
    market: item.market,
    sector,
    bankierSymbol: item.bankierSymbol ?? null,
    price,
    ranking,
    outlook,
    forecast,
    reports,
    signals,
    usingDb: true,
  };
}
