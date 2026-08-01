import { hasDb, getWatchlist, getCompanySignals, type CompanySignals } from "./db";
import type { RankingComponent, RankingEntry, Market } from "./types";

/**
 * Wewnetrzny ranking atrakcyjnosci spolek (Faza 13).
 *
 * DETERMINISTYCZNY, bez AI (zero tokenow). Kazda spolka dostaje wynik 0-100
 * zlozony z wazonych sygnalow, ktore juz zbieramy. Kazda skladowa liczona jest
 * w [-1,1] (byczo..niedzwiedzio); wagi renormalizujemy po skladowych, ktore
 * MAJA dane, wiec brak danych nie ciagnie sztucznie do neutralnego. Pokazujemy
 * rozbicie, zeby bylo widac dlaczego spolka jest wyzej.
 *
 * 50 = neutralnie. Okno czasowe dla zdarzen (insiderzy, pakiety) to ~180 dni.
 */
const HORIZON_DAYS = 180;

const WEIGHTS = {
  consensus: 0.25, // rekomendacje analitykow
  insider: 0.2, // transakcje osob zarzadzajacych
  short: 0.18, // krotkie pozycje (KNF)
  financials: 0.2, // trend wynikow r/r
  holdings: 0.12, // znaczne pakiety (art. 69)
  dividend: 0.05, // stopa dywidendy
} as const;

function clamp(n: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

function recentEnough(dateStr: string | null): boolean {
  if (!dateStr) return true; // brak daty nie wyklucza
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) / 86_400_000 <= HORIZON_DAYS;
}

function consensusComp(recs: CompanySignals["recommendations"]): RankingComponent {
  const w = WEIGHTS.consensus;
  if (recs.length === 0)
    return { key: "consensus", label: "Rekomendacje", score: null, weight: w, detail: "brak" };
  const buy = recs.filter((r) => r.sentiment === "positive").length;
  const hold = recs.filter((r) => r.sentiment === "neutral").length;
  const sell = recs.filter((r) => r.sentiment === "negative").length;
  const rated = buy + hold + sell || recs.length;
  return {
    key: "consensus",
    label: "Rekomendacje",
    score: clamp((buy - sell) / rated),
    weight: w,
    detail: `Kupuj ${buy} / Trzymaj ${hold} / Sprzedaj ${sell}`,
  };
}

function insiderComp(ins: CompanySignals["insider"]): RankingComponent {
  const w = WEIGHTS.insider;
  const recent = ins.filter((t) => recentEnough(t.txDate ?? t.publishedAt?.slice(0, 10) ?? null));
  if (recent.length === 0)
    return { key: "insider", label: "Insiderzy", score: null, weight: w, detail: "brak" };
  let buyVal = 0,
    sellVal = 0,
    buyN = 0,
    sellN = 0;
  for (const t of recent) {
    const v = t.value ?? 0;
    if (t.txType === "nabycie") {
      buyVal += v;
      buyN += 1;
    } else if (t.txType === "zbycie") {
      sellVal += v;
      sellN += 1;
    }
  }
  // Preferuj wartosci; gdy brak kwot — licz po liczbie transakcji.
  const useVal = buyVal + sellVal > 0;
  const net = useVal ? buyVal - sellVal : buyN - sellN;
  const denom = useVal ? buyVal + sellVal : buyN + sellN;
  const score = denom > 0 ? clamp(net / denom) : null;
  const money = useVal ? ` (~${Math.round((buyVal - sellVal) / 1000).toLocaleString("pl-PL")} tys. netto)` : "";
  return {
    key: "insider",
    label: "Insiderzy",
    score,
    weight: w,
    detail: `kupno ${buyN} / sprzedaż ${sellN}${money}`,
  };
}

function shortComp(shorts: CompanySignals["shorts"]): RankingComponent {
  const w = WEIGHTS.short;
  if (shorts.length === 0)
    return { key: "short", label: "Krótkie pozycje", score: null, weight: w, detail: "brak" };
  // biezaca pozycja = najnowszy wpis per posiadacz
  const latest = new Map<string, (typeof shorts)[number]>();
  for (const s of shorts) {
    const prev = latest.get(s.holder);
    if (!prev || (s.positionDate ?? "") > (prev.positionDate ?? "")) latest.set(s.holder, s);
  }
  const total = [...latest.values()].reduce((a, s) => a + (s.netShortPct ?? 0), 0);
  // Shorty tylko obnizaja: 0% -> 0, 3%+ -> -1.
  return {
    key: "short",
    label: "Krótkie pozycje",
    score: clamp(-total / 3, -1, 0),
    weight: w,
    detail: `łącznie ${total.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`,
  };
}

