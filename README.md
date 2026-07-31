# Market Dashboard

Osobisty dashboard rynkowy (GPW + USA). Zbudowany wg [PLAN.md](PLAN.md).
Aktualny stan: **Faza 0 (setup + watchlista) i Faza 1 (notowania Stooq)**.

## Stos

- Next.js 15 (App Router) + TypeScript + Tailwind
- Vercel Postgres (`@vercel/postgres`)
- Dane notowań: **Yahoo Finance chart API** (JSON, bez klucza)

> Uwaga: pierwotny plan zakładał Stooq, ale w 2026 Stooq dodał ochronę antybotową
> (JS proof-of-work) na endpointach CSV — przestały działać bez przeglądarki. Dlatego
> Faza 1 korzysta z Yahoo Finance, które jest keyless i pokrywa GPW oraz USA.

## Szybki start (lokalnie)

Wymagany **Node.js 18.18+** (zalecane LTS 20 lub 22).

```bash
npm install
npm run dev
```

Otwórz http://localhost:3000.

> Bez skonfigurowanej bazy aplikacja działa w **trybie fallback**: dashboard i watchlista
> pokazują domyślną listę spółek (tylko do odczytu). Notowania Stooq działają od razu,
> bez bazy i bez kluczy API.

## Konfiguracja bazy (Vercel Postgres)

1. Skopiuj `.env.local.example` do `.env.local`.
2. W panelu Vercel: **Storage → Create Database → Postgres**, potem zakładka
   `.env.local` — skopiuj `POSTGRES_URL` do swojego pliku.
3. Utwórz tabele: uruchom aplikację i otwórz **http://localhost:3000/api/init-db**
   (idempotentne — można wołać wielokrotnie).
4. Od teraz watchlista zapisuje się w bazie — dodawaj/usuwaj pozycje na `/watchlist`.

## Ochrona hasłem (opcjonalna)

Ustaw `DASHBOARD_PASSWORD` w `.env.local` (lub w zmiennych środowiskowych na Vercelu).
Gdy jest ustawione, cała aplikacja chowa się za ekranem `/login`. Puste = brak gate'a
(wygodne lokalnie).

## Tickery (Yahoo Finance)

W watchliście wpisujesz **sam ticker** i wybierasz rynek — właściwy sufiks Yahoo
dokładany jest automatycznie:

- **PL (GPW):** ticker → `TICKER.WA`, np. `pkn` → `PKN.WA`, `cdr` → `CDR.WA`.
- **US:** ticker bez sufiksu, np. `aapl` → `AAPL`, `msft` → `MSFT`.
- **Indeksy (wbudowane):** `WIG20.WA`, `MWIG40.WA`, `^GSPC` (S&P 500), `^IXIC` (Nasdaq).

## Rekomendacje analityków (Faza 2)

Strona `/recommendations` pokazuje rekomendacje dla Twojej watchlisty + najnowszy feed
z rynku. Dane zapisują się w bazie (z datą), więc kolejne odświeżenia wykrywają, co nowe.

Źródła:
- **PL — bankier.pl** (scraping, bez klucza). Dla każdej spółki PL ustaw w watchliście
  **„Symbol bankier"** — slug z URL strony spółki, np. `CDPROJEKT`
  (`/gielda/notowania/akcje/CDPROJEKT/rekomendacje`). Bez slugu spółka jest pomijana.
  Dodatkowo pobierany jest globalny feed najnowszych rekomendacji z rynku.
- **US — Finnhub** (recommendation trends, konsensus analityków). Wymaga darmowego klucza:
  załóż konto na [finnhub.io](https://finnhub.io), skopiuj token do `FINNHUB_API_KEY`
  w `.env.local`. Bez klucza rekomendacje US są pomijane (reszta działa).

Odświeżanie:
- ręcznie — przycisk **„Odswiez rekomendacje"** na `/recommendations` (POST `/api/recommendations/refresh`),
- automatycznie — **Vercel Cron** codziennie o 6:00 UTC (`vercel.json`). Opcjonalnie ustaw
  `CRON_SECRET`, aby zabezpieczyć wywołanie GET.

> Wymaga bazy (Vercel Postgres). `@vercel/postgres` łączy się przez sterownik Neon, więc
> działa z bazą Vercel/Neon — nie z lokalnym Postgresem.

## Struktura

```
app/
  page.tsx                       # Dashboard (Faza 1) — "Odśwież teraz"
  recommendations/page.tsx       # Rekomendacje (Faza 2)
  watchlist/page.tsx             # Edycja watchlisty (Faza 0)
  login/page.tsx                 # Ekran logowania (gdy gate włączony)
  api/
    quotes/route.ts              # Agregacja notowań (Yahoo Finance)
    recommendations/route.ts     # Odczyt zapisanych rekomendacji
    recommendations/refresh/route.ts  # Pobranie + zapis (ręcznie i cron)
    watchlist/route.ts           # CRUD watchlisty
    init-db/route.ts             # Tworzenie tabel
    login/route.ts               # Logowanie
lib/
  yahoo.ts  quotes.ts  indices.ts        # notowania (Faza 1)
  bankier.ts  finnhub.ts  recommendations.ts  # rekomendacje (Faza 2)
  db.ts  types.ts  format.ts  auth.ts
db/
  schema.sql                     # Pełny schemat (też tabele pod kolejne fazy)
vercel.json                      # Cron: dzienne odświeżanie rekomendacji
middleware.ts                    # Opcjonalna ochrona hasłem
```

## Uwaga

Narzędzie **informacyjne, nie doradztwo inwestycyjne**. Dane z Yahoo Finance mogą być
opóźnione względem czasu rzeczywistego.
