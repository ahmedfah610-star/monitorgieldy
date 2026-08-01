import { NextRequest, NextResponse } from "next/server";
import { hasDb, addPortfolioPosition, deletePortfolioPosition } from "@/lib/db";
import { getPortfolioView } from "@/lib/portfolio";
import { detectSector, SECTORS } from "@/lib/sectors";
import type { Market } from "@/lib/types";

export const dynamic = "force-dynamic";

function dbRequired() {
  return NextResponse.json(
    { error: "Brak POSTGRES_URL — ustaw baze i uruchom /api/init-db, aby zapisywac portfel." },
    { status: 503 },
  );
}

export async function GET() {
  try {
    const view = await getPortfolioView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/portfolio GET] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return dbRequired();
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const ticker = String(body.ticker ?? "").trim();
    const market = String(body.market ?? "").trim().toUpperCase() as Market;
    const amount = Number(body.amount);
    const currency = String(body.currency ?? "PLN").trim().toUpperCase() as "PLN" | "USD";
    const rawSector = body.sector ? String(body.sector).trim() : "";

    if (!name || !ticker || (market !== "PL" && market !== "US")) {
      return NextResponse.json({ error: "Wymagane: nazwa, ticker, rynek (PL/US)." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Kwota musi byc liczba dodatnia." }, { status: 400 });
    }
    if (currency !== "PLN" && currency !== "USD") {
      return NextResponse.json({ error: "Waluta: PLN albo USD." }, { status: 400 });
    }
    // Sektor: uzyj podanego (jesli poprawny) albo auto-podepnij z mapy branz.
    const sector =
      rawSector && (SECTORS as readonly string[]).includes(rawSector)
        ? rawSector
        : detectSector(ticker, market, market === "PL" ? ticker : null);

    const position = await addPortfolioPosition({ name, ticker, market, amount, currency, sector });
    return NextResponse.json({ position }, { status: 201 });
  } catch (e) {
    console.error("[/api/portfolio POST] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!hasDb()) return dbRequired();
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Nieprawidlowe id." }, { status: 400 });
    }
    await deletePortfolioPosition(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/portfolio DELETE] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
