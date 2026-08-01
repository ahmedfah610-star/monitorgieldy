import { extractText, getDocumentProxy } from "unpdf";
import {
  hasDb,
  getWatchlist,
  upsertHoldingNotifications,
  getExistingHoldingUrls,
  getWatchlistHoldings,
} from "./db";
import type { HoldingNotification } from "./types";

/**
 * Znaczne pakiety akcji — zawiadomienia art. 69 ustawy o ofercie (Faza 9).
 *
 * Wejscia/wyjscia duzych akcjonariuszy (przekroczenie/zejscie progow 5/10/…%).
 * Zrodlo: komunikaty ESPI per-spolka (bankier), ta sama lista co raporty i
 * insiderzy. Tytul niesie pewny sygnal (kierunek + progi); nazwe podmiotu i
 * udzial po transakcji czytamy best-effort z tresci HTML. Bez AI.
 */
const BASE = "https://www.bankier.pl";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

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

/** Linki do zalacznikow PDF emitenta (formularze art. 69), z pominieciem regulaminow. */
function attachmentPdfUrls(bodyHtml: string): string[] {
  const urls = bodyHtml.match(/https:\/\/bonnier\.pl\/static\/att\/emitent\/[^"'\s]+\.pdf/gi);
  return urls ? [...new Set(urls)] : [];
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&oacute;/g, "ó")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return `${yyyy}-${mm}-${dd}` + (hh ? `T${hh}:${min}` : "");
}

/** Rozpoznaje zawiadomienie o znacznym pakiecie (art. 69) po tytule. */
const HOLDING_TITLE = /art\.?\s*69|stanu posiadania|znaczn\w+\s+pakiet/i;

/** Kierunek zmiany z tytulu; mieszany/niepewny => "other". */
function directionFromTitle(title: string): HoldingNotification["direction"] {
  const inc = /(przekrocz|zwiększ|zwieksz|nabyci|powyżej|powyzej|osiągnięc\w*\s+progu)/i.test(title);
  const dec = /(zmniejsz|zejści|zejsci|poniżej|ponizej|zbyci|spadek)/i.test(title);
  if (inc && !dec) return "increase";
  if (dec && !inc) return "decrease";
  return "other";
}

function thresholdsFromTitle(title: string): number[] {
  const out = new Set<number>();
  for (const m of title.matchAll(/(\d{1,2}(?:[,.]\d+)?)\s*%/g)) {
    const n = Number(m[1].replace(",", "."));
    if (Number.isFinite(n)) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

interface AnnouncementItem {
  url: string;
  title: string;
  publishedAt: string | null;
}

const ITEM_RE = /<li class="m-quotes-announcements-list__item">([\s\S]*?)<\/li>/g;
const DATE_RE = /m-quotes-announcements-item__date">([^<]+)</;
const ANCHOR_RE =
  /m-quotes-announcements-item__anchor"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;

/** Z listy komunikatow spolki wyciaga zawiadomienia art. 69. */
export function parseHoldingList(html: string): AnnouncementItem[] {
  const out: AnnouncementItem[] = [];
  let m: RegExpExecArray | null;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(html)) !== null) {
    const block = m[1];
    const anchor = block.match(ANCHOR_RE);
    if (!anchor) continue;
    const title = decode(anchor[2].replace(/<[^>]+>/g, " "));
    if (!HOLDING_TITLE.test(title)) continue;
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

/** Best-effort: nazwa podmiotu zglaszajacego z tresci komunikatu. */
export function extractHolder(bodyText: string): string | null {
  const m =
    bodyText.match(/otrzyma\w+\s+(?:od|zawiadomienie od)\s+([A-ZŁŚŻÓĆŃ][\w .,'&-]{3,60}?)(?:\s+(?:zawiadomien|informacj|na podstawie|w trybie|z siedzib))/i) ??
    bodyText.match(/zawiadomieni\w*\s+od\s+([A-ZŁŚŻÓĆŃ][\w .,'&-]{3,60}?)(?:\s+(?:o|na podstawie|w trybie|z siedzib|,))/i);
  return m ? decode(m[1]).replace(/\s*[,.]$/, "") : null;
}

/**
 * Best-effort: udzial w glosach po transakcji (%). Obsluguje dwa uklady:
 *  - formularz PDF: etykieta, potem wartosc ("% udział w liczbie głosów 4,84"),
 *  - tekst HTML: wartosc, potem etykieta ("4,84% udziału w liczbie głosów").
 * Bierze ostatnia sensowna wartosc (<=100%) — zwykle stan "po zmianie".
 */
export function extractPctAfter(bodyText: string): number | null {
  const vals: number[] = [];
  for (const m of bodyText.matchAll(
    /%\s*udział\w*\s+w\s+(?:ogólnej\s+)?liczbie głosów\s+([\d]+(?:[,.]\d+)?)/gi,
  ))
    vals.push(Number(m[1].replace(",", ".")));
  for (const m of bodyText.matchAll(
    /([\d]+(?:[,.]\d+)?)\s*%\s*(?:udział\w*\s+)?w\s+(?:ogólnej\s+)?liczbie głosów/gi,
  ))
    vals.push(Number(m[1].replace(",", ".")));
  const valid = vals.filter((v) => Number.isFinite(v) && v > 0 && v <= 100);
  return valid.length ? valid[valid.length - 1] : null;
}

/** Best-effort: podmiot ze standardowego formularza art. 69 (PDF). */
export function extractHolderFromForm(pdfText: string): string | null {
  const person = pdfText.match(
    /Imię\s+([A-ZŁŚŻÓĆŃ][\wąćęłńóśżź-]+)\s+Nazwisko\s+([A-ZŁŚŻÓĆŃ][\wąćęłńóśżź -]+?)\s+(?:brak|PESEL|Akcje|Typ|Siedziba|Kod|Data)/i,
  );
  if (person) return `${person[1]} ${person[2]}`.replace(/\s+/g, " ").trim();
  const entity = pdfText.match(/Nazwa podmiotu\s+(.+?)\s+(?:Kod LEI|Typ podmiotu|Siedziba|Forma)/i);
  return entity ? entity[1].trim() : null;
}

async function resolveHolding(
  item: AnnouncementItem,
  ctx: { watchTicker: string | null; company: string | null },
): Promise<HoldingNotification> {
  const base: HoldingNotification = {
    watchTicker: ctx.watchTicker,
    company: ctx.company,
    holder: null,
    direction: directionFromTitle(item.title),
    thresholds: thresholdsFromTitle(item.title),
    pctAfter: null,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
  };
  try {
    const html = await fetchHtml(item.url);
    const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));
    base.holder = extractHolder(text);
    base.pctAfter = extractPctAfter(text);

    // Zwykle szczegoly sa w zalaczonym formularzu PDF — doczytaj gdy brak danych.
    if (base.holder === null || base.pctAfter === null) {
      for (const pdf of attachmentPdfUrls(html).slice(0, 2)) {
        try {
          const txt = await fetchPdfText(pdf);
          base.holder ??= extractHolderFromForm(txt) ?? extractHolder(txt);
          base.pctAfter ??= extractPctAfter(txt);
        } catch {
          // zalacznik moze byc skanem/blednym plikiem — pomijamy
        }
        if (base.holder !== null && base.pctAfter !== null) break;
      }
    }
  } catch {
    // tresc niedostepna — zostaje sam sygnal z tytulu
  }
  return base;
}

export async function fetchCompanyHoldingList(slug: string): Promise<AnnouncementItem[]> {
  const clean = slug.trim().toUpperCase();
  const html = await fetchHtml(
    `${BASE}/gielda/notowania/akcje/${encodeURIComponent(clean)}/komunikaty`,
  );
  return parseHoldingList(html);
}

export interface HoldingRefreshSummary {
  inserted: number;
  processed: number;
  skipped: number;
  pending: number;
  errors: string[];
  refreshedAt: string;
}

export async function refreshHoldingNotifications(): Promise<HoldingRefreshSummary> {
  const errors: string[] = [];
  const watchlist = await getWatchlist();
  const plItems = watchlist.filter((w) => w.market === "PL" && w.bankierSymbol);

  const lists = await Promise.allSettled(
    plItems.map((w) =>
      fetchCompanyHoldingList(w.bankierSymbol as string).then((items) =>
        items.map((it) => ({ item: it, watchTicker: w.ticker, company: w.name })),
      ),
    ),
  );
  const found: { item: AnnouncementItem; watchTicker: string; company: string }[] = [];
  lists.forEach((res, i) => {
    if (res.status === "fulfilled") found.push(...res.value);
    else errors.push(`${plItems[i].bankierSymbol}: ${String(res.reason).slice(0, 120)}`);
  });

  const existing = new Set(await getExistingHoldingUrls());
  const fresh = found.filter((f) => !existing.has(f.item.url));
  const toProcess = fresh.slice(0, MAX_NEW_PER_REFRESH);
  const pending = fresh.length - toProcess.length;

  const all: HoldingNotification[] = [];
  const resolved = await Promise.allSettled(
    toProcess.map((f) => resolveHolding(f.item, { watchTicker: f.watchTicker, company: f.company })),
  );
  resolved.forEach((res, i) => {
    if (res.status === "fulfilled") all.push(res.value);
    else errors.push(`${toProcess[i].item.url.slice(-40)}: ${String(res.reason).slice(0, 80)}`);
  });

  const { inserted } = await upsertHoldingNotifications(all);
  return {
    inserted,
    processed: toProcess.length,
    skipped: found.length - fresh.length,
    pending,
    errors,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getHoldingsView(): Promise<{
  notifications: HoldingNotification[];
  usingDb: boolean;
}> {
  if (!hasDb()) return { notifications: [], usingDb: false };
  const notifications = await getWatchlistHoldings();
  return { notifications, usingDb: true };
}
