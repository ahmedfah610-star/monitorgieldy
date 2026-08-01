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

## Raporty okresowe (Faza 3)

Strona `/reports` wykrywa nowe raporty finansowe (kwartalne / półroczne / roczne) spółek PL
z watchlisty na podstawie komunikatów ESPI/EBI i zapisuje je z datą (dedup po URL, więc
kolejne odświeżenia wykrywają nowości).

- Źródło: **bankier.pl** — komunikaty per-spółka (`/gielda/notowania/akcje/{SLUG}/komunikaty`),
  agregują ESPI/EBI z GPW/NewConnect. Wymaga ustawionego **„Symbolu bankier"** w watchliście
  (jak rekomendacje). gpw.pl/komunikaty to źródło kanoniczne, ale odrzuca proste zapytania HTTP.
- Wykrywane są raporty okresowe (na bankierze tytuł „Wyniki finansowe {kod} {okres}",
  np. `QSr 1/2026` = kwartalny, `RR 2025` = roczny, `PSr` = półroczny).
- Zapisany `url` to link do komunikatu — punkt wejścia do treści raportu, którą w **Fazie 4**
  wykorzysta ekstrakcja liczb przez Claude.
- Odświeżanie: przycisk na `/reports` (POST `/api/reports/refresh`) lub Vercel Cron (6:30 UTC).

## Analiza AI raportu (Faza 4)

Na `/reports` każdy raport ma przycisk **„Analizuj"** — pobiera treść komunikatu, wyciąga
tabelę „Wybrane dane finansowe" i wysyła do **Claude** (Anthropic API), który zwraca
ustrukturyzowany JSON: przychody, zysk operacyjny/brutto/netto, EPS (bieżący okres i
porównawczy) + krótkie podsumowanie. Wynik zapisuje się w bazie (`reports.extracted_json`)
i pokazuje pod raportem (z wyliczoną zmianą r/r).

