# Deploy Rada Pism na Vercel

Aplikacja żyje w katalogu **`web/`**. W Vercel ustaw **Root Directory** = `web`.

---

## Punkt 1: Konfiguracja i zmienne środowiskowe

**Project Settings → Environment Variables** (Production; opcjonalnie Preview).

### Gotowiec do wklejenia

```bash
NEXT_PUBLIC_APP_URL=https://twoja-domena.vercel.app
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
OPERATOR_PASSWORD=silne_haslo_do_panelu_operatora
RESEND_API_KEY=re_...
RESEND_FROM=Rada Pism <kontakt@radapism.pl>
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=twoja-domena.pl
```

| Zmienna | Opis |
|---------|------|
| `NEXT_PUBLIC_APP_URL` | Publiczny origin (bez `/` na końcu) — success/cancel URL Stripe |
| `STRIPE_SECRET_KEY` | `sk_live_…` lub `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` z Punktu 2 (po utworzeniu endpointu) |
| `OPERATOR_PASSWORD` | Hasło `/operator` — nie zostawiaj domyślnego `rada-pilot` |
| `RESEND_API_KEY` / `RESEND_FROM` | E-maile potwierdzeń |
| `BLOB_READ_WRITE_TOKEN` | Trwały storage plików i metadanych |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Opcjonalny Plausible (bez cookies) |

Lokalnie: `web/.env.local` (gitignore). Szablony: `.env.example`, `.env.production.example`.

### Wskazówka — Vercel Blob

Po dodaniu tokena **`BLOB_READ_WRITE_TOKEN`** system automatycznie przestawi się z lokalnego folderu `uploads/` na chmurę **Vercel Blob**, dzięki czemu pliki **nie znikną** przy restarcie / cold start instancji serverless.

Bez tokena kod używa lokalnego FS (`uploads/` + `data/submissions.json`) — OK na `npm run dev`, **niebezpieczne na Vercel**.

---

## Punkt 2: Konfiguracja Stripe Dashboard (Webhook)

Żeby płatności w tle automatycznie zmieniały status zgłoszenia na **`paid`** i wyzwalały **drugi e-mail** z potwierdzeniem:

1. Zaloguj się do **Stripe Dashboard**.
2. Wejdź w **Developers (Deweloperzy) → Webhooks → Add endpoint**.
3. W polu **Endpoint URL** podaj:
   ```
   https://twoja-domena.vercel.app/api/webhook/stripe
   ```
   (podmień domenę na swoją produkcyjną / Vercel).
4. W **Select events** zaznacz wyłącznie:
   - `checkout.session.completed`
5. Kliknij **Add endpoint**, skopiuj **Signing secret** (`whsec_…`).
6. Wklej go w Vercel jako zmienną **`STRIPE_WEBHOOK_SECRET`**.
7. Zrób **Redeploy**, żeby runtime wczytał nowy secret.

### Co robi webhook w kodzie

Route: `src/app/api/webhook/stripe/route.ts`

- Weryfikuje podpis Stripe (`STRIPE_WEBHOOK_SECRET`)
- Przy `checkout.session.completed` czyta `submissionId` z `metadata` / `client_reference_id`
- Ustawia `paymentStatus: "paid"` w storage
- Wysyła e-mail potwierdzenia płatności (Resend), jeśli `RESEND_API_KEY` jest ustawione

### Test lokalny (opcjonalnie)

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
# wklej wypisany whsec_… do .env.local jako STRIPE_WEBHOOK_SECRET
```

---

## Punkt 3: Własna domena Resend (`RESEND_FROM`)

Domyślny adres nadawcy `onboarding@resend.dev` służy **wyłącznie do testów** i często wpada do spamu.  
Przed oficjalnym startem testów na żywo skonfiguruj własną domenę:

1. Wejdź w panel **Resend → Domains → Add Domain**.
2. Wpisz swoją domenę (np. `radapism.pl`).
3. Dodaj rekordy DNS (**DKIM**, **SPF**, **MX**) u rejestratora domeny — dokładnie jak podaje Resend.
4. Poczekaj na status **Verified**.
5. W Vercel zmień zmienną na produkcyjną i zrób **Redeploy**:
   ```bash
   RESEND_FROM=Rada Pism <kontakt@radapism.pl>
   ```
   (lokalnie / Preview możesz nadal używać `pilot@…` na zweryfikowanej domenie).

### Uwagi

- Bez `RESEND_API_KEY` API aplikacji działa, ale e-maile są pomijane (log serwerowy).
- Kod w `src/lib/email.ts` używa `RESEND_FROM`, a gdy brak — fallback `onboarding@resend.dev` (tylko dev/test).
- Po weryfikacji domeny wyślij testowy submit i sprawdź skrzynkę + folder spam.

---

## Deploy

```bash
cd web
npx vercel          # preview
npx vercel --prod   # production
```

Albo: podłącz repo w Vercel UI → Root Directory `web` → Deploy.

### Checklist

- [ ] Env z Punktu 1 uzupełnione (w tym Blob + Operator password)  
- [ ] Webhook Stripe z Punktu 2 + `STRIPE_WEBHOOK_SECRET` + redeploy  
- [ ] Domena Resend zweryfikowana (Punkt 3) + `RESEND_FROM=Rada Pism <kontakt@radapism.pl>`  
- [ ] `/no` i `/pl` działają  
- [ ] Submit zapisuje do Blob (nie ulotny dysk)  
- [ ] Checkout → event `checkout.session.completed` → status `paid` w `/operator`  
- [ ] E-mail po submitcie + po opłaceniu (nie z `onboarding@resend.dev`)  
- [ ] Brak Meta/GA w HTML  

---

## Uwagi

- `NEXT_PUBLIC_*` są widoczne w przeglądarce — bez sekretów.  
- Po każdej zmianie env w Vercel → **Redeploy**.  
- Kod nie wymaga konta klienta przed uploadem dokumentu.
