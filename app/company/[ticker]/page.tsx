"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import type {
  RankingEntry, RankingComponent, CompanyOutlook, Report,
  Recommendation, InsiderTransaction, ShortPosition, HoldingNotification, Dividend,
} from "@/lib/types";

interface Price {
  close: number | null; changePct: number | null; currency: string | null;
  r1m: number | null; r3m: number | null; pe: number | null; pbv: number | null;
  marketCap: number | null; roe: number | null; debtToEquity: number | null;
  profitMargin: number | null; evEbitda: number | null; peg: number | null;
}
interface Forecast {
  projectedGrowth: number; projectedRevenue: number | null; lastRevenue: number | null;
  companyGrowth: number | null; sectorGrowth: number; currency: string | null;
  unit: string | null; period: string | null; confidence: string; note: string;
}
interface Profile {
  ticker: string; company: string; market: "PL" | "US"; sector: string;
  price: Price | null; ranking: RankingEntry | null; outlook: CompanyOutlook | null;
  forecast: Forecast | null; reports: Report[];
  signals: {
    recommendations: Recommendation[]; insider: InsiderTransaction[];
    shorts: ShortPosition[]; holdings: HoldingNotification[]; dividends: Dividend[];
    financials: { period: string | null; extractedJson: { summary: string } }[];
  };
  usingDb: boolean;
}

const pct = (v: number | null | undefined, mul = 1) =>
  v == null ? "—" : `${v * mul >= 0 ? "" : ""}${(v * mul).toFixed(1)}%`;
