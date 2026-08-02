import { refreshRecommendations } from "./recommendations";
import { refreshReports, extractPendingReports } from "./reports";
import { refreshInsiderTransactions } from "./insider";
import { refreshShortPositions } from "./knf";
import { refreshHoldingNotifications } from "./holdings";
import { refreshDividends } from "./dividends";
import { refreshMacro } from "./macro";

/**
 * Odswieza WSZYSTKIE zrodla PL naraz (Faza 11, rozszerzone). Jeden przycisk
 * "Odswiez dane" zastepuje reczne odswiezanie kazdej sekcji. Zwraca liczniki
 * nowych wpisow per zrodlo, zeby bylo widac co doszlo (a np. "insiderzy 0" =
 * brak nowych zgloszen, nie blad). Ekstrakcja wynikow (AI) leci PO zaciagnieciu
 * raportow i tylko dla tych bez liczb — wiec "Odswiez dane" zasila tez "Wyniki r/r".
 */
export interface RefreshAllSummary {
  counts: Record<string, number>;
  ok: string[];
  failed: Record<string, string>;
  financials: { extracted: number; needsKey: boolean };
  refreshedAt: string;
}

export async function refreshAll(): Promise<RefreshAllSummary> {
  const ok: string[] = [];
  const failed: Record<string, string> = {};
  const counts: Record<string, number> = {};

  const wrap = (name: string, fn: () => Promise<unknown>, get: (r: unknown) => number) =>
    fn()
      .then((r) => {
        ok.push(name);
        counts[name] = get(r);
      })
      .catch((e) => {
        failed[name] = String(e).slice(0, 150);
      });

  // Niezalezne scrapery rownolegle (reies musi sie skonczyc przed ekstrakcja —
  // Promise.all czeka na wszystkie, wiec raporty sa juz w bazie potem).
  await Promise.all([
    wrap("recommendations", refreshRecommendations, (r) => (r as { inserted: number }).inserted),
    wrap("reports", refreshReports, (r) => (r as { inserted: number }).inserted),
    wrap("short", refreshShortPositions, (r) => (r as { inserted: number }).inserted),
    wrap("dividends", refreshDividends, (r) => (r as { inserted: number }).inserted),
    wrap("insider", refreshInsiderTransactions, (r) => (r as { inserted: number }).inserted),
    wrap("holdings", refreshHoldingNotifications, (r) => (r as { inserted: number }).inserted),
    wrap("macro", refreshMacro, (r) => (r as { updated: string[] }).updated?.length ?? 0),
  ]);

  // Wyniki r/r: wyciagnij liczby z nowych raportow (tylko bez extracted_json).
  let financials = { extracted: 0, needsKey: false };
  try {
    const res = await extractPendingReports(6);
    financials = { extracted: res.extracted, needsKey: res.needsKey };
    if (!res.needsKey) ok.push("financials");
  } catch (e) {
    failed["financials"] = String(e).slice(0, 150);
  }
  counts.financials = financials.extracted;

  return { counts, ok, failed, financials, refreshedAt: new Date().toISOString() };
}
