import { NextRequest, NextResponse } from "next/server";
import { hasDb, getReportContext, updateReportExtraction } from "@/lib/db";
import { hasAnthropicKey, extractFromUrl } from "@/lib/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ekstrakcja danych finansowych z raportu (Faza 4).
 * POST { url } — analizuje komunikat pod danym URL i zapisuje wynik do bazy.
 */
export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Brak POSTGRES_URL — skonfiguruj Vercel Postgres i uruchom /api/init-db." },
      { status: 503 },
    );
  }
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      { error: "Brak ANTHROPIC_API_KEY — ustaw klucz Anthropic w .env.local, aby analizowac raporty." },
      { status: 503 },
    );
  }

  let url = "";
  try {
    const body = await req.json();
    url = String(body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Nieprawidlowe zadanie." }, { status: 400 });
  }
  if (!/^https?:\/\/(www\.)?bankier\.pl\//.test(url)) {
    return NextResponse.json({ error: "Nieprawidlowy lub niedozwolony URL raportu." }, { status: 400 });
  }

  try {
    const ctx = await getReportContext(url);
    if (!ctx) {
      return NextResponse.json({ error: "Nie znaleziono raportu w bazie." }, { status: 404 });
    }

    const extracted = await extractFromUrl(url, {
      company: ctx.company ?? ctx.watchTicker ?? "",
      period: ctx.period ?? "",
      ticker: ctx.watchTicker ?? "",
    });

    await updateReportExtraction(url, extracted);
    return NextResponse.json({ extracted });
  } catch (e) {
    console.error("[/api/reports/extract] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
