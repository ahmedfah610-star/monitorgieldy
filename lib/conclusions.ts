import Anthropic from "@anthropic-ai/sdk";
import { hasAnthropicKey, ANTHROPIC_MODEL } from "./extract";
import { getExtractedReports, insertConclusion } from "./db";
import type { ExtractedFinancials } from "./types";

/**
 * Faza 5 — wnioski AI porownujace okresy.
 *
 * Gdy spolka ma >=2 przeanalizowane raporty (extracted_json), zbieramy ich
 * kluczowe liczby, ukladamy w zwiezla tabele i prosimy Claude o 3-4 zdania
 * wnioskow o trendach (co sie poprawilo/pogorszylo). Wynik zapisujemy w
 * ai_conclusions.
 */

function fmt(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "b/d" : v.toLocaleString("pl-PL");
}

/** Buduje zwiezly opis liczb jednego raportu (biezacy okres). */
function line(period: string | null, f: ExtractedFinancials): string {
  const p = period ?? f.period;
  return (
    `Okres ${p} (w ${f.unit} ${f.currency}): ` +
    `przychody ${fmt(f.revenue)}, ` +
    `zysk operacyjny ${fmt(f.operatingProfit)}, ` +
    `zysk brutto ${fmt(f.grossProfit)}, ` +
    `zysk netto ${fmt(f.netProfit)}, ` +
    `EPS ${fmt(f.eps)}`
  );
}

const SYSTEM = `Jestes analitykiem finansowym. Otrzymasz kluczowe liczby z kilku kolejnych raportow okresowych jednej spolki GPW, od najnowszego do najstarszego.

Napisz 3-4 zdania wnioskow po polsku o trendach:
- co sie poprawilo, a co pogorszylo (przychody, zysk netto, rentownosc),
- kierunek i w przyblizeniu skala zmian (np. wzrost/spadek, o ile procent),
- jesli widac wyrazny trend przez kilka okresow — wskaz go.

Badz konkretny i rzeczowy, opieraj sie tylko na podanych liczbach. Nie doradzaj kupna ani sprzedazy. To narzedzie informacyjne, nie doradztwo inwestycyjne.`;

export interface ConclusionResult {
  text: string;
  period: string | null;
  basedOn: number;
}

export async function generateConclusion(ticker: string): Promise<ConclusionResult> {
  const reports = await getExtractedReports(ticker, 4);
  if (reports.length < 2) {
    throw new Error(
      "Za malo danych — potrzebne min. 2 przeanalizowane raporty (przycisk Analizuj).",
    );
  }

  const company = reports[0].company ?? ticker;
  const latestPeriod = reports[0].period ?? reports[0].extractedJson.period;
  const numbers = reports.map((r) => line(r.period, r.extractedJson)).join("\n");
  const userText = `Spolka: ${company} (${ticker}).\n\nDane (najnowszy okres pierwszy):\n${numbers}`;

  const client = new Anthropic();
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
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
  const text = textBlock?.text?.trim();
  if (!text) throw new Error("Brak odpowiedzi tekstowej z modelu.");

  await insertConclusion(ticker, latestPeriod, text, ANTHROPIC_MODEL);
  return { text, period: latestPeriod, basedOn: reports.length };
}

export { hasAnthropicKey };
