import { hasDb, getCompanySignals, getMacroSnapshots, getLatestPrices, type CompanySignals } from "./db";
import { getUniverse, mapLimit } from "./universe";
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
// Wagi skoncentrowane wg zasady: najwiecej znaczy to, co (1) ma udokumentowana
// premie w danych i (2) ma u nas TWARDE, geste dane. Rdzen = Wartosc + Jakosc +
// Momentum (value/quality/momentum — sprawdzone anomalie), wsparte realnymi
// wynikami i niskim zadluzeniem. Sygnaly rzadkie/zaszumione (insider, pakiety,
// prognoza, konsensus analitykow na GPW) to juz tylko KOREKTY, nie fundament.
// Uszeregowane malejaco — kolejnosc = takze kolejnosc chipow w UI.
const WEIGHTS: Record<string, number> = {
  value: 0.18, // RDZEN: wycena E/P = 1/(C/Z), sektorowo-wzglednie — twarda taniosc
  quality: 0.15, // RDZEN: ROE (rentownosc kapitalu), sektorowo-wzglednie — dobry biznes
  momentum: 0.13, // RDZEN: sila wzgledna 1M/3M — co realnie dziala, rusza sie codziennie
  financials: 0.1, // wsparcie: realne wyniki r/r + k/k (dowiezione zyski)
  potential: 0.08, // wsparcie: upside do celu analitykow (na GPW rzadki/przestarzaly)
  risk: 0.07, // wsparcie: niskie zadluzenie (dlug/kapital), sektorowo-wzglednie
  consensus: 0.06, // korekta: wydzwiek rekomendacji (Kupuj/Trzymaj/Sprzedaj)
  insider: 0.05, // korekta: transakcje osob zarzadzajacych (smart money)
  short: 0.05, // korekta: krotkie pozycje KNF (niski short = mniej zakladow na spadek)
  sector: 0.04, // korekta: koniunktura sektora (prior + oddolna sila 3M)
  forecast: 0.03, // korekta: nasza heurystyczna prognoza przychodow (slaba)
  dividend: 0.03, // korekta: stopa dywidendy
  holdings: 0.03, // korekta: znaczne pakiety (art. 69)
};
const LABELS: Record<string, string> = {
  value: "Wycena",
  quality: "Jakość (ROE)",
  momentum: "Momentum",
  financials: "Wyniki r/r",
  potential: "Potencjał",
  risk: "Zadłużenie",
  consensus: "Rekomendacje",
  insider: "Insiderzy",
  short: "Krótkie pozycje",
  sector: "Koniunktura sektora",
  forecast: "Prognoza wzrostu",
  dividend: "Dywidenda",
  holdings: "Znaczne pakiety",
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
  fin: { pe: number | null; pbv: number | null; evEbitda: number | null; marketCap: number | null },
  qr: { roe: number | null; debtToEquity: number | null; profitMargin: number | null; peg: number | null },
): Record<string, Raw> {
  const out: Record<string, Raw> = {};
  let revGrowth: number | null = null; // dynamika przychodow firmy — do prognozy

  // Wycena: KOMPOZYT trzech miar (E/P z C/Z, EBITDA/EV z EV/EBITDA, B/P z C/WK),
  // kazda standaryzowana WZGLEDEM SEKTORA i usredniona — liczone w buildRanking.
  // Tu budujemy tylko czytelny opis; EV/EBITDA wazne dla zadluzonych spolek GPW
  // (energia, paliwa, przemysl), gdzie samo C/Z myli. PEG + kap. dla kontekstu.
  {
    const parts: string[] = [];
    if (fin.pe !== null && fin.pe > 0) parts.push(`C/Z ${fin.pe.toFixed(1)}`);
    else if (fin.pe !== null) parts.push("C/Z <0");
    if (fin.evEbitda !== null && fin.evEbitda > 0) parts.push(`EV/EBITDA ${fin.evEbitda.toFixed(1)}`);
    if (fin.pbv !== null && fin.pbv > 0) parts.push(`C/WK ${fin.pbv.toFixed(1)}`);
    if (qr.peg !== null && qr.peg > 0) parts.push(`PEG ${qr.peg.toFixed(1)}`);
    if (fin.marketCap !== null && fin.marketCap > 0) parts.push(`kap. ${(fin.marketCap / 1e9).toFixed(1)} mld`);
    // value=null tutaj — wlasciwy z-score wyliczy buildRanking z kompozytu wycen.
    out.value = { value: null, detail: parts.length ? parts.join(" · ") : "brak" };
  }

  // Jakosc: ROE (rentownosc kapitalu wlasnego). Wyzej = lepszy biznes. Sektorowo-wzglednie.
  // Marza netto pokazywana dla kontekstu. Odroznia "tania i dobra" od "taniej i slabej".
  if (qr.roe !== null) {
    const mStr = qr.profitMargin !== null ? ` · marża ${(qr.profitMargin * 100).toFixed(0)}%` : "";
    out.quality = { value: qr.roe, detail: `ROE ${(qr.roe * 100).toFixed(0)}%${mStr}` };
  } else out.quality = { value: null, detail: "brak" };

  // Ryzyko bilansu: zadluzenie (dlug/kapital). NIZSZE = bezpieczniej, wiec value = -D/E.
  // Sektorowo-wzglednie (deweloperzy/energia strukturalnie wyzej niz tech). Banki => brak.
  if (qr.debtToEquity !== null) {
    out.risk = { value: -qr.debtToEquity, detail: `D/E ${qr.debtToEquity.toFixed(0)}%` };
  } else out.risk = { value: null, detail: "brak" };

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
  sector?: string;
  marketCap?: number | null;
  /** Sredni dzienny obrot (wolumen×cena, waluta lokalna) — do filtra plynnosci. */
  turnover?: number | null;
  /** Kontrolowana przez Skarb Panstwa (ryzyko polityczne) — dyskonto GPW. */
  stateControlled?: boolean;
  /** Surowe wskazniki wyceny do kompozytu (E/P, EBITDA/EV, B/P). */
  valuation?: { pe: number | null; evEbitda: number | null; pbv: number | null };
  raw: Record<string, Raw>;
}

