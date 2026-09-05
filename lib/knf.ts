import { hasDb, upsertShortPositions, getWatchlistShortPositions } from "./db";
import { getUniverse } from "./universe";
import type { ShortPosition } from "./types";

/**
 * Krotkie pozycje netto z rejestru KNF (Faza 8).
 *
 * KNF publikuje rejestr krotkiej sprzedazy przez publiczny JSON API
 * (rss.knf.gov.pl/rss_pub/JSON) — DataTables-owy POST z payloadem "request".
 * Bierzemy metode "RssHTable" (historia) i filtrujemy po nazwie emitenta.
 * Zadnego AI ani scrapingu HTML — czyste dane. Pokazuje, ktory fundusz gra
 * przeciw spolce i jak duza ma pozycje.
 */
const ENDPOINT = "https://rss.knf.gov.pl/rss_pub/JSON";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

interface KnfRecord {
  HOLDER_FULL_NAME?: string;
  ISSUER_NAME?: string;
  ISIN?: string;
  NET_SHORT_POSITION_O?: string;
  POSITION_DATE?: string;
  MODIFY_DATE?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normSym(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Pobiera jedna strone rejestru KNF (RssHTable) — bez filtra po emitencie. */
async function fetchShortPage(limit: number, offset: number): Promise<KnfRecord[]> {
  const request = JSON.stringify({
    cmd: "get",
    search: [],
    limit,
    offset,
    method: "RssHTable",
    sort: [{ field: "POSITION_DATE", direction: "desc" }],
    searchLogic: "AND",
    searchValue: "",
  });
  // KNF potrafi chwilowo zwrocic blad/nie-JSON — ponawiamy raz.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        cache: "no-store",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `request=${encodeURIComponent(request)}`,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} (KNF)`);
      const text = await res.text();
      const json = JSON.parse(text) as { status?: string; records?: KnfRecord[] };
      if (json.status !== "success") throw new Error(`KNF status: ${json.status}`);
      return json.records ?? [];
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("KNF fetch failed");
}

/**
 * Pobiera CALY rejestr krotkiej sprzedazy KNF jednym-kilkoma zapytaniami
 * (stronicowanie limit/offset), zamiast osobno per spolka. To eliminuje
 * ~57 zapytan (i timeout 504) — rejestr filtrujemy potem lokalnie.
 *
 * Tolerancyjne: jesli ktoras strona padnie (KNF czasem zwraca nie-JSON),
 * zwracamy to, co udalo sie pobrac, zamiast wywalac calosc. Budzet czasowy
 * gwarantuje, ze funkcja nie przekroczy limitu Vercela.
 */
async function fetchAllShortRecords(): Promise<{ records: KnfRecord[]; errors: string[] }> {
  const PAGE = 1000;
  const MAX_PAGES = 12; // zabezpieczenie: max 12k rekordow
  const DEADLINE = Date.now() + 45_000; // twardy budzet < 60s limitu funkcji
  const out: KnfRecord[] = [];
  const errors: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    if (Date.now() > DEADLINE) {
      errors.push("KNF: przekroczono budzet czasu, zwracam czesciowe dane");
      break;
    }
    try {
      const recs = await fetchShortPage(PAGE, page * PAGE);
      out.push(...recs);
      if (recs.length < PAGE) break;
    } catch (e) {
      errors.push(`KNF strona ${page}: ${String(e).slice(0, 100)}`);
      break;
    }
  }
  return { records: out, errors };
}

export interface ShortRefreshSummary {
  inserted: number;
  fetched: number;
  matched: number;
  errors: string[];
  refreshedAt: string;
}

/**
 * Pobiera CALY rejestr krotkiej sprzedazy KNF raz (stronicowanie) i lokalnie
 * dopasowuje wpisy do spolek PL z uniwersum po nazwie emitenta. Symbol bankier
 * zwykle pokrywa sie z nazwa emitenta KNF (np. "CDPROJEKT", "JSW"); dopuszczamy
 * tez zawieranie sie nazw (np. ORLEN⊂PKNORLEN). Jedno-kilka zapytan zamiast
 * ~57 — mieszczy sie w limicie czasu funkcji.
 */
export async function refreshShortPositions(): Promise<ShortRefreshSummary> {
  const errors: string[] = [];
  const watchlist = await getUniverse();
  const plItems = watchlist.filter((w) => w.market === "PL" && w.bankierSymbol);

  // Indeks: znormalizowany symbol emitenta -> spolka z uniwersum.
  const universe = plItems.map((w) => ({ w, sym: normSym(w.bankierSymbol as string) }));

  const { records, errors: fetchErrors } = await fetchAllShortRecords();
  errors.push(...fetchErrors);
  const fetched = records.length;

  const all: ShortPosition[] = [];
  for (const r of records) {
    const issuer = decodeEntities(r.ISSUER_NAME ?? "");
    if (!issuer) continue;
    const isu = normSym(issuer);
    // Dopasowanie: identyczny symbol albo jeden zawiera drugi.
    const hit = universe.find(
      ({ sym }) => isu === sym || isu.includes(sym) || sym.includes(isu),
    );
    if (!hit) continue;
    const pct = Number((r.NET_SHORT_POSITION_O ?? "").replace(",", "."));
    all.push({
      watchTicker: hit.w.ticker,
      company: hit.w.name,
      issuerName: issuer,
      isin: r.ISIN ? decodeEntities(r.ISIN) : null,
      holder: decodeEntities(r.HOLDER_FULL_NAME ?? "") || "—",
      netShortPct: Number.isFinite(pct) ? pct : null,
      positionDate: r.POSITION_DATE ?? null,
      modifyDate: r.MODIFY_DATE ?? null,
    });
  }

  const { inserted } = await upsertShortPositions(all);
  return {
    inserted,
    fetched,
    matched: all.length,
    errors,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getShortView(): Promise<{
  positions: ShortPosition[];
  usingDb: boolean;
}> {
  if (!hasDb()) return { positions: [], usingDb: false };
  const positions = await getWatchlistShortPositions();
  return { positions, usingDb: true };
}
