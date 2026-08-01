import { sql } from "@vercel/postgres";
import { createHash } from "node:crypto";
import type {
  WatchlistItem,
  Market,
  Recommendation,
  Report,
  ExtractedFinancials,
  Conclusion,
  InsiderTransaction,
  ShortPosition,
  HoldingNotification,
  Dividend,
  CompanyOutlook,
  PortfolioPosition,
  MarketMacro,
} from "./types";

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
      extracted_json JSONB,
      extracted_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  // Migracja dla baz utworzonych przed Faza 4.
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS extracted_json JSONB;`;
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_watch ON reports (watch_ticker);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_pub ON reports (published_at DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id           SERIAL PRIMARY KEY,
      fingerprint  TEXT NOT NULL UNIQUE,
      watch_ticker TEXT,
      company      TEXT,
      person       TEXT,
      role         TEXT,
      tx_type      TEXT,
      instrument   TEXT,
      volume       NUMERIC,
      price        NUMERIC,
      currency     TEXT,
      value        NUMERIC,
      tx_date      DATE,
      url          TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_insider_watch ON insider_transactions (watch_ticker);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_insider_date ON insider_transactions (tx_date DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS short_positions (
      id            SERIAL PRIMARY KEY,
      fingerprint   TEXT NOT NULL UNIQUE,
      watch_ticker  TEXT,
      company       TEXT,
      issuer_name   TEXT NOT NULL,
      isin          TEXT,
      holder        TEXT NOT NULL,
      net_short_pct NUMERIC,
      position_date DATE,
      modify_date   DATE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_short_watch ON short_positions (watch_ticker);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_short_date ON short_positions (position_date DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS significant_holdings (
      id           SERIAL PRIMARY KEY,
      fingerprint  TEXT NOT NULL UNIQUE,
      watch_ticker TEXT,
      company      TEXT,
      holder       TEXT,
      direction    TEXT NOT NULL,
      thresholds   JSONB,
      pct_after    NUMERIC,
      title        TEXT NOT NULL,
      url          TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_holdings_watch ON significant_holdings (watch_ticker);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_holdings_pub ON significant_holdings (published_at DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS dividends (
      id            SERIAL PRIMARY KEY,
      fingerprint   TEXT NOT NULL UNIQUE,
      watch_ticker  TEXT,
      company       TEXT,
      slug          TEXT NOT NULL,
      dividend_type TEXT,
      record_date   DATE,
      payment_date  DATE,
      amount        NUMERIC,
      currency      TEXT,
      yield_pct     NUMERIC,
      status        TEXT,
      year          INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_div_watch ON dividends (watch_ticker);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_div_record ON dividends (record_date DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS ai_conclusions (
      id          SERIAL PRIMARY KEY,
      ticker      TEXT NOT NULL,
      period      TEXT,
      text        TEXT NOT NULL,
      model       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_concl_ticker ON ai_conclusions (ticker, created_at DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS company_outlook (
      id          SERIAL PRIMARY KEY,
      ticker      TEXT NOT NULL,
      outlook     JSONB NOT NULL,
      model       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_outlook_ticker ON company_outlook (ticker, created_at DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS macro_snapshot (
      market     TEXT PRIMARY KEY CHECK (market IN ('PL', 'US')),
      score_raw  NUMERIC NOT NULL,
      payload    JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS portfolio (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      ticker     TEXT NOT NULL,
      market     TEXT NOT NULL CHECK (market IN ('PL', 'US')),
      amount     NUMERIC NOT NULL,
      currency   TEXT NOT NULL CHECK (currency IN ('PLN', 'USD')),
      sector     TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
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

/**
 * Usuwa pozycje z watchlisty i KASKADOWO wszystkie jej dane (raporty, shorty,
 * insiderzy, pakiety, dywidendy, rekomendacje, wnioski, notowania) — tak by
 * usunieta spolka zniknela ze wszystkich widokow. Jesli ten sam ticker jest
 * jeszcze na watchliscie na innym rynku, powiazanych danych nie ruszamy.
 */
export async function deleteWatchlistItem(id: number): Promise<void> {
  const { rows } = await sql<{ ticker: string }>`SELECT ticker FROM watchlist WHERE id = ${id};`;
  await sql`DELETE FROM watchlist WHERE id = ${id};`;
  const ticker = rows[0]?.ticker;
  if (!ticker) return;

  const { rows: still } = await sql`SELECT 1 FROM watchlist WHERE ticker = ${ticker} LIMIT 1;`;
  if (still.length > 0) return; // ten sam ticker nadal obserwowany (inny rynek)

  await sql`DELETE FROM recommendations WHERE watch_ticker = ${ticker};`;
  await sql`DELETE FROM reports WHERE watch_ticker = ${ticker};`;
  await sql`DELETE FROM insider_transactions WHERE watch_ticker = ${ticker};`;
  await sql`DELETE FROM short_positions WHERE watch_ticker = ${ticker};`;
  await sql`DELETE FROM significant_holdings WHERE watch_ticker = ${ticker};`;
  await sql`DELETE FROM dividends WHERE watch_ticker = ${ticker};`;
  await sql`DELETE FROM ai_conclusions WHERE ticker = ${ticker};`;
  await sql`DELETE FROM price_snapshots WHERE ticker = ${ticker};`;
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
       to_char(published_at, 'YYYY-MM-DD"T"HH24:MI') AS "publishedAt",
       extracted_json AS "extractedJson"
     FROM reports
     WHERE watch_ticker IS NOT NULL
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1;`,
    [limit],
  );
  return rows;
}

