"use client";

import { useEffect, useRef, useState } from "react";
import { brand, markets, type Market } from "@/lib/content";
import { trackEvent } from "@/lib/analytics";
import { SiteHeader } from "@/components/SiteHeader";
import { DemoPanel } from "@/components/DemoPanel";
import { QualificationForm } from "@/components/QualificationForm";
import { TrustFooter } from "@/components/TrustFooter";

export function LandingPage({ market }: { market: Market }) {
  const content = markets[market];
  const [formOpen, setFormOpen] = useState(false);
  const formAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#zamowienie") {
      setFormOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const id = window.setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [formOpen]);

  function openForm() {
    trackEvent("cta_click", { market });
    trackEvent("form_open", { market });
    setFormOpen(true);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#zamowienie");
    }
  }

  return (
    <div className="atmosphere paper-grain min-h-screen">
      <SiteHeader market={market} />

      <main>
        {/* Above the fold: exactly 3 blocks — problem, proof, offer */}
        <section className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-4 sm:gap-12 sm:px-8 sm:pb-20 sm:pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-14">
          <div className="min-w-0">
            <p className="animate-rise text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fjord)]">
              {content.navLabel}
              <span className="mx-2 text-[var(--line)]">·</span>
              {brand.pilot}
            </p>

            <h1 className="animate-rise-delay-1 mt-4 font-display text-[1.65rem] font-semibold leading-[1.18] tracking-tight text-[var(--ink)] sm:text-4xl sm:leading-[1.15] lg:text-[2.35rem]">
              {content.h1}
            </h1>
            <span
              className="animate-underline mt-4 block h-0.5 w-16 origin-left bg-[var(--accent)]"
              aria-hidden
            />

            <p className="animate-rise-delay-2 mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-soft)] sm:text-lg">
              {content.subtitle}
            </p>

            <div className="animate-rise-delay-3 mt-8 max-w-md">
              <button
                type="button"
                onClick={openForm}
                className="group relative w-full overflow-hidden bg-[var(--accent)] px-6 py-4 text-center text-base font-bold text-white shadow-[0_14px_36px_-12px_rgba(196,92,38,0.55)] transition hover:bg-[var(--accent-hover)] sm:w-auto sm:min-w-[280px]"
              >
                <span className="relative z-10">{content.cta.label}</span>
                <span
                  className="pointer-events-none absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition duration-700 group-hover:translate-x-[120%]"
                  aria-hidden
                />
              </button>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]/85">
                {content.cta.note}
              </p>
              <p className="mt-2 text-xs font-medium text-[var(--ink-soft)]/60">
                Bez zakładania konta — wgrywasz dokument od razu.
              </p>
            </div>
          </div>

          <DemoPanel demo={content.demo} />
        </section>

        <div ref={formAnchorRef}>
          <QualificationForm
            content={content}
            open={formOpen}
            onClose={() => setFormOpen(false)}
          />
        </div>
      </main>

      <TrustFooter />
    </div>
  );
}
