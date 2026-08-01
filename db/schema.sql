-- Schemat bazy dla market-dashboard.
-- Faza 0/1 uzywa tabel: watchlist, price_snapshots.
-- Pozostale tabele sa przygotowane pod kolejne fazy (2-5) planu.

CREATE TABLE IF NOT EXISTS watchlist (
  id             SERIAL PRIMARY KEY,
  ticker         TEXT NOT NULL,
  market         TEXT NOT NULL CHECK (market IN ('PL', 'US')),
  name           TEXT NOT NULL,
  bankier_symbol TEXT,                 -- slug bankier.pl dla rekomendacji PL (Faza 2)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker, market)
);

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

-- Rekomendacje analitykow (Faza 2). fingerprint sluzy do dedup i wykrywania nowych.
CREATE TABLE IF NOT EXISTS recommendations (
  id             SERIAL PRIMARY KEY,
  fingerprint    TEXT NOT NULL UNIQUE,
  watch_ticker   TEXT,                 -- dopasowanie do watchlisty (NULL = feed rynkowy)
  market         TEXT NOT NULL,
  source         TEXT NOT NULL,        -- 'bankier' | 'finnhub'
  symbol         TEXT NOT NULL,        -- slug bankiera (PL) lub ticker (US)
  company        TEXT,
  broker         TEXT,                 -- dom maklerski (PL) / NULL (US)
  rating         TEXT,
  sentiment      TEXT,                 -- 'positive' | 'neutral' | 'negative'
  price_target   NUMERIC,
  price_at_issue NUMERIC,
  currency       TEXT,
  rec_date       DATE,
  raw            JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_watch ON recommendations (watch_ticker);
CREATE INDEX IF NOT EXISTS idx_rec_date ON recommendations (rec_date DESC);

-- Raporty okresowe wykryte z komunikatow ESPI/EBI (Faza 3).
-- fingerprint = md5(url) do dedup i wykrywania nowych.
CREATE TABLE IF NOT EXISTS reports (
  id             SERIAL PRIMARY KEY,
  fingerprint    TEXT NOT NULL UNIQUE,
  watch_ticker   TEXT,
  market         TEXT NOT NULL,
  source         TEXT,                 -- 'espi' | 'ebi'
  company        TEXT,
  title          TEXT NOT NULL,
  report_type    TEXT,                 -- 'kwartalny' | 'polroczny' | 'roczny' | 'inny'
  period         TEXT,                 -- np. "QSr 1/2026", "RR/2025"
  url            TEXT NOT NULL,        -- link do komunikatu (wejscie do tresci raportu)
  published_at   TIMESTAMPTZ,
  extracted_json JSONB,                -- wyekstrahowane liczby przez Claude (Faza 4)
  extracted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_watch ON reports (watch_ticker);
CREATE INDEX IF NOT EXISTS idx_reports_pub ON reports (published_at DESC);

-- Wnioski AI porownujace okresy (Faza 5).
CREATE TABLE IF NOT EXISTS ai_conclusions (
  id          SERIAL PRIMARY KEY,
  ticker      TEXT NOT NULL,
  period      TEXT,
  text        TEXT NOT NULL,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_concl_ticker ON ai_conclusions (ticker, created_at DESC);

-- Transakcje osob zarzadzajacych — art. 19 MAR (Faza 7). Parsowane z PDF, bez AI.
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
CREATE INDEX IF NOT EXISTS idx_insider_watch ON insider_transactions (watch_ticker);
CREATE INDEX IF NOT EXISTS idx_insider_date ON insider_transactions (tx_date DESC);

-- Krotkie pozycje netto z rejestru KNF (Faza 8). Czyste dane z JSON API KNF.
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
CREATE INDEX IF NOT EXISTS idx_short_watch ON short_positions (watch_ticker);
CREATE INDEX IF NOT EXISTS idx_short_date ON short_positions (position_date DESC);

-- Znaczne pakiety akcji — zawiadomienia art. 69 (Faza 9).
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
CREATE INDEX IF NOT EXISTS idx_holdings_watch ON significant_holdings (watch_ticker);
CREATE INDEX IF NOT EXISTS idx_holdings_pub ON significant_holdings (published_at DESC);

-- Dywidendy — historyczne i zapowiedziane (Faza 10). Zrodlo: kalendarz bankier.pl.
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
CREATE INDEX IF NOT EXISTS idx_div_watch ON dividends (watch_ticker);
CREATE INDEX IF NOT EXISTS idx_div_record ON dividends (record_date DESC);
