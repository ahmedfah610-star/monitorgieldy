import { sql } from "@vercel/postgres";
import { createHash } from "node:crypto";
import type { WatchlistItem, Market, Recommendation, Report } from "./types";

/**
 * Czy skonfigurowana jest baza Vercel Postgres.
 * Bez POSTGRES_URL aplikacja dziala w trybie fallback (domyslna watchlista
 * tylko do odczytu) — dzieki temu mozna odpalic dashboard lokalnie zanim
 * podepniesz baze.
 */
export function hasDb(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

/** Domyslna watchlista uzywana, gdy baza nie jest jeszcze skonfigurowana. */
export const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { ticker: "pkn", market: "PL", name: "PKN Orlen", bankierSymbol: "PKNORLEN" },
  { ticker: "pko", market: "PL", name: "PKO BP", bankierSymbol: "PKOBP" },
  { ticker: "cdr", market: "PL", name: "CD Projekt", bankierSymbol: "CDPROJEKT" },
  { ticker: "aapl", market: "US", name: "Apple", bankierSymbol: null },
  { ticker: "msft", market: "US", name: "Microsoft", bankierSymbol: null },
  { ticker: "nvda", market: "US", name: "NVIDIA", bankierSymbol: null },
];

export async function initSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS watchlist (
      id            SERIAL PRIMARY KEY,
      ticker        TEXT NOT NULL,
      market        TEXT NOT NULL CHECK (market IN ('PL', 'US')),
      name          TEXT NOT NULL,
      bankier_symbol TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ticker, market)
    );
  `;
  // Migracja dla istniejacych baz (Faza 0 nie miala tej kolumny).
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS bankier_symbol TEXT;`;

  await sql`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id          SERIAL PRIMARY KEY,
      ticker      TEXT NOT NULL,
      market      TEXT NOT NULL,
      snap_date   DATE NOT NULL,
      close       NUMERIC,
      change_pct  NUMERIC,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ticker, market, snap_date)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS recommendations (
      id             SERIAL PRIMARY KEY,
      fingerprint    TEXT NOT NULL UNIQUE,
      watch_ticker   TEXT,
      market         TEXT NOT NULL,
      source         TEXT NOT NULL,
      symbol         TEXT NOT NULL,
      company        TEXT,
      broker         TEXT,
      rating         TEXT,
      sentiment      TEXT,
      price_target   NUMERIC,
      price_at_issue NUMERIC,
      currency       TEXT,
      rec_date       DATE,
      raw            JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_rec_watch ON recommendations (watch_ticker);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rec_date ON recommendations (rec_date DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id           SERIAL PRIMARY KEY,
      fingerprint  TEXT NOT NULL UNIQUE,
      watch_ticker TEXT,
      market       TEXT NOT NULL,
      source       TEXT,
      company      TEXT,
      title        TEXT NOT NULL,
      report_type  TEXT,
      period       TEXT,
      url          TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_watch ON reports (watch_ticker);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_pub ON reports (published_at DESC);`;
}

// ---------- Watchlist ----------

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const { rows } = await sql<WatchlistItem>`
    SELECT id, ticker, market, name, bankier_symbol AS "bankierSymbol"
    FROM watchlist
    ORDER BY market, name;
  `;
  return rows;
}

export async function addWatchlistItem(
  ticker: string,
  market: Market,
  name: string,
  bankierSymbol: string | null,
): Promise<WatchlistItem> {
  const slug = bankierSymbol?.trim().toUpperCase() || null;
  const { rows } = await sql<WatchlistItem>`
    INSERT INTO watchlist (ticker, market, name, bankier_symbol)
    VALUES (${ticker.trim().toLowerCase()}, ${market}, ${name.trim()}, ${slug})
    ON CONFLICT (ticker, market)
    DO UPDATE SET name = EXCLUDED.name, bankier_symbol = EXCLUDED.bankier_symbol
    RETURNING id, ticker, market, name, bankier_symbol AS "bankierSymbol";
  `;
  return rows[0];
}

export async function deleteWatchlistItem(id: number): Promise<void> {
  await sql`DELETE FROM watchlist WHERE id = ${id};`;
}

// ---------- Recommendations ----------