/** Zapisuje wynik ekstrakcji AI dla raportu (po URL). Zwraca kontekst raportu. */
interface ReportContext {
  watchTicker: string | null;
  company: string | null;
  period: string | null;
  /** Wczesniejsza ekstrakcja z bazy (null = raport jeszcze nieanalizowany). */
  extractedJson?: ExtractedFinancials | null;
}

export async function updateReportExtraction(
  url: string,
  extracted: object,
): Promise<ReportContext | null> {
  const { rows } = await sql<ReportContext>`
    UPDATE reports
    SET extracted_json = ${JSON.stringify(extracted)}::jsonb, extracted_at = now()
    WHERE url = ${url}
    RETURNING watch_ticker AS "watchTicker", company, period;
  `;
  return rows[0] ?? null;
}

/**
 * Pobiera kontekst raportu (spolka/okres/ticker) po URL — do ekstrakcji.
 * Zwraca tez wczesniejsza ekstrakcje (extracted_json), by mozna bylo oddac
 * wynik z pamieci zamiast ponownie wolac API.
 */
export async function getReportContext(url: string): Promise<ReportContext | null> {
  const { rows } = await sql<ReportContext>`
    SELECT watch_ticker AS "watchTicker", company, period,
           extracted_json AS "extractedJson"
    FROM reports WHERE url = ${url} LIMIT 1;
  `;
  return rows[0] ?? null;
}

// ---------- Transakcje insiderow (art. 19 MAR) ----------

/** Odcisk wiersza: URL komunikatu + kluczowe pola transakcji (dedup). */
function insiderFingerprint(t: InsiderTransaction): string {
  const key =
    t.volume === null && t.price === null && t.txDate === null
      ? `${t.url}|event`
      : [t.url, t.txDate ?? "", t.volume ?? "", t.price ?? "", t.person ?? ""].join("|");
  return createHash("md5").update(key).digest("hex");
}

/** Zapisuje transakcje insiderow, pomijajac duplikaty (po fingerprincie). */
export async function upsertInsiderTransactions(
  txs: InsiderTransaction[],
): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const t of txs) {
    const fp = insiderFingerprint(t);
    const { rows } = await sql`
      INSERT INTO insider_transactions
        (fingerprint, watch_ticker, company, person, role, tx_type, instrument,
         volume, price, currency, value, tx_date, url, published_at)
      VALUES
        (${fp}, ${t.watchTicker}, ${t.company}, ${t.person}, ${t.role}, ${t.txType},
         ${t.instrument}, ${t.volume}, ${t.price}, ${t.currency}, ${t.value},
         ${t.txDate}, ${t.url}, ${t.publishedAt})
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING id;
    `;
    if (rows.length > 0) inserted += 1;
  }
  return { inserted };
}

