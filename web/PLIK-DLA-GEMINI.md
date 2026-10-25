# Rada Pism — kontekst dla Gemini (po ETAP 1–3)

Skopiuj ten plik do Gemini (lub wskaż go w workspace), gdy kontynuujesz pracę nad projektem.

## Cel produktu

Pilotaż **Smoke Test 48h** — landing + formularz kwalifikacji + API zgłoszeń dla dwóch niezależnych rynków:

| Rynek | Ścieżka | Oferta |
|-------|---------|--------|
| Norwegia (domyślna) | `/no` (`/` → redirect) | Inkasso / pisma urzędowe — **299 NOK** |
| Polska | `/pl` | Kosztorys OC/AC — **99 zł** |

Zero obowiązku zakładania konta przed uploadem dokumentu.

Marka: **Rada Pism** · „Panel AI · dokumenty z weryfikacją”.

Stack: **Next.js App Router + TypeScript + Tailwind** w katalogu `web/`.

---

## Co już jest zrobione

### ETAP 1 — Landing + formularz UI

- Above the fold (3 bloki): problem → panel demonstracyjny AI → CTA
- Formularz 3-krokowy po CTA / `#zamowienie`: upload → kwalifikacja (osobna NO/PL) → pakiet + kontakt
- Przełącznik rynku w nagłówku; stopka **AI Act Art. 50**
- Treści wyłącznie w `src/lib/content.ts` (`markets.no` / `markets.pl`)

### ETAP 2 — Backend zgłoszeń API ✅

- Route: `src/app/api/submit/route.ts` — FormData + walidacja 400

### ETAP 3 — Storage + płatności ✅

- Pliki: `uploads/<uuid>.ext` (unikalna nazwa)
- Metadane: `data/submissions.json` (id, rynek, pakiet, e-mail, ścieżka, data, status płatności)
- `POST /api/checkout` — `submissionId` + `market`; kwoty PL 99/249 zł, NO 299/799 NOK
- Stripe Checkout gdy `STRIPE_SECRET_KEY`, inaczej mock → `/sukces?id=…&mock=1`
- Formularz: po submitcie **krok 4 płatności** (BLIK/Karta lub Vipps/Karta) → redirect

**Brak jeszcze:** e-mail potwierdzenia, panel operatora, webhook Stripe.

### Uruchomienie

```bash
cd web
npm install
npm run dev      # http://localhost:3000 → /no
npm run build && npm start
npm run lint     # tsc --noEmit
```

Smoke API:

```bash
curl -s -X POST http://localhost:3000/api/submit \
  -F 'market=no' -F 'packageType=response' \
  -F 'email=test@example.com' -F 'customAnswers={}' \
  -F 'file=@./jakis.pdf;type=application/pdf'
```

---

## Mapa plików (ważne)

```
web/
├── src/app/
│   ├── layout.tsx                 # Fraunces + Figtree, metadata
│   ├── globals.css                # tokeny CSS, atmosphere, animacje
│   ├── page.tsx                   # redirect → /no
│   ├── no/page.tsx
│   ├── pl/page.tsx
│   ├── api/submit/route.ts        # zapis pliku + JSON
│   ├── api/checkout/route.ts      # Stripe lub mock checkout
│   └── sukces/page.tsx            # strona po płatności
├── src/components/
│   ├── LandingPage.tsx
│   ├── SiteHeader.tsx
│   ├── DemoPanel.tsx
│   ├── QualificationForm.tsx      # kroki 1–3 + krok 4 płatności
│   └── TrustFooter.tsx
├── src/lib/
│   ├── content.ts                 # copy NO/PL
│   ├── pricing.ts                 # kwoty i metody płatności
│   └── submissions.ts             # storage uploads + JSON
├── uploads/                       # pliki (gitignored)
├── data/                          # submissions.json (gitignored)
├── .env.example
├── PLIK-DLA-GEMINI.md
└── package.json
```

Design: fjord/ink (`--ink`, `--fjord`, `--accent`). Nie zmieniaj na Inter/Roboto/fiolet/cream+terracotta.

---

## Czego NIE robić bez potrzeby

- Nie przenoś copy poza `content.ts`.
- Nie wymagaj konta przed uploadem.
- Nie usuwaj ujawnienia AI Act z stopki.
- Nie psuj kontraktu `/api/submit` (nazwy pól FormData + kształt JSON), chyba że brief to zmienia.
- Repo nadrzędne ma kod Pythona (Telegram/relay) — produkt Rada Pism żyje w **`web/`**.

---

## Sugerowany kolejny etap (ETAP 4+)

1. **Webhook Stripe** + weryfikacja sesji (zamiast ufać samym query params na `/sukces`).
2. **E-mail potwierdzenia** (submissionId, kwota, dalsze kroki).
3. **Panel operatora** — lista spraw z `data/submissions.json`, podgląd z `uploads/`.
4. **Object storage / DB** jeśli pilotaż wyjdzie poza jedną instancję Vercel (lokalny FS jest ulotny).
5. **Analytics** CTA / submit / checkout — bez skryptów na samym pliku dokumentu.
6. **Deploy** + `NEXT_PUBLIC_APP_URL` + `STRIPE_SECRET_KEY`.

Jeśli użytkownik wklei konkretny brief — realizuj ten brief.

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
- PR: landing NO/PL + API submit (tytuł wokół Rada Pism)

---

## Instrukcja startowa dla Gemini

> Jesteś full-stack developerem. Projekt **Rada Pism** jest w `web/`.  
> ETAP 1–3 (landing, `/api/submit` + storage, `/api/checkout` + krok płatności, `/sukces`) są gotowe.  
> Najpierw przeczytaj `web/PLIK-DLA-GEMINI.md`, `content.ts`, `pricing.ts`, `submissions.ts`.  
> Potem realizuj zadanie użytkownika (zwykle ETAP 4: webhook Stripe / e-mail / panel), bez psucia CRO i bez wymogu konta przed uploadem.
