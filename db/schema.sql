-- Schemat bazy dla market-dashboard.
-- Faza 0/1 uzywa tabel: watchlist, price_snapshots.
-- Pozostale tabele sa przygotowane pod kolejne fazy (2-5) planu.

CREATE TABLE IF NOT EXISTS watchlist (
  id          SERIAL PRIMARY KEY,
  ticker      TEXT NOT NULL,
  market      TEXT NOT NULL CHECK (market IN ('PL', 'US')),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
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

-- --- Tabele pod kolejne fazy (jeszcze nieuzywane) ---

CREATE TABLE IF NOT EXISTS recommendations (
  id            SERIAL PRIMARY KEY,
  ticker        TEXT NOT NULL,
  source        TEXT,
  rating        TEXT,
  price_target  NUMERIC,
  rec_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id             SERIAL PRIMARY KEY,
  ticker         TEXT NOT NULL,
  period         TEXT,
  report_type    TEXT,
  pdf_url        TEXT,
  published_at   TIMESTAMPTZ,
  extracted_json JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conclusions (
  id          SERIAL PRIMARY KEY,
  ticker      TEXT NOT NULL,
  period      TEXT,
  text        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
