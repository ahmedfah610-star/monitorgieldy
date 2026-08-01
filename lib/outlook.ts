import Anthropic from "@anthropic-ai/sdk";
import { hasAnthropicKey, ANTHROPIC_MODEL } from "./extract";
import {
  hasDb,
  getWatchlist,
  getCompanySignals,
  insertOutlook,
  getOutlook,
  getLatestOutlooks,
  type CompanySignals,
} from "./db";
import type { CompanyOutlook, ExtractedFinancials } from "./types";

/**
 * Perspektywy spolki (Faza 12) — analiza AI ugruntowana w zebranych sygnalach.
 *
 * Skladamy zwiezly kontekst ze WSZYSTKICH danych, ktore juz mamy dla spolki
 * (wyniki, rekomendacje, insiderzy, shorty, znaczne pakiety, dywidendy) i prosimy
 * Claude o atuty obecne, szanse i zagrozenia na przyszlosc. Wynik jest
 * cache'owany w bazie — ponowna analiza tylko na wyrazne zadanie (oszczednosc
 * tokenow).
 */

function fmt(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "b/d" : v.toLocaleString("pl-PL");
}

function financialsBlock(f: CompanySignals["financials"]): string {
  if (f.length === 0) return "Wyniki finansowe: brak przeanalizowanych raportow.";
  const lines = f.map((r) => {
    const x: ExtractedFinancials = r.extractedJson;
    return `- ${r.period ?? x.period} (w ${x.unit} ${x.currency}): przychody ${fmt(x.revenue)} (poprz. ${fmt(x.revenuePrior)}), zysk netto ${fmt(x.netProfit)} (poprz. ${fmt(x.netProfitPrior)}), EPS ${fmt(x.eps)}`;
  });
  return `Wyniki finansowe (od najnowszego):\n${lines.join("\n")}`;
}

function recsBlock(recs: CompanySignals["recommendations"]): string {
  if (recs.length === 0) return "Rekomendacje analitykow: brak.";
  const pos = recs.filter((r) => r.sentiment === "positive").length;
  const neu = recs.filter((r) => r.sentiment === "neutral").length;
  const neg = recs.filter((r) => r.sentiment === "negative").length;
  const targets = recs.map((r) => r.priceTarget).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = targets.length ? targets[Math.floor((targets.length - 1) / 2)] : null;
  return `Rekomendacje analitykow (${recs.length}): Kupuj ${pos} / Trzymaj ${neu} / Sprzedaj ${neg}${median !== null ? `, mediana ceny docelowej ${fmt(median)}` : ""}.`;
}

function insiderBlock(ins: CompanySignals["insider"]): string {
  if (ins.length === 0) return "Transakcje insiderow (art. 19 MAR): brak.";
  const lines = ins.slice(0, 6).map((t) => {
    const dir = t.txType === "nabycie" ? "KUPNO" : t.txType === "zbycie" ? "SPRZEDAZ" : "transakcja";
    const val = t.value !== null ? `~${fmt(t.value)} ${t.currency ?? ""}` : "";
    return `- ${t.txDate ?? t.publishedAt?.slice(0, 10) ?? "?"}: ${dir} ${t.person ?? "os. zarzadzajaca"}${t.role ? ` (${t.role})` : ""} ${val}`.trim();
  });
  return `Transakcje osob zarzadzajacych (najnowsze):\n${lines.join("\n")}`;
}

function shortsBlock(shorts: CompanySignals["shorts"]): string {
  if (shorts.length === 0) return "Krotkie pozycje (KNF): brak zgloszonych >=0,5%.";
  const latest = new Map<string, (typeof shorts)[number]>();
  for (const s of shorts) {
    const prev = latest.get(s.holder);
    if (!prev || (s.positionDate ?? "") > (prev.positionDate ?? "")) latest.set(s.holder, s);
  }
  const cur = [...latest.values()];
  const total = cur.reduce((a, s) => a + (s.netShortPct ?? 0), 0);
  const list = cur
    .sort((a, b) => (b.netShortPct ?? 0) - (a.netShortPct ?? 0))
    .slice(0, 5)
    .map((s) => `${s.holder} ${fmt(s.netShortPct)}% (${s.positionDate ?? "?"})`)
    .join("; ");
  return `Krotkie pozycje netto (KNF), lacznie ~${total.toFixed(2)}%: ${list}.`;
}

function holdingsBlock(h: CompanySignals["holdings"]): string {
  if (h.length === 0) return "Znaczne pakiety (art. 69): brak.";
  const lines = h.slice(0, 5).map((n) => {
    const dir = n.direction === "increase" ? "wejscie/zwiekszenie" : n.direction === "decrease" ? "wyjscie/zmniejszenie" : "zmiana";
    const thr = Array.isArray(n.thresholds) && n.thresholds.length ? ` progi ${n.thresholds.join("/")}%` : "";
    return `- ${n.publishedAt?.slice(0, 10) ?? "?"}: ${dir}${thr}${n.holder ? ` — ${n.holder}` : ""}${n.pctAfter !== null ? ` (po: ${fmt(n.pctAfter)}%)` : ""}`;
  });
  return `Znaczne pakiety akcji (art. 69):\n${lines.join("\n")}`;
}

