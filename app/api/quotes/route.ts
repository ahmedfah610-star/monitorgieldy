import { NextResponse } from "next/server";
import { getAllQuotes } from "@/lib/quotes";

// Zawsze swieze dane (bez cache) — dashboard ma dzialac na klik.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getAllQuotes();
    return NextResponse.json(data);
  } catch (e) {
    console.error("[/api/quotes] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
