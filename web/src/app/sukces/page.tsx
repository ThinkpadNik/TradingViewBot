import Link from "next/link";
import { brand } from "@/lib/content";
import { sendPaymentConfirmedEmail } from "@/lib/email";
import { getSubmission, updateSubmission } from "@/lib/submissions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function verifyStripeSessionPaid(sessionId: string): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return false;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { payment_status?: string };
    return data.payment_status === "paid";
  } catch {
    return false;
  }
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const id = first(params.id);
  const mock = first(params.mock) === "1";
  const method = first(params.method);
  const sessionId = first(params.session_id);

  let submission = id ? await getSubmission(id) : null;
  let awaitingWebhook = false;

  if (submission && mock) {
    submission =
      (await updateSubmission(submission.id, {
        paymentStatus: "mock_paid",
      })) ?? submission;
  } else if (submission && sessionId) {
    const paid = await verifyStripeSessionPaid(sessionId);
    if (paid) {
      submission =
        (await updateSubmission(submission.id, {
          paymentStatus: "paid",
          checkoutSessionId: sessionId,
        })) ?? submission;
    } else if (
      submission.paymentStatus !== "paid" &&
      submission.paymentStatus !== "mock_paid"
    ) {
      awaitingWebhook = true;
    }
  }

  if (
    submission &&
    (submission.paymentStatus === "paid" ||
      submission.paymentStatus === "mock_paid") &&
    !submission.paidEmailSentAt
  ) {
    const mail = await sendPaymentConfirmedEmail(submission);
    if (mail.sent) {
      submission =
        (await updateSubmission(submission.id, {
          paidEmailSentAt: new Date().toISOString(),
        })) ?? submission;
    }
  }

  const marketHref = submission?.market === "pl" ? "/pl" : "/no";
  const amountLabel =
    submission != null
      ? submission.currency === "PLN"
        ? `${submission.amountMajor} zł`
        : `${submission.amountMajor} NOK`
      : null;

  const confirmed =
    submission &&
    (submission.paymentStatus === "paid" ||
      submission.paymentStatus === "mock_paid");

  return (
    <div className="atmosphere paper-grain min-h-screen">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16 sm:px-8">
        <p className="font-display text-2xl font-semibold text-[var(--ink)]">
          {brand.name}
        </p>
        <h1 className="mt-6 font-display text-3xl font-semibold text-[var(--ink)]">
          {!submission
            ? "Brak zgłoszenia"
            : confirmed
              ? "Płatność przyjęta"
              : "Oczekujemy na potwierdzenie"}
        </h1>

        {submission ? (
          <div className="mt-6 space-y-3 text-sm leading-relaxed text-[var(--ink-soft)]">
            <p>
              Zgłoszenie{" "}
              <span className="font-mono font-semibold text-[var(--ink)]">
                {submission.id}
              </span>
              {confirmed
                ? " jest w kolejce do weryfikacji (pilotaż do 24h)."
                : " — status płatności zostanie potwierdzony webhookiem Stripe."}
            </p>
            {amountLabel && (
              <p>
                Kwota:{" "}
                <strong className="font-semibold text-[var(--ink)]">
                  {amountLabel}
                </strong>
                {method ? ` · metoda: ${method.toUpperCase()}` : null}
                {mock ? " · tryb pilotażowy (mock)" : null}
              </p>
            )}
            {awaitingWebhook && (
              <p className="text-xs text-[var(--ink-soft)]/70">
                Jeśli przed chwilą zapłaciłeś kartą/Vipps/BLIK, odśwież stronę za
                kilka sekund — webhook ustawi status na „opłacone”.
              </p>
            )}
            <p>
              Potwierdzenie wyślemy na{" "}
              <strong className="font-semibold text-[var(--ink)]">
                {submission.email}
              </strong>
              .
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-[var(--ink-soft)]">
            Nie znaleziono zgłoszenia. Wróć do formularza i wyślij dokumenty ponownie.
          </p>
        )}

        <Link
          href={marketHref}
          className="mt-10 inline-flex w-fit bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)]"
        >
          Wróć do strony
        </Link>
      </main>
    </div>
  );
}
