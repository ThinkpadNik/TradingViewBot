import { NextResponse } from "next/server";
import { getPriceQuote } from "@/lib/pricing";
import { getSubmission, updateSubmission } from "@/lib/submissions";
import type { Market } from "@/lib/content";

export const runtime = "nodejs";

type CheckoutSuccess = {
  success: true;
  mode: "stripe" | "pilot_mock";
  submissionId: string;
  amountLabel: string;
  currency: "PLN" | "NOK";
  paymentMethods: { id: string; label: string }[];
  checkoutUrl: string;
  sessionId?: string;
};

type CheckoutFailure = {
  success: false;
  error: string;
};

const ALLOWED_MARKETS = new Set(["no", "pl"]);

function fail(error: string, status = 400) {
  const body: CheckoutFailure = { success: false, error };
  return NextResponse.json(body, { status });
}

function appOrigin(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envUrl) return envUrl;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

async function createStripeCheckoutSession(input: {
  secretKey: string;
  submissionId: string;
  email: string;
  amountMinor: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string } | null> {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.submissionId);
  body.set("customer_email", input.email);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(input.amountMinor));
  body.set("line_items[0][price_data][product_data][name]", input.productName);
  body.set("metadata[submissionId]", input.submissionId);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[rada-pism/checkout] Stripe error:", errText.slice(0, 500));
    return null;
  }

  const data = (await res.json()) as { id?: string; url?: string | null };
  if (!data.id || !data.url) return null;
  return { id: data.id, url: data.url };
}

export async function POST(request: Request) {
  let payload: { submissionId?: string; market?: string; preferredMethod?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return fail("Oczekiwano JSON z polami submissionId i market.");
  }

  const submissionId = String(payload.submissionId ?? "").trim();
  const marketRaw = String(payload.market ?? "").trim();
  const preferredMethod = String(payload.preferredMethod ?? "").trim();

  if (!submissionId) {
    return fail("Brak submissionId.");
  }
  if (!marketRaw || !ALLOWED_MARKETS.has(marketRaw)) {
    return fail("Brak lub nieprawidłowy rynek (market: no | pl).");
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    return fail("Nie znaleziono zgłoszenia o podanym ID.", 404);
  }
  if (submission.market !== marketRaw) {
    return fail("Rynek nie zgadza się ze zgłoszeniem.");
  }

  const market = marketRaw as Market;
  const quote = getPriceQuote(market, submission.packageType);
  const origin = appOrigin(request);
  const successUrl = `${origin}/sukces?id=${encodeURIComponent(submissionId)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/${market}#zamowienie`;
  const productName =
    submission.packageType === "guardian"
      ? "Rada Pism — Strażnik Sprawy"
      : "Rada Pism — Gotowa odpowiedź";

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (stripeKey) {
    const session = await createStripeCheckoutSession({
      secretKey: stripeKey,
      submissionId,
      email: submission.email,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      productName,
      successUrl,
      cancelUrl,
    });

    if (session) {
      await updateSubmission(submissionId, {
        paymentStatus: "checkout_created",
        checkoutSessionId: session.id,
      });

      const body: CheckoutSuccess = {
        success: true,
        mode: "stripe",
        submissionId,
        amountLabel: quote.label,
        currency: quote.currency,
        paymentMethods: quote.paymentMethods,
        checkoutUrl: session.url,
        sessionId: session.id,
      };
      return NextResponse.json(body);
    }

    console.warn(
      "[rada-pism/checkout] Stripe niedostępne — fallback do trybu pilotażowego.",
    );
  }

  await updateSubmission(submissionId, {
    paymentStatus: "checkout_created",
  });

  const methodQs = preferredMethod
    ? `&method=${encodeURIComponent(preferredMethod)}`
    : "";
  const mockUrl = `${origin}/sukces?id=${encodeURIComponent(submissionId)}&mock=1${methodQs}`;

  console.info("[rada-pism/checkout]", {
    mode: "pilot_mock",
    submissionId,
    market,
    amount: quote.label,
    preferredMethod: preferredMethod || null,
  });

  const body: CheckoutSuccess = {
    success: true,
    mode: "pilot_mock",
    submissionId,
    amountLabel: quote.label,
    currency: quote.currency,
    paymentMethods: quote.paymentMethods,
    checkoutUrl: mockUrl,
  };

  return NextResponse.json(body);
}
