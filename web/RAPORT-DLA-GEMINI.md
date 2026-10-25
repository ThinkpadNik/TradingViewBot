# Rada Pism — pełny raport statusu dla Gemini

**Data raportu:** 2026-10-25 (Europe/Oslo)  
**Branch:** `cursor/rada-pism-landing-fa95`  
**PR:** https://github.com/ThinkpadNik/TradingViewBot/pull/1 (OPEN)  
**Katalog aplikacji:** `web/` (Next.js App Router + TypeScript + Tailwind)

Ten plik jest **źródłem prawdy** do kontynuacji pracy. Szczegóły operacyjne: `DEPLOY-VERCEL.md`. Krótki handoff: `PLIK-DLA-GEMINI.md`.

---

## 1. Na czym stoimy (werdykt)

| Warstwa | Status |
|---------|--------|
| Kod produktu (landing → submit → checkout → webhook → e-mail → operator) | ✅ **Gotowy w repozytorium** |
| Dokumentacja go-live (Punkty 1–4) | ✅ **Gotowa** |
| Deploy produkcyjny na Vercel | ⏳ **Wymaga działań człowieka** (env + domeny + klucze) |
| Stripe live/test webhook na produkcji | ⏳ **Wymaga Dashboard Stripe + redeploy** |
| Resend z własną domeną | ⏳ **Wymaga DNS + `RESEND_FROM`** |
| Pierwsze płatne zgłoszenie na żywo | ⏳ **Zablokowane do czasu Punktów 1–3** |

**Werdykt:** układanka techniczna w kodzie jest domknięta. Dalej nie „brakuje feature’ów” do smoke testu 48h — brakuje **skonfigurowanego środowiska produkcyjnego** i przejścia checklisty E2E na prawdziwej domenie.

---

## 2. Co zbudowaliśmy (zakres produktu)

### Rynki
| Rynek | URL | Pakiet bazowy | Strażnik | Metody płatności (UI) |
|-------|-----|---------------|----------|------------------------|
| Norwegia (domyślny) | `/no` (`/` → redirect) | **299 NOK** | 799 NOK | Vipps / Karta |
| Polska | `/pl` | **99 zł** | 249 zł | BLIK / Karta |

- Bez konta przed uploadem  
- Stopka **AI Act Art. 50**  
- Design fjord/ink; copy w `src/lib/content.ts`; kwoty w `src/lib/pricing.ts`

### Flow klienta
1. Landing → CTA → `#zamowienie`  
2. Kroki 1–3: plik → kwalifikacja → pakiet + e-mail/telefon  
3. `POST /api/submit` → storage + e-mail „przyjęte”  
4. Krok 4 płatności → `POST /api/checkout`  
5. Stripe **lub** mock → `/sukces`  
6. Webhook `checkout.session.completed` → status `paid` + e-mail „opłacone”

### Flow operatora
1. `/operator` + hasło (`OPERATOR_PASSWORD`, fallback kodu: `rada-pilot`)  
2. Lista + filtr NO/PL  
3. Pobierz / podgląd pliku (`/api/operator/download`)

### Stack API
| Route | Rola |
|-------|------|
| `POST /api/submit` | FormData → plik + metadane + e-mail received |
| `POST /api/checkout` | Sesja Stripe lub mock URL |
| `POST /api/webhook/stripe` | `paid` + e-mail paid |
| `POST /api/analytics` | Allowlista anonimowych eventów |
| `POST /api/operator/login\|logout` | Cookie sesji |
| `GET /api/operator/download` | Plik lokalny lub Blob |

### Storage
- **Bez** `BLOB_READ_WRITE_TOKEN`: lokalne `uploads/` + `data/submissions.json` (OK w `npm run dev`, **ulotny na Vercel**)  
- **Z** tokenem: `@vercel/blob` (`rada-pism/uploads/…`, `rada-pism/submissions/{id}.json`) + fallback FS przy błędzie

