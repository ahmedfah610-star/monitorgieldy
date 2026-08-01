import { hasDb, getWatchlist, getCompanySignals, getMacroSnapshots, type CompanySignals } from "./db";
import { fetchQuote, toYahooSymbol } from "./yahoo";
import { projectGrowth } from "./forecast";
import { detectSector } from "./sectors";
import type { RankingComponent, RankingEntry, Market } from "./types";

/**
 * Ranking atrakcyjnosci spolek — zlozony wskaznik (composite indicator).
 *
 * Metodyka (bez etykiet/outcome, wiec NIE model nadzorowany — zgodnie z
 * podejsciem OECD/JRC do wskaznikow zlozonych):
 *  1. Dla kazdej spolki liczymy CIAGLE surowe sygnaly, zorientowane tak, ze
 *     wyzej = lepiej (shorty z minusem itd.).
 *  2. Standaryzacja PRZEKROJOWA i ODPORNA: robust z-score = (x - mediana) /
 *     (1.4826 * MAD) liczony na zbiorze spolek, z winsoryzacja do +-2.5. Dzieki
 *     temu kazdy sygnal jest mierzony wzgledem grupy porownawczej, a wartosci
 *     skrajne (np. short 13%) nie dominuja.
 *  3. Agregacja: wazona srednia z-score'ow po skladowych, ktore MAJA dane.
 *  4. Redukcja wg pewnosci: composite * (pokrycie wagowe) — malo danych ciagnie
 *     ku neutralnemu.
 *  5. Mapowanie na 0-100 przez dystrybuante normalna Φ (50 = mediana rynku),
 *     zeby wynik byl dobrze rozlozony, a nie liniowo nasycony.
 *
 * Deterministyczne, bez AI. Skladowa "macro" wsrod spolek jednego rynku sie
 * zeruje (identyczna) i rozroznia dopiero PL vs US — to poprawne dla rankingu
 * wzglednego.
 */
const HORIZON_DAYS = 180;
const WINSOR = 2.5; // ograniczenie z-score
const SPREAD = 0.9; // skala mapowania Φ (mniejsza => wiekszy rozrzut)

const WEIGHTS: Record<string, number> = {
  consensus: 0.18, // wydzwiek rekomendacji (Kupuj/Trzymaj/Sprzedaj)
  potential: 0.16, // potencjal: mediana ceny docelowej vs kurs biezacy
  forecast: 0.12, // prognozowana dynamika przychodow (firma+branza+makro)
  insider: 0.14, // transakcje osob zarzadzajacych
  short: 0.13, // krotkie pozycje (KNF)
  financials: 0.1, // realne wyniki r/r (jakosc ostatniego wykonania)
  holdings: 0.07, // znaczne pakiety (art. 69)
  macro: 0.06, // koniunktura makro rynku (nizsza, bo czesc jest juz w prognozie)
  dividend: 0.04, // stopa dywidendy (prognoza z dyskontem)
};
const LABELS: Record<string, string> = {
  consensus: "Rekomendacje",
  potential: "Potencjał",
  forecast: "Prognoza wzrostu",
  insider: "Insiderzy",
  short: "Krótkie pozycje",
  financials: "Wyniki r/r",
  holdings: "Znaczne pakiety",
  macro: "Koniunktura",
  dividend: "Dywidenda",
};
const KEYS = Object.keys(WEIGHTS);

// ---------- statystyka ----------
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function mad(xs: number[], med: number): number {
  return median(xs.map((x) => Math.abs(x - med)));
}
function stdev(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1));
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
// dystrybuanta normalna przez przyblizenie erf (Abramowitz-Stegun 7.1.26)
function erf(x: number): number {
  const s = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return s * y;
}
const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

function recentEnough(dateStr: string | null): boolean {
  if (!dateStr) return true;
  const t = Date.parse(dateStr);
  return !Number.isFinite(t) || (Date.now() - t) / 86_400_000 <= HORIZON_DAYS;
}

// ---------- surowe sygnaly (ciagle, wyzej = lepiej) ----------
interface Raw {
  value: number | null;
  detail: string;
}

