import { extractText, getDocumentProxy } from "unpdf";
import {
  hasDb,
  upsertInsiderTransactions,
  getExistingInsiderUrls,
  getWatchlistInsiderTransactions,
} from "./db";
import { getUniverse, mapLimit } from "./universe";
import type { InsiderTransaction } from "./types";

/**
 * Transakcje osob zarzadzajacych (art. 19 MAR) — strumien sygnalow insiderskich.
 *
 * Zrodlo: komunikaty ESPI per-spolka na bankier.pl (ta sama lista co raporty).
 * Wiekszosc emitentow NIE wpisuje liczb do tresci HTML — dolacza standardowy
 * formularz ESMA jako PDF (host bonnier.pl/static/att/emitent). PDF ma warstwe
 * tekstowa, wiec pobieramy go i parsujemy KODEM (regex) — bez AI, zero tokenow.
 *
 * Z formularza bierzemy pola "Informacje zbiorcze": laczny wolumen + cena
 * srednia => wartosc transakcji (to jest wlasnie sygnal "prezes dokupil za X zl").
 */
const BASE = "https://www.bankier.pl";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Ile nowych komunikatow doczytac (PDF) w jednym odswiezeniu — limit czasu funkcji. */
const MAX_NEW_PER_REFRESH = 25;

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, "Accept-Language": "pl-PL,pl;q=0.9" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.text();
}

/** Pobiera PDF i zwraca jego tekst ze zbita biala spacja (pod regexy). */
async function fetchPdfText(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join(" ") : text).replace(/\s+/g, " ").trim();
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

/**
 * Rozpoznaje komunikat o transakcji art. 19 MAR po tytule. Tytuly bywaja rozne:
 * "...w trybie art. 19 MAR", "POWIADOMIENIE O TRANSAKCJI...", "Nabycie akcji
 * przez Prezesa Zarzadu". Kotwiczymy na art. 19 / MAR albo na wzorcu
 * powiadomienia/nabycia. Falszywe trafienia odsiewa pozniej brak formularza.
 */
const INSIDER_TITLE =
  /art\.?\s*19|19\s+(?:rozp|mar)|\bMAR\b|(?:powiadomieni|zawiadomieni)\w*[\s\S]{0,40}transakcj|transakcj\w*[\s\S]{0,30}os[oó]b|(?:nabyci|zbyci)\w*\s+akcji\s+przez/i;

interface AnnouncementItem {
  url: string;
  title: string;
  publishedAt: string | null;
}

const ITEM_RE = /<li class="m-quotes-announcements-list__item">([\s\S]*?)<\/li>/g;
const DATE_RE = /m-quotes-announcements-item__date">([^<]+)</;
const ANCHOR_RE =
  /m-quotes-announcements-item__anchor"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;

/** Z listy komunikatow spolki wyciaga tylko powiadomienia o transakcjach MAR. */
export function parseInsiderList(html: string): AnnouncementItem[] {
  const out: AnnouncementItem[] = [];
  let m: RegExpExecArray | null;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(html)) !== null) {
    const block = m[1];
    const anchor = block.match(ANCHOR_RE);
    if (!anchor) continue;
    const title = decode(anchor[2].replace(/<[^>]+>/g, " "));
    if (!INSIDER_TITLE.test(title)) continue;

    const dateM = block.match(DATE_RE);
    const url = anchor[1];
    out.push({
      url: url.startsWith("http") ? url : `${BASE}${url}`,
      title,
      publishedAt: dateM ? parseDate(decode(dateM[1])) : null,
    });
  }
  return out;
}

