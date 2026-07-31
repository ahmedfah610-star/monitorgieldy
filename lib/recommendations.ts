import {
  hasDb,
  getWatchlist,
  upsertRecommendations,
  getWatchlistRecommendations,
  getMarketRecommendations,
} from "./db";
import { fetchCompanyRecommendations, fetchMarketRecommendations } from "./bankier";
import { fetchFinnhubRecommendations, hasFinnhubKey } from "./finnhub";
import type { Recommendation } from "./types";

export interface RefreshSummary {
  inserted: number;
  fetched: number;
  sources: Record<string, number>;
  errors: string[];
  finnhubConfigured: boolean;
  refreshedAt: string;
}

/**
 * Pobiera rekomendacje ze wszystkich zrodel i zapisuje nowe do bazy.
 * Odporne na bledy: awaria jednego zrodla/spolki nie przerywa reszty.
 */
export async function refreshRecommendations(): Promise<RefreshSummary> {
  const errors: string[] = [];
  const sources: Record<string, number> = {};
  const all: Recommendation[] = [];

  const watchlist = await getWatchlist();

  // --- PL: bankier per-spolka (tylko te z ustawionym slugiem) ---
  const plItems = watchlist.filter((w) => w.market === "PL" && w.bankierSymbol);
  const plResults = await Promise.allSettled(
    plItems.map((w) =>
      fetchCompanyRecommendations(w.bankierSymbol as string).then((recs) =>
        recs.map((r) => ({ ...r, watchTicker: w.ticker })),
      ),
    ),
  );
  plResults.forEach((res, i) => {
    if (res.status === "fulfilled") {
      all.push(...res.value);
      sources[`bankier:${plItems[i].bankierSymbol}`] = res.value.length;
    } else {
      errors.push(`bankier ${plItems[i].bankierSymbol}: ${String(res.reason).slice(0, 120)}`);
    }
  });

  const plWithoutSlug = watchlist.filter((w) => w.market === "PL" && !w.bankierSymbol);
  if (plWithoutSlug.length > 0) {
    errors.push(
      `Pominieto (brak symbolu bankier): ${plWithoutSlug.map((w) => w.ticker).join(", ")}`,
    );
  }

  // --- PL: feed rynkowy (najnowsze z calego rynku) ---
  try {
    const market = await fetchMarketRecommendations();
    all.push(...market); // watchTicker = null
    sources["bankier:rynek"] = market.length;
  } catch (e) {
    errors.push(`bankier feed rynkowy: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- US: Finnhub trends ---
  const finnhubConfigured = hasFinnhubKey();
  if (finnhubConfigured) {
    const usItems = watchlist.filter((w) => w.market === "US");
    const usResults = await Promise.allSettled(
      usItems.map((w) => fetchFinnhubRecommendations(w.ticker, w.ticker)),
    );
    usResults.forEach((res, i) => {
      if (res.status === "fulfilled") {
        all.push(...res.value);
        sources[`finnhub:${usItems[i].ticker}`] = res.value.length;
      } else {
        errors.push(`finnhub ${usItems[i].ticker}: ${String(res.reason).slice(0, 120)}`);
      }
    });
  } else if (watchlist.some((w) => w.market === "US")) {
    errors.push("Finnhub: brak FINNHUB_API_KEY — pominieto rekomendacje US.");
  }

  const { inserted } = await upsertRecommendations(all);

  return {
    inserted,
    fetched: all.length,
    sources,
    errors,
    finnhubConfigured,
    refreshedAt: new Date().toISOString(),
  };
}

export interface RecommendationsView {
  watchlist: Recommendation[];
  market: Recommendation[];
}

/** Odczyt zapisanych rekomendacji do wyswietlenia. */
export async function getRecommendationsView(): Promise<RecommendationsView> {
  if (!hasDb()) return { watchlist: [], market: [] };
  const [watchlist, market] = await Promise.all([
    getWatchlistRecommendations(),
    getMarketRecommendations(),
  ]);
  return { watchlist, market };
}
