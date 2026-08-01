/**
 * Mapa branz (Faza 14) — do auto-podpiecia sektora przy dodawaniu pozycji do
 * portfela. Yahoo assetProfile wymaga crumba (401), wiec trzymamy wlasna,
 * przewidywalna mape dla spolek GPW z katalogu + popularnych spolek US.
 * Nieznane -> "Inna" (uzytkownik moze ustawic recznie na formularzu).
 */
import type { Market } from "./types";

/** Kanoniczne branze (do listy wyboru na formularzu). */
export const SECTORS = [
  "Bankowość",
  "Finanse i ubezpieczenia",
  "Energetyka",
  "Paliwa",
  "Surowce i górnictwo",
  "Technologia i IT",
  "Gaming",
  "E-commerce",
  "Handel detaliczny",
  "Nieruchomości",
  "Przemysł",
  "Budownictwo",
  "Telekomunikacja",
  "Media",
  "Motoryzacja",
  "Ochrona zdrowia",
  "Gastronomia",
  "Turystyka",
  "Usługi",
  "Dobra konsumenckie",
  "Inna",
] as const;

/** Branze proponowane do dywersyfikacji (rdzen zdrowego portfela). */
export const CORE_SECTORS = [
  "Bankowość",
  "Energetyka",
  "Technologia i IT",
  "Ochrona zdrowia",
  "Handel detaliczny",
  "Przemysł",
  "Surowce i górnictwo",
];

// Klucz: ticker (male) i/lub symbol bankier (wielkie). Wpis pod oba.
const GPW: Record<string, string> = {
  pkn: "Paliwa", pko: "Bankowość", peo: "Bankowość", pzu: "Finanse i ubezpieczenia",
  pge: "Energetyka", kgh: "Surowce i górnictwo", dnp: "Handel detaliczny", lpp: "Handel detaliczny",
  ale: "E-commerce", pco: "Handel detaliczny", cdr: "Gaming", alr: "Bankowość",
  kru: "Finanse i ubezpieczenia", kty: "Przemysł", bdx: "Budownictwo", cps: "Media",
  jsw: "Surowce i górnictwo", opl: "Telekomunikacja", mbk: "Bankowość", zab: "Handel detaliczny",
  ing: "Bankowość", mil: "Bankowość", bnp: "Bankowość", bhw: "Bankowość",
  tpe: "Energetyka", ena: "Energetyka", eng: "Energetyka", att: "Przemysł",
  xtb: "Finanse i ubezpieczenia", acp: "Technologia i IT", abs: "Technologia i IT",
  ase: "Technologia i IT", car: "Motoryzacja", apr: "Motoryzacja", dom: "Nieruchomości",
  dvl: "Nieruchomości", "1at": "Nieruchomości", arh: "Nieruchomości", rob: "Nieruchomości",
  ech: "Nieruchomości", mlg: "Nieruchomości", gpw: "Finanse i ubezpieczenia", nwg: "Przemysł",
  neu: "Ochrona zdrowia", snt: "Ochrona zdrowia", gpp: "Technologia i IT", cbf: "Technologia i IT",
  vrc: "Technologia i IT", mdv: "E-commerce", mnc: "Przemysł", abe: "Technologia i IT",
  eat: "Gastronomia", pep: "Energetyka", dia: "Ochrona zdrowia", bft: "Usługi", rbw: "Turystyka",
};

