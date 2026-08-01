import { hasDb, getWatchlist, upsertShortPositions, getWatchlistShortPositions } from "./db";
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

/** Pobiera z rejestru KNF wpisy dla danego emitenta (po nazwie/symbolu). */
export async function fetchShortPositions(issuerSymbol: string): Promise<KnfRecord[]> {
  const request = JSON.stringify({
    cmd: "get",
    search: [{ field: "ISSUER_NAME", type: "text", operator: "contains", value: issuerSymbol }],
    limit: 500,
    offset: 0,
    method: "RssHTable",
    sort: [{ field: "POSITION_DATE", direction: "desc" }],
    searchLogic: "AND",
    searchValue: "",
  });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `request=${encodeURIComponent(request)}`,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (KNF)`);
  const json = (await res.json()) as { status?: string; records?: KnfRecord[] };
  if (json.status !== "success") throw new Error(`KNF status: ${json.status}`);
  return json.records ?? [];
}

export interface ShortRefreshSummary {
  inserted: number;
  fetched: number;
  matched: number;
  errors: string[];
  refreshedAt: string;
}

/**
 * Dla kazdej spolki PL z watchlisty (z symbolem bankier) pobiera pozycje krotkie
 * z KNF i zapisuje nowe. Symbol bankier zwykle pokrywa sie z nazwa emitenta KNF
 * (np. "CDPROJEKT", "JSW"); dopuszczamy tez zawieranie sie nazw.
 */
export async function refreshShortPositions(): Promise<ShortRefreshSummary> {
  const errors: string[] = [];
  const watchlist = await getWatchlist();
  const plItems = watchlist.filter((w) => w.market === "PL" && w.bankierSymbol);

  const all: ShortPosition[] = [];
  let fetched = 0;
  const results = await Promise.allSettled(
    plItems.map((w) =>
      fetchShortPositions(w.bankierSymbol as string).then((recs) => ({ w, recs })),
    ),
  );
  for (const res of results) {
    if (res.status === "rejected") {
      errors.push(String(res.reason).slice(0, 120));
      continue;
    }
    const { w, recs } = res.value;
    fetched += recs.length;
    const sym = normSym(w.bankierSymbol as string);
    for (const r of recs) {
      const issuer = decodeEntities(r.ISSUER_NAME ?? "");
      const isu = normSym(issuer);
      // Dopasowanie: identyczny symbol albo jeden zawiera drugi (np. ORLEN⊂PKNORLEN).
      if (!issuer || !(isu === sym || isu.includes(sym) || sym.includes(isu))) continue;
      const pct = Number((r.NET_SHORT_POSITION_O ?? "").replace(",", "."));
      all.push({
        watchTicker: w.ticker,
        company: w.name,
        issuerName: issuer,
        isin: r.ISIN ? decodeEntities(r.ISIN) : null,
        holder: decodeEntities(r.HOLDER_FULL_NAME ?? "") || "—",
        netShortPct: Number.isFinite(pct) ? pct : null,
        positionDate: r.POSITION_DATE ?? null,
        modifyDate: r.MODIFY_DATE ?? null,
      });
    }
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