/** Distinct URL-e komunikatow juz przetworzonych — by nie pobierac PDF ponownie. */
export async function getExistingInsiderUrls(): Promise<string[]> {
  const { rows } = await sql<{ url: string }>`
    SELECT DISTINCT url FROM insider_transactions;
  `;
  return rows.map((r) => r.url);
}

/** Transakcje insiderow dla watchlisty, najnowsze wg daty transakcji. */
export async function getWatchlistInsiderTransactions(
  limit = 80,
): Promise<InsiderTransaction[]> {
  const { rows } = await sql.query<InsiderTransaction>(
    `SELECT
       watch_ticker AS "watchTicker", company, person, role,
       tx_type AS "txType", instrument,
       volume::float8 AS "volume", price::float8 AS "price", currency,
       value::float8 AS "value",
       to_char(tx_date, 'YYYY-MM-DD') AS "txDate", url,
       to_char(published_at, 'YYYY-MM-DD"T"HH24:MI') AS "publishedAt"
     FROM insider_transactions
     ORDER BY tx_date DESC NULLS LAST, published_at DESC NULLS LAST, created_at DESC
     LIMIT $1;`,
    [limit],
  );
  return rows;
}

// ---------- Krotkie pozycje netto (rejestr KNF, Faza 8) ----------

function shortFingerprint(s: ShortPosition): string {
  const key = [s.holder, s.issuerName, s.positionDate ?? "", s.netShortPct ?? ""].join("|");
  return createHash("md5").update(key).digest("hex");
}

/** Zapisuje pozycje krotkie, pomijajac duplikaty (po fingerprincie). */
export async function upsertShortPositions(
  positions: ShortPosition[],
): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const s of positions) {
    const fp = shortFingerprint(s);
    const { rows } = await sql`
      INSERT INTO short_positions
        (fingerprint, watch_ticker, company, issuer_name, isin, holder,
         net_short_pct, position_date, modify_date)
      VALUES
        (${fp}, ${s.watchTicker}, ${s.company}, ${s.issuerName}, ${s.isin}, ${s.holder},
         ${s.netShortPct}, ${s.positionDate}, ${s.modifyDate})
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING id;
    `;
    if (rows.length > 0) inserted += 1;
  }
  return { inserted };
}

/** Pozycje krotkie dla watchlisty, najnowsze wg daty obliczenia pozycji. */
export async function getWatchlistShortPositions(limit = 200): Promise<ShortPosition[]> {
  const { rows } = await sql.query<ShortPosition>(
    `SELECT
       watch_ticker AS "watchTicker", company, issuer_name AS "issuerName", isin, holder,
       net_short_pct::float8 AS "netShortPct",
       to_char(position_date, 'YYYY-MM-DD') AS "positionDate",
       to_char(modify_date, 'YYYY-MM-DD') AS "modifyDate"
     FROM short_positions
     ORDER BY position_date DESC NULLS LAST, created_at DESC
     LIMIT $1;`,
    [limit],
  );
  return rows;
}

// ---------- Znaczne pakiety akcji — art. 69 (Faza 9) ----------

/** Zapisuje zawiadomienia o znacznych pakietach, pomijajac duplikaty (po URL). */
export async function upsertHoldingNotifications(
  notes: HoldingNotification[],
): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const n of notes) {
    const fp = createHash("md5").update(n.url).digest("hex");
    const { rows } = await sql`
      INSERT INTO significant_holdings
        (fingerprint, watch_ticker, company, holder, direction, thresholds,
         pct_after, title, url, published_at)
      VALUES
        (${fp}, ${n.watchTicker}, ${n.company}, ${n.holder}, ${n.direction},
         ${JSON.stringify(n.thresholds)}::jsonb, ${n.pctAfter}, ${n.title}, ${n.url},
         ${n.publishedAt})
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING id;
    `;
    if (rows.length > 0) inserted += 1;
  }
  return { inserted };
}

export async function getExistingHoldingUrls(): Promise<string[]> {
  const { rows } = await sql<{ url: string }>`SELECT url FROM significant_holdings;`;
  return rows.map((r) => r.url);
}

