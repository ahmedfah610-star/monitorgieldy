import { NextResponse } from "next/server";
import { getCompanyProfile } from "@/lib/company";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Profil jednej spolki — wszystkie zebrane dane w jednym miejscu. */
export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker } = await params;
    const profile = await getCompanyProfile(ticker);
    if (!profile) {
      return NextResponse.json({ error: "Nie znaleziono spółki." }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (e) {
    console.error("[/api/company] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
