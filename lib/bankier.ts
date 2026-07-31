import type { Recommendation, Sentiment } from "./types";

/**
 * Scraper rekomendacji z bankier.pl.
 *
 * Dwa tryby:
 *  - fetchMarketRecommendations(): globalny listing /gielda/rekomendacje
 *    (najnowsze rekomendacje z calego rynku).
 *  - fetchCompanyRecommendations(slug): strona per-spolka
 *    /gielda/notowania/akcje/{SLUG}/rekomendacje (historia danej spolki).
 *
 * Uwaga: scraping jest z natury kruchy — parser jest napisany odpornie
 * (kotwiczy sie na naglowku "Cena docelowa", loguje bledy, nie wywala calosci
 * gdy pojedynczy wiersz jest nietypowy). robots.txt bankiera dopuszcza te sciezki
 * dla User-agent: * (stan: 2026-07).
 */

const BASE = "https://www.bankier.pl";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, "Accept-Language": "pl-PL,pl;q=0.9" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.text();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&oacute;/g, "ó")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "30,00 zł" / "40,19%" / "" -> number | null */
function parseNumber(text: string): number | null {
  const cleaned = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "") // separator tysiecy
    .replace(",", ".");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sentimentFromRating(ratingCellHtml: string, ratingText: string): Sentiment | null {
  // Sentyment liczymy z TRESCI oceny — klasa CSS na bankierze odzwierciedla
  // potencjal ceny docelowej, nie wydzwiek rekomendacji (np. "Trzymaj" bywa -positive).
  const t = ratingText.toLowerCase();
  if (/(kupuj|akumuluj|przewa|buy|overweight|add|outperform)/.test(t)) return "positive";
  if (/(sprzedaj|redukuj|niedowa|sell|underweight|reduce|underperform)/.test(t)) return "negative";
  if (/(trzymaj|neutral|hold)/.test(t)) return "neutral";
  // Fallback: klasa CSS, gdy slowo nieznane (np. nietypowa ocena zagraniczna).
  const m = ratingCellHtml.match(/-text\s+-(positive|negative|neutral)/);
  return m ? (m[1] as Sentiment) : null;
}

/**
 * Parsuje tabele rekomendacji z HTML strony bankiera. Obsluguje dwa uklady:
 *  - listing globalny (8 kol.): Data | Spolka | Charakter | Cena | Cena docelowa | Potencjal | Cena w dniu wydania | Instytucja
 *  - strona per-spolka (7 kol.): bez kolumny "Spolka"
 *
 * @param defaultSlug slug spolki uzywany gdy w wierszu brak kolumny "Spolka"
 *   (strona per-spolka).
 */
export function parseRecommendations(html: string, defaultSlug?: string): Recommendation[] {
  // Kotwiczymy sie na naglowku tabeli z "Cena docelowa".
  const headIdx = html.indexOf("Cena docelowa");
  if (headIdx === -1) return [];
  const tbodyStart = html.indexOf("<tbody", headIdx);
  if (tbodyStart === -1) return [];
  const tbodyEnd = html.indexOf("</tbody>", tbodyStart);
  const tbody = html.slice(tbodyStart, tbodyEnd === -1 ? undefined : tbodyEnd);

  const rows = tbody.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const out: Recommendation[] = [];

  for (const row of rows) {
    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/g);
    if (!cells) continue;

    // Uklad globalny ma kolumne "Spolka" z linkiem; per-spolka jej nie ma.
    const hasCompanyCol = /akcje\/[^/]+\/rekomendacje/i.test(cells[1] ?? "");
    const off = hasCompanyCol ? 1 : 0;
    if (cells.length < 7 + off) continue;

    const recDate = stripTags(cells[0]) || null;

    let slug = defaultSlug ? defaultSlug.toUpperCase() : "";
    let company: string | null = defaultSlug ?? null;
    if (hasCompanyCol) {
      const slugMatch = cells[1].match(/akcje\/([^/]+)\/rekomendacje/i);
      slug = slugMatch ? slugMatch[1].toUpperCase() : stripTags(cells[1]).toUpperCase();
      company = stripTags(cells[1]) || null;
    }

    const ratingCell = cells[1 + off];
    const rating = stripTags(ratingCell) || null;
    const sentiment = rating ? sentimentFromRating(ratingCell, rating) : null;

    const priceTarget = parseNumber(stripTags(cells[3 + off]));
    const priceAtIssue = parseNumber(stripTags(cells[5 + off]));
    const broker = stripTags(cells[6 + off]) || null;

    if (!recDate && !rating) continue; // wiersz-smiec

    out.push({
      watchTicker: null,
      market: "PL",
      source: "bankier",
      symbol: slug,
      company,
      broker,
      rating,
      sentiment,
      priceTarget,
      priceAtIssue,
      currency: "PLN",
      recDate: /^\d{4}-\d{2}-\d{2}$/.test(recDate ?? "") ? recDate : null,
    });
  }

  return out;
}

export async function fetchMarketRecommendations(): Promise<Recommendation[]> {
  const html = await fetchHtml(`${BASE}/gielda/rekomendacje`);
  return parseRecommendations(html);
}

export async function fetchCompanyRecommendations(
  slug: string,
  limit = 8,
): Promise<Recommendation[]> {
  const clean = slug.trim().toUpperCase();
  const html = await fetchHtml(
    `${BASE}/gielda/notowania/akcje/${encodeURIComponent(clean)}/rekomendacje`,
  );
  return parseRecommendations(html, clean).slice(0, limit);
}