- Wymaga **`ANTHROPIC_API_KEY`** w `.env.local` (klucz z [console.anthropic.com](https://console.anthropic.com)).
  Bez klucza przycisk zwraca komunikat 503 — reszta aplikacji działa.
- Model konfigurowalny przez **`ANTHROPIC_MODEL`** (domyślnie `claude-haiku-4-5` — tani i szybki;
  dla wyższej jakości np. `claude-opus-5`).
- Ekstrakcja korzysta z `output_config.format` (wymuszony schemat JSON) — gwarantuje poprawny wynik.

> Ekstrakcja z raportów bywa niedokładna (różne formaty) — traktuj jako pomoc do szybkiego
> przeglądu, nie finalne źródło prawdy. Zweryfikuj z raportem źródłowym.

## Wnioski AI — trendy (Faza 5)

Gdy spółka ma **≥2 przeanalizowane raporty**, na `/reports` pojawia się przycisk
**„Generuj wnioski"** — drugie wywołanie Claude porównuje liczby z kolejnych okresów i pisze
3-4 zdania wniosków po polsku (co się poprawiło/pogorszyło, trendy przychodów i zysków).
Wynik zapisuje się w `ai_conclusions` i pokazuje nad listą raportów spółki. Też wymaga
`ANTHROPIC_API_KEY`.

## Transakcje insiderów — art. 19 MAR (Faza 7)

Strona `/insider` agreguje **powiadomienia o transakcjach osób zarządzających** (art. 19 MAR)
dla spółek PL z watchlisty — kto z zarządu (lub osób blisko powiązanych) kupił/sprzedał akcje
i **za ile**. Tego typu strumienia praktycznie nie ma w polskich narzędziach.

- Źródło: komunikaty ESPI (bankier.pl), ta sama lista per-spółka co raporty. Powiadomienia
  wykrywane po tytule (art. 19 / MAR / „Nabycie akcji przez…").
- Większość emitentów **nie** wpisuje liczb do treści HTML — dołącza standardowy formularz
  ESMA jako **PDF** (`bonnier.pl/static/att/emitent`). PDF ma warstwę tekstową, więc jest
  pobierany i parsowany **kodem** (`unpdf` + regex) — z pola „Informacje zbiorcze" bierzemy
  łączny wolumen i cenę średnią → wartość transakcji. **Bez AI, zero tokenów.**
- Gdy formularza nie da się odczytać (np. skan), wiersz trafia do strumienia jako zdarzenie
  z linkiem „szczegóły w PDF →".
- Dedup po URL komunikatu — kolejne odświeżenia doczytują **tylko nowe** zgłoszenia (limit
  25 PDF-ów na odświeżenie; resztę doczyta następne).
- Odświeżanie: przycisk na `/insider` (POST `/api/insider/refresh`) lub Vercel Cron (6:45 UTC).

## Krótkie pozycje netto — rejestr KNF (Faza 8)

Strona `/short` pokazuje, **kto gra na spadek** spółek PL z watchlisty — z publicznego
rejestru krótkiej sprzedaży KNF (pozycje netto ≥0,5% kapitału).

- Źródło: publiczne **JSON API KNF** (`rss.knf.gov.pl/rss_pub/JSON`, metoda `RssHTable`) —
  czyste dane, **bez AI ani scrapingu HTML**. Filtrujemy po nazwie emitenta (pokrywa się z
  „Symbolem bankier", np. `CDPROJEKT`, `JSW`).
- Zapisujemy każdy wpis (posiadacz, %, ISIN, data obliczenia, data aktualizacji), dedup po
  posiadacz+emitent+data+%. Bieżąca pozycja funduszu = jego najnowszy wpis; „łączna" sumuje
  bieżące pozycje, badge „aktywna" = zgłoszenie z ostatnich 30 dni.
- Odświeżanie: przycisk na `/short` (POST `/api/short/refresh`) lub Vercel Cron (7:00 UTC).

## Znaczne pakiety akcji — art. 69 (Faza 9)

Strona `/holdings` pokazuje **wejścia i wyjścia dużych akcjonariuszy** spółek PL z watchlisty —
zawiadomienia o przekroczeniu progów 5/10/…% (art. 69 ustawy o ofercie).

- Źródło: komunikaty ESPI (bankier), ta sama lista per-spółka. Zawiadomienia wykrywane po
  tytule (art. 69 / „stanu posiadania" / „znaczny pakiet").
- Z **tytułu** (pewny sygnał) czytamy kierunek (wejście/zwiększenie vs wyjście/zmniejszenie) i
  progi. Podmiot zgłaszający oraz udział w głosach po transakcji — **best-effort** z treści HTML
  (bywa w załączonym PDF, wtedy null). Bez AI.
- Dedup po URL, doczytywane tylko nowe. Odświeżanie: `/holdings` (POST `/api/holdings/refresh`)
  lub Vercel Cron (7:15 UTC).

## Dywidendy (Faza 10)

Strona `/dividends` pokazuje dywidendy spółek z watchlisty — **zapowiedziane i historyczne**,
z dniem ustalenia prawa (record date) i dniem wypłaty.

- Źródło: kalendarz dywidend **bankier.pl** (`/gielda/dywidendy`) — jedna tabela z całej giełdy,
  filtrowana do watchlisty po slugu. Czyste parsowanie tabeli, **bez AI**.
- Dane: kwota na akcję, stopa, dzień ustalenia prawa, dzień wypłaty, status
  („proponowana/projekt" = jeszcze niepewna, „uchwalona" = zatwierdzona), rok.
- Upsert z aktualizacją — gdy dywidenda przechodzi z „proponowana" w „uchwalona" (i dochodzą
  daty), wpis się aktualizuje. Odświeżanie: `/dividends` (POST `/api/dividends/refresh`) lub
  Vercel Cron (7:30 UTC).

## Struktura

```
app/
  page.tsx                       # Dashboard końcowy (Faza 6) — notowania + rekomendacje + raporty + wnioski, "Odśwież wszystko"
  recommendations/page.tsx       # Rekomendacje (Faza 2)
  reports/page.tsx               # Raporty okresowe (Faza 3) + analiza AI (Faza 4)
  insider/page.tsx               # Transakcje insiderów — art. 19 MAR (Faza 7)
  short/page.tsx                 # Krótkie pozycje netto — rejestr KNF (Faza 8)
  holdings/page.tsx              # Znaczne pakiety akcji — art. 69 (Faza 9)
  dividends/page.tsx             # Dywidendy — historyczne i zapowiedziane (Faza 10)
  watchlist/page.tsx             # Edycja watchlisty (Faza 0)
  login/page.tsx                 # Ekran logowania (gdy gate włączony)
  api/
    quotes/route.ts              # Agregacja notowań (Yahoo Finance)
    recommendations/route.ts     # Odczyt rekomendacji
    recommendations/refresh/route.ts  # Rekomendacje: pobranie + zapis
    reports/route.ts             # Odczyt raportów
    reports/refresh/route.ts     # Raporty: pobranie + zapis (ręcznie i cron)
    reports/extract/route.ts     # Analiza AI raportu (Faza 4)
    conclusions/route.ts         # Wnioski AI — trendy (Faza 5)
    insider/route.ts             # Odczyt transakcji insiderów
    insider/refresh/route.ts     # Insiderzy: pobranie + parsowanie PDF (ręcznie i cron)
    short/route.ts               # Odczyt krótkich pozycji (KNF)
    short/refresh/route.ts       # Shorty: pobranie z JSON API KNF (ręcznie i cron)
    holdings/route.ts            # Odczyt znacznych pakietów (art. 69)
    holdings/refresh/route.ts    # Pakiety: pobranie + parsowanie tytułu/treści (ręcznie i cron)
    dividends/route.ts           # Odczyt dywidend
    dividends/refresh/route.ts   # Dywidendy: pobranie z kalendarza bankier (ręcznie i cron)
    watchlist/route.ts           # CRUD watchlisty
    init-db/route.ts             # Tworzenie tabel
    login/route.ts               # Logowanie
lib/
  yahoo.ts  quotes.ts  indices.ts        # notowania (Faza 1)
  bankier.ts  finnhub.ts  recommendations.ts  # rekomendacje (Faza 2)
  espi.ts  reports.ts                    # raporty okresowe (Faza 3)
  extract.ts                             # ekstrakcja liczb przez Claude (Faza 4)
  conclusions.ts                         # wnioski AI porównujące okresy (Faza 5)
  insider.ts                             # transakcje insiderów — art. 19 MAR z PDF (Faza 7)
  knf.ts                                 # krótkie pozycje netto — rejestr KNF (Faza 8)
  holdings.ts                            # znaczne pakiety akcji — art. 69 (Faza 9)
  dividends.ts                           # dywidendy — kalendarz bankier.pl (Faza 10)
  db.ts  types.ts  format.ts  auth.ts
db/
  schema.sql                     # Pełny schemat (też tabele pod kolejne fazy)
vercel.json                      # Cron: dzienne odświeżanie rekomendacji i raportów
middleware.ts                    # Opcjonalna ochrona hasłem
```

## Uwaga

Narzędzie **informacyjne, nie doradztwo inwestycyjne**. Dane z Yahoo Finance mogą być
opóźnione względem czasu rzeczywistego.