export async function getWatchlistHoldings(limit = 100): Promise<HoldingNotification[]> {
  const { rows } = await sql.query<HoldingNotification>(
    `SELECT
       watch_ticker AS "watchTicker", company, holder, direction,
       thresholds AS "thresholds", pct_after::float8 AS "pctAfter", title, url,
       to_char(published_at, 'YYYY-MM-DD"T"HH24:MI') AS "publishedAt"
     FROM significant_holdings
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1;`,
    [limit],
  );
  return rows;
}

// ---------- Dywidendy (Faza 10) ----------

/** Tozsamosc dywidendy: spolka + rok + typ (mutowalne pola aktualizujemy). */
function dividendFingerprint(d: Dividend): string {
  const key = [d.slug, d.year ?? "", d.dividendType ?? ""].join("|");
  return createHash("md5").update(key).digest("hex");
}

/**
 * Zapisuje dywidendy; przy powtorce (ta sama spolka/rok/typ) AKTUALIZUJE daty,
 * kwote, stope i status — bo dywidenda przechodzi z "proponowana" w "uchwalona"
 * i dochodza daty. Zwraca liczbe nowo dodanych.
 */
export async function upsertDividends(dividends: Dividend[]): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const d of dividends) {
    const fp = dividendFingerprint(d);
    const { rows } = await sql`
      INSERT INTO dividends
        (fingerprint, watch_ticker, company, slug, dividend_type, record_date,
         payment_date, amount, currency, yield_pct, status, year)
      VALUES
        (${fp}, ${d.watchTicker}, ${d.company}, ${d.slug}, ${d.dividendType}, ${d.recordDate},
         ${d.paymentDate}, ${d.amount}, ${d.currency}, ${d.yieldPct}, ${d.status}, ${d.year})
      ON CONFLICT (fingerprint) DO UPDATE SET
        record_date = EXCLUDED.record_date,
        payment_date = EXCLUDED.payment_date,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        yield_pct = EXCLUDED.yield_pct,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING (xmax = 0) AS inserted;
    `;
    if (rows[0]?.inserted) inserted += 1;
  }
  return { inserted };
}

/** Dywidendy dla watchlisty; najblizsze/najnowsze wg daty ustalenia prawa. */
export async function getWatchlistDividends(limit = 200): Promise<Dividend[]> {
  const { rows } = await sql.query<Dividend>(
    `SELECT
       watch_ticker AS "watchTicker", company, slug,
       dividend_type AS "dividendType",
       to_char(record_date, 'YYYY-MM-DD') AS "recordDate",
       to_char(payment_date, 'YYYY-MM-DD') AS "paymentDate",
       amount::float8 AS "amount", currency, yield_pct::float8 AS "yieldPct",
       status, year
     FROM dividends
     ORDER BY record_date DESC NULLS LAST, year DESC NULLS LAST
     LIMIT $1;`,
    [limit],
  );
  return rows;
}

// ---------- Wnioski AI (Faza 5) ----------

export interface ExtractedReportRow {
  period: string | null;
  company: string | null;
  extractedJson: ExtractedFinancials;
}

/** Przeanalizowane raporty danej spolki (z extracted_json), najnowsze pierwsze. */
export async function getExtractedReports(
  ticker: string,
  limit = 4,
): Promise<ExtractedReportRow[]> {
  const { rows } = await sql.query<ExtractedReportRow>(
    `SELECT period, company, extracted_json AS "extractedJson"
     FROM reports
     WHERE watch_ticker = $1 AND extracted_json IS NOT NULL
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $2;`,
    [ticker, limit],
  );
  return rows;
}

export async function insertConclusion(
  ticker: string,
  period: string | null,
  text: string,
  model: string,
): Promise<void> {
  await sql`
    INSERT INTO ai_conclusions (ticker, period, text, model)
    VALUES (${ticker}, ${period}, ${text}, ${model});
  `;
}