function rawSignals(
  market: Market,
  s: CompanySignals,
  macroRaw: number | null,
  price: number | null,
  sector: string,
  gdp: number | null,
): Record<string, Raw> {
  const out: Record<string, Raw> = {};
  let revGrowth: number | null = null; // dynamika przychodow firmy — do prognozy

  // Rekomendacje: tilt sentymentu z tlumieniem malej proby.
  if (s.recommendations.length) {
    const b = s.recommendations.filter((r) => r.sentiment === "positive").length;
    const h = s.recommendations.filter((r) => r.sentiment === "neutral").length;
    const se = s.recommendations.filter((r) => r.sentiment === "negative").length;
    const rated = b + h + se || s.recommendations.length;
    out.consensus = { value: (b - se) / Math.max(rated, 4), detail: `Kupuj ${b}/Trzymaj ${h}/Sprzedaj ${se}` };
  } else out.consensus = { value: null, detail: "brak" };

  // Potencjal: mediana ceny docelowej analitykow vs biezacy kurs (prognoza + cena).
  const targets = s.recommendations.map((r) => r.priceTarget).filter((v): v is number => v !== null && v > 0);
  if (price !== null && price > 0 && targets.length) {
    const mt = median(targets);
    const up = (mt - price) / price;
    out.potential = {
      value: up,
      detail: `cel ${mt.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} vs ${price.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} · ${up >= 0 ? "+" : ""}${(up * 100).toFixed(0)}%`,
    };
  } else out.potential = { value: null, detail: price === null ? "brak kursu" : "brak celu" };

  // Insiderzy: netto kupno-sprzedaz (wartosciowo, inaczej po liczbie).
  const ins = s.insider.filter((t) => recentEnough(t.txDate ?? t.publishedAt?.slice(0, 10) ?? null));
  if (ins.length) {
    let bv = 0, sv = 0, bn = 0, sn = 0;
    for (const t of ins) {
      const v = t.value ?? 0;
      if (t.txType === "nabycie") { bv += v; bn += 1; }
      else if (t.txType === "zbycie") { sv += v; sn += 1; }
    }
    const useVal = bv + sv > 0;
    const net = useVal ? bv - sv : bn - sn;
    const den = useVal ? bv + sv : bn + sn;
    out.insider = {
      value: den > 0 ? net / den : null,
      detail: `kupno ${bn}/sprzedaż ${sn}${useVal ? ` (~${Math.round((bv - sv) / 1000).toLocaleString("pl-PL")} tys.)` : ""}`,
    };
  } else out.insider = { value: null, detail: "brak" };

  // Krotkie pozycje: -laczny % (mniej shortu = wyzej). Brak wpisow = brak danych.
  if (s.shorts.length) {
    const latest = new Map<string, (typeof s.shorts)[number]>();
    for (const x of s.shorts) {
      const p = latest.get(x.holder);
      if (!p || (x.positionDate ?? "") > (p.positionDate ?? "")) latest.set(x.holder, x);
    }
    const total = [...latest.values()].reduce((a, x) => a + (x.netShortPct ?? 0), 0);
    out.short = { value: -total, detail: `łącznie ${total.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%` };
  } else out.short = { value: null, detail: "brak" };

  // Wyniki r/r: srednia dynamika przychodow i zysku netto.
  if (s.financials.length) {
    const f = s.financials[0].extractedJson;
    const g = (c: number | null, p: number | null) => (c === null || p === null || p === 0 ? null : (c - p) / Math.abs(p));
    const rev = g(f.revenue, f.revenuePrior);
    const net = g(f.netProfit, f.netProfitPrior);
    revGrowth = rev;
    const gr: number[] = [];
    const parts: string[] = [];
    if (rev !== null) { gr.push(rev); parts.push(`przych. ${rev >= 0 ? "+" : ""}${(rev * 100).toFixed(0)}%`); }
    if (net !== null) { gr.push(net); parts.push(`zysk ${net >= 0 ? "+" : ""}${(net * 100).toFixed(0)}%`); }
    out.financials = {
      value: gr.length ? gr.reduce((a, b) => a + b, 0) / gr.length : null,
      detail: parts.length ? parts.join(", ") : "brak porównania",
    };
  } else out.financials = { value: null, detail: "brak" };

  // Znaczne pakiety: netto wejscia-wyjscia.
  const hold = s.holdings.filter((n) => recentEnough(n.publishedAt?.slice(0, 10) ?? null));
  if (hold.length) {
    const inc = hold.filter((n) => n.direction === "increase").length;
    const dec = hold.filter((n) => n.direction === "decrease").length;
    out.holdings = { value: inc + dec > 0 ? (inc - dec) / (inc + dec) : null, detail: `wejścia ${inc}/wyjścia ${dec}` };
  } else out.holdings = { value: null, detail: "brak" };

  // Prognoza wzrostu: forward-looking dynamika przychodow (firma + branza + makro).
  // Dostepna niemal zawsze (branza znana); najlepsza, gdy jest raport i makro.
  const { projectedGrowth } = projectGrowth(revGrowth, sector, gdp);
  out.forecast = {
    value: projectedGrowth,
    detail: `${projectedGrowth >= 0 ? "+" : ""}${(projectedGrowth * 100).toFixed(0)}% przychodów`,
  };

  // Koniunktura makro rynku (wspolna dla rynku).
  out.macro =
    macroRaw === null || macroRaw === undefined
      ? { value: null, detail: "brak" }
      : { value: macroRaw, detail: `klimat ${market} ${Math.round((macroRaw + 1) * 50)}/100` };

  // Dywidenda: stopa, z dyskontem dla prognozowanej (proponowana/projekt).
  const withY = s.dividends.filter((d) => d.yieldPct !== null && d.yieldPct > 0);
  if (withY.length) {
    const confirmed = /uchwal|wyp[łl]ac/i;
    const chosen = withY.find((d) => confirmed.test(d.status ?? "")) ?? withY[0];
    const y = chosen.yieldPct as number;
    const isForecast = !confirmed.test(chosen.status ?? "");
    out.dividend = {
      value: isForecast ? y * 0.6 : y, // niepewnosc prognozy => dyskonto
      detail: `stopa ${y.toLocaleString("pl-PL")}%${isForecast ? " (prognoza)" : ""}`,
    };
  } else out.dividend = { value: null, detail: "brak" };

  return out;
}

