"use client";

import { useId, useState, type FormEvent } from "react";
import type { MarketContent } from "@/lib/content";

type Props = {
  content: MarketContent;
  open: boolean;
  onClose: () => void;
};

export function QualificationForm({ content, open, onClose }: Props) {
  const formId = useId();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pkg, setPkg] = useState<"response" | "guardian">("response");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const { form, packages } = content;

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function validateStep(current: number): boolean {
    setError(null);
    if (current === 1 && !fileName) {
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
    setStep((s) => Math.max(1, s - 1));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateStep(3)) return;
    // Smoke-test: capture intent locally; payment gateway wires in later stage
    setSubmitted(true);
  }

  function resetAndClose() {
    setStep(1);
    setFileName(null);
    setPkg("response");
    setAnswers({});
    setEmail("");
    setPhone("");
    setSubmitted(false);
    setError(null);
    onClose();
  }

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
              Formularz · krok {submitted ? "gotowe" : step} z 3
            </p>
            <h2
              id={`${formId}-title`}
              className="mt-2 font-display text-2xl font-semibold text-[var(--ink)] sm:text-3xl"
            >
              {form.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="text-sm font-medium text-[var(--ink-soft)]/70 underline-offset-2 hover:text-[var(--ink)] hover:underline"
          >
            Zamknij
          </button>
        </div>

        {!submitted && (
          <ol className="mb-8 flex gap-2" aria-hidden>
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className={`h-1 flex-1 rounded-full transition ${
                  n <= step ? "bg-[var(--fjord)]" : "bg-[var(--line)]"
                }`}
              />
            ))}
          </ol>
        )}

        {submitted ? (
          <div className="rounded-sm border border-[var(--success)]/30 bg-[color-mix(in_srgb,var(--success)_8%,white)] px-5 py-8">
            <p className="font-display text-xl font-semibold text-[var(--ink)]">
              Zgłoszenie zapisane
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              Dziękujemy. W pilotażu 48h przejście do bramki płatności (Karta / Vipps / BLIK)
              podłączymy w kolejnym etapie. Skontaktujemy się na{" "}
              <strong className="font-semibold text-[var(--ink)]">{email}</strong> w sprawie
              weryfikacji dokumentu i płatności za pakiet{" "}
              <strong className="font-semibold text-[var(--ink)]">
                {packages.find((p) => p.id === pkg)?.name}
              </strong>
              .
            </p>
            <button
              type="button"
              onClick={resetAndClose}
              className="mt-6 text-sm font-semibold text-[var(--fjord)] underline-offset-2 hover:underline"
            >
              Wróć do strony
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {step === 1 && (
              <fieldset className="space-y-4">
                <legend className="font-display text-lg font-semibold text-[var(--ink)]">
                  {form.step1.title}
                </legend>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-[var(--fjord)]/40 bg-[var(--mist)]/50 px-4 py-10 transition hover:border-[var(--fjord)] hover:bg-[var(--mist)]">
                  <input
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setFileName(f ? f.name : null);
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
              <fieldset className="space-y-5">
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
              <fieldset className="space-y-5">
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
                  className="px-4 py-2.5 text-sm font-semibold text-[var(--ink-soft)] underline-offset-2 hover:underline"
                >
                  Wstecz
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  onClick={next}
                  className="bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)]"
                >
                  Dalej
                </button>
              ) : (
                <button
                  type="submit"
                  className="bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                >
                  {form.step3.payCta}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
