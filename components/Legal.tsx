// Wspólne prymitywy do stron prawnych (Regulamin / Polityka / Zastrzeżenia),
// żeby wszystkie miały spójną typografię bez wtyczki prose.

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div className="card p-5 sm:p-7">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-2 text-xs text-neutral-500">Ostatnia aktualizacja: {updated}</p>
        <div className="mt-5 space-y-1">{children}</div>
      </div>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-7 text-base font-semibold text-neutral-900">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-neutral-600">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-neutral-600">{children}</ul>;
}

/** Miejsce do uzupełnienia danych operatora — wizualnie oznaczone. */
export function Fill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[13px] text-amber-800">{children}</span>
  );
}
