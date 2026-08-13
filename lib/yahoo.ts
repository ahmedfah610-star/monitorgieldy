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
 * Zwraca biezaca cene, poprzednie zamkniecie (zmiana dzienna) oraz momentum:
 * stopy zwrotu za ~1 i ~3 miesiace liczone z historii dziennej (range=6mo).
 * Momentum to jedyny sygnal rankingu, ktory zmienia sie codziennie razem z kursem.
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
  r1m: number | null; // stopa zwrotu za ~21 sesji (ulamek), null gdy brak historii
  r3m: number | null; // stopa zwrotu za ~63 sesje (ulamek)
  error?: string;
}

/** Stopa zwrotu: ostatnie zamkniecie vs zamkniecie sprzed `back` sesji. */
function trailingReturn(closes: number[], back: number): number | null {
  const n = closes.length;
  if (n < back + 1) return null;
  const now = closes[n - 1];
  const past = closes[n - 1 - back];
  if (!Number.isFinite(now) || !Number.isFinite(past) || past === 0) return null;
  return now / past - 1;
}

function epochToDate(sec: number | undefined): string | null {
  if (!sec || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export async function fetchQuote(symbol: string): Promise<QuoteResult> {
  // 6mo historii dziennej — starcza na biezacy kurs, zmiane dzienna i momentum 1M/3M.
  const url = `${CHART_BASE}${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
  const empty: QuoteResult = { close: null, changePct: null, date: null, currency: null, r1m: null, r3m: null };

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
    if (!res.ok) return { ...empty, error: `HTTP ${res.status}` };
    json = await res.json();
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "fetch failed" };
  }

  const chart = (json as { chart?: { result?: unknown[]; error?: { description?: string } } }).chart;
  if (!chart || chart.error) return { ...empty, error: chart?.error?.description ?? "no data" };

  const result = chart.result?.[0] as
    | {
        meta?: Record<string, number | string | undefined>;
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }
    | undefined;
  const meta = result?.meta;
  if (!meta) return { ...empty, error: "no meta" };

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

  // Momentum z serii zamkniec (odfiltrowane luki/nulle, kolejnosc chronologiczna).
  const rawCloses = result?.indicators?.quote?.[0]?.close ?? [];
  const closes = rawCloses.filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const r1m = trailingReturn(closes, 21);
  const r3m = trailingReturn(closes, 63);

  return {
    close,
    changePct,
    date: epochToDate(meta.regularMarketTime as number | undefined),
    currency: (meta.currency as string) ?? null,
    r1m,
    r3m,
  };
}
