"use client";

import { useCallback, useEffect, useState } from "react";
import type { CompanyOutlook, WatchlistItem } from "@/lib/types";

function List({ title, items, tone }: { title: string; items: string[]; tone: "up" | "info" | "down" }) {
  const color =
    tone === "up"
      ? "border-emerald-200 text-emerald-700"
      : tone === "down"
        ? "border-rose-200 text-rose-700"
        : "border-blue-200 text-blue-700";
  const dot = tone === "up" ? "text-emerald-500" : tone === "down" ? "text-rose-600" : "text-blue-500";
  return (
    <div className={`rounded-md border ${color} bg-neutral-50 p-3`}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5 text-sm text-neutral-800">
              <span className={`shrink-0 ${dot}`}>•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutlookCard({
  item,
  outlook,
  onGenerate,
  busy,
  error,
}: {
  item: WatchlistItem;
  outlook?: CompanyOutlook;
  onGenerate: (force: boolean) => void;
  busy: boolean;
  error?: string | null;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
          {item.name} <span className="text-neutral-500">({item.ticker})</span>
          <span className="ml-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {item.market}
          </span>
        </h2>
        <button
          onClick={() => onGenerate(Boolean(outlook))}
          disabled={busy}
          title={outlook ? "Ponowna analiza zużywa tokeny" : "Analiza wywoła model AI (tokeny)"}
          className="rounded-md border border-indigo-700 px-2.5 py-1 text-xs text-indigo-700 transition hover:border-indigo-500 hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Analizuję…" : outlook ? "Analizuj ponownie" : "Analizuj perspektywy"}
        </button>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {!outlook && !error && (
        <p className="text-xs text-neutral-500">
          Kliknij „Analizuj perspektywy" — AI zsyntetyzuje atuty, szanse i zagrożenia na podstawie
          zebranych sygnałów (wyniki, rekomendacje, insiderzy, shorty, pakiety, dywidendy).
        </p>
      )}

      {outlook && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <List title="Atuty obecnie" items={outlook.currentStrengths} tone="up" />
            <List title="Szanse (przyszłość)" items={outlook.futureOpportunities} tone="info" />
            <List title="Zagrożenia (przyszłość)" items={outlook.futureThreats} tone="down" />
          </div>
          {outlook.summary && <p className="text-sm text-neutral-700">{outlook.summary}</p>}
          <p className="text-[10px] text-neutral-500">
            AI ({outlook.model ?? "model"}) na podstawie zebranych sygnałów
            {outlook.createdAt ? ` · ${outlook.createdAt.replace("T", " ")}` : ""} — narzędzie
            informacyjne, nie doradztwo inwestycyjne.
          </p>
        </>
      )}
    </section>
  );
}

export default function OutlookPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [outlooks, setOutlooks] = useState<Record<string, CompanyOutlook>>({});
  const [usingDb, setUsingDb] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wl, ov] = await Promise.all([
        fetch("/api/watchlist", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/outlook", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setItems(wl.items ?? []);
      setOutlooks(ov.outlooks ?? {});
      setUsingDb(Boolean(ov.usingDb) && !wl.usingFallback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało sie pobrac danych.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate(ticker: string, force: boolean) {
    if (force && !window.confirm("Ponowna analiza wywoła model AI i zużyje tokeny. Kontynuować?")) {
      return;
    }
    setBusy(ticker);
    setRowError((m) => ({ ...m, [ticker]: "" }));
    try {
      const res = await fetch("/api/outlook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, force }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOutlooks((m) => ({ ...m, [ticker]: json.outlook }));
    } catch (e) {
      setRowError((m) => ({ ...m, [ticker]: e instanceof Error ? e.message : "Blad analizy." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="space-y-6">
      <div className="card p-5">
        <p className="eyebrow">Analiza AI</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Perspektywy spółek</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          AI syntetyzuje atuty obecne, szanse i zagrożenia na przyszłość na podstawie wszystkich
          zebranych sygnałów (wyniki, rekomendacje, insiderzy, shorty, znaczne pakiety, dywidendy).
          Analiza na żądanie, wynik zapisywany — ponowna tylko na wyraźne kliknięcie.
        </p>
      </div>

      {!usingDb && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Wymaga bazy (Vercel Postgres) oraz <code>ANTHROPIC_API_KEY</code>. Ustaw{" "}
          <code>POSTGRES_URL</code>, uruchom <code>/api/init-db</code> i dodaj klucz Anthropic.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          Błąd: {error}
        </div>
      )}

      {loading && items.length === 0 && <p className="text-sm text-neutral-500">Ładowanie…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-neutral-500">
          Watchlista jest pusta — dodaj spółki na stronie Watchlista.
        </p>
      )}

      <div className="space-y-4">
        {items.map((it) => (
          <OutlookCard
            key={it.id ?? `${it.market}:${it.ticker}`}
            item={it}
            outlook={outlooks[it.ticker]}
            onGenerate={(force) => generate(it.ticker, force)}
            busy={busy === it.ticker}
            error={rowError[it.ticker] || null}
          />
        ))}
      </div>
    </main>
  );
}
