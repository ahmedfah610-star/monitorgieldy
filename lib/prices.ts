import { hasDb, ensurePriceSchema, upsertPriceSnapshots, type PriceSnapshot } from "./db";
import { getUniverse, mapLimit } from "./universe";
import { fetchQuote, fetchFundamentals, toYahooSymbol } from "./yahoo";

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
  // Samonaprawa schematu — gwarantuje kolumny (r1m/r3m/pe/pbv/…) przed zapisem,
  // wiec dodanie nowej kolumny nie wymaga recznego /api/init-db.
  await ensurePriceSchema();
  const universe = await getUniverse();
  const symbolOf = (w: (typeof universe)[number]) => toYahooSymbol(w.ticker, w.market);

  // Wskazniki wyceny (C/Z, C/WK, kapitalizacja, EPS TTM) — jednym zapytaniem
  // wsadowym dla calego uniwersum. Kurs+momentum lecimy per spolka (historia).
  const [settled, funda] = await Promise.all([
    mapLimit(universe, 8, async (w) => {
      const q = await fetchQuote(symbolOf(w));
      return { w, q };
    }),
    fetchFundamentals(universe.map(symbolOf)).catch(() => new Map()),
  ]);

  const rows: PriceSnapshot[] = [];
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      errors.push(`${universe[i].ticker}: ${String(r.reason).slice(0, 100)}`);
      return;
    }
    const { w, q } = r.value;
    const f = funda.get(symbolOf(w));
    rows.push({
      ticker: w.ticker,
      market: w.market,
      close: q.close,
      changePct: q.changePct,
      r1m: q.r1m,
      r3m: q.r3m,
      currency: q.currency ?? f?.currency ?? null,
      pe: f?.pe ?? null,
      pbv: f?.pbv ?? null,
      marketCap: f?.marketCap ?? null,
      epsTtm: f?.epsTtm ?? null,
    });
  });

  const { inserted } = await upsertPriceSnapshots(rows);
  return { inserted, attempted: universe.length, errors, refreshedAt: new Date().toISOString() };
}

export function pricesEnabled(): boolean {
  return hasDb();
}
