import { LegalPage, H2, P, UL, Fill } from "@/components/Legal";

export const metadata = {
  title: "Polityka prywatności — MarketScope",
  description: "Zasady przetwarzania danych osobowych (RODO) w serwisie MarketScope.",
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Informacje prawne" title="Polityka prywatności" updated="28 września 2026">
      <P>
        Niniejsza Polityka opisuje zasady przetwarzania danych osobowych w serwisie MarketScope zgodnie z
        Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO).
      </P>

      <H2>1. Administrator danych</H2>
      <P>
        Administratorem danych jest <Fill>[IMIĘ I NAZWISKO / NAZWA JDG]</Fill>, prowadzący jednoosobową
        działalność gospodarczą, NIP <Fill>[NIP]</Fill>, kontakt w sprawach danych osobowych:{" "}
        <Fill>[ADRES E-MAIL]</Fill> („Administrator").
      </P>

      <H2>2. Jakie dane przetwarzamy</H2>
      <UL>
        <li>
          <strong>Dane osób pełniących funkcje publiczne/rynkowe</strong> — Serwis prezentuje publicznie
          ogłoszone informacje wynikające z obowiązków regulacyjnych spółek, które mogą zawierać imiona i
          nazwiska osób (np. transakcje osób zarządzających — art. 19 MAR, zawiadomienia o znacznych
          pakietach — art. 69). Dane te pochodzą z publicznie dostępnych komunikatów.
        </li>
        <li>
          <strong>Dane techniczne</strong> — logi serwera (adres IP, typ przeglądarki, czas żądania)
          przetwarzane w celu zapewnienia bezpieczeństwa i poprawnego działania Serwisu.
        </li>
        <li>
          <strong>Pamięć lokalna przeglądarki (localStorage)</strong> — do zapamiętania preferencji
          interfejsu. Dane te pozostają na urządzeniu Użytkownika i nie są przesyłane Administratorowi.
        </li>
      </UL>
      <P>
        Serwis nie prowadzi obecnie kont użytkowników ani nie zbiera danych rejestracyjnych. W razie
        dodania takich funkcji Polityka zostanie zaktualizowana.
      </P>

      <H2>3. Podstawy prawne i cele</H2>
      <UL>
        <li>
          <strong>Art. 6 ust. 1 lit. f RODO</strong> (prawnie uzasadniony interes) — prezentacja publicznie
          dostępnych informacji rynkowych o charakterze informacyjno-analitycznym oraz zapewnienie
          bezpieczeństwa Serwisu.
        </li>
      </UL>

      <H2>4. Źródła danych</H2>
      <P>
        Dane pochodzą ze źródeł zewnętrznych: Yahoo Finance, bankier.pl, publiczny rejestr KNF, NBP oraz
        World Bank. Informacje o osobach fizycznych pochodzą wyłącznie z publicznie ogłoszonych komunikatów
        regulacyjnych.
      </P>

      <H2>5. Odbiorcy danych</H2>
      <P>
        Dane techniczne mogą być przetwarzane przez dostawców infrastruktury: <strong>Vercel Inc.</strong>{" "}
        (hosting) oraz dostawcę bazy danych. Podmioty te działają jako podmioty przetwarzające na podstawie
        odpowiednich umów.
      </P>

      <H2>6. Przekazywanie poza EOG</H2>
      <P>
        W związku z korzystaniem z infrastruktury dostawców z siedzibą w USA (m.in. Vercel) dane mogą być
        przekazywane poza Europejski Obszar Gospodarczy. Przekazywanie odbywa się na podstawie mechanizmów
        zapewniających odpowiedni stopień ochrony (m.in. standardowe klauzule umowne).
      </P>

      <H2>7. Okres przechowywania</H2>
      <P>
        Dane rynkowe i komunikaty przechowywane są przez okres ich przydatności informacyjnej. Logi
        techniczne przechowywane są przez okres niezbędny do zapewnienia bezpieczeństwa.
      </P>

      <H2>8. Prawa osób, których dane dotyczą</H2>
      <P>Przysługuje Państwu prawo do:</P>
      <UL>
        <li>dostępu do danych oraz otrzymania ich kopii;</li>
        <li>sprostowania danych;</li>
        <li>usunięcia danych („prawo do bycia zapomnianym");</li>
        <li>ograniczenia przetwarzania;</li>
        <li>wniesienia sprzeciwu wobec przetwarzania opartego na uzasadnionym interesie;</li>
        <li>wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (PUODO).</li>
      </UL>
      <P>
        W celu realizacji praw prosimy o kontakt: <Fill>[ADRES E-MAIL]</Fill>.
      </P>

      <H2>9. Cookies i pamięć lokalna</H2>
      <P>
        Serwis nie wykorzystuje plików cookies do celów marketingowych ani śledzenia. Wykorzystuje wyłącznie
        pamięć lokalną przeglądarki (localStorage) do zapamiętania preferencji interfejsu, co nie wymaga
        zgody. W razie wdrożenia narzędzi analitycznych lub reklamowych Serwis wprowadzi stosowny mechanizm
        zgody, a Polityka zostanie zaktualizowana.
      </P>

      <H2>10. Kontakt</H2>
      <P>
        We wszystkich sprawach dotyczących ochrony danych osobowych prosimy o kontakt:{" "}
        <Fill>[ADRES E-MAIL]</Fill>.
      </P>
    </LegalPage>
  );
}
