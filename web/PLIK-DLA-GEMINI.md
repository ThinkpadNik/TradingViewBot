# Rada Pism — kontekst dla Gemini (po ETAP 1–3)

Skopiuj ten plik do Gemini (lub wskaż go w workspace), gdy kontynuujesz pracę nad projektem.

## Cel produktu

Pilotaż **Smoke Test 48h** — landing + formularz + trwałe zgłoszenia + checkout dla dwóch rynków:

| Rynek | Ścieżka | Pakiety |
|-------|---------|---------|
| Norwegia (domyślna) | `/no` (`/` → redirect) | Gotowa odpowiedź **299 NOK** · Strażnik **799 NOK** |
| Polska | `/pl` | Gotowa odpowiedź **99 zł** · Strażnik **249 zł** |

Zero obowiązku zakładania konta przed uploadem.

Marka: **Rada Pism** · „Panel AI · dokumenty z weryfikacją”.  
Stack: **Next.js App Router + TypeScript + Tailwind** w katalogu `web/`.

---

## Flow użytkownika (obecny)

1. Landing `/no` lub `/pl` → CTA otwiera `#zamowienie`
2. Kroki 1–3: upload → kwalifikacja → pakiet + e-mail/telefon
3. `POST /api/submit` → zapis pliku + JSON → UI przechodzi do **kroku 4 (płatność)**
4. Wybór metody (PL: BLIK/Karta, NO: Vipps/Karta) → `POST /api/checkout`
5. Redirect na Stripe Checkout **lub** mock `/sukces?id=sub_…&mock=1`

---

## Co już jest zrobione

### ETAP 1 — Landing + formularz UI ✅
- Above the fold: problem → panel demonstracyjny AI → CTA
- Stopka **AI Act Art. 50**
- Copy tylko w `src/lib/content.ts`

### ETAP 2 — API zgłoszeń ✅
- `POST /api/submit` (FormData + walidacja 400)

### ETAP 3 — Storage + płatności ✅
- Pliki: `uploads/<uuid>.ext`
- Metadane: `data/submissions.json`
- `POST /api/checkout` + strona `/sukces`
- Formularz: krok 4 płatności

**Brak jeszcze:** webhook Stripe, e-mail potwierdzenia, panel operatora, trwały storage poza lokalnym FS (Vercel ephemeral).

---

## Kontrakty API

### `POST /api/submit` (multipart FormData)

Pola: `market` (`no`|`pl`), `packageType` (`response`|`guardian`), `email`, `phone`, `customAnswers` (JSON string), `file`.

Sukces **200**:
```json
{
  "success": true,
  "submissionId": "sub_…",
  "message": "…",
  "amountLabel": "99 zł",
  "currency": "PLN",
  "paymentMethods": [{ "id": "blik", "label": "BLIK" }, { "id": "card", "label": "Karta" }]
}
```

Błąd **400**: `{ "success": false, "error": "…" }`

### `POST /api/checkout` (JSON)

Body: `{ "submissionId", "market", "preferredMethod?" }`

Sukces **200**:
```json
{
  "success": true,
  "mode": "stripe" | "pilot_mock",
  "submissionId": "sub_…",
  "amountLabel": "99 zł",
  "currency": "PLN",
  "paymentMethods": […],
  "checkoutUrl": "https://…|/sukces?id=…&mock=1",
  "sessionId": "cs_…"
}
```

### Env (`.env.example`)

- `NEXT_PUBLIC_APP_URL` — origin pod success/cancel URL
- `STRIPE_SECRET_KEY` — gdy ustawiony, checkout tworzy prawdziwą sesję Stripe

Kwoty w kodzie: `src/lib/pricing.ts` (nie duplikuj w UI).

---

## Uruchomienie

```bash
cd web
npm install
cp .env.example .env.local   # opcjonalnie Stripe
npm run dev                  # http://localhost:3000 → /no
npm run build && npm start
npm run lint                 # tsc --noEmit
```

Smoke:

```bash
# 1) submit
curl -s -X POST http://localhost:3000/api/submit \
  -F 'market=pl' -F 'packageType=response' \
  -F 'email=test@example.com' -F 'customAnswers={"settlement":"no"}' \
  -F 'file=@./demo.pdf;type=application/pdf'

# 2) checkout (wstaw submissionId z odpowiedzi)
curl -s -X POST http://localhost:3000/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"submissionId":"sub_…","market":"pl","preferredMethod":"blik"}'
```

---

## Mapa plików

```
web/
├── src/app/
│   ├── layout.tsx / globals.css / page.tsx
│   ├── no/page.tsx · pl/page.tsx
│   ├── api/submit/route.ts
│   ├── api/checkout/route.ts
│   └── sukces/page.tsx
├── src/components/
│   ├── LandingPage.tsx · SiteHeader.tsx · DemoPanel.tsx
│   ├── QualificationForm.tsx   # kroki 1–4
│   └── TrustFooter.tsx
├── src/lib/
│   ├── content.ts       # copy NO/PL
│   ├── pricing.ts       # kwoty + metody
│   └── submissions.ts   # FS uploads + JSON store
├── uploads/             # gitignored (zostaw .gitkeep)
├── data/                # gitignored submissions.json
├── .env.example
├── PLIK-DLA-GEMINI.md   # ten plik
└── package.json
```

Design: fjord/ink (`--ink`, `--fjord`, `--accent`). Bez Inter/Roboto/fioletu/cream+terracotta.

---

## Czego NIE robić bez potrzeby

- Nie przenoś copy poza `content.ts`; kwot poza `pricing.ts`.
- Nie wymagaj konta przed uploadem.
- Nie usuwaj AI Act ze stopki.
- Nie psuj kontraktów `/api/submit` i `/api/checkout` bez briefu.
- Produkt Rada Pism = **`web/`** (repo może mieć też Python Telegram/relay — nie mieszaj).

---

## Sugerowany ETAP 4+

1. **Webhook Stripe** + weryfikacja `session_id` na `/sukces` (dziś mock/query params).
2. **E-mail potwierdzenia** (submissionId, kwota, dalsze kroki).
3. **Panel operatora** — lista z `data/submissions.json`, podgląd `uploads/`.
4. **Object storage / DB** przy deployu na Vercel (lokalny FS jest ulotny).
5. Analytics CTA/submit/checkout — bez skryptów na samym pliku dokumentu.
6. Deploy + `NEXT_PUBLIC_APP_URL` + `STRIPE_SECRET_KEY`.

Jeśli użytkownik wklei konkretny brief — realizuj ten brief.

---

## PR / branch

- Branch: `cursor/rada-pism-landing-fa95`
- PR: Rada Pism landing NO/PL + submit + checkout

---

## Instrukcja startowa dla Gemini

> Jesteś full-stack developerem. Projekt **Rada Pism** jest w `web/`.  
> ETAP 1–3 są gotowe (landing, storage, checkout, `/sukces`).  
> Najpierw przeczytaj `web/PLIK-DLA-GEMINI.md`, `content.ts`, `pricing.ts`, `submissions.ts`, `api/submit/route.ts`, `api/checkout/route.ts`.  
> Potem realizuj zadanie użytkownika (zwykle ETAP 4: webhook / e-mail / panel), bez psucia CRO i bez wymogu konta przed uploadem.
