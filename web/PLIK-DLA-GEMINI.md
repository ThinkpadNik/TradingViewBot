# Rada Pism — kontekst dla Gemini (po ETAP 1)

Skopiuj ten plik do Gemini (lub wskaż go w workspace), gdy kontynuujesz pracę nad projektem.

## Cel produktu

Pilotaż **Smoke Test 48h** — landing + formularz kwalifikacji dla dwóch niezależnych rynków:

| Rynek | Ścieżka | Oferta |
|-------|---------|--------|
| Norwegia (domyślna) | `/no` (`/` → redirect) | Inkasso / pisma urzędowe — **299 NOK** |
| Polska | `/pl` | Kosztorys OC/AC — **99 zł** |

Zero obowiązku zakładania konta przed uploadem dokumentu.

Marka: **Rada Pism** · „Panel AI · dokumenty z weryfikacją”.

---

## Co już jest zrobione (ETAP 1)

Aplikacja: **Next.js (App Router) + Tailwind + TypeScript** w katalogu `web/`.

### Above the fold (oba rynki — dokładnie 3 bloki)

1. **Problem** — H1 + podtytuł (treści w `src/lib/content.ts`)
2. **Dowód** — panel UI „PRZYKŁAD DEMONSTRACYJNY” (ustalenie panelu 3/3 + ostrzeżenie taktyczne)
3. **Oferta + CTA** — przycisk ceny + nota o pilotażu / płatności

### Formularz (po kliknięciu CTA lub `#zamowienie`)

1. Upload zdjęcia/PDF + nota poufności  
2. Kwalifikacja (inne pytania dla NO i PL)  
3. Pakiet (Gotowa odpowiedź / Strażnik Sprawy) + e-mail + opcjonalny telefon → „Przejdź do płatności”

### Stopka

Ujawnienie zgodne z **AI Act Art. 50** + ścieżki publiczne (PL: Rzecznik Finansowy / MRK; NO: NAV / FinKN).

### Uruchomienie

```bash
cd web
npm install
npm run dev      # http://localhost:3000 → /no
npm run build && npm start
npm run lint     # tsc --noEmit
```

---

## Mapa plików (ważne)

```
web/
├── src/app/
│   ├── layout.tsx          # fonty Fraunces + Figtree, metadata
│   ├── globals.css         # tokeny CSS, atmosphere, animacje
│   ├── page.tsx            # redirect → /no
│   ├── no/page.tsx
│   └── pl/page.tsx
├── src/components/
│   ├── LandingPage.tsx     # client: CTA → otwarcie formularza
│   ├── SiteHeader.tsx      # marka + przełącznik NO/PL
│   ├── DemoPanel.tsx       # karta demonstracyjna
│   ├── QualificationForm.tsx  # 3 kroki, walidacja, submit lokalny
│   └── TrustFooter.tsx     # AI Act
├── src/lib/content.ts      # WSZYSTKIE treści NO/PL — edytuj tu copy
├── package.json
└── README.md
```

Treści rynkowe: **jeden źródłowy plik** `src/lib/content.ts` (`markets.no` / `markets.pl`). Nie duplikuj copy w komponentach.

Design: fjord/ink (`--ink`, `--fjord`, `--accent`), bez fioletu / cream+terracotta / broadsheet. Motion: `animate-rise*`, `animate-panel-in`.

---

## Zachowanie formularza (stan obecny)

- Submit **nie** woła jeszcze API ani bramki płatności — zapisuje intencję lokalnie i pokazuje ekran „Zgłoszenie zapisane”.
- CTA ustawia `#zamowienie` i scrolluje do sekcji.
- Walidacja: brak pliku na kroku 1, puste pola kwalifikacji, niepoprawny e-mail.

---

## Czego NIE robić bez potrzeby

- Nie przenoś copy poza `content.ts`.
- Nie wymagaj konta przed uploadem.
- Nie usuwaj ujawnienia AI Act z stopki.
- Nie zamieniaj fontów na Inter/Roboto/Arial/system jako domyślne.
- Repo nadrzędne ma też kod Pythona (Telegram/relay) — landing żyje w **`web/`**; nie mieszaj stacków bez powodu.

---

## Sugerowany ETAP 2+ (dla Ciebie / kolejnej sesji)

Priorytet pod smoke test 48h:

1. **Backend zgłoszeń** — API `POST` (plik + pola kwalifikacji + pakiet + kontakt); storage bezpieczny; e-mail potwierdzenia.
2. **Płatności**
   - NO: Karta / Vipps  
   - PL: BLIK / Karta  
   Po sukcesie płatności: status „opłacone” + kolejka do weryfikacji ludzkiej / panelu AI.
3. **Panel operatora** (minimalny) — lista spraw, podgląd dokumentu, oznaczenie „wysłane w 24h”.
4. **Analytics** — bez zewnętrznych skryptów na samym pliku dokumentu (zgodnie z obietnicą poufności); eventy tylko na CTA / płatność / konwersję.
5. Deploy (Vercel lub inny) + domena `/no` `/pl`.

Jeśli użytkownik wklei konkretny brief ETAP 2 — realizuj ten brief; powyższa lista to domyślny backlog.

---

## Copy referencyjne (skrót — pełne w `content.ts`)

### NO
- H1: *Kwestionujesz inkasso lub pismo urzędowe w Norwegii?…*
- CTA: `Zamów odpowiedź — 299 NOK`
- Pakiety: 299 NOK / 799 NOK (Strażnik Sprawy)

### PL
- H1: *Zaniżony kosztorys z OC sprawcy?…*
- CTA: `Przygotuj odwołanie — 99 zł`
- Pakiety: 99 zł / 249 zł (Strażnik Sprawy)

---

## PR / branch

- Branch: `cursor/rada-pism-landing-fa95`
- PR (jeśli nadal otwarty): sprawdź na GitHubie repozytorium projektu PR z tytułem o Rada Pism landing NO/PL.

---

## Instrukcja startowa dla Gemini

> Jesteś full-stack developerem. Projekt Rada Pism — ETAP 1 (landing + formularz) jest w `web/`.  
> Najpierw przeczytaj `web/PLIK-DLA-GEMINI.md` i `web/src/lib/content.ts`.  
> Potem realizuj zadanie użytkownika (zwykle ETAP 2: API zgłoszeń + płatności), bez psucia istniejącego CRO above-the-fold i bez wymogu konta przed uploadem.
