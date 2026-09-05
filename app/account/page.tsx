"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Summary {
  positions: number;
  totalPln: number | null;
  watch: number;
  usingDb: boolean;
}

const money = (v: number) =>
  v.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) + " zł";

export default function AccountPage() {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      fetch("/api/portfolio", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/watchlist", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([p, w]) => {
      if (!alive) return;
      const pv = p.status === "fulfilled" ? p.value : {};
      const wv = w.status === "fulfilled" ? w.value : {};
      setS({
        positions: (pv.positions ?? []).length,
        totalPln: pv.summary?.totalPln ?? null,
        watch: (wv.items ?? []).length,
        usingDb: Boolean(pv.usingDb),
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const tiles: { href: string; title: string; desc: string; stat?: string; icon: React.ReactNode }[] = [
    {
      href: "/portfolio",
      title: "Portfel",
      desc: "Twoje pozycje w PLN/USD, wartość i dywersyfikacja na branże.",
      stat: s ? `${s.positions} pozycji${s.totalPln ? ` · ${money(s.totalPln)}` : ""}` : undefined,
      icon: <><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20M7 3h10" /></>,
    },
    {
      href: "/watchlist",
      title: "Watchlista",
      desc: "Spółki, które śledzisz — zasilają ranking, screener i sekcje.",
      stat: s ? `${s.watch} spółek` : undefined,
      icon: <><circle cx="12" cy="12" r="3" /><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /></>,
    },
    {
      href: "/outlook",
      title: "Perspektywy AI",
      desc: "Atuty, szanse i zagrożenia każdej spółki — synteza AI.",
      icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2.5" /></>,
    },
    {
      href: "/forecast",
      title: "Prognozy",
      desc: "Prognozowane przychody wg branży, raportów i makro.",
      icon: <path d="M3 17l5-5 4 3 7-8M16 4h4v4" />,
    },
  ];

  return (
    <main className="space-y-5">
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative">
          <p className="eyebrow">Strefa klienta</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">Twoje konto</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Wszystko osobiste w jednym miejscu — portfel, watchlista i analizy AI dopasowane do Twoich spółek.
          </p>
          {s && (
            <div className="relative mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
              <MiniStat label="Wartość portfela" value={s.totalPln != null ? money(s.totalPln) : "—"} />
              <MiniStat label="Pozycji" value={String(s.positions)} />
              <MiniStat label="Obserwowane" value={String(s.watch)} />
            </div>
          )}
        </div>
      </div>

      {s && !s.usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Baza nie jest skonfigurowana — dane portfela i watchlisty wymagają Vercel Postgres
          (<code>POSTGRES_URL</code> + <code>/api/init-db</code>).
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="card card-hover flex items-start gap-3.5 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/25">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-900">{t.title}</span>
                {t.stat && <span className="badge badge-neutral">{t.stat}</span>}
              </div>
              <p className="mt-0.5 text-sm text-neutral-600">{t.desc}</p>
            </div>
            <span className="ml-auto self-center text-neutral-400">→</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[130px] flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-neutral-900">{value}</div>
    </div>
  );
}
