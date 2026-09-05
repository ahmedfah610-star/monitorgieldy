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

/**
 * Transakcja osoby zarzadzajacej (art. 19 MAR) — sygnal insiderski.
 * Zrodlo: komunikaty ESPI (bankier.pl). Parsowana kodem, bez AI.
 */
export interface InsiderTransaction {
  id?: number;
  /** Ticker z watchlisty, do ktorego transakcja jest dopasowana. */
  watchTicker: string | null;
  company: string | null;
  /** Osoba pelniaca obowiazki zarzadcze (PDMR). */
  person: string | null;
  /** Funkcja / powiazanie (np. "Prezes Zarzadu", "Osoba blisko zwiazana"). */
  role: string | null;
  /** Kierunek: 'nabycie' (kupno), 'zbycie' (sprzedaz) lub 'inne'. */
  txType: "nabycie" | "zbycie" | "inne" | null;
  /** Instrument (np. "akcje", "obligacje"). */
  instrument: string | null;
  volume: number | null;
  price: number | null;
  currency: string | null;
  /** Laczna wartosc transakcji (volume*price, gdy policzalne). */
  value: number | null;
  /** Data transakcji (YYYY-MM-DD). */
  txDate: string | null;
  /** Link do komunikatu ESPI. */
  url: string;
  /** Data publikacji komunikatu (ISO). */
  publishedAt: string | null;
}

/**
 * Krotka pozycja netto z rejestru KNF (Faza 8). Zrodlo: publiczny JSON API
 * rss.knf.gov.pl. Pokazuje kto (fundusz) gra na spadek danej spolki.
 */
export interface ShortPosition {
  id?: number;
  /** Ticker z watchlisty dopasowany po symbolu (ISSUER_NAME KNF). */
  watchTicker: string | null;
  company: string | null;
  /** Nazwa/symbol emitenta wg KNF (np. "CDPROJEKT", "JSW"). */
  issuerName: string;
  isin: string | null;
  /** Posiadacz pozycji krotkiej (fundusz/instytucja). */
  holder: string;
  /** Pozycja krotka netto w procentach kapitalu. */
  netShortPct: number | null;
  /** Data obliczenia pozycji (YYYY-MM-DD). */
  positionDate: string | null;
  /** Data ostatniej aktualizacji wpisu w rejestrze (YYYY-MM-DD). */
  modifyDate: string | null;
}

/**
 * Zawiadomienie o znacznym pakiecie akcji — art. 69 ustawy o ofercie (Faza 9).
 * Wejscia/wyjscia funduszy (progi 5/10/…%). Zrodlo: komunikaty ESPI (bankier).
 */
export interface HoldingNotification {
  id?: number;
  watchTicker: string | null;
  company: string | null;
  /** Podmiot zglaszajacy (best-effort z tresci; moze byc null). */
  holder: string | null;
  /** Kierunek zmiany: 'increase' (przekroczenie w gore), 'decrease', 'other'. */
  direction: "increase" | "decrease" | "other";
  /** Progi wymienione w tytule, np. [5] albo [5,10]. */
  thresholds: number[];
  /** Udzial w glosach po transakcji, jesli dalo sie odczytac (%). */
  pctAfter: number | null;
  title: string;
  url: string;
  publishedAt: string | null;
}

/**
 * Dywidenda spolki (Faza 10). Zrodlo: kalendarz dywidend bankier.pl.
 * Historyczne i zapowiedziane, z dniem ustalenia prawa i dniem wyplaty.
 */
export interface Dividend {
  id?: number;
  watchTicker: string | null;
  company: string | null;
  /** Symbol/slug bankier (np. "CDPROJEKT"). */
  slug: string;
  /** Typ, np. "Dywidenda", "Dywidenda zaliczkowa", "Projekt". */
  dividendType: string | null;
  /** Dzien ustalenia prawa do dywidendy (record date, YYYY-MM-DD). */
  recordDate: string | null;
  /** Dzien wyplaty (payment date, YYYY-MM-DD). */
  paymentDate: string | null;
  /** Kwota na akcje. */
  amount: number | null;
  currency: string | null;
  /** Stopa dywidendy w %. */
  yieldPct: number | null;
  /** Status: "uchwalona" | "proponowana" | "projekt" itd. */
  status: string | null;
  /** Rok, za ktory wyplacana jest dywidenda. */
  year: number | null;
}