// Spolki GPW z dominujacym udzialem Skarbu Panstwa lub kontrola panstwowa.
// Analityk GPW stosuje dyskonto: ryzyko polityczne (skok dywidendowy, wymuszone
// inwestycje, rotacja zarzadow) — tania SOE bywa tania "slusznie" (pulapka wartosci).
const STATE_CONTROLLED = new Set(
  ["pkn", "pge", "pzu", "pko", "peo", "kgh", "jsw", "tpe", "ena", "eng", "att", "gpw", "lts", "pgn", "cez"],
);
const STATE_PENALTY = 0.12; // ~ -5 pkt na skali 0-100 (przy neutralnym x)
function isStateControlled(ticker: string): boolean {
  return STATE_CONTROLLED.has(ticker.trim().toLowerCase());
}

// Filtr plynnosci: nieplynne spolki sa zaszumione (pulapki wartosci), wiec ich
// wynik ciagniemy ku neutralnemu. Bierzemy REALNY obrot (wolumen×cena) — lepszy
// niz sama kapitalizacja (spolka moze byc duza, ale malo handlowana). Pelne
// zaufanie od ~5 mln/dzien; gdy brak obrotu, fallback na kapitalizacje (~2 mld).
const TURNOVER_FULL = 5e6;
const CAP_FULL = 2e9;
const LIQ_FLOOR = 0.65;
function liquidityMult(turnover: number | null | undefined, marketCap: number | null | undefined): number {
  if (turnover !== null && turnover !== undefined && turnover > 0) {
    return clamp(turnover / TURNOVER_FULL, LIQ_FLOOR, 1);
  }
  if (marketCap !== null && marketCap !== undefined && marketCap > 0) {
    return clamp(marketCap / CAP_FULL, LIQ_FLOOR, 1);
  }
  return 1;
}

