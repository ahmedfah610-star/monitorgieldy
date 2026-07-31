import { NextResponse } from "next/server";
import { getReportsView } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const view = await getReportsView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/reports] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
