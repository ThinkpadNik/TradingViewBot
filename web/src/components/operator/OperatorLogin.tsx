"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/content";

type Props = {
  passwordHint: string;
};

export function OperatorLogin({ passwordHint }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error || "Logowanie nie powiodło się.");
        return;
      }
      router.refresh();
    } catch {
      setError("Błąd połączenia z serwerem.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="atmosphere paper-grain flex min-h-screen items-center justify-center px-5 py-16">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md border border-[var(--line)] bg-white/90 px-6 py-8 shadow-[0_20px_50px_-28px_rgba(12,28,36,0.45)]"
      >
        <p className="font-display text-2xl font-semibold text-[var(--ink)]">
          {brand.name}
        </p>
        <h1 className="mt-2 font-display text-xl font-semibold text-[var(--ink)]">
          Panel operatora
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]/80">{passwordHint}</p>

        <label className="mt-6 block text-sm font-semibold text-[var(--ink)]">
          Hasło
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--fjord)] focus:ring-2"
            required
          />
        </label>

        {error && (
          <p
            role="alert"
            className="mt-4 border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,white)] px-3 py-2 text-sm font-semibold text-[var(--accent)]"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)] disabled:opacity-60"
        >
          {loading ? "Logowanie…" : "Wejdź"}
        </button>
      </form>
    </div>
  );
}
