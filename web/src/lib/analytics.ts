/** Allowlisted anonymous funnel events — never include document contents. */
export const ANALYTICS_EVENTS = [
  "cta_click",
  "form_open",
  "submit_success",
  "checkout_start",
  "checkout_redirect",
  "payment_success_view",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

/**
 * Client-side privacy-first tracker.
 * - Posts only allowlisted event names + optional market to our own API
 * - Optionally forwards to Plausible (cookieless) when configured
 * Never send filenames, emails, or document payloads.
 */
export function trackEvent(
  name: AnalyticsEventName,
  props?: { market?: "no" | "pl" },
): void {
  if (typeof window === "undefined") return;

  const payload = {
    name,
    market: props?.market,
    path: window.location.pathname,
  };

  try {
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }

  const plausible = (
    window as Window & {
      plausible?: (event: string, options?: { props?: Record<string, string> }) => void;
    }
  ).plausible;

  if (typeof plausible === "function") {
    try {
      plausible(name, {
        props: {
          ...(props?.market ? { market: props.market } : {}),
        },
      });
    } catch {
      /* ignore */
    }
  }
}
