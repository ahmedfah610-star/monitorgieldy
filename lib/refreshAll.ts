import { refreshRecommendations } from "./recommendations";
import { refreshReports } from "./reports";
import { refreshInsiderTransactions } from "./insider";
import { refreshShortPositions } from "./knf";
import { refreshHoldingNotifications } from "./holdings";
import { refreshDividends } from "./dividends";

/**
 * Uruchamia wszystkie odswiezenia zrodel PL naraz (Faza 11). Dzieki temu
 * wystarcza JEDEN Vercel Cron zamiast szesciu (limit planu Hobby), a przycisk
 * "Odswiez wszystko" moze pociagnac calosc jednym zadaniem. Kazde zrodlo jest
 * niezalezne (Promise.allSettled) — awaria jednego nie psuje reszty.
 */
export interface RefreshAllSummary {
  ok: string[];
  failed: Record<string, string>;
  results: Record<string, unknown>;
  refreshedAt: string;
}

export async function refreshAll(): Promise<RefreshAllSummary> {
  const tasks: Record<string, () => Promise<unknown>> = {
    recommendations: refreshRecommendations,
    reports: refreshReports,
    short: refreshShortPositions,
    dividends: refreshDividends,
    insider: refreshInsiderTransactions,
    holdings: refreshHoldingNotifications,
  };

  const names = Object.keys(tasks);
  const settled = await Promise.allSettled(names.map((n) => tasks[n]()));

  const ok: string[] = [];
  const failed: Record<string, string> = {};
  const results: Record<string, unknown> = {};
  settled.forEach((res, i) => {
    const name = names[i];
    if (res.status === "fulfilled") {
      ok.push(name);
      results[name] = res.value;
    } else {
      failed[name] = String(res.reason).slice(0, 150);
    }
  });

  return { ok, failed, results, refreshedAt: new Date().toISOString() };
}
