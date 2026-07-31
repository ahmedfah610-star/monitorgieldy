import type { Recommendation } from "@/lib/types";
import { fmtPrice } from "@/lib/format";

function sentimentClass(s: Recommendation["sentiment"]): string {
  if (s === "positive") return "text-up";
  if (s === "negative") return "text-down";
  return "text-neutral-300";
}

export function RecommendationsTable({
  recs,
  showCompany = false,
}: {
  recs: Recommendation[];
  showCompany?: boolean;
}) {
  if (recs.length === 0) {
    return <p className="text-sm text-neutral-500">Brak rekomendacji.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-neutral-400">
            <th className="px-3 py-2 font-medium">Data</th>
            {showCompany && <th className="px-3 py-2 font-medium">Spółka</th>}
            <th className="px-3 py-2 font-medium">Ocena</th>
            <th className="px-3 py-2 text-right font-medium">Cena docel.</th>
            <th className="px-3 py-2 font-medium">Instytucja / źródło</th>
          </tr>
        </thead>
        <tbody>
          {recs.map((r, i) => (
            <tr
              key={`${r.source}:${r.symbol}:${r.recDate}:${r.broker ?? ""}:${i}`}
              className="border-b border-neutral-900 last:border-0 hover:bg-neutral-900/50"
            >
              <td className="px-3 py-2 whitespace-nowrap text-neutral-400">{r.recDate ?? "—"}</td>
              {showCompany && (
                <td className="px-3 py-2 font-mono text-neutral-300">{r.symbol}</td>
              )}
              <td className={`px-3 py-2 font-medium ${sentimentClass(r.sentiment)}`}>
                {r.rating ?? "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.priceTarget !== null ? (
                  <>
                    {fmtPrice(r.priceTarget)}
                    {r.currency && (
                      <span className="ml-1 text-xs text-neutral-500">{r.currency}</span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-neutral-400">
                {r.broker ?? (r.source === "finnhub" ? "Finnhub (konsensus)" : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
