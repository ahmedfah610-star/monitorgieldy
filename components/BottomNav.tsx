"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/", label: "Pulpit", icon: <path d="M3 12l9-9 9 9M5 10v10h14V10" /> },
  { href: "/ranking", label: "Ranking", icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { href: "/screener", label: "Screener", icon: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
  { href: "/heatmap", label: "Mapa", icon: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="3" y="13" width="5" height="8" rx="1" /><rect x="10" y="13" width="11" height="8" rx="1" /></> },
  { href: "/account", label: "Konto", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
];

export function BottomNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/85 backdrop-blur-xl sm:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((it) => {
          const on = active(it.href);
          return (
            <Link key={it.href} href={it.href} className="relative flex flex-col items-center gap-0.5 py-2.5">
              {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />}
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={on ? "rgb(96 165 250)" : "rgb(115 115 115)"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {it.icon}
              </svg>
              <span className={`text-[10px] font-medium ${on ? "text-blue-700" : "text-neutral-500"}`}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
