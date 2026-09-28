import { LegalPage, H2, P, UL, Fill } from "@/components/Legal";

export const metadata = {
  title: "Regulamin — MarketScope",
  description: "Regulamin świadczenia usług drogą elektroniczną w serwisie MarketScope.",
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Informacje prawne" title="Regulamin serwisu" updated="28 września 2026">
      <P>
        Niniejszy Regulamin określa zasady korzystania z serwisu internetowego MarketScope, dostępnego pod
        adresem monitorgieldy.vercel.app („Serwis"), oraz zasady świadczenia usług drogą elektroniczną
        zgodnie z ustawą z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną.
      </P>

      <H2>§1. Operator</H2>
      <P>
        Operatorem Serwisu jest <Fill>[IMIĘ I NAZWISKO / NAZWA JDG]</Fill>, prowadzący jednoosobową
        działalność gospodarczą pod adresem <Fill>[ADRES]</Fill>, NIP <Fill>[NIP]</Fill>, REGON{" "}
        <Fill>[REGON]</Fill>, kontakt: <Fill>[ADRES E-MAIL]</Fill> („Operator").
      </P>

      <H2>§2. Definicje</H2>
      <UL>
        <li><strong>Serwis</strong> — serwis internetowy MarketScope wraz ze wszystkimi funkcjami.</li>
        <li><strong>Użytkownik</strong> — osoba korzystająca z Serwisu.</li>
        <li><strong>Usługa</strong> — nieodpłatne udostępnienie treści informacyjno-analitycznych w Serwisie.</li>
      </UL>

      <H2>§3. Przedmiot i charakter usługi</H2>
      <P>
        Serwis udostępnia narzędzie informacyjno-analityczne prezentujące publicznie dostępne dane rynkowe,
        wskaźniki oraz autorskie zestawienia ilościowe dotyczące spółek giełdowych. Usługa świadczona jest
        nieodpłatnie.
      </P>
      <P>
        Treści w Serwisie <strong>nie stanowią doradztwa inwestycyjnego</strong> (w rozumieniu ustawy o
        obrocie instrumentami finansowymi) ani <strong>rekomendacji inwestycyjnej</strong> (w rozumieniu MAR
        oraz Rozporządzenia delegowanego UE 2016/958), o czym szczegółowo stanowią{" "}
        <a href="/zastrzezenia" className="text-blue-600 hover:underline">Zastrzeżenia prawne</a>. Użytkownik
        podejmuje decyzje inwestycyjne samodzielnie i na własną odpowiedzialność.
      </P>

      <H2>§4. Wymagania techniczne</H2>
      <P>
        Do korzystania z Serwisu niezbędne jest urządzenie z dostępem do Internetu oraz aktualna przeglądarka
        internetowa z włączoną obsługą JavaScript. Serwis wykorzystuje pamięć lokalną przeglądarki
        (localStorage) do zapamiętywania preferencji interfejsu.
      </P>

      <H2>§5. Zasady korzystania</H2>
      <UL>
        <li>Użytkownik zobowiązuje się korzystać z Serwisu zgodnie z prawem i dobrymi obyczajami.</li>
        <li>Zakazane jest dostarczanie treści o charakterze bezprawnym.</li>
        <li>Zakazane jest automatyczne masowe pobieranie danych z Serwisu (scraping) oraz działania obciążające infrastrukturę ponad zwykłe korzystanie.</li>
      </UL>

      <H2>§6. Własność intelektualna i źródła danych</H2>
      <P>
        Autorskie elementy Serwisu (metodyka, interfejs, zestawienia) podlegają ochronie prawnej. Dane
        źródłowe pochodzą od podmiotów trzecich (m.in. Yahoo Finance, bankier.pl, KNF, NBP, World Bank) i
        prawa do nich przysługują ich dostawcom; są prezentowane w celach informacyjnych.
      </P>

      <H2>§7. Odpowiedzialność</H2>
      <P>
        Operator dokłada starań, aby dane były aktualne i poprawne, jednak — z uwagi na korzystanie ze źródeł
        zewnętrznych — nie gwarantuje ich kompletności, bezbłędności ani ciągłości dostępu do Serwisu.
        Operator nie ponosi odpowiedzialności za decyzje inwestycyjne podjęte na podstawie treści Serwisu ani
        za ich skutki, w zakresie dopuszczalnym przez prawo.
      </P>

      <H2>§8. Reklamacje</H2>
      <P>
        Reklamacje dotyczące działania Serwisu można zgłaszać na adres <Fill>[ADRES E-MAIL]</Fill>. Reklamacja
        zostanie rozpatrzona w terminie 14 dni od jej otrzymania.
      </P>

      <H2>§9. Dane osobowe</H2>
      <P>
        Zasady przetwarzania danych osobowych opisuje{" "}
        <a href="/polityka-prywatnosci" className="text-blue-600 hover:underline">Polityka prywatności</a>.
      </P>

      <H2>§10. Zmiany Regulaminu i postanowienia końcowe</H2>
      <P>
        Operator może zmienić Regulamin z ważnych przyczyn; zmiany publikowane są w Serwisie. W sprawach
        nieuregulowanych zastosowanie ma prawo polskie. Ewentualne spory rozstrzyga sąd właściwy miejscowo
        zgodnie z przepisami prawa.
      </P>
    </LegalPage>
  );
}
