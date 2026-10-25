export type Market = "no" | "pl";

export type MarketContent = {
  market: Market;
  locale: string;
  navLabel: string;
  otherMarket: { href: string; label: string };
  currency: string;
  h1: string;
  subtitle: string;
  demo: {
    badge: string;
    detectedLabel: string;
    detectedValue: string;
    panelTitle: string;
    panelBody: string;
    warning: string;
  };
  cta: {
    label: string;
    note: string;
  };
  packages: {
    id: "response" | "guardian";
    name: string;
    price: string;
    description: string;
    default?: boolean;
  }[];
  form: {
    title: string;
    step1: {
      title: string;
      uploadHint: string;
      privacy: string;
    };
    step2: {
      title: string;
      fields: {
        id: string;
        label: string;
        type: "date" | "text" | "textarea" | "radio";
        options?: { value: string; label: string }[];
        placeholder?: string;
        required?: boolean;
      }[];
    };
    step3: {
      title: string;
      emailLabel: string;
      phoneLabel: string;
      phoneHint: string;
      payCta: string;
    };
  };
  footerNote: string;
};

export const brand = {
  name: "Rada Pism",
  tagline: "Panel AI · dokumenty z weryfikacją",
  pilot: "Smoke Test 48h · pilotaż z weryfikacją",
};

