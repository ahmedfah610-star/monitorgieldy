import type { Quote } from "@/lib/types";
import { fmtPrice, fmtPct, changeColor } from "@/lib/format";

export function QuotesTable({ quotes }: { quotes: Quote[] }) {
  if (quotes.length === 0) {
    return <p className="text-sm text-neutral-500">Brak pozycji.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-neutral-400">
            <th className="px-3 py-2 font-medium">Nazwa</th>
            <th className="px-3 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 text-right font-medium">Kurs</th>
            <th className="px-3 py-2 text-right font-medium">Zmiana</th>
            <th className="px-3 py-2 text-right font-medium">Sesja</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr
              key={`${q.market}:${q.symbol}`}
              className="border-b border-neutral-900 last:border-0 hover:bg-neutral-900/50"
            >
              <td className="px-3 py-2">{q.label}</td>
              <td className="px-3 py-2 font-mono text-neutral-400">{q.symbol}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {q.error ? (
                  <span className="text-xs text-amber-500" title={q.error}>
                    b/d
                  </span>
                ) : (
                  <>
                    {fmtPrice(q.close)}
                    {q.currency && (
                      <span className="ml-1 text-xs text-neutral-500">{q.currency}</span>
                    )}
                  </>
                )}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${changeColor(q.changePct)}`}>
                {q.error ? "—" : fmtPct(q.changePct)}
              </td>
              <td className="px-3 py-2 text-right text-xs text-neutral-500">
                {q.date ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