const num = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d));
const price = (v: number | null | undefined, cur?: string | null) =>
  v == null ? "—" : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ""}`;
const cap = (v: number | null | undefined, cur?: string | null) => {
  if (v == null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} mld${cur ? ` ${cur}` : ""}`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)} mln${cur ? ` ${cur}` : ""}`;
  return v.toLocaleString("pl-PL");
};

function Gauge({ score }: { score: number }) {
  const r = 30, circ = 2 * Math.PI * r;
  const stroke = score >= 55 ? "rgb(16 185 129)" : score <= 45 ? "rgb(244 63 94)" : "rgb(148 163 184)";
  const color = score >= 55 ? "text-emerald-600" : score <= 45 ? "text-rose-600" : "text-neutral-700";
  return (
    <div className="relative grid h-20 w-20 shrink-0 place-items-center">
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(15,23,42,0.09)" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <span className={`absolute text-xl font-bold tabular-nums ${color}`}>{score}</span>
    </div>
  );
}

export default function CompanyProfilePage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/company/${ticker}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) setError(body.error ?? "Nie udało się wczytać profilu.");
        else setP(body);
      })
      .catch(() => alive && setError("Błąd sieci."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [ticker]);

  if (loading) return <main className="py-10 text-center text-sm text-neutral-500">Ładowanie profilu…</main>;
  if (error || !p)
    return (
      <main className="space-y-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error ?? "Brak danych."}</div>
        <Link href="/ranking" className="text-sm text-blue-600 hover:underline">← Wróć do rankingu</Link>
      </main>
    );

  const q = p.price;
  const up = (q?.changePct ?? 0) > 0, down = (q?.changePct ?? 0) < 0;
  const divYield = p.signals.dividends.find((d) => d.yieldPct && d.yieldPct > 0)?.yieldPct ?? null;

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: "Kapitalizacja", value: cap(q?.marketCap, q?.currency) },
    { label: "C/Z (P/E)", value: num(q?.pe) },
    { label: "C/WK (P/BV)", value: num(q?.pbv, 2) },
    { label: "EV/EBITDA", value: num(q?.evEbitda) },
    { label: "ROE", value: pct(q?.roe, 100) },
    { label: "Marża netto", value: pct(q?.profitMargin, 100) },
    { label: "Dług/Kapitał", value: q?.debtToEquity == null ? "—" : num(q?.debtToEquity, 0) },
    { label: "Stopa dywidendy", value: divYield == null ? "—" : `${divYield.toFixed(2)}%` },
    { label: "Momentum 1M", value: pct(q?.r1m, 100) },
    { label: "Momentum 3M", value: pct(q?.r3m, 100) },
  ];

  return (
    <main className="space-y-5">
      {/* --- HERO --- */}
      <div className="card relative overflow-hidden">
        <div className="h-24 bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 sm:h-28" />
        <div className="px-4 pb-4 sm:px-6 sm:pb-5">
          <div className="-mt-10 flex flex-wrap items-end gap-4 sm:-mt-12">
            <div className="rounded-2xl bg-white p-1 shadow-md">
              <CompanyAvatar name={p.company} ticker={p.ticker} size="lg" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{p.company}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono uppercase text-neutral-500">{p.ticker}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600">{p.market}</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{p.sector}</span>
              </div>
            </div>
            {p.ranking && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">Atrakcyjność</div>
                  <div className="text-sm font-semibold text-neutral-800">{p.ranking.verdict}</div>
                </div>
                <Gauge score={p.ranking.score} />
              </div>
            )}
          </div>

          {/* Cena */}
          <div className="mt-4 flex flex-wrap items-baseline gap-3 border-t border-neutral-200 pt-4">
            <span className="text-3xl font-bold tabular-nums text-neutral-900">{price(q?.close, q?.currency)}</span>
            {q?.changePct != null && (
              <span className={`badge ${up ? "badge-pos" : down ? "badge-neg" : "badge-neutral"}`}>
                {up ? "▲" : down ? "▼" : "–"} {Math.abs(q.changePct).toFixed(2)}% dziś
              </span>
            )}
          </div>
        </div>
      </div>

      {!p.usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Baza nie jest skonfigurowana — profil pokazuje tylko podstawowe dane. Ustaw <code>POSTGRES_URL</code>.
        </div>
      )}

      {/* --- KLUCZOWE STATYSTYKI --- */}
      <Section title="Statystyki">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="card p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{s.label}</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">{s.value}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* --- ROZBICIE WYNIKU --- */}
      {p.ranking && (
        <Section title="Ocena atrakcyjności">
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {p.ranking.components.map((c) => <Chip key={c.key} c={c} />)}
            </div>
            <div className="surface-2 px-3 py-2.5 text-sm">
              <div className="font-semibold text-neutral-900">
                <span className="mr-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">Wniosek</span>
                {p.ranking.verdict}
              </div>
              {p.ranking.pros.length > 0 && <div className="mt-1.5 text-emerald-700"><span className="text-neutral-500">▲ Za: </span>{p.ranking.pros.join(" · ")}</div>}
              {p.ranking.cons.length > 0 && <div className="mt-0.5 text-rose-700"><span className="text-neutral-500">▼ Przeciw: </span>{p.ranking.cons.join(" · ")}</div>}
              {p.ranking.note && <div className="mt-1 text-amber-700">⚠ {p.ranking.note}</div>}
            </div>
          </div>
        </Section>
      )}

      {/* --- PERSPEKTYWY AI --- */}
      {p.outlook && (
        <Section title="Perspektywy (AI)">
          <div className="grid gap-3 md:grid-cols-3">
            <OutlookCol title="Atuty dziś" items={p.outlook.currentStrengths} tone="pos" />
            <OutlookCol title="Szanse" items={p.outlook.futureOpportunities} tone="neutral" />
            <OutlookCol title="Zagrożenia" items={p.outlook.futureThreats} tone="neg" />
          </div>
          {p.outlook.summary && <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-neutral-800">{p.outlook.summary}</p>}
        </Section>
      )}

      {/* --- PROGNOZA --- */}
      {p.forecast && (
        <Section title="Prognoza przychodów">
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <Metric label="Prognozowana dynamika" value={`${p.forecast.projectedGrowth >= 0 ? "+" : ""}${(p.forecast.projectedGrowth * 100).toFixed(1)}%`} accent={p.forecast.projectedGrowth >= 0} />
            <Metric label="Prognoza przychodów" value={p.forecast.projectedRevenue == null ? "—" : `${p.forecast.projectedRevenue.toLocaleString("pl-PL")} ${p.forecast.unit ?? ""} ${p.forecast.currency ?? ""}`.trim()} />
            <Metric label="Ostatnie przychody" value={p.forecast.lastRevenue == null ? "—" : `${p.forecast.lastRevenue.toLocaleString("pl-PL")} ${p.forecast.unit ?? ""}`.trim()} />
            <Metric label="Pewność" value={p.forecast.confidence} />
            <p className="w-full border-t border-neutral-200 pt-2.5 text-xs text-neutral-500">{p.forecast.note}</p>
          </div>
        </Section>
      )}

      {/* --- REKOMENDACJE --- */}
      {p.signals.recommendations.length > 0 && (
        <Section title="Rekomendacje" href="/recommendations">
          <ul className="card divide-y divide-neutral-200">
            {p.signals.recommendations.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-medium text-neutral-800">{r.broker ?? r.source}</span>
                {r.rating && <span className="badge badge-neutral">{r.rating}</span>}
                {r.priceTarget != null && <span className="tabular-nums text-neutral-600">cel {price(r.priceTarget, r.currency)}</span>}
                <span className="ml-auto text-xs text-neutral-500">{r.recDate ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* --- RAPORTY --- */}
      {p.reports.length > 0 && (
        <Section title="Raporty okresowe" href="/reports">
          <ul className="card divide-y divide-neutral-200">
            {p.reports.slice(0, 10).map((r, i) => (
              <li key={i} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {r.period && <span className="text-xs text-neutral-500">{r.period}</span>}
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-neutral-800 hover:text-blue-600 hover:underline">{r.title}</a>
                  <span className="text-xs text-neutral-500">{r.publishedAt?.slice(0, 10) ?? "—"}</span>
                </div>
                {r.extractedJson?.summary && <p className="mt-1 text-xs text-neutral-600">{r.extractedJson.summary}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* --- INSIDERZY --- */}
      {p.signals.insider.length > 0 && (
        <Section title="Transakcje insiderów" href="/insider">
          <ul className="card divide-y divide-neutral-200">
            {p.signals.insider.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-medium text-neutral-800">{t.person ?? "—"}</span>
                {t.txType && <span className={`badge ${/naby|kup/i.test(t.txType) ? "badge-pos" : /zby|sprzed/i.test(t.txType) ? "badge-neg" : "badge-neutral"}`}>{t.txType}</span>}
                {t.value != null && <span className="tabular-nums text-neutral-600">{price(t.value, t.currency)}</span>}
                <span className="ml-auto text-xs text-neutral-500">{t.txDate ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* --- KRÓTKIE POZYCJE --- */}
      {p.signals.shorts.length > 0 && (
        <Section title="Krótkie pozycje (KNF)" href="/short">
          <ul className="card divide-y divide-neutral-200">
            {p.signals.shorts.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-medium text-neutral-800">{s.holder}</span>
                {s.netShortPct != null && <span className="badge badge-warn">{s.netShortPct.toFixed(2)}%</span>}
                <span className="ml-auto text-xs text-neutral-500">{s.positionDate ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* --- ZNACZNE PAKIETY --- */}
      {p.signals.holdings.length > 0 && (
        <Section title="Znaczne pakiety (art. 69)" href="/holdings">
          <ul className="card divide-y divide-neutral-200">
            {p.signals.holdings.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-medium text-neutral-800">{h.holder ?? "—"}</span>
                {h.direction && <span className={`badge ${/zwie|naby|prz/i.test(h.direction) ? "badge-pos" : "badge-neg"}`}>{h.direction}</span>}
                {h.pctAfter != null && <span className="tabular-nums text-neutral-600">→ {h.pctAfter.toFixed(2)}%</span>}
                <span className="ml-auto text-xs text-neutral-500">{h.publishedAt?.slice(0, 10) ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* --- DYWIDENDY --- */}
      {p.signals.dividends.length > 0 && (
        <Section title="Dywidendy" href="/dividends">
          <ul className="card divide-y divide-neutral-200">
            {p.signals.dividends.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-medium text-neutral-800">{d.year ?? "—"}</span>
                {d.amount != null && <span className="tabular-nums text-neutral-700">{price(d.amount, d.currency)}/akcja</span>}
                {d.yieldPct != null && <span className="badge badge-pos">{d.yieldPct.toFixed(2)}%</span>}
                {d.status && <span className="text-xs text-neutral-500">{d.status}</span>}
                <span className="ml-auto text-xs text-neutral-500">{d.recordDate ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="pt-2">
        <Link href="/ranking" className="text-sm text-blue-600 hover:underline">← Ranking</Link>
      </div>
    </main>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-neutral-700">
          <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-blue-500 to-indigo-500" />{title}
        </h2>
        {href && <Link href={href} className="text-xs font-medium text-neutral-500 hover:text-blue-600">Wszystkie →</Link>}
      </div>
      {children}
    </section>
  );
}

function Chip({ c }: { c: RankingComponent }) {
  if (c.score === null)
    return <span className="inline-flex items-center rounded-md border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-500">{c.label} —</span>;
  const pos = c.score > 0.05, neg = c.score < -0.05;
  const cls = pos ? "badge-pos" : neg ? "badge-neg" : "badge-neutral";
  return (
    <span className={`badge ${cls}`} title={`${c.label}: ${c.detail} (waga ${Math.round(c.weight * 100)}%)`}>
      <span className="opacity-70">{pos ? "▲" : neg ? "▼" : "–"}</span> {c.label}: <span className="font-normal opacity-90">{c.detail}</span>
    </span>
  );
}

function OutlookCol({ title, items, tone }: { title: string; items: string[]; tone: "pos" | "neg" | "neutral" }) {
  const head = tone === "pos" ? "text-emerald-700" : tone === "neg" ? "text-rose-700" : "text-blue-700";
  const dot = tone === "pos" ? "bg-emerald-400" : tone === "neg" ? "bg-rose-400" : "bg-blue-400";
  return (
    <div className="card p-3.5">
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${head}`}>{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.length === 0 ? <li className="text-xs text-neutral-400">—</li> : items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-neutral-700">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />{it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${accent === undefined ? "text-neutral-900" : accent ? "text-emerald-600" : "text-rose-600"}`}>{value}</div>
    </div>
  );
}
