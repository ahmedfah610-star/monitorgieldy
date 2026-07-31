export type Market = "PL" | "US";

export interface WatchlistItem {
  id?: number;
  ticker: string;
  market: Market;
  name: string;
  /** Slug bankier.pl dla rynku PL (np. "CDPROJEKT", "PKNORLEN"). Pozwala pobrac
   *  rekomendacje danej spolki. Null dla US / gdy nieustawiony. */
  bankierSymbol?: string | null;
}

export type Sentiment = "positive" | "neutral" | "negative";

export type ReportType = "kwartalny" | "polroczny" | "roczny" | "inny";

export interface Report {
  id?: number;
  /** Ticker z watchlisty, do ktorego raport jest dopasowany. */
  watchTicker: string | null;
  market: Market;
  /** Zrodlo komunikatu: 'espi' | 'ebi'. */
  source: string;
  company: string | null;
  title: string;
  reportType: ReportType;
  /** Okres raportu z tytulu, np. "QSr 1/2026", "RR 2025". */
  period: string | null;
  /** Link do komunikatu (wejscie do tresci raportu — uzyte w Fazie 4). */
  url: string;
  /** Data publikacji (ISO, np. "2026-05-28T17:33"). */
  publishedAt: string | null;
  /** Wyekstrahowane dane finansowe (Faza 4). Null dopoki nie przeanalizowano. */
  extractedJson?: ExtractedFinancials | null;
}

/** Ustrukturyzowane liczby wyciagniete z raportu przez Claude (Faza 4). */
export interface ExtractedFinancials {
  period: string;
  comparativePeriod: string | null;
  currency: string;
  unit: string;
  revenue: number | null;
  revenuePrior: number | null;
  operatingProfit: number | null;
  operatingProfitPrior: number | null;
  grossProfit: number | null;
  grossProfitPrior: number | null;
  netProfit: number | null;
  netProfitPrior: number | null;
  ebitda: number | null;
  eps: number | null;
  epsPrior: number | null;
  /** 1-2 zdania podsumowania po polsku (napisane przez Claude). */
  summary: string;
}

export interface Recommendation {
  id?: number;
  /** Ticker z watchlisty, do ktorego rekomendacja jest dopasowana (null = feed rynkowy). */
  watchTicker: string | null;
  market: Market;
  source: "bankier" | "finnhub";
  /** Slug bankiera (PL) lub ticker (US). */
  symbol: string;
  company: string | null;
  /** Dom maklerski / instytucja (PL). Null dla US (trend zbiorczy). */
  broker: string | null;
  rating: string | null;
  sentiment: Sentiment | null;
  priceTarget: number | null;
  priceAtIssue: number | null;
  currency: string | null;
  /** Data wydania (YYYY-MM-DD). */
  recDate: string | null;
  /** Czy pozycja jest nowa od ostatniego odswiezenia (ustawiane przez /refresh). */
  isNew?: boolean;
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
