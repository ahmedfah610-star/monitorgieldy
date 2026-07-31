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
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- extracted_json (Faza 4) dojdzie przy ekstrakcji danych z raportu
);
CREATE INDEX IF NOT EXISTS idx_reports_watch ON reports (watch_ticker);
CREATE INDEX IF NOT EXISTS idx_reports_pub ON reports (published_at DESC);

-- --- Tabele pod kolejne fazy (jeszcze nieuzywane) ---

CREATE TABLE IF NOT EXISTS ai_conclusions (
  id          SERIAL PRIMARY KEY,
  ticker      TEXT NOT NULL,
  period      TEXT,
  text        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