### Privacy
- Brak Meta Pixel / Google Analytics  
- Eventy: `cta_click`, `form_open`, `submit_success`, `checkout_start`, `checkout_redirect`  
- Opcjonalny Plausible: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`

---

## 3. Mapa plików (orientacja)

```
web/
├── DEPLOY-VERCEL.md          # Punkty 1–4 go-live
├── PLIK-DLA-GEMINI.md        # krótki handoff
├── RAPORT-DLA-GEMINI.md      # TEN RAPORT
├── .env.example / .env.production.example
├── src/app/
│   ├── no/ · pl/ · sukces/ · operator/
│   └── api/submit · checkout · analytics
│       webhook/stripe · operator/{login,logout,download}
├── src/lib/
│   ├── content.ts · pricing.ts · submissions.ts
│   ├── email.ts · stripe-webhook.ts · analytics.ts · operator-auth.ts
└── src/components/
    ├── LandingPage · QualificationForm · PrivacyAnalytics
    └── operator/OperatorLogin · OperatorDashboard
```

---

## 4. Co już zweryfikowaliśmy w kodzie / lokalnie

- `npm run lint` (`tsc --noEmit`) i `npm run build` — przechodzą  
- Smoke API: PL → `99 zł` + BLIK/Karta; NO → `299 NOK` + Vipps/Karta  
- CTA na `/pl` i `/no` zawierają poprawne kwoty  
- Checkout bez Stripe → `mode: pilot_mock` → `/sukces?mock=1`  
- Operator: login 401/200, download wymaga cookie  
- Analytics: nieznany event → 400; allowlista → 200  
- Webhook bez `STRIPE_WEBHOOK_SECRET` → 503 (oczekiwane)  
- HTML bez trackerów GA/Pixel  

**Nieweryfikowane w tym środowisku cloud (brak sekretów użytkownika):**  
prawdziwy Stripe Checkout, webhook live, Resend inbox, Blob na Vercel, custom domena.

---

## 5. Czego potrzebujemy, żeby iść dalej

### A. Od człowieka / właściciela produktu (blokery go-live)

Bez tych rzeczy **nie da się** zbierać płatnych zgłoszeń na produkcji:

1. **Konto i projekt Vercel**  
   - Root Directory = `web`  
   - Deploy z brancha `cursor/rada-pism-landing-fa95` (lub merge do `main` + deploy)

2. **Zmienne środowiskowe na Vercel (Punkt 1)**  
   ```bash
   NEXT_PUBLIC_APP_URL=https://twoja-domena.vercel.app
   STRIPE_SECRET_KEY=sk_live_...   # lub sk_test_... na start
   STRIPE_WEBHOOK_SECRET=whsec_... # po Punkcie 2
   OPERATOR_PASSWORD=silne_haslo...
   RESEND_API_KEY=re_...
   RESEND_FROM=Rada Pism <kontakt@radapism.pl>
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
   NEXT_PUBLIC_PLAUSIBLE_DOMAIN=twoja-domena.pl  # opcjonalnie
   ```

3. **Vercel Blob store** + token (Punkt 1 — wskazówka)  
   Bez tego pliki na serverless znikają przy restarcie.

4. **Stripe Webhook (Punkt 2)**  
   - URL: `https://twoja-domena.vercel.app/api/webhook/stripe`  
   - Event: `checkout.session.completed`  
   - Signing secret → `STRIPE_WEBHOOK_SECRET` → **Redeploy**

5. **Domena Resend (Punkt 3)**  
   - Domains → DNS DKIM/SPF/MX  
   - `RESEND_FROM=Rada Pism <kontakt@radapism.pl>`  
   - Nie używać `onboarding@resend.dev` na żywo (spam)

6. **E2E na prod / preview (Punkt 4)**  
   - `/pl` 99 zł + karta testowa `4242…` (gdy `sk_test_`)  
   - `/no` 299 NOK  
   - e-mail + `/operator` + pobranie pliku

### B. Decyzje produktowe (opcjonalne, ale warto)

