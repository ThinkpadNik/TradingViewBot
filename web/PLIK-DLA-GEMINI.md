# Rada Pism — kontekst dla Gemini (aktualny stan)

Skopiuj ten plik do Gemini (lub wskaż go w workspace), gdy kontynuujesz pracę.

## Cel produktu

Pilotaż **Smoke Test 48h** — landing + formularz + trwałe zgłoszenia + checkout + panel operatora dla dwóch rynków:

| Rynek | Ścieżka | Pakiety |
|-------|---------|---------|
| Norwegia (domyślna) | `/no` (`/` → redirect) | Gotowa odpowiedź **299 NOK** · Strażnik **799 NOK** |
| Polska | `/pl` | Gotowa odpowiedź **99 zł** · Strażnik **249 zł** |

Zero obowiązku zakładania konta przed uploadem.

Marka: **Rada Pism** · „Panel AI · dokumenty z weryfikacją”.  
Stack: **Next.js App Router + TypeScript + Tailwind** w katalogu `web/`.

---

## Flow użytkownika

1. Landing `/no` lub `/pl` → CTA → `#zamowienie`
2. Kroki 1–3: upload → kwalifikacja → pakiet + e-mail/telefon
3. `POST /api/submit` → plik w `uploads/` + rekord w `data/submissions.json` → **krok 4 płatności**
4. Metoda (PL: BLIK/Karta, NO: Vipps/Karta) → `POST /api/checkout`
5. Stripe Checkout **lub** mock → `/sukces?id=sub_…&mock=1`

## Flow operatora

1. `/operator` → hasło (`OPERATOR_PASSWORD`, domyślnie `rada-pilot`)
2. Lista zgłoszeń + filtr rynku NO/PL
3. Pobierz / podgląd pliku → `GET /api/operator/download?submissionId=…` (`&inline=1`)

---

## Co jest gotowe

| Obszar | Status |
|--------|--------|
| Landing NO/PL + AI Act stopka | ✅ |
| Formularz 1–4 (upload → płatność) | ✅ |
| `POST /api/submit` + storage | ✅ |
| `POST /api/checkout` (Stripe lub mock) | ✅ |
| `/sukces` | ✅ |
| `/operator` + login/logout/download | ✅ |

**Brak jeszcze:** webhook Stripe (weryfikacja sesji), e-mail potwierdzenia, object storage/DB (lokalny FS na Vercel jest ulotny).

---

## Kontrakty API (skrót)

### `POST /api/submit` (FormData)
Pola: `market`, `packageType`, `email`, `phone`, `customAnswers` (JSON), `file`  
Sukces: `{ success, submissionId, message, amountLabel, currency, paymentMethods }`

### `POST /api/checkout` (JSON)
Body: `{ submissionId, market, preferredMethod? }`  
Sukces: `{ success, mode: "stripe"|"pilot_mock", checkoutUrl, … }`

### Operator
- `POST /api/operator/login` `{ password }` → cookie `rada_operator_session`
- `POST /api/operator/logout`
- `GET /api/operator/download?submissionId=…` — wymaga cookie; plik tylko z `uploads/`

Kwoty: `src/lib/pricing.ts`. Copy: `src/lib/content.ts`. Storage: `src/lib/submissions.ts`. Auth: `src/lib/operator-auth.ts`.

---

## Env (`.env.example`)

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=          # opcjonalnie — prawdziwy Checkout
OPERATOR_PASSWORD=          # opcjonalnie — domyślnie rada-pilot
```

---

## Uruchomienie

```bash
cd web
npm install
cp .env.example .env.local   # opcjonalnie
npm run dev                  # http://localhost:3000
npm run lint                 # tsc --noEmit
npm run build && npm start
```

Smoke:

```bash
# submit
curl -s -X POST http://localhost:3000/api/submit \
  -F 'market=pl' -F 'packageType=response' \
  -F 'email=test@example.com' -F 'customAnswers={}' \
  -F 'file=@./demo.pdf;type=application/pdf'

# operator login + download
curl -s -c /tmp/op.txt -X POST http://localhost:3000/api/operator/login \
  -H 'Content-Type: application/json' -d '{"password":"rada-pilot"}'
curl -s -b /tmp/op.txt -OJ \
  "http://localhost:3000/api/operator/download?submissionId=sub_…"
```

---

## Mapa plików

```
web/
├── src/app/
│   ├── no/page.tsx · pl/page.tsx · sukces/page.tsx
│   ├── operator/page.tsx
│   └── api/
│       ├── submit/route.ts
│       ├── checkout/route.ts
│       └── operator/{login,logout,download}/route.ts
├── src/components/
│   ├── LandingPage.tsx · SiteHeader.tsx · DemoPanel.tsx
│   ├── QualificationForm.tsx
│   ├── operator/OperatorLogin.tsx · OperatorDashboard.tsx
│   └── TrustFooter.tsx
├── src/lib/
│   ├── content.ts · pricing.ts · submissions.ts · operator-auth.ts
├── uploads/ · data/          # gitignored (zostaw .gitkeep)
├── .env.example
├── PLIK-DLA-GEMINI.md
└── package.json
```

Design: fjord/ink (`--ink`, `--fjord`, `--accent`). Bez Inter/Roboto/fioletu/cream+terracotta.

---

## Czego NIE robić bez potrzeby

- Nie przenoś copy poza `content.ts`; kwot poza `pricing.ts`.
- Nie wymagaj konta klienta przed uploadem.
- Nie usuwaj AI Act ze stopki.
- Nie osłabiaj ochrony `/operator` / download (cookie + path confined to `uploads/`).
- Produkt = **`web/`** (w repo może być też Python Telegram/relay).

---

## Sugerowany kolejny etap

1. **Webhook Stripe** + weryfikacja `session_id` na `/sukces`
2. **E-mail potwierdzenia** (submissionId, kwota, dalsze kroki)
3. **Object storage / DB** przy deployu na Vercel
4. Analytics CTA/submit/checkout — bez skryptów na samym pliku dokumentu
5. Deploy + ustaw `OPERATOR_PASSWORD` (nie zostawiaj domyślnego w produkcji)

Jeśli użytkownik wklei konkretny brief — realizuj ten brief.

---

## PR / branch

- Branch: `cursor/rada-pism-landing-fa95`
- PR: Rada Pism (landing, submit, checkout, operator)

---

## Instrukcja startowa dla Gemini

> Jesteś full-stack developerem. Projekt **Rada Pism** jest w `web/`.  
> Landing, submit+storage, checkout, `/sukces` i panel `/operator` są gotowe.  
> Najpierw przeczytaj `web/PLIK-DLA-GEMINI.md`, `operator-auth.ts`, `submissions.ts`, `pricing.ts`.  
> Potem realizuj zadanie użytkownika (zwykle webhook Stripe / e-mail / deploy), bez psucia CRO i bez wymogu konta przed uploadem.
