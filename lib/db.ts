import { sql } from "@vercel/postgres";
import type { WatchlistItem, Market } from "./types";

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
  { ticker: "pkn", market: "PL", name: "PKN Orlen" },
  { ticker: "pko", market: "PL", name: "PKO BP" },
  { ticker: "cdr", market: "PL", name: "CD Projekt" },
  { ticker: "aapl", market: "US", name: "Apple" },
  { ticker: "msft", market: "US", name: "Microsoft" },
  { ticker: "nvda", market: "US", name: "NVIDIA" },
];

export async function initSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS watchlist (
      id          SERIAL PRIMARY KEY,
      ticker      TEXT NOT NULL,
      market      TEXT NOT NULL CHECK (market IN ('PL', 'US')),
      name        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ticker, market)
    );
  `;
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
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const { rows } = await sql<WatchlistItem>`
    SELECT id, ticker, market, name
    FROM watchlist
    ORDER BY market, name;
  `;
  return rows;
}

export async function addWatchlistItem(
  ticker: string,
  market: Market,
  name: string,
): Promise<WatchlistItem> {
  const { rows } = await sql<WatchlistItem>`
    INSERT INTO watchlist (ticker, market, name)
    VALUES (${ticker.trim().toLowerCase()}, ${market}, ${name.trim()})
    ON CONFLICT (ticker, market)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id, ticker, market, name;
  `;
  return rows[0];
}

export async function deleteWatchlistItem(id: number): Promise<void> {
  await sql`DELETE FROM watchlist WHERE id = ${id};`;
}
