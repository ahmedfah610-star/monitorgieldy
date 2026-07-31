import type { Recommendation, Sentiment } from "./types";

/**
 * Rekomendacje dla spolek US z Finnhub (endpoint "recommendation trends").
 * Darmowy tier wymaga klucza API (FINNHUB_API_KEY) — bez klucza pomijamy US
 * i zglaszamy to w wyniku odswiezania.
 *
 * Endpoint zwraca zbiorczy trend (liczby analitykow: strongBuy/buy/hold/sell/
 * strongSell) per miesiac — nie pojedyncze rekomendacje z cena docelowa.
 * Zamieniamy najnowsze okresy na konsensus + wydzwiek.
 */
const BASE = "https://finnhub.io/api/v1";

export function hasFinnhubKey(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}

interface TrendRow {
  symbol: string;
  period: string; // YYYY-MM-DD (pierwszy dzien miesiaca)
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

function consensus(r: TrendRow): { rating: string; sentiment: Sentiment } {
  const score = r.strongBuy * 2 + r.buy - r.sell - r.strongSell * 2;
  const sentiment: Sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  const label = sentiment === "positive" ? "Kupuj" : sentiment === "negative" ? "Sprzedaj" : "Trzymaj";
  const counts = `SB ${r.strongBuy} / B ${r.buy} / H ${r.hold} / S ${r.sell} / SS ${r.strongSell}`;
  return { rating: `${label} — konsensus (${counts})`, sentiment };
}

/**
 * Pobiera rekomendacje dla podanego tickera US i zwraca najnowsze `periods`
 * okresow jako Recommendation[]. `watchTicker` to ticker z watchlisty.
 */
export async function fetchFinnhubRecommendations(
  ticker: string,
  watchTicker: string,
  periods = 2,
): Promise<Recommendation[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  const symbol = ticker.trim().toUpperCase();
  const url = `${BASE}/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`;

  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} dla ${symbol}`);

  const data = (await res.json()) as TrendRow[];
  if (!Array.isArray(data) || data.length === 0) return [];

  // Finnhub zwraca najnowsze okresy pierwsze.
  return data.slice(0, periods).map((row) => {
    const { rating, sentiment } = consensus(row);
    return {
      watchTicker,
      market: "US",
      source: "finnhub",
      symbol,
      company: symbol,
      broker: null,
      rating,
      sentiment,
      priceTarget: null,
      priceAtIssue: null,
      currency: "USD",
      recDate: row.period ?? null,
    } satisfies Recommendation;
  });
}
