import type { Report, ReportType } from "./types";

/**
 * Scraper komunikatow ESPI/EBI z bankier.pl (agreguje komunikaty GPW/NewConnect).
 * Strona per-spolka: /gielda/notowania/akcje/{SLUG}/komunikaty
 *
 * Wykrywamy raporty OKRESOWE — na bankierze maja standardowy tytul
 * "Wyniki finansowe {KOD} {okres}", gdzie kod to np. QSr (kwartalny skonsolidowany),
 * RR (roczny), SRR (skonsolidowany roczny), PSr (polroczny).
 *
 * gpw.pl/komunikaty to zrodlo kanoniczne, ale odrzuca proste zapytania HTTP
 * (stary TLS/anti-bot) — bankier jest spojny z Faza 2 i stabilny.
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

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&oacute;/g, "ó")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "28.05.2026 17:33" -> "2026-05-28T17:33" */
function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return `${yyyy}-${mm}-${dd}` + (hh ? `T${hh}:${min}` : "");
}

/** Rozpoznaje typ raportu i okres z tytulu "Wyniki finansowe QSr 1/2026". */
function classify(title: string): { type: ReportType; period: string | null } | null {
  const m = title.match(/wyniki finansowe\s+(.+)$/i);
  if (!m) {
    // Fallback: tytuly typu "Raport okresowy/kwartalny/roczny/polroczny".
    const t = title.toLowerCase();
    if (/raport.*(kwartaln|\bqsr?\b)/.test(t)) return { type: "kwartalny", period: null };
    if (/raport.*(p[oó]?[lł]roczn|\bpsr?\b)/.test(t)) return { type: "polroczny", period: null };
    if (/raport.*(roczn|\bsrr?\b)/.test(t)) return { type: "roczny", period: null };
    return null;
  }
  const rest = m[1].trim().replace(/\s*\/\s*/g, "/"); // "RR /2025" -> "RR/2025"
  const code = (rest.split(/\s+/)[0] ?? "").toUpperCase();
  let type: ReportType = "inny";
  if (/Q/.test(code)) type = "kwartalny";
  else if (/P/.test(code)) type = "polroczny";
  else if (/R/.test(code)) type = "roczny";
  return { type, period: rest };
}

const ITEM_RE = /<li class="m-quotes-announcements-list__item">([\s\S]*?)<\/li>/g;
const DATE_RE = /m-quotes-announcements-item__date">([^<]+)</;
const ANCHOR_RE = /m-quotes-announcements-item__anchor"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
const BADGE_RE = /class="value">(espi|ebi)</i;

/** Parsuje komunikaty ze strony i zwraca tylko raporty okresowe. */
export function parseReports(html: string): Report[] {
  const out: Report[] = [];
  let m: RegExpExecArray | null;
  while ((m = ITEM_RE.exec(html)) !== null) {
    const block = m[1];

    const anchor = block.match(ANCHOR_RE);
    if (!anchor) continue;
    const url = anchor[1];
    const title = decode(anchor[2].replace(/<[^>]+>/g, " "));

    const cls = classify(title);
    if (!cls) continue; // nie jest raportem okresowym

    const dateM = block.match(DATE_RE);
    const publishedAt = dateM ? parseDate(decode(dateM[1])) : null;

    const badge = block.match(BADGE_RE);
    const source = badge ? badge[1].toLowerCase() : "espi";

    out.push({
      watchTicker: null,
      market: "PL",
      source,
      company: null,
      title,
      reportType: cls.type,
      period: cls.period,
      url: url.startsWith("http") ? url : `${BASE}${url}`,
      publishedAt,
    });
  }
  return out;
}

export async function fetchCompanyReports(slug: string, limit = 12): Promise<Report[]> {
  const clean = slug.trim().toUpperCase();
  const html = await fetchHtml(
    `${BASE}/gielda/notowania/akcje/${encodeURIComponent(clean)}/komunikaty`,
  );
  return parseReports(html).slice(0, limit);
}
