import { NextRequest, NextResponse } from "next/server";
import {
  hasDb,
  getWatchlist,
  addWatchlistItem,
  deleteWatchlistItem,
  DEFAULT_WATCHLIST,
} from "@/lib/db";
import type { Market } from "@/lib/types";

export const dynamic = "force-dynamic";

function dbRequired() {
  return NextResponse.json(
    {
      error:
        "Brak konfiguracji bazy. Ustaw POSTGRES_URL w .env.local i uruchom /api/init-db, " +
        "aby zapisywac watchliste.",
    },
    { status: 503 },
  );
}

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ items: DEFAULT_WATCHLIST, usingFallback: true });
  }
  try {
    const items = await getWatchlist();
    return NextResponse.json({ items, usingFallback: false });
  } catch (e) {
    console.error("[/api/watchlist GET] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return dbRequired();
  try {
    const body = await req.json();
    const ticker = String(body.ticker ?? "").trim();
    const market = String(body.market ?? "").trim().toUpperCase() as Market;
    const name = String(body.name ?? "").trim();

    if (!ticker || !name || (market !== "PL" && market !== "US")) {
      return NextResponse.json(
        { error: "Wymagane: ticker, name oraz market ('PL' albo 'US')." },
        { status: 400 },
      );
    }

    const item = await addWatchlistItem(ticker, market, name);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("[/api/watchlist POST] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!hasDb()) return dbRequired();
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Nieprawidlowe id." }, { status: 400 });
    }
    await deleteWatchlistItem(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/watchlist DELETE] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
