import Link from "next/link";
import { brand, type Market } from "@/lib/content";

export function SiteHeader({ market }: { market: Market }) {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href={market === "no" ? "/no" : "/pl"} className="group min-w-0">
        <span className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
          {brand.name}
        </span>
        <span className="mt-0.5 block text-xs font-medium tracking-wide text-[var(--ink-soft)]/70 sm:text-sm">
          {brand.tagline}
        </span>
      </Link>

      <nav
        aria-label="Wybór rynku"
        className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--line)] bg-white/70 p-1 shadow-sm backdrop-blur-sm"
      >
        <Link
          href="/no"
          className={`rounded px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
            market === "no"
              ? "bg-[var(--ink)] text-white"
              : "text-[var(--ink-soft)] hover:bg-white"
          }`}
          aria-current={market === "no" ? "page" : undefined}
        >
          NO — Inkasso
        </Link>
        <Link
          href="/pl"
          className={`rounded px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
            market === "pl"
              ? "bg-[var(--ink)] text-white"
              : "text-[var(--ink-soft)] hover:bg-white"
          }`}
          aria-current={market === "pl" ? "page" : undefined}
        >
          PL — OC/AC
        </Link>
      </nav>
    </header>
  );
}
