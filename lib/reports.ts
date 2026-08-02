import {
  hasDb,
  getWatchlist,
  upsertReports,
  getWatchlistReports,
  getLatestConclusions,
  getUnextractedReports,
  updateReportExtraction,
} from "./db";
import { fetchCompanyReports } from "./espi";
import { hasAnthropicKey, extractFromUrl } from "./extract";
import type { Report, Conclusion } from "./types";

/**
 * Wsadowa ekstrakcja wynikow (Faza 4) — wyciaga liczby z raportow watchlisty,
 * ktore jeszcze nie maja extracted_json. Uzywane w refresh-all, by "Odswiez dane"
 * zasilalo tez "Wyniki r/r" (nie tylko liste raportow). Wymaga klucza Anthropic;
 * dedup po extracted_json => kazdy raport analizowany raz. Limit chroni tokeny/czas.
 */
export async function extractPendingReports(
  limit = 6,
): Promise<{ extracted: number; failed: number; needsKey: boolean }> {
  if (!hasAnthropicKey()) return { extracted: 0, failed: 0, needsKey: true };
  const pending = await getUnextractedReports(limit);
  let extracted = 0;
  let failed = 0;
  for (const r of pending) {
    try {
      const data = await extractFromUrl(r.url, {
        company: r.company ?? r.watchTicker ?? "",
        period: r.period ?? "",
        ticker: r.watchTicker ?? "",
      });
      await updateReportExtraction(r.url, data);
      extracted += 1;
    } catch {
      failed += 1;
    }
  }
  return { extracted, failed, needsKey: false };
}

export interface ReportsRefreshSummary {
  inserted: number;
  fetched: number;
  sources: Record<string, number>;
  errors: string[];
  refreshedAt: string;
}

/**
 * Pobiera komunikaty ESPI/EBI dla spolek PL z watchlisty (tych z ustawionym
 * symbolem bankier), wykrywa raporty okresowe i zapisuje nowe do bazy.
 */
export async function refreshReports(): Promise<ReportsRefreshSummary> {
  const errors: string[] = [];
  const sources: Record<string, number> = {};
  const all: Report[] = [];

  const watchlist = await getWatchlist();
  const plItems = watchlist.filter((w) => w.market === "PL" && w.bankierSymbol);

  const results = await Promise.allSettled(
    plItems.map((w) =>
      fetchCompanyReports(w.bankierSymbol as string).then((reports) =>
        reports.map((r) => ({ ...r, watchTicker: w.ticker, company: w.name })),
      ),
    ),
  );
  results.forEach((res, i) => {
    if (res.status === "fulfilled") {
      all.push(...res.value);
      sources[plItems[i].bankierSymbol as string] = res.value.length;
    } else {
      errors.push(`${plItems[i].bankierSymbol}: ${String(res.reason).slice(0, 120)}`);
    }
  });

  const plWithoutSlug = watchlist.filter((w) => w.market === "PL" && !w.bankierSymbol);
  if (plWithoutSlug.length > 0) {
    errors.push(
      `Pominieto (brak symbolu bankier): ${plWithoutSlug.map((w) => w.ticker).join(", ")}`,
    );
  }
  if (watchlist.some((w) => w.market === "US")) {
    errors.push("Raporty US (SEC EDGAR) nie sa jeszcze zaimplementowane — pominieto US.");
  }

  const { inserted } = await upsertReports(all);

  return {
    inserted,
    fetched: all.length,
    sources,
    errors,
    refreshedAt: new Date().toISOString(),
  };
}

/** Odczyt zapisanych raportow (+ najnowsze wnioski AI) do wyswietlenia. */
export async function getReportsView(): Promise<{
  reports: Report[];
  conclusions: Record<string, Conclusion>;
  usingDb: boolean;
}> {
  if (!hasDb()) return { reports: [], conclusions: {}, usingDb: false };
  const [reports, conclusions] = await Promise.all([
    getWatchlistReports(),
    getLatestConclusions(),
  ]);
  return { reports, conclusions, usingDb: true };
}
