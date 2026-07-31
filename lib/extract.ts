import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFinancials } from "./types";

/**
 * Faza 4 — ekstrakcja liczb z raportu okresowego przez Claude.
 *
 * Pobieramy strone komunikatu bankiera (link zapisany w reports.url), czyscimy
 * HTML tak, by tabela "WYBRANE DANE FINANSOWE" zachowala kolumny (komorki
 * rozdzielone " | "), wycinamy okolice tej tabeli i wysylamy do Claude z
 * wymuszonym schematem JSON (output_config.format). Claude radzi sobie z roznymi
 * formatami raportow lepiej niz sztywne parsowanie.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Model konfigurowalny przez env; domyslnie tani i szybki Haiku. */
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, "Accept-Language": "pl-PL,pl;q=0.9" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.text();
}

/** Zamienia HTML na tekst zachowujac granice komorek/wierszy tabeli. */
export function htmlToText(html: string): string {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(tr|p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ");
  t = t
    .split("\n")
    .map((line) => line.replace(/\s*\|\s*(\|\s*)+/g, " | ").replace(/^\s*\|\s*$/g, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  return t.trim();
}

/**
 * Wycina okolice tabeli WYBRANE DANE FINANSOWE. Rozne spolki maja rozne nazwy
 * pierwszego wiersza (np. "Przychody ze sprzedazy", "Przychody z tytulu umow"),
 * wiec kotwiczymy odpornie: najpierw pierwszy numerowany wiersz "I. Przychod...",
 * potem szersze warianty, na koncu "Zysk (strata) netto".
 */
export function relevantSection(text: string): string {
  const anchors: RegExp[] = [
    /I+\.\s*Przychod/i, // pierwszy numerowany wiersz tabeli WYBRANE DANE
    /Przychody (ze sprzeda|z tytu|netto|z dzia|z umow)/i,
    /Zysk \(strata\) netto|Zysk netto z dzia|Zysk netto/i,
  ];
  let start = -1;
  for (const a of anchors) {
    const m = text.search(a);
    if (m >= 0) {
      start = m;
      break;
    }
  }
  if (start < 0) start = 0;
  return text.slice(Math.max(0, start - 400), start + 4300);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    period: { type: "string" },
    comparativePeriod: { type: ["string", "null"] },
    currency: { type: "string" },
    unit: { type: "string" },
    revenue: { type: ["number", "null"] },
    revenuePrior: { type: ["number", "null"] },
    operatingProfit: { type: ["number", "null"] },
    operatingProfitPrior: { type: ["number", "null"] },
    grossProfit: { type: ["number", "null"] },
    grossProfitPrior: { type: ["number", "null"] },
    netProfit: { type: ["number", "null"] },
    netProfitPrior: { type: ["number", "null"] },
    ebitda: { type: ["number", "null"] },
    eps: { type: ["number", "null"] },
    epsPrior: { type: ["number", "null"] },
    summary: { type: "string" },
  },
  required: [
    "period", "comparativePeriod", "currency", "unit",
    "revenue", "revenuePrior", "operatingProfit", "operatingProfitPrior",
    "grossProfit", "grossProfitPrior", "netProfit", "netProfitPrior",
    "ebitda", "eps", "epsPrior", "summary",
  ],
};

const SYSTEM = `Jestes analitykiem finansowym. Z podanego fragmentu raportu okresowego spolki GPW wyodrebnij kluczowe liczby z tabeli "WYBRANE DANE FINANSOWE".

Zasady:
- Tabela ma zwykle 4 kolumny liczbowe: biezacy okres i okres porownawczy w walucie sprawozdania (PLN), a potem te same wartosci w EUR. Bierz WARTOSCI W WALUCIE SPRAWOZDANIA (PLN) - czyli pierwsza (biezacy) i druga (porownawczy) kolumna liczbowa.
- "operatingProfit" = zysk na dzialalnosci operacyjnej / zysk operacyjny (EBIT). "grossProfit" = zysk przed opodatkowaniem / zysk brutto. "netProfit" = zysk netto. "revenue" = przychody ze sprzedazy. "eps" = zysk netto na jedna akcje.
- Jesli EBITDA nie jest podana wprost, zwroc null (nie licz jej samodzielnie).
- Liczby zwroc jako liczby (np. "191 107" -> 191107; "-1 162" -> -1162; "1,06" -> 1.06). Brak pozycji -> null.
- "unit" to jednostka liczb (najczesciej "tys." albo "mln"). "currency" np. "PLN".
- "period" i "comparativePeriod" to opisy okresow z naglowka (np. "Q1 2026", "Q1 2025").
- "summary": 1-2 zdania po polsku o wyniku i zmianie rok do roku (np. przychody i zysk netto vs okres porownawczy).

To narzedzie informacyjne, nie doradztwo inwestycyjne.`;

export async function extractFinancials(
  text: string,
  context: { company: string; period: string; ticker: string },
): Promise<ExtractedFinancials> {
  const section = relevantSection(text);
  const client = new Anthropic();

  const userText =
    `Spolka: ${context.company} (${context.ticker}). Raport: ${context.period}.\n\n` +
    `Fragment raportu:\n${section}`;

  // output_config nie jest jeszcze w typach SDK 0.115 — przekazujemy przez any.
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await client.messages.create(body as any);

  if (resp.stop_reason === "refusal") {
    throw new Error("Model odmowil analizy (refusal).");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textBlock = (resp.content as any[]).find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("Brak odpowiedzi tekstowej z modelu.");

  return JSON.parse(textBlock.text) as ExtractedFinancials;
}

/** Pobiera strone komunikatu i wyciaga dane finansowe. */
export async function extractFromUrl(
  url: string,
  context: { company: string; period: string; ticker: string },
): Promise<ExtractedFinancials> {
  const html = await fetchHtml(url);
  const text = htmlToText(html);
  return extractFinancials(text, context);
}
