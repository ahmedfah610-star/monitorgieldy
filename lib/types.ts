export type Market = "PL" | "US";

export interface WatchlistItem {
  id?: number;
  ticker: string;
  market: Market;
  name: string;
}

export interface Quote {
  /** Etykieta wyswietlana (np. "PKN Orlen", "S&P 500"). */
  label: string;
  /** Ticker wpisany przez uzytkownika / symbol indeksu. */
  ticker: string;
  market: Market;
  /** Symbol uzyty w zapytaniu do zrodla danych (Yahoo Finance). */
  symbol: string;
  close: number | null;
  changePct: number | null;
  /** Waluta notowania (np. "PLN", "USD"). */
  currency: string | null;
  /** Data ostatniej sesji (YYYY-MM-DD). */
  date: string | null;
  error?: string;
}