function financialsComp(fin: CompanySignals["financials"]): RankingComponent {
  const w = WEIGHTS.financials;
  if (fin.length === 0)
    return { key: "financials", label: "Wyniki r/r", score: null, weight: w, detail: "brak" };
  const f = fin[0].extractedJson;
  const growths: number[] = [];
  const parts: string[] = [];
  const g = (cur: number | null, prior: number | null): number | null =>
    cur === null || prior === null || prior === 0 ? null : (cur - prior) / Math.abs(prior);
  const rev = g(f.revenue, f.revenuePrior);
  const net = g(f.netProfit, f.netProfitPrior);
  if (rev !== null) {
    growths.push(clamp(rev / 0.25));
    parts.push(`przychody ${rev >= 0 ? "+" : ""}${(rev * 100).toFixed(0)}%`);
  }
  if (net !== null) {
    growths.push(clamp(net / 0.25));
    parts.push(`zysk netto ${net >= 0 ? "+" : ""}${(net * 100).toFixed(0)}%`);
  }
  const score = growths.length ? growths.reduce((a, b) => a + b, 0) / growths.length : null;
  return {
    key: "financials",
    label: "Wyniki r/r",
    score,
    weight: w,
    detail: parts.length ? parts.join(", ") : `${fin[0].period ?? f.period} (bez danych porównawczych)`,
  };
}

function holdingsComp(h: CompanySignals["holdings"]): RankingComponent {
  const w = WEIGHTS.holdings;
  const recent = h.filter((n) => recentEnough(n.publishedAt?.slice(0, 10) ?? null));
  if (recent.length === 0)
    return { key: "holdings", label: "Znaczne pakiety", score: null, weight: w, detail: "brak" };
  const inc = recent.filter((n) => n.direction === "increase").length;
  const dec = recent.filter((n) => n.direction === "decrease").length;
  const denom = inc + dec;
  return {
    key: "holdings",
    label: "Znaczne pakiety",
    score: denom > 0 ? clamp((inc - dec) / denom) : null,
    weight: w,
    detail: `wejścia ${inc} / wyjścia ${dec}`,
  };
}

function dividendComp(divs: CompanySignals["dividends"]): RankingComponent {
  const w = WEIGHTS.dividend;
  const withYield = divs.find((d) => d.yieldPct !== null && d.yieldPct > 0);
  if (!withYield)
    return { key: "dividend", label: "Dywidenda", score: null, weight: w, detail: "brak" };
  const y = withYield.yieldPct as number;
  return {
    key: "dividend",
    label: "Dywidenda",
    score: clamp(y / 8, 0, 1), // 8%+ -> +1, tylko dodatnia
    weight: w,
    detail: `stopa ${y.toLocaleString("pl-PL")}%`,
  };
}

/** Czysta funkcja: liczy pozycje rankingu z sygnalow (bez I/O). */
export function scoreCompany(
  company: string,
  ticker: string,
  market: Market,
  s: CompanySignals,
): RankingEntry {
  const components = [
    consensusComp(s.recommendations),
    insiderComp(s.insider),
    shortComp(s.shorts),
    financialsComp(s.financials),
    holdingsComp(s.holdings),
    dividendComp(s.dividends),
  ];
  const active = components.filter((c) => c.score !== null);
  const sumW = active.reduce((a, c) => a + c.weight, 0);
  const raw = sumW > 0 ? active.reduce((a, c) => a + c.weight * (c.score as number), 0) / sumW : 0;
  return {
    ticker,
    company,
    market,
    score: Math.round((raw + 1) * 50),
    coverage: active.length / components.length,
    components,
  };
}

/** Liczy ranking dla calej watchlisty, malejaco wg wyniku. */
export async function computeRankings(): Promise<{ ranking: RankingEntry[]; usingDb: boolean }> {
  if (!hasDb()) return { ranking: [], usingDb: false };
  const watchlist = await getWatchlist();
  const entries = await Promise.all(
    watchlist.map(async (w) => {
      const signals = await getCompanySignals(w.ticker);
      return scoreCompany(w.name, w.ticker, w.market, signals);
    }),
  );
  entries.sort((a, b) => b.score - a.score || b.coverage - a.coverage);
  return { ranking: entries, usingDb: true };
}