/** Linki do zalacznikow PDF emitenta (formularze ESMA), z pominieciem regulaminow. */
export function attachmentPdfUrls(bodyHtml: string): string[] {
  const urls = bodyHtml.match(
    /https:\/\/bonnier\.pl\/static\/att\/emitent\/[^"'\s]+\.pdf/gi,
  );
  return urls ? [...new Set(urls)] : [];
}

function toInt(s: string): number | null {
  const n = Number(s.replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toFloat(s: string): number | null {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function clean(s: string | undefined | null): string | null {
  if (!s) return null;
  // Ucina doczepiony numer sekcji ("Jan Kowalski 2") i nadmiar bialych znakow.
  const c = s.replace(/\s*\d+\s*$/, "").trim();
  return c || null;
}

/**
 * Parsuje formularz ESMA (art. 19 MAR) z tekstu PDF (zbita biala spacja).
 * Zwraca po jednym wierszu na blok "Szczegolowe informacje o transakcji"
 * (dzielony po "Opis instrumentu finansowego").
 */
export function parseMarForm(
  text: string,
  ctx: { watchTicker: string | null; company: string | null; url: string; publishedAt: string | null },
): InsiderTransaction[] {
  const person = clean(
    text.match(/(?:Imię i Nazwisko|Nazwa\s*\/\s*Nazwisko)\s*:?\s*(.+?)\s*(?:Powód powiadomienia|Stanowisko)/i)?.[1],
  );
  const role = clean(
    text.match(/Stanowisko\s*\/\s*status\s*:?\s*(.+?)\s*(?:b\)|Powiadomienie pierwotne|Dane emitenta|3\s)/i)?.[1],
  );

  const blocks = text.split(/Opis instrumentu finansowego/i).slice(1);
  const rows: InsiderTransaction[] = [];
  for (const b of blocks) {
    const dirM = b.match(/Rodzaj transakcji\s*:?\s*(Nabycie|Zbycie)/i);
    const txType = dirM
      ? /nabyci/i.test(dirM[1])
        ? "nabycie"
        : "zbycie"
      : null;

    const aggM = b.match(/Łączny wolumen[\s-]*Cena\s+([\d ]+?)\s+([\d.,]+)\s*([A-Z]{3})/);
    const volume = aggM ? toInt(aggM[1]) : null;
    const price = aggM ? toFloat(aggM[2]) : null;
    const currency = aggM ? aggM[3] : null;
    const txDate = b.match(/Data transakcji\s*:?\s*(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
    const instrument = /obligacj/i.test(b) ? "obligacje" : /akcj/i.test(b) ? "akcje" : null;

    // Blok bez zadnej liczby i kierunku pomijamy (np. sekcja-smiec z podzialu).
    if (!txType && volume === null && !txDate) continue;

    rows.push({
      watchTicker: ctx.watchTicker,
      company: ctx.company,
      person,
      role,
      txType,
      instrument,
      volume,
      price,
      currency,
      value: volume !== null && price !== null ? Math.round(volume * price) : null,
      txDate,
      url: ctx.url,
      publishedAt: ctx.publishedAt,
    });
  }
  return rows;
}

/** Wiersz-zdarzenie, gdy nie udalo sie sparsowac formularza (np. tylko skan). */
function eventOnly(item: AnnouncementItem, ctx: { watchTicker: string | null; company: string | null }): InsiderTransaction {
  return {
    watchTicker: ctx.watchTicker,
    company: ctx.company,
    person: null,
    role: null,
    txType: null,
    instrument: null,
    volume: null,
    price: null,
    currency: null,
    value: null,
    txDate: null,
    url: item.url,
    publishedAt: item.publishedAt,
  };
}

/** Doczytuje jeden komunikat: tresc -> zalaczniki PDF -> wiersze transakcji. */
async function resolveAnnouncement(
  item: AnnouncementItem,
  ctx: { watchTicker: string | null; company: string | null },
): Promise<InsiderTransaction[]> {
  const parseCtx = { ...ctx, url: item.url, publishedAt: item.publishedAt };
  try {
    const body = await fetchHtml(item.url);
    const pdfs = attachmentPdfUrls(body);
    const rows: InsiderTransaction[] = [];
    for (const pdf of pdfs) {
      try {
        const txt = await fetchPdfText(pdf);
        rows.push(...parseMarForm(txt, parseCtx));
      } catch {
        // pojedynczy zalacznik moze byc skanem/blednym plikiem — pomijamy
      }
    }
    // Fallback: sprobuj tresci HTML (nieliczni emitenci wpisuja formularz inline).
    if (rows.length === 0) {
      const bodyText = body
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
      rows.push(...parseMarForm(decode(bodyText), parseCtx));
    }
    return rows.length > 0 ? rows : [eventOnly(item, ctx)];
  } catch {
    return [eventOnly(item, ctx)];
  }
}

export async function fetchCompanyInsiderList(slug: string): Promise<AnnouncementItem[]> {
  const clean = slug.trim().toUpperCase();
  const html = await fetchHtml(
    `${BASE}/gielda/notowania/akcje/${encodeURIComponent(clean)}/komunikaty`,
  );
  return parseInsiderList(html);
}

export interface InsiderRefreshSummary {
  inserted: number;
  processed: number;
  skipped: number;
  pending: number;
  errors: string[];
  refreshedAt: string;
}

/**
 * Pobiera komunikaty PL z watchlisty, wyszukuje NOWE powiadomienia art. 19 MAR
 * (te juz w bazie pomija), doczytuje ich formularze i zapisuje transakcje.
 */
export async function refreshInsiderTransactions(): Promise<InsiderRefreshSummary> {
  const errors: string[] = [];
  const watchlist = await getUniverse();
  const plItems = watchlist.filter((w) => w.market === "PL" && w.bankierSymbol);

  // 1) Zbierz liste powiadomien MAR dla kazdej spolki.
  const lists = await mapLimit(plItems, 6, (w) =>
    fetchCompanyInsiderList(w.bankierSymbol as string).then((items) =>
      items.map((it) => ({ item: it, watchTicker: w.ticker, company: w.name })),
    ),
  );
  const found: { item: AnnouncementItem; watchTicker: string; company: string }[] = [];
  lists.forEach((res, i) => {
    if (res.status === "fulfilled") found.push(...res.value);
    else errors.push(`${plItems[i].bankierSymbol}: ${String(res.reason).slice(0, 120)}`);
  });

  // 2) Odsiej te juz przetworzone (po URL) — nie pobieramy ich PDF ponownie.
  const existing = new Set(await getExistingInsiderUrls());
  const fresh = found.filter((f) => !existing.has(f.item.url));
  const toProcess = fresh.slice(0, MAX_NEW_PER_REFRESH);
  const pending = fresh.length - toProcess.length;

  // 3) Doczytaj formularze i zbierz wiersze transakcji.
  const all: InsiderTransaction[] = [];
  const resolved = await mapLimit(toProcess, 5, (f) =>
    resolveAnnouncement(f.item, { watchTicker: f.watchTicker, company: f.company }),
  );
  resolved.forEach((res, i) => {
    if (res.status === "fulfilled") all.push(...res.value);
    else errors.push(`${toProcess[i].item.url.slice(-40)}: ${String(res.reason).slice(0, 80)}`);
  });

  const { inserted } = await upsertInsiderTransactions(all);

  return {
    inserted,
    processed: toProcess.length,
    skipped: found.length - fresh.length,
    pending,
    errors,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getInsiderView(): Promise<{
  transactions: InsiderTransaction[];
  usingDb: boolean;
}> {
  if (!hasDb()) return { transactions: [], usingDb: false };
  const transactions = await getWatchlistInsiderTransactions();
  return { transactions, usingDb: true };
}
