import { hasDb, getCompanySignals, getMacroSnapshots, type CompanySignals } from "./db";
import { getUniverse, mapLimit } from "./universe";
import { fetchQuote, toYahooSymbol } from "./yahoo";
import { projectGrowth } from "./forecast";
import { detectSector } from "./sectors";
import { computeSectorClimates, type SectorClimate } from "./sectorClimate";
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

// Cel: "najlepsza spolka do KUPNA na dzis" = najwyzsza oczekiwana stopa zwrotu od
// BIEZACEJ ceny, przy zdrowych fundamentach i sygnalach smart money. Dlatego
// prowadzi potencjal (upside od dzisiejszego kursu), prognoza wzrostu, jakosc
// wynikow i konsensus; momentum tylko POTWIERDZA (nie goni drogich akcji).
// Ranking rusza sie codziennie, bo dzisiejsza cena wchodzi do potencjalu i momentum.
const WEIGHTS: Record<string, number> = {
  potential: 0.18, // upside: mediana ceny docelowej vs kurs BIEZACY (stlumiony) — naglowek tezy
  forecast: 0.11, // prognozowana dynamika przychodow (firma+branza+makro)
  consensus: 0.11, // wydzwiek rekomendacji (Kupuj/Trzymaj/Sprzedaj)
  financials: 0.12, // realne wyniki r/r + k/k (jakosc ostatniego wykonania)
  insider: 0.12, // transakcje osob zarzadzajacych (smart money kupuje dzis)
  short: 0.1, // krotkie pozycje (KNF) — niski short = mniej zakladow na spadek
  momentum: 0.1, // sila wzgledna kursu (1M/3M) — potwierdzenie rynku, timing wejscia
  sector: 0.06, // koniunktura SEKTORA spolki (prior + oddolna sila 3M) — roznicuje po branzy
  holdings: 0.06, // znaczne pakiety (art. 69)
  dividend: 0.04, // stopa dywidendy (prognoza z dyskontem)
};
const LABELS: Record<string, string> = {
  potential: "Potencjał",
  forecast: "Prognoza wzrostu",
  consensus: "Rekomendacje",
  financials: "Wyniki r/r",
  insider: "Insiderzy",
  short: "Krótkie pozycje",
  momentum: "Momentum",
  sector: "Koniunktura sektora",
  holdings: "Znaczne pakiety",
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
  s: CompanySignals,
  sectorClimate: SectorClimate | null,
  price: number | null,
  sector: string,
  gdp: number | null,
  mom: { r1m: number | null; r3m: number | null },
): Record<string, Raw> {
  const out: Record<string, Raw> = {};
  let revGrowth: number | null = null; // dynamika przychodow firmy — do prognozy

  // Momentum: sila wzgledna kursu = blend zwrotu 1M i 3M (realne notowania, zmienia
  // sie codziennie). Wyzej = lepiej. Wymaga chociaz jednego okna historii.
  {
    const parts: number[] = [];
    const lbl: string[] = [];
    if (mom.r1m !== null) { parts.push(0.5 * mom.r1m); lbl.push(`1M ${mom.r1m >= 0 ? "+" : ""}${(mom.r1m * 100).toFixed(0)}%`); }
    if (mom.r3m !== null) { parts.push(0.5 * mom.r3m); lbl.push(`3M ${mom.r3m >= 0 ? "+" : ""}${(mom.r3m * 100).toFixed(0)}%`); }
    // Gdy jest tylko jedno okno, przeskaluj, by nie zaniżać sygnału o brakującą połowę.
    const value = parts.length
      ? (parts.reduce((a, b) => a + b, 0) * (parts.length === 1 ? 2 : 1))
      : null;
    out.momentum = value === null ? { value: null, detail: "brak historii" } : { value, detail: lbl.join(" · ") };
  }

  // Rekomendacje: tilt sentymentu z tlumieniem malej proby.
  if (s.recommendations.length) {
    const b = s.recommendations.filter((r) => r.sentiment === "positive").length;
    const h = s.recommendations.filter((r) => r.sentiment === "neutral").length;
    const se = s.recommendations.filter((r) => r.sentiment === "negative").length;
    const rated = b + h + se || s.recommendations.length;
    out.consensus = { value: (b - se) / Math.max(rated, 4), detail: `Kupuj ${b}/Trzymaj ${h}/Sprzedaj ${se}` };
  } else out.consensus = { value: null, detail: "brak" };

  // Potencjal: mediana ceny docelowej analitykow vs biezacy kurs (prognoza + cena).
  // Tlumienie pulapki wartosci: pojedynczy stary/wysrubowany cel dawal absurdalne
  // "+100%" i przyklejal nieplynne spolki do gory. Dlatego (a) surowy potencjal
  // przycinamy do +-60%, (b) przy tylko JEDNYM celu skalujemy sygnal o 0.5
  // (mniejsza wiarygodnosc konsensusu z jednej opinii).
  const targets = s.recommendations.map((r) => r.priceTarget).filter((v): v is number => v !== null && v > 0);
  if (price !== null && price > 0 && targets.length) {
    const mt = median(targets);
    const upRaw = (mt - price) / price;
    const up = clamp(upRaw, -0.6, 0.6) * (targets.length === 1 ? 0.5 : 1);
    out.potential = {
      value: up,
      detail: `cel ${mt.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} vs ${price.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} · ${upRaw >= 0 ? "+" : ""}${(upRaw * 100).toFixed(0)}%${targets.length === 1 ? " (1 cel)" : ""}`,
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

  // Wyniki: laczy dynamike ROK DO ROKU (z pola porownawczego raportu) i KWARTAL
  // DO KWARTALU (z dwoch kolejnych raportow kwartalnych). Kazda daje punkty,
  // r/r wazone mocniej (stabilniejsze), k/k lzej (sezonowosc).
  const g = (c: number | null, p: number | null) => (c === null || p === null || p === 0 ? null : (c - p) / Math.abs(p));
  if (s.financials.length) {
    const f = s.financials[0].extractedJson;
    // Rok do roku — z samego raportu (biezacy vs analogiczny okres rok wczesniej).
    const revYoY = g(f.revenue, f.revenuePrior);
    const netYoY = g(f.netProfit, f.netProfitPrior);
    revGrowth = revYoY;
    const yoy: number[] = [];
    if (revYoY !== null) yoy.push(revYoY);
    if (netYoY !== null) yoy.push(netYoY);

    // Kwartal do kwartalu — dwa kolejne raporty KWARTALNE.
    const q = s.financials.filter((r) => r.reportType === "kwartalny").map((r) => r.extractedJson);
    const revQoQ = q.length >= 2 ? g(q[0].revenue, q[1].revenue) : null;
    const netQoQ = q.length >= 2 ? g(q[0].netProfit, q[1].netProfit) : null;
    const qoq: number[] = [];
    if (revQoQ !== null) qoq.push(revQoQ);
    if (netQoQ !== null) qoq.push(netQoQ);

    const yoyAvg = yoy.length ? yoy.reduce((a, b) => a + b, 0) / yoy.length : null;
    const qoqAvg = qoq.length ? qoq.reduce((a, b) => a + b, 0) / qoq.length : null;
    let value: number | null = null;
    if (yoyAvg !== null && qoqAvg !== null) value = 0.65 * yoyAvg + 0.35 * qoqAvg;
    else value = yoyAvg ?? qoqAvg;

    const parts: string[] = [];
    if (yoyAvg !== null) parts.push(`r/r ${yoyAvg >= 0 ? "+" : ""}${(yoyAvg * 100).toFixed(0)}%`);
    if (qoqAvg !== null) parts.push(`k/k ${qoqAvg >= 0 ? "+" : ""}${(qoqAvg * 100).toFixed(0)}%`);
    out.financials = { value, detail: parts.length ? parts.join(" · ") : "brak porównania" };
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

  // Koniunktura SEKTORA spolki (prior strukturalny + oddolna sila 3M sektora).
  // Roznicuje spolki po branzy — inaczej niz dawne makro kraju (wspolne dla rynku).
  if (sectorClimate === null) {
    out.sector = { value: null, detail: "brak" };
  } else {
    const src = sectorClimate.bottomUp === null ? "prior" : "prior + siła 3M";
    out.sector = {
      value: sectorClimate.climate,
      detail: `${sector} ${Math.round((sectorClimate.climate + 1) * 50)}/100 (${src})`,
    };
  }

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
  const [universe, macro] = await Promise.all([getUniverse(), getMacroSnapshots()]);
  const gdpFrac = (m: Market): number | null => {
    const v = macro[m]?.indicators?.find((i) => i.key === "gdp")?.value;
    return v === null || v === undefined ? null : v / 100;
  };
  const gdp: Record<string, number | null> = { PL: gdpFrac("PL"), US: gdpFrac("US") };

  // Przejscie 1: sygnaly + notowania + sektor dla kazdej spolki. Ograniczona
  // wspolbieznosc — 57 spolek naraz zasypaloby Yahoo/baze. Kurs pobieramy dla
  // KAZDEJ spolki (momentum i koniunktura sektora wymagaja notowan).
  const settled = await mapLimit(universe, 8, async (w) => {
    const signals = await getCompanySignals(w.ticker);
    const quote = await fetchQuote(toYahooSymbol(w.ticker, w.market)).catch(() => null);
    const sector = detectSector(w.ticker, w.market, w.bankierSymbol ?? null);
    return { w, signals, quote, sector };
  });
  const fetched = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  // Koniunktura sektorow: prior strukturalny + oddolna srednia sila 3M spolek
  // danego sektora z uniwersum. Liczona RAZ, wspoldzielona przez spolki sektora.
  const climates = computeSectorClimates(fetched.map((f) => ({ sector: f.sector, r3m: f.quote?.r3m ?? null })));

  // Przejscie 2: surowe sygnaly z koniunktura sektora danej spolki.
  const items: RankItem[] = fetched.map((f) => ({
    company: f.w.name,
    ticker: f.w.ticker,
    market: f.w.market,
    raw: rawSignals(
      f.signals,
      climates.get(f.sector) ?? null,
      f.quote?.close ?? null,
      f.sector,
      gdp[f.w.market] ?? null,
      { r1m: f.quote?.r1m ?? null, r3m: f.quote?.r3m ?? null },
    ),
  }));
  return { ranking: buildRanking(items), usingDb: true };
}
