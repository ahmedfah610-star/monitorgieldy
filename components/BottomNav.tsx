"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/", label: "Pulpit", icon: <path d="M3 12l9-9 9 9M5 10v10h14V10" /> },
  { href: "/ranking", label: "Ranking", icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { href: "/screener", label: "Screener", icon: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
  { href: "/heatmap", label: "Mapa", icon: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="3" y="13" width="5" height="8" rx="1" /><rect x="10" y="13" width="11" height="8" rx="1" /></> },
];

const MENU: { group: string; items: { href: string; label: string }[] }[] = [
  { group: "Strefa klienta", items: [
    { href: "/account", label: "Konto" }, { href: "/portfolio", label: "Portfel" },
    { href: "/watchlist", label: "Watchlista" }, { href: "/outlook", label: "Perspektywy" }, { href: "/forecast", label: "Prognozy" },
  ] },
  { group: "Rynek", items: [{ href: "/macro", label: "Makro" }] },
  { group: "Dane rynkowe", items: [
    { href: "/recommendations", label: "Rekomendacje" }, { href: "/reports", label: "Raporty" }, { href: "/dividends", label: "Dywidendy" },
  ] },
  { group: "Sygnały", items: [
    { href: "/insider", label: "Insiderzy" }, { href: "/short", label: "Shorty" }, { href: "/holdings", label: "Pakiety" },
  ] },
];
const MENU_HREFS = MENU.flatMap((g) => g.items.map((i) => i.href));

export function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  useEffect(() => setOpen(false), [path]);

  const menuActive = MENU_HREFS.some((h) => active(h));

  return (
    <>
      {/* Arkusz „Więcej" */}
      {open && (
        <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm" />
          <div
            className="absolute inset-x-0 bottom-[68px] mx-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl shadow-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            {MENU.map((g) => (
              <div key={g.group} className="mb-2 last:mb-0">
                <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{g.group}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {g.items.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`rounded-lg px-2 py-2 text-center text-xs font-medium transition ${active(it.href) ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"}`}
                    >
                      {it.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/90 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((it) => {
            const on = active(it.href);
            return (
              <Link key={it.href} href={it.href} className="relative flex flex-col items-center gap-0.5 py-2.5">
                {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />}
                <NavIcon on={on}>{it.icon}</NavIcon>
                <span className={`text-[10px] font-medium ${on ? "text-blue-700" : "text-neutral-500"}`}>{it.label}</span>
              </Link>
            );
          })}
          <button onClick={() => setOpen((v) => !v)} className="relative flex flex-col items-center gap-0.5 py-2.5">
            {(menuActive || open) && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />}
            <NavIcon on={menuActive || open}>
              <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>
            </NavIcon>
            <span className={`text-[10px] font-medium ${menuActive || open ? "text-blue-700" : "text-neutral-500"}`}>Więcej</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function NavIcon({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={on ? "rgb(37 99 235)" : "rgb(115 115 115)"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
