import { hasDb, getLatestPrices, getDividendYields } from "./db";
import { getUniverse } from "./universe";
import { detectSector } from "./sectors";
import { computeRankings } from "./ranking";
import type { Market } from "./types";

/**
 * Screener GPW (Faza 24) — „Finviz dla GPW".
 *
 * Udostepnia caly katalog jako filtrowalna/sortowalna tabele. Zero nowych zrodel:
 * laczy cache notowan (price_snapshots: wycena, jakosc, momentum, kapitalizacja,
 * obrot), stopy dywidend oraz wynik i sigmy rankingu. Filtrowanie/sortowanie po
 * stronie klienta (kilkadziesiat spolek = blyskawiczne).
 */
export interface ScreenerRow {
  ticker: string;
  company: string;
  market: Market;
  sector: string;
  score: number | null; // wynik rankingu 0-100
  soe: boolean; // kontrola Skarbu Panstwa
  close: number | null;
  changePct: number | null;
  currency: string | null;
  pe: number | null;
  pbv: number | null;
  evEbitda: number | null;
  roe: number | null; // ulamek
  dte: number | null; // dlug/kapital %
  margin: number | null; // ulamek
  divYield: number | null; // %
  marketCap: number | null;
  turnover: number | null; // sredni dzienny obrot (waluta lokalna)
  r1m: number | null; // ulamek
  r3m: number | null; // ulamek
  sigValue: number | null;
  sigQuality: number | null;
  sigMomentum: number | null;
}

export async function getScreenerView(): Promise<{ rows: ScreenerRow[]; usingDb: boolean }> {
  if (!hasDb()) return { rows: [], usingDb: false };

  const [universe, prices, divs, ranked] = await Promise.all([
    getUniverse(),
    getLatestPrices(),
    getDividendYields(),
    computeRankings(),
  ]);

  const sectorOf = new Map<string, string>();
  for (const w of universe) sectorOf.set(w.ticker, detectSector(w.ticker, w.market, w.bankierSymbol ?? null));

  const rankMap = new Map(ranked.ranking.map((e) => [e.ticker, e]));

  const rows: ScreenerRow[] = universe.map((w) => {
    const q = prices.get(w.ticker) ?? null;
    const e = rankMap.get(w.ticker);
    const sig = (k: string) => e?.components.find((c) => c.key === k)?.score ?? null;
    const turnover = q?.close != null && q?.avgVol != null ? q.close * q.avgVol : null;
    return {
      ticker: w.ticker,
      company: w.name,
      market: w.market,
      sector: sectorOf.get(w.ticker) ?? "Inna",
      score: e?.score ?? null,
      soe: Boolean(e?.note && e.note.includes("Skarbu Państwa")),
      close: q?.close ?? null,
      changePct: q?.changePct ?? null,
      currency: q?.currency ?? null,
      pe: q?.pe ?? null,
      pbv: q?.pbv ?? null,
      evEbitda: q?.evEbitda ?? null,
      roe: q?.roe ?? null,
      dte: q?.debtToEquity ?? null,
      margin: q?.profitMargin ?? null,
      divYield: divs.get(w.ticker) ?? null,
      marketCap: q?.marketCap ?? null,
      turnover,
      r1m: q?.r1m ?? null,
      r3m: q?.r3m ?? null,
      sigValue: sig("value"),
      sigQuality: sig("quality"),
      sigMomentum: sig("momentum"),
    };
  });

  // Domyslnie po wyniku rankingu malejaco (null na koniec).
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { rows, usingDb: true };
}