/** Najnowszy wniosek AI dla kazdej spolki (mapa ticker -> wniosek). */
export async function getLatestConclusions(): Promise<Record<string, Conclusion>> {
  const { rows } = await sql<Conclusion & { ticker: string }>`
    SELECT DISTINCT ON (ticker)
      ticker, period, text,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI') AS "createdAt"
    FROM ai_conclusions
    ORDER BY ticker, created_at DESC;
  `;
  const map: Record<string, Conclusion> = {};
  for (const r of rows) map[r.ticker] = { period: r.period, text: r.text, createdAt: r.createdAt };
  return map;
}

// ---------- Perspektywy spolki (Faza 12) ----------

/** Kompletny zestaw zebranych sygnalow dla jednej spolki — kontekst dla AI. */
export interface CompanySignals {
  financials: ExtractedReportRow[];
  recommendations: Recommendation[];
  insider: InsiderTransaction[];
  shorts: ShortPosition[];
  holdings: HoldingNotification[];
  dividends: Dividend[];
}

/** Zbiera wszystkie sygnaly danej spolki (po tickerze) do analizy perspektyw. */
export async function getCompanySignals(ticker: string): Promise<CompanySignals> {
  const [financials, recs, insider, shorts, holdings, dividends] = await Promise.all([
    getExtractedReports(ticker, 4),
    sql.query<Recommendation>(
      `SELECT ${REC_COLUMNS} FROM recommendations WHERE watch_ticker = $1
       ORDER BY rec_date DESC NULLS LAST, created_at DESC LIMIT 10;`,
      [ticker],
    ),
    sql.query<InsiderTransaction>(
      `SELECT watch_ticker AS "watchTicker", company, person, role, tx_type AS "txType",
        instrument, volume::float8 AS "volume", price::float8 AS "price", currency,
        value::float8 AS "value", to_char(tx_date,'YYYY-MM-DD') AS "txDate", url,
        to_char(published_at,'YYYY-MM-DD"T"HH24:MI') AS "publishedAt"
       FROM insider_transactions WHERE watch_ticker = $1
       ORDER BY tx_date DESC NULLS LAST, created_at DESC LIMIT 8;`,
      [ticker],
    ),
    sql.query<ShortPosition>(
      `SELECT watch_ticker AS "watchTicker", company, issuer_name AS "issuerName", isin, holder,
        net_short_pct::float8 AS "netShortPct", to_char(position_date,'YYYY-MM-DD') AS "positionDate",
        to_char(modify_date,'YYYY-MM-DD') AS "modifyDate"
       FROM short_positions WHERE watch_ticker = $1
       ORDER BY position_date DESC NULLS LAST LIMIT 15;`,
      [ticker],
    ),
    sql.query<HoldingNotification>(
      `SELECT watch_ticker AS "watchTicker", company, holder, direction, thresholds AS "thresholds",
        pct_after::float8 AS "pctAfter", title, url,
        to_char(published_at,'YYYY-MM-DD"T"HH24:MI') AS "publishedAt"
       FROM significant_holdings WHERE watch_ticker = $1
       ORDER BY published_at DESC NULLS LAST LIMIT 6;`,
      [ticker],
    ),
    sql.query<Dividend>(
      `SELECT watch_ticker AS "watchTicker", company, slug, dividend_type AS "dividendType",
        to_char(record_date,'YYYY-MM-DD') AS "recordDate", to_char(payment_date,'YYYY-MM-DD') AS "paymentDate",
        amount::float8 AS "amount", currency, yield_pct::float8 AS "yieldPct", status, year
       FROM dividends WHERE watch_ticker = $1
       ORDER BY record_date DESC NULLS LAST LIMIT 6;`,
      [ticker],
    ),
  ]);
  return {
    financials,
    recommendations: recs.rows,
    insider: insider.rows,
    shorts: shorts.rows,
    holdings: holdings.rows,
    dividends: dividends.rows,
  };
}

/** Zapisuje wygenerowane perspektywy spolki. */
export async function insertOutlook(
  ticker: string,
  outlook: CompanyOutlook,
  model: string,
): Promise<void> {
  await sql`
    INSERT INTO company_outlook (ticker, outlook, model)
    VALUES (${ticker}, ${JSON.stringify(outlook)}::jsonb, ${model});
  `;
}

