import Link from "next/link";
import { brand } from "@/lib/content";
import { getSubmission, updateSubmission } from "@/lib/submissions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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

  let submission = id ? await getSubmission(id) : null;

  if (submission && (mock || first(params.session_id))) {
    submission =
      (await updateSubmission(submission.id, {
        paymentStatus: mock ? "mock_paid" : "paid",
      })) ?? submission;
  }

  const marketHref = submission?.market === "pl" ? "/pl" : "/no";
  const amountLabel =
    submission != null
      ? submission.currency === "PLN"
        ? `${submission.amountMajor} zł`
        : `${submission.amountMajor} NOK`
      : null;

  return (
    <div className="atmosphere paper-grain min-h-screen">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-16 sm:px-8">
        <p className="font-display text-2xl font-semibold text-[var(--ink)]">
          {brand.name}
        </p>
        <h1 className="mt-6 font-display text-3xl font-semibold text-[var(--ink)]">
          {submission ? "Płatność przyjęta" : "Brak zgłoszenia"}
        </h1>

        {submission ? (
          <div className="mt-6 space-y-3 text-sm leading-relaxed text-[var(--ink-soft)]">
            <p>
              Dziękujemy. Zgłoszenie{" "}
              <span className="font-mono font-semibold text-[var(--ink)]">
                {submission.id}
              </span>{" "}
              jest w kolejce do weryfikacji (pilotaż do 24h).
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
