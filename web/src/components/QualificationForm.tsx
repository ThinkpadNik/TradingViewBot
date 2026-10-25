"use client";

import { useId, useState, type FormEvent } from "react";
import type { MarketContent } from "@/lib/content";
import { trackEvent } from "@/lib/analytics";

type Props = {
  content: MarketContent;
  open: boolean;
  onClose: () => void;
};

type SubmitApiResponse =
  | {
      success: true;
      submissionId: string;
      message: string;
      amountLabel: string;
      currency: "PLN" | "NOK";
      paymentMethods: { id: string; label: string }[];
    }
  | { success: false; error: string };

type CheckoutApiResponse =
  | {
      success: true;
      mode: "stripe" | "pilot_mock";
      submissionId: string;
      amountLabel: string;
      currency: "PLN" | "NOK";
      paymentMethods: { id: string; label: string }[];
      checkoutUrl: string;
      sessionId?: string;
    }
  | { success: false; error: string };

export function QualificationForm({ content, open, onClose }: Props) {
  const formId = useId();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [pkg, setPkg] = useState<"response" | "guardian">("response");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [amountLabel, setAmountLabel] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<
    { id: string; label: string }[]
  >([]);
  const [preferredMethod, setPreferredMethod] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const { form, packages, market } = content;
  const fileName = file?.name ?? null;
  const progressStep = step === 4 ? 4 : step;
  const progressLabel =
    step === 4 ? "płatność" : step === 3 ? "3" : String(step);

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function validateStep(current: number): boolean {
    setError(null);
    if (current === 1 && !file) {
      setError("Dodaj zdjęcie lub PDF dokumentu, aby przejść dalej.");
      return false;
    }
    if (current === 2) {
      for (const field of form.step2.fields) {
        if (field.required && !answers[field.id]?.trim()) {
          setError("Uzupełnij wszystkie wymagane pola kwalifikacji.");
          return false;
        }
      }
    }
    if (current === 3) {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Podaj prawidłowy adres e-mail.");
        return false;
      }
    }
    return true;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(3, s + 1));
  }

  function back() {
    setError(null);
    if (step === 4) {
      setStep(3);
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateStep(3) || !file || isSubmitting) return;

    const formData = new FormData();
    formData.append("market", market);
    formData.append("packageType", pkg);
    formData.append("email", email.trim());
    formData.append("phone", phone.trim());
    formData.append("customAnswers", JSON.stringify(answers));
    formData.append("file", file);

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        body: formData,
      });

      let data: SubmitApiResponse | null = null;
      try {
        data = (await res.json()) as SubmitApiResponse;
      } catch {
        setError("Serwer zwrócił nieprawidłową odpowiedź. Spróbuj ponownie.");
        return;
      }

      if (!res.ok || !data.success) {
        const message =
          data && "error" in data && data.error
            ? data.error
            : "Nie udało się zapisać zgłoszenia. Spróbuj ponownie.";
        setError(message);
        return;
      }

      setSubmissionId(data.submissionId);
      setAmountLabel(data.amountLabel);
      setPaymentMethods(data.paymentMethods);
      setPreferredMethod(data.paymentMethods[0]?.id ?? "");
      trackEvent("submit_success", { market });
      setStep(4);
    } catch {
      setError("Błąd połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCheckout() {
    if (!submissionId || isCheckingOut) return;
    setIsCheckingOut(true);
    setError(null);
    trackEvent("checkout_start", { market });

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          market,
          preferredMethod,
        }),
      });

      let data: CheckoutApiResponse | null = null;
      try {
        data = (await res.json()) as CheckoutApiResponse;
      } catch {
        setError("Serwer zwrócił nieprawidłową odpowiedź płatności.");
        return;
      }

      if (!res.ok || !data.success) {
        const message =
          data && "error" in data && data.error
            ? data.error
            : "Nie udało się utworzyć sesji płatności.";
        setError(message);
        return;
      }

      trackEvent("checkout_redirect", { market });
      window.location.assign(data.checkoutUrl);
    } catch {
      setError("Błąd połączenia przy inicjalizacji płatności.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  function resetAndClose() {
    setStep(1);
    setFile(null);
    setPkg("response");
    setAnswers({});
    setEmail("");
    setPhone("");
    setSubmissionId(null);
    setAmountLabel(null);
    setPaymentMethods([]);
    setPreferredMethod("");
    setIsSubmitting(false);
    setIsCheckingOut(false);
    setError(null);
    onClose();
  }

  const busy = isSubmitting || isCheckingOut;

  return (
    <section
      id="zamowienie"
      aria-labelledby={`${formId}-title`}
      className="animate-rise scroll-mt-8 border-t border-[var(--line)] bg-white/70"
    >
      <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fjord)]">
              Formularz · krok {progressLabel} z 4
            </p>
            <h2
              id={`${formId}-title`}
              className="mt-2 font-display text-2xl font-semibold text-[var(--ink)] sm:text-3xl"
            >
              {step === 4 ? "Płatność" : form.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={busy}
            className="text-sm font-medium text-[var(--ink-soft)]/70 underline-offset-2 hover:text-[var(--ink)] hover:underline disabled:opacity-50"
          >
            Zamknij
          </button>
        </div>

        <ol className="mb-8 flex gap-2" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <li
              key={n}
              className={`h-1 flex-1 rounded-full transition ${
                n <= progressStep ? "bg-[var(--fjord)]" : "bg-[var(--line)]"
              }`}
            />
          ))}
        </ol>

        {step === 4 ? (
          <div className="space-y-6">
            <div className="border border-[var(--line)] bg-white px-4 py-5 sm:px-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--fjord)]">
                Podsumowanie
              </p>
              <p className="mt-2 font-display text-xl font-semibold text-[var(--ink)]">
                {packages.find((p) => p.id === pkg)?.name} — {amountLabel}
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                Numer zgłoszenia:{" "}
                <span className="font-mono font-medium text-[var(--ink)]">
                  {submissionId}
                </span>
              </p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Potwierdzenie:{" "}
                <strong className="font-semibold text-[var(--ink)]">{email}</strong>
              </p>
            </div>

            <fieldset disabled={busy}>
              <legend className="text-sm font-semibold text-[var(--ink)]">
                Metoda płatności
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {paymentMethods.map((m) => {
                  const selected = preferredMethod === m.id;
                  return (
                    <label
                      key={m.id}
                      className={`cursor-pointer border px-3 py-2 text-sm font-medium transition ${
                        selected
                          ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                          : "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--fjord)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="payMethod"
                        value={m.id}
                        checked={selected}
                        onChange={() => setPreferredMethod(m.id)}
                        className="sr-only"
                      />
                      {m.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--ink-soft)]/80">
                {market === "pl"
                  ? "PL: BLIK lub karta — jednorazowa płatność."
                  : "NO: Vipps lub karta — jednorazowa płatność."}{" "}
                Jeśli Stripe nie jest skonfigurowany, używany jest bezpieczny tryb
                pilotażowy (mock) z przejściem na stronę sukcesu.
              </p>
            </fieldset>

            {error && (
              <p
                role="alert"
                aria-live="assertive"
                className="border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,white)] px-3 py-2.5 text-sm font-semibold text-[var(--accent)]"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={back}
                disabled={busy}
                className="px-4 py-2.5 text-sm font-semibold text-[var(--ink-soft)] underline-offset-2 hover:underline disabled:opacity-50"
              >
                Wstecz
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={busy || !preferredMethod}
                className="bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCheckingOut ? "Przekierowanie…" : `Opłać — ${amountLabel}`}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {step === 1 && (
              <fieldset className="space-y-4" disabled={busy}>
                <legend className="font-display text-lg font-semibold text-[var(--ink)]">
                  {form.step1.title}
                </legend>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-[var(--fjord)]/40 bg-[var(--mist)]/50 px-4 py-10 transition hover:border-[var(--fjord)] hover:bg-[var(--mist)]">
                  <input
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      setError(null);
                    }}
                  />
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    {fileName ? fileName : "Wybierz zdjęcie lub PDF"}
                  </span>
                  <span className="text-center text-xs text-[var(--ink-soft)]/80">
                    {form.step1.uploadHint}
                  </span>
                </label>
                <p className="text-xs leading-relaxed text-[var(--ink-soft)]/80">
                  {form.step1.privacy}
                </p>
              </fieldset>
            )}

            {step === 2 && (
              <fieldset className="space-y-5" disabled={busy}>
                <legend className="font-display text-lg font-semibold text-[var(--ink)]">
                  {form.step2.title}
                </legend>
                {form.step2.fields.map((field) => (
                  <div key={field.id}>
                    <label
                      htmlFor={`${formId}-${field.id}`}
                      className="block text-sm font-semibold text-[var(--ink)]"
                    >
                      {field.label}
                    </label>
                    {field.type === "radio" && field.options ? (
                      <div
                        role="radiogroup"
                        aria-labelledby={`${formId}-${field.id}-label`}
                        className="mt-2 flex flex-wrap gap-2"
                      >
                        <span id={`${formId}-${field.id}-label`} className="sr-only">
                          {field.label}
                        </span>
                        {field.options.map((opt) => {
                          const selected = answers[field.id] === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className={`cursor-pointer border px-3 py-2 text-sm font-medium transition ${
                                selected
                                  ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                                  : "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--fjord)]"
                              }`}
                            >
                              <input
                                type="radio"
                                name={field.id}
                                value={opt.value}
                                checked={selected}
                                onChange={() => setAnswer(field.id, opt.value)}
                                className="sr-only"
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={`${formId}-${field.id}`}
                        rows={3}
                        required={field.required}
                        placeholder={field.placeholder}
                        value={answers[field.id] ?? ""}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                        className="mt-2 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--fjord)] placeholder:text-[var(--ink-soft)]/45 focus:ring-2"
                      />
                    ) : (
                      <input
                        id={`${formId}-${field.id}`}
                        type={field.type}
                        required={field.required}
                        placeholder={field.placeholder}
                        value={answers[field.id] ?? ""}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                        className="mt-2 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--fjord)] focus:ring-2"
                      />
                    )}
                  </div>
                ))}
              </fieldset>
            )}

            {step === 3 && (
              <fieldset className="space-y-5" disabled={busy}>
                <legend className="font-display text-lg font-semibold text-[var(--ink)]">
                  {form.step3.title}
                </legend>

                <div className="space-y-2">
                  {packages.map((p) => {
                    const selected = pkg === p.id;
                    return (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer gap-3 border px-4 py-3 transition ${
                          selected
                            ? "border-[var(--fjord)] bg-[var(--mist)]/60"
                            : "border-[var(--line)] bg-white hover:border-[var(--fjord)]/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="package"
                          value={p.id}
                          checked={selected}
                          onChange={() => setPkg(p.id)}
                          className="mt-1 accent-[var(--fjord)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold text-[var(--ink)]">{p.name}</span>
                            <span className="font-display text-lg font-semibold text-[var(--ink)]">
                              {p.price}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--ink-soft)]/80">
                            {p.description}
                            {p.default ? " · domyślnie zaznaczone" : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-email`}
                    className="block text-sm font-semibold text-[var(--ink)]"
                  >
                    {form.step3.emailLabel}
                  </label>
                  <input
                    id={`${formId}-email`}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--fjord)] focus:ring-2"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-phone`}
                    className="block text-sm font-semibold text-[var(--ink)]"
                  >
                    {form.step3.phoneLabel}
                  </label>
                  <input
                    id={`${formId}-phone`}
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-2 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--fjord)] focus:ring-2"
                  />
                  <p className="mt-1 text-xs text-[var(--ink-soft)]/70">
                    {form.step3.phoneHint}
                  </p>
                </div>
              </fieldset>
            )}

            {error && (
              <p
                role="alert"
                aria-live="assertive"
                className="border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,white)] px-3 py-2.5 text-sm font-semibold text-[var(--accent)]"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={back}
                  disabled={busy}
                  className="px-4 py-2.5 text-sm font-semibold text-[var(--ink-soft)] underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Wstecz
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  onClick={next}
                  disabled={busy}
                  className="bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)] disabled:opacity-50"
                >
                  Dalej
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={busy}
                  className="bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Zapisywanie…" : form.step3.payCta}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
