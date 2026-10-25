import type { MarketContent } from "@/lib/content";

export function DemoPanel({ demo }: { demo: MarketContent["demo"] }) {
  return (
    <aside
      aria-label="Przykład demonstracyjny analizy"
      className="animate-panel-in relative overflow-hidden rounded-sm border border-[var(--line)] bg-white/90 shadow-[0_24px_60px_-28px_rgba(12,28,36,0.45)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--ink)] px-4 py-2.5 text-white sm:px-5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/90 sm:text-xs">
          {demo.badge}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-300/95 sm:text-xs">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Panel 3/3
        </span>
      </div>

      <div className="space-y-4 px-4 py-5 sm:px-5 sm:py-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fjord)]">
            {demo.detectedLabel}
          </p>
          <p className="mt-1 font-display text-lg font-semibold leading-snug text-[var(--ink)] sm:text-xl">
            {demo.detectedValue}
          </p>
        </div>

        <div className="border-t border-[var(--line)] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fjord)]">
            {demo.panelTitle}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)] sm:text-[15px]">
            {demo.panelBody}
          </p>
        </div>

        <div
          role="note"
          className="border-l-[3px] border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,white)] px-3 py-3"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--warn)]">
            Ostrzeżenie taktyczne Rady AI
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink)]">
            {demo.warning}
          </p>
        </div>
      </div>
    </aside>
  );
}
