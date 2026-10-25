import { NextResponse } from "next/server";
import { sendPaymentConfirmedEmail } from "@/lib/email";
import {
  verifyStripeWebhookSignature,
  type StripeCheckoutSessionCompleted,
} from "@/lib/stripe-webhook";
import { getSubmission, updateSubmission } from "@/lib/submissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "STRIPE_WEBHOOK_SECRET nie jest skonfigurowany." },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const verified = verifyStripeWebhookSignature({
    payload,
    signatureHeader: signature,
    secret,
  });

  if (!verified.ok) {
    return NextResponse.json(
      { success: false, error: verified.error },
      { status: 400 },
    );
  }

  let event: StripeCheckoutSessionCompleted;
  try {
    event = JSON.parse(payload) as StripeCheckoutSessionCompleted;
  } catch {
    return NextResponse.json(
      { success: false, error: "Nieprawidłowy JSON webhooka." },
      { status: 400 },
    );
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ success: true, ignored: true, type: event.type });
  }

  const session = event.data?.object;
  const submissionId =
    session?.metadata?.submissionId?.trim() ||
    session?.client_reference_id?.trim() ||
    "";

  if (!submissionId) {
    console.warn("[rada-pism/webhook] brak submissionId w sesji", session?.id);
    return NextResponse.json({
      success: true,
      ignored: true,
      reason: "missing_submission_id",
    });
  }

  const existing = await getSubmission(submissionId);
  if (!existing) {
    console.warn("[rada-pism/webhook] nieznane zgłoszenie", submissionId);
    return NextResponse.json(
      { success: false, error: "Nie znaleziono zgłoszenia." },
      { status: 404 },
    );
  }

  const updated = await updateSubmission(submissionId, {
    paymentStatus: "paid",
    checkoutSessionId: session.id || existing.checkoutSessionId,
  });

  console.info("[rada-pism/webhook] paid", {
    submissionId,
    sessionId: session.id,
    payment_status: session.payment_status,
  });

  if (updated && !updated.paidEmailSentAt) {
    const mail = await sendPaymentConfirmedEmail(updated);
    if (mail.sent) {
      await updateSubmission(submissionId, {
        paidEmailSentAt: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ success: true, submissionId, status: "paid" });
}
