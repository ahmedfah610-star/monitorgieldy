import { hasDb, upsertPriceSnapshots, type PriceSnapshot } from "./db";
import { getUniverse, mapLimit } from "./universe";
import { fetchQuote, toYahooSymbol } from "./yahoo";

/**
 * Cache notowan dla rankingu (Faza 19).
 *
 * Wczesniej ranking pobieral historie 6mo z Yahoo dla ~57 spolek przy KAZDYM
 * wejsciu na strone — wolno i zawodnie (limity Yahoo). Teraz notowania (kurs,
 * zmiana dzienna, momentum 1M/3M) zaciagamy RAZ podczas odswiezania i zapisujemy
 * do bazy; ranking czyta je z bazy natychmiast. Zgodne z modelem aplikacji:
 * odswiezanie zasila dane, widoki czytaja z bazy.
 */
export interface PricesRefreshSummary {
  inserted: number;
  attempted: number;
  errors: string[];
  refreshedAt: string;
}

export async function refreshPrices(): Promise<PricesRefreshSummary> {
  const errors: string[] = [];
  const universe = await getUniverse();

  const settled = await mapLimit(universe, 8, async (w): Promise<PriceSnapshot> => {
    const q = await fetchQuote(toYahooSymbol(w.ticker, w.market));
    return {
      ticker: w.ticker,
      market: w.market,
      close: q.close,
      changePct: q.changePct,
      r1m: q.r1m,
      r3m: q.r3m,
      currency: q.currency,
    };
  });

  const rows: PriceSnapshot[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") rows.push(r.value);
    else errors.push(`${universe[i].ticker}: ${String(r.reason).slice(0, 100)}`);
  });

  const { inserted } = await upsertPriceSnapshots(rows);
  return { inserted, attempted: universe.length, errors, refreshedAt: new Date().toISOString() };
}

export function pricesEnabled(): boolean {
  return hasDb();
}
