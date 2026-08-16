import Anthropic from "@anthropic-ai/sdk";
import {
  hasDb, getLatestPrices, upsertSectorAnalysis, getSectorAnalyses,
  ensureSectorAnalysisSchema, type SectorAnalysisRow,
} from "./db";
import { getUniverse, mapLimit } from "./universe";
import { detectSector } from "./sectors";
import { computeSectorClimates, type SectorClimate } from "./sectorClimate";
import { hasAnthropicKey, ANTHROPIC_MODEL } from "./extract";

/**
 * Analiza AI koniunktury sektora (Faza 23).
 *
 * Dla kazdego sektora zbieramy TWARDE dane (koniunktura zywa, momentum 3M/1M,
 * szerokosc rynku, srednie ROE / C/Z / EV/EBITDA, liczba spolek) i przekazujemy je
 * do modelu, ktory wysnuwa: zalety, zagrozenia, ocene atrakcyjnosci 0-100 i krotki
 * werdykt. Uzytkownik widzi OBIE warstwy — liczby ("co zlozylo sie na ocene") oraz
 * interpretacje AI. Wynik cache'owany w bazie; generowany na zadanie (oszczedza tokeny).
 */

export interface SectorContext {
  sector: string;
  members: number;
  companies: string[];
  climate100: number; // koniunktura 0-100
  mom3m: number | null;
  mom1m: number | null;
  breadth: number | null;
  avgRoe: number | null;
  avgPe: number | null;
  avgEvEbitda: number | null;
  note: string;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Zbiera kontekst ilosciowy per sektor z uniwersum + cache'u notowan. */
export async function gatherSectorContext(): Promise<SectorContext[]> {
  const [universe, prices] = await Promise.all([getUniverse(), getLatestPrices()]);
  const rows = universe.map((w) => ({
    sector: detectSector(w.ticker, w.market, w.bankierSymbol ?? null),
    name: w.name,
    q: prices.get(w.ticker) ?? null,
  }));

  const climates = computeSectorClimates(
    rows.map((r) => ({ sector: r.sector, r1m: r.q?.r1m ?? null, r3m: r.q?.r3m ?? null })),
  );

  const bySector = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = bySector.get(r.sector) ?? [];
    arr.push(r);
    bySector.set(r.sector, arr);
  }

  const out: SectorContext[] = [];
  for (const [sector, members] of bySector) {
    if (members.length < 2 || sector === "Inna") continue;
    const c: SectorClimate | undefined = climates.get(sector);
    out.push({
      sector,
      members: members.length,
      companies: members.map((m) => m.name).slice(0, 12),
      climate100: c ? Math.round((c.climate + 1) * 50) : 50,
      mom3m: c?.mom3m ?? null,
      mom1m: c?.mom1m ?? null,
      breadth: c?.breadth ?? null,
      avgRoe: mean(members.map((m) => m.q?.roe).filter((v): v is number => v != null)),
      avgPe: mean(members.map((m) => m.q?.pe).filter((v): v is number => v != null && v > 0)),
      avgEvEbitda: mean(members.map((m) => m.q?.evEbitda).filter((v): v is number => v != null && v > 0)),
      note: c?.note ?? "",
    });
  }
  out.sort((a, b) => b.climate100 - a.climate100);
  return out;
}

/** Buduje liste sterownikow ("co zlozylo sie na ocene") do zapisu i wyswietlenia. */
function driversOf(c: SectorContext): { label: string; value: string }[] {
  const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
  return [
    { label: "Koniunktura (żywa)", value: `${c.climate100}/100` },
    { label: "Momentum 3M (śr.)", value: pct(c.mom3m) },
    { label: "Momentum 1M (śr.)", value: pct(c.mom1m) },
    { label: "Szerokość rynku", value: c.breadth == null ? "—" : `${Math.round(c.breadth * 100)}% na plusie` },
    { label: "Śr. ROE", value: c.avgRoe == null ? "—" : `${(c.avgRoe * 100).toFixed(0)}%` },
    { label: "Śr. C/Z", value: c.avgPe == null ? "—" : c.avgPe.toFixed(1) },
    { label: "Śr. EV/EBITDA", value: c.avgEvEbitda == null ? "—" : c.avgEvEbitda.toFixed(1) },
    { label: "Spółek w próbie", value: String(c.members) },
  ];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    attractiveness: { type: "number" },
    verdict: { type: "string" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    threats: { type: "array", items: { type: "string" } },
  },
  required: ["attractiveness", "verdict", "summary", "strengths", "threats"],
};