/** Sektorowo-wzgledny z-score dla wartosci pobieranej z RankItem (fallback globalny). */
function sectorRelZ(items: RankItem[], getVal: (it: RankItem) => number | null): (number | null)[] {
  const gstat = robustStat(items.map(getVal).filter((v): v is number => v !== null && Number.isFinite(v)));
  const bySector = new Map<string, number[]>();
  for (const it of items) {
    const v = getVal(it);
    if (v === null || !Number.isFinite(v)) continue;
    const sec = it.sector ?? "Inna";
    const arr = bySector.get(sec) ?? [];
    arr.push(v);
    bySector.set(sec, arr);
  }
  const sstat = new Map<string, { med: number; scale: number }>();
  for (const [sec, vals] of bySector) {
    if (vals.length >= MIN_SECTOR_N) {
      const st = robustStat(vals);
      if (st && st.scale > 0) sstat.set(sec, st);
    }
  }
  return items.map((it) => {
    const v = getVal(it);
    if (v === null || !Number.isFinite(v)) return null;
    const st = sstat.get(it.sector ?? "Inna") ?? gstat;
    if (!st || st.scale <= 0) return 0;
    return clamp((v - st.med) / st.scale, -WINSOR, WINSOR);
  });
}

/** Odporne statystyki (mediana + skala z MAD, fallback na odch. std). */
function robustStat(vals: number[]): { med: number; scale: number } | null {
  if (vals.length < 2) return null;
  const med = median(vals);
  let scale = 1.4826 * mad(vals, med);
  if (scale === 0) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    scale = stdev(vals, mean);
  }
  return { med, scale };
}

// Wskazniki wyceny sa STRUKTURALNIE rozne miedzy branzami (banki C/Z ~8-12, tech
// ~30-50). Standaryzacja globalna karalaby tech i nagradzala banki bez zwiazku z
// realnym niedowartosciowaniem. Dlatego "value" standaryzujemy WZGLEDEM SEKTORA
// (gdy sektor ma >=3 spolki z danymi), inaczej globalnie.
// "value" jest liczone osobno (kompozyt E/P + EBITDA/EV + B/P), wiec nie ma go tu.
const SECTOR_RELATIVE = new Set(["quality", "risk"]);
const MIN_SECTOR_N = 3;

/** Naglowkowa wartosc skladowej: bez koncowki "· +0.8σ" i tylko pierwszy token
 *  (np. "C/Z 8,1", "ROE 18%") — zwiezle do wniosku, bez calego lancucha kontekstu. */
function headMetric(detail: string): string {
  const noSigma = detail.replace(/\s*·\s*[+-]?\d+(?:\.\d+)?σ(?:\s*vs sektor)?\s*$/u, "").trim();
  return noSigma.split(" · ")[0].trim();
}

const CORE_KEYS = ["value", "quality", "momentum"];

/**
 * Wniosek slowny per spolka — deterministyczny, z policzonych sigma. Bez AI.
 * Werdykt z wyniku + rdzenia (V/Q/M), najmocniejsze argumenty za/przeciw wg
 * wkladu (waga × sigma), plus ostrzezenia (malo danych / niska plynnosc).
 */
function buildConclusion(
  components: RankingComponent[],
  score: number,
  coverage: number,
  liqMult: number,
  stateControlled: boolean,
): { verdict: string; pros: string[]; cons: string[]; note: string | null } {
  const active = components.filter((c): c is RankingComponent & { score: number } => c.score !== null);
  const byContrib = [...active].sort((a, b) => b.weight * b.score - a.weight * a.score);
  const pros = byContrib.filter((c) => c.score >= 0.6).slice(0, 3).map((c) => `${c.label} (${headMetric(c.detail)})`);
  const cons = byContrib.filter((c) => c.score <= -0.6).reverse().slice(0, 3).map((c) => `${c.label} (${headMetric(c.detail)})`);

  // Rdzen V/Q/M — srednia sigma dostepnych skladowych rdzenia.
  const coreVals = CORE_KEYS.map((k) => active.find((c) => c.key === k)?.score).filter(
    (v): v is number => v !== undefined,
  );
  const coreAvg = coreVals.length ? coreVals.reduce((a, b) => a + b, 0) / coreVals.length : null;

  let band: string;
  if (score >= 68) band = "Mocny kandydat do kupna";
  else if (score >= 60) band = "Atrakcyjna";
  else if (score >= 53) band = "Umiarkowanie atrakcyjna";
  else if (score >= 47) band = "Neutralna";
  else if (score >= 40) band = "Mało atrakcyjna";
  else band = "Słaba — raczej unikać";

  let core = "";
  if (coreAvg !== null && coreVals.length >= 2) {
    if (coreAvg >= 0.4) core = " — rdzeń V/Q/M na plus";
    else if (coreAvg <= -0.4) core = " — słaby rdzeń V/Q/M";
  }
  const verdict = band + core;

  const notes: string[] = [];
  if (coverage < 0.3) notes.push("mało danych — wynik niepewny");
  if (liqMult < 0.99) notes.push("niska płynność — sygnał obniżony");
  if (stateControlled) notes.push("kontrola Skarbu Państwa — ryzyko polityczne (dyskonto)");
  return { verdict, pros, cons, note: notes.length ? notes.join(" · ") : null };
}