function dividendsBlock(d: CompanySignals["dividends"]): string {
  if (d.length === 0) return "Dywidendy: brak w kalendarzu.";
  const lines = d.slice(0, 4).map(
    (x) => `- ${x.year ?? "?"}: ${fmt(x.amount)} ${x.currency ?? ""}/akcje${x.yieldPct !== null ? ` (stopa ${fmt(x.yieldPct)}%)` : ""}, ${x.status ?? ""}`,
  );
  return `Dywidendy (ostatnie):\n${lines.join("\n")}`;
}

export function buildContext(company: string, ticker: string, s: CompanySignals): string {
  return [
    `Spolka: ${company} (ticker ${ticker.toUpperCase()}), GPW.`,
    financialsBlock(s.financials),
    recsBlock(s.recommendations),
    insiderBlock(s.insider),
    shortsBlock(s.shorts),
    holdingsBlock(s.holdings),
    dividendsBlock(s.dividends),
  ].join("\n\n");
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    currentStrengths: { type: "array", items: { type: "string" } },
    futureOpportunities: { type: "array", items: { type: "string" } },
    futureThreats: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["currentStrengths", "futureOpportunities", "futureThreats", "summary"],
};

const SYSTEM = `Jestes analitykiem rynku akcji GPW. Otrzymasz zebrane sygnaly o spolce: wyniki finansowe, konsensus rekomendacji, transakcje osob zarzadzajacych (insiderzy), krotkie pozycje netto (kto gra na spadek), znaczne pakiety akcji (wejscia/wyjscia funduszy) oraz dywidendy.

Na tej podstawie oraz na podstawie ogolnie znanych, publicznych faktow o spolce i jej branzy przygotuj perspektywy po polsku w formacie JSON:
- "currentStrengths": atuty i mocne strony OBECNIE (2-5 punktow),
- "futureOpportunities": szanse i katalizatory na PRZYSZLOSC (2-5 punktow),
- "futureThreats": zagrozenia i ryzyka na PRZYSZLOSC (2-5 punktow),
- "summary": 2-3 zdania syntezy.

Zasady:
- Kazdy punkt konkretny, jedno zdanie, po polsku. Gdy to mozliwe, powolaj sie na sygnal (np. "insiderzy dokupuja", "fundusz X zwiekszyl short do 2%", "spadek zysku netto r/r").
- Opieraj sie na podanych sygnalach; gdy danych malo, korzystaj z ogolnej wiedzy o spolce/branzy i zaznacz niepewnosc.
- Nie zmyslaj konkretnych liczb, ktorych nie ma w danych.
- To narzedzie informacyjne, NIE doradztwo inwestycyjne. Nie zalecaj wprost kupna ani sprzedazy.`;

export interface OutlookResult {
  outlook: CompanyOutlook;
  cached: boolean;
}

/** Zwraca perspektywy z cache (bez tokenow) albo generuje nowe (force=regeneruj). */
export async function generateOutlook(ticker: string, force = false): Promise<OutlookResult> {
  if (!force) {
    const cached = await getOutlook(ticker);
    if (cached) return { outlook: cached, cached: true };
  }

  // Generowanie wymaga klucza (samo oddanie z cache — nie).
  if (!hasAnthropicKey()) throw new Error("NO_API_KEY");

  const watchlist = await getWatchlist();
  const item = watchlist.find((w) => w.ticker === ticker);
  const company = item?.name ?? ticker;

  const signals = await getCompanySignals(ticker);
  const userText = buildContext(company, ticker, signals);

  const client = new Anthropic();
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await client.messages.create(body as any);
  if (resp.stop_reason === "refusal") throw new Error("Model odmowil analizy (refusal).");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textBlock = (resp.content as any[]).find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("Brak odpowiedzi tekstowej z modelu.");

  const parsed = JSON.parse(textBlock.text) as CompanyOutlook;
  await insertOutlook(ticker, parsed, ANTHROPIC_MODEL);
  return {
    outlook: { ...parsed, model: ANTHROPIC_MODEL, createdAt: new Date().toISOString() },
    cached: false,
  };
}

export async function getOutlookView(): Promise<{
  outlooks: Record<string, CompanyOutlook>;
  usingDb: boolean;
}> {
  if (!hasDb()) return { outlooks: {}, usingDb: false };
  const outlooks = await getLatestOutlooks();
  return { outlooks, usingDb: true };
}

export { hasAnthropicKey };