function fingerprint(r: Recommendation): string {
  // Dla Finnhub (trend zbiorczy) pomijamy rating/target w kluczu, zeby jeden
  // okres = jeden wpis (liczby analitykow zmieniaja sie w trakcie miesiaca).
  const ratingPart = r.source === "finnhub" ? "" : (r.rating ?? "");
  const targetPart = r.source === "finnhub" ? "" : String(r.priceTarget ?? "");
  const key = [r.source, r.symbol, r.recDate ?? "", r.broker ?? "", ratingPart, targetPart].join("|");
  return createHash("md5").update(key).digest("hex");
}

/**
 * Zapisuje rekomendacje, pomijajac duplikaty (po fingerprincie).
 * Zwraca liczbe nowo dodanych oraz ich fingerprinty (do oznaczenia "nowe").
 */
export async function upsertRecommendations(
  recs: Recommendation[],
): Promise<{ inserted: number; newFingerprints: string[] }> {
  const newFingerprints: string[] = [];
  for (const r of recs) {
    const fp = fingerprint(r);
    const { rows } = await sql`
      INSERT INTO recommendations
        (fingerprint, watch_ticker, market, source, symbol, company, broker,
         rating, sentiment, price_target, price_at_issue, currency, rec_date, raw)
      VALUES
        (${fp}, ${r.watchTicker}, ${r.market}, ${r.source}, ${r.symbol}, ${r.company},
         ${r.broker}, ${r.rating}, ${r.sentiment}, ${r.priceTarget}, ${r.priceAtIssue},
         ${r.currency}, ${r.recDate}, ${JSON.stringify(r)}::jsonb)
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING id;
    `;
    if (rows.length > 0) newFingerprints.push(fp);
  }
  return { inserted: newFingerprints.length, newFingerprints };
}

const REC_COLUMNS = `
  watch_ticker AS "watchTicker", market, source, symbol, company, broker,
  rating, sentiment, price_target::float8 AS "priceTarget",
  price_at_issue::float8 AS "priceAtIssue", currency,
  to_char(rec_date, 'YYYY-MM-DD') AS "recDate"
`;

/** Rekomendacje dopasowane do watchlisty (watch_ticker ustawiony). */
export async function getWatchlistRecommendations(limit = 60): Promise<Recommendation[]> {
  const { rows } = await sql.query<Recommendation>(
    `SELECT ${REC_COLUMNS}
     FROM recommendations
     WHERE watch_ticker IS NOT NULL
     ORDER BY rec_date DESC NULLS LAST, created_at DESC
     LIMIT $1;`,
    [limit],
  );
  return rows;
}

/** Najnowszy feed rynkowy z bankiera (watch_ticker NULL). */
export async function getMarketRecommendations(limit = 20): Promise<Recommendation[]> {
  const { rows } = await sql.query<Recommendation>(
    `SELECT ${REC_COLUMNS}
     FROM recommendations
     WHERE watch_ticker IS NULL AND source = 'bankier'
     ORDER BY rec_date DESC NULLS LAST, created_at DESC
     LIMIT $1;`,
    [limit],
  );
  return rows;
}

// ---------- Reports (raporty okresowe) ----------

/**
 * Zapisuje raporty, pomijajac duplikaty (fingerprint = md5 z URL komunikatu).
 * Zwraca liczbe nowo dodanych.
 */
export async function upsertReports(
  reports: Report[],
): Promise<{ inserted: number; newUrls: string[] }> {
  const newUrls: string[] = [];
  for (const r of reports) {
    const fp = createHash("md5").update(r.url).digest("hex");
    const { rows } = await sql`
      INSERT INTO reports
        (fingerprint, watch_ticker, market, source, company, title, report_type,
         period, url, published_at)
      VALUES
        (${fp}, ${r.watchTicker}, ${r.market}, ${r.source}, ${r.company}, ${r.title},
         ${r.reportType}, ${r.period}, ${r.url}, ${r.publishedAt})
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING id;
    `;
    if (rows.length > 0) newUrls.push(r.url);
  }
  return { inserted: newUrls.length, newUrls };
}

export async function getWatchlistReports(limit = 60): Promise<Report[]> {
  const { rows } = await sql.query<Report>(
    `SELECT
       watch_ticker AS "watchTicker", market, source, company, title,
       report_type AS "reportType", period, url,
       to_char(published_at, 'YYYY-MM-DD"T"HH24:MI') AS "publishedAt"
     FROM reports
     WHERE watch_ticker IS NOT NULL
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1;`,
    [limit],
  );
  return rows;
}
