import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getOutlookView, generateOutlook } from "@/lib/outlook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — zwraca zapisane perspektywy dla wszystkich spolek. */
export async function GET() {
  try {
    const view = await getOutlookView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/outlook GET] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST { ticker, force? } — generuje perspektywy spolki (albo oddaje z cache).
 * Ponowna analiza (tokeny) tylko przy force: true.
 */
export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Brak POSTGRES_URL — skonfiguruj Vercel Postgres i uruchom /api/init-db." },
      { status: 503 },
    );
  }
  let ticker = "";
  let force = false;
  try {
    const body = await req.json();
    ticker = String(body.ticker ?? "").trim();
    force = body.force === true;
  } catch {
    return NextResponse.json({ error: "Nieprawidlowe zadanie." }, { status: 400 });
  }
  if (!ticker) {
    return NextResponse.json({ error: "Wymagany ticker." }, { status: 400 });
  }

  try {
    const result = await generateOutlook(ticker, force);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "NO_API_KEY") {
      return NextResponse.json(
        { error: "Brak ANTHROPIC_API_KEY — ustaw klucz Anthropic, aby generowac perspektywy." },
        { status: 503 },
      );
    }
    console.error("[/api/outlook POST] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