export interface RankItem {
  company: string;
  ticker: string;
  market: Market;
  raw: Record<string, Raw>;
}

/** Buduje ranking z surowych sygnalow: standaryzacja przekrojowa + agregacja. */
export function buildRanking(items: RankItem[]): RankingEntry[] {
  // Statystyki odpornosciowe per skladowa (na zbiorze spolek).
  const stat: Record<string, { med: number; scale: number } | null> = {};
  for (const key of KEYS) {
    const vals = items.map((it) => it.raw[key]?.value).filter((v): v is number => v !== null && Number.isFinite(v));
    if (vals.length < 2) {
      stat[key] = null; // za malo danych, by rozroznic — z=0
      continue;
    }
    const med = median(vals);
    let scale = 1.4826 * mad(vals, med);
    if (scale === 0) {
      // MAD=0 (>=polowa identyczna) — fallback na odchylenie standardowe.
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      scale = stdev(vals, mean);
    }
    stat[key] = { med, scale };
  }

  const entries: RankingEntry[] = items.map((it) => {
    const components: RankingComponent[] = KEYS.map((key) => {
      const raw = it.raw[key] ?? { value: null, detail: "brak" };
      const w = WEIGHTS[key];
      if (raw.value === null) return { key, label: LABELS[key], score: null, weight: w, detail: raw.detail };
      const st = stat[key];
      let z = 0;
      if (st && st.scale > 0) z = clamp((raw.value - st.med) / st.scale, -WINSOR, WINSOR);
      const sigma = `${z >= 0 ? "+" : ""}${z.toFixed(1)}σ`;
      return { key, label: LABELS[key], score: z, weight: w, detail: `${raw.detail} · ${sigma}` };
    });

    const active = components.filter((c) => c.score !== null);
    const sumActiveW = active.reduce((a, c) => a + c.weight, 0);
    const sumAllW = components.reduce((a, c) => a + c.weight, 0);
    const composite = sumActiveW > 0 ? active.reduce((a, c) => a + c.weight * (c.score as number), 0) / sumActiveW : 0;
    const confidence = sumAllW > 0 ? sumActiveW / sumAllW : 0;
    const shrunk = composite * confidence;
    return {
      ticker: it.ticker,
      company: it.company,
      market: it.market,
      score: Math.round(100 * normCdf(shrunk / SPREAD)),
      coverage: confidence,
      components,
    };
  });

  entries.sort((a, b) => b.score - a.score || b.coverage - a.coverage);
  return entries;
}

/** Liczy ranking dla calej watchlisty. */
export async function computeRankings(): Promise<{ ranking: RankingEntry[]; usingDb: boolean }> {
  if (!hasDb()) return { ranking: [], usingDb: false };
  const [watchlist, macro] = await Promise.all([getWatchlist(), getMacroSnapshots()]);
  const macroRaw: Record<string, number | null> = { PL: macro.PL?.scoreRaw ?? null, US: macro.US?.scoreRaw ?? null };
  const gdpFrac = (m: Market): number | null => {
    const v = macro[m]?.indicators?.find((i) => i.key === "gdp")?.value;
    return v === null || v === undefined ? null : v / 100;
  };
  const gdp: Record<string, number | null> = { PL: gdpFrac("PL"), US: gdpFrac("US") };

  const items: RankItem[] = await Promise.all(
    watchlist.map(async (w) => {
      const [signals, quote] = await Promise.all([
        getCompanySignals(w.ticker),
        fetchQuote(toYahooSymbol(w.ticker, w.market)).catch(() => null),
      ]);
      const sector = detectSector(w.ticker, w.market, w.bankierSymbol ?? null);
      return {
        company: w.name,
        ticker: w.ticker,
        market: w.market,
        raw: rawSignals(w.market, signals, macroRaw[w.market] ?? null, quote?.close ?? null, sector, gdp[w.market] ?? null),
      };
    }),
  );
  return { ranking: buildRanking(items), usingDb: true };
}
