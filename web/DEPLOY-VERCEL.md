# Deploy Rada Pism na Vercel — Punkt 1 (env)

Aplikacja żyje w katalogu **`web/`**. W Vercel ustaw **Root Directory** = `web`.

## 1. Project Settings → Environment Variables

Wklej poniższe zmienne dla środowisk **Production** (oraz Preview, jeśli testujesz PR-y).  
Wartości sekretów bierz z paneli Stripe / Resend / Vercel Blob — **nie commituj** prawdziwych kluczy.

| Zmienna | Wymagana na prod? | Opis | Gdzie wziąć |
|---------|-------------------|------|-------------|
| `NEXT_PUBLIC_APP_URL` | **Tak** | Publiczny origin (bez `/` na końcu), np. `https://rada-pism.vercel.app` | Twoja domena Vercel / custom |
| `BLOB_READ_WRITE_TOKEN` | **Tak** (prod) | Vercel Blob — pliki + metadane zgłoszeń | Vercel → Storage → Blob → token |
| `STRIPE_SECRET_KEY` | Tak (płatności live/test) | Klucz tajny Stripe (`sk_live_…` / `sk_test_…`) | [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | Tak (gdy webhook) | Secret endpointu webhook (`whsec_…`) | Stripe → Developers → Webhooks |
| `RESEND_API_KEY` | Zalecana | Wysyłka e-maili potwierdzeń | [Resend → API Keys](https://resend.com/api-keys) |
| `RESEND_FROM` | Zalecana | Nadawca, np. `Rada Pism <noreply@twoja-domena.pl>` | Zweryfikowana domena w Resend |
| `OPERATOR_PASSWORD` | **Tak** | Hasło panelu `/operator` | Wymyśl silne hasło (nie zostawiaj `rada-pilot`) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Nie | Domena w Plausible (cookieless) | Panel Plausible |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT` | Nie | Domyślnie `https://plausible.io/js/script.js` | tylko przy self-host |

### Gotowiec do skopiowania (puste wartości)

```bash
NEXT_PUBLIC_APP_URL=https://TWOJA-DOMENA.vercel.app
BLOB_READ_WRITE_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
RESEND_FROM=Rada Pism <noreply@twoja-domena.pl>
OPERATOR_PASSWORD=
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

Lokalnie te same klucze możesz trzymać w `web/.env.local` lub `web/.env.production.local` (oba są w `.gitignore`).

---

## 2. Po pierwszym deployu — Stripe Webhook

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. URL: `https://TWOJA-DOMENA/api/webhook/stripe`
3. Event: `checkout.session.completed`
4. Skopiuj **Signing secret** → `STRIPE_WEBHOOK_SECRET` w Vercel
5. Redeploy (żeby Vercel wczytał nową zmienną)

---

## 3. Vercel Blob

1. Vercel Project → **Storage** → utwórz **Blob** store  
2. Połącz ze projektem — Vercel zwykle wstrzyknie `BLOB_READ_WRITE_TOKEN`  
3. Bez tego tokena produkcja spadnie na lokalny FS (na serverless **ulotny** — nie używaj w prod)

---

## 4. Resend

1. Zweryfikuj domenę nadawcy  
2. Ustaw `RESEND_API_KEY` + `RESEND_FROM`  
3. Bez klucza API działa, ale e-maile są pomijane (log serwerowy)

---

## 5. Deploy

```bash
# z katalogu web/ — lub Root Directory = web w Vercel UI
cd web
npx vercel          # preview
npx vercel --prod   # production
```

Albo: podłącz repo w Vercel UI → Root Directory `web` → Deploy.

### Checklist po deployu

- [ ] `https://…/no` i `/pl` ładują się  
- [ ] Submit formularza tworzy zgłoszenie (Blob)  
- [ ] Checkout → Stripe test → `/sukces`  
- [ ] Webhook ustawia status `paid` (Stripe CLI / Dashboard event log)  
- [ ] E-mail przychodzi (Resend)  
- [ ] `/operator` działa tylko z `OPERATOR_PASSWORD`  
- [ ] Brak Meta/GA w źródle strony  

---

## Uwagi

- Zmienne `NEXT_PUBLIC_*` są widoczne w przeglądarce — nie wkładaj tam sekretów.  
- Po zmianie env w Vercel zrób **Redeploy**.  
- Panel operatora: ustaw własne `OPERATOR_PASSWORD` przed smoke testem publicznym.
