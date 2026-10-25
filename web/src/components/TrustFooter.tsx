import { brand, sharedFooterAiAct } from "@/lib/content";

export function TrustFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--ink)] text-white/85">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
        <p className="font-display text-xl font-semibold text-white">{brand.name}</p>
        <p className="mt-1 text-sm text-white/55">{brand.pilot}</p>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-white/75">
          <span className="font-semibold text-white/90">Zgodność z AI Act (Art. 50): </span>
          {sharedFooterAiAct}
        </p>

        <p className="mt-8 text-xs text-white/40">
          © {new Date().getFullYear()} {brand.name}. Pilotaż produktowy — smoke test 48h.
        </p>
      </div>
    </footer>
  );
}