// Slug bankier -> ta sama branza co ticker.
const GPW_BY_SLUG: Record<string, string> = {
  PKNORLEN: "Paliwa", PKOBP: "Bankowość", PEKAO: "Bankowość", PZU: "Finanse i ubezpieczenia",
  PGE: "Energetyka", KGHM: "Surowce i górnictwo", DINOPL: "Handel detaliczny", LPP: "Handel detaliczny",
  ALLEGRO: "E-commerce", PEPCO: "Handel detaliczny", CDPROJEKT: "Gaming", ALIOR: "Bankowość",
  KRUK: "Finanse i ubezpieczenia", KETY: "Przemysł", BUDIMEX: "Budownictwo", CYFRPLSAT: "Media",
  JSW: "Surowce i górnictwo", ORANGEPL: "Telekomunikacja", MBANK: "Bankowość", ZABKA: "Handel detaliczny",
  INGBSK: "Bankowość", MILLENNIUM: "Bankowość", BNPPPL: "Bankowość", HANDLOWY: "Bankowość",
  TAURONPE: "Energetyka", ENEA: "Energetyka", ENERGA: "Energetyka", GRUPAAZOTY: "Przemysł",
  XTB: "Finanse i ubezpieczenia", ASSECOPOL: "Technologia i IT", ASSECOBS: "Technologia i IT",
  ASSECOSEE: "Technologia i IT", INTERCARS: "Motoryzacja", AUTOPARTN: "Motoryzacja",
  DOMDEV: "Nieruchomości", DEVELIA: "Nieruchomości", ATAL: "Nieruchomości", ARCHICOM: "Nieruchomości",
  ROBYG: "Nieruchomości", ECHO: "Nieruchomości", MLPGROUP: "Nieruchomości", GPW: "Finanse i ubezpieczenia",
  NEWAG: "Przemysł", NEUCA: "Ochrona zdrowia", SYNEKTIK: "Ochrona zdrowia", GRUPRACUJ: "Technologia i IT",
  CYBERFLKS: "Technologia i IT", VERCOM: "Technologia i IT", MODIVO: "E-commerce", MENNICA: "Przemysł",
  ABPL: "Technologia i IT", AMREST: "Gastronomia", PEP: "Energetyka", DIAG: "Ochrona zdrowia",
  BENEFIT: "Usługi", RAINBOW: "Turystyka",
};

const US: Record<string, string> = {
  AAPL: "Technologia i IT", MSFT: "Technologia i IT", NVDA: "Technologia i IT",
  GOOGL: "Technologia i IT", GOOG: "Technologia i IT", META: "Technologia i IT",
  AMD: "Technologia i IT", INTC: "Technologia i IT", ORCL: "Technologia i IT",
  CRM: "Technologia i IT", ADBE: "Technologia i IT", AVGO: "Technologia i IT",
  CSCO: "Technologia i IT", IBM: "Technologia i IT", QCOM: "Technologia i IT",
  PLTR: "Technologia i IT", AMZN: "E-commerce", TSLA: "Motoryzacja", NFLX: "Media",
  DIS: "Media", JPM: "Bankowość", BAC: "Bankowość", GS: "Bankowość", WFC: "Bankowość",
  MS: "Bankowość", C: "Bankowość", V: "Finanse i ubezpieczenia", MA: "Finanse i ubezpieczenia",
  BRK: "Finanse i ubezpieczenia", "BRK-B": "Finanse i ubezpieczenia", JNJ: "Ochrona zdrowia",
  PFE: "Ochrona zdrowia", UNH: "Ochrona zdrowia", MRK: "Ochrona zdrowia", LLY: "Ochrona zdrowia",
  ABBV: "Ochrona zdrowia", XOM: "Paliwa", CVX: "Paliwa", KO: "Dobra konsumenckie",
  PEP: "Dobra konsumenckie", PG: "Dobra konsumenckie", WMT: "Handel detaliczny",
  COST: "Handel detaliczny", MCD: "Gastronomia", NKE: "Dobra konsumenckie", BA: "Przemysł",
};

/** Wykrywa branze spolki. Zwraca kanoniczna nazwe albo "Inna". */
export function detectSector(ticker: string, market: Market, bankierSymbol?: string | null): string {
  const t = ticker.trim();
  if (market === "US") {
    return US[t.toUpperCase()] ?? "Inna";
  }
  // PL: sprobuj po tickerze, potem po slugu bankier.
  return (
    GPW[t.toLowerCase()] ??
    (bankierSymbol ? GPW_BY_SLUG[bankierSymbol.trim().toUpperCase()] : undefined) ??
    GPW_BY_SLUG[t.toUpperCase()] ??
    "Inna"
  );
}
