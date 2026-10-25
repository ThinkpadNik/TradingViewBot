# Rada Pism — Landing (Smoke Test 48h)

Landing page + 3-krokowy formularz kwalifikacji dla dwóch rynków:

- `/no` — Norwegia (Inkasso / Pisma) — widok domyślny
- `/pl` — Polska (Kosztorys OC/AC)

`/` przekierowuje na `/no`.

## Uruchomienie

```bash
cd web
npm install
npm run dev
```

Build produkcyjny: `npm run build && npm start`.

## Zakres pilotażu

- Above the fold: problem → karta demonstracyjna panelu AI → CTA
- Formularz po CTA: upload → kwalifikacja (różna per rynek) → pakiet + kontakt
- Stopka z ujawnieniem AI Act Art. 50
- Bez wymogu konta przed uploadem
- API zgłoszeń: `POST /api/submit` — zapis pliku w `uploads/` + metadane w `data/submissions.json`
- Checkout: `POST /api/checkout` — Stripe Checkout (gdy `STRIPE_SECRET_KEY`) lub mock → `/sukces?id=sub_…`
- Formularz: krok 4 płatności (BLIK/Karta PL, Vipps/Karta NO)
