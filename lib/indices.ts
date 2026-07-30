import type { Market } from "./types";

export interface IndexDef {
  label: string;
  /** Symbol Yahoo Finance. */
  symbol: string;
  market: Market;
}

/** Glowne indeksy pokazywane na dashboardzie (Faza 1). */
export const INDICES: IndexDef[] = [
  { label: "WIG20", symbol: "WIG20.WA", market: "PL" },
  { label: "mWIG40", symbol: "MWIG40.WA", market: "PL" },
  { label: "S&P 500", symbol: "^GSPC", market: "US" },
  { label: "Nasdaq Composite", symbol: "^IXIC", market: "US" },
];
