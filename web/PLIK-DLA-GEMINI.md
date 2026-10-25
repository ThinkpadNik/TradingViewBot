# Rada Pism — kontekst dla Gemini (po ETAP 1 + ETAP 2)

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

- Route: `src/app/api/submit/route.ts`
- `POST` + `FormData`:
  - `market` (`no` | `pl`)
  - `packageType` (`response` | `guardian`)
  - `email`, `phone`
  - `customAnswers` (JSON string)
  - `file` (zdjęcie/PDF)
- Brak rynku / e-maila / pliku → **400** `{ success: false, error: "..." }`
- Sukces → **200** `{ success: true, submissionId: "sub_" + Date.now(), message: "..." }`
- Log serwera: rynek, pakiet, nazwa pliku, rozmiar (bez treści dokumentu / e-maila)
- `QualificationForm.tsx`: `fetch('/api/submit')`, `isSubmitting`, błędy, sukces z `submissionId`

**Brak jeszcze:** trwałego storage plików, e-maila potwierdzenia, bramki płatności.

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
│   └── api/submit/route.ts        # ETAP 2 — POST FormData
├── src/components/
│   ├── LandingPage.tsx            # CTA → otwarcie formularza
│   ├── SiteHeader.tsx             # marka + NO/PL
│   ├── DemoPanel.tsx
│   ├── QualificationForm.tsx      # 3 kroki + fetch /api/submit
│   └── TrustFooter.tsx            # AI Act
├── src/lib/content.ts             # WSZYSTKIE treści NO/PL
├── PLIK-DLA-GEMINI.md             # ten plik
├── package.json
└── README.md
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

## Sugerowany kolejny etap (ETAP 3+)

Priorytet pod smoke test 48h:

1. **Płatności** po sukcesie submitu  
   - NO: Karta / Vipps  
   - PL: BLIK / Karta  
   Redirect/checkout → status „opłacone” powiązany z `submissionId`.
2. **Trwały storage** zgłoszeń + plików (DB / object storage) — dziś API tylko waliduje, buforuje i loguje.
3. **E-mail potwierdzenia** do klienta (numer `submissionId`, dalsze kroki).
4. **Panel operatora** (minimalny) — lista spraw, podgląd dokumentu, status „wysłane w 24h”.
5. **Analytics** — eventy CTA / submit / płatność; bez zewnętrznych skryptów na samym pliku dokumentu.
6. **Deploy** (Vercel itd.) + domena `/no` `/pl`.

Jeśli użytkownik wklei konkretny brief — realizuj ten brief; powyższe to domyślny backlog.

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
> ETAP 1 (landing) i ETAP 2 (`POST /api/submit` + podpięty formularz) są gotowe.  
> Najpierw przeczytaj `web/PLIK-DLA-GEMINI.md`, `web/src/lib/content.ts` oraz `web/src/app/api/submit/route.ts`.  
> Potem realizuj zadanie użytkownika (zwykle ETAP 3: płatności Vipps/BLIK/karta + storage), bez psucia CRO above-the-fold, kontraktu API i bez wymogu konta przed uploadem.
