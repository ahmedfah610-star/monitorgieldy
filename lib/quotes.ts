import { fetchQuote, toYahooSymbol } from "./yahoo";
import { INDICES } from "./indices";
import { getWatchlist, hasDb, DEFAULT_WATCHLIST } from "./db";
import type { Quote, Market } from "./types";

async function quoteFor(
  label: string,
  ticker: string,
  market: Market,
  symbol: string,
): Promise<Quote> {
  const r = await fetchQuote(symbol);
  return {
    label,
    ticker,
    market,
    symbol,
    close: r.close,
    changePct: r.changePct,
    returns: r.returns,
    currency: r.currency,
    date: r.date,
    error: r.error,
  };
}

export interface QuotesPayload {
  indices: Quote[];
  pl: Quote[];
  us: Quote[];
  usingFallbackWatchlist: boolean;
  fetchedAt: string;
}

export async function getAllQuotes(): Promise<QuotesPayload> {
  const usingFallbackWatchlist = !hasDb();
  const watchlist = usingFallbackWatchlist ? DEFAULT_WATCHLIST : await getWatchlist();

  const indexPromises = INDICES.map((i) =>
    quoteFor(i.label, i.symbol, i.market, i.symbol),
  );
  const watchPromises = watchlist.map((w) =>
    quoteFor(w.name || w.ticker, w.ticker, w.market, toYahooSymbol(w.ticker, w.market)),
  );

  const [indices, watch] = await Promise.all([
    Promise.all(indexPromises),
    Promise.all(watchPromises),
  ]);

  return {
    indices,
    pl: watch.filter((q) => q.market === "PL"),
    us: watch.filter((q) => q.market === "US"),
    usingFallbackWatchlist,
    fetchedAt: new Date().toISOString(),
  };
}