/** Najnowsze perspektywy danej spolki (albo null). */
export async function getOutlook(ticker: string): Promise<CompanyOutlook | null> {
  const { rows } = await sql<{ outlook: CompanyOutlook; model: string; createdAt: string }>`
    SELECT outlook, model, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI') AS "createdAt"
    FROM company_outlook WHERE ticker = ${ticker}
    ORDER BY created_at DESC LIMIT 1;
  `;
  if (rows.length === 0) return null;
  return { ...rows[0].outlook, model: rows[0].model, createdAt: rows[0].createdAt };
}

/** Najnowsze perspektywy dla kazdej spolki (mapa ticker -> outlook). */
export async function getLatestOutlooks(): Promise<Record<string, CompanyOutlook>> {
  const { rows } = await sql<{ ticker: string; outlook: CompanyOutlook; model: string; createdAt: string }>`
    SELECT DISTINCT ON (ticker) ticker, outlook, model,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI') AS "createdAt"
    FROM company_outlook
    ORDER BY ticker, created_at DESC;
  `;
  const map: Record<string, CompanyOutlook> = {};
  for (const r of rows) map[r.ticker] = { ...r.outlook, model: r.model, createdAt: r.createdAt };
  return map;
}

// ---------- Portfel (Faza 14) ----------

/** Kurs USD->PLN uzyty do przeliczen (staly, wg zalozenia). */
export const USD_PLN = 3.75;

export async function getPortfolio(): Promise<PortfolioPosition[]> {
  const { rows } = await sql<PortfolioPosition & { amount: number }>`
    SELECT id, name, ticker, market, amount::float8 AS amount, currency, sector
    FROM portfolio
    ORDER BY created_at DESC;
  `;
  return rows.map((r) => ({
    ...r,
    amountPln: r.currency === "USD" ? r.amount * USD_PLN : r.amount,
  }));
}

export async function addPortfolioPosition(
  p: Omit<PortfolioPosition, "id" | "amountPln">,
): Promise<PortfolioPosition> {
  const { rows } = await sql<PortfolioPosition & { amount: number }>`
    INSERT INTO portfolio (name, ticker, market, amount, currency, sector)
    VALUES (${p.name}, ${p.ticker}, ${p.market}, ${p.amount}, ${p.currency}, ${p.sector})
    RETURNING id, name, ticker, market, amount::float8 AS amount, currency, sector;
  `;
  const r = rows[0];
  return { ...r, amountPln: r.currency === "USD" ? r.amount * USD_PLN : r.amount };
}

export async function deletePortfolioPosition(id: number): Promise<void> {
  await sql`DELETE FROM portfolio WHERE id = ${id};`;
}

// ---------- Koniunktura makro (Faza 15) ----------

export async function upsertMacro(m: MarketMacro): Promise<void> {
  await sql`
    INSERT INTO macro_snapshot (market, score_raw, payload, updated_at)
    VALUES (${m.market}, ${m.scoreRaw}, ${JSON.stringify(m)}::jsonb, now())
    ON CONFLICT (market) DO UPDATE SET
      score_raw = EXCLUDED.score_raw,
      payload = EXCLUDED.payload,
      updated_at = now();
  `;
}

/** Zapisane makro dla obu rynkow (mapa 'PL'|'US' -> MarketMacro). */
export async function getMacroSnapshots(): Promise<Record<string, MarketMacro>> {
  const { rows } = await sql<{ market: string; payload: MarketMacro; updatedAt: string }>`
    SELECT market, payload, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI') AS "updatedAt"
    FROM macro_snapshot;
  `;
  const map: Record<string, MarketMacro> = {};
  for (const r of rows) map[r.market] = { ...r.payload, updatedAt: r.updatedAt };
  return map;
}

/** Wynik klimatu w [-1,1] per rynek — dla rankingu (null gdy brak). */
export async function getMacroScores(): Promise<Record<string, number | null>> {
  const { rows } = await sql<{ market: string; scoreRaw: number }>`
    SELECT market, score_raw::float8 AS "scoreRaw" FROM macro_snapshot;
  `;
  const map: Record<string, number | null> = { PL: null, US: null };
  for (const r of rows) map[r.market] = r.scoreRaw;
  return map;
}
