import { getWatchlist, hasDb, DEFAULT_WATCHLIST } from "./db";
import { GPW_COMPANIES } from "./gpwCompanies";
import type { WatchlistItem } from "./types";

/**
 * "Universe" rankingu (Faza 17) — zbior spolek ocenianych i pobieranych
 * AUTOMATYCZNIE, bez recznego dodawania. To wbudowany katalog GPW (WIG20 +
 * mWIG40) polaczony z watchlista uzytkownika (jego wlasne dodatki, w tym US).
 * Dzieki temu ranking jest widoczny "z pudelka", a watchlista sluzy tylko do
 * wlasnych pozycji ponad katalog.
 */
export async function getUniverse(): Promise<WatchlistItem[]> {
  // Bez bazy dzialamy na domyslnej watchliscie (tryb fallback) — katalog GPW
  // i tak jest wbudowany, wiec profil/wyszukiwarka dzialaja przed podpieciem DB.
  const wl = hasDb() ? await getWatchlist() : DEFAULT_WATCHLIST;
  const seen = new Set(wl.map((w) => `${w.market}:${w.ticker.toLowerCase()}`));
  const catalog: WatchlistItem[] = GPW_COMPANIES.filter(
    (c) => !seen.has(`PL:${c.ticker.toLowerCase()}`),
  ).map((c) => ({ ticker: c.ticker, market: "PL", name: c.name, bankierSymbol: c.bankierSymbol }));
  return [...wl, ...catalog];
}

/**
 * Uruchamia fn dla kazdego elementu z ograniczona wspolbieznoscia (zeby nie
 * zasypac zrodel 57 rownoczesnymi zapytaniami). Zwraca wyniki jak allSettled.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