| Decyzja | Po co |
|---------|--------|
| Domena custom vs `*.vercel.app` | `NEXT_PUBLIC_APP_URL`, Resend, zaufanie |
| `sk_test_` najpierw vs od razu `sk_live_` | Bezpieczeństwo smoke 48h |
| Czy Vipps/BLIK idzie przez Stripe Payment Methods | W UI są etykiety; realne metody zależą od konfiguracji Stripe Account (kraj, payment methods) |
| Hasło operatora + kto ma dostęp | Nie zostawiać `rada-pilot` publicznie |
| Plausible — tak/nie | Analytics bez cookies |

### C. Kolejne prace kodowe (po go-live, nie blokują smoke)

Priorytet niski względem deployu:

1. **Retencja / TTL** plików w Blob (RODO / minimalizacja)  
2. **Monitoring** delivery webhooków Stripe + alerty nieudanych e-maili  
3. **Podpisane URL-e Blob** (obecnie public put — OK na pilotaż, do zaostrzenia)  
4. **Rate limiting** na `/api/submit` i `/api/operator/login`  
5. **Weryfikacja sesji Stripe** wyłącznie przez webhook (sukces już częściowo weryfikuje API)  
6. Ewentualny **panel statusów** (oznacz „wysłane w 24h”) w `/operator`

---

## 6. Ryzyka (świadome)

| Ryzyko | Mitigacja w kodzie / procesie |
|--------|-------------------------------|
| Ulotny dysk na Vercel bez Bloba | Wymagaj `BLOB_READ_WRITE_TOKEN` na prod |
| Race przy równoległych zapisach JSON (lokalny store) | Na Blob: 1 plik meta na `submissionId` |
| Publiczne blob URL-e | Pilotaż OK; później private + signed |
| Mock checkout bez Stripe | Świadomy fallback; nie mylić z live |
| Domyślne hasło operatora | Ustaw `OPERATOR_PASSWORD` przed publicznym URL |
| E-mail z `resend.dev` | Punkt 3 — własna domena |
| Vipps/BLIK w UI ≠ włączone w Stripe | Sprawdź Payment methods w Stripe Dashboard |

---

## 7. Instrukcja dla Gemini — jak kontynuować

> Jesteś full-stack developerem przy projekcie **Rada Pism** w `web/`.  
> **Kod pilotażu jest gotowy.** Nie przebudowuj landing/formularza bez briefu.  
> Najpierw przeczytaj: `RAPORT-DLA-GEMINI.md`, `DEPLOY-VERCEL.md`, `submissions.ts`, `email.ts`, `api/webhook/stripe/route.ts`.  
>
> **Jeśli brief = deploy / env / webhook / Resend / E2E:** pomagaj według Punktów 1–4; nie wymyślaj sekretów — proś użytkownika o wklejenie do Vercel.  
> **Jeśli brief = nowa funkcja:** nie psuj kontraktów `/api/submit` i `/api/checkout`, AI Act, privacy analytics, ani wymogu „bez konta przed uploadem”.  
>
> Preferowany następny ruch produktowy: **dowieźć Punkt 1–3 na Vercel, potem Punkt 4 E2E na preview/prod.**

---

## 8. Szybki indeks „co otworzyć gdy…”

| Pytanie | Plik |
|---------|------|
| Jak ustawić env / Blob? | `DEPLOY-VERCEL.md` § Punkt 1 |
| Jak webhook Stripe? | `DEPLOY-VERCEL.md` § Punkt 2 |
| Jak domena e-mail? | `DEPLOY-VERCEL.md` § Punkt 3 |
| Jak testować PL/NO? | `DEPLOY-VERCEL.md` § Punkt 4 |
| Kwoty | `src/lib/pricing.ts` |
| Copy landing | `src/lib/content.ts` |
| Storage | `src/lib/submissions.ts` |
| E-maile | `src/lib/email.ts` |

---

**Podsumowanie jednym zdaniem:**  
Kod Rada Pism (smoke 48h) jest spięty end-to-end w `web/`; żeby iść dalej, potrzebujemy **Vercel + Blob + Stripe webhook + Resend z własną domeną + E2E na żywo** — reszta to dopracowanie po pierwszym płatnym zgłoszeniu.