/**
 * Perspektywy spolki (Faza 12) — analiza AI ugruntowana we wszystkich zebranych
 * sygnalach (wyniki, rekomendacje, insiderzy, shorty, pakiety, dywidendy).
 */
export interface CompanyOutlook {
  currentStrengths: string[];
  futureOpportunities: string[];
  futureThreats: string[];
  summary: string;
  /** Model uzyty do analizy. */
  model?: string;
  /** Kiedy wygenerowano (ISO). */
  createdAt?: string;
}

/**
 * Skladowa rankingu atrakcyjnosci (Faza 13). score w [-1,1]: >0 pozytywna,
 * <0 negatywna, null = brak danych dla tej spolki.
 */
export interface RankingComponent {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  detail: string;
}

/** Pozycja w wewnetrznym rankingu atrakcyjnosci spolki. */
export interface RankingEntry {
  ticker: string;
  company: string;
  market: Market;
  /** Wynik laczny 0-100 (50 = neutralnie). */
  score: number;
  /** Udzial skladowych, ktore mialy dane (0-1). */
  coverage: number;
  components: RankingComponent[];
  /** Krotki werdykt slowny (np. "Mocny kandydat do kupna"). */
  verdict: string;
  /** Najmocniejsze argumenty ZA (label + wartosc). */
  pros: string[];
  /** Najmocniejsze argumenty PRZECIW. */
  cons: string[];
  /** Ostrzezenie (malo danych / niska plynnosc) albo null. */
  note: string | null;
}

/** Pozycja w portfelu (Faza 14). Kwota w PLN lub USD (USD przeliczane po 3,75). */
export interface PortfolioPosition {
  id?: number;
  name: string;
  ticker: string;
  market: Market;
  /** Wielkosc pozycji w walucie wpisanej. */
  amount: number;
  currency: "PLN" | "USD";
  /** Wartosc przeliczona na PLN. */
  amountPln: number;
  /** Branza (auto-podpieta z mapy albo recznie). */
  sector: string;
}

export interface SectorAllocation {
  sector: string;
  amountPln: number;
  pct: number;
}

export interface PortfolioSummary {
  totalPln: number;
  allocations: SectorAllocation[];
  topSector: string | null;
  topPct: number;
  /** Deterministyczna sugestia dywersyfikacji. */
  suggestion: string;
}

/** Wskaznik makro (Faza 15). */
export interface MacroIndicator {
  key: string;
  label: string;
  value: number | null;
  prevValue: number | null;
  year: string | null;
  unit: string;
}

/** Koniunktura makro dla rynku (PL albo US). */
export interface MarketMacro {
  market: Market;
  /** Wynik klimatu 0-100 (50 = neutralnie). */
  score: number;
  /** Ten sam wynik w [-1,1] — do rankingu. */
  scoreRaw: number;
  indicators: MacroIndicator[];
  fx?: { usdPln: number | null; eurPln: number | null; date: string | null };
  highlights: string[];
  updatedAt?: string;
}

/** Wnioski AI porownujace okresy dla spolki (Faza 5). */
export interface Conclusion {
  period: string | null;
  text: string;
  createdAt: string;
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
  /** Zwroty % dla horyzontow (1D/1T/1M/3M/6M/1R) — do przelacznika okresu. */
  returns?: Record<string, number | null>;
  /** Waluta notowania (np. "PLN", "USD"). */
  currency: string | null;
  /** Data ostatniej sesji (YYYY-MM-DD). */
  date: string | null;
  error?: string;
}
