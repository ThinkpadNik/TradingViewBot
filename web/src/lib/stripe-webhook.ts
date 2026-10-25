import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Stripe-Signature header (t=…,v1=…) without the Stripe SDK.
 * @see https://stripe.com/docs/webhooks/signatures
 */
export function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
}): { ok: true; timestamp: number } | { ok: false; error: string } {
  if (!input.signatureHeader) {
    return { ok: false, error: "Brak nagłówka Stripe-Signature." };
  }

  const parts = Object.fromEntries(
    input.signatureHeader.split(",").map((pair) => {
      const [k, v] = pair.split("=");
      return [k.trim(), v?.trim() ?? ""];
    }),
  );

  const timestamp = Number(parts.t);
  const v1 = parts.v1;
  if (!timestamp || !v1) {
    return { ok: false, error: "Nieprawidłowy format Stripe-Signature." };
  }

  const tolerance = input.toleranceSeconds ?? 300;
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > tolerance) {
    return { ok: false, error: "Sygnatura Stripe wygasła (timestamp)." };
  }

  const signed = `${timestamp}.${input.payload}`;
  const expected = createHmac("sha256", input.secret)
    .update(signed, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "Nieprawidłowa sygnatura Stripe." };
  }

  return { ok: true, timestamp };
}

export type StripeCheckoutSessionCompleted = {
  id: string;
  object: string;
  type: string;
  data: {
    object: {
      id: string;
      object: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string> | null;
      payment_status?: string;
      customer_email?: string | null;
    };
  };
};