const SYSTEM = `Jesteś analitykiem rynku akcji GPW. Oceniasz KONIUNKTURĘ danego sektora na dziś na podstawie podanych twardych danych (koniunktura żywa 0-100, momentum kursów 3M/1M, szerokość rynku, średnie ROE / C/Z / EV/EBITDA, spółki).

Zwróć:
- "attractiveness": liczba 0-100 — ocena atrakcyjności sektora do inwestowania NA DZIŚ (spójna z danymi: mocne momentum + zdrowe fundamenty + rozsądna wycena = wyżej).
- "verdict": 2-4 słowa (np. "Atrakcyjny", "Neutralny z ryzykiem", "Do unikania").
- "summary": 1-2 zdania po polsku — synteza sytuacji sektora.
- "strengths": 2-4 konkretne ZALETY sektora (krótkie, po polsku, oparte na danych + wiedzy o rynku).
- "threats": 2-4 konkretne ZAGROŻENIA / ryzyka (krótkie, po polsku).

Bądź konkretny i osadzony w polskich realiach (np. stopy procentowe, ceny surowców, regulacje, Skarb Państwa). To narzędzie informacyjne, nie doradztwo inwestycyjne.`;

async function analyzeOne(c: SectorContext): Promise<Omit<SectorAnalysisRow, "updatedAt">> {
  const client = new Anthropic();
  const ctx =
    `Sektor: ${c.sector}\n` +
    `Koniunktura żywa: ${c.climate100}/100\n` +
    `Momentum 3M (śr.): ${c.mom3m == null ? "b/d" : (c.mom3m * 100).toFixed(1) + "%"}\n` +
    `Momentum 1M (śr.): ${c.mom1m == null ? "b/d" : (c.mom1m * 100).toFixed(1) + "%"}\n` +
    `Szerokość rynku: ${c.breadth == null ? "b/d" : Math.round(c.breadth * 100) + "% spółek na plusie 3M"}\n` +
    `Średnie ROE: ${c.avgRoe == null ? "b/d" : (c.avgRoe * 100).toFixed(0) + "%"}\n` +
    `Średnie C/Z: ${c.avgPe == null ? "b/d" : c.avgPe.toFixed(1)}\n` +
    `Średnie EV/EBITDA: ${c.avgEvEbitda == null ? "b/d" : c.avgEvEbitda.toFixed(1)}\n` +
    `Spółki (${c.members}): ${c.companies.join(", ")}\n` +
    `Kontekst strukturalny: ${c.note}`;

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: ctx }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await client.messages.create(body as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textBlock = (resp.content as any[]).find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("Brak odpowiedzi modelu.");
  const parsed = JSON.parse(textBlock.text) as {
    attractiveness: number; verdict: string; summary: string; strengths: string[]; threats: string[];
  };
  return {
    sector: c.sector,
    attractiveness: Math.max(0, Math.min(100, Math.round(parsed.attractiveness))),
    verdict: parsed.verdict,
    summary: parsed.summary,
    strengths: parsed.strengths.slice(0, 4),
    threats: parsed.threats.slice(0, 4),
    drivers: driversOf(c),
    model: ANTHROPIC_MODEL,
  };
}

export interface SectorAnalysisSummary {
  analyzed: number;
  failed: number;
  needsKey: boolean;
  errors: string[];
  refreshedAt: string;
}

/** Generuje analizy AI dla wszystkich sektorow (z danymi) i zapisuje do bazy. */
export async function generateSectorAnalyses(): Promise<SectorAnalysisSummary> {
  if (!hasAnthropicKey()) {
    return { analyzed: 0, failed: 0, needsKey: true, errors: [], refreshedAt: new Date().toISOString() };
  }
  await ensureSectorAnalysisSchema();
  const contexts = await gatherSectorContext();
  const errors: string[] = [];
  let analyzed = 0;
  let failed = 0;

  const settled = await mapLimit(contexts, 4, (c) => analyzeOne(c));
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      await upsertSectorAnalysis(r.value);
      analyzed += 1;
    } else {
      failed += 1;
      errors.push(`${contexts[i].sector}: ${String(r.reason).slice(0, 120)}`);
    }
  }
  return { analyzed, failed, needsKey: false, errors, refreshedAt: new Date().toISOString() };
}

/** Widok: kontekst ilosciowy (zawsze) + analizy AI z cache'u (gdy sa). */
export async function getSectorAnalysisView(): Promise<{
  sectors: (SectorContext & { ai: SectorAnalysisRow | null })[];
  usingDb: boolean;
}> {
  if (!hasDb()) return { sectors: [], usingDb: false };
  await ensureSectorAnalysisSchema();
  const [contexts, ai] = await Promise.all([gatherSectorContext(), getSectorAnalyses()]);
  const sectors = contexts.map((c) => ({ ...c, ai: ai[c.sector] ?? null }));
  return { sectors, usingDb: true };
}
