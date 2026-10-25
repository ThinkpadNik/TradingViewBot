# Rada Pism — kontekst dla Gemini (stan aktualny)

Skopiuj ten plik do Gemini albo wskaż go w workspace.

## Produkt

Pilotaż **Smoke Test 48h** w katalogu `web/`  
Stack: **Next.js App Router + TypeScript + Tailwind**

| Rynek | Ścieżka | Pakiety |
|-------|---------|---------|
| Norwegia (domyślna) | `/no` (`/` → redirect) | 299 NOK / 799 NOK (Strażnik) |
| Polska | `/pl` | 99 zł / 249 zł (Strażnik) |

- Bez konta przed uploadem dokumentu  
- Marka: **Rada Pism** · design fjord/ink (`--ink`, `--fjord`, `--accent`)  
- Copy: `src/lib/content.ts` · kwoty: `src/lib/pricing.ts`

---

## Flow klienta

1. Landing → CTA → `#zamowienie`  
2. Kroki 1–3: upload → kwalifikacja → pakiet + kontakt  
3. `POST /api/submit` → storage + (opcjonalnie) e-mail Resend → **krok 4 płatności**  
4. `POST /api/checkout` → Stripe Checkout **lub** mock  
5. `/sukces` + webhook Stripe → status `paid` + e-mail potwierdzenia

## Flow operatora

1. `/operator` — hasło `OPERATOR_PASSWORD` (domyślnie `rada-pilot`)  
2. Lista + filtr NO/PL  
3. Pobierz/podgląd → `GET /api/operator/download?submissionId=…`

---

## Gotowe komponenty

| Obszar | Plik / route |
|--------|----------------|
| Submit | `POST /api/submit` |
| Checkout | `POST /api/checkout` |
| Stripe webhook | `POST /api/webhook/stripe` |
| Analytics API | `POST /api/analytics` |
| Operator login/logout/download | `/api/operator/*` |
| Sukces | `/sukces` |
| Storage | `src/lib/submissions.ts` |
| E-mail | `src/lib/email.ts` |
| Sygnatura Stripe | `src/lib/stripe-webhook.ts` |
| Eventy front | `src/lib/analytics.ts` + `PrivacyAnalytics.tsx` |

---

## Storage (Vercel-ready)

| Tryb | Warunek | Zachowanie |
|------|---------|------------|
| Local (dev) | brak `BLOB_READ_WRITE_TOKEN` | `uploads/` + `data/submissions.json` |
| Blob (prod) | token ustawiony | pliki `rada-pism/uploads/…`, meta `rada-pism/submissions/{id}.json` |
| Fallback | błąd Bloba | zapis lokalny FS |

Download operatora obsługuje **lokalny plik** i **URL Bloba**.

---

## Stripe

1. Checkout ustawia `metadata.submissionId` + `client_reference_id`  
2. Webhook `checkout.session.completed` (wymaga `STRIPE_WEBHOOK_SECRET`) → `paymentStatus: "paid"`  
3. `/sukces?session_id=` weryfikuje sesję przez Stripe API; inaczej czeka na webhook  
4. Mock: `/sukces?id=…&mock=1` → `mock_paid`  

Lokalnie: `stripe listen --forward-to localhost:3000/api/webhook/stripe`

---

## E-mail (Resend)

Gdy `RESEND_API_KEY` (+ opcjonalnie `RESEND_FROM`):

- po **submit** → przyjęcie zgłoszenia (ID, pakiet, kwota, 24h)  
- po **paid** (webhook / sukces) → potwierdzenie płatności  

Bez klucza: skip + log — API nie pada.

---

## Analytics (privacy-first)

- **Zakazane:** Meta Pixel, Google Analytics, podobne trackery dokumentów  
- **Dozwolone eventy:** `cta_click`, `form_open`, `submit_success`, `checkout_start`, `checkout_redirect`  
- `POST /api/analytics` — allowlista; bez e-maila / nazwy pliku / treści dokumentu  
- Opcjonalny Plausible (bez cookies): `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`

---

## Env — `web/.env.example`

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
OPERATOR_PASSWORD=
RESEND_API_KEY=
RESEND_FROM=Rada Pism <onboarding@resend.dev>
BLOB_READ_WRITE_TOKEN=
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

---

## Uruchomienie

```bash
cd web
npm install
cp .env.example .env.local   # uzupełnij klucze
npm run dev
npm run lint                 # tsc --noEmit
npm run build && npm start
```

---

## Mapa plików (skrót)

```
web/src/app/
  no/ · pl/ · sukces/ · operator/
  api/submit · checkout · analytics
  api/webhook/stripe
  api/operator/{login,logout,download}
web/src/lib/
  content.ts · pricing.ts · submissions.ts
  email.ts · stripe-webhook.ts · analytics.ts · operator-auth.ts
web/src/components/
  LandingPage · QualificationForm · PrivacyAnalytics
  operator/OperatorLogin · OperatorDashboard
```

---

## Czego NIE robić

- Nie psuj kontraktów `/api/submit` i `/api/checkout`  
- Nie przenoś copy poza `content.ts` / kwot poza `pricing.ts`  
- Nie dodawaj GA/Pixel/Hotjar  
- Nie wymagaj konta klienta przed uploadem  
- Nie osłabiaj auth operatora ani confinement ścieżek plików  
- Produkt żyje w **`web/`** (w repo może być też Python Telegram/relay)

---

## Sugerowany kolejny etap (jeśli brak briefu)

1. Deploy na Vercel + ustawienie wszystkich env  
2. Stripe Dashboard: webhook → `/api/webhook/stripe`  
3. Domena Resend / własny `RESEND_FROM`  
4. Retencja / TTL plików w Blob  
5. Test E2E płatności NO (Vipps via Stripe) i PL (BLIK/karta)

---

## Branch / PR

- Branch: `cursor/rada-pism-landing-fa95`  
- PR: Rada Pism — landing, submit, checkout, operator, webhook, e-mail, Blob, analytics

---

## Instrukcja startowa dla Gemini

> Jesteś full-stack developerem. Projekt **Rada Pism** jest w `web/`.  
> Pełny pilotaż (landing → submit → checkout → webhook → e-mail → operator → privacy analytics) jest gotowy.  
> Najpierw przeczytaj `web/PLIK-DLA-GEMINI.md` oraz `submissions.ts`, `email.ts`, `api/webhook/stripe/route.ts`.  
> Potem realizuj brief użytkownika (zwykle deploy / dopięcie kluczy / retencja), bez GA/Pixel i bez wymogu konta przed uploadem.
