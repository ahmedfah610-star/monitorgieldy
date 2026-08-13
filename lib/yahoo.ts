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
const QUOTE_BASE = "https://query1.finance.yahoo.com/v7/finance/quote";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

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

/**
 * Wskazniki wyceny z Yahoo v7/quote: C/Z (trailingPE), C/WK (priceToBook),
 * kapitalizacja, EPS TTM. Dziala dla GPW (.WA) i USA. Endpoint v7 wymaga
 * "crumba" + ciasteczka (inaczej 401) — pobieramy je raz i cache'ujemy w pamieci.
 * Jednym zapytaniem obsluguje wiele symboli naraz.
 */
export interface Fundamentals {
  pe: number | null; // C/Z (trailingPE)
  pbv: number | null; // C/WK (priceToBook)
  marketCap: number | null;
  epsTtm: number | null;
  currency: string | null;
}

let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 30 * 60_000;

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) return crumbCache;
  try {
    const c = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(10_000),
    });
    // Node/undici: getSetCookie() zwraca tablice; fallback na polaczony naglowek.
    const jar = (c.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
    let cookie = "";
    if (jar && jar.length) cookie = jar.map((s) => s.split(";")[0]).join("; ");
    else {
      const sc = c.headers.get("set-cookie");
      if (sc) cookie = sc.split(/,(?=\s*[A-Za-z0-9_]+=)/).map((s) => s.split(";")[0]).join("; ");
    }

    const cr = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": BROWSER_UA, Cookie: cookie },
      signal: AbortSignal.timeout(10_000),
    });
    const crumb = (await cr.text()).trim();
    if (!crumb || crumb.length > 40 || crumb.includes("<")) return null;
    crumbCache = { crumb, cookie, ts: Date.now() };
    return crumbCache;
  } catch {
    return null;
  }
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function fetchFundamentals(symbols: string[]): Promise<Map<string, Fundamentals>> {
  const out = new Map<string, Fundamentals>();
  if (symbols.length === 0) return out;
  const cc = await getCrumb();
  if (!cc) return out; // brak crumba — wskazniki po prostu nie dojada (graceful)

  for (const group of chunk([...new Set(symbols)], 50)) {
    const url = `${QUOTE_BASE}?symbols=${encodeURIComponent(group.join(","))}&crumb=${encodeURIComponent(cc.crumb)}`;
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": BROWSER_UA, Cookie: cc.cookie, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401) {
        crumbCache = null; // crumb wygasl — nastepne odswiezenie sprobuje od nowa
        continue;
      }
      if (!res.ok) continue;
      const json = (await res.json()) as {
        quoteResponse?: { result?: Array<Record<string, number | string | undefined>> };
      };
      for (const r of json.quoteResponse?.result ?? []) {
        const sym = typeof r.symbol === "string" ? r.symbol : null;
        if (!sym) continue;
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
        out.set(sym, {
          pe: num(r.trailingPE),
          pbv: num(r.priceToBook),
          marketCap: num(r.marketCap),
          epsTtm: num(r.epsTrailingTwelveMonths),
          currency: typeof r.currency === "string" ? r.currency : null,
        });
      }
    } catch {
      // pomijamy grupe — reszta i tak sie zapisze
    }
  }
  return out;
}
