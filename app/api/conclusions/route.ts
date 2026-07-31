import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { hasAnthropicKey, generateConclusion } from "@/lib/conclusions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Wnioski AI porownujace okresy (Faza 5).
 * POST { ticker } — porownuje przeanalizowane raporty spolki i zapisuje wnioski.
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
      { error: "Brak ANTHROPIC_API_KEY — ustaw klucz Anthropic, aby generowac wnioski." },
      { status: 503 },
    );
  }

  let ticker = "";
  try {
    const body = await req.json();
    ticker = String(body.ticker ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Nieprawidlowe zadanie." }, { status: 400 });
  }
  if (!ticker) {
    return NextResponse.json({ error: "Wymagany ticker." }, { status: 400 });
  }

  try {
    const result = await generateConclusion(ticker);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/conclusions] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
