# Rada Pism — kontekst dla Gemini (stan produkcyjny pilotażu)

Skopiuj ten plik do Gemini (lub wskaż go w workspace).

## Cel

Pilotaż **Smoke Test 48h** w `web/` (Next.js App Router + TS + Tailwind):

| Rynek | Ścieżka | Pakiety |
|-------|---------|---------|
| NO (domyślny) | `/no` | 299 NOK / 799 NOK |
| PL | `/pl` | 99 zł / 249 zł |

Bez konta przed uploadem. Design: fjord/ink. Copy: `content.ts`. Kwoty: `pricing.ts`.

---

## Gotowe obszary

| Obszar | Endpoint / ścieżka |
|--------|--------------------|
| Landing + formularz 1–4 | `/no`, `/pl` |
| Submit + storage | `POST /api/submit` |
| Checkout | `POST /api/checkout` |
| Sukces | `/sukces` |
| Operator | `/operator` + download |
| Stripe webhook | `POST /api/webhook/stripe` |
| Analytics (privacy-first) | `POST /api/analytics` |
| E-mail Resend | `src/lib/email.ts` |
| Blob / local storage | `src/lib/submissions.ts` |

---

## Storage

- **Dev / brak tokena:** `uploads/` + `data/submissions.json`
- **Produkcja:** gdy `BLOB_READ_WRITE_TOKEN` → `@vercel/blob`  
  - pliki: `rada-pism/uploads/…`  
  - metadane: `rada-pism/submissions/{id}.json`  
  - lokalny FS jako fallback przy błędzie Bloba

---

## Stripe

1. Checkout tworzy sesję z `metadata.submissionId` + `client_reference_id`
2. Webhook `checkout.session.completed` (wymaga `STRIPE_WEBHOOK_SECRET`) → `paymentStatus: paid` + e-mail
3. `/sukces?session_id=` weryfikuje sesję API Stripe; bez potwierdzenia czeka na webhook
4. Mock: `/sukces?id=…&mock=1` → `mock_paid`

---

## E-mail (Resend)

Gdy `RESEND_API_KEY`:
- po submitcie → potwierdzenie przyjęcia (ID, kwota, 24h)
- po opłaceniu (webhook lub sukces) → potwierdzenie płatności  

Bez klucza: skip + log serwerowy (nie blokuje API).

---

## Analytics (poufność)

- **Brak** Meta Pixel / Google Analytics w layoutcie
- Anonimowe eventy: `cta_click`, `form_open`, `submit_success`, `checkout_start`, `checkout_redirect`
- `POST /api/analytics` — allowlista nazw; **nigdy** treść dokumentu / e-mail / nazwa pliku
- Opcjonalny Plausible: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`

---

## Env (`.env.example`)

```
NEXT_PUBLIC_APP_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
OPERATOR_PASSWORD=
RESEND_API_KEY=
RESEND_FROM=
BLOB_READ_WRITE_TOKEN=
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

---

## Uruchomienie

```bash
cd web && npm install && npm run dev
npm run lint   # tsc --noEmit
```

Webhook lokalnie: `stripe listen --forward-to localhost:3000/api/webhook/stripe`

---

## Czego nie psuć

- Kontrakty `/api/submit` i `/api/checkout`
- CRO above-the-fold + `content.ts`
- Ochrona `/operator` i download confined / blob proxy
- Zakaz zewnętrznych trackerów na plikach dokumentów

---

## Branch / PR

`cursor/rada-pism-landing-fa95` — Rada Pism full pilot stack

## Start dla Gemini

> Przeczytaj `web/PLIK-DLA-GEMINI.md`, `submissions.ts`, `email.ts`, `api/webhook/stripe/route.ts`.  
> Realizuj brief użytkownika bez dodawania GA/Pixel i bez wymogu konta przed uploadem.
