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
- Odświeżanie: przycisk na `/reports` (POST `/api/reports/refresh`) lub zbiorczo `/api/refresh-all`.

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
- Odświeżanie: przycisk na `/insider` (POST `/api/insider/refresh`) lub zbiorczo `/api/refresh-all`.

## Krótkie pozycje netto — rejestr KNF (Faza 8)

Strona `/short` pokazuje, **kto gra na spadek** spółek PL z watchlisty — z publicznego
rejestru krótkiej sprzedaży KNF (pozycje netto ≥0,5% kapitału).

- Źródło: publiczne **JSON API KNF** (`rss.knf.gov.pl/rss_pub/JSON`, metoda `RssHTable`) —
  czyste dane, **bez AI ani scrapingu HTML**. Filtrujemy po nazwie emitenta (pokrywa się z
  „Symbolem bankier", np. `CDPROJEKT`, `JSW`).
- Zapisujemy każdy wpis (posiadacz, %, ISIN, data obliczenia, data aktualizacji), dedup po
  posiadacz+emitent+data+%. Bieżąca pozycja funduszu = jego najnowszy wpis; „łączna" sumuje
  bieżące pozycje, badge „aktywna" = zgłoszenie z ostatnich 30 dni.
- Odświeżanie: przycisk na `/short` (POST `/api/short/refresh`) lub zbiorczo `/api/refresh-all`.

## Znaczne pakiety akcji — art. 69 (Faza 9)

Strona `/holdings` pokazuje **wejścia i wyjścia dużych akcjonariuszy** spółek PL z watchlisty —
zawiadomienia o przekroczeniu progów 5/10/…% (art. 69 ustawy o ofercie).

- Źródło: komunikaty ESPI (bankier), ta sama lista per-spółka. Zawiadomienia wykrywane po
  tytule (art. 69 / „stanu posiadania" / „znaczny pakiet").
- Z **tytułu** (pewny sygnał) czytamy kierunek (wejście/zwiększenie vs wyjście/zmniejszenie) i
  progi. Podmiot zgłaszający oraz udział w głosach po transakcji — **best-effort**: najpierw z
  treści HTML, a gdy ich tam nie ma, z załączonego **formularza PDF** art. 69 (`unpdf` + regex,
  bierzemy „% udział w liczbie głosów" po zmianie oraz imię/nazwę zgłaszającego). Bez AI.
- Dedup po URL, doczytywane tylko nowe. Odświeżanie: `/holdings` (POST `/api/holdings/refresh`)
  lub zbiorczo przez `/api/refresh-all` (patrz niżej).

## Dywidendy (Faza 10)

Strona `/dividends` pokazuje dywidendy spółek z watchlisty — **zapowiedziane i historyczne**,
z dniem ustalenia prawa (record date) i dniem wypłaty.

- Źródło: kalendarz dywidend **bankier.pl** (`/gielda/dywidendy`) — jedna tabela z całej giełdy,
  filtrowana do watchlisty po slugu. Czyste parsowanie tabeli, **bez AI**.
- Dane: kwota na akcję, stopa, dzień ustalenia prawa, dzień wypłaty, status
  („proponowana/projekt" = jeszcze niepewna, „uchwalona" = zatwierdzona), rok.
- Upsert z aktualizacją — gdy dywidenda przechodzi z „proponowana" w „uchwalona" (i dochodzą
  daty), wpis się aktualizuje. Odświeżanie: `/dividends` (POST `/api/dividends/refresh`) lub
  zbiorczo `/api/refresh-all`.

## Twoje portfolio (Faza 14)

Strona `/portfolio` — wpisujesz spółki, które masz, i wielkość pozycji w **PLN lub USD**
(USD przeliczane na PLN po stałym kursie **3,75**). **Branża podpina się automatycznie** z
wbudowanej mapy (`lib/sectors.ts`, cały katalog GPW + popularne spółki US; można nadpisać ręcznie).

- Podsumowanie: rozbicie portfela na branże (% i PLN) + **deterministyczna sugestia** dywersyfikacji
  — np. „Masz 80% w branży Technologia i IT — rozważ rozłożenie na: Bankowość, Energetyka,
  Ochrona zdrowia". Próg koncentracji: 40%. Bez AI.
- Pozycje zapisywane w tabeli `portfolio` (wymaga bazy). Yahoo `assetProfile` (sektor) wymaga
  crumba/401, dlatego mapa branż jest wbudowana i przewidywalna.

## Prognozy przychodów (Faza 16)

Strona `/forecast` — **szacunek MarketScope** prognozowanej dynamiki przychodów, łączący trzy
składniki pokazane osobno (deterministycznie, bez AI):

1. **Trend firmy** — dynamika przychodów r/r z ostatniego przeanalizowanego raportu.
2. **Branża** — typowa roczna dynamika sektora (prior; `lib/forecast.ts` ma mapę per branża).
3. **Korekta makro** — `wrażliwość branży na cykl (β) × (wzrost PKB − trend)`. Sektory cykliczne
   (surowce, banki, przemysł, motoryzacja) reagują mocniej; defensywne (ochrona zdrowia, telekom,
   dobra konsumenckie) słabiej.

Prognoza = `0,5·trend firmy + 0,35·branża + korekta makro`, przycięta do rozsądnego zakresu; przy
braku raportu opiera się na branży + makro (pewność „niska"). Pokazujemy też prognozowany przychód
(`ostatni × (1 + dynamika)`). To model **poglądowy**, nie prognoza inwestycyjna.

## Koniunktura makro PL/USA (Faza 15)

Strona `/macro` — klimat makroekonomiczny Polski i USA obok siebie: **inflacja CPI, wzrost PKB,
bezrobocie** (World Bank, ostatnie dostępne roczne, ze strzałką kierunku r/r) + **kursy NBP**
(USD/PLN, EUR/PLN). Z tego liczymy „klimat" 0-100 dla każdego rynku.

- Źródła **keyless**: World Bank API + NBP API. Snapshot cache'owany w `macro_snapshot`,
  odświeżany przyciskiem lub przez `refresh-all`. Bez AI.
- **Wchodzi do rankingu (Faza 13)** jako czynnik `Koniunktura` (waga 10%) — wspólny dla
  wszystkich spółek danego rynku (PL dostają klimat PL, US → USA). To realizuje „makro jako
  kolejny czynnik oceniający atrakcyjność".
- To kluczowe **odczyty** makro (roczne WB + dzienny kurs), nie live feed newsów — kalendarz
  wydarzeń wymagałby płatnego API.

## Ranking atrakcyjności (Faza 13)

Strona `/ranking` to **wewnętrzny, deterministyczny ranking** spółek z watchlisty — wynik 0-100
(50 = neutralnie) liczony ze wszystkich zebranych sygnałów. **Bez AI, zero tokenów**, liczony
w locie przy każdym wejściu.

Model to **wskaźnik złożony** (composite indicator) zbudowany wg podejścia OECD/JRC. Ponieważ nie
mamy zmiennej objaśnianej (przyszłych stóp zwrotu z etykietami), **nie da się** estymować modelu
nadzorowanego — właściwe jest rygorystyczne złożenie sygnałów:

1. **Ciągłe surowe sygnały** per spółka, zorientowane „wyżej = lepiej" (shorty z minusem itd.).
2. **Standaryzacja przekrojowa i odporna:** robust z-score `= (x − mediana) / (1,4826·MAD)` liczony
   na zbiorze spółek, z **winsoryzacją ±2,5σ** — każdy sygnał mierzony względem grupy porównawczej,
   a skrajności (np. short 13%) nie dominują (fallback na odch. std., gdy MAD=0).
3. **Agregacja:** ważona średnia z-score'ów (rekomendacje 18%, **potencjał** 16%, **prognoza
   wzrostu** 12%, insiderzy 14%, krótkie pozycje 13%, wyniki r/r 10%, znaczne pakiety 7%,
   koniunktura 6%, dywidenda 4%). „Potencjał" = `(mediana ceny docelowej − kurs bieżący) / kurs`
   (prognoza + aktualna cena). „Prognoza wzrostu" = forward-looking dynamika przychodów z Fazy 16
   (firma + branża + makro) — dlatego wagi „wyniki r/r" i „koniunktura" są niższe (część ich
   sygnału jest już w prognozie, unikamy podwójnego liczenia). Dywidenda **prognozowana** dostaje
   dyskonto niepewności (×0,6).
4. **Redukcja wg pewności:** `composite × pokrycie wagowe` — mało danych ciągnie ku neutralnemu.
5. **Mapowanie na 0-100 przez dystrybuantę normalną Φ** (50 = mediana rynku) — dobry rozkład
   zamiast liniowego nasycania.

- Chip pokazuje odchylenie składowej w **σ** względem mediany peers; rekomendacje mają tłumienie
  małej próby (`/max(liczba, 4)`); zdarzenia (insiderzy, pakiety) z okna ~180 dni.
- Składowa „koniunktura" różnicuje dopiero spółki **różnych rynków** (wśród samych PL się zeruje —
  poprawne dla rankingu względnego).
- Logika w `lib/ranking.ts`: `buildRanking` (czysta, testowalna funkcja na całym zbiorze).

## Perspektywy spółek (Faza 12)

Strona `/outlook` to analiza AI **ugruntowana we wszystkich zebranych sygnałach** — dla każdej
spółki z watchlisty Claude syntetyzuje **atuty obecne**, **szanse** i **zagrożenia na przyszłość**.

- Kontekst z bazy: wyniki finansowe, konsensus rekomendacji, transakcje insiderów, krótkie
  pozycje KNF, znaczne pakiety (art. 69) i dywidendy — złożone w zwięzły opis i wysłane do modelu
  z wymuszonym schematem JSON. To wyróżnik: nikt nie łączy tych sygnałów w jeden wyprzedzający obraz.
- **Token-frugalnie:** analiza na żądanie (przycisk per spółka), wynik cache'owany w
  `company_outlook`; ponowna analiza tylko na wyraźne kliknięcie (z potwierdzeniem). Model wg
  `ANTHROPIC_MODEL` (domyślnie Haiku).
- Wymaga `ANTHROPIC_API_KEY`. To narzędzie informacyjne, nie doradztwo inwestycyjne.

## Zbiorcze odświeżanie i cron (Faza 11)

Zamiast osobnego crona na każde źródło (limit planu Hobby na Vercelu), jest **jeden**
endpoint `POST/GET /api/refresh-all`, który uruchamia wszystkie odświeżenia naraz
(`Promise.allSettled` — awaria jednego źródła nie psuje reszty) i zwraca zbiorcze podsumowanie.

- `vercel.json` ma teraz **jeden** cron: `/api/refresh-all` codziennie o 6:00 UTC.
- Pojedyncze endpointy `*/refresh` zostają — działają przyciski „Odswiez" na każdej stronie.
- `maxDuration` dla refresh-all to 300 s (Pro); na Hobby ścięte do 60 s — cięższe źródła
  (insiderzy, pakiety z PDF) mogą nie dokończyć w jednym przebiegu, doczytają przy kolejnym.

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
  outlook/page.tsx               # Perspektywy — atuty/szanse/zagrożenia z AI (Faza 12)
  ranking/page.tsx               # Ranking atrakcyjności — wynik z sygnałów (Faza 13)
  portfolio/page.tsx             # Twoje portfolio — pozycje, branże, dywersyfikacja (Faza 14)
  macro/page.tsx                 # Koniunktura makro PL/USA (Faza 15)
  forecast/page.tsx              # Prognozy przychodów — firma + branża + makro (Faza 16)
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
    refresh-all/route.ts         # Zbiorcze odświeżanie wszystkich źródeł (jeden cron)
    outlook/route.ts             # Perspektywy: odczyt + generowanie (AI, cache)
    ranking/route.ts             # Ranking atrakcyjności (liczony z sygnałów, bez AI)
    portfolio/route.ts           # Portfel: odczyt + dodawanie (auto-branża) + usuwanie
    macro/route.ts               # Koniunktura makro: odczyt + odświeżanie (WB + NBP)
    watchlist/route.ts           # CRUD watchlisty
    init-db/route.ts             # Tworzenie tabel
    login/route.ts               # Logowanie
lib/
  yahoo.ts  quotes.ts  indices.ts        # notowania (Faza 1)
  bankier.ts  finnhub.ts  recommendations.ts  # rekomendacje (Faza 2)
  espi.ts  reports.ts                    # raporty okresowe (Faza 3)
  extract.ts                             # ekstrakcja liczb przez Claude (Faza 4)
  conclusions.ts                         # wnioski AI porównujące okresy (Faza 5)
  outlook.ts                             # perspektywy AI z zebranych sygnałów (Faza 12)
  ranking.ts                             # ranking atrakcyjności — scoring z sygnałów (Faza 13)
  portfolio.ts  sectors.ts               # portfel + mapa branż (Faza 14)
  macro.ts                               # koniunktura makro PL/USA — World Bank + NBP (Faza 15)
  forecast.ts                            # prognozy przychodów — firma + branża + makro (Faza 16)
  insider.ts                             # transakcje insiderów — art. 19 MAR z PDF (Faza 7)
  knf.ts                                 # krótkie pozycje netto — rejestr KNF (Faza 8)
  holdings.ts                            # znaczne pakiety akcji — art. 69 (Faza 9)
  dividends.ts                           # dywidendy — kalendarz bankier.pl (Faza 10)
  refreshAll.ts                          # zbiorcze odświeżanie wszystkich źródeł (Faza 11)
  db.ts  types.ts  format.ts  auth.ts
db/
  schema.sql                     # Pełny schemat (też tabele pod kolejne fazy)
vercel.json                      # Cron: jedno dzienne /api/refresh-all (wszystkie źródła)
middleware.ts                    # Opcjonalna ochrona hasłem
```

## Uwaga

Narzędzie **informacyjne, nie doradztwo inwestycyjne**. Dane z Yahoo Finance mogą być
opóźnione względem czasu rzeczywistego.
