"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/content";
import type { SubmissionRecord } from "@/lib/submissions";

type MarketFilter = "all" | "no" | "pl";

type Props = {
  submissions: SubmissionRecord[];
};

function packageLabel(pkg: SubmissionRecord["packageType"]): string {
  return pkg === "guardian" ? "Strażnik Sprawy" : "Gotowa odpowiedź";
}

function paymentLabel(status: SubmissionRecord["paymentStatus"]): {
  text: string;
  paid: boolean;
} {
  if (status === "paid" || status === "mock_paid") {
    return { text: status === "mock_paid" ? "Opłacone (mock)" : "Opłacone", paid: true };
  }
  if (status === "checkout_created") {
    return { text: "Checkout utworzony", paid: false };
  }
  return { text: "Oczekujące", paid: false };
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Oslo",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function OperatorDashboard({ submissions }: Props) {
  const router = useRouter();
  const [market, setMarket] = useState<MarketFilter>("all");
  const [loggingOut, setLoggingOut] = useState(false);

  const filtered = useMemo(() => {
    if (market === "all") return submissions;
    return submissions.filter((s) => s.market === market);
  }, [submissions, market]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/operator/logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="atmosphere paper-grain min-h-screen">
      <header className="border-b border-[var(--line)] bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="font-display text-2xl font-semibold text-[var(--ink)]">
              {brand.name}
            </p>
            <p className="text-sm text-[var(--ink-soft)]/80">
              Panel operatora · {submissions.length} zgłoszeń
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="text-sm font-semibold text-[var(--ink-soft)] underline-offset-2 hover:text-[var(--ink)] hover:underline disabled:opacity-50"
          >
            {loggingOut ? "Wylogowywanie…" : "Wyloguj"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fjord)]">
            Filtr rynku
          </span>
          {(
            [
              { id: "all", label: "Wszystkie" },
              { id: "no", label: "NO" },
              { id: "pl", label: "PL" },
            ] as const
          ).map((opt) => {
            const active = market === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMarket(opt.id)}
                className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--ink)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--fjord)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-[var(--ink-soft)]/70">
            Widoczne: {filtered.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="border border-dashed border-[var(--line)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--ink-soft)]">
            Brak zgłoszeń dla wybranego filtra.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto border border-[var(--line)] bg-white/90 md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--mist)]/60 text-xs uppercase tracking-wider text-[var(--fjord)]">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Data</th>
                    <th className="px-3 py-3 font-semibold">Rynek</th>
                    <th className="px-3 py-3 font-semibold">Pakiet</th>
                    <th className="px-3 py-3 font-semibold">E-mail</th>
                    <th className="px-3 py-3 font-semibold">Płatność</th>
                    <th className="px-3 py-3 font-semibold">Plik</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const pay = paymentLabel(s.paymentStatus);
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-[var(--line)] last:border-0"
                      >
                        <td className="px-3 py-3 text-[var(--ink-soft)]">
                          <div>{formatDate(s.createdAt)}</div>
                          <div className="font-mono text-[10px] text-[var(--ink-soft)]/60">
                            {s.id}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-semibold uppercase text-[var(--ink)]">
                          {s.market}
                        </td>
                        <td className="px-3 py-3 text-[var(--ink)]">
                          {packageLabel(s.packageType)}
                          <div className="text-xs text-[var(--ink-soft)]/70">
                            {s.currency === "PLN"
                              ? `${s.amountMajor} zł`
                              : `${s.amountMajor} NOK`}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[var(--ink)]">{s.email}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-semibold ${
                              pay.paid
                                ? "bg-[color-mix(in_srgb,var(--success)_12%,white)] text-[var(--success)]"
                                : "bg-[color-mix(in_srgb,var(--accent)_10%,white)] text-[var(--accent)]"
                            }`}
                          >
                            {pay.text}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={`/api/operator/download?submissionId=${encodeURIComponent(s.id)}`}
                              className="font-semibold text-[var(--fjord)] underline-offset-2 hover:underline"
                            >
                              Pobierz
                            </a>
                            <a
                              href={`/api/operator/download?submissionId=${encodeURIComponent(s.id)}&inline=1`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-[var(--ink-soft)] underline-offset-2 hover:underline"
                            >
                              Podgląd
                            </a>
                          </div>
                          <p className="mt-1 max-w-[180px] truncate text-[10px] text-[var(--ink-soft)]/60">
                            {s.originalFileName}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile tiles */}
            <ul className="space-y-3 md:hidden">
              {filtered.map((s) => {
                const pay = paymentLabel(s.paymentStatus);
                return (
                  <li
                    key={s.id}
                    className="border border-[var(--line)] bg-white/90 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[var(--ink-soft)]/70">
                          {formatDate(s.createdAt)}
                        </p>
                        <p className="mt-1 font-semibold uppercase text-[var(--ink)]">
                          {s.market} · {packageLabel(s.packageType)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 text-xs font-semibold ${
                          pay.paid
                            ? "bg-[color-mix(in_srgb,var(--success)_12%,white)] text-[var(--success)]"
                            : "bg-[color-mix(in_srgb,var(--accent)_10%,white)] text-[var(--accent)]"
                        }`}
                      >
                        {pay.text}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--ink)]">{s.email}</p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--ink-soft)]/60">
                      {s.id}
                    </p>
                    <div className="mt-3 flex gap-3 text-sm">
                      <a
                        href={`/api/operator/download?submissionId=${encodeURIComponent(s.id)}`}
                        className="font-semibold text-[var(--fjord)] underline-offset-2 hover:underline"
                      >
                        Pobierz
                      </a>
                      <a
                        href={`/api/operator/download?submissionId=${encodeURIComponent(s.id)}&inline=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--ink-soft)] underline-offset-2 hover:underline"
                      >
                        Podgląd
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