/** Buduje ranking z surowych sygnalow: standaryzacja przekrojowa + agregacja. */
export function buildRanking(items: RankItem[]): RankingEntry[] {
  // Statystyki odpornosciowe per skladowa (globalnie, na zbiorze spolek).
  const stat: Record<string, { med: number; scale: number } | null> = {};
  for (const key of KEYS) {
    const vals = items.map((it) => it.raw[key]?.value).filter((v): v is number => v !== null && Number.isFinite(v));
    stat[key] = robustStat(vals);
  }

  // Statystyki WEWNATRZ-SEKTOROWE dla wskaznikow sektorowo-wzglednych (wycena).
  const sectorStat: Record<string, Map<string, { med: number; scale: number }>> = {};
  for (const key of SECTOR_RELATIVE) {
    const bySector = new Map<string, number[]>();
    for (const it of items) {
      const v = it.raw[key]?.value;
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      const sec = it.sector ?? "Inna";
      const arr = bySector.get(sec) ?? [];
      arr.push(v as number);
      bySector.set(sec, arr);
    }
    const m = new Map<string, { med: number; scale: number }>();
    for (const [sec, vals] of bySector) {
      if (vals.length >= MIN_SECTOR_N) {
        const st = robustStat(vals);
        if (st && st.scale > 0) m.set(sec, st);
      }
    }
    sectorStat[key] = m;
  }

  // KOMPOZYT WYCENY: trzy miary (E/P, EBITDA/EV, B/P), kazda standaryzowana
  // sektorowo-wzglednie, usredniona po dostepnych. To analityczny standard —
  // jedna miara myli (C/Z zawodzi przy zadluzeniu; EV/EBITDA to koryguje).
  const zEP = sectorRelZ(items, (it) => (it.valuation?.pe && it.valuation.pe > 0 ? 1 / it.valuation.pe : null));
  const zEV = sectorRelZ(items, (it) => (it.valuation?.evEbitda && it.valuation.evEbitda > 0 ? 1 / it.valuation.evEbitda : null));
  const zBP = sectorRelZ(items, (it) => (it.valuation?.pbv && it.valuation.pbv > 0 ? 1 / it.valuation.pbv : null));
  const valueZ = items.map((_, i) => {
    const zs = [zEP[i], zEV[i], zBP[i]].filter((z): z is number => z !== null);
    return zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null;
  });

  const entries: RankingEntry[] = items.map((it, idx) => {
    const components: RankingComponent[] = KEYS.map((key) => {
      const raw = it.raw[key] ?? { value: null, detail: "brak" };
      const w = WEIGHTS[key];
      // Wycena: uzyj gotowego kompozytu (nie standaryzuj pojedynczej miary).
      if (key === "value") {
        const z = valueZ[idx];
        if (z === null) return { key, label: LABELS[key], score: null, weight: w, detail: raw.detail };
        const sigma = `${z >= 0 ? "+" : ""}${z.toFixed(1)}σ vs sektor`;
        return { key, label: LABELS[key], score: z, weight: w, detail: `${raw.detail} · ${sigma}` };
      }
      if (raw.value === null) return { key, label: LABELS[key], score: null, weight: w, detail: raw.detail };
      let st = stat[key];
      let relNote = "";
      if (SECTOR_RELATIVE.has(key)) {
        const ss = sectorStat[key]?.get(it.sector ?? "Inna");
        if (ss) { st = ss; relNote = " vs sektor"; }
      }
      let z = 0;
      if (st && st.scale > 0) z = clamp((raw.value - st.med) / st.scale, -WINSOR, WINSOR);
      const sigma = `${z >= 0 ? "+" : ""}${z.toFixed(1)}σ${relNote}`;
      return { key, label: LABELS[key], score: z, weight: w, detail: `${raw.detail} · ${sigma}` };
    });

    const active = components.filter((c) => c.score !== null);
    const sumActiveW = active.reduce((a, c) => a + c.weight, 0);
    const sumAllW = components.reduce((a, c) => a + c.weight, 0);
    const composite = sumActiveW > 0 ? active.reduce((a, c) => a + c.weight * (c.score as number), 0) / sumActiveW : 0;
    const confidence = sumAllW > 0 ? sumActiveW / sumAllW : 0;
    // Redukcja wg pewnosci (pokrycie) i plynnosci (obrot), oraz dyskonto SOE.
    const liq = liquidityMult(it.turnover, it.marketCap);
    const shrunk = composite * confidence * liq - (it.stateControlled ? STATE_PENALTY : 0);
    const score = Math.round(100 * normCdf(shrunk / SPREAD));
    const { verdict, pros, cons, note } = buildConclusion(components, score, confidence, liq, Boolean(it.stateControlled));
    return {
      ticker: it.ticker,
      company: it.company,
      market: it.market,
      score,
      coverage: confidence,
      components,
      verdict,
      pros,
      cons,
      note,
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

  // Notowania z cache'u bazy (zapisane przy odswiezaniu przez /api/prices/refresh)
  // — ranking NIE bije juz do Yahoo przy kazdym wejsciu. Brak wpisu => kurs null.
  const prices = await getLatestPrices();

  // Przejscie 1: sygnaly + sektor dla kazdej spolki (tylko baza, ograniczona
  // wspolbieznosc, bo kazde getCompanySignals to zestaw zapytan).
  const settled = await mapLimit(universe, 8, async (w) => {
    const signals = await getCompanySignals(w.ticker);
    const quote = prices.get(w.ticker) ?? null;
    const sector = detectSector(w.ticker, w.market, w.bankierSymbol ?? null);
    return { w, signals, quote, sector };
  });
  const fetched = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  // Koniunktura sektorow: prior strukturalny + oddolna srednia sila 3M spolek
  // danego sektora z uniwersum. Liczona RAZ, wspoldzielona przez spolki sektora.
  const climates = computeSectorClimates(fetched.map((f) => ({ sector: f.sector, r3m: f.quote?.r3m ?? null })));

  // Przejscie 2: surowe sygnaly z koniunktura sektora danej spolki.
  const items: RankItem[] = fetched.map((f) => {
    const close = f.quote?.close ?? null;
    const avgVol = f.quote?.avgVol ?? null;
    const turnover = close !== null && avgVol !== null ? close * avgVol : null;
    return {
      company: f.w.name,
      ticker: f.w.ticker,
      market: f.w.market,
      sector: f.sector,
      marketCap: f.quote?.marketCap ?? null,
      turnover,
      stateControlled: isStateControlled(f.w.ticker),
      valuation: { pe: f.quote?.pe ?? null, evEbitda: f.quote?.evEbitda ?? null, pbv: f.quote?.pbv ?? null },
      raw: rawSignals(
        f.signals,
        climates.get(f.sector) ?? null,
        close,
        f.sector,
        gdp[f.w.market] ?? null,
        { r1m: f.quote?.r1m ?? null, r3m: f.quote?.r3m ?? null },
        {
          pe: f.quote?.pe ?? null,
          pbv: f.quote?.pbv ?? null,
          evEbitda: f.quote?.evEbitda ?? null,
          marketCap: f.quote?.marketCap ?? null,
        },
        {
          roe: f.quote?.roe ?? null,
          debtToEquity: f.quote?.debtToEquity ?? null,
          profitMargin: f.quote?.profitMargin ?? null,
          peg: f.quote?.peg ?? null,
        },
      ),
    };
  });
  return { ranking: buildRanking(items), usingDb: true };
}
