import type { Quote } from "@/lib/types";
import { fmtPrice, fmtPct, changeColor } from "@/lib/format";

export function QuotesTable({ quotes }: { quotes: Quote[] }) {
  if (quotes.length === 0) {
    return <p className="text-sm text-neutral-500">Brak pozycji.</p>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="px-3 py-2.5 font-medium">Nazwa</th>
            <th className="px-3 py-2.5 font-medium">Symbol</th>
            <th className="px-3 py-2.5 text-right font-medium">Kurs</th>
            <th className="px-3 py-2.5 text-right font-medium">Zmiana</th>
            <th className="px-3 py-2.5 text-right font-medium">Sesja</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const up = (q.changePct ?? 0) > 0;
            const down = (q.changePct ?? 0) < 0;
            return (
              <tr
                key={`${q.market}:${q.symbol}`}
                className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.025]"
              >
                <td className="px-3 py-2.5 font-medium text-neutral-100">{q.label}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-neutral-500">{q.symbol}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-neutral-100">
                  {q.error ? (
                    <span className="text-xs text-amber-500" title={q.error}>
                      b/d
                    </span>
                  ) : (
                    <>
                      {fmtPrice(q.close)}
                      {q.currency && <span className="ml-1 text-xs text-neutral-500">{q.currency}</span>}
                    </>
                  )}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${changeColor(q.changePct)}`}>
                  {q.error ? "—" : (
                    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 ${up ? "bg-emerald-500/10" : down ? "bg-rose-500/10" : ""}`}>
                      {up ? "▲" : down ? "▼" : ""} {fmtPct(q.changePct)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-neutral-500">{q.date ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
