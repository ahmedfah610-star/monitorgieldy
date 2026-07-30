import type { Market } from "./types";

/**
 * Zrodlo notowan: Yahoo Finance chart API (JSON, bez klucza, obsluguje GPW i USA).
 *
 * Dlaczego nie Stooq (jak w pierwotnym planie)? Stooq w 2026 dodal ochrone
 * antybotowa (JS proof-of-work) na endpointach CSV — przestaly dzialac bez
 * przegladarki wykonujacej JS. Yahoo `chart` jest keyless i pokrywa oba rynki:
 *   - USA:  ticker jak jest (AAPL, MSFT), indeksy ^GSPC / ^IXIC
 *   - GPW:  ticker + sufiks .WA (PKN.WA, CDR.WA, WIG20.WA)
 *
 * Zwraca biezaca cene i poprzednie zamkniecie, z ktorych liczymy zmiane dzienna.
 */
const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

/** Buduje symbol Yahoo na podstawie tickera i rynku. */
export function toYahooSymbol(ticker: string, market: Market): string {
  const t = ticker.trim().toUpperCase();
  if (market === "PL") return t.endsWith(".WA") ? t : `${t}.WA`;
  return t; // US: ticker bez sufiksu
}

export interface QuoteResult {
  close: number | null;
  changePct: number | null;
  date: string | null;
  currency: string | null;
  error?: string;
}

function epochToDate(sec: number | undefined): string | null {
  if (!sec || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export async function fetchQuote(symbol: string): Promise<QuoteResult> {
  const url = `${CHART_BASE}${encodeURIComponent(symbol)}?range=5d&interval=1d`;

  let json: unknown;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        // Yahoo odrzuca zapytania bez sensownego User-Agent.
        "User-Agent": "Mozilla/5.0 (market-dashboard, personal use)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { close: null, changePct: null, date: null, currency: null, error: `HTTP ${res.status}` };
    }
    json = await res.json();
  } catch (e) {
    return {
      close: null,
      changePct: null,
      date: null,
      currency: null,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }

  const chart = (json as { chart?: { result?: unknown[]; error?: { description?: string } } }).chart;
  if (!chart || chart.error) {
    return {
      close: null,
      changePct: null,
      date: null,
      currency: null,
      error: chart?.error?.description ?? "no data",
    };
  }

  const result = chart.result?.[0] as
    | { meta?: Record<string, number | string | undefined> }
    | undefined;
  const meta = result?.meta;
  if (!meta) {
    return { close: null, changePct: null, date: null, currency: null, error: "no meta" };
  }

  const close =
    typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
  const prevClose =
    typeof meta.chartPreviousClose === "number"
      ? meta.chartPreviousClose
      : typeof meta.previousClose === "number"
        ? meta.previousClose
        : null;

  const changePct =
    close !== null && prevClose !== null && prevClose !== 0
      ? ((close - prevClose) / prevClose) * 100
      : null;

  return {
    close,
    changePct,
    date: epochToDate(meta.regularMarketTime as number | undefined),
    currency: (meta.currency as string) ?? null,
  };
}
