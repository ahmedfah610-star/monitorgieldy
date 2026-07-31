/**
 * Katalog najwiekszych spolek GPW (WIG20 + mWIG40) do szybkiego dodania na
 * watchliste jednym klikiem. Kazdy wpis ma zweryfikowany ticker GPW (do notowan
 * Yahoo, symbol = TICKER.WA) oraz slug bankiera (do rekomendacji i raportow).
 *
 * Zrodlo: ranking kapitalizacji bankier.pl + weryfikacja tickerow przez Yahoo
 * Finance. Snapshot z 2026-07 — sklad indeksow zmienia sie w czasie, mozna
 * wygenerowac ponownie. Spolki spoza listy dodasz recznie w formularzu.
 */

export interface GpwCompany {
  /** Ticker GPW (małe litery); symbol Yahoo = `${ticker}.WA`. */
  ticker: string;
  name: string;
  /** Slug bankier.pl (do /gielda/notowania/akcje/{slug}/...). */
  bankierSymbol: string;
}

export const GPW_COMPANIES: GpwCompany[] = [
  // --- WIG20 (najwieksze) ---
  { ticker: "pkn", name: "Orlen", bankierSymbol: "PKNORLEN" },
  { ticker: "pko", name: "PKO BP", bankierSymbol: "PKOBP" },
  { ticker: "peo", name: "Pekao", bankierSymbol: "PEKAO" },
  { ticker: "pzu", name: "PZU", bankierSymbol: "PZU" },
  { ticker: "pge", name: "PGE", bankierSymbol: "PGE" },
  { ticker: "kgh", name: "KGHM", bankierSymbol: "KGHM" },
  { ticker: "dnp", name: "Dino Polska", bankierSymbol: "DINOPL" },
  { ticker: "lpp", name: "LPP", bankierSymbol: "LPP" },
  { ticker: "ale", name: "Allegro", bankierSymbol: "ALLEGRO" },
  { ticker: "pco", name: "Pepco Group", bankierSymbol: "PEPCO" },
  { ticker: "cdr", name: "CD Projekt", bankierSymbol: "CDPROJEKT" },
  { ticker: "alr", name: "Alior Bank", bankierSymbol: "ALIOR" },
  { ticker: "kru", name: "Kruk", bankierSymbol: "KRUK" },
  { ticker: "kty", name: "Grupa Kęty", bankierSymbol: "KETY" },
  { ticker: "bdx", name: "Budimex", bankierSymbol: "BUDIMEX" },
  { ticker: "cps", name: "Cyfrowy Polsat", bankierSymbol: "CYFRPLSAT" },
  { ticker: "jsw", name: "JSW", bankierSymbol: "JSW" },
  { ticker: "opl", name: "Orange Polska", bankierSymbol: "ORANGEPL" },
  { ticker: "mbk", name: "mBank", bankierSymbol: "MBANK" },
  { ticker: "zab", name: "Żabka Group", bankierSymbol: "ZABKA" },

  // --- mWIG40 i inne duze ---
  { ticker: "ing", name: "ING Bank Śląski", bankierSymbol: "INGBSK" },
  { ticker: "mil", name: "Bank Millennium", bankierSymbol: "MILLENNIUM" },
  { ticker: "bnp", name: "BNP Paribas Bank Polska", bankierSymbol: "BNPPPL" },
  { ticker: "bhw", name: "Bank Handlowy", bankierSymbol: "HANDLOWY" },
  { ticker: "tpe", name: "Tauron", bankierSymbol: "TAURONPE" },
  { ticker: "ena", name: "Enea", bankierSymbol: "ENEA" },
  { ticker: "eng", name: "Energa", bankierSymbol: "ENERGA" },
  { ticker: "att", name: "Grupa Azoty", bankierSymbol: "GRUPAAZOTY" },
  { ticker: "xtb", name: "XTB", bankierSymbol: "XTB" },
  { ticker: "acp", name: "Asseco Poland", bankierSymbol: "ASSECOPOL" },
  { ticker: "abs", name: "Asseco Business Solutions", bankierSymbol: "ASSECOBS" },
  { ticker: "ase", name: "Asseco South Eastern Europe", bankierSymbol: "ASSECOSEE" },
  { ticker: "car", name: "Inter Cars", bankierSymbol: "INTERCARS" },
  { ticker: "apr", name: "Auto Partner", bankierSymbol: "AUTOPARTN" },
  { ticker: "dom", name: "Dom Development", bankierSymbol: "DOMDEV" },
  { ticker: "dvl", name: "Develia", bankierSymbol: "DEVELIA" },
  { ticker: "1at", name: "Atal", bankierSymbol: "ATAL" },
  { ticker: "arh", name: "Archicom", bankierSymbol: "ARCHICOM" },
  { ticker: "rob", name: "Robyg", bankierSymbol: "ROBYG" },
  { ticker: "ech", name: "Echo Investment", bankierSymbol: "ECHO" },
  { ticker: "mlg", name: "MLP Group", bankierSymbol: "MLPGROUP" },
  { ticker: "gpw", name: "GPW", bankierSymbol: "GPW" },
  { ticker: "nwg", name: "Newag", bankierSymbol: "NEWAG" },
  { ticker: "neu", name: "Neuca", bankierSymbol: "NEUCA" },
  { ticker: "snt", name: "Synektik", bankierSymbol: "SYNEKTIK" },
  { ticker: "gpp", name: "Grupa Pracuj", bankierSymbol: "GRUPRACUJ" },
  { ticker: "cbf", name: "Cyber_Folks", bankierSymbol: "CYBERFLKS" },
  { ticker: "vrc", name: "Vercom", bankierSymbol: "VERCOM" },
  { ticker: "mdv", name: "Modivo", bankierSymbol: "MODIVO" },
  { ticker: "mnc", name: "Mennica Polska", bankierSymbol: "MENNICA" },
  { ticker: "abe", name: "AB", bankierSymbol: "ABPL" },
  { ticker: "eat", name: "AmRest", bankierSymbol: "AMREST" },
  { ticker: "pep", name: "Polenergia", bankierSymbol: "PEP" },
  { ticker: "dia", name: "Diagnostyka", bankierSymbol: "DIAG" },
  { ticker: "bft", name: "Benefit Systems", bankierSymbol: "BENEFIT" },
  { ticker: "rbw", name: "Rainbow Tours", bankierSymbol: "RAINBOW" },
];
