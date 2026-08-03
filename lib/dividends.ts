import { hasDb, upsertDividends, getWatchlistDividends } from "./db";
import { getUniverse } from "./universe";
import type { Dividend } from "./types";

/**
 * Dywidendy spolek GPW (Faza 10).
 *
 * Zrodlo: kalendarz dywidend bankier.pl (/gielda/dywidendy) — jedna tabela z
 * cala gielda. Parsujemy wiersze i filtrujemy do spolek z watchlisty (po slugu
 * z linku). Dane: kwota na akcje, dzien ustalenia prawa (record date), dzien
 * wyplaty (payment date), stopa, status (uchwalona/proponowana), rok. Bez AI.
 */
const BASE = "https://www.bankier.pl";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, "Accept-Language": "pl-PL,pl;q=0.9" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.text();
}

function strip(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&oacute;/g, "ó")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNum(text: string): number | null {
  const c = text.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (!c || c === "-" || c === ".") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

const ISO_DATE = /(\d{4}-\d{2}-\d{2})/;

/** Parsuje tabele dywidend; zwraca wiersze dla podanych slugow watchlisty. */
export function parseDividends(
  html: string,
  slugMap: Map<string, { ticker: string; name: string }>,
): Dividend[] {
  const out: Dividend[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const slugM = row.match(/\/gielda\/notowania\/akcje\/([^/"]+)\/dywidendy/i);
    if (!slugM) continue;
    const slug = slugM[1].toUpperCase();
    const wl = slugMap.get(slug);
    if (!wl) continue; // spolka spoza watchlisty

    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/g);
    if (!cells || cells.length < 6) continue;

    // Kol. 0: nazwa + podpowiedz typu w spanie "-hint".
    const hint = cells[0].match(/-hint[^>]*>\(?([^<)]+)\)?</i);
    const dividendType = hint ? strip(hint[1]) : "Dywidenda";

    const recordDate = strip(cells[1]).match(ISO_DATE)?.[1] ?? null;
    const amountCell = strip(cells[2]);
    const amount = parseNum(amountCell);
    const currency = /zł|pln/i.test(amountCell) ? "PLN" : /eur/i.test(amountCell) ? "EUR" : null;
    const yieldPct = parseNum(strip(cells[3]));
    const status = strip(cells[4]) || null;
    const paymentDate = strip(cells[5]).match(ISO_DATE)?.[1] ?? null;
    const year = parseNum(strip(cells[cells.length - 1]));

    out.push({
      watchTicker: wl.ticker,
      company: wl.name,
      slug,
      dividendType,
      recordDate,
      paymentDate,
      amount,
      currency,
      yieldPct,
      status,
      year: year !== null ? Math.round(year) : null,
    });
  }
  return out;
}

export interface DividendRefreshSummary {
  inserted: number;
  matched: number;
  errors: string[];
  refreshedAt: string;
}

export async function refreshDividends(): Promise<DividendRefreshSummary> {
  const errors: string[] = [];
  const watchlist = await getUniverse();
  const slugMap = new Map<string, { ticker: string; name: string }>();
  for (const w of watchlist) {
    if (w.market === "PL" && w.bankierSymbol) {
      slugMap.set(w.bankierSymbol.toUpperCase(), { ticker: w.ticker, name: w.name });
    }
  }

  let matched: Dividend[] = [];
  try {
    const html = await fetchHtml(`${BASE}/gielda/dywidendy`);
    matched = parseDividends(html, slugMap);
  } catch (e) {
    errors.push(String(e).slice(0, 150));
  }

  const { inserted } = await upsertDividends(matched);
  return {
    inserted,
    matched: matched.length,
    errors,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getDividendsView(): Promise<{
  dividends: Dividend[];
  usingDb: boolean;
}> {
  if (!hasDb()) return { dividends: [], usingDb: false };
  const dividends = await getWatchlistDividends();
  return { dividends, usingDb: true };
}