export const markets: Record<Market, MarketContent> = {
  no: {
    market: "no",
    locale: "pl-NO",
    navLabel: "NO — Inkasso / Pisma",
    otherMarket: { href: "/pl", label: "PL — Kosztorys OC/AC" },
    currency: "NOK",
    h1: "Kwestionujesz inkasso lub pismo urzędowe w Norwegii? Zrozum dokument po polsku i przygotuj odpowiedź po norwesku.",
    subtitle:
      "Sprawdzamy terminy, weryfikujemy podstawę naliczonych opłat przez panel 3 modeli AI i przygotowujemy gotowe pismo w 3 tonacjach do wyboru.",
    demo: {
      badge: "PRZYKŁAD DEMONSTRACYJNY",
      detectedLabel: "Wykryty dokument",
      detectedValue: "Inkassovarsel / Wezwanie do zapłaty",
      panelTitle: "Ustalenie Panelu (3/3 modeli zgodnych)",
      panelBody:
        "W przesłanym wezwaniu naliczono opłatę dodatkową, ale nie wskazano daty pierwotnego upomnienia. Zgodnie z Inkassoloven § 9 i § 10 zgłoszenie uzasadnionego sprzeciwu (omtvistet krav) wstrzymuje standardową windykację do czasu wyjaśnienia sporu.",
      warning:
        "⚠️ Nie pisz w odpowiedzi prośby o rozłożenie na raty, jeśli nie zgadzasz się z kwotą – taka prośba oznacza uznanie długu.",
    },
    cta: {
      label: "Zamów odpowiedź — 299 NOK",
      note: "Pilotaż z weryfikacją. Gotowy dokument po norwesku + tłumaczenie i instrukcja po polsku do 24h. Płatność jednorazowa (Karta / Vipps).",
    },
    packages: [
      {
        id: "response",
        name: "Gotowa odpowiedź",
        price: "299 NOK",
        description: "Pismo po norwesku + tłumaczenie i instrukcja po polsku",
        default: true,
      },
      {
        id: "guardian",
        name: "Strażnik Sprawy",
        price: "799 NOK",
        description: "Obsługa do 2 kolejnych pism przez 12 mies.",
      },
    ],
    form: {
      title: "Zamów analizę i odpowiedź",
      step1: {
        title: "Wgraj dokument",
        uploadHint: "Zdjęcie lub PDF wezwania / pisma urzędowego",
        privacy:
          "Twoje dokumenty są poufne i nie trafiają do zewnętrznych skryptów analitycznych.",
      },
      step2: {
        title: "Kwalifikacja",
        fields: [
          {
            id: "receivedAt",
            label: "Kiedy odebrałeś pismo?",
            type: "date",
            required: true,
          },
          {
            id: "agreeAmount",
            label: "Czy zgadzasz się z główną kwotą należności?",
            type: "radio",
            required: true,
            options: [
              { value: "yes", label: "Tak" },
              { value: "no", label: "Nie" },
              { value: "partial", label: "Częściowo" },
            ],
          },
          {
            id: "situation",
            label: "Krótki opis sytuacji po polsku (2–3 zdania)",
            type: "textarea",
            placeholder: "Opisz kontekst: skąd pismo, czy dostałeś wcześniejsze upomnienie, co kwestionujesz…",
            required: true,
          },
        ],
      },
      step3: {
        title: "Pakiet i kontakt",
        emailLabel: "E-mail",
        phoneLabel: "Telefon (opcjonalnie)",
        phoneHint: "Do powiadomienia SMS o gotowym piśmie",
        payCta: "Przejdź do płatności",
      },
    },
    footerNote:
      "System wykorzystuje wielomodelową analizę AI do porządkowania dokumentów i przygotowania szkiców pism. Usługa nie stanowi zastępstwa procesowego ani indywidualnej porady adwokackiej. Dostępne są również bezpłatne ścieżki publiczne (w Norwegii: pomoc informacyjna NAV / Finansklagenemnda — FinKN).",
  },
  pl: {
    market: "pl",
    locale: "pl-PL",
    navLabel: "PL — Kosztorys OC/AC",
    otherMarket: { href: "/no", label: "NO — Inkasso / Pisma" },
    currency: "PLN",
    h1: "Zaniżony kosztorys z OC sprawcy? Przygotuj odwołanie odnoszące się do konkretnych pozycji.",
    subtitle:
      "Wskazujemy brakujące uzasadnienia stawek roboczogodziny oraz zamienników i generujemy przedsądowe wezwanie do dopłaty.",
    demo: {
      badge: "PRZYKŁAD DEMONSTRACYJNY",
      detectedLabel: "Wykryty punkt",
      detectedValue:
        "W kosztorysie przyjęto stawkę 70 zł/rbg oraz urealnienie części o 40%.",
      panelTitle: "Ustalenie Panelu (3/3 modeli zgodnych)",
      panelBody:
        "Panel 3/3 modeli potwierdza brak wskazania źródła rynkowego tej stawki w dokumencie (uchwała SN III CZP 85/11).",
      warning:
        "⚠️ Jeśli podpiszesz ugodę przy wypłacie kwoty bezspornej, zamkniesz sobie drogę do dopłaty różnicy.",
    },
    cta: {
      label: "Przygotuj odwołanie — 99 zł",
      note: "Pilotaż z weryfikacją. Gotowe pismo PDF + wersja edytowalna i instrukcja wysłania do 24h. Płatność jednorazowa (BLIK / Karta).",
    },
    packages: [
      {
        id: "response",
        name: "Gotowa odpowiedź",
        price: "99 zł",
        description: "Pismo PDF + wersja edytowalna i instrukcja wysłania",
        default: true,
      },
      {
        id: "guardian",
        name: "Strażnik Sprawy",
        price: "249 zł",
        description: "Obsługa do 2 kolejnych pism przez 12 mies.",
      },
    ],
    form: {
      title: "Zamów odwołanie",
      step1: {
        title: "Wgraj dokument",
        uploadHint: "Zdjęcie lub PDF kosztorysu / decyzji ubezpieczyciela",
        privacy:
          "Twoje dokumenty są poufne i nie trafiają do zewnętrznych skryptów analitycznych.",
      },
      step2: {
        title: "Kwalifikacja",
        fields: [
          {
            id: "decisionAt",
            label: "Kiedy wydano decyzję/kosztorys?",
            type: "date",
            required: true,
          },
          {
            id: "amounts",
            label:
              "Jaka jest kwota bezsporna z kosztorysu, a na ile wycenia naprawę warsztat (jeśli masz wycenę)?",
            type: "textarea",
            placeholder: "np. bezsporna 4 200 zł, warsztat 7 800 zł",
            required: true,
          },
          {
            id: "settlement",
            label: "Czy podpisałeś już ugodę?",
            type: "radio",
            required: true,
            options: [
              { value: "yes", label: "Tak" },
              { value: "no", label: "Nie" },
            ],
          },
        ],
      },
      step3: {
        title: "Pakiet i kontakt",
        emailLabel: "E-mail",
        phoneLabel: "Telefon (opcjonalnie)",
        phoneHint: "Do powiadomienia SMS o gotowym piśmie",
        payCta: "Przejdź do płatności",
      },
    },
    footerNote:
      "System wykorzystuje wielomodelową analizę AI do porządkowania dokumentów i przygotowania szkiców pism. Usługa nie stanowi zastępstwa procesowego ani indywidualnej porady adwokackiej. Dostępne są również bezpłatne ścieżki publiczne (w Polsce: Rzecznik Finansowy / Miejski Rzecznik Konsumentów).",
  },
};

export const sharedFooterAiAct =
  "System wykorzystuje wielomodelową analizę AI do porządkowania dokumentów i przygotowania szkiców pism. Usługa nie stanowi zastępstwa procesowego ani indywidualnej porady adwokackiej. Dostępne są również bezpłatne ścieżki publiczne (w Polsce: Rzecznik Finansowy / Miejski Rzecznik Konsumentów; w Norwegii: pomoc informacyjna NAV / Finansklagenemnda — FinKN).";
