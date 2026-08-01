import { hasDb, upsertMacro, getMacroSnapshots } from "./db";
import type { Market, MacroIndicator, MarketMacro } from "./types";

/**
 * Koniunktura makroekonomiczna PL / USA (Faza 15).
 *
 * Zrodla keyless: World Bank API (inflacja CPI, wzrost PKB, bezrobocie — roczne,
 * ostatnie dostepne) + NBP (kursy USD/PLN, EUR/PLN — dzienne, tylko PL). Z tego
 * liczymy "wynik klimatu" 0-100 dla kazdego rynku, ktory wchodzi tez do rankingu
 * atrakcyjnosci jako czynnik wspolny dla wszystkich spolek danego rynku. Bez AI.
 *
 * Uwaga: to sa kluczowe ODCZYTY makro (roczne WB + dzienny kurs), nie live feed
 * wydarzen — kalendarz newsowy wymagalby platnego API.
 */
const WB = "https://api.worldbank.org/v2/country";
const UA = "Mozilla/5.0 (market-dashboard, personal use)";

const INDICATORS: { key: string; code: string; label: string }[] = [
  { key: "inflation", code: "FP.CPI.TOTL.ZG", label: "Inflacja CPI" },
  { key: "gdp", code: "NY.GDP.MKTP.KD.ZG", label: "Wzrost PKB" },
  { key: "unemployment", code: "SL.UEM.TOTL.ZS", label: "Bezrobocie" },
];

const clamp = (n: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, n));

async function fetchJson(url: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim().startsWith("[") && !text.trim().startsWith("{")) continue;
      return JSON.parse(text);
    } catch {
      // ponow raz
    }
  }
  return null;
}

/** Pobiera wskaznik World Bank: ostatnie 2 wartosci (biezaca + poprzednia). */
async function fetchIndicator(iso3: string, code: string): Promise<{ value: number | null; prev: number | null; year: string | null }> {
  const json = await fetchJson(`${WB}/${iso3}/indicator/${code}?format=json&per_page=2&mrv=2`);
  const rows = Array.isArray(json) ? (json[1] as Array<{ date: string; value: number | null }>) : null;
  if (!rows || rows.length === 0) return { value: null, prev: null, year: null };
  const withVal = rows.filter((r) => r.value !== null);
  return {
    value: withVal[0]?.value ?? null,
    prev: withVal[1]?.value ?? null,
    year: withVal[0]?.date ?? null,
  };
}

async function fetchNbp(code: string): Promise<{ mid: number; date: string } | null> {
  const json = (await fetchJson(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`)) as
    | { rates?: { mid: number; effectiveDate: string }[] }
    | null;
  const r = json?.rates?.[0];
  return r ? { mid: r.mid, date: r.effectiveDate } : null;
}

/** Skladowe wyniku klimatu w [-1,1] (equities: niska inflacja, wyzszy PKB, nizsze bezrobocie). */
function indicatorScore(key: string, v: number): number | null {
  if (key === "inflation") return clamp((4 - v) / 4); // 0%→+1, 4%→0, 8%→-1
  if (key === "gdp") return clamp(v / 4); // 4%→+1, 0→0, -4%→-1
  if (key === "unemployment") return clamp((6 - v) / 6); // 0%→+1, 6%→0, 12%→-1
  return null;
}
const SCORE_WEIGHT: Record<string, number> = { inflation: 0.4, gdp: 0.4, unemployment: 0.2 };

function buildHighlights(inds: MacroIndicator[], fx?: MarketMacro["fx"]): string[] {
  const out: string[] = [];
  for (const i of inds) {
    if (i.value === null) continue;
    let arrow = "";
    if (i.prevValue !== null) {
      const d = i.value - i.prevValue;
      arrow = Math.abs(d) < 0.05 ? " (bez zmian r/r)" : d < 0 ? ` (↓ z ${i.prevValue.toFixed(1)}%)` : ` (↑ z ${i.prevValue.toFixed(1)}%)`;
    }
    out.push(`${i.label}: ${i.value.toFixed(1)}%${i.year ? ` (${i.year})` : ""}${arrow}`);
  }
  if (fx?.usdPln) out.push(`USD/PLN ${fx.usdPln.toFixed(2)}${fx.eurPln ? ` · EUR/PLN ${fx.eurPln.toFixed(2)}` : ""}`);
  return out;
}

async function fetchMarketMacro(market: Market, iso3: string): Promise<MarketMacro> {
  const results = await Promise.allSettled(INDICATORS.map((i) => fetchIndicator(iso3, i.code)));
  const indicators: MacroIndicator[] = INDICATORS.map((meta, idx) => {
    const r = results[idx];
    const data = r.status === "fulfilled" ? r.value : { value: null, prev: null, year: null };
    return { key: meta.key, label: meta.label, value: data.value, prevValue: data.prev, year: data.year, unit: "%" };
  });

  let fx: MarketMacro["fx"];
  if (market === "PL") {
    const [usd, eur] = await Promise.all([fetchNbp("usd"), fetchNbp("eur")]);
    fx = { usdPln: usd?.mid ?? null, eurPln: eur?.mid ?? null, date: usd?.date ?? eur?.date ?? null };
  }

  // Wynik klimatu: wazona srednia dostepnych skladowych.
  let raw = 0,
    sw = 0;
  for (const i of indicators) {
    if (i.value === null) continue;
    const s = indicatorScore(i.key, i.value);
    if (s === null) continue;
    raw += SCORE_WEIGHT[i.key] * s;
    sw += SCORE_WEIGHT[i.key];
  }
  const scoreRaw = sw > 0 ? raw / sw : 0;
  return {
    market,
    scoreRaw,
    score: Math.round((scoreRaw + 1) * 50),
    indicators,
    fx,
    highlights: buildHighlights(indicators, fx),
    updatedAt: new Date().toISOString(),
  };
}

/** Pobiera makro dla PL i USA. */
export async function fetchMacro(): Promise<{ pl: MarketMacro; us: MarketMacro }> {
  const [pl, us] = await Promise.all([fetchMarketMacro("PL", "POL"), fetchMarketMacro("US", "USA")]);
  return { pl, us };
}

export interface MacroRefreshSummary {
  updated: string[];
  errors: string[];
  refreshedAt: string;
}

/** Pobiera i zapisuje makro (do bazy). Wolane recznie i przez refresh-all. */
export async function refreshMacro(): Promise<MacroRefreshSummary> {
  const errors: string[] = [];
  const updated: string[] = [];
  try {
    const { pl, us } = await fetchMacro();
    for (const m of [pl, us]) {
      const hasData = m.indicators.some((i) => i.value !== null) || Boolean(m.fx?.usdPln);
      if (hasData) {
        await upsertMacro(m);
        updated.push(m.market);
      } else {
        errors.push(`${m.market}: brak danych ze zrodel`);
      }
    }
  } catch (e) {
    errors.push(String(e).slice(0, 150));
  }
  return { updated, errors, refreshedAt: new Date().toISOString() };
}

export async function getMacroView(): Promise<{ pl: MarketMacro | null; us: MarketMacro | null; usingDb: boolean }> {
  if (!hasDb()) return { pl: null, us: null, usingDb: false };
  const snaps = await getMacroSnapshots();
  return { pl: snaps.PL ?? null, us: snaps.US ?? null, usingDb: true };
}
