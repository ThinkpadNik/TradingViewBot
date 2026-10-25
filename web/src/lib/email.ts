import type { SubmissionRecord } from "@/lib/submissions";

type SendResult = { sent: boolean; skipped?: boolean; error?: string };

function amountLabel(record: SubmissionRecord): string {
  return record.currency === "PLN"
    ? `${record.amountMajor} zł`
    : `${record.amountMajor} NOK`;
}

function packageLabel(record: SubmissionRecord): string {
  return record.packageType === "guardian"
    ? "Strażnik Sprawy"
    : "Gotowa odpowiedź";
}

function fromAddress(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    "Rada Pism <onboarding@resend.dev>"
  );
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[rada-pism/email] RESEND_API_KEY missing — skip send", {
      toDomain: input.to.split("@")[1] ?? "unknown",
      subject: input.subject,
    });
    return { sent: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[rada-pism/email] Resend error:", errText.slice(0, 400));
      return { sent: false, error: errText.slice(0, 200) };
    }

    return { sent: true };
  } catch (err) {
    console.error("[rada-pism/email] network error", err);
    return { sent: false, error: "network_error" };
  }
}

export async function sendSubmissionReceivedEmail(
  record: SubmissionRecord,
): Promise<SendResult> {
  const amount = amountLabel(record);
  const pkg = packageLabel(record);
  const subject = `Rada Pism — przyjęliśmy zgłoszenie ${record.id}`;
  const text = [
    `Dziękujemy. Przyjęliśmy Twoje zgłoszenie.`,
    ``,
    `Numer: ${record.id}`,
    `Pakiet: ${pkg}`,
    `Kwota: ${amount}`,
    `Rynek: ${record.market.toUpperCase()}`,
    ``,
    `Po opłaceniu przygotujemy odpowiedź w ciągu 24 godzin (pilotaż z weryfikacją).`,
    `Usługa nie stanowi zastępstwa procesowego ani indywidualnej porady adwokackiej.`,
  ].join("\n");

  const html = `
    <p>Dziękujemy. Przyjęliśmy Twoje zgłoszenie.</p>
    <ul>
      <li><strong>Numer:</strong> ${record.id}</li>
      <li><strong>Pakiet:</strong> ${pkg}</li>
      <li><strong>Kwota:</strong> ${amount}</li>
      <li><strong>Rynek:</strong> ${record.market.toUpperCase()}</li>
    </ul>
    <p>Po opłaceniu przygotujemy odpowiedź w ciągu <strong>24 godzin</strong> (pilotaż z weryfikacją).</p>
    <p style="color:#555;font-size:12px">Usługa nie stanowi zastępstwa procesowego ani indywidualnej porady adwokackiej.</p>
  `;

  return sendResendEmail({ to: record.email, subject, html, text });
}

export async function sendPaymentConfirmedEmail(
  record: SubmissionRecord,
): Promise<SendResult> {
  const amount = amountLabel(record);
  const pkg = packageLabel(record);
  const subject = `Rada Pism — płatność potwierdzona (${record.id})`;
  const text = [
    `Płatność za zgłoszenie ${record.id} została potwierdzona.`,
    ``,
    `Pakiet: ${pkg}`,
    `Kwota: ${amount}`,
    ``,
    `Dokument z instrukcją wyślemy w ciągu 24 godzin na ten adres e-mail.`,
  ].join("\n");

  const html = `
    <p>Płatność za zgłoszenie <strong>${record.id}</strong> została potwierdzona.</p>
    <ul>
      <li><strong>Pakiet:</strong> ${pkg}</li>
      <li><strong>Kwota:</strong> ${amount}</li>
    </ul>
    <p>Dokument z instrukcją wyślemy w ciągu <strong>24 godzin</strong> na ten adres e-mail.</p>
  `;

  return sendResendEmail({ to: record.email, subject, html, text });
}
