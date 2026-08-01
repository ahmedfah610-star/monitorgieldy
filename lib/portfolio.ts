import { hasDb, getPortfolio, USD_PLN } from "./db";
import { CORE_SECTORS } from "./sectors";
import type { PortfolioPosition, PortfolioSummary, SectorAllocation } from "./types";

/**
 * Portfel (Faza 14) — pozycje w PLN/USD (USD przeliczane po stalym kursie),
 * z auto-podpieta branza, oraz deterministyczne podsumowanie alokacji z
 * sugestia dywersyfikacji. Bez AI, zero tokenow.
 */
export { USD_PLN };

/** Buduje alokacje po branzach + sugestie. Czysta funkcja (testowalna). */
export function buildSummary(positions: PortfolioPosition[]): PortfolioSummary {
  const totalPln = positions.reduce((a, p) => a + p.amountPln, 0);
  const bySector = new Map<string, number>();
  for (const p of positions) bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.amountPln);

  const allocations: SectorAllocation[] = [...bySector.entries()]
    .map(([sector, amountPln]) => ({
      sector,
      amountPln,
      pct: totalPln > 0 ? (amountPln / totalPln) * 100 : 0,
    }))
    .sort((a, b) => b.amountPln - a.amountPln);

  const top = allocations[0] ?? null;
  const topSector = top?.sector ?? null;
  const topPct = top?.pct ?? 0;

  let suggestion: string;
  if (positions.length === 0) {
    suggestion = "Dodaj pozycje, aby zobaczyć rozbicie portfela na branże.";
  } else {
    const present = new Set(allocations.map((a) => a.sector));
    // Brakujace branze rdzeniowe (do propozycji dywersyfikacji).
    const missing = CORE_SECTORS.filter((s) => !present.has(s)).slice(0, 3);
    if (topPct >= 40 && topSector) {
      const rec = missing.length
        ? ` Rozważ rozłożenie środków także na: ${missing.join(", ")}.`
        : " Rozważ zmniejszenie tej koncentracji na rzecz pozostałych branż.";
      suggestion =
        `Masz ${topPct.toFixed(0)}% środków w branży „${topSector}" — to wysoka koncentracja.` + rec;
    } else if (allocations.length === 1) {
      suggestion = `Cały portfel w jednej branży („${topSector}"). Rozważ dywersyfikację, np.: ${missing.join(", ") || "inne branże"}.`;
    } else {
      suggestion = `Portfel w miarę zdywersyfikowany — największa branża „${topSector}" to ${topPct.toFixed(0)}% (${allocations.length} branż).`;
    }
  }

  return { totalPln, allocations, topSector, topPct, suggestion };
}

export async function getPortfolioView(): Promise<{
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
  usdPln: number;
  usingDb: boolean;
}> {
  if (!hasDb()) {
    return {
      positions: [],
      summary: buildSummary([]),
      usdPln: USD_PLN,
      usingDb: false,
    };
  }
  const positions = await getPortfolio();
  return { positions, summary: buildSummary(positions), usdPln: USD_PLN, usingDb: true };
}
